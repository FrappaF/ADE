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
import { getSequenceDiagram } from '../../../src/vs/workbench/contrib/ade/common/sequenceDiagram.ts';
import { getStateDiagram } from '../../../src/vs/workbench/contrib/ade/common/stateDiagram.ts';

const config = { version: 1, provider: 'codex', connection: 'cli', model: 'planning-test', executable: 'codex', timeoutMs: 10000, maxContextBytes: 262144, maxCalls: 1 };
const source = 'def create_task(title):\n    return {"title": title, "completed": False}\n\ndef complete_task(task):\n    task["completed"] = True\n';
async function fixture(t) {
	const root = await mkdtemp(join(tmpdir(), 'ade-plan-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	await writeFile(join(root, 'tasks.py'), source);
	const requests = [];
	let fail, change;
	const provider = { async complete(_config, prompt, schema) {
		const context = JSON.parse(prompt.slice(prompt.indexOf('\n') + 1)); requests.push(context);
		assert.ok(Buffer.byteLength(prompt) + Buffer.byteLength(JSON.stringify(schema)) <= config.maxContextBytes * 0.75);
		if (context.step === 'diagram') {
			if (fail === context.diagram.key) { throw new Error('Provider unavailable for ' + fail); }
			const nodes = context.diagram.focus.filter(ref => context.graph.elements.some(item => item.ref === ref));
			const keys = { overview: context.graph.relations.map(item => item.key), workflow: ['choose', 'create', 'save'], scenario: ['choose', 'create', 'save'], lifecycle: ['finish'] }[context.diagram.key];
			return { value: { questions: [], nodes, relations: keys }, usage: { inputTokens: 100, outputTokens: 50 }, cost: null };
		}
		const anchor = context.units[0][0];
		const concept = (key, kind, name, parent = null) => ({ key, kind, name, parent, description: name, feature: 'tasks', source: anchor });
		const relation = (key, kind, from, to) => ({ key, kind, from: 'c:' + from, to: 'c:' + to, name: key, condition: null, evidence: [anchor], classification: 'inferred' });
		const value = {
			summary: 'Task management', questions: [], features: [{ key: 'tasks', name: 'Tasks', description: 'Manage tasks' }], elements: [],
			concepts: [concept('user', 'actor', 'User'), concept('list', 'view', 'Task List'), concept('create', 'action', 'Create Task'), concept('task', 'resource', 'Task'), concept('open', 'state', 'Open', 'c:task'), concept('done', 'state', 'Done', 'c:task')],
			// Intentionally different from scenario order, which must remain local to its view.
			relations: [relation('save', 'write', 'create', 'task'), relation('finish', 'transition', 'open', 'done'), relation('create', 'invocation', 'list', 'create'), relation('choose', 'invocation', 'user', 'list')],
			coverage: { targets: Object.fromEntries(context.units.map(row => [row[0], 'c:task'])) }, diagrams: [], overview: { key: 'overview', name: 'Task Overview', intent: 'Shared responsibilities' },
			plan: [
				{ key: 'overview', name: 'Task Overview', kind: 'structure', feature: null, intent: 'See the whole design', focus: ['c:user', 'c:list', 'c:create', 'c:task', 'c:open', 'c:done'] },
				{ key: 'workflow', name: 'Create a Task', kind: 'activity', feature: 'tasks', intent: 'Follow task creation', focus: ['c:user', 'c:list', 'c:create', 'c:task'] },
				{ key: 'scenario', name: 'Task Creation Interactions', kind: 'sequence', feature: 'tasks', intent: 'See interaction order', focus: ['c:user', 'c:list', 'c:create', 'c:task'] },
				{ key: 'lifecycle', name: 'Task Lifecycle', kind: 'state', feature: 'tasks', intent: 'Understand completion', focus: ['c:task', 'c:open', 'c:done'] }
			]
		};
		change?.(value);
		return { value, usage: { inputTokens: 500, outputTokens: 300 }, cost: null };
	} };
	let engine = createCodeEngine(provider);
	const call = async request => JSON.parse(await engine.execute(JSON.stringify(request)));
	const initial = await call({ operation: 'import', root, syntaxOnly: true });
	const prepare = extra => call({ operation: 'diagramPrepare', snapshot: initial.snapshot, config: JSON.stringify(config), ...extra });
	const step = progress => call({ operation: 'diagramStep', snapshot: initial.snapshot, id: progress.id, reviewId: progress.reviewId });
	const approve = progress => call({ operation: 'diagramApprovePlan', snapshot: initial.snapshot, id: progress.id, reviewId: progress.reviewId });
	return { root, initial, requests, prepare, step, approve, call, setFail: key => { fail = key; }, change: fn => { change = fn; }, restart: () => { engine = createCodeEngine(provider); } };
}

test('proposal requires a separate approval and every planned type is published with shared identities', async t => {
	const f = await fixture(t);
	const prepared = await f.prepare();
	assert.equal(f.requests.length, 0, 'preparation is local');
	let progress = await f.step(prepared);
	assert.deepEqual({ phase: progress.phase, status: progress.status, completed: progress.completed, total: progress.total, kinds: progress.plan.map(item => item.kind) }, { phase: 'plan', status: 'plan', completed: 1, total: 5, kinds: ['structure', 'activity', 'sequence', 'state'] });
	await assert.rejects(f.step(progress), /approve the proposed diagram plan/);
	await assert.rejects(f.approve({ ...progress, reviewId: prepared.reviewId }), /Review the current diagram plan/);
	assert.equal(f.requests.length, 1);
	assert.equal((await readSnapshot(f.initial.snapshot)).model.views.length, 1, 'only the initial private index exists');
	progress = await f.approve(progress);
	for (let index = 0; index < 4; index++) {
		progress = await f.step(progress);
		assert.equal(progress.plan.filter(item => item.status === 'complete').length, index + 1);
		assert.equal(!!progress.context, index === 3, 'publish only the complete set');
	}
	const { model } = await readSnapshot(progress.context.snapshot);
	assert.deepEqual(model.views.map(item => item.kind), ['structure', 'activity', 'sequence', 'state']);
	const sequence = getSequenceDiagram(model, model.views.find(item => item.kind === 'sequence'));
	assert.deepEqual(sequence.messages.map(item => item.name), ['choose', 'create', 'save']);
	assert.equal(sequence.unsupported.length, 0);
	const state = getStateDiagram(model, model.views.find(item => item.kind === 'state'));
	assert.deepEqual(state.groups.map(group => ({ name: group.resource.name, states: group.states.map(item => item.name), transitions: group.transitions.map(item => item.name) })), [{ name: 'Task', states: ['Open', 'Done'], transitions: ['finish'] }]);
	assert.equal(f.requests.length, 4);
	assert.ok(f.requests.slice(1).every(context => !context.units && !context.coverage && !context.catalog), 'views reuse the shared graph, not the source classification workload');
	assert.equal(await readFile(join(f.root, 'tasks.py'), 'utf8'), source);
});

test('failure and process restart preserve completed views and do not expose partial diagrams', async t => {
	const f = await fixture(t);
	let progress = await f.approve(await f.step(await f.prepare()));
	progress = await f.step(progress); progress = await f.step(progress);
	f.setFail('scenario');
	await assert.rejects(f.step(progress), /Provider unavailable/);
	assert.equal((await f.call({ operation: 'inspect', snapshot: f.initial.snapshot })).diagramState, 'index');
	f.restart(); f.setFail(undefined);
	progress = await f.prepare({ resume: progress.id });
	assert.deepEqual(progress.plan.map(item => item.status), ['complete', 'complete', 'pending', 'pending']);
	while (progress.status !== 'complete') { progress = await f.step(progress); }
	assert.deepEqual(f.requests.filter(item => item.step === 'diagram').map(item => item.diagram.key), ['workflow', 'scenario', 'scenario', 'lifecycle']);
	assert.equal(progress.context.diagramState, 'diagrams');
});

test('source changes invalidate the reviewed plan before any view request', async t => {
	const f = await fixture(t), progress = await f.step(await f.prepare());
	await writeFile(join(f.root, 'tasks.py'), source + '\n# changed\n');
	await assert.rejects(f.approve(progress), /changed since the diagram proposal/);
	assert.equal(f.requests.length, 1);
});

test('an unsupported lifecycle proposal fails before approval and never silently loses a diagram', async t => {
	const f = await fixture(t);
	f.change(value => { value.relations = value.relations.filter(item => item.kind !== 'transition'); });
	await assert.rejects(f.step(await f.prepare()), /no supported state interactions/);
	assert.equal(f.requests.length, 1);
	assert.equal((await f.call({ operation: 'inspect', snapshot: f.initial.snapshot })).diagramState, 'index');
});

test('plan focus resolves declared relation keys and sequence schemas exclude nonparticipant contracts', async t => {
	const f = await fixture(t);
	f.change(value => {
		value.concepts.push({ ...value.concepts[0], key: 'input', kind: 'contract', name: 'Task Input' });
		value.relations.push({ ...value.relations[0], key: 'input-contract', kind: 'dependency', from: 'c:create', to: 'c:input' });
		value.plan[2].focus = ['choose', 'save', 'c:input'];
		value.plan[3].focus = ['finish', 'c:task'];
	});
	let progress = await f.step(await f.prepare());
	assert.deepEqual(progress.plan[3].focus, ['c:open', 'c:done', 'c:task']);
	progress = await f.approve(progress);
	while (progress.status !== 'complete') { progress = await f.step(progress); }
	const request = f.requests.find(item => item.diagram?.kind === 'sequence');
	assert.equal(request.graph.elements.some(item => item.ref === 'c:input'), false);
	const { model } = await readSnapshot(progress.context.snapshot);
	const sequence = getSequenceDiagram(model, model.views.find(item => item.kind === 'sequence'));
	assert.equal(sequence.participants.some(item => item.name === 'Task Input'), false);
	assert.equal(sequence.messages.length, 3);
});
