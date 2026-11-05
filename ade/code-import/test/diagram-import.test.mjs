/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCodeEngine } from '../nativeHost.ts';
import { readSnapshot } from '../snapshot.ts';
import { samples } from './samples.mjs';

const config = { version: 1, provider: 'codex', connection: 'cli', model: 'economical-test-model', executable: 'codex', timeoutMs: 10000, maxContextBytes: 262144, maxCalls: 1 };
const feature = { key: 'checkout', name: 'Checkout', description: 'Coordinate purchase processing.' };
function interpretation(context) {
	const overview = context.step === 'overview';
	return {
		summary: 'Purchasing responsibilities and flows', questions: [], features: [feature],
		elements: context.required.filter(item => item.indexed).map(item => ({ symbol: item.ref, kind: 'action', name: 'Process ' + item.ref, description: 'Responsibility inferred from source', feature: feature.key, parent: null })),
		concepts: context.required.filter(item => !item.indexed).map(item => ({ key: 'purchase-' + item.ref, kind: 'resource', name: 'Purchase Record', description: 'Domain concept extracted from source', feature: feature.key, parent: null, source: item.ref })),
		relations: [], diagrams: [{ key: overview ? 'overview' : 'processing-' + context.batch, name: overview ? 'System Overview' : 'Purchase Processing ' + context.batch, kind: 'activity', feature: overview ? null : feature.key, nodes: overview ? ['f:checkout'] : context.required.map(item => item.indexed ? item.ref : 'c:purchase-' + item.ref), relations: [], intent: 'Inferred responsibilities; not observed runtime behavior' }]
	};
}
async function fixture(t, file = 'purchase.py', source = 'def purchase(amount):\n    return amount > 0\n') {
	const root = await mkdtemp(join(tmpdir(), 'ade-diagrams-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	await writeFile(join(root, file), source);
	let reply = interpretation;
	const prompts = [];
	const provider = { async complete(selected, prompt, schema) {
		assert.equal(selected.model, config.model); assert.ok(schema.properties.diagrams);
		const context = JSON.parse(prompt.slice(prompt.indexOf('\n') + 1)); prompts.push(context);
		return { value: await reply(context), usage: { inputTokens: 200, outputTokens: 100 }, cost: null };
	} };
	let engine = createCodeEngine(provider);
	const call = async request => JSON.parse(await engine.execute(JSON.stringify(request)));
	const initial = await call({ operation: 'import', root, syntaxOnly: true });
	const prepare = (snapshot = initial.snapshot, extra = {}) => call({ operation: 'diagramPrepare', snapshot, config: JSON.stringify(config), ...extra });
	const step = job => call({ operation: 'diagramStep', snapshot: initial.snapshot, id: job.id, reviewId: job.reviewId });
	const finish = async job => { while (job.status !== 'complete') { job = await step(job); } return job; };
	return { root, initial, prepare, step, finish, call, prompts, source, file, setReply: fn => { reply = fn; }, restart: () => { engine = createCodeEngine(provider); } };
}

test('every indexed symbol is transformed in batches, with overview and recoverable publication', async t => {
	const source = Array.from({ length: 43 }, (_, i) => `def purchase_${i}(amount):\n    return amount > ${i}\n`).join('\n');
	const f = await fixture(t, 'purchase.py', source);
	const job = await f.prepare();
	assert.equal(job.symbols, 43); assert.equal(job.total, 4); assert.equal(f.prompts.length, 0);
	const done = await f.finish(job);
	assert.equal(done.status, 'complete'); assert.equal(f.prompts.length, 4); assert.equal(done.context.diagramState, 'diagrams');
	const current = await readSnapshot(done.context.snapshot), before = await readSnapshot(f.initial.snapshot);
	assert.equal(current.model.views[0].name, 'System Overview');
	assert.equal(current.model.views.length, 4);
	for (const declaration of before.state.files.flatMap(file => file.declarations)) {
		assert.ok(current.model.views.some(view => view.nodes.some(node => node.elementId === declaration.id)));
		assert.equal(current.model.semantics.elements.find(element => element.id === declaration.id).kind, 'action');
	}
	assert.equal(await readFile(join(f.root, f.file), 'utf8'), source);
	assert.deepEqual((await readSnapshot(f.initial.snapshot)).model, before.model);
});

test('semantic import handles all deterministic language profiles and extracts an unindexed language', async t => {
	for (const [language, file, source] of [...samples, ['sql', 'purchase.sql', 'CREATE TABLE purchase (id INT PRIMARY KEY, amount DECIMAL);']]) {
		await t.test(language, async t => {
			const f = await fixture(t, file, source), done = await f.finish(await f.prepare());
			const current = await readSnapshot(done.context.snapshot);
			assert.ok(current.model.semantics.elements.some(item => item.kind === 'feature'));
			assert.ok(current.model.views.length >= 2);
			if (language === 'sql') { assert.ok(current.model.codeMappings.some(item => item.symbol.startsWith('ai:concept:'))); assert.equal(f.prompts[0].symbols[0].content, source); }
			assert.equal(await readFile(join(f.root, file), 'utf8'), source);
		});
	}
});

test('resume after provider failure reuses completed batches across process restarts', async t => {
	const f = await fixture(t, 'purchase.py', Array.from({ length: 25 }, (_, i) => `def buy_${i}():\n    return ${i}\n`).join('\n'));
	let job = await f.step(await f.prepare()); assert.equal(job.completed, 1);
	f.setReply(() => { throw new Error('Provider unavailable'); });
	await assert.rejects(f.step(job), /Provider unavailable/);
	f.restart(); f.setReply(interpretation);
	job = await f.prepare(f.initial.snapshot, { resume: job.id });
	assert.equal(job.completed, 1); assert.equal(job.calls, 2);
	const done = await f.finish(job); assert.equal(done.calls, 4);
	assert.deepEqual(f.prompts.map(item => item.batch), [0, 1, 1, 2]);
});

test('missing symbol coverage and invalid references never replace the active model', async t => {
	const f = await fixture(t);
	for (const invalid of ['coverage', 'reference', 'file-list']) {
		f.setReply(context => { const value = interpretation(context); if (invalid === 'coverage') { value.elements = []; } else if (invalid === 'reference') { value.diagrams[0].nodes = ['u999']; } else { value.diagrams[0].name = f.file; } return value; });
		const job = await f.prepare(); await assert.rejects(f.step(job), /skipped|Unknown|file listing/);
		assert.equal((await f.call({ operation: 'inspect', snapshot: f.initial.snapshot })).diagramState, 'index');
	}
});

test('zero budget, source changes and concurrent model edits block publication', async t => {
	const f = await fixture(t);
	const zero = await f.prepare(f.initial.snapshot, { config: JSON.stringify({ ...config, maxCalls: 0 }) });
	await assert.rejects(f.step(zero), /not enabled/); assert.equal(f.prompts.length, 0);
	const stale = await f.prepare(); await writeFile(join(f.root, f.file), f.source + '\n# changed\n');
	await assert.rejects(f.step(stale), /changed/); assert.equal(f.prompts.length, 0);
	await writeFile(join(f.root, f.file), f.source);
	const job = await f.step(await f.prepare());
	f.setReply(async context => { const value = interpretation(context); const model = JSON.parse(await readFile(f.initial.model, 'utf8')); model.name = 'Concurrent Edit'; await writeFile(f.initial.model, JSON.stringify(model)); return value; });
	await assert.rejects(f.step(job), /changed/);
	assert.equal((await readSnapshot(f.initial.snapshot)).model.name, 'Concurrent Edit');
});

test('rebuilding retains manually edited semantic names and diagram positions', async t => {
	const f = await fixture(t), done = await f.finish(await f.prepare());
	const model = JSON.parse(await readFile(done.context.model, 'utf8'));
	const element = model.semantics.elements.find(item => item.kind === 'action'); element.name = 'My Purchase'; element.description = 'My Intent';
	const view = model.views.find(item => item.featureId); view.nodes[0].x = 777; view.name = 'My Diagram';
	await writeFile(done.context.model, JSON.stringify(model));
	f.setReply(context => { assert.ok(context.features.some(item => item.key === 'checkout')); assert.ok(context.priorComposition.diagrams.some(item => item.key === 'overview')); const result = interpretation(context); result.features = []; return result; });
	let job = await f.prepare(done.context.snapshot);
	while (job.status !== 'complete') { job = await f.call({ operation: 'diagramStep', snapshot: done.context.snapshot, id: job.id, reviewId: job.reviewId }); }
	const current = await readSnapshot(job.context.snapshot);
	assert.equal(current.model.semantics.elements.find(item => item.id === element.id).name, 'My Purchase');
	assert.equal(current.model.views.find(item => item.id === view.id).nodes[0].x, 777);
	assert.equal(current.model.views.find(item => item.id === view.id).name, 'My Diagram');
	f.restart();
	const snapshot = job.context.snapshot; job = await f.prepare(snapshot);
	while (job.status !== 'complete') { job = await f.call({ operation: 'diagramStep', snapshot, id: job.id, reviewId: job.reviewId }); }
	assert.equal((await readSnapshot(job.context.snapshot)).model.views.find(item => item.id === view.id).nodes[0].x, 777);
});

test('deterministic interactions must be visible in a diagram, not just classified symbols', async t => {
	const f = await fixture(t, 'purchase.ts', 'export function charge(amount: number) { return amount > 0; }\nexport function purchase(amount: number) { return charge(amount); }');
	// The same boundary normally selects compiler evidence unless structure-only was chosen.
	const { createTypeScriptBundle } = await import('../typescriptSemantic.ts');
	const { applyScipBundles } = await import('../scip.ts');
	const { advanceDiagramImport, prepareDiagramImport, diagramProgress } = await import('../../ai/diagramImport.ts');
	const { importCode } = await import('../importCode.ts');
	const before = await readSnapshot(f.initial.snapshot);
	let state = await importCode(f.root, before.state.projectId, { previous: before.state });
	const compiled = await createTypeScriptBundle(state); state = await applyScipBundles(state, [compiled.bundle], undefined, true);
	assert.ok(state.semantic.dependencies.length);
	const job = await prepareDiagramImport(before, state, config);
	await assert.rejects(advanceDiagramImport(job, before, state, diagramProgress(job).reviewId, undefined, { async complete(_config, prompt) { return { value: interpretation(JSON.parse(prompt.slice(prompt.indexOf('\n') + 1))), usage: { inputTokens: 100, outputTokens: 100 }, cost: null }; } }), /omitted an evidenced interaction/);
});


test('incomplete parser coverage is disclosed and supplemented by AI text extraction', async t => {
	const f = await fixture(t, 'purchase.py', 'def purchase(amount):\n    return amount > 0\n\ndef incomplete(\n');
	assert.equal((await readSnapshot(f.initial.snapshot)).state.files[0].status, 'partial');
	const done = await f.finish(await f.prepare());
	assert.ok(f.prompts[0].required.some(item => !item.indexed));
	assert.deepEqual(f.prompts[0].coverage.partialFiles, ['purchase.py']);
	assert.ok((await readSnapshot(done.context.snapshot)).model.views.length > 0);
});


test('renaming a manually annotated source symbol asks for identity resolution before spending another call', async t => {
	const f = await fixture(t), done = await f.finish(await f.prepare());
	const model = JSON.parse(await readFile(done.context.model, 'utf8'));
	model.semantics.elements.find(item => item.kind === 'action').description = 'Keep my design intent';
	await writeFile(done.context.model, JSON.stringify(model));
	await writeFile(join(f.root, f.file), f.source.replace('purchase(', 'renamed_purchase('));
	const calls = f.prompts.length;
	await assert.rejects(f.prepare(done.context.snapshot), /confirm its identity/);
	assert.equal(f.prompts.length, calls);
});
