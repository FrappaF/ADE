/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ScriptedDialogs } from './adeBlueprintEditing.test.js';
import { interactionFixture } from '../common/interactionFixture.js';
import { editAdeInteraction } from '../../browser/adeInteractionEditing.js';
import { editAdeInteractionCriteria } from '../../browser/adeInteractionCriteria.js';
import { applyVisualEdit } from '../../common/visualEditing.js';
import { interpretModelInteraction, validateModelInteraction } from '../../common/modelInteractions.js';
import { describeAdeDiagram } from '../../browser/adeAccessibleContent.js';

suite('A.D.E executable interaction editing', () => {
	test('canceling inside a child operand leaves the complete hierarchy untouched', async () => {
		const model = structuredClone(interactionFixture), before = structuredClone(model), dialogs = new ScriptedDialogs(['checkout', 'interaction.checkout', 'alt', 'Open Child Steps', 'Else · All Other Outcomes', undefined]);
		assert.strictEqual(await editAdeInteraction(dialogs, model), undefined); dialogs.assertComplete(); assert.deepStrictEqual(model, before);
	});
	test('editing an optional guard retains frame/message identities and saves one atomic command', async () => {
		const model = structuredClone(interactionFixture), dialogs = new ScriptedDialogs(['checkout', 'interaction.checkout', 'opt', 'Edit Policy or Arguments', 'Choose Result and Save', 'reference', 'Validate and Save Interaction']);
		model.foundation.types.push({ id: 'unrelated.draft', name: 'Unrelated Draft', kind: 'record', fields: [{ id: 'unrelated.field', name: 'Unresolved Field', type: '', typeId: 'missing.type', required: true, nullable: { state: 'known', value: false } }] });
		const edits = await editAdeInteraction(dialogs, model); dialogs.assertComplete(); assert.strictEqual(edits?.length, 1);
		const changed = applyVisualEdit(model, edits![0]); assert.strictEqual(changed.version, 4);
		if (changed.version === 4) { assert.deepStrictEqual(changed.foundation.frames, model.foundation.frames); assert.deepStrictEqual(changed.foundation.occurrences, model.foundation.occurrences); assert.notStrictEqual(changed.foundation.interactions.find(entry => entry.id === 'interaction.checkout')!.execution!.revision, '1'); assert.deepStrictEqual(validateModelInteraction(changed, 'interaction.checkout'), []); }
	});
	test('moving an alternative before its result is defined blocks saving and preserves the source model', async () => {
		const model = structuredClone(interactionFixture), before = structuredClone(model), dialogs = new ScriptedDialogs(['checkout', 'interaction.checkout', 'alt', 'Move Earlier', 'Validate and Save Interaction']);
		await assert.rejects(editAdeInteraction(dialogs, model), /referenceScopeOrType/); dialogs.assertComplete(); assert.deepStrictEqual(model, before);
	});
	test('canceling authored independent expectations cannot create an inferred oracle', async () => {
		const criteria = { version: 1 as const, revision: '1', cases: [] }, dialogs = new ScriptedDialogs(['interaction.checkout', undefined]);
		assert.strictEqual(await editAdeInteractionCriteria(dialogs, interactionFixture, criteria), undefined); dialogs.assertComplete(); assert.deepStrictEqual(criteria, { version: 1, revision: '1', cases: [] });
	});
	test('accessible reading exposes semantic operands, ref contract, timeout and required replies', () => {
		const model = structuredClone(interactionFixture), view = { id: 'sequence', name: 'Checkout', kind: 'sequence' as const, nodes: [], relationIds: [], interactionId: 'interaction.checkout' }; model.views = [view];
		const text = describeAdeDiagram({ model, activeView: view, selectedId: '', section: 'diagram', loading: false, error: undefined, saveError: undefined, dirty: false, editable: true, diagnostics: [] });
		for (const part of ['Exclusive Choice', 'Every Other Declared Outcome', 'persistContract', 'Timeout: 50 ms', 'Reply Required']) { assert.ok(text.includes(part), part); }
	});
	test('native typed controls author an independent checkout case without executing the generator', async () => {
		const criteria = { version: 1 as const, revision: '1', cases: [] }, dialogs = new ScriptedDialogs([
			'interaction.checkout', 'The authored outcome and ordered calls hold', 'Declined Checkout',
			'Value for total', '100', 'Value for correlation', 'order-1', 'Value for notify', 'False',
			'Add Successful Reply', '0', 'Value for status', 'declined', 'Finish Replies for This Occurrence',
			'Add Successful Reply', '0', 'Finish Replies for This Occurrence',
			'Add Successful Reply', '0', 'Finish Replies for This Occurrence',
			'Finish Replies for This Occurrence', 'Expected Completion', 'charge', 'handleOther', 'Finish Expected Call Order'
		]);
		const authored = await editAdeInteractionCriteria(dialogs, interactionFixture, criteria); dialogs.assertComplete();
		assert.deepStrictEqual(authored?.interactions?.[0].expected, { outcome: 'completed', calls: ['message.charge', 'message.other'], outputs: {} });
		const entry = authored!.interactions![0], result = await interpretModelInteraction(interactionFixture, entry.interactionId, entry.input, entry.replies);
		assert.deepStrictEqual([result.outcome, result.trace.filter(event => event.kind === 'call').map(event => event.id)], ['completed', ['message.charge', 'message.other']]);
		assert.deepStrictEqual(criteria, { version: 1, revision: '1', cases: [] });
	});

});
