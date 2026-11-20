import '../../scripts/source-loader.mjs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { importCode } = await import('../../code-import/importCode.ts');
const { writeSnapshot } = await import('../../code-import/snapshot.ts');
const { runProcess } = await import('../process.ts');
const { prepareImplementation } = await import('../context.ts');

export const config = { version: 1, provider: 'codex', connection: 'cli', executable: 'codex', model: 'explicit-fixture-model', timeoutMs: 10000, maxContextBytes: 65536, maxCalls: 2 };
export const original = "export function checkout(approved) { return 'paid'; }\n";
export async function fixture(t, name = 'checkout', additional = {}) {
	const directory = await mkdtemp(join(tmpdir(), 'ade-m5-'));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const root = join(directory, 'source'); await mkdir(root);
	await writeFile(join(root, '.gitignore'), '.ade/\n');
	await writeFile(join(root, name + '.mjs'), original.replaceAll('checkout', name));
	for (const [file, content] of Object.entries(additional)) { await writeFile(join(root, file), content); }
	for (const args of [['init', '-q'], ['add', '.'], ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'Fixture']]) {
		const result = await runProcess('git', ['-c', 'core.hooksPath=', ...args], root);
		if (result.code) { throw new Error(result.stderr); }
	}
	const state = await importCode(root, 'fixture-' + name);
	const model = structuredClone(state.model);
	model.semantics.elements.push({ id: 'feature', kind: 'feature', name, behavior: { inputs: [], outputs: [], preconditions: [], postconditions: [], errors: [], permissions: [], acceptanceCriteria: [{ id: 'declined', given: 'Payment is refused', when: name + ' is called', then: 'The result is declined' }] } });
	model.semantics.relations.push({ id: 'implements', kind: 'realization', from: state.files.find(file => file.declarations.length).declarations[0].id, to: 'feature', name: 'Implements' });
	const snapshot = join(directory, 'snapshot');
	await writeSnapshot(snapshot, state, model);
	const request = { version: 1, snapshot, featureId: 'feature', intent: 'Handle declined payments', constraints: ['Keep approved payments working'], sourceFiles: [name + '.mjs'] };
	const prepared = await prepareImplementation(request, config);
	const plan = { summary: 'Handle declined payments', steps: [{ id: 'implement', description: 'Add refusal and regression tests', elementIds: ['feature'], sourceFiles: [name + '.mjs', name + '.test.mjs'] }], questions: [], changes: [
		{ file: name + '.mjs', kind: 'modify', reason: 'Handle refusal', elementIds: ['feature'] },
		{ file: name + '.test.mjs', kind: 'create', reason: 'Verify acceptance', elementIds: ['feature'] }
	], tests: [{ description: 'Declined payment', elementId: 'feature', criterionId: 'declined' }], limitations: [] };
	const generated = { summary: 'Payment refusal', files: [
		{ file: name + '.mjs', kind: 'modify', baseRevision: prepared.context.sources[0].revision, content: `export function ${name}(approved) { return approved ? 'paid' : 'declined'; }\n` },
		{ file: name + '.test.mjs', kind: 'create', baseRevision: null, content: `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { ${name} } from './${name}.mjs';\ntest('declined and approved payments', () => { assert.deepEqual([${name}(false), ${name}(true)], ['declined', 'paid']); });\n` }
	], tests: [{ file: name + '.test.mjs', elementId: 'feature', criterionId: 'declined' }] };
	const provider = { complete: async () => ({ value: generated, usage: { inputTokens: 100, outputTokens: 200 }, cost: null }) };
	return { directory, root, snapshot, request, prepared, plan, generated, provider };
}
