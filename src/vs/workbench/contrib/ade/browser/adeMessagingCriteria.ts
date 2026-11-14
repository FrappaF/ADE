/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { type IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { type SemanticModelV4, type ModelMessaging } from '../common/modelTypes.js';
import { type MessagingScenario, type MessagingObservation } from '../common/modelMessaging.js';
import { type ProjectCriteria } from '../common/modelProject.js';
import { adeCriteriaData } from './adeInteractionCriteria.js';

type Dialogs = Pick<IQuickInputService, 'pick' | 'input'>;
/** Collect scripted events with a logical clock; this never contacts a broker. */
export async function readAdeMessagingScenario(quick: Dialogs, model: SemanticModelV4, topology: ModelMessaging): Promise<MessagingScenario | undefined> {
	const steps: MessagingScenario['steps'] = [], { scalar } = adeCriteriaData(quick, model); let at = 0;
	while (steps.length < 1000) {
		const choice = await quick.pick([{ label: localize('ade.messaging.simPublish', "Publish Message"), value: 'publish' }, { label: localize('ade.messaging.simConsume', "Deliver to Worker"), value: 'consume' }, { label: localize('ade.messaging.simFinish', "Finish Scenario"), value: 'done' }], { title: localize('ade.messaging.simScenario', "Messaging Simulation · Logical Clock, No Broker") }); if (!choice) { return; } if (choice.value === 'done') { return { steps }; }
		const clock = await quick.input({ title: localize('ade.messaging.clock', "Logical Time (Milliseconds)"), value: String(at), validateInput: async value => /^\d+$/.test(value) && Number(value) >= at && Number(value) <= 86400000 ? undefined : localize('ade.messaging.clockInvalid', "Enter a nondecreasing time up to 86400000.") }); if (clock === undefined) { return; } at = Number(clock);
		if (choice.value === 'publish') { const publisher = await quick.pick(topology.publishers.map(binding => ({ label: model.foundation.blueprint!.operations.find(operation => operation.id === binding.operationId)!.name, binding })), { title: localize('ade.messaging.producer', "Declared Producer") }); if (!publisher) { return; } const channel = topology.channels.find(channel => channel.id === publisher.binding.channelId)!, message = topology.messages.find(message => message.id === channel.messageId)!; const id = await quick.input({ title: localize('ade.messaging.deliveryId', "Message Identity"), validateInput: async value => value.trim() && value.length <= 128 ? undefined : localize('ade.messaging.idInvalid', "Enter a message identity up to 128 characters.") }); if (!id) { return; } const payload = await scalar(message.payloadTypeId, message.name); if (!payload || typeof payload !== 'object' || Array.isArray(payload)) { return; } const routingKey = payload[message.routingFieldId], correlationKey = payload[message.correlationFieldId]; if (typeof routingKey !== 'string' || typeof correlationKey !== 'string') { return; } steps.push({ kind: 'publish', publisherId: publisher.binding.id, at, envelope: { version: 1, id, messageId: message.id, messageVersion: message.version, publisherId: publisher.binding.id, payload, routingKey, correlationKey } }); }
		else { const sub = await quick.pick(topology.subscriptions.map(sub => ({ label: sub.durable, sub })), { title: localize('ade.messaging.sub', "Subscription") }), worker = sub && await quick.input({ title: localize('ade.messaging.worker', "Worker Name"), validateInput: async value => value.trim() ? undefined : localize('ade.messaging.workerRequired', "Enter a worker name.") }), outcome = worker && await quick.pick([{ label: localize('ade.messaging.success', "Handler Succeeds"), value: 'ok' as const }, { label: localize('ade.messaging.failure', "Handler Fails"), value: 'fail' as const }], { title: localize('ade.messaging.handler', "Simulated Handler Outcome") }); if (!sub || !worker || !outcome) { return; } steps.push({ kind: 'consume', subscriptionId: sub.sub.id, worker, outcome: outcome.value, at }); }
	}
	return { steps };
}

/** Edits authored observations only; no simulator or generated output supplies the expected values. */
async function readMessagingExpectations(quick: Dialogs, previous: MessagingObservation = { published: [], deliveries: [], deadLetters: [], errors: [] }): Promise<MessagingObservation | undefined> {
	const expected = structuredClone(previous);
	for (const key of ['published', 'deliveries', 'deadLetters', 'errors'] as const) {
		const title = { published: localize('ade.messaging.expectedPublishTitle', "Expected Publications"), deliveries: localize('ade.messaging.expectedDeliveryTitle', "Expected Deliveries"), deadLetters: localize('ade.messaging.expectedDlqTitle', "Expected Dead Letters"), errors: localize('ade.messaging.expectedError', "Expected Rejection Codes") }[key];
		const hint = { published: localize('ade.messaging.expectedPublishHint', "ID or duplicate:ID"), deliveries: localize('ade.messaging.expectedDeliveryHint', "Subscription:Worker:ID:Attempt:ok/fail, empty:Subscription, or duplicate:Subscription:ID"), deadLetters: localize('ade.messaging.expectedDlqHint', "Subscription:ID:Reason"), errors: localize('ade.messaging.expectedErrorHint', "Enter independently expected rejection codes. An empty list expects no rejection.") }[key];
		while (true) {
			const choice = await quick.pick([
				...(expected[key].length < 1000 ? [{ label: localize('ade.messaging.addExpected', "Add Expected Observation"), value: 'add', index: -1 }] : []),
				{ label: localize('ade.messaging.finishExpected', "Finish Expected Observations"), value: 'done', index: -1 },
				...expected[key].map((value, index) => ({ label: value, description: localize('ade.messaging.expectedPosition', "Observation {0} · Edit or Remove", index + 1), value: 'edit', index }))
			], { title, placeHolder: hint });
			if (!choice) { return; }
			if (choice.value === 'done') { break; }
			if (choice.value === 'edit') {
				const action = await quick.pick([{ label: localize('ade.messaging.editExpected', "Edit Expected Observation"), value: 'edit' }, { label: localize('ade.messaging.removeExpected', "Remove Expected Observation"), value: 'remove' }], { title, placeHolder: expected[key][choice.index] });
				if (!action) { return; }
				if (action.value === 'remove') { expected[key].splice(choice.index, 1); continue; }
			}
			const value = await quick.input({ title, prompt: hint, value: choice.value === 'edit' ? expected[key][choice.index] : '', validateInput: async value => value.trim() ? undefined : localize('ade.messaging.expectedRequired', "Enter the independently expected observation.") });
			if (value === undefined) { return; }
			if (choice.value === 'edit') { expected[key][choice.index] = value; } else { expected[key].push(value); }
		}
	}
	return expected;
}

/** Expectations are manually authored before execution; no generated observation becomes the oracle. */
export async function editAdeMessagingCriteria(quick: Dialogs, model: SemanticModelV4, previous: ProjectCriteria, editExisting = false): Promise<ProjectCriteria | undefined> {
	if (editExisting) {
		const choice = await quick.pick((previous.messaging ?? []).map(entry => ({
			label: /^[a-f0-9-]{36}$/i.test(entry.id) ? entry.scenario.steps.map(step => step.kind === 'publish' ? step.envelope.id : `${step.subscriptionId}/${step.worker}`).join(' → ') || entry.id : entry.id,
			description: `${entry.messagingId} · ${entry.criterionId}`, detail: entry.id, entry
		})), { title: localize('ade.messaging.editCase', "Edit Messaging Expectations"), matchOnDescription: true, matchOnDetail: true });
		if (!choice) { return; }
		const expected = await readMessagingExpectations(quick, choice.entry.expected);
		if (!expected || JSON.stringify(expected) === JSON.stringify(choice.entry.expected)) { return; }
		const next = structuredClone(previous); next.revision = generateUuid(); next.messaging!.find(entry => entry.id === choice.entry.id)!.expected = expected; return next;
	}
	const topology = await quick.pick((model.foundation.messaging ?? []).map(topology => ({ label: topology.id, topology })), { title: localize('ade.messaging.criteria', "Independent Messaging Expectations") }); if (!topology) { return; }
	const contracts = [...topology.topology.publishers, ...topology.topology.subscriptions].map(binding => model.foundation.blueprint!.operations.find(operation => operation.id === binding.operationId)!);
	const criterion = await quick.pick(contracts.flatMap(contract => contract.acceptanceCriteria.map(criterion => ({ label: criterion.then, description: contract.name, criterion }))), { title: localize('ade.messaging.criterion', "Business Criterion") }); if (!criterion) { return; }
	const scenario = await readAdeMessagingScenario(quick, model, topology.topology); if (!scenario) { return; }
	const expected = await readMessagingExpectations(quick); if (!expected) { return; }
	const next = structuredClone(previous); next.revision = generateUuid(); next.messaging = [...next.messaging ?? [], { id: generateUuid(), messagingId: topology.topology.id, criterionId: criterion.criterion.id, scenario, expected }]; return next;
}
