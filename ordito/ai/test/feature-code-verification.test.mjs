import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { runProcess } from '../process.ts';
import { renderFeatureCodeTests, validateFeatureCode, verifyFeatureCode } from '../featureCodeVerification.ts';

const files = [
	{
		file: 'src/features/checkout.mjs', exports: ['run'], contents: `
			const maximum = 10;
			export function run({ items }) {
				if (items.length > maximum) { return { status: 'declined', cents: 0 }; }
				let cents = 0;
				for (const item of items) { cents += item.cents; }
				return { status: 'confirmed', cents };
			}`,
	},
	{
		file: 'src/features/refunds.mjs', exports: ['run'], imports: { './checkout.mjs': ['run'] }, contents: `
			import { run as checkout } from './checkout.mjs';
			export function run(input) {
				const { cents } = checkout(input);
				return { cents: Math.max(cents - input.feeCents, 0) };
			}`,
	},
];

const cases = [
	{ id: 'checkout total', file: files[0].file, exportName: 'run', args: [{ items: [{ cents: 200 }, { cents: 110 }] }], expected: { status: 'confirmed', cents: 310 } },
	{ id: 'checkout limit', file: files[0].file, exportName: 'run', args: [{ items: Array.from({ length: 11 }, () => ({ cents: 200 })) }], expected: { status: 'declined', cents: 0 } },
	{ id: 'refund uses checkout', file: files[1].file, exportName: 'run', args: [{ items: [{ cents: 200 }], feeCents: 50 }], expected: { cents: 150 } },
];

test('permissioned Node verifies independent cases through the approved feature dependency', async () => {
	assert.deepEqual(await verifyFeatureCode(files, cases), {
		passed: true,
		cases: cases.map(entry => ({ id: entry.id, passed: true })),
	});
	const entered = cases.map(entry => entry.id === 'refund uses checkout' ? { ...entry, expected: { cents: 149 } } : entry);
	assert.deepEqual(await verifyFeatureCode(files, entered), {
		passed: false,
		cases: [
			{ id: 'checkout total', passed: true },
			{ id: 'checkout limit', passed: true },
			{ id: 'refund uses checkout', passed: false, problem: 'featureCodeUnexpectedResult' },
		],
	});
});

test('candidate profile rejects unknown globals, reflection, mutation, and undeclared imports', () => {
	for (const [contents, reason] of [
		['export function run() { return process.pid; }', /UnapprovedBinding:process/],
		['export function run() { return globalThis; }', /UnapprovedBinding:globalThis/],
		['export function run() { return arguments.length; }', /UnapprovedBinding:arguments/],
		['export function run() { return fetch("/orders"); }', /UnapprovedBinding:fetch/],
		['export function run(input) { return input.constructor; }', /UnsupportedPropertyAccess/],
		['export function run() { const { getPrototypeOf } = Object; return getPrototypeOf({}); }', /UnapprovedBinding:Object/],
		['export function run(input) { input.quantity = 1; return 1; }', /AssignmentNeedsLocalBinding/],
		['export function run() { run = () => 2; return 1; }', /AssignmentNeedsLocalBinding/],
		['export async function run() { return 1; }', /UnsupportedSyntax/],
		['import { join } from "node:path"; export function run() { return join("a", "b"); }', /ImportOutsideScope/],
		['export function run() { return import("./dependency.mjs"); }', /UnsupportedSyntax/],
		['export function run() { return { toJSON: () => 5 }; }', /UnsupportedPropertyName/],
		['export function different() { return 1; }', /ExportContract/],
	]) {
		assert.throws(() => validateFeatureCode(contents, ['run']), reason);
	}
});

test('verification requires a proposed candidate for every dependency and independent test data for every export', async () => {
	await assert.rejects(verifyFeatureCode([files[1]], [cases[2]]), /ImportOutsideCandidate/);
	await assert.rejects(verifyFeatureCode([...files].reverse(), cases), /ImportOutsideCandidate/);
	await assert.rejects(verifyFeatureCode(files, [cases[0]]), /InvalidCandidateManifest/);
	await assert.rejects(verifyFeatureCode([files[0]], [{ ...cases[0], expected: undefined }]), /InvalidCriteria/);
});

test('a nonterminating or non-JSON candidate cannot pass and leaves details out of the receipt', async () => {
	const [file] = files, [criterion] = cases;
	const evaluate = contents => verifyFeatureCode([{ ...file, contents }], [criterion]);
	const results = await Promise.all([
		evaluate('export function run() { for (;;) {} }'),
		evaluate('export function run() { return { arbitrary: () => 1 }; }'),
		evaluate('export function run() { throw new Error("untrusted output"); }'),
	]);
	assert.deepEqual(results.map(entry => [entry.passed, entry.cases[0]?.problem]), [
		[false, 'featureCodeCaseTimeout'], [false, 'featureCodeInvalidResult'], [false, 'featureCodeCandidateFailed'],
	]);
});

test('the generated user test artifact runs the same data criteria after publication', async t => {
	const directory = await mkdtemp(join(tmpdir(), 'ordito-generated-feature-test-'));
	t.after(() => rm(directory, { recursive: true, force: true }));
	for (const file of files) {
		await mkdir(join(directory, dirname(file.file)), { recursive: true });
		await writeFile(join(directory, file.file), file.contents);
	}
	await mkdir(join(directory, 'test'));
	await writeFile(join(directory, 'test/feature.test.mjs'), renderFeatureCodeTests(cases));
	const result = await runProcess(process.execPath, ['--test', 'test/feature.test.mjs'], directory, { env: {}, timeoutMs: 10000 });
	assert.equal(result.code, 0, result.stdout + result.stderr);
});
