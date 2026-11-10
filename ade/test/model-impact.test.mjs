/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../scripts/source-loader.mjs';
const { checkoutModel } = await import('../../src/vs/workbench/contrib/ade/common/checkoutModel.ts');
const { readSemanticModel } = await import('../../src/vs/workbench/contrib/ade/common/modelValidation.ts');

const { getElementEvidence, getModelImpact } = await import('../../src/vs/workbench/contrib/ade/common/modelImpact.ts');
const { applyVisualEdit } = await import('../../src/vs/workbench/contrib/ade/common/visualEditing.ts');
const { SemanticNavigationHistory } = await import('../../src/vs/workbench/contrib/ade/common/visualNavigation.ts');

test('impact follows reverse declared references with shortest reasons and keeps outgoing resources separate', () => {
	const before = structuredClone(checkoutModel);
	const impact = getModelImpact(checkoutModel, 'payment-contract');
	assert.deepEqual({ scope: impact.scope.map(element => element.id), dependents: impact.dependents.map(entry => [entry.element.id, entry.distance, entry.via.kind]), owners: impact.owners.map(element => element.id), views: impact.views.map(view => view.id), model: checkoutModel },
		{ scope: ['payment-contract'], dependents: [['payment', 1, 'relationship'], ['gateway', 1, 'relationship'], ['checkout-controller', 2, 'relationship'], ['checkout', 3, 'relationship'], ['customer', 4, 'relationship']], owners: ['purchase'], views: ['purchase-structure', 'purchase-outcome', 'cancellation-structure'], model: before });
});

test('containment includes resource states and authorization references propagate to their declaring elements', () => {
	const resource = getModelImpact(checkoutModel, 'order');
	const actor = getModelImpact(checkoutModel, 'customer');
	assert.deepEqual({ resourceScope: resource.scope.map(element => element.id), actorDependents: actor.dependents.map(entry => [entry.element.id, entry.distance]), authorization: actor.dependents[0].via },
		{ resourceScope: ['order', 'pending', 'confirmed', 'declined'], actorDependents: [['checkout-controller', 1], ['checkout', 2]], authorization: { kind: 'authorization', sourceId: 'checkout-controller', targetId: 'customer', capability: 'purchase:own-cart' } });
});

test('cycles and homonyms do not duplicate scope and unclassified links are reported without propagation', () => {
	const model = structuredClone(checkoutModel);
	model.semantics.elements.push({ id: 'other-contract', kind: 'contract', name: 'Pagamento' });
	model.semantics.relations.push({ id: 'cycle', kind: 'dependency', from: 'payment-contract', to: 'customer', name: 'Cycle' },
		{ id: 'uncertain', kind: 'dependency', from: 'cart', to: 'payment-contract', name: 'Legacy', classification: 'legacy-unclassified' });
	const impact = getModelImpact(readSemanticModel(model), 'payment-contract');
	assert.deepEqual({ dependents: impact.dependents.map(entry => entry.element.id), uncertain: impact.unclassified.map(relation => relation.id) },
		{ dependents: ['payment', 'gateway', 'checkout-controller', 'checkout', 'customer'], uncertain: ['uncertain'] });
	assert.throws(() => getModelImpact(model, 'missing'));
});

test('layout and renames preserve review identities, while unrelated evidence is excluded', () => {
	let model = structuredClone(checkoutModel);
	model.codeMappings.push({ id: 'mapping', elementId: 'checkout-controller', file: 'fixture.ts', symbol: 'confirm', revision: 'fixture-rev' },
		{ id: 'unrelated', elementId: 'cart', file: 'other.ts', symbol: 'cart', revision: 'fixture-rev' });
	model = applyVisualEdit(model, { kind: 'position', viewId: 'purchase-structure', id: 'payment', x: -400, y: 800 });
	model = applyVisualEdit(model, { kind: 'rename', id: 'payment', target: 'element', name: 'Pagamento aggiornato' });
	const impact = getModelImpact(model, 'payment-contract');
	assert.deepEqual(impact.evidence.flatMap(entry => entry.mappings.map(mapping => mapping.id)), ['mapping']);
	assert.deepEqual(impact.dependents.map(entry => entry.element.id), getModelImpact(checkoutModel, 'payment-contract').dependents.map(entry => entry.element.id));
});

test('evidence retains every outcome and revision, including mixed records and criteria without records', () => {
	const model = structuredClone(checkoutModel);
	const controller = model.semantics.elements.find(element => element.id === 'checkout-controller');
	controller.behavior.acceptanceCriteria.push({ id: 'no-records', given: 'Fixture', when: 'Reviewed', then: 'No execution claim' });
	model.codeMappings.push({ id: 'fixture-mapping', elementId: controller.id, file: 'fixture.ts', symbol: 'confirm', revision: 'fixture-rev-1' });
	model.verifications.push(
		{ id: 'failed', elementId: controller.id, criterionId: 'purchase-success', outcome: 'failed', evidence: 'fixture-failed', revision: 'fixture-rev-2' },
		{ id: 'passed', elementId: controller.id, criterionId: 'purchase-success', outcome: 'passed', evidence: 'fixture-passed', revision: 'fixture-rev-1' },
		{ id: 'unknown', elementId: controller.id, criterionId: 'purchase-declined', outcome: 'unknown', evidence: 'fixture-unknown', revision: 'fixture-rev-3' });
	const before = structuredClone(model);
	const evidence = getElementEvidence(readSemanticModel(model), controller.id);
	assert.deepEqual({ outcomes: evidence.outcomes, mixed: evidence.criteriaWithMixedOutcomes.map(criterion => criterion.id), missing: evidence.criteriaWithoutRecords.map(criterion => criterion.id), revisions: evidence.verifications.map(record => record.revision), model },
		{ outcomes: { passed: 1, failed: 1, unknown: 1 }, mixed: ['purchase-success'], missing: ['no-records'], revisions: ['fixture-rev-2', 'fixture-rev-1', 'fixture-rev-3'], model: before });
	assert.deepEqual(getElementEvidence(checkoutModel, 'payment-contract').outcomes, { passed: 0, failed: 0, unknown: 0 });
	assert.throws(() => getElementEvidence(model, 'missing'));
});

test('impact participates in history independently of details and skips deleted report identities', () => {
	const history = new SemanticNavigationHistory();
	history.reset({ section: 'diagram', viewId: 'purchase-structure', elementId: 'payment' });
	history.push({ section: 'impact', elementId: 'payment-contract' });
	history.push({ section: 'element', elementId: 'payment-contract' });
	assert.deepEqual(history.go(checkoutModel, -1), { section: 'impact', elementId: 'payment-contract' });
	assert.deepEqual(history.go(checkoutModel, 1), { section: 'element', elementId: 'payment-contract' });
	const removed = applyVisualEdit(checkoutModel, { kind: 'deleteElement', id: 'payment-contract' });
	assert.deepEqual(history.go(removed, -1), { section: 'diagram', viewId: 'purchase-structure', elementId: 'payment' });
});
