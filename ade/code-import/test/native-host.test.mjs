/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { engine as productionEngine, createCodeEngine } from '../nativeHost.ts';
import { importCode } from '../importCode.ts';
import { createTypeScriptBundle } from '../typescriptSemantic.ts';
import { applyScipBundles } from '../scip.ts';
import { defaultScope } from '../sourceScope.ts';
// Existing code-evidence scenarios now include an explicit structured AI proposal.
// The provider is simulated; tests still traverse the production validation/publication boundary.
const engine = createCodeEngine({ async complete(_config, prompt) {
	const context = JSON.parse(prompt.slice(prompt.indexOf('\n') + 1));
	return { value: { summary: 'Reconcile observed code changes', questions: [], sourceEdits: [], bindings: [], modelEdits: [
		...context.changes.elements.map(item => ({ collection: 'elements', id: item.id, value: item.code ? { ...item.model, ...item.code } : null })),
		...context.changes.relations.map(item => ({ collection: 'relations', id: item.id, value: item.code ? { ...item.model, ...item.code } : null }))
	] }, usage: { inputTokens: 100, outputTokens: 50 }, cost: null };
} });
const config = { version: 1, provider: 'codex', connection: 'cli', model: 'test-model', executable: 'codex', maxCalls: 1, timeoutMs: 10000, maxContextBytes: 262144 };
const call = async request => {
	const result = JSON.parse(await engine.execute(JSON.stringify(request)));
	if (request.operation !== 'preview') { return result; }
	const prepared = JSON.parse(await engine.execute(JSON.stringify({ operation: 'reconciliationPrepare', token: result.token, config: JSON.stringify(config), sourceFiles: [] })));
	return JSON.parse(await engine.execute(JSON.stringify({ operation: 'reconciliationPropose', token: result.token, reviewId: prepared.reviewId })));
};
async function workspace(t, files) {
	const root = await mkdtemp(join(tmpdir(), 'ade-native-code-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	for (const [file, text] of Object.entries(files)) { await mkdir(join(root, file, '..'), { recursive: true }); await writeFile(join(root, file), text); }
	return root;
}
test('native boundary imports, previews contract/rename/delete, preserves annotation, publishes and recovers', async t => {
	const root = await workspace(t, { 'gateway.ts': 'export function charge(amount: number): boolean { return amount > 0; }', 'checkout.ts': 'import {charge as pay} from "./gateway"; export function checkout(value: number): boolean { return pay(value); }', 'unused.ts': 'export function unused() {}', 'steady.py': 'def steady():\n    return 1\n' });
	const initial = await call({ operation: 'import', root });
	assert.ok(initial.dependencies.length >= 1);
	const old = initial.declarations.find(item => item.name === 'checkout');
	const model = JSON.parse(await readFile(initial.model, 'utf8'));
	model.semantics.elements.find(item => item.id === old.id).description = 'Manual note';
	await writeFile(initial.model, JSON.stringify(model));
	await writeFile(join(root, 'checkout.ts'), 'import {charge as pay} from "./gateway"; export function purchase(value: number, tag: string): boolean { return pay(value); }');
	await rm(join(root, 'unused.ts'));
	let preview = await call({ operation: 'preview', snapshot: initial.snapshot });
	const renamed = preview.context.declarations.find(item => item.name === 'purchase');
	preview = await call({ operation: 'preview', snapshot: initial.snapshot, renames: [{ fromId: old.id, toSourceId: renamed.sourceId }] });
	assert.deepEqual(preview.conflicts, []);
	assert.deepEqual(preview.parsed, ['checkout.ts']);
	assert.ok(preview.reused.includes('gateway.ts') && preview.reused.includes('steady.py'));
	assert.ok(preview.context.declarations.some(item => item.id === old.id && item.name === 'purchase'));
	assert.ok(preview.files.removed.includes('unused.ts'));
	const updated = await call({ operation: 'apply', token: preview.token });
	assert.notEqual(updated.snapshot, initial.snapshot);
	const current = JSON.parse(await readFile(updated.model, 'utf8'));
	assert.equal(current.semantics.elements.find(item => item.id === old.id).description, 'Manual note');
	const mapping = updated.declarations.find(item => item.id === old.id).evidence;
	const source = await call({ operation: 'source', snapshot: updated.snapshot, file: mapping.file, revision: mapping.revision, start: mapping.start, end: mapping.end });
	assert.equal(source.stale, false);
	assert.ok(source.startColumn > 1);
	await writeFile(join(root, 'checkout.ts'), '\n' + await readFile(join(root, 'checkout.ts'), 'utf8'));
	assert.equal((await call({ operation: 'source', snapshot: updated.snapshot, file: mapping.file, revision: mapping.revision, start: mapping.start, end: mapping.end })).stale, true);
	assert.equal((await call({ operation: 'history', snapshot: updated.snapshot })).snapshots.length, 2);
	await call({ operation: 'restore', snapshot: updated.snapshot, target: initial.snapshot });
	assert.equal(JSON.parse(await readFile(join(root, '.ade/code-project.json'), 'utf8')).active, initial.snapshot.split('/').pop());
	assert.ok((await readFile(join(root, 'checkout.ts'), 'utf8')).startsWith('\n'));
});
test('built-in compiler resolves aliases and reuses unaffected references, including shifted target positions', async t => {
	const root = await workspace(t, { 'a.ts': 'export function target(): number { return 1; }', 'b.ts': 'import {target as alias} from "./a"; export function caller(): number { return alias(); }', 'c.ts': 'export function isolated(): string { return "ok"; }' });
	let state = await importCode(root, 'compiler');
	let result = await createTypeScriptBundle(state);
	assert.deepEqual(result.diagnostics, []);
	state = await applyScipBundles(state, [result.bundle]);
	assert.equal(state.semantic.dependencies.filter(edge => state.files.flatMap(file => file.declarations).find(item => item.id === edge.from)?.name === 'caller').length, 1);
	result = await createTypeScriptBundle(state);
	assert.deepEqual(result.analyzed, []); assert.equal(result.reused.length, 3);
	await writeFile(join(root, 'a.ts'), '\n\nexport function target(): number { return 2; }');
	let next = await importCode(root, 'compiler', { previous: state });
	result = await createTypeScriptBundle(next);
	assert.ok(result.reused.includes('c.ts'));
	next = await applyScipBundles(next, [result.bundle]);
	assert.ok(next.semantic.dependencies.some(edge => edge.references.some(ref => ref.target.file === 'a.ts' && ref.target.line === 3)));
	await writeFile(join(root, 'a.ts'), 'export function target(): string { return "changed"; }');
	next = await importCode(root, 'compiler', { previous: next });
	result = await createTypeScriptBundle(next);
	assert.ok(result.analyzed.includes('b.ts'));
	assert.ok(result.diagnostics.some(item => item.file === 'b.ts' && item.severity === 'error'));
	assert.ok((await createTypeScriptBundle(next)).diagnostics.some(item => item.file === 'b.ts'));
});
test('scope uses nested Git ignore rules, explicit globs, dialect overrides and ignores managed metadata', async t => {
	const root = await workspace(t, { '.gitignore': 'ignored/\n*.tmp\n', '.adeignore': 'manual.ts\n', 'src/.gitignore': 'skip.ts\n!keep.ts\n', 'src/keep.ts': 'export function keep() {}', 'src/skip.ts': 'export function skip() {}', 'ignored/hidden.ts': 'export function hidden() {}', 'manual.ts': 'export function manual() {}', 'lib/header.h': 'class Header {};', 'src/no.py': 'def nope(): pass\n' });
	const scope = { ...structuredClone(defaultScope), include: ['src/**/*.ts', 'lib/**'], languageOverrides: { '.h': 'cpp' } };
	const state = await importCode(root, 'scope', { scope });
	assert.deepEqual(state.analysis.parsed, ['lib/header.h', 'src/keep.ts']);
	assert.equal(state.files.find(file => file.file === 'lib/header.h').language, 'cpp');
	await mkdir(join(root, '.ade')); await writeFile(join(root, '.ade/noise'), 'ignored');
	const next = await importCode(root, 'scope', { previous: state });
	assert.equal(next.revision, state.revision);
	assert.deepEqual(next.analysis.parsed, []);
});
test('native publication rejects stale source, bad requests and redirected owned directories', async t => {
	const root = await workspace(t, { 'a.py': 'def a(): pass\n' });
	const initial = await call({ operation: 'import', root });
	const preview = await call({ operation: 'preview', snapshot: initial.snapshot });
	await writeFile(join(root, 'a.py'), 'def a(x): pass\n');
	await assert.rejects(call({ operation: 'apply', token: preview.token }), /Source changed/);
	await assert.rejects(call({ operation: 'source', snapshot: initial.snapshot, file: '../secret', revision: 'x', start: 0, end: 1 }), /Invalid/);
	await assert.rejects(productionEngine.execute('{"operation":"shell","command":"echo"}'), /Invalid/);
	const second = await workspace(t, { 'a.py': 'def a(): pass\n' });
	await symlink(join(root, '.ade'), join(second, '.ade'));
	await assert.rejects(call({ operation: 'import', root: second }), /symlink/);
});

test('native compiler can import statements without definitions and Sync a complete deletion', async t => {
	const root = await workspace(t, { 'a.ts': 'console.log("no declaration");' });
	const initial = await call({ operation: 'import', root });
	assert.equal(initial.declarations.length, 0);
	assert.equal(initial.dependencies.length, 0);
	await writeFile(join(root, 'a.ts'), 'export function added() { return 1; }');
	let preview = await call({ operation: 'preview', snapshot: initial.snapshot });
	let current = await call({ operation: 'apply', token: preview.token });
	assert.equal(current.declarations.length, 1);
	await rm(join(root, 'a.ts'));
	preview = await call({ operation: 'preview', snapshot: current.snapshot });
	assert.deepEqual(preview.conflicts, []);
	current = await call({ operation: 'apply', token: preview.token });
	assert.equal(current.declarations.length, 0);
	assert.equal(current.dependencies.length, 0);
});
test('syntax-only mode persists and concurrent imports cannot publish over each other', async t => {
	const root = await workspace(t, { 'a.ts': 'export function first() { return 1; }' });
	const results = await Promise.allSettled([call({ operation: 'import', root, syntaxOnly: true }), call({ operation: 'import', root, syntaxOnly: true })]);
	assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
	const initial = results.find(result => result.status === 'fulfilled').value;
	assert.deepEqual(initial.providers, []);
	await writeFile(join(root, 'a.ts'), 'export function first() { return 2; }');
	const preview = await call({ operation: 'preview', snapshot: initial.snapshot });
	assert.deepEqual(preview.context.providers, []);
	const current = await call({ operation: 'apply', token: preview.token });
	await assert.rejects(call({ operation: 'preview', snapshot: initial.snapshot }), /active snapshot/);
	await call({ operation: 'restore', snapshot: current.snapshot, target: initial.snapshot });
});
