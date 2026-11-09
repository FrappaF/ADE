/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { checkShape, semanticModelV4Schema, readSemanticDraft, emptyFoundation, type ModelDiagnostic, type ModelMessaging, type ModelType, type SemanticModelV4 } from './semanticModel.js';
import { canonicalJson } from './modelSerialization.js';
import { isModelValue, valueRuntime, type ModelValue } from './modelValues.js';
import type { StateInstance, StateResult } from './modelStates.js';
import type { ModelStateMachine } from './semanticModel.js';
import { messagingInterpreterSource } from './messagingRuntime.generated.js';

export const messagingRules = { version: 1, broker: 'nats-jetstream', brokerVersion: '2.11.9', clientVersion: '2.29.3', envelope: 1, compatibility: 'exact', maxSteps: 1000, maxBytes: 2097152, maxTrace: 10000, maxTopologyEntries: 100, effectAtomicity: 'none', producerDeduplication: 'broker-window', deadLetter: 'publish-ack-before-source-ack', maxDeliver: 'unlimited-for-crash-recovery' } as const;
export interface MessagingProgram { version: 1; targetId: string; rules: typeof messagingRules; topology: ModelMessaging; types: ModelType[]; inputs: Record<string, string> }
export interface MessageEnvelope { version: 1; id: string; messageId: string; messageVersion: string; publisherId: string; routingKey: string; correlationKey: string; payload: ModelValue }
export type MessagingStep = { kind: 'publish'; publisherId: string; envelope: MessageEnvelope; at: number } | { kind: 'consume'; subscriptionId: string; worker: string; outcome: 'ok' | 'fail'; at: number };
export interface MessagingScenario { steps: MessagingStep[] }
export interface MessagingObservation { published: string[]; deliveries: string[]; deadLetters: string[]; errors: string[] }

/** Missing choices remain drafts. No infrastructure or business defaults are inferred. */
export function validateModelMessaging(model: SemanticModelV4, id: string): string[] {
	const reasons: string[] = [], topology = model.foundation.messaging?.find(entry => entry.id === id);
	if (!topology) { return ['messagingMissing']; }
	const shape: ModelDiagnostic[] = []; checkShape(topology, semanticModelV4Schema.properties!.foundation.properties!.messaging.items!, '', shape);
	if (shape.length) { return ['messagingShape']; }
	const entries = [...topology.brokers, ...topology.messages, ...topology.channels, ...topology.publishers, ...topology.subscriptions];
	if (entries.some(entry => entry.id.length > 64) || entries.length > messagingRules.maxTopologyEntries || new Set(entries.map(entry => entry.id)).size !== entries.length) { reasons.push('messagingIdentities'); }
	const topologyIds = (model.foundation.messaging ?? []).flatMap(topology => [...topology.brokers, ...topology.messages, ...topology.channels, ...topology.publishers, ...topology.subscriptions].map(entry => entry.id));
	if (entries.some(entry => topologyIds.filter(id => id === entry.id).length !== 1)) { reasons.push('messagingCrossTopologyIdentity'); }
	if (topology.brokers.length !== 1 || !topology.messages.length || !topology.channels.length) { reasons.push('messagingTopology'); }
	const exactSubject = (subject: string) => /^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*$/.test(subject) && subject.length <= 100;
	for (const broker of topology.brokers) { if (!/^[A-Za-z][A-Za-z0-9._-]{0,127}$/.test(broker.endpointRef)) { reasons.push('messagingEndpointReference'); } const element = model.semantics.elements.find(element => element.id === broker.elementId); if (element?.kind !== 'container' || element.runtimeKind !== 'messaging' || !model.foundation.ownership.some(owner => owner.elementId === element.id && owner.role === 'architecture')) { reasons.push('messagingBrokerOwner'); } }
	for (const message of topology.messages) {
		const type = model.foundation.types.find(type => type.id === message.payloadTypeId);
		if (type?.kind !== 'record' || [message.routingFieldId, message.correlationFieldId].some(id => { const field = type.fields.find(field => field.id === id), t = model.foundation.types.find(type => type.id === field?.typeId); return !field?.required || field.nullable?.state !== 'known' || field.nullable.value !== false || t?.kind !== 'primitive' || t.primitive !== 'string'; })) { reasons.push('messagingPayloadContract'); }
	}
	const subjects = [...topology.channels.map(channel => channel.subject), ...topology.subscriptions.map(sub => sub.deadLetter.subject)];
	if (new Set(subjects).size !== subjects.length || subjects.some(subject => !exactSubject(subject))) { reasons.push('messagingSubjects'); }
	if (new Set(topology.subscriptions.map(sub => sub.durable)).size !== topology.subscriptions.length) { reasons.push('messagingDurableIdentity'); }
	for (const channel of topology.channels) {
		if (!topology.brokers.some(broker => broker.id === channel.brokerId) || !topology.messages.some(message => message.id === channel.messageId) || !topology.publishers.some(binding => binding.channelId === channel.id) || !topology.subscriptions.some(binding => binding.channelId === channel.id) || channel.kind === 'queue' && topology.subscriptions.filter(binding => binding.channelId === channel.id).length !== 1) { reasons.push('messagingChannelBindings'); }
	}
	for (const binding of [...topology.publishers, ...topology.subscriptions]) {
		const channel = topology.channels.find(channel => channel.id === binding.channelId), message = topology.messages.find(message => message.id === channel?.messageId), operation = model.foundation.blueprint?.operations.find(operation => operation.id === binding.operationId), owner = model.semantics.elements.find(element => element.id === binding.ownerId), field = operation?.inputs[0];
		if (!channel || !owner || !['component', 'class', 'contract', 'interface'].includes(owner.kind) || operation?.ownerId !== binding.ownerId || operation.inputs.length !== 1 || field?.typeId !== message?.payloadTypeId || !field?.required || field.nullable?.state !== 'known' || field.nullable.value !== false || operation.outputs.length || operation.errors.length || operation.effects.length || operation.permissions.length) { reasons.push('messagingBindingContract'); }
	}
	for (const sub of topology.subscriptions) { if (!/^[a-zA-Z0-9_-]{1,64}$/.test(sub.durable) || sub.backoffMs.length !== sub.maxAttempts - 1 || sub.backoffMs.some(delay => delay >= sub.ackWaitMs)) { reasons.push('messagingRetryPolicy'); } }
	for (const occurrence of model.foundation.occurrences.filter(occurrence => occurrence.messagingBindingId && entries.some(entry => entry.id === occurrence.messagingBindingId))) { const binding = [...topology.publishers, ...topology.subscriptions].find(binding => binding.id === occurrence.messagingBindingId); if (!binding || occurrence.operationId !== binding.operationId || occurrence.execution) { reasons.push('messagingOccurrenceBinding'); } }
	for (const machine of model.foundation.stateMachines ?? []) { for (const event of machine.events.filter(event => event.subscriptionId && topology.subscriptions.some(sub => sub.id === event.subscriptionId))) { if (!topology.subscriptions.some(sub => sub.id === event.subscriptionId && sub.operationId === event.operationId)) { reasons.push('messagingStateBinding'); } } }
	return [...new Set(reasons)];
}

/** Compile only contracts and topology; prose, views and arbitrary operation code stay outside runtime. */
export function compileModelMessaging(model: SemanticModelV4, id: string): MessagingProgram {
	const errors = validateModelMessaging(model, id); if (errors.length) { throw new Error(errors.join(',')); }
	const topology = model.foundation.messaging!.find(entry => entry.id === id)!, types: ModelType[] = [], active = new Set<string>();
	const include = (id: string) => { if (types.some(type => type.id === id)) { return; } if (active.has(id)) { throw new Error('messagingRecursiveType'); } const type = model.foundation.types.find(type => type.id === id); if (!type) { throw new Error('messagingUnresolvedType'); } active.add(id); for (const field of type.fields) { if (!field.typeId || field.nullable?.state !== 'known') { throw new Error('messagingUnresolvedType'); } include(field.typeId); } if (type.kind === 'collection') { include(type.itemTypeId!); } if (type.kind === 'reference') { include(type.targetTypeId!); } active.delete(id); types.push(type); };
	for (const message of topology.messages) { include(message.payloadTypeId); }
	const inputs = Object.fromEntries([...topology.publishers, ...topology.subscriptions].map(binding => [binding.id, model.foundation.blueprint!.operations.find(operation => operation.id === binding.operationId)!.inputs[0].id!]));
	return structuredClone({ version: 1, targetId: id, rules: messagingRules, topology, types, inputs });
}

/** Reconstruct the minimal contract surface before a caller-supplied plan can open the local adapter. */
export function assertMessagingProgram(program: MessagingProgram): void {
	if (!program || program.version !== 1 || program.targetId !== program.topology?.id || canonicalJson(program.rules) !== canonicalJson(messagingRules) || !Array.isArray(program.types) || program.types.length > 1000 || new TextEncoder().encode(JSON.stringify(program)).length > messagingRules.maxBytes) { throw new Error('Untrusted messaging program'); }
	const foundation = emptyFoundation(); foundation.types = structuredClone(program.types); foundation.messaging = [structuredClone(program.topology)];
	const shape: ModelDiagnostic[] = []; checkShape(foundation.types, semanticModelV4Schema.properties!.foundation.properties!.types, '', shape); if (shape.length) { throw new Error('Invalid messaging types'); }
	const owners = [...new Set([...program.topology.publishers, ...program.topology.subscriptions].map(binding => binding.ownerId))];
	foundation.ownership = program.topology.brokers.map(broker => ({ id: 'owner.' + broker.id, elementId: broker.elementId, ownerId: '$system', role: 'architecture' }));
	foundation.blueprint = { operations: [...program.topology.publishers, ...program.topology.subscriptions].map(binding => { const channel = program.topology.channels.find(channel => channel.id === binding.channelId), message = program.topology.messages.find(message => message.id === channel?.messageId); return { id: binding.operationId, ownerId: binding.ownerId, name: binding.operationId, inputs: [{ id: program.inputs?.[binding.id], name: 'payload', type: '', typeId: message?.payloadTypeId, required: true, nullable: { state: 'known' as const, value: false } }], outputs: [], errors: [], effects: [], permissions: [], preconditions: [], postconditions: [], acceptanceCriteria: [] }; }), interfaces: [], ports: [], connections: [], transports: [], modules: [], fieldMappings: [] };
	if (Object.keys(program.inputs ?? {}).sort().join(',') !== [...program.topology.publishers, ...program.topology.subscriptions].map(binding => binding.id).sort().join(',') || Object.values(program.inputs).some(id => typeof id !== 'string' || !id || id.length > 128)) { throw new Error('Invalid messaging input bindings'); }
	const model: SemanticModelV4 = { version: 4, id: '$runtime', name: 'Runtime', foundation, semantics: { elements: [...owners.map(id => ({ id, name: id, kind: 'component' as const })), ...program.topology.brokers.map(broker => ({ id: broker.elementId, name: broker.id, kind: 'container' as const, runtimeKind: 'messaging' as const }))], relations: [] }, views: [], codeMappings: [], verifications: [] };
	if (canonicalJson(compileModelMessaging(model, program.targetId)) !== canonicalJson(program)) { throw new Error('Messaging program does not match its closed contracts'); }
}

// <messaging-runtime>
/** Envelope verification is used before publish and again after real delivery. It is not broker ACL authorization. */
export function validateMessageEnvelope(program: MessagingProgram, channelId: string, envelope: MessageEnvelope): void {
	const topology = program.topology, channel = topology.channels.find(channel => channel.id === channelId), message = topology.messages.find(message => message.id === channel?.messageId), publisher = topology.publishers.find(binding => binding.id === envelope?.publisherId && binding.channelId === channelId);
	if (!envelope || Object.keys(envelope).sort().join(',') !== 'correlationKey,id,messageId,messageVersion,payload,publisherId,routingKey,version' || envelope.version !== 1 || typeof envelope.id !== 'string' || !envelope.id || envelope.id.length > 128 || !publisher) { throw new Error('messagePublisher'); }
	if (!message || envelope.messageId !== message.id || envelope.messageVersion !== message.version) { throw new Error('messageVersion'); }
	const model = { foundation: { types: program.types } } as SemanticModelV4;
	if (!isModelValue(model, message.payloadTypeId, envelope.payload, false)) { throw new Error('messagePayload'); }
	const data = envelope.payload as Record<string, ModelValue>;
	if (typeof envelope.routingKey !== 'string' || !envelope.routingKey || envelope.routingKey !== data[message.routingFieldId] || typeof envelope.correlationKey !== 'string' || !envelope.correlationKey || envelope.correlationKey !== data[message.correlationFieldId]) { throw new Error('messageKeys'); }
	if (new TextEncoder().encode(JSON.stringify(envelope)).length > 65536) { throw new Error('messageBytes'); }
}

/** Deterministic teaching/test model. This function establishes no network or persistence guarantees. */
export function simulateMessaging(program: MessagingProgram, scenario: MessagingScenario): MessagingObservation {
	scenario = structuredClone(scenario);
	if (!scenario || !Array.isArray(scenario.steps) || scenario.steps.length > 1000 || new TextEncoder().encode(JSON.stringify(scenario)).length > 2097152) { throw new Error('messagingScenarioBudget'); }
	const result: MessagingObservation = { published: [], deliveries: [], deadLetters: [], errors: [] }, accepted = new Map<string, number>(), retained = new Map<string, number>(), queue = new Map<string, { envelope: MessageEnvelope; attempt: number; at: number }[]>(), completed = new Map<string, string>(); let time = 0;
	for (const sub of program.topology.subscriptions) { queue.set(sub.id, []); }
	for (const step of scenario.steps) {
		if (!Number.isSafeInteger(step.at) || step.at < time || step.at > 86400000) { throw new Error('messagingScenarioTime'); } time = step.at;
		try {
			if (step.kind === 'publish') {
				const publisher = program.topology.publishers.find(binding => binding.id === step.publisherId); if (!publisher || step.envelope.publisherId !== publisher.id) { throw new Error('messagePublisher'); }
				const channel = program.topology.channels.find(channel => channel.id === publisher.channelId)!; validateMessageEnvelope(program, channel.id, step.envelope);
				const key = channel.id + ':' + step.envelope.id, prior = accepted.get(key); if (prior !== undefined && time - prior < channel.duplicateWindowMs) { result.published.push('duplicate:' + step.envelope.id); continue; } if ((retained.get(channel.id) ?? 0) >= channel.maxMessages) { throw new Error('messageCapacity'); } retained.set(channel.id, (retained.get(channel.id) ?? 0) + 1); accepted.set(key, time); result.published.push(step.envelope.id);
				for (const sub of program.topology.subscriptions.filter(sub => sub.channelId === channel.id)) { queue.get(sub.id)!.push({ envelope: step.envelope, attempt: 0, at: time }); }
			} else if (step.kind === 'consume') {
				const sub = program.topology.subscriptions.find(sub => sub.id === step.subscriptionId); if (!sub || !step.worker || !['ok', 'fail'].includes(step.outcome)) { throw new Error('messageSubscription'); } const items = queue.get(sub.id)!, item = items[0]; if (!item || item.at > time) { result.deliveries.push('empty:' + sub.id); continue; }
				const key = sub.id + ':' + item.envelope.id, hash = canonicalJson(item.envelope), prior = completed.get(key); item.attempt++;
				if (sub.idempotency === 'file-ledger-v1' && prior) { if (prior !== hash) { result.deadLetters.push(sub.id + ':' + item.envelope.id + ':identityConflict'); } else { result.deliveries.push('duplicate:' + sub.id + ':' + item.envelope.id); } items.shift(); continue; }
				result.deliveries.push(sub.id + ':' + step.worker + ':' + item.envelope.id + ':' + item.attempt + ':' + step.outcome);
				if (step.outcome === 'ok') { if (sub.idempotency === 'file-ledger-v1') { completed.set(key, hash); } items.shift(); }
				else if (item.attempt >= sub.maxAttempts) { result.deadLetters.push(sub.id + ':' + item.envelope.id + ':attemptsExhausted'); items.shift(); }
				else { item.at = time + sub.backoffMs[item.attempt - 1]; }
			} else { throw new Error('messagingScenarioStep'); }
		} catch (error) { result.errors.push(error instanceof Error ? error.message : 'messagingScenarioError'); }
	}
	return result;
}
// </messaging-runtime>

export function setModelMessaging(model: SemanticModelV4, entry: ModelMessaging, expectedRevision?: string): SemanticModelV4 {
	if (model.foundation.messaging?.find(topology => topology.id === entry.id)?.revision !== expectedRevision) { throw new Error('Messaging revision changed'); }
	const next = structuredClone(model); next.foundation.messaging = [...next.foundation.messaging ?? []].filter(topology => topology.id !== entry.id); next.foundation.messaging.push(structuredClone(entry)); return readSemanticDraft(next) as SemanticModelV4;
}
const begin = '// <ade:messaging-v1>\n', end = '// </ade:messaging-v1>\n';
export function emitModelMessaging(model: SemanticModelV4, id: string): string { return `const program=${canonicalJson(compileModelMessaging(model, id))};\nconst types=program.types;\n${valueRuntime}\nconst canonicalJson=value=>JSON.stringify(sort(value));\nconst sort=value=>Array.isArray(value)?value.map(sort):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sort(value[key])])):value;\nconst isModelValue=(model,id,value,nullable)=>valid(id,value,nullable);\n${messagingInterpreterSource}\nexport const plan=structuredClone(program);\nexport const validate=(channel,envelope)=>validateMessageEnvelope(program,channel,envelope);\nexport default scenario=>simulateMessaging(program,scenario);\n`; }
export function messagingRegion(model: SemanticModelV4, id: string): string { return begin + emitModelMessaging(model, id) + end; }
export function readMessagingRegion(source: string): { region: string; programText: string } { const from = source.indexOf(begin), to = source.indexOf(end); if (from < 0 || to < from || source.indexOf(begin, from + begin.length) >= 0 || source.indexOf(end, to + end.length) >= 0) { throw new Error('Partial messaging mapping: unique region required'); } const region = source.slice(from, to + end.length), line = region.split('\n')[1]; if (!line.startsWith('const program=') || !line.endsWith(';')) { throw new Error('Partial messaging mapping: missing plan'); } return { region, programText: line.slice(14, -1) }; }
/** Policy-only reverse; stable identities/contracts/resources and complete runtime must match. */
export function reverseModelMessaging(model: SemanticModelV4, id: string, source: string): SemanticModelV4 {
	const read = readMessagingRegion(source), original = compileModelMessaging(model, id), data = JSON.parse(read.programText) as MessagingProgram, immutable = (p: MessagingProgram) => ({ ...p, topology: { ...p.topology, subscriptions: p.topology.subscriptions.map(({ ackWaitMs, maxAttempts, backoffMs, ...rest }) => rest) } });
	if (canonicalJson(immutable(original)) !== canonicalJson(immutable(data))) { throw new Error('Partial messaging mapping: identity, contract or resource changed'); }
	const next = structuredClone(model); next.foundation.messaging = next.foundation.messaging!.map(topology => topology.id === id ? data.topology : topology); if (messagingRegion(next, id) !== read.region) { throw new Error('Partial messaging mapping: runtime changed'); } return next;
}

/** Typed bridge only. The caller persists its state checkpoint before allowing the broker handler to complete. */
export async function deliverMessageToState(program: MessagingProgram, machine: ModelStateMachine, eventId: string, instance: StateInstance, envelope: MessageEnvelope): Promise<StateResult> {
	const event = machine.events.find(event => event.id === eventId), sub = program.topology.subscriptions.find(sub => sub.id === event?.subscriptionId);
	if (!event || !sub || sub.operationId !== event.operationId) { throw new Error('messageStateBinding'); }
	validateMessageEnvelope(program, sub.channelId, envelope);
	const result = await instance.send({ id: sub.id + ':' + envelope.id, eventId, input: { [program.inputs[sub.id]]: structuredClone(envelope.payload) } });
	if (!['accepted', 'duplicate'].includes(result.status)) { throw new Error(result.error ?? 'messageStateRejected'); } return result;
}
