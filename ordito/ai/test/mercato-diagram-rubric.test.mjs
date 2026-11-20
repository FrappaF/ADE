import '../../scripts/source-loader.mjs';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { diagramFeatureChecks, mercatoDiagramChecks } from '../../scripts/diagram-feature-rubric.mjs';

const { createCodeEngine } = await import('../../runtime/nativeHost.ts');
const { executeDiagramExploration, readExplorationSession } = await import('../diagramSession.ts');

test('Mercato feature rubric checks grounded views and rejects split order identity', async t => {
	const root = await mkdtemp(join(tmpdir(), 'ordito-mercato-diagram-rubric-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	await cp(new URL('../../examples/guida/07-mercato-laboratorio/codice-ia/', import.meta.url), root, { recursive: true });
	const context = JSON.parse(await createCodeEngine().execute(JSON.stringify({ operation: 'import', root })));
	const { sessionId, semanticRevision } = await executeDiagramExploration(context.snapshot, { action: 'open', workflow: 'project', featureWorkflow: true, model: 'deterministic-fixture' });
	let revision = semanticRevision;
	const call = (action, other) => executeDiagramExploration(context.snapshot, { action, sessionId, ...other });
	const tool = async (name, arguments_) => {
		const response = await call('tool', { tool: name, arguments: arguments_ });
		assert.deepEqual(response.diagnostics, [], name);
		revision = response.semanticRevision;
		return response.data;
	};
	const anchor = async (symbol, file) => {
		const { page } = await tool('ordito_source_search', { mode: 'symbol', query: symbol, filePrefix: file, role: 'runtime' });
		return page.items.find(item => item.name === symbol).evidence.id;
	};
	const checkout = await anchor('checkout', 'src/checkout.mjs');
	const returns = await anchor('requestReturn', 'src/returns.mjs');
	const orders = await anchor('createOrderStore', 'src/orders.mjs');
	const features = [
		{ id: 'acquisto', name: 'Acquisto', description: 'Conferma un ordine approvato', evidenceIds: [checkout], dependsOn: [] },
		{ id: 'resi', name: 'Resi', description: 'Richiede il reso di un ordine salvato', evidenceIds: [returns], dependsOn: ['acquisto'] }
	];
	await tool('ordito_feature_catalog', { features });
	await tool('ordito_diagram_plan', { items: [], gaps: ['Per le due funzionalità bastano le viste focalizzate.'] });
	const stage = async (feature, order, relationKind) => {
		const taskId = `${feature.id}-structure`, diagramName = `Struttura ${feature.name}`;
		const [evidence] = feature.evidenceIds;
		await tool('ordito_diagram_plan', { featureId: feature.id, items: [{ id: taskId, name: diagramName, viewKind: 'structure', intent: feature.description, rationale: 'Rende esplicita la dipendenza dall’archivio ordini', dependsOn: [] }] });
		await tool('ordito_task_update', { id: taskId, intent: feature.description, status: 'running', gaps: [] });
		const proposalId = `${feature.id}-first`;
		const result = await tool('ordito_model_propose', { taskId, proposalId, baseSemanticRevision: revision, readEvidenceIds: [evidence, orders], queryIds: [], readObjectIds: order ? [order] : [], commands: [
			{ kind: 'element', ref: '@feature', evidenceIds: [evidence], element: { kind: 'feature', name: feature.name } },
			{ kind: 'element', ref: '@action', evidenceIds: [evidence], element: { kind: 'action', name: feature.description } },
			...(order ? [] : [{ kind: 'element', ref: '@order', evidenceIds: [orders], element: { kind: 'resource', name: 'Archivio ordini' } }]),
			{ kind: 'relation', ref: '@orderAccess', evidenceIds: [evidence], relation: { kind: relationKind, from: '@action', to: order ?? '@order', name: relationKind === 'write' ? 'Salva ordine' : 'Legge ordine' } },
			{ kind: 'view', ref: '@view', name: diagramName, viewKind: 'structure', intent: feature.description, elementIds: ['@action', order ?? '@order'], relationIds: ['@orderAccess'], featureId: '@feature' }
		] });
		await tool('ordito_view_preview', { proposalId });
		await tool('ordito_task_update', { id: taskId, intent: feature.description, status: 'ready', gaps: [], proposalId });
		return result.aliases;
	};
	const purchase = await stage(features[0], undefined, 'write');
	const lookup = await tool('ordito_model_query', { collection: 'elements', match: { name: 'Archivio ordini', kind: 'resource', evidenceIds: [orders] } });
	assert.equal(lookup.candidates[0].id, purchase['@order']);
	await stage(features[1], lookup.candidates[0].id, 'read');
	const { data: { phase, usage: { toolCalls, readBytes } } } = await call('status');
	assert.equal(phase, 'audit');
	const audit = async (tool, arguments_ = {}) => {
		const response = await call('tool', { tool, arguments: arguments_, checkpoint: { phase, toolCalls, readBytes }, turnId: 'mercato-rubric-audit' });
		assert.deepEqual(response.diagnostics, [], tool);
		return response.data;
	};
	const inspect = async (tool, args = {}) => {
		let cursor;
		do {
			({ objects: { nextCursor: cursor } } = await audit(tool, { ...args, ...(cursor ? { cursor } : {}) }));
		} while (cursor);
	};
	const inventory = await audit('ordito_audit_inventory');
	for (const { id: viewId } of inventory.views) { await inspect('ordito_audit_diagram', { viewId }); }
	await audit('ordito_source_search', { query: 'createOrderStore', mode: 'symbol', filePrefix: 'src/orders.mjs' });
	await inspect('ordito_audit_reuse');
	await audit('ordito_audit_submit', { summary: 'Both feature diagrams use the same evidenced order store.', findings: [] });
	const review = await call('review');
	const artifact = JSON.parse(await readFile(review.data.reviewFile, 'utf8'));
	const session = await readExplorationSession(root, sessionId);
	const checks = [...diagramFeatureChecks(session, review), ...mercatoDiagramChecks(session, review, artifact)];
	assert.deepEqual(checks.filter(check => !check.passed), []);
	const split = structuredClone(review), returnsView = split.data.proposal.views.at(-1);
	returnsView.nodes.find(node => node.elementId === purchase['@order']).elementId = 'cloned-order';
	session.featureCatalog.features[1].evidenceIds = [checkout];
	assert.deepEqual(mercatoDiagramChecks(session, split, artifact).filter(check => !check.passed).map(check => check.id), ['mercato-feature-runtime-evidence', 'mercato-canonical-order-reuse']);
});
