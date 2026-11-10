/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import '../../scripts/source-loader.mjs';
const { createPureProject } = await import('../../../src/vs/workbench/contrib/ade/common/modelProject.ts');
let serial = 0;
const project = createPureProject('Checkout Messaging', () => 'async.' + ++serial), model = project.model;
const owner = model.foundation.blueprint.operations[0].ownerId, container = model.semantics.elements.find(e => e.kind === 'container').id, system = model.semantics.elements.find(e => e.kind === 'system').id;
const field = (id, typeId) => ({ id, name: id, type: '', typeId, required: true, nullable: { state: 'known', value: false } });
model.foundation.types.push({ id: 'Text', name: 'Text', kind: 'primitive', primitive: 'string', fields: [] }, { id: 'OrderConfirmed', name: 'Order Confirmed', kind: 'record', fields: [field('orderId', 'Text'), field('correlationId', 'Text')] });
model.semantics.elements.push({ id: 'broker', name: 'Checkout Broker', kind: 'container', runtimeKind: 'messaging', description: 'Persist and deliver declared checkout messages' });
model.foundation.ownership.push({ id: 'owns.broker', elementId: 'broker', ownerId: system, role: 'architecture' });
model.foundation.platform.bindings.push({ id: 'binding.broker', elementId: 'broker', profileId: 'node.esm', technology: { state: 'known', value: 'nats-jetstream' } });
for (const id of ['fulfilment', 'billing', 'analytics']) { model.semantics.elements.push({ id, name: id, kind: 'component', description: 'Handle OrderConfirmed for ' + id }); model.foundation.ownership.push({ id: 'owns.' + id, elementId: id, ownerId: container, role: 'architecture' }); }
const operation = (id, ownerId) => ({ id, name: id, ownerId, inputs: [field(id + '.payload', 'OrderConfirmed')], outputs: [], errors: [], effects: [], permissions: [], preconditions: [], postconditions: [], acceptanceCriteria: [{ id: 'criterion.' + id, given: 'An explicitly versioned OrderConfirmed', when: 'The declared binding is used', then: 'Delivery follows its independently authored policy' }] });
model.foundation.blueprint.operations.push(operation('publish.queue', owner), operation('publish.topic', owner), operation('receive.queue', 'fulfilment'), operation('receive.billing', 'billing'), operation('receive.analytics', 'analytics'));
const subscription = (id, channelId, ownerId, operationId) => ({ id, channelId, ownerId, operationId, durable: id, delivery: 'at-least-once', ack: 'explicit', ackWaitMs: 500, maxAttempts: 3, backoffMs: [100, 200], deadLetter: { subject: 'checkout.dlq.' + id }, ordering: 'serial', idempotency: 'file-ledger-v1' });
model.foundation.messaging = [{ id: 'checkout.messaging', version: 1, revision: '1', brokers: [{ id: 'nats', elementId: 'broker', engine: 'nats-jetstream', version: '2.11.9', endpointRef: 'local.checkout', credentialRef: 'none' }], messages: [{ id: 'order.confirmed', name: 'OrderConfirmed', version: '1', payloadTypeId: 'OrderConfirmed', compatibility: 'exact', routingFieldId: 'orderId', correlationFieldId: 'correlationId' }], channels: ['queue', 'topic'].map(kind => ({ id: kind, name: kind === 'queue' ? 'Fulfilment Queue' : 'Order Confirmed Topic', brokerId: 'nats', kind, messageId: 'order.confirmed', subject: 'checkout.' + kind, storage: 'file', maxMessages: 1000, duplicateWindowMs: 1000 })), publishers: ['queue', 'topic'].map(id => ({ id: 'producer.' + id, channelId: id, ownerId: owner, operationId: 'publish.' + id })), subscriptions: [subscription('workers', 'queue', 'fulfilment', 'receive.queue'), subscription('billing', 'topic', 'billing', 'receive.billing'), subscription('analytics', 'topic', 'analytics', 'receive.analytics')] }];
model.foundation.occurrences.push({ id: 'sequence.publish', operationId: 'publish.topic', from: owner, to: 'broker', messagingBindingId: 'producer.topic' });
model.views.push({ id: 'view.messaging', name: 'Checkout Messaging', kind: 'c4Container', subjectId: system, contextIds: [], messagingId: 'checkout.messaging', nodes: [system, container, 'broker'].map((elementId, i) => ({ elementId, x: i * 180, y: 100 })), relationIds: [] });
model.foundation.decisions.push({ id: 'adr.messaging', revision: '1', status: 'accepted', scopeIds: [owner, 'broker', 'fulfilment', 'billing', 'analytics'], constraints: [
	{ id: 'constraint.messaging.engine', category: 'technology', subject: { kind: 'messaging', id: 'checkout.messaging' }, field: '/brokers/0/engine', value: { state: 'known', value: 'nats-jetstream' } },
	{ id: 'constraint.messaging.version', category: 'technology', subject: { kind: 'messaging', id: 'checkout.messaging' }, field: '/brokers/0/version', value: { state: 'known', value: '2.11.9' } }
], record: { number: '11', title: 'Explicit JetStream delivery', context: 'Checkout needs competitive delivery and independent fan-out', decision: 'Use JetStream 2.11.9 with explicit ack/retry/DLQ and finite deduplication; no outbox or effect transaction', consequences: ['At least once; crash can repeat effects before ledger completion', 'Local file ledger is not a distributed lock or external transaction', 'Source: ade/docs/decisions/0011-jetstream-messaging.md'], history: [] } });
export const checkoutMessaging = model;
export const envelope = (id = 'order-1', kind = 'queue') => ({ version: 1, id, messageId: 'order.confirmed', messageVersion: '1', publisherId: 'producer.' + kind, routingKey: '42', correlationKey: 'checkout-42', payload: { orderId: '42', correlationId: 'checkout-42' } });
export const publish = (id = 'order-1', kind = 'queue', at = 0) => ({ kind: 'publish', publisherId: 'producer.' + kind, envelope: envelope(id, kind), at });
export const consume = (subscriptionId = 'workers', worker = 'A', outcome = 'ok', at = 0) => ({ kind: 'consume', subscriptionId, worker, outcome, at });
const expected = value => ({ published: [], deliveries: [], deadLetters: [], errors: [], ...value });
const entry = (id, steps, observation, operationId = 'receive.queue') => ({ id, messagingId: 'checkout.messaging', criterionId: 'criterion.' + operationId, scenario: { steps }, expected: expected(observation) });
export const messagingCriteria = { ...project.criteria, messaging: [
	entry('queue.competitive', [publish(), consume(), consume('workers', 'B')], { published: ['order-1'], deliveries: ['workers:A:order-1:1:ok', 'empty:workers'] }),
	entry('topic.fanout', [publish('order-1', 'topic'), consume('billing'), consume('analytics')], { published: ['order-1'], deliveries: ['billing:A:order-1:1:ok', 'analytics:A:order-1:1:ok'] }, 'receive.billing'),
	entry('producer.dedup', [publish(), publish(), consume()], { published: ['order-1', 'duplicate:order-1'], deliveries: ['workers:A:order-1:1:ok'] }, 'publish.queue'),
	entry('consumer.idempotent', [publish(), consume(), publish('order-1', 'queue', 1001), consume('workers', 'B', 'ok', 1001)], { published: ['order-1', 'order-1'], deliveries: ['workers:A:order-1:1:ok', 'duplicate:workers:order-1'] }),
	entry('retry.exhausted', [publish(), consume('workers', 'A', 'fail'), consume('workers', 'B', 'fail', 99), consume('workers', 'B', 'fail', 100), consume('workers', 'A', 'fail', 300)], { published: ['order-1'], deliveries: ['workers:A:order-1:1:fail', 'empty:workers', 'workers:B:order-1:2:fail', 'workers:A:order-1:3:fail'], deadLetters: ['workers:order-1:attemptsExhausted'] }),
	entry('topic.no-producer', [consume('analytics')], { deliveries: ['empty:analytics'] }, 'receive.analytics'),
	entry('topic.publish', [publish('order-2', 'topic')], { published: ['order-2'] }, 'publish.topic'),
	entry('contract.incompatible', [{ ...publish(), envelope: { ...envelope(), messageVersion: '2' } }], { errors: ['messageVersion'] }),
	entry('producer.undeclared', [{ ...publish(), publisherId: 'unknown' }], { errors: ['messagePublisher'] })
] };
/** A typed subscription can trigger a declared flat state event without inventing payload mapping. */
export const messagingStateModel = structuredClone(checkoutMessaging);
messagingStateModel.semantics.elements.find(element => element.id === 'fulfilment').kind = 'class';
messagingStateModel.foundation.blueprint.operations.push({ ...operation('initialize.fulfilment', 'fulfilment'), inputs: [] });
for (const id of ['AwaitingOrder', 'OrderReceived']) { messagingStateModel.semantics.elements.push({ id, name: id, kind: 'state', parentId: 'fulfilment' }); messagingStateModel.foundation.ownership.push({ id: 'owns.' + id, elementId: id, ownerId: 'fulfilment', role: 'lifecycle' }); }
messagingStateModel.foundation.stateMachines = [{ id: 'fulfilment.lifecycle', version: 1, revision: '1', ownerId: 'fulfilment', operationId: 'initialize.fulfilment', profile: 'flat', persistence: 'snapshot-v1', initialIds: ['AwaitingOrder'], finalIds: ['OrderReceived'], states: [{ elementId: 'AwaitingOrder', entry: [], exit: [] }, { elementId: 'OrderReceived', entry: [], exit: [] }], events: [{ id: 'received', operationId: 'receive.queue', subscriptionId: 'workers' }], actions: [], transitions: [{ id: 'receive', from: 'AwaitingOrder', to: 'OrderReceived', eventId: 'received', kind: 'external', priority: 0, guard: null, effects: [] }] }];
