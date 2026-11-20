import '../../scripts/source-loader.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
const { createCodeEngine } = await import('../../runtime/nativeHost.ts');
import { architectureFiles, notationAnalysis, notationView } from './notation-fixture.mjs';
const { validateSemanticModel } = await import('../../../src/vs/workbench/contrib/ordito/common/modelValidation.ts');
const { viewKinds } = await import('../../../src/vs/workbench/contrib/ordito/common/modelTypes.ts');

const config = { version: 1, provider: 'codex', connection: 'cli', model: 'notation-fixture', executable: 'codex', maxCalls: 1, timeoutMs: 10000, maxContextBytes: 262144 };
async function fixture(t, transform = value => value, viewTransform = (_context, value) => value) {
	const root = await mkdtemp(join(tmpdir(), 'ordito-notations-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	for (const [file, text] of Object.entries(architectureFiles)) { await mkdir(dirname(join(root, file)), { recursive: true }); await writeFile(join(root, file), text); }
	const requests = [];
	const engine = createCodeEngine({ async complete(_config, prompt, schema) {
		const context = JSON.parse(prompt.slice(prompt.indexOf('\n') + 1)); requests.push(context);
		assert.ok(Buffer.byteLength(prompt) + Buffer.byteLength(JSON.stringify(schema)) <= config.maxContextBytes * .75);
		return { value: context.step === 'diagram' ? viewTransform(context, notationView(context)) : transform(notationAnalysis(context)), usage: { inputTokens: 100, outputTokens: 50 }, cost: null };
	} });
	const call = async request => JSON.parse(await engine.execute(JSON.stringify(request)));
	const initial = await call({ operation: 'import', root });
	let progress = await call({ operation: 'diagramPrepare', snapshot: initial.snapshot, config: JSON.stringify(config) });
	const step = () => call({ operation: progress.status === 'plan' ? 'diagramApprovePlan' : 'diagramStep', snapshot: initial.snapshot, id: progress.id, reviewId: progress.reviewId }).then(value => progress = value);
	return { root, initial, call, requests, step, get progress() { return progress; } };
}
test('all requested notations pass through analysis, explicit plan review, individual steps and atomic publication', async t => {
	const f = await fixture(t);
	await f.step();
	assert.equal(f.progress.status, 'plan');
	assert.equal(f.requests.length, 1);
	assert.deepEqual(new Set(f.progress.plan.map(item => item.kind)), new Set(viewKinds));
	assert.equal((await f.call({ operation: 'inspect', snapshot: f.initial.snapshot })).diagramState, 'index');
	await f.step();
	while (f.progress.status !== 'complete') { await f.step(); }
	const model = JSON.parse(await readFile(f.progress.context.model, 'utf8'));
	assert.deepEqual(validateSemanticModel(model), []);
	assert.deepEqual(new Set(model.views.map(view => view.kind)), new Set(viewKinds));
	assert.equal(f.requests.length, 16, 'one shared analysis, fifteen paid view steps, local overview');
	assert.equal(model.semantics.elements.find(item => item.kind === 'table' && item.name === 'tasks').details.members[1].key, 'foreign');
	assert.equal(model.semantics.relations.find(item => item.name === 'fk').details.targetMember, 'id');
	for (const [file, text] of Object.entries(architectureFiles)) { assert.equal(await readFile(join(f.root, file), 'utf8'), text); }
});
test('invalid typed focus is caught before approval and keeps the source index active', async t => {
	const f = await fixture(t, value => { value.plan.find(item => item.kind === 'databaseSchema').focus = ['c:person']; return value; });
	await assert.rejects(f.step(), /incompatible focus/);
	assert.equal((await f.call({ operation: 'inspect', snapshot: f.initial.snapshot })).diagramState, 'index');
});
test('unknown annotation refs and FK columns are rejected before presenting a plan', async t => {
	for (const mutate of [value => value.notation.elements[0].ref = 'c:missing', value => value.notation.relations[0].details.targetMember = 'missing']) {
		const f = await fixture(t, value => { mutate(value); return value; });
		await assert.rejects(f.step(), /Unknown.*element|missingReference/);
	}
});

const architectureRecords = JSON.parse(await readFile(new URL('./fixtures/real-diagrams/architecture-terra.json', import.meta.url), 'utf8'));
for (const record of architectureRecords.filter(record => !record.expectedRejection)) {
test(`recorded real architecture: ${record.case}`, async t => {
	const root = await mkdtemp(join(tmpdir(), 'ordito-real-architecture-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	for (const [file, text] of Object.entries(architectureFiles)) { await mkdir(dirname(join(root, file)), { recursive: true }); await writeFile(join(root, file), text); }
	let calls = 0;
	const engine = createCodeEngine({ async complete(_config, prompt) {
		const context = JSON.parse(prompt.slice(prompt.indexOf('\n') + 1));
		const recorded = record.calls[calls++];
		assert.deepEqual([context.step, context.diagram?.key ?? null], [recorded.step, recorded.diagramKey]);
		const value = { ...(context.notationRule ? { connections: [] } : {}), ...structuredClone(recorded.response) };
		// Tool-generated keys include persistent project identities; the replay runs in a different project namespace.
		if (context.step === 'diagram') { value.relations = value.relations.map(key => {
			if (!key.startsWith('view-')) { return key; }
			const old = recorded.graphRelations.find(relation => relation.key === key);
			assert.ok(old, 'recorded generated connection must have an explicit source identity');
			const candidates = context.graph.relations.filter(relation => relation.kind === old.kind && relation.from === old.from && relation.to === old.to && relation.name === old.name);
			assert.equal(candidates.length, 1, 'namespace rebasing must be unambiguous'); return candidates[0].key;
		}); }
		return { value, usage: { inputTokens: null, outputTokens: null }, cost: null };
	} });
	const call = async request => JSON.parse(await engine.execute(JSON.stringify(request)));
	const initial = await call({ operation: 'import', root });
	let progress = await call({ operation: 'diagramPrepare', snapshot: initial.snapshot, config: JSON.stringify(config) });
	while (progress.status !== 'complete') { progress = await call({ operation: progress.status === 'plan' ? 'diagramApprovePlan' : 'diagramStep', snapshot: initial.snapshot, id: progress.id, reviewId: progress.reviewId }); }
	const model = JSON.parse(await readFile(progress.context.model, 'utf8'));
	for (const kind of ['structure', 'c4Container', 'databaseSchema', 'class', 'deployment', 'dataFlow']) { assert.ok(model.views.some(view => view.kind === kind)); }
	assert.deepEqual(model.views.map(item => item.kind).sort(), progress.plan.map(item => item.kind).sort());
	for (const table of model.semantics.elements.filter(item => item.kind === 'table')) { assert.ok(table.details.members.every(member => member.required), 'all columns in this explicit fixture are mandatory'); }
	assert.equal(model.views.find(item => item.kind === 'c4Container').name, record.calls[0].response.plan.find(item => item.kind === 'c4Container').name, 'C4 keeps its AI-proposed identity beside the local structural overview');
	assert.deepEqual(validateSemanticModel(model), []);
	assert.equal(calls, record.calls.length);
	assert.ok(progress.plan.every(item => item.status === 'complete'), 'the UI reports every approved step ready');
	const checkpoint = JSON.parse(await readFile(join(root, '.ordito/diagram-imports', progress.id + '.json'), 'utf8'));
	assert.equal(checkpoint.generated.length, checkpoint.plan.length, 'the final persisted step is not lost during publication');
});
}

test('redundant namespace prefixes normalize only against an exact declared key', async t => {
	const f = await fixture(t, value => { for (const concept of value.concepts) { concept.key = 'c-' + concept.key; } return value; });
	await f.step();
	assert.equal(f.progress.status, 'plan');
	assert.ok(f.progress.plan.find(item => item.kind === 'class').focus.includes('c:c-task-class'));
});

test('typed steps can declare a missing source-grounded connection and update the shared overview atomically', async t => {
	const f = await fixture(t, value => { value.relations = value.relations.filter(item => item.key !== 'context'); return value; }, (context, value) => context.diagram.kind === 'c4Context' ? { ...value, relations: [], connections: [{ kind: 'communication', from: 'c:person', to: 'c:system', name: 'Uses the task system', evidence: [context.evidence.units[0][0]], details: null }] } : value);
	await f.step(); await f.step();
	while (f.progress.status !== 'complete') { await f.step(); }
	const model = JSON.parse(await readFile(f.progress.context.model, 'utf8'));
	const relation = model.semantics.relations.find(item => item.name === 'Uses the task system');
	assert.ok(relation);
	assert.ok(model.views.find(view => view.kind === 'c4Context').relationIds.includes(relation.id));
	assert.ok(model.views.find(view => view.kind === 'structure').relationIds.includes(relation.id));
});
test('typed step additions with invented source evidence cannot modify the published model', async t => {
	const f = await fixture(t, value => value, (context, value) => context.diagram.kind === 'c4Context' ? { ...value, connections: [{ kind: 'communication', from: 'c:person', to: 'c:system', name: 'Unsupported claim', evidence: ['u99999'], details: null }] } : value);
	await f.step(); await f.step(); await f.step();
	await assert.rejects(f.step(), /Invalid planned diagram output/);
	assert.equal((await f.call({ operation: 'inspect', snapshot: f.initial.snapshot })).diagramState, 'index');
});

test('recorded real nullable-column mistake is rejected before plan review or publication', async t => {
	const bad = architectureRecords.find(record => record.expectedRejection);
	const f = await fixture(t, () => structuredClone(bad.calls[0].response));
	await assert.rejects(f.step(), /NOT NULL/);
	assert.equal((await f.call({ operation: 'inspect', snapshot: f.initial.snapshot })).diagramState, 'index');
});

test('a schema step cannot claim completion with a data-store context and no physical table', async t => {
	const f = await fixture(t, value => value, (context, value) => context.diagram.kind === 'databaseSchema' ? { ...value, nodes: ['c:db'], relations: [], connections: [] } : value);
	await f.step(); await f.step();
	await f.step(); await f.step(); await f.step(); await f.step(); await f.step();
	await assert.rejects(f.step(), /needs a databaseSchema subject/);
	assert.equal((await f.call({ operation: 'inspect', snapshot: f.initial.snapshot })).diagramState, 'index');
});
