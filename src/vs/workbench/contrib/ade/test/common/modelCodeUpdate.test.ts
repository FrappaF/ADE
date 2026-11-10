/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { checkoutModel } from '../../common/checkoutModel.js';
import { codeUpdateContent, savedModelChanges } from '../../common/modelCodeUpdate.js';

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
});
