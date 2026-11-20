import '../scripts/source-loader.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
const { checkoutModel } = await import('../../src/vs/workbench/contrib/ade/common/checkoutModel.ts');
const { getDiagramGroups, getFeatureViews, getElementPath, normalizeDiagramContext, resolveElementLocation, SemanticNavigationHistory } = await import('../../src/vs/workbench/contrib/ade/common/visualNavigation.ts');

test('native navigation groups diagrams by semantic feature with shared resources in both contexts', () => {
	assert.deepEqual(getDiagramGroups(checkoutModel).map(group => ({
		featureId: group.featureId, name: group.name, views: group.views.map(view => view.id)
	})), [
		{ featureId: undefined, name: 'Acquisto', views: [] },
		{ featureId: 'purchase', name: 'Conferma acquisto', views: ['purchase-structure', 'purchase-outcome'] },
		{ featureId: 'cart-management', name: 'Gestione carrello', views: ['cart-structure'] },
		{ featureId: 'cancellation', name: 'Annullamento acquisto', views: ['cancellation-structure'] }
	]);
});

test('feature references follow descendants and retain canonical ownership of shared diagrams', () => {
	const model = structuredClone(checkoutModel);
	const cancellation = model.semantics.elements.find(element => element.id === 'cancellation');
	model.semantics.elements.push({ id: 'nested', kind: 'action', name: 'Nested', parentId: 'cancel-controller' });
	model.views.push({ id: 'shared', name: 'Shared', kind: 'structure', featureId: 'purchase', nodes: [
		{ elementId: 'nested', x: 0, y: 0 }, { elementId: 'payment', x: 100, y: 0 }
	], relationIds: [] }, { id: 'empty-cancel', name: 'Empty', kind: 'structure', featureId: 'cancellation', nodes: [], relationIds: [] });
	const before = JSON.stringify(model);
	assert.deepEqual({ references: getFeatureViews(model, cancellation).map(view => view.id), owner: getDiagramGroups(model).find(group => group.views.some(view => view.id === 'shared')).featureId },
		{ references: ['cancellation-structure', 'shared', 'empty-cancel'], owner: 'purchase' });
	assert.equal(JSON.stringify(model), before);
});

test('feature references ignore geometry and return no views for an unplaced feature', () => {
	const model = structuredClone(checkoutModel);
	const feature = { id: 'empty-feature', name: 'Empty', kind: 'feature' };
	model.semantics.elements.push(feature);
	const purchase = model.semantics.elements.find(element => element.id === 'purchase');
	const before = getFeatureViews(model, purchase).map(view => view.id);
	for (const view of model.views) { for (const node of view.nodes) { node.x = -800; node.y = 1200; } }
	assert.deepEqual([getFeatureViews(model, purchase).map(view => view.id), getFeatureViews(model, feature)], [before, []]);
});

test('unowned and cross-feature diagrams belong to the system and survive renaming and layout changes', () => {
	const model = structuredClone(checkoutModel);
	model.views.push({ id: 'shared', name: 'Shared', kind: 'structure', nodes: [
		{ elementId: 'payment', x: 0, y: 0 }, { elementId: 'review-cart', x: 100, y: 0 }
	], relationIds: [] }, { id: 'resources', name: 'Resources', kind: 'structure', nodes: [
		{ elementId: 'cart', x: -200, y: 200 }
	], relationIds: [] }, { id: 'empty', name: 'Empty', kind: 'structure', nodes: [], relationIds: [] });
	const before = getDiagramGroups(model).map(group => group.views.map(view => view.id));
	model.semantics.elements.find(element => element.id === 'purchase').name = 'Renamed';
	model.views[0].nodes[0].x = -500;
	assert.deepEqual(getDiagramGroups(model).map(group => group.views.map(view => view.id)), before);
	assert.deepEqual(before[0], ['shared', 'resources', 'empty']);
});

test('selections restore independently per diagram, discarded identities are repaired without mutating saved state', () => {
	const saved = { viewId: 'purchase-outcome', selections: {
		'purchase-structure': 'payment', 'purchase-outcome': 'declined', 'cart-structure': 'missing', deleted: 'old'
	} };
	const normalized = normalizeDiagramContext(checkoutModel, saved);
	assert.deepEqual(normalized, { viewId: 'purchase-outcome', selections: {
		'purchase-structure': 'payment', 'purchase-outcome': 'declined', 'cart-structure': 'review-cart', 'cancellation-structure': 'customer'
	} });
	assert.equal(saved.selections.deleted, 'old');
	const model = structuredClone(checkoutModel);
	model.views = model.views.filter(view => view.id !== 'purchase-outcome');
	assert.deepEqual(normalizeDiagramContext(model, normalized), { viewId: 'purchase-structure', selections: {
		'purchase-structure': 'payment', 'cart-structure': 'review-cart', 'cancellation-structure': 'customer'
	} });
});

test('empty documents and empty diagrams have explicit empty selection', () => {
	const model = structuredClone(checkoutModel);
	model.views = [];
	assert.deepEqual(normalizeDiagramContext(model, { viewId: 'removed', selections: {} }), { viewId: '', selections: {} });
	model.views = [{ id: 'empty', name: 'Empty', kind: 'structure', nodes: [], relationIds: [] }];
	assert.deepEqual(normalizeDiagramContext(model, { viewId: 'removed', selections: {} }), { viewId: 'empty', selections: { empty: '' } });
});

test('semantic destinations preserve a shared identity and expose unplaced contracts', () => {
	assert.deepEqual([
		resolveElementLocation(checkoutModel, 'payment', 'purchase-outcome'),
		resolveElementLocation(checkoutModel, 'payment', 'cart-structure'),
		resolveElementLocation(checkoutModel, 'payment-contract'),
		resolveElementLocation(checkoutModel, 'missing'),
		getElementPath(checkoutModel, 'declined').map(element => element.id),
		getElementPath(checkoutModel, 'checkout-controller').map(element => element.id)
	], [
		{ section: 'diagram', viewId: 'purchase-outcome', elementId: 'payment' },
		{ section: 'diagram', viewId: 'purchase-structure', elementId: 'payment' },
		{ section: 'element', elementId: 'payment-contract' }, undefined,
		['order', 'declined'], ['purchase', 'checkout-controller']
	]);
});

test('history stores identities across renames, skips deleted destinations and truncates forward branches', () => {
	const history = new SemanticNavigationHistory();
	const start = { section: 'diagram', viewId: 'purchase-structure', elementId: 'payment' };
	history.reset(start);
	history.push({ section: 'element', elementId: 'payment-contract' });
	history.push({ section: 'diagram', viewId: 'cart-structure', elementId: 'cart' });
	const model = structuredClone(checkoutModel);
	model.semantics.elements = model.semantics.elements.filter(element => element.id !== 'payment-contract');
	model.views[0].name = 'Renamed';
	assert.deepEqual(history.go(model, -1), start);
	assert.equal(history.canGo(model, 1), true);
	history.push({ section: 'element', elementId: 'purchase' });
	assert.equal(history.canGo(model, 1), false);
});

test('history repairs missing selections and compares locations independently of object key order', () => {
	const history = new SemanticNavigationHistory();
	history.reset({ section: 'home' });
	history.push({ section: 'diagram', viewId: 'purchase-outcome', elementId: 'declined' });
	history.push({ elementId: 'declined', viewId: 'purchase-outcome', section: 'diagram' });
	assert.deepEqual(history.go(checkoutModel, -1), { section: 'home' });
	const model = structuredClone(checkoutModel);
	model.views[1].nodes = model.views[1].nodes.filter(node => node.elementId !== 'declined');
	assert.deepEqual(history.go(model, 1), { section: 'diagram', viewId: 'purchase-outcome', elementId: 'payment' });
});

test('session history is bounded and reset removes destinations from the previous project', () => {
	const history = new SemanticNavigationHistory();
	history.reset({ section: 'home' });
	for (let index = 0; index < 160; index++) { history.push({ section: 'element', elementId: index % 2 ? 'cart' : 'order' }); }
	let steps = 0;
	while (history.go(checkoutModel, -1)) { steps++; }
	assert.equal(steps, 99);
	history.reset({ section: 'home' });
	assert.deepEqual([history.canGo(checkoutModel, -1), history.canGo(checkoutModel, 1)], [false, false]);
});
