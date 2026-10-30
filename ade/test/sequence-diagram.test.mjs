/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import './source-loader.mjs';
import { checkoutModel } from '../../src/vs/workbench/contrib/ade/common/checkoutModel.ts';
import { readSemanticModel } from '../../src/vs/workbench/contrib/ade/common/semanticModel.ts';

const { applyVisualEdit } = await import('../../src/vs/workbench/contrib/ade/common/visualEditing.ts');
const { getSequenceDiagram } = await import('../../src/vs/workbench/contrib/ade/common/sequenceDiagram.ts');
const create = () => applyVisualEdit(checkoutModel, { kind: 'diagram', id: 'sequence', name: 'Acquisto · Sequenza', viewKind: 'sequence', featureId: 'purchase' });
const diagram = model => model.views.find(view => view.id === 'sequence');

test('existing interactions include their endpoints once and follow view order rather than global relation order', () => {
	let model = create();
	for (const id of ['confirm-order', 'checkout-confirm', 'confirm-cart', 'confirm-order']) {
		model = applyVisualEdit(model, { kind: 'sequenceMessage', viewId: 'sequence', id });
	}
	const sequence = getSequenceDiagram(model, diagram(model));
	assert.deepEqual({ participants: sequence.participants.map(element => element.id), messages: sequence.messages.map(relation => relation.id), semantics: model.semantics, others: model.views.slice(0, -1) },
		{ participants: ['checkout-controller', 'order', 'checkout', 'cart'], messages: ['confirm-order', 'checkout-confirm', 'confirm-cart'], semantics: checkoutModel.semantics, others: create().views.slice(0, -1) });
});

test('participant and message order survives serialization and stays local to the sequence', () => {
	let model = create();
	for (const id of ['checkout-confirm', 'confirm-order']) { model = applyVisualEdit(model, { kind: 'sequenceMessage', viewId: 'sequence', id }); }
	const before = structuredClone(model);
	model = applyVisualEdit(model, { kind: 'sequenceOrder', viewId: 'sequence', target: 'message', id: 'confirm-order', direction: -1 });
	model = applyVisualEdit(model, { kind: 'sequenceOrder', viewId: 'sequence', target: 'participant', id: 'checkout', direction: 1 });
	model = readSemanticModel(JSON.parse(JSON.stringify(model)));
	assert.deepEqual({ semantics: model.semantics, others: model.views.slice(0, -1), nodes: diagram(model).nodes, messages: diagram(model).relationIds },
		{ semantics: before.semantics, others: before.views.slice(0, -1), nodes: [diagram(before).nodes[1], diagram(before).nodes[0], diagram(before).nodes[2]], messages: ['confirm-order', 'checkout-confirm'] });
	assert.deepEqual(applyVisualEdit(model, { kind: 'sequenceOrder', viewId: 'sequence', target: 'message', id: 'confirm-order', direction: -1 }), model);
});

test('removing a participant removes attached occurrences while keeping all shared identities and other views', () => {
	let model = create();
	for (const id of ['checkout-confirm', 'confirm-order', 'customer-checkout']) { model = applyVisualEdit(model, { kind: 'sequenceMessage', viewId: 'sequence', id }); }
	const before = structuredClone(model);
	model = applyVisualEdit(model, { kind: 'sequenceRemove', viewId: 'sequence', target: 'message', id: 'confirm-order' });
	model = applyVisualEdit(model, { kind: 'sequenceRemove', viewId: 'sequence', target: 'participant', id: 'checkout-controller' });
	assert.deepEqual({ semantics: model.semantics, others: model.views.slice(0, -1), participants: diagram(model).nodes.map(node => node.elementId), messages: diagram(model).relationIds },
		{ semantics: before.semantics, others: before.views.slice(0, -1), participants: ['checkout', 'order', 'customer'], messages: ['customer-checkout'] });
});

test('unsupported legacy relationships are reported, and new unsupported or missing messages are rejected atomically', () => {
	const model = create();
	const before = structuredClone(model);
	for (const id of ['payment-realization', 'order-declined', 'missing']) {
		assert.throws(() => applyVisualEdit(model, { kind: 'sequenceMessage', viewId: 'sequence', id }));
	}
	assert.throws(() => applyVisualEdit(model, { kind: 'relation', viewId: 'sequence', id: 'dependency', from: 'customer', to: 'order', relationKind: 'dependency', name: 'Not a message' }));
	assert.throws(() => applyVisualEdit(model, { kind: 'sequenceMessage', viewId: 'purchase-structure', id: 'confirm-order' }));
	assert.throws(() => applyVisualEdit(model, { kind: 'sequenceOrder', viewId: 'sequence', id: 'missing', target: 'message', direction: 1 }));
	const legacy = readSemanticModel({ ...structuredClone(checkoutModel), views: [{ ...structuredClone(checkoutModel.views[1]), kind: 'sequence' }] });
	assert.deepEqual({ model, unsupported: getSequenceDiagram(legacy, legacy.views[0]).unsupported.map(relation => relation.id) }, { model: before, unsupported: ['order-confirmed', 'order-declined'] });
	let mixed = create();
	for (const id of ['checkout-confirm', 'confirm-order']) { mixed = applyVisualEdit(mixed, { kind: 'sequenceMessage', viewId: 'sequence', id }); }
	diagram(mixed).nodes.push({ elementId: 'purchase', x: 0, y: 0 });
	diagram(mixed).relationIds.splice(1, 0, 'confirm-feature');
	mixed = applyVisualEdit(readSemanticModel(mixed), { kind: 'sequenceOrder', viewId: 'sequence', id: 'confirm-order', target: 'message', direction: -1 });
	assert.deepEqual(diagram(mixed).relationIds, ['confirm-order', 'confirm-feature', 'checkout-confirm']);
});

test('self messages and shared condition edits retain one semantic relationship and expose current contracts', () => {
	let model = applyVisualEdit(create(), { kind: 'include', viewId: 'sequence', id: 'checkout-controller' });
	model = applyVisualEdit(model, { kind: 'relation', viewId: 'sequence', id: 'self', from: 'checkout-controller', to: 'checkout-controller', relationKind: 'invocation', name: 'Validate cart' });
	model = applyVisualEdit(model, { kind: 'condition', id: 'self', condition: 'Cart is valid' });
	const sequence = getSequenceDiagram(model, diagram(model));
	assert.deepEqual({ participants: sequence.participants.map(element => element.id), messages: sequence.messages, behavior: sequence.participants[0].behavior },
		{ participants: ['checkout-controller'], messages: [{ id: 'self', kind: 'invocation', from: 'checkout-controller', to: 'checkout-controller', name: 'Validate cart', condition: 'Cart is valid' }], behavior: checkoutModel.semantics.elements.find(element => element.id === 'checkout-controller').behavior });
});
