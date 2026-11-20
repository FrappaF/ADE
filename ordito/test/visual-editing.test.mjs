import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { checkoutModel } = await import('../../src/vs/workbench/contrib/ordito/common/checkoutModel.ts');
const { readSemanticModel, validateSemanticModel } = await import('../../src/vs/workbench/contrib/ordito/common/modelValidation.ts');
const { semanticModelV3Schema } = await import('../../src/vs/workbench/contrib/ordito/common/modelSchema.ts');
const { migrateSemanticModel } = await import('../../src/vs/workbench/contrib/ordito/common/modelLegacyMigration.ts');
import '../scripts/source-loader.mjs';
const { getDiagramGroups } = await import('../../src/vs/workbench/contrib/ordito/common/visualNavigation.ts');

const { applyVisualEdit, getDeletionImpact, upgradeVisualModel } = await import('../../src/vs/workbench/contrib/ordito/common/visualEditing.ts');

const empty = () => ({ version: 3, id: 'new-system', name: 'New system', semantics: { elements: [], relations: [] }, views: [], codeMappings: [], verifications: [] });

test('v3 has a published schema and upgrades v2 without losing identity, layout or evidence', async () => {
	assert.deepEqual(JSON.parse(await readFile(new URL('../schema/model-v3.schema.json', import.meta.url))), semanticModelV3Schema);
	assert.deepEqual(validateSemanticModel(JSON.parse(await readFile(new URL('../examples/checkout-designed.ordito.json', import.meta.url)))), []);
	const upgraded = upgradeVisualModel(checkoutModel);
	assert.deepEqual({ ...upgraded, version: 2, views: upgraded.views.map(({ featureId, ...view }) => view) }, checkoutModel);
	assert.deepEqual(upgraded.views.map(view => view.featureId), ['purchase', 'purchase', 'cart-management', 'cancellation']);
	assert.deepEqual(migrateSemanticModel(upgraded), { model: upgraded, diagnostics: [] });
	assert.equal(checkoutModel.version, 2);
});

test('empty feature diagrams retain explicit ownership through save, reopen and rename', () => {
	let model = applyVisualEdit(empty(), { kind: 'feature', id: 'purchase', name: 'Confirm Purchase' });
	model = applyVisualEdit(model, { kind: 'diagram', id: 'flow', featureId: 'purchase', name: 'Payment', viewKind: 'activity' });
	model = applyVisualEdit(model, { kind: 'rename', target: 'element', id: 'purchase', name: 'Complete Purchase' });
	model = readSemanticModel(JSON.parse(JSON.stringify(model)));
	assert.deepEqual(getDiagramGroups(model).map(group => [group.name, group.views.map(view => view.id)]), [['New system', []], ['Complete Purchase', ['flow']]]);
	assert.deepEqual(model.views[0].nodes, []);
	const invalid = structuredClone(model);
	invalid.views[0].featureId = 'missing';
	assert.ok(validateSemanticModel(invalid).some(diagnostic => diagnostic.code === 'missingReference'));
});

test('designs success and refusal paths from an empty system without implementation claims', () => {
	let model = applyVisualEdit(empty(), { kind: 'feature', id: 'purchase', name: 'Confirm Purchase' });
	model = applyVisualEdit(model, { kind: 'diagram', id: 'flow', featureId: 'purchase', name: 'Checkout Flow', viewKind: 'activity' });
	for (const [id, name] of [['payment', 'Payment'], ['success', 'Order Confirmed'], ['failure', 'Payment Declined']]) {
		model = applyVisualEdit(model, { kind: 'element', id, name, elementKind: 'action', viewId: 'flow' });
	}
	for (const [to, condition] of [['success', 'Payment Authorized'], ['failure', 'Payment Declined']]) {
		model = applyVisualEdit(model, { kind: 'relation', id: `to-${to}`, from: 'payment', to, relationKind: 'invocation', name: condition, condition, viewId: 'flow' });
	}
	assert.deepEqual({ errors: validateSemanticModel(model), conditions: model.semantics.relations.map(relation => relation.condition), mappings: model.codeMappings, verifications: model.verifications },
		{ errors: [], conditions: ['Payment Authorized', 'Payment Declined'], mappings: [], verifications: [] });
});

test('edits a shared element once while layout stays local to its diagram', () => {
	let model = upgradeVisualModel(checkoutModel);
	model = applyVisualEdit(model, { kind: 'include', viewId: 'cart-structure', id: 'payment' });
	model = applyVisualEdit(model, { kind: 'rename', target: 'element', id: 'payment', name: 'Autorizza pagamento' });
	const semantics = structuredClone(model.semantics);
	model = applyVisualEdit(model, { kind: 'position', viewId: 'cart-structure', id: 'payment', x: -200, y: 400 });
	assert.deepEqual(model.semantics, semantics);
	assert.equal(model.views[0].nodes.find(node => node.elementId === 'payment').x, 520);
	assert.equal(model.views[2].nodes.find(node => node.elementId === 'payment').x, -200);
	assert.equal(model.semantics.elements.filter(element => element.id === 'payment').length, 1);
});

test('deletion cleans descendants, relations, evidence, owned diagrams and cross-view references', () => {
	let model = upgradeVisualModel(checkoutModel);
	model.codeMappings.push({ id: 'mapping', elementId: 'checkout-controller', file: 'src/checkout.ts', symbol: 'confirm', revision: 'abc' });
	model.verifications.push({ id: 'result', elementId: 'checkout-controller', criterionId: 'purchase-success', outcome: 'passed', evidence: 'result.json', revision: 'abc' });
	model = applyVisualEdit(model, { kind: 'include', id: 'payment', viewId: 'cart-structure' });
	const impact = getDeletionImpact(model, 'purchase');
	assert.deepEqual([impact.elements.length, impact.views.length, impact.mappings, impact.verifications], [4, 3, 1, 1]);
	const next = applyVisualEdit(model, { kind: 'deleteElement', id: 'purchase' });
	assert.deepEqual({ diagnostics: validateSemanticModel(next), views: next.views.map(view => view.id), mappings: next.codeMappings, verifications: next.verifications },
		{ diagnostics: [], views: ['cart-structure', 'cancellation-structure'], mappings: [], verifications: [] });
	assert.ok(!next.views[0].nodes.some(node => node.elementId === 'payment'));
	assert.ok(model.semantics.elements.some(element => element.id === 'purchase'));
	const noCustomer = applyVisualEdit(checkoutModel, { kind: 'deleteElement', id: 'customer' });
	assert.deepEqual(noCustomer.semantics.elements.find(element => element.id === 'checkout-controller').behavior.permissions, []);
});

test('invalid graph edits are rejected atomically, diagram deletion preserves the domain', () => {
	const before = structuredClone(checkoutModel);
	assert.throws(() => applyVisualEdit(checkoutModel, { kind: 'relation', id: 'bad', viewId: 'purchase-structure', from: 'customer', to: 'order', relationKind: 'write', name: '' }));
	assert.throws(() => applyVisualEdit(checkoutModel, { kind: 'position', viewId: 'purchase-structure', id: 'customer', x: Infinity, y: 0 }));
	assert.throws(() => applyVisualEdit(checkoutModel, { kind: 'rename', target: 'element', id: 'customer', name: '  ' }));
	assert.deepEqual(checkoutModel, before);
	assert.deepEqual(applyVisualEdit(checkoutModel, { kind: 'deleteDiagram', id: 'purchase-structure' }).semantics, checkoutModel.semantics);
});

test('editing a relationship preserves its identity across views and rejects incompatible endpoints atomically', () => {
	const original = checkoutModel.semantics.relations.find(relation => relation.kind === 'write');
	const edit = { kind: 'updateRelation', id: original.id, from: original.from, to: original.to, relationKind: 'read', name: 'Review order', condition: 'order exists' };
	const updated = applyVisualEdit(checkoutModel, edit);
	assert.deepEqual(updated.semantics.relations.find(relation => relation.id === original.id), { id: original.id, from: original.from, to: original.to, kind: 'read', name: 'Review order', condition: 'order exists' });
	assert.deepEqual(updated.views, upgradeVisualModel(checkoutModel).views);
	assert.throws(() => applyVisualEdit(checkoutModel, { ...edit, relationKind: 'write', from: 'customer' }));
	assert.notEqual(checkoutModel.semantics.relations.find(relation => relation.id === original.id).kind, 'read');
});

test('ordinary diagrams reuse compatible relationships without duplicating shared identities or changing other views', async () => {
	const { getAvailableDiagramRelations } = await import('../../src/vs/workbench/contrib/ordito/common/visualEditSupport.ts');
	let model = applyVisualEdit(empty(), { kind: 'diagram', id: 'source', name: 'Components', viewKind: 'component' });
	for (const id of ['provider', 'consumer', 'outside']) {
		model = applyVisualEdit(model, { kind: 'element', id, name: id, elementKind: 'component', viewId: 'source' });
	}
	model = applyVisualEdit(model, { kind: 'relation', id: 'dependency', from: 'consumer', to: 'provider', name: 'Uses', relationKind: 'dependency', viewId: 'source' });
	model = applyVisualEdit(model, { kind: 'relation', id: 'hidden', from: 'consumer', to: 'outside', name: 'Outside', relationKind: 'dependency', viewId: 'source' });
	model = applyVisualEdit(model, { kind: 'diagram', id: 'target', name: 'Reuse', viewKind: 'component' });
	for (const id of ['provider', 'consumer']) { model = applyVisualEdit(model, { kind: 'include', id, viewId: 'target' }); }
	const before = structuredClone(model);
	assert.deepEqual(getAvailableDiagramRelations(model, model.views[1]).map(relation => relation.id), ['dependency']);
	assert.throws(() => applyVisualEdit(model, { kind: 'includeRelation', id: 'hidden', viewId: 'target' }));
	assert.throws(() => applyVisualEdit(model, { kind: 'includeRelation', id: 'missing', viewId: 'target' }));
	model = applyVisualEdit(model, { kind: 'includeRelation', id: 'dependency', viewId: 'target' });
	assert.deepEqual(model.semantics, before.semantics);
	assert.deepEqual(model.views[0], before.views[0]);
	assert.deepEqual(model.views[1].nodes, before.views[1].nodes);
	assert.deepEqual(model.views[1].relationIds, ['dependency']);
	assert.deepEqual(getAvailableDiagramRelations(model, model.views[1]), []);
	assert.deepEqual(applyVisualEdit(model, { kind: 'includeRelation', id: 'dependency', viewId: 'target' }), model);
	assert.deepEqual(applyVisualEdit(model, { kind: 'exclude', target: 'relation', id: 'dependency', viewId: 'target' }), before);
	const network = { ...before.views[1], kind: 'network' };
	assert.deepEqual(getAvailableDiagramRelations(before, network), []);
	for (const kind of ['sequence', 'state']) {
		assert.deepEqual(getAvailableDiagramRelations(before, { ...before.views[1], kind }), []);
	}
	assert.deepEqual(getAvailableDiagramRelations(before, { ...before.views[1], interactionId: 'derived' }), []);
});
