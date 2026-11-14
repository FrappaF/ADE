/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ScriptedDialogs } from './adeBlueprintEditing.test.js';
import { messagingFixture, messagingCriteriaFixture } from '../common/messagingFixture.js';
import { editAdeMessaging } from '../../browser/adeMessagingEditing.js';
import { editAdeMessagingCriteria, readAdeMessagingScenario } from '../../browser/adeMessagingCriteria.js';
import { adeMessagingRows } from '../../browser/adeMessagingContent.js';
import { describeAdeDiagram } from '../../browser/adeAccessibleContent.js';
import { applyVisualEdit } from '../../common/visualEditing.js';
import { compileModelMessaging, simulateMessaging, validateModelMessaging } from '../../common/modelMessaging.js';
import { type SemanticModelV4 } from '../../common/modelTypes.js';

suite('A.D.E messaging native editing', () => {
	test('nested cancel preserves contracts, policies and source model', async () => { const model = structuredClone(messagingFixture), before = structuredClone(model), dialogs = new ScriptedDialogs(['checkout.messaging', 'Declare or Edit Subscription', 'workers', undefined]); assert.strictEqual(await editAdeMessaging(dialogs, model), undefined); dialogs.assertComplete(); assert.deepStrictEqual(model, before); });
	test('confirming the focused existing policy preserves its file ledger when only ack wait changes', async () => {
		const model = structuredClone(messagingFixture), dialogs = new ScriptedDialogs(['checkout.messaging', 'Declare or Edit Subscription', 'workers', 'workers', 'At Least Once · Explicit Ack · Serial Delivery', '1000', '3', '100', '200', 'checkout.dlq.workers', '<focused>', 'Validate and Save Messaging']);
		const edits = await editAdeMessaging(dialogs, model); dialogs.assertComplete();
		const next = edits!.reduce((next, edit) => applyVisualEdit(next, edit) as SemanticModelV4, model);
		const sub = next.foundation.messaging![0].subscriptions.find(sub => sub.id === 'workers')!;
		assert.strictEqual(sub.ackWaitMs, 1000); assert.strictEqual(sub.idempotency, 'file-ledger-v1');
	});
	test('explicit retry edit is an atomic detached batch with stable subscription identity', async () => { const model = structuredClone(messagingFixture), before = structuredClone(model), dialogs = new ScriptedDialogs(['checkout.messaging', 'Declare or Edit Subscription', 'workers', 'workers', 'At Least Once · Explicit Ack · Serial Delivery', '1000', '3', '100', '200', 'checkout.dlq.workers', 'Local File Ledger · Completion Before Ack, No Effect Transaction', 'Validate and Save Messaging']); const edits = await editAdeMessaging(dialogs, model); dialogs.assertComplete(); let next = model; for (const edit of edits!) { next = applyVisualEdit(next, edit) as SemanticModelV4; } assert.deepStrictEqual(model, before); assert.strictEqual(next.foundation.messaging![0].subscriptions.find(sub => sub.id === 'workers')!.ackWaitMs, 1000); assert.deepStrictEqual(validateModelMessaging(next, 'checkout.messaging'), []); });
	test('native binding explicitly chooses publish direction and preserves occurrence identity', async () => { const model = structuredClone(messagingFixture), dialogs = new ScriptedDialogs(['checkout.messaging', 'Link Sequence Occurrence', 'sequence.publish', 'Publish: publish.queue', 'Validate and Save Messaging']); const edits = await editAdeMessaging(dialogs, model); dialogs.assertComplete(); let next = model; for (const edit of edits!) { next = applyVisualEdit(next, edit) as SemanticModelV4; } assert.deepStrictEqual(next.foundation.occurrences[0], { id: 'sequence.publish', operationId: 'publish.queue', from: 'async.4', to: 'broker', messagingBindingId: 'producer.queue' }); });
	test('canceled criteria authoring never mutates an independent oracle', async () => { const previous = structuredClone(messagingCriteriaFixture), dialogs = new ScriptedDialogs(['checkout.messaging', undefined]); assert.strictEqual(await editAdeMessagingCriteria(dialogs, messagingFixture, previous), undefined); dialogs.assertComplete(); assert.deepStrictEqual(previous, messagingCriteriaFixture); });
	test('native controls author independent empty-consumer observation without running the generator', async () => { const dialogs = new ScriptedDialogs(['checkout.messaging', 'Delivery follows its independently authored policy', 'Deliver to Worker', '0', 'workers', 'A', 'Handler Succeeds', 'Finish Scenario', 'Finish Expected Observations', 'Add Expected Observation', 'empty:workers', 'Finish Expected Observations', 'Finish Expected Observations', 'Finish Expected Observations']); const next = await editAdeMessagingCriteria(dialogs, messagingFixture, { version: 1, revision: '1', cases: [] }); dialogs.assertComplete(); assert.deepStrictEqual(next?.messaging?.[0].expected, { published: [], deliveries: ['empty:workers'], deadLetters: [], errors: [] }); assert.deepStrictEqual(simulateMessaging(compileModelMessaging(messagingFixture, 'checkout.messaging'), next!.messaging![0].scenario), next?.messaging?.[0].expected); });
	test('editing messaging expectations preserves authored steps and identity; unchanged and canceled edits leave the oracle intact', async () => {
		const previous = structuredClone(messagingCriteriaFixture), entry = previous.messaging!.find(entry => entry.expected.published.length)!;
		const original = entry.expected.published[0]; assert.ok(original);
		const unchanged = new ScriptedDialogs([entry.id, 'Finish Expected Observations', 'Finish Expected Observations', 'Finish Expected Observations', 'Finish Expected Observations']);
		assert.strictEqual(await editAdeMessagingCriteria(unchanged, messagingFixture, previous, true), undefined); unchanged.assertComplete();
		const edits = new ScriptedDialogs([entry.id, original, 'Edit Expected Observation', 'independently-wrong-id', 'Finish Expected Observations', 'Finish Expected Observations', 'Finish Expected Observations', 'Finish Expected Observations']);
		const next = await editAdeMessagingCriteria(edits, messagingFixture, previous, true); edits.assertComplete();
		assert.strictEqual(next!.messaging!.find(candidate => candidate.id === entry.id)!.id, entry.id); assert.deepStrictEqual(next!.messaging!.find(candidate => candidate.id === entry.id)!.scenario, entry.scenario);
		assert.strictEqual(next!.messaging!.find(candidate => candidate.id === entry.id)!.expected.published[0], 'independently-wrong-id'); assert.deepStrictEqual(previous, messagingCriteriaFixture);
		const canceled = new ScriptedDialogs([entry.id, original, 'Remove Expected Observation', undefined]);
		assert.strictEqual(await editAdeMessagingCriteria(canceled, messagingFixture, previous, true), undefined); canceled.assertComplete(); assert.deepStrictEqual(previous, messagingCriteriaFixture);
	});
	test('typed native publisher collects record fields and declared correlation/routing keys', async () => { const dialogs = new ScriptedDialogs(['Publish Message', '0', 'publish.queue', 'native-order', '42', 'checkout-42', 'Finish Scenario']); const scenario = await readAdeMessagingScenario(dialogs, messagingFixture, messagingFixture.foundation.messaging![0]); dialogs.assertComplete(); assert.deepStrictEqual(simulateMessaging(compileModelMessaging(messagingFixture, 'checkout.messaging'), scenario!), { published: ['native-order'], deliveries: [], deadLetters: [], errors: [] }); });
	test('accessible diagram includes logical channels, explicit directions and all subscription policies', () => { const model = messagingFixture, text = describeAdeDiagram({ model, activeView: model.views[0], selectedId: '', section: 'diagram', loading: false, error: undefined, saveError: undefined, dirty: false, editable: true, diagnostics: [] }); for (const row of adeMessagingRows(model, 'checkout.messaging')) { assert.ok(text.includes(row.text), row.id); } });
});
