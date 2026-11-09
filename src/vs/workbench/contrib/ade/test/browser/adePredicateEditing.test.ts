/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { nodeOrdersFixture } from '../common/nodeOrdersFixture.js';
import { ScriptedDialogs } from './adeBlueprintEditing.test.js';
import { editAdePredicate } from '../../browser/adePredicateEditing.js';
import { applyVisualEdit } from '../../common/visualEditing.js';

suite('A.D.E pure predicate editing', () => {
	test('canceling a detached reset preserves the original authored graph', async () => {
		const model = structuredClone(nodeOrdersFixture); const before = structuredClone(model);
		const dialogs = new ScriptedDialogs(['submitOrder', 'predicate.positive', 'Precondition · Inputs Only', 'Clear Detached Expression', undefined]);
		assert.strictEqual(await editAdePredicate(dialogs, model, 'component.checkout'), undefined); dialogs.assertComplete(); assert.deepStrictEqual(model, before);
	});
	test('editing phase preserves predicate and node identities with an atomic semantic edit', async () => {
		const model = structuredClone(nodeOrdersFixture);
		const dialogs = new ScriptedDialogs(['submitOrder', 'predicate.positive', 'Postcondition · Inputs and Outputs', 'Choose Result and Save', 'positive']);
		const edits = await editAdePredicate(dialogs, model); dialogs.assertComplete(); assert.strictEqual(edits?.length, 1);
		const updated = applyVisualEdit(model, edits![0]); assert.strictEqual(updated.version, 4);
		if (updated.version === 4) { assert.deepStrictEqual(updated.foundation.predicates, [{ ...model.foundation.predicates![0], phase: 'post' }]); }
	});
	test('typed literal choices are native items with validated safe integer values', async () => {
		const dialogs = new ScriptedDialogs(['submitOrder', 'predicate.positive', 'Precondition · Inputs Only', 'Add Typed Literal', 'Quantity', '2', 'Choose Result and Save', 'positive']);
		const edits = await editAdePredicate(dialogs, structuredClone(nodeOrdersFixture)); dialogs.assertComplete();
		assert.strictEqual(edits?.[0].kind, 'predicate'); if (edits?.[0].kind === 'predicate') { const last = edits[0].entry.nodes.at(-1)!; assert.deepStrictEqual({ ...last, id: 'tool-assigned' }, { id: 'tool-assigned', kind: 'literal', typeId: 'type.quantity', value: 2 }); }
	});
	test('the builder rejects a scalar root rather than saving a non-boolean guard', async () => {
		const dialogs = new ScriptedDialogs(['submitOrder', 'predicate.positive', 'Precondition · Inputs Only', 'Choose Result and Save', 'quantity']);
		await assert.rejects(editAdePredicate(dialogs, structuredClone(nodeOrdersFixture)), /boolean result/); dialogs.assertComplete();
	});
});
