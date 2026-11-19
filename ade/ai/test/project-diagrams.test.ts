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
	const reopened = await f.request({ action: 'open', featureWorkflow: true });
	assert.equal(reopened.data.phase, undefined);
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

test('resuming exposes orphan invalid attempts and archives them without losing the valid planned diagrams', async t => {
	const f = await fixture(t); await f.details();
	const bad = await f.propose('obsolete-class-attempt', [{ kind: 'view', ref: '@bad', name: 'Unusable class view', viewKind: 'class', intent: 'Old attempt', elementIds: [f.overview.data.aliases['@api']], relationIds: [] }]);
	assert.equal(bad.data.status, 'invalid');
	const before = await f.request({ action: 'review' });
	assert.equal(before.data.proposal.status, 'invalid');
	const inspected = await f.tool('ade_project_inspect', {});
	assert.ok(inspected.data.exploration.drafts.some(draft => draft.id === 'obsolete-class-attempt' && draft.status === 'invalid'));
	await f.tool('ade_proposal_discard', { proposalId: 'obsolete-class-attempt', reason: 'Replaced by the valid diagrams already linked to the plan' });
	const after = await f.request({ action: 'review' });
	const journal = await readExplorationSession(f.root, f.opened.sessionId);
	assert.deepEqual([after.data.proposal.status, after.data.images.length, journal.proposals.find(proposal => proposal.id === 'obsolete-class-attempt')?.discardedReason, await readFile(join(f.root, 'checkout.mjs'), 'utf8')], ['ready', 2, 'Replaced by the valid diagrams already linked to the plan', f.source]);
	const refused = await f.request({ action: 'tool', tool: 'ade_proposal_discard', arguments: { proposalId: 'overview-1', reason: 'Must not discard a valid assigned diagram' } });
	assert.equal(refused.diagnostics[0].code, 'proposalCannotBeDiscarded');
});

test('ready task updates reject nonexistent or invalid proposals instead of reporting false completion', async t => {
	const f = await fixture(t);
	await f.tool('ade_task_update', { id: 'save', intent: 'save', status: 'running', gaps: [] });
	const result = await f.request({ action: 'tool', tool: 'ade_task_update', arguments: { id: 'save', intent: 'save', status: 'ready', gaps: [], proposalId: 'missing' } });
	assert.equal(result.diagnostics[0].code, 'plannedProposalNotReady');
	assert.equal((await f.request({ action: 'status' })).data.tasks.find(task => task.id === 'save')?.status, 'running');
});

test('expired saved exploration budgets stop before starting a provider and can be explicitly renewed', async t => {
	const f = await fixture(t);
	const file = join(f.root, '.ade', 'exploration', f.opened.sessionId + '.json');
	const session = await readExplorationSession(f.root, f.opened.sessionId);
	session.created = Date.now() - session.budget.maxDurationMs - 1000;
	await writeFile(file, JSON.stringify(session));
	const status = await f.request({ action: 'status' });
	assert.deepEqual(status.data.budgetStatus.exhausted, ['duration']);
	const config = { version: 1, provider: 'codex', connection: 'cli', executable: '/not-a-provider', model: 'test', timeoutMs: 10000, maxContextBytes: 262144, maxCalls: 1 };
	await assert.rejects(createCodeEngine().execute(JSON.stringify({ operation: 'diagramChat', root: f.root, snapshot: f.context.snapshot, sessionId: f.opened.sessionId, config: JSON.stringify(config), messages: [{ role: 'user', text: 'Resume' }] })), /exploration budget is exhausted/);
	const resumed = await f.request({ action: 'budget', budget: session.budget });
	assert.deepEqual([resumed.data.budgetStatus.exhausted, resumed.data.usage.toolCalls, resumed.data.proposals.length], [[], session.usage.toolCalls, session.proposals.length]);
});

async function featureFixture(t) {
	const root = await mkdtemp(join(tmpdir(), 'ade-feature-diagrams-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	await writeFile(join(root, 'purchase.mjs'), 'export function purchase(store) { return store.reserve(); }\n');
	await writeFile(join(root, 'returns.mjs'), 'export function returns(store) { return store.release(); }\n');
	const context = JSON.parse(await createCodeEngine().execute(JSON.stringify({ operation: 'import', root, syntaxOnly: true })));
	const opened = await executeDiagramExploration(context.snapshot, { action: 'open', workflow: 'project', featureWorkflow: true });
	let revision = opened.semanticRevision;
	const request = input => executeDiagramExploration(context.snapshot, { sessionId: opened.sessionId, ...input });
	const call = async (name, args) => request({ action: 'tool', tool: name, arguments: args });
	const tool = async (name, args) => {
		const result = await call(name, args);
		assert.deepEqual(result.diagnostics, []);
		revision = result.semanticRevision;
		return result.data;
	};
	const evidence = async path => {
		const inventory = await tool('ade_project_inspect', {});
		const file = inventory.files.items.find(file => file.path === path);
		return (await tool('ade_source_read', { file: path, revision: file.revision })).evidence.id;
	};
	const purchase = { id: 'purchase', name: 'Purchase', description: 'Reserve an item', evidenceIds: [await evidence('purchase.mjs')], dependsOn: [] };
	const returns = { id: 'returns', name: 'Returns', description: 'Release an item', evidenceIds: [await evidence('returns.mjs')], dependsOn: ['purchase'] };
	const plan = (id, name, dependsOn = []) => ({ id, name, viewKind: 'structure', intent: 'Explain ' + name, rationale: 'Clarify responsibilities', dependsOn });
	const update = (id, status, proposalId?) => ({ id, intent: id, status, gaps: [], ...(proposalId ? { proposalId } : {}) });
	const proposal = (taskId, proposalId, commands, evidenceIds, supersedes?) => ({ taskId, proposalId, baseSemanticRevision: revision, readEvidenceIds: evidenceIds, readObjectIds: [], queryIds: [], commands, ...(supersedes ? { supersedes } : {}) });
	const commands = (item, feature, elementId = '@feature', store = '@store') => [
		...(elementId.startsWith('@') ? [{ kind: 'element', ref: elementId, element: { kind: 'feature', name: feature.name }, evidenceIds: feature.evidenceIds }] : []),
		...(store.startsWith('@') ? [{ kind: 'element', ref: store, element: { kind: 'resource', name: 'Inventory' }, evidenceIds: feature.evidenceIds }] : []),
		{ kind: 'view', ref: '@view', name: item.name, viewKind: item.viewKind, intent: item.intent, elementIds: [store], relationIds: [], featureId: elementId }
	];
	return { root, opened, request, call, tool, evidence, purchase, returns, plan, update, proposal, commands };
}

test('one provider checkpoint cannot read or advance the next feature phase', async t => {
	const f = await featureFixture(t);
	const start = (await f.request({ action: 'status' })).data;
	const discovery = { phase: 'discovery', toolCalls: start.usage.toolCalls, readBytes: start.usage.readBytes };
	const call = (tool, args, checkpoint = discovery, turnId = 'discovery-turn') => f.request({ action: 'tool', tool, arguments: args, checkpoint, turnId });
	assert.equal((await call('ade_diagram_plan', { items: [] })).diagnostics[0].code, 'toolOutsideDiagramCheckpoint');
	const recorded = await call('ade_feature_catalog', { features: [f.purchase, f.returns] });
	assert.deepEqual([recorded.diagnostics, recorded.data], [[], { checkpointComplete: true, phase: 'planning' }]);
	const early = await call('ade_project_inspect', {});
	assert.deepEqual([early.diagnostics[0].code, early.data], ['diagramCheckpointChanged', { phase: 'planning' }]);
	const current = (await f.request({ action: 'status' })).data;
	const plan = { phase: 'planning', toolCalls: current.usage.toolCalls, readBytes: current.usage.readBytes };
	const inspected = await call('ade_project_inspect', {}, plan, 'planning-turn');
	assert.deepEqual([inspected.diagnostics, inspected.data.exploration.phase, inspected.data.exploration.features.map(feature => feature.id), inspected.data.exploration.tasks], [[], 'planning', ['purchase', 'returns'], undefined]);
	assert.deepEqual(inspected.data.exploration.reusableObjects, { elements: 0, relations: 0 });
	const status = (await f.request({ action: 'status' })).data;
	assert.deepEqual(status.usage.modelTurns, ['discovery-turn', 'planning-turn']);
	assert.deepEqual(status.toolActivity.slice(-2).map(({ tool, turnId, state }) => [tool, turnId, state]), [
		['ade_feature_catalog', 'discovery-turn', 'complete'],
		['ade_project_inspect', 'planning-turn', 'complete']
	]);
});

test('feature catalog orders dependencies, enforces one previewed diagram at a time and shares stable model IDs', async t => {
	const f = await featureFixture(t);
	assert.equal(f.opened.data.phase, 'discovery');
	const badEvidence = await f.call('ade_feature_catalog', { features: [{ ...f.purchase, evidenceIds: ['fabricated'] }] });
	assert.equal(badEvidence.diagnostics[0].code, 'missingEvidence');
	const catalog = await f.tool('ade_feature_catalog', { features: [f.returns, f.purchase] });
	assert.deepEqual(catalog.featureCatalog.features.map(feature => feature.id), ['purchase', 'returns']);
	await f.tool('ade_diagram_plan', { items: [], gaps: ['Use focused feature views for this repository'] });
	const purchase = f.plan('purchase-overview', 'Purchase Overview'), stock = f.plan('stock-detail', 'Stock Details', [purchase.id]), returns = f.plan('returns-overview', 'Returns Overview', [purchase.id]);
	const rejectedPlan = await f.call('ade_diagram_plan', { featureId: 'returns', items: [returns] });
	assert.equal(rejectedPlan.diagnostics[0].code, 'featurePlanOutOfOrder:purchase');
	await f.tool('ade_diagram_plan', { featureId: 'purchase', items: [stock, purchase] });
	assert.equal((await f.call('ade_task_update', f.update(stock.id, 'running'))).diagnostics[0].code, 'diagramTaskOutOfOrder:purchase-overview');
	const first = f.proposal(purchase.id, 'purchase-first', f.commands(purchase, f.purchase), f.purchase.evidenceIds);
	assert.equal((await f.call('ade_model_propose', first)).diagnostics[0].code, 'diagramTaskNotActive:purchase-overview');
	await f.tool('ade_task_update', f.update(purchase.id, 'running'));
	const proposal = await f.tool('ade_model_propose', first);
	assert.equal((await f.call('ade_task_update', f.update(purchase.id, 'ready', first.proposalId))).diagnostics[0].code, 'plannedProposalNotPreviewed');
	await f.tool('ade_view_preview', { proposalId: first.proposalId });
	await f.tool('ade_task_update', f.update(purchase.id, 'ready', first.proposalId));
	const reopened = await f.request({ action: 'open' });
	assert.deepEqual([reopened.data.nextTaskId, reopened.data.featureCatalog.features[0].elementId], [stock.id, proposal.aliases['@feature']]);
	const lookup = await f.tool('ade_model_query', { collection: 'elements', match: { name: 'Inventory', kind: 'resource', evidenceIds: f.purchase.evidenceIds } });
	assert.equal(lookup.candidates[0].id, proposal.aliases['@store']);
	await f.tool('ade_model_propose', first);
	assert.equal((await f.request({ action: 'status' })).data.nextTaskId, stock.id);
	await f.tool('ade_task_update', f.update(stock.id, 'running'));
	await f.tool('ade_model_propose', f.proposal(stock.id, 'stock-first', f.commands(stock, f.purchase, proposal.aliases['@feature'], proposal.aliases['@store']), f.purchase.evidenceIds));
	await f.tool('ade_view_preview', { proposalId: 'stock-first' });
	await f.tool('ade_task_update', f.update(stock.id, 'ready', 'stock-first'));
	await f.tool('ade_diagram_plan', { featureId: 'returns', items: [returns] });
	await f.tool('ade_task_update', f.update(returns.id, 'running'));
	const wrong = f.proposal(returns.id, 'returns-wrong', f.commands(returns, f.returns, proposal.aliases['@feature'], proposal.aliases['@store']), f.returns.evidenceIds);
	assert.equal((await f.call('ade_model_propose', wrong)).diagnostics[0].code, 'featureElementMismatch:returns');
	await f.tool('ade_model_propose', f.proposal(returns.id, 'returns-first', f.commands(returns, f.returns, '@feature', proposal.aliases['@store']), f.returns.evidenceIds));
	await f.tool('ade_view_preview', { proposalId: 'returns-first' });
	await f.tool('ade_task_update', f.update(returns.id, 'ready', 'returns-first'));
	const review = await f.request({ action: 'review' });
	assert.deepEqual([review.data.phase, review.data.proposal.status, review.data.images.length], ['review', 'ready', 3]);
	const published = await f.request({ action: 'publishAll', reviewId: review.data.reviewId });
	const model = JSON.parse(await readFile(join(published.data.snapshot, 'model.ade.json'), 'utf8'));
	assert.deepEqual(model.semantics.elements.map(element => element.name).sort(), ['Inventory', 'Purchase', 'Returns']);
	assert.deepEqual(model.views.map(view => view.nodes[0].elementId), Array(3).fill(proposal.aliases['@store']));
});

test('stale earlier evidence pauses a later running feature and repair preserves canonical IDs', async t => {
	const f = await featureFixture(t);
	await f.tool('ade_feature_catalog', { features: [f.purchase, f.returns] });
	await f.tool('ade_diagram_plan', { items: [], gaps: ['Feature views cover the project'] });
	const purchase = f.plan('purchase-overview', 'Purchase Overview'), returns = f.plan('returns-overview', 'Returns Overview', [purchase.id]);
	await f.tool('ade_diagram_plan', { featureId: 'purchase', items: [purchase] });
	await f.tool('ade_task_update', f.update(purchase.id, 'running'));
	const original = await f.tool('ade_model_propose', f.proposal(purchase.id, 'original', f.commands(purchase, f.purchase), f.purchase.evidenceIds));
	await f.tool('ade_view_preview', { proposalId: 'original' });
	await f.tool('ade_task_update', f.update(purchase.id, 'ready', 'original'));
	await f.tool('ade_diagram_plan', { featureId: 'returns', items: [returns] });
	await f.tool('ade_task_update', f.update(returns.id, 'running'));
	await writeFile(join(f.root, 'purchase.mjs'), 'export function purchase(store) { return store.reserve(1); }\n');
	const reopened = await f.request({ action: 'open' });
	assert.deepEqual([reopened.data.phase, reopened.data.tasks.map(task => task.status)], ['discovery', ['blocked', 'blocked']]);
	const updated = { ...f.purchase, evidenceIds: [await f.evidence('purchase.mjs')] };
	await f.tool('ade_feature_catalog', { features: [updated, f.returns] });
	assert.equal((await f.call('ade_task_update', f.update(returns.id, 'running'))).diagnostics[0].code, 'diagramTaskOutOfOrder:purchase-overview');
	await f.tool('ade_task_update', f.update(purchase.id, 'running'));
	const replacement = await f.tool('ade_model_propose', f.proposal(purchase.id, 'replacement', f.commands(purchase, updated), updated.evidenceIds, 'original'));
	assert.deepEqual(replacement.aliases, original.aliases);
	await f.tool('ade_view_preview', { proposalId: 'replacement' });
	const next = await f.tool('ade_task_update', f.update(purchase.id, 'ready', 'replacement'));
	assert.equal(next.nextTaskId, returns.id);
});
