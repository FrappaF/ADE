import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../scripts/source-loader.mjs';
const { checkoutModel } = await import('../../src/vs/workbench/contrib/ade/common/checkoutModel.ts');
const { readSemanticModel } = await import('../../src/vs/workbench/contrib/ade/common/modelValidation.ts');

const { applyVisualEdit, upgradeVisualModel } = await import('../../src/vs/workbench/contrib/ade/common/visualEditing.ts');

const contract = () => ({
	inputs: [{ name: 'amount', type: 'Money', required: true }],
	outputs: [{ name: 'receipt', type: 'Receipt', required: false }],
	preconditions: ['Amount is positive'], postconditions: ['At most one payment is authorized'],
	errors: [{ code: 'payment-declined', description: 'No order is confirmed' }],
	permissions: [], acceptanceCriteria: []
});

test('a contract can be created on an unplaced identity and shared between diagrams without changing layout', () => {
	const original = structuredClone(checkoutModel);
	const behavior = contract();
	let model = applyVisualEdit(checkoutModel, { kind: 'behavior', id: 'payment-contract', behavior });
	model = readSemanticModel(JSON.parse(JSON.stringify(model)));
	const unplaced = structuredClone(model);
	model = applyVisualEdit(model, { kind: 'include', id: 'payment-contract', viewId: 'purchase-structure' });
	model = applyVisualEdit(model, { kind: 'include', id: 'payment-contract', viewId: 'purchase-outcome' });
	const views = structuredClone(model.views);
	behavior.outputs[0].required = true;
	model = applyVisualEdit(model, { kind: 'behavior', id: 'payment-contract', behavior });
	assert.deepEqual({
		original: checkoutModel, unplaced: unplaced.views, views: model.views,
		contracts: model.semantics.elements.filter(element => element.id === 'payment-contract')
	}, {
		original, unplaced: upgradeVisualModel(checkoutModel).views, views,
		contracts: [{ ...original.semantics.elements.find(element => element.id === 'payment-contract'), behavior }]
	});
});

test('contract edits detach caller data and preserve permissions, criteria, mappings and verification evidence', () => {
	const model = upgradeVisualModel(checkoutModel);
	model.codeMappings.push({ id: 'mapping', elementId: 'checkout-controller', file: 'checkout.ts', symbol: 'confirm', revision: 'abc' });
	model.verifications.push({ id: 'verification', elementId: 'checkout-controller', criterionId: 'purchase-success', outcome: 'passed', evidence: 'result.json', revision: 'abc' });
	const behavior = structuredClone(model.semantics.elements.find(element => element.id === 'checkout-controller').behavior);
	behavior.inputs.push({ name: 'currency', type: 'Currency', required: false });
	const next = applyVisualEdit(model, { kind: 'behavior', id: 'checkout-controller', behavior });
	behavior.inputs[1].name = 'mutated-by-caller';
	assert.deepEqual({
		behavior: next.semantics.elements.find(element => element.id === 'checkout-controller').behavior,
		mappings: next.codeMappings, verifications: next.verifications, views: next.views
	}, {
		behavior: { ...model.semantics.elements.find(element => element.id === 'checkout-controller').behavior, inputs: [{ name: 'cartId', type: 'CartId', required: true }, { name: 'currency', type: 'Currency', required: false }] },
		mappings: model.codeMappings, verifications: model.verifications, views: model.views
	});
});

test('malformed and duplicate contract entries are rejected without mutating the source', () => {
	const before = structuredClone(checkoutModel);
	for (const mutate of [
		behavior => behavior.inputs.push({ ...behavior.inputs[0] }),
		behavior => behavior.outputs.push({ ...behavior.outputs[0] }),
		behavior => behavior.errors.push({ ...behavior.errors[0] }),
		behavior => { behavior.inputs[0].type = ' '; },
		behavior => { behavior.postconditions = [' ']; },
		behavior => { behavior.errors[0].code = 'not a code'; }
	]) {
		const behavior = contract();
		mutate(behavior);
		assert.throws(() => applyVisualEdit(checkoutModel, { kind: 'behavior', id: 'payment-contract', behavior }));
	}
	assert.throws(() => applyVisualEdit(checkoutModel, { kind: 'behavior', id: 'missing', behavior: contract() }));
	assert.deepEqual(checkoutModel, before);
});

test('referenced errors cannot be removed until the relationship is cleared or reassigned', () => {
	const before = structuredClone(checkoutModel);
	const behavior = structuredClone(checkoutModel.semantics.elements.find(element => element.id === 'checkout-controller').behavior);
	behavior.errors = [];
	assert.throws(() => applyVisualEdit(checkoutModel, { kind: 'behavior', id: 'checkout-controller', behavior }));
	assert.throws(() => applyVisualEdit(checkoutModel, { kind: 'relationError', id: 'show-declined', errorCode: 'missing' }));
	assert.throws(() => applyVisualEdit(checkoutModel, { kind: 'relationError', id: 'missing', errorCode: 'payment-declined' }));
	const cleared = applyVisualEdit(checkoutModel, { kind: 'relationError', id: 'show-declined' });
	const next = applyVisualEdit(cleared, { kind: 'behavior', id: 'checkout-controller', behavior });
	assert.deepEqual({ original: checkoutModel, errors: next.semantics.elements.find(element => element.id === 'checkout-controller').behavior.errors, relation: next.semantics.relations.find(relation => relation.id === 'show-declined') },
		{ original: before, errors: [], relation: { id: 'show-declined', kind: 'invocation', from: 'checkout-controller', to: 'checkout', name: 'mostra errore' } });
});
