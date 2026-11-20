/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { checkoutModel } from '../../common/checkoutModel.js';
import { codeUpdateContent, createModelCodeUpdateContext, describeModelCodeChanges, mergeModelCodeChanges, savedModelChanges } from '../../common/modelCodeUpdate.js';
import { emptyFoundation } from '../../common/modelFoundation.js';
import { type SemanticModelV4 } from '../../common/modelTypes.js';

suite('A.D.E saved model implementation context', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	test('layout metadata is ignored while authored view intent remains meaningful', () => {
		const before = structuredClone(checkoutModel), after = structuredClone(before);
		before.views[0].spec = { revision: '1', intent: 'Order returns', projectionRevision: '1', layoutRevision: '1', manualIds: [] };
		after.views[0].spec = { ...before.views[0].spec, layoutRevision: '2', manualIds: [after.views[0].nodes[0].elementId] };
		after.views[0].nodes[0].x += 100;
		assert.deepStrictEqual([savedModelChanges(before, after), codeUpdateContent(before)], [[], codeUpdateContent(after)]);
		after.views[0].spec.intent = 'Order returns with administrator approval';
		assert.deepStrictEqual(savedModelChanges(before, after).map(change => [change.collection, change.id]), [['views', before.views[0].id]]);
	});
	test('the delta retains removed definitions and new and changed objects without mutating either model', () => {
		const before = structuredClone(checkoutModel), after = structuredClone(before);
		const removed = after.semantics.relations.pop()!;
		after.semantics.elements[0].description = 'A revised business rule';
		after.semantics.elements.push({ id: 'return-request', kind: 'entity', name: 'ReturnRequest' });
		const changes = savedModelChanges(before, after);
		assert.deepStrictEqual(changes.find(change => change.id === removed.id), { collection: 'relations', id: removed.id, before: removed, after: null });
		assert.deepStrictEqual(changes.find(change => change.id === 'return-request'), { collection: 'elements', id: 'return-request', before: null, after: { id: 'return-request', kind: 'entity', name: 'ReturnRequest' } });
		assert.equal(changes.some(change => change.id === after.semantics.elements[0].id && change.before && change.after), true);
		assert.deepStrictEqual(before, checkoutModel);
	});

	test('foundation changes include only the edited definition with relevant views and source hints', () => {
		const before: SemanticModelV4 = { ...structuredClone(checkoutModel), version: 5, foundation: emptyFoundation() };
		const checkout = { id: 'call-checkout', from: 'checkout', to: 'checkout-controller', name: 'Submit checkout', evidenceIds: ['checkout-source'] };
		const cancellation = { id: 'call-cancel', from: 'customer', to: 'cancel-controller', name: 'Unrelated cancellation', evidenceIds: ['cancel-source'] };
		const source = (id: string, file: string) => ({ id, file, start: 0, end: 20, revision: 'example', encoding: 'utf-16' as const, producer: 'example', producerVersion: '1', nature: 'text' as const, factIds: [] });
		before.foundation.occurrences = [checkout, cancellation];
		before.foundation.evidence = [source('checkout-source', 'checkout.mjs'), source('cancel-source', 'cancel.mjs')];
		before.foundation.interactions = [{ id: 'checkout-scenario', occurrenceIds: [checkout.id], frameIds: [] }];
		before.views[0].interactionId = 'checkout-scenario';
		const after = structuredClone(before);
		after.foundation.occurrences[0].name = 'Submit checkout in cents';
		const changes = savedModelChanges(before, after);
		const context = createModelCodeUpdateContext({ modelUri: 'checkout.ade.json', model: after, changes });
		assert.deepStrictEqual(changes, [{ collection: 'foundation.occurrences', id: checkout.id, before: checkout, after: after.foundation.occurrences[0] }]);
		assert.deepStrictEqual(describeModelCodeChanges(changes), [{ collection: 'foundation.occurrences', id: checkout.id, label: 'Submit checkout in cents', kind: 'modified', fields: ['name'], preview: [{ field: 'name', before: checkout.name, after: 'Submit checkout in cents' }] }]);
		assert.ok(context.affectedViews.some(view => view.id === before.views[0].id));
		assert.deepStrictEqual(context.sourceHints.evidence.map(record => record.file), ['checkout.mjs']);
		assert.ok(!JSON.stringify(context).includes('Unrelated cancellation'));
	});

	test('coalesces successive saves against the original preimage and drops reversions', () => {
		const original = structuredClone(checkoutModel), first = structuredClone(original), second = structuredClone(first);
		first.semantics.elements[0].name = 'First edit';
		first.semantics.elements.push({ kind: 'entity', id: 'temporary', name: 'Temporary' });
		second.semantics.elements[0].name = 'Final name';
		second.semantics.elements[1].name = 'Another edit';
		assert.deepStrictEqual(mergeModelCodeChanges(savedModelChanges(original, first), savedModelChanges(first, second)), savedModelChanges(original, second));
	});
});
