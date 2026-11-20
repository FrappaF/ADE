import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../scripts/source-loader.mjs';
const { checkoutModel } = await import('../../src/vs/workbench/contrib/ade/common/checkoutModel.ts');
const { readSemanticModel } = await import('../../src/vs/workbench/contrib/ade/common/modelValidation.ts');

const { applyVisualEdit } = await import('../../src/vs/workbench/contrib/ade/common/visualEditing.ts');
const { getStateDiagram } = await import('../../src/vs/workbench/contrib/ade/common/stateDiagram.ts');
const create = () => applyVisualEdit(checkoutModel, { kind: 'stateDiagram', id: 'lifecycle', name: 'Ordine · Stati', featureId: 'purchase', resourceId: 'order' });
const view = model => model.views.find(view => view.id === 'lifecycle');

test('resource lifecycle includes shared states and transitions once, preserving existing positions and other views', () => {
	let model = create();
	model = applyVisualEdit(model, { kind: 'stateTransition', viewId: 'lifecycle', id: 'order-confirmed' });
	model = applyVisualEdit(model, { kind: 'position', viewId: 'lifecycle', id: 'pending', x: -240, y: 360 });
	for (let index = 0; index < 2; index++) { model = applyVisualEdit(model, { kind: 'stateLifecycle', viewId: 'lifecycle', resourceId: 'order' }); }
	const group = getStateDiagram(model, view(model)).groups[0];
	assert.deepEqual({ states: group.states.map(state => state.id), transitions: group.transitions.map(relation => relation.id), semantics: model.semantics, others: model.views.slice(0, -1), position: view(model).nodes.find(node => node.elementId === 'pending') },
		{ states: ['pending', 'confirmed', 'declined'], transitions: ['order-confirmed', 'order-declined'], semantics: checkoutModel.semantics, others: create().views.slice(0, -1), position: { elementId: 'pending', x: -240, y: 360 } });
});

test('new states and self transitions belong to the chosen resource and round-trip without format changes', () => {
	let model = applyVisualEdit(create(), { kind: 'element', id: 'cancelled', elementKind: 'state', parentId: 'order', name: 'Annullato', viewId: 'lifecycle' });
	model = applyVisualEdit(model, { kind: 'relation', id: 'retry', viewId: 'lifecycle', relationKind: 'transition', from: 'cancelled', to: 'cancelled', name: 'Riprova', condition: 'Richiesta valida' });
	model = readSemanticModel(JSON.parse(JSON.stringify(model)));
	const group = getStateDiagram(model, view(model)).groups[0];
	assert.deepEqual({ version: model.version, states: group.states.map(state => [state.id, state.parentId]), transition: group.transitions[0] },
		{ version: 3, states: [['cancelled', 'order']], transition: { id: 'retry', kind: 'transition', from: 'cancelled', to: 'cancelled', name: 'Riprova', condition: 'Richiesta valida' } });
	model = applyVisualEdit(model, { kind: 'resource', id: 'shipment', name: 'Spedizione', parentId: 'purchase' });
	model = applyVisualEdit(model, { kind: 'stateDiagram', id: 'shipment-states', name: 'Spedizione · Stati', featureId: 'purchase', resourceId: 'shipment' });
	assert.equal(model.views.at(-1).nodes[0].elementId, 'shipment');
});

test('cross-resource, unsupported and invalid transition edits are rejected atomically', () => {
	let model = create();
	model.semantics.elements.push({ id: 'cart-empty', name: 'Vuoto', kind: 'state', parentId: 'cart' });
	model = readSemanticModel(model);
	const before = structuredClone(model);
	for (const edit of [
		{ kind: 'include', viewId: 'lifecycle', id: 'cart-empty' },
		{ kind: 'stateDiagram', id: 'bad', name: 'Bad', featureId: 'purchase', resourceId: 'customer' },
		{ kind: 'stateTransition', viewId: 'lifecycle', id: 'customer-checkout' },
		{ kind: 'stateLifecycle', viewId: 'lifecycle', resourceId: 'cart' },
		{ kind: 'element', id: 'unscoped', elementKind: 'state', name: 'Unscoped', viewId: 'lifecycle' },
		{ kind: 'relation', id: 'bad-transition', viewId: 'lifecycle', relationKind: 'dependency', from: 'order', to: 'order', name: '' }
	]) { assert.throws(() => applyVisualEdit(model, edit)); }
	assert.deepEqual(model, before);
});

test('event and guard edits share semantic identity while removing references preserves the system', () => {
	let model = applyVisualEdit(create(), { kind: 'stateLifecycle', viewId: 'lifecycle', resourceId: 'order' });
	const others = structuredClone(model.views.slice(0, -1));
	model = applyVisualEdit(model, { kind: 'renameRelation', id: 'order-confirmed', name: 'Pagamento autorizzato' });
	model = applyVisualEdit(model, { kind: 'condition', id: 'order-confirmed', condition: 'Importo valido' });
	const shared = structuredClone(model.semantics);
	model = applyVisualEdit(model, { kind: 'exclude', viewId: 'lifecycle', id: 'order-confirmed', target: 'relation' });
	model = applyVisualEdit(model, { kind: 'exclude', viewId: 'lifecycle', id: 'pending', target: 'element' });
	assert.deepEqual({ semantics: model.semantics, others: model.views.slice(0, -1), shown: view(model).relationIds, stateCount: getStateDiagram(model, view(model)).groups[0].allStates.length },
		{ semantics: shared, others, shown: [], stateCount: 3 });
});

test('historical state diagrams retain context and report states without resource ownership', () => {
	const model = structuredClone(checkoutModel);
	const historical = model.views[1];
	model.semantics.elements.push({ id: 'unscoped', kind: 'state', name: 'Senza risorsa' });
	historical.nodes.push({ elementId: 'unscoped', x: 0, y: 360 });
	const before = structuredClone(model);
	const state = getStateDiagram(readSemanticModel(model), historical);
	assert.deepEqual({ model, resources: state.groups.map(group => group.resource.id), context: state.contextElements.map(element => element.id), unscoped: state.unscopedStates.map(element => element.id) },
		{ model: before, resources: ['order'], context: ['payment'], unscoped: ['unscoped'] });
});
