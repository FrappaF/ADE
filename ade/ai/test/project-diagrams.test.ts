/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../scripts/source-loader.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
const { createCodeEngine } = await import('../../runtime/nativeHost.ts');
const { executeDiagramExploration, readExplorationSession } = await import('../diagramSession.ts');
const { active } = await import('../../runtime/projectStore.ts');

async function fixture(t) {
	const root = await mkdtemp(join(tmpdir(), 'ade-project-diagrams-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	const source = 'export function checkout(store) { return store.save(); }\n';
	await writeFile(join(root, 'checkout.mjs'), source);
	const context = JSON.parse(await createCodeEngine().execute(JSON.stringify({ operation: 'import', root, syntaxOnly: true })));
	const opened = await executeDiagramExploration(context.snapshot, { action: 'open', workflow: 'project' });
	let revision = opened.semanticRevision;
	const request = input => executeDiagramExploration(context.snapshot, { sessionId: opened.sessionId, ...input });
	const tool = async (name, args) => {
		const result = await request({ action: 'tool', tool: name, arguments: args });
		assert.deepEqual(result.diagnostics, []);
		revision = result.semanticRevision;
		return result;
	};
	const plan = [
		{ id: 'overview', name: 'Runtime Overview', viewKind: 'structure', intent: 'Runtime responsibilities', rationale: 'Orient the reader', dependsOn: [] },
		{ id: 'save', name: 'Save Todo', viewKind: 'sequence', intent: 'One save request', rationale: 'Explain the save interaction', parentId: 'overview', dependsOn: ['overview'] }
	];
	await tool('ade_diagram_plan', { items: plan });
	const inventory = await tool('ade_project_inspect', {}), file = inventory.data.files.items.find(file => file.path === 'checkout.mjs');
	const read = await tool('ade_source_read', { file: file.path, revision: file.revision });
	const evidenceId = read.data.evidence.id;
	const propose = (proposalId, commands, extra = {}) => tool('ade_model_propose', { proposalId, baseSemanticRevision: revision, readEvidenceIds: [evidenceId], readObjectIds: [], queryIds: [], commands, ...extra });
	const overviewCommands = [
		{ kind: 'element', ref: '@api', element: { kind: 'component', name: 'Todo API' }, evidenceIds: [evidenceId] },
		{ kind: 'element', ref: '@store', element: { kind: 'resource', name: 'Todo Store' }, evidenceIds: [evidenceId] },
		{ kind: 'view', ref: '@overview', name: 'Runtime Overview', viewKind: 'structure', intent: 'Runtime responsibilities', elementIds: ['@api', '@store'], relationIds: [] }
	];
	const overview = await propose('overview-1', overviewCommands);
	const ready = async (id, proposalId) => { await tool('ade_task_update', { id, intent: id, status: 'running', gaps: [] }); await tool('ade_task_update', { id, intent: id, status: 'ready', gaps: [], proposalId }); };
	await ready('overview', 'overview-1');
	const details = async () => {
		const { '@api': api, '@store': store } = overview.data.aliases;
		await propose('save-1', [
			{ kind: 'scenario', ref: '@save', trigger: 'Save a todo', scope: 'One save request', participantIds: [api, store], evidenceIds: [evidenceId], occurrences: [{ ref: '@call', from: api, to: store, name: 'save', evidenceIds: [evidenceId] }], order: [], alternatives: [] },
			{ kind: 'view', ref: '@sequence', name: 'Save Todo', viewKind: 'sequence', intent: 'One save request', elementIds: [api, store], relationIds: [], scenarioId: '@save' }
		]);
		await ready('save', 'save-1');
	};
	return { root, source, context, opened, request, tool, propose, plan, overview, overviewCommands, details };
}

test('complete generation stages shared objects and different notations, then applies one reviewed transaction', async t => {
	const f = await fixture(t), initial = await active(f.root), modelBefore = await readFile(f.context.model, 'utf8');
	const incomplete = await f.request({ action: 'review' });
	assert.equal(incomplete.data.proposal.status, 'invalid');
	await f.details();
	assert.equal(await active(f.root), initial);
	assert.equal(await readFile(f.context.model, 'utf8'), modelBefore);
	const review = await f.request({ action: 'review' });
	assert.deepEqual([review.data.proposal.status, review.data.images.length, review.data.proposal.views.map(view => view.kind)], ['ready', 2, ['structure', 'sequence']]);
	await assert.rejects(f.request({ action: 'publish', proposalId: 'overview-1' }), /projectReviewRequired/);
	const applied = await f.request({ action: 'publishAll', reviewId: review.data.reviewId });
	const model = JSON.parse(await readFile(join(applied.data.snapshot, 'model.ade.json'), 'utf8'));
	assert.deepEqual(model.views.map(view => view.kind), ['structure', 'sequence']);
	assert.equal(model.semantics.elements.length, 2);
	const pointer = await active(f.root);
	await f.request({ action: 'publishAll', reviewId: review.data.reviewId });
	assert.equal(await active(f.root), pointer);
	assert.equal(await readFile(join(f.root, 'checkout.mjs'), 'utf8'), f.source);
});

test('a changed plan or source blocks the entire reviewed batch without publishing a subset', async t => {
	const f = await fixture(t); await f.details();
	const review = await f.request({ action: 'review' }), initial = await active(f.root);
	await f.tool('ade_diagram_plan', { items: f.plan.map(item => ({ ...item, rationale: item.rationale + ' revised' })) });
	await assert.rejects(f.request({ action: 'publishAll', reviewId: review.data.reviewId }), /projectReviewChanged/);
	const refreshed = await f.request({ action: 'review' });
	await writeFile(join(f.root, 'checkout.mjs'), f.source + '// changed\n');
	await assert.rejects(f.request({ action: 'publishAll', reviewId: refreshed.data.reviewId }), /projectNotReady/);
	assert.equal(await active(f.root), initial);
});

test('a correction preserves shared IDs, invalidates dependent reads and survives reopening without losing drafts', async t => {
	const f = await fixture(t); await f.details();
	const before = await readExplorationSession(f.root, f.opened.sessionId);
	await f.propose('overview-2', f.overviewCommands.map(command => command.kind === 'element' && command.ref === '@api' ? { ...command, element: { ...command.element, name: 'Revised Todo API' } } : command), { supersedes: 'overview-1' });
	const after = await readExplorationSession(f.root, f.opened.sessionId);
	assert.deepEqual(after.proposals.at(-1).aliases, before.proposals[0].aliases);
	const reopened = await f.request({ action: 'open' });
	assert.ok(reopened.data.batch.blockers.length);
	assert.equal(reopened.data.proposals.length, 2);
	const review = await f.request({ action: 'review' });
	assert.equal(review.data.proposal.status, 'invalid');
	await assert.rejects(f.request({ action: 'publishAll', reviewId: review.data.reviewId }), /projectNotReady/);
});

test('planning rejects cycles and unsupported notations and records explicit exclusions', async t => {
	const f = await fixture(t);
	const cycle = await f.request({ action: 'tool', tool: 'ade_diagram_plan', arguments: { items: f.plan.map(item => item.id === 'overview' ? { ...item, dependsOn: ['save'] } : item) } });
	assert.match(cycle.diagnostics[0].code, /diagramPlanCycle/);
	const unsupported = await f.request({ action: 'tool', tool: 'ade_diagram_plan', arguments: { items: [{ ...f.plan[0], viewKind: 'state' }] } });
	assert.equal(unsupported.diagnostics[0].code, 'invalidToolArguments');
	const missingReason = await f.request({ action: 'tool', tool: 'ade_task_update', arguments: { id: 'save', intent: 'Save request', status: 'cancelled', gaps: [] } });
	assert.equal(missingReason.diagnostics[0].code, 'diagramExclusionReasonRequired');
	await f.tool('ade_task_update', { id: 'save', intent: 'Save request', status: 'cancelled', gaps: ['No sufficient evidence for the behavioral view'] });
	assert.equal((await f.request({ action: 'review' })).data.proposal.status, 'ready');
});


test('an explicitly excluded invalid draft remains recorded but cannot leak into the final transaction', async t => {
	const f = await fixture(t);
	const invalid = await f.propose('unusable-class', [{ kind: 'view', ref: '@classes', name: 'Unusable Class View', viewKind: 'class', intent: 'Unavailable class detail', elementIds: [f.overview.data.aliases['@api']], relationIds: [] }]);
	assert.equal(invalid.data.status, 'invalid');
	assert.equal((await f.request({ action: 'review' })).data.proposal.status, 'invalid');
	await f.tool('ade_task_update', { id: 'save', intent: 'Save request', status: 'cancelled', proposalId: 'unusable-class', gaps: ['The available evidence cannot support this detail view'] });
	const review = await f.request({ action: 'review' });
	assert.deepEqual([review.data.proposal.status, review.data.images.length, review.data.tasks.find(task => task.id === 'save').status], ['ready', 1, 'cancelled']);
	const applied = await f.request({ action: 'publishAll', reviewId: review.data.reviewId });
	const model = JSON.parse(await readFile(join(applied.data.snapshot, 'model.ade.json'), 'utf8'));
	assert.deepEqual(model.views.map(view => view.name), ['Runtime Overview']);
	assert.equal((await readExplorationSession(f.root, f.opened.sessionId)).proposals.find(proposal => proposal.id === 'unusable-class').excludedByPlan, 'save');
});

test('changing stored draft content invalidates the final review even if its request fingerprint was kept', async t => {
	const f = await fixture(t); await f.details();
	const review = await f.request({ action: 'review' }), initial = await active(f.root);
	const session = await readExplorationSession(f.root, f.opened.sessionId);
	session.proposals[0].patch.find(patch => patch.collection === 'elements').value.description = 'Changed after the user reviewed the diagrams';
	await writeFile(join(f.root, '.ade/exploration', session.id + '.json'), JSON.stringify(session));
	await assert.rejects(f.request({ action: 'publishAll', reviewId: review.data.reviewId }), /projectReviewChanged/);
	assert.equal(await active(f.root), initial);
});
