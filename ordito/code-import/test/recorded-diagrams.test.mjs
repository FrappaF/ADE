import '../../scripts/source-loader.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
const { createCodeEngine } = await import('../../runtime/nativeHost.ts');
const { readSnapshot } = await import('../snapshot.ts');
const { prepareDiagramImport, advanceDiagramImport, diagramProgress } = await import('../../ai/diagramImport.ts');

const records = JSON.parse(await readFile(new URL('./fixtures/real-diagrams/todo-terra.json', import.meta.url), 'utf8'));
for (const record of records) {
	test(`recorded real ${record.model} output: ${record.case}`, async t => {
		const root = await mkdtemp(join(tmpdir(), 'ordito-real-output-'));
		t.after(() => rm(root, { recursive: true, force: true }));
		for (const [file, source] of Object.entries(record.files)) { await mkdir(dirname(join(root, file)), { recursive: true }); await writeFile(join(root, file), source); }
		let calls = 0;
		const provider = { async complete(_config, prompt) {
			calls++;
			const context = JSON.parse(prompt.slice(prompt.indexOf('\n') + 1));
			assert.deepEqual(context.units.map(row => [row[0], context.files[row[1]].path, ...row.slice(2)]), record.inventory);
			return { value: structuredClone(record.response), usage: { inputTokens: null, outputTokens: null }, cost: null };
		} };
		const engine = createCodeEngine(provider);
		const call = async request => JSON.parse(await engine.execute(JSON.stringify(request)));
		const initial = await call({ operation: 'import', root });
		const config = { version: 1, provider: 'codex', connection: 'cli', model: record.model, executable: 'codex', maxCalls: 1, timeoutMs: 180000, maxContextBytes: 262144 };
		const previous = await readSnapshot(initial.snapshot);
		// Historical v4 recordings verify the preserved semantic boundary, without pretending to contain a new plan.
		const prepared = await prepareDiagramImport(previous, previous.state, config, undefined, '', undefined, false);
		const done = await advanceDiagramImport(prepared, previous, previous.state, diagramProgress(prepared).reviewId, undefined, provider);
		assert.equal(calls, 1);
		const model = done.model;
		assert.ok(model);
		const domain = model.semantics.elements.filter(item => item.kind !== 'feature');
		assert.ok(domain.length >= 3 && domain.length <= 24);
		assert.ok(domain.some(item => item.kind === 'action') && domain.some(item => item.kind === 'resource'));
		const behavior = domain.filter(item => item.kind === 'action' || item.kind === 'controller').map(item => item.name + ' ' + item.description).join(' ');
		for (const operation of [/create|add/i, /complete|finish|done/i, /delete|remove|destroy/i, /list|view|show|retrieve/i]) { assert.match(behavior, operation); }
		assert.ok(model.views.every(view => view.nodes.length >= 2 && view.relationIds.length > 0));
		for (const [file, source] of Object.entries(record.files)) { assert.equal(await readFile(join(root, file), 'utf8'), source); }
	});
}

const plannedRecords = JSON.parse(await readFile(new URL('./fixtures/real-diagrams/planned-terra.json', import.meta.url), 'utf8'));
for (const record of plannedRecords) {
	test(`recorded real plan and typed diagrams: ${record.case}`, async t => {
		const root = await mkdtemp(join(tmpdir(), 'ordito-real-plan-'));
		t.after(() => rm(root, { recursive: true, force: true }));
		for (const [file, source] of Object.entries(record.files)) { await mkdir(dirname(join(root, file)), { recursive: true }); await writeFile(join(root, file), source); }
		let calls = 0;
		const engine = createCodeEngine({ async complete(_config, prompt) {
			const context = JSON.parse(prompt.slice(prompt.indexOf('\n') + 1));
			const expected = record.calls[calls++];
			assert.deepEqual({ step: context.step, diagramKey: context.diagram?.key ?? null }, { step: expected.step, diagramKey: expected.diagramKey });
			return { value: { ...(context.step !== 'diagram' ? { notation: { elements: [], relations: [] } } : {}), ...structuredClone(expected.response) }, usage: { inputTokens: null, outputTokens: null }, cost: null };
		} });
		const call = async request => JSON.parse(await engine.execute(JSON.stringify(request)));
		const initial = await call({ operation: 'import', root });
		const config = { version: 1, provider: 'codex', connection: 'cli', model: record.model, executable: 'codex', maxCalls: 1, timeoutMs: 180000, maxContextBytes: 262144 };
		let progress = await call({ operation: 'diagramPrepare', snapshot: initial.snapshot, config: JSON.stringify(config) });
		while (progress.status !== 'complete') { progress = await call({ operation: progress.status === 'plan' ? 'diagramApprovePlan' : 'diagramStep', snapshot: initial.snapshot, id: progress.id, reviewId: progress.reviewId }); }
		assert.equal(calls, record.calls.length);
		const { model } = await readSnapshot(progress.context.snapshot);
		assert.deepEqual(model.views.map(view => view.kind).sort(), progress.plan.map(item => item.kind).sort());
		assert.ok(model.views.some(view => view.kind === 'sequence') && model.views.some(view => view.kind === 'state'));
		for (const [file, source] of Object.entries(record.files)) { assert.equal(await readFile(join(root, file), 'utf8'), source); }
	});
}
