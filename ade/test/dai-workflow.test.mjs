/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import test from 'node:test';
import assert from 'node:assert/strict';
import '../scripts/source-loader.mjs';
const { ModelContinuity } = await import('../../src/vs/workbench/contrib/ade/common/modelContinuity.ts');
const { modelTaskIntent } = await import('../../src/vs/workbench/contrib/ade/common/modelWorkflow.ts');
const { applyVisualEdit } = await import('../../src/vs/workbench/contrib/ade/common/visualEditing.ts');
const { canonicalJson, semanticContent } = await import('../../src/vs/workbench/contrib/ade/common/modelSerialization.ts');
const { readSemanticModel, validateSemanticModel } = await import('../../src/vs/workbench/contrib/ade/common/semanticModel.ts');
import { checkoutStates } from './fixtures/dai-states.mjs';
const policy = { version: 1, revision: 'budget.1', root: '/project', maxPreparations: 3, attempted: 0, maxInputBytes: 196608, outputReserveBytes: 65536, review: 'manual', providerCalls: 0 };
function queue(t, overrides = {}) { const accepted = [], reservations = []; const q = new ModelContinuity(v => accepted.push(v), p => { if (p) { reservations.push(structuredClone(p)); } }, 60000); t.after(() => q.dispose()); q.configure({ ...policy, ...overrides }); return { q, accepted, reservations }; }
function task(model = checkoutStates) { return { id: 'task.checkout', target: { kind: 'operation', id: model.foundation.blueprint.operations[0].id }, revision: 'intent.1', text: 'Keep quantity validation strict', clarifications: [], history: [] }; }

test('DAI10 intent survives persistence; clarification advances revision and preserves the complete previous intent', () => {
	const first = task(), original = structuredClone(checkoutStates); let model = applyVisualEdit(original, { kind: 'taskIntent', entry: first });
	model = applyVisualEdit(model, { kind: 'taskIntent', expectedRevision: 'intent.1', entry: { ...first, revision: 'intent.2', clarifications: [{ question: 'Accept zero?', answer: 'No, quantity must be positive' }] } });
	assert.deepEqual(validateSemanticModel(model), []); assert.deepEqual(readSemanticModel(JSON.parse(JSON.stringify(model))).foundation.tasks, model.foundation.tasks);
	assert.throws(() => applyVisualEdit(model, { kind: 'taskIntent', expectedRevision: 'intent.2', entry: first }), /intent changed/);
	assert.deepEqual(model.foundation.tasks[0].history, [{ revision: 'intent.1', text: first.text, clarifications: [] }]);
	assert.deepEqual(modelTaskIntent(model, 'operation', first.target.id, 'fallback'), { revision: 'intent.2', text: first.text, clarifications: [{ question: 'Accept zero?', answer: 'No, quantity must be positive' }] });
	assert.equal(modelTaskIntent(model, 'interaction', first.target.id, 'fallback').text, 'fallback'); assert.deepEqual(original, checkoutStates);
});
test('DAI10 stale clarification, retargeting and incomplete intent fail without mutating the model', () => {
	const entry = task(), model = applyVisualEdit(checkoutStates, { kind: 'taskIntent', entry }), before = structuredClone(model);
	for (const edit of [{ expectedRevision: 'wrong', entry: { ...entry, revision: '2' } }, { expectedRevision: 'intent.1', entry: { ...entry, revision: '2', target: { kind: 'element', id: model.semantics.elements[0].id } } }, { entry: { ...entry, id: 'new', text: ' ' } }, { entry: { ...entry, id: 'new', clarifications: [{ question: 'x', answer: '' }] } }]) { assert.throws(() => applyVisualEdit(model, { kind: 'taskIntent', ...edit })); }
	assert.deepEqual(model, before);
});
test('DAI10 duplicate intent revisions and missing targets are explicit model diagnostics', () => {
	const entry = task(), model = structuredClone(checkoutStates); model.foundation.tasks = [{ ...entry, target: { kind: 'operation', id: 'absent' }, history: [{ revision: entry.revision, text: 'old', clarifications: [] }] }];
	const diagnostics = validateSemanticModel(model); assert.ok(diagnostics.some(d => d.code === 'missingReference')); assert.ok(diagnostics.some(d => d.args.includes('duplicateIntentRevision')));
});
test('DAI10 selection/layout/formatting do not change the semantic revision used for preparation', () => {
	const model = structuredClone(checkoutStates), before = canonicalJson(semanticContent(model)); model.views[0].nodes[0].x += 13; model.views[0].name = 'Presentation';
	assert.equal(canonicalJson(semanticContent(model)), before); assert.equal(canonicalJson(semanticContent(readSemanticModel(JSON.parse(JSON.stringify(model, null, 4))))), before);
});
test('DAI10 opt-in off starts no jobs and invalid budgets cannot enable preparation', async t => {
	let calls = 0; const q = new ModelContinuity(() => {}, () => {}, 60000); t.after(() => q.dispose()); q.update('a', true, async () => calls++); await q.flush(); assert.equal(calls, 0);
	for (const override of [{ maxPreparations: 0 }, { attempted: 4 }, { maxInputBytes: 196609 }, { maxInputBytes: NaN }, { providerCalls: 1 }, { review: 'automatic' }, { outputReserveBytes: 1 }]) { assert.throws(() => q.configure({ ...policy, ...override })); } assert.equal(q.active, false);
});
test('DAI10 rapid edits coalesce into the latest frozen revision with a durable reservation first', async t => {
	const { q, accepted, reservations } = queue(t); let jobs = 0;
	for (const revision of ['a', 'b', 'c']) { q.update(revision, true, async (_, p) => { jobs++; assert.equal(reservations.at(-1).attempted, 1); assert.equal(p.attempted, 1); return revision; }); }
	await q.flush(); assert.deepEqual([accepted, jobs, q.budget.attempted, q.state], [['c'], 1, 1, 'review']);
});
test('DAI10 obsolete completion is discarded even when the adapter ignores cancellation', async t => {
	const { q, accepted } = queue(t); let finish, signal;
	q.update('a', true, async s => { signal = s; return new Promise(resolve => { finish = resolve; }); }); const running = q.flush();
	q.update('b', true, async () => 'b'); assert.equal(signal.aborted, true); await q.flush(); assert.deepEqual(accepted, []);
	finish('obsolete'); await running; assert.deepEqual(accepted, []); await q.flush(); assert.deepEqual(accepted, ['b']); assert.equal(q.budget.attempted, 2);
});
test('DAI10 an incomplete draft cancels a valid revision and starts no replacement', async t => {
	const { q, accepted } = queue(t); let finish;
	q.update('a', true, async () => new Promise(resolve => { finish = resolve; })); const running = q.flush(); q.update('draft', false, async () => { throw new Error('must not start'); }); finish('stale'); await running; await q.flush();
	assert.deepEqual([accepted, q.state, q.budget.attempted], [[], 'blocked', 1]);
});
test('DAI10 exhausted budget blocks further work before adapter execution; resume retains consumption', async t => {
	const { q, accepted } = queue(t, { maxPreparations: 1 }); q.update('a', true, async () => 'a'); await q.flush(); q.update('b', true, async () => 'forbidden'); await q.flush();
	assert.deepEqual([accepted, q.state], [['a'], 'exhausted']); const saved = q.budget; q.pause(); q.configure(saved); q.update('b', true, async () => 'forbidden'); await q.flush(); assert.deepEqual([accepted, q.budget.attempted, q.state], [['a'], 1, 'exhausted']);
});
test('DAI10 stop cancels running work and discards results; explicit resume can retry', async t => {
	const { q, accepted } = queue(t); let finish, signal;
	q.update('a', true, async s => { signal = s; return new Promise(resolve => { finish = resolve; }); }); const running = q.flush(); q.pause(); finish('cancelled'); await running; assert.equal(signal.aborted, true); assert.deepEqual(accepted, []);
	q.configure(q.budget); q.update('a', true, async () => 'resumed'); await q.flush(); assert.deepEqual([accepted, q.budget.attempted], [['resumed'], 2]);
});
test('DAI10 failure is visible and does not retry on repeated presentation events', async t => {
	const { q } = queue(t); let calls = 0; const prepare = async () => { calls++; throw new Error('independent criteria unavailable'); };
	q.update('a', true, prepare); await q.flush(); q.update('a', true, prepare); await q.flush(); assert.equal(calls, 1); assert.equal(q.state, 'failed'); assert.match(q.error, /criteria/);
});
test('DAI10 aligned target repeats cause no proposals and no additional preparations', async t => {
	const { q, accepted } = queue(t); let calls = 0; const prepare = async () => { calls++; return undefined; };
	q.update('a', true, prepare); await q.flush(); q.update('a', true, prepare); await q.flush(); assert.deepEqual([accepted, calls, q.state], [[], 1, 'aligned']);
});
test('DAI10 replacing project policy cannot accept a previous project result', async t => {
	const { q, accepted } = queue(t); let finish;
	q.update('a', true, async () => new Promise(resolve => { finish = resolve; })); const running = q.flush(); q.configure({ ...policy, root: '/other', revision: '2' }); q.update('b', true, async () => 'other'); finish('old-project'); await running; await q.flush(); assert.deepEqual(accepted, ['other']); assert.equal(q.budget.attempted, 1);
});

test('DAI10 an invalid current document cancels preparation even when its last parsed semantic revision is unchanged', async t => {
	const { q, accepted } = queue(t); let finish, signal;
	q.update('a', true, async s => { signal = s; return new Promise(resolve => { finish = resolve; }); }); const running = q.flush();
	q.update('a', false, async () => 'forbidden'); finish('obsolete'); await running; assert.equal(signal.aborted, true); assert.deepEqual([accepted, q.state], [[], 'blocked']);
});
