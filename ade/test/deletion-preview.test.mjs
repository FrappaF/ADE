import '../scripts/source-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { checkoutModel } = await import('../../src/vs/workbench/contrib/ade/common/checkoutModel.ts');
const { emptyFoundation } = await import('../../src/vs/workbench/contrib/ade/common/modelFoundation.ts');
const { getDeletionPreview } = await import('../../src/vs/workbench/contrib/ade/common/deletionPreview.ts');
const { applyVisualEdit, upgradeVisualModel } = await import('../../src/vs/workbench/contrib/ade/common/visualEditing.ts');

test('preview distinguishes deleted feature diagrams from shared diagrams that are updated, without changing the model', () => {
	let model = upgradeVisualModel(checkoutModel);
	model = applyVisualEdit(model, { kind: 'include', viewId: 'cart-structure', id: 'payment' });
	model.codeMappings.push({ id: 'mapping', elementId: 'checkout-controller', file: 'src/checkout.ts', symbol: 'confirm', revision: 'abc' });
	const original = JSON.stringify(model);
	const preview = getDeletionPreview(model, 'purchase');
	const deleted = preview.changes.filter(change => !change.after);
	assert.deepEqual({ deletedViews: deleted.filter(change => change.collection === 'views').map(change => change.id), updatedViews: preview.changes.filter(change => change.collection === 'views' && change.after).map(change => change.id), mappings: deleted.filter(change => change.collection === 'codeMappings').map(change => change.id), original: JSON.stringify(model) }, { deletedViews: ['purchase-structure', 'purchase-outcome'], updatedViews: ['cart-structure'], mappings: ['mapping'], original });
});

test('authorization cleanup on a surviving element is included in the detail report', () => {
	const preview = getDeletionPreview(checkoutModel, 'customer');
	const controller = preview.changes.find(change => change.collection === 'elements' && change.id === 'checkout-controller');
	assert.deepEqual({ authorizations: preview.impact.permissions, deleted: !preview.changes.find(change => change.id === 'customer').after, updatedController: !!controller?.after }, { authorizations: 1, deleted: true, updatedController: true });
});

test('a diagram that loses only a relation is still counted and reported as updated', () => {
	const relation = { id: 'calls', kind: 'dependency', from: 'customer', to: 'controller', name: 'Calls' };
	const model = { version: 4, id: 'system', name: 'System', semantics: { elements: [{ id: 'customer', name: 'Customer', kind: 'actor' }, { id: 'controller', name: 'Controller', kind: 'controller' }], relations: [relation] }, views: [], codeMappings: [], verifications: [], foundation: emptyFoundation() };
	model.views.push({ id: 'relation-only', kind: 'structure', name: 'Relationship reference', nodes: [], relationIds: [relation.id] });
	const preview = getDeletionPreview(model, 'customer');
	assert.deepEqual({ counted: preview.impact.views.includes('relation-only'), updated: !!preview.changes.find(change => change.id === 'relation-only' && change.collection === 'views')?.after }, { counted: true, updated: true });
});

test('preview exposes foundation ownership and membership cleanup alongside the deleted identities', () => {
	const model = { version: 4, id: 'system', name: 'System', semantics: { elements: [{ id: 'feature', name: 'Returns', kind: 'feature' }, { id: 'resource', name: 'Order', kind: 'resource' }, { id: 'child', name: 'Order item', kind: 'resource' }], relations: [] }, views: [], codeMappings: [], verifications: [], foundation: { ...emptyFoundation(), ownership: [{ id: 'ownership', elementId: 'child', ownerId: 'resource', role: 'architecture' }], memberships: [{ id: 'membership', elementId: 'child', featureId: 'feature' }] } };
	const preview = getDeletionPreview(model, 'resource');
	assert.deepEqual(preview.changes.map(change => [change.collection, change.id, !!change.after]), [['elements', 'resource', false], ['elements', 'child', false], ['ownership', 'ownership', false], ['memberships', 'membership', false]]);
});

test('retained task references to deleted identities are disclosed for correction', () => {
	const model = { version: 4, id: 'system', name: 'System', semantics: { elements: [{ id: 'feature', name: 'Returns', kind: 'feature' }], relations: [] }, views: [], codeMappings: [], verifications: [], foundation: { ...emptyFoundation(), tasks: [{ id: 'task', target: { kind: 'element', id: 'feature' }, revision: '1', text: 'Return behavior', clarifications: [], history: [] }] } };
	const preview = getDeletionPreview(model, 'feature');
	assert.deepEqual(preview.referencesToReview.map(diagnostic => [diagnostic.path, diagnostic.args]), [['/foundation/tasks/task/target', ['feature']]]);
});
