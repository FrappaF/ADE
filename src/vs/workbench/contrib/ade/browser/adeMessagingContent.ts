/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import type { SemanticModelV4 } from '../common/semanticModel.js';

/** Shared visual/accessibility projection; broker aggregation never discards channel identities. */
export function adeMessagingRows(model: SemanticModelV4, id: string): { id: string; label: string; text: string }[] {
	const topology = model.foundation.messaging?.find(topology => topology.id === id); if (!topology) { return []; }
	const name = (id: string) => model.semantics.elements.find(element => element.id === id)?.name ?? id, rows = [{ id: topology.id, label: localize('ade.messaging.title', "Messaging Topology"), text: localize('ade.messaging.legend', "Producer → Channel: publish. Channel → Consumer: subscribe. Queue workers compete within one durable subscription; topic subscriptions each receive a copy. Declared intent; simulation does not prove broker delivery.") }];
	for (const broker of topology.brokers) { rows.push({ id: broker.elementId, label: name(broker.elementId), text: localize('ade.messaging.brokerRow', "Broker {0} · NATS JetStream {1} · {2} Logical Channels · Endpoint Reference {3}", name(broker.elementId), broker.version, topology.channels.filter(channel => channel.brokerId === broker.id).length, broker.endpointRef) }); }
	for (const channel of topology.channels) { const message = topology.messages.find(message => message.id === channel.messageId); rows.push({ id: channel.id, label: channel.name, text: localize('ade.messaging.channelRow', "{0} ({1}) · Subject {2} · Message {3} Version {4}, Exact Compatibility · File Storage, Capacity {5}, Producer Deduplication {6} ms", channel.name, channel.kind, channel.subject, message?.name ?? channel.messageId, message?.version ?? '', channel.maxMessages, channel.duplicateWindowMs) }); for (const publisher of topology.publishers.filter(binding => binding.channelId === channel.id)) { rows.push({ id: publisher.ownerId, label: name(publisher.ownerId), text: localize('ade.messaging.publishRow', "{0} → {1}: Publish Through {2}", name(publisher.ownerId), channel.name, model.foundation.blueprint?.operations.find(operation => operation.id === publisher.operationId)?.name ?? publisher.operationId) }); } for (const sub of topology.subscriptions.filter(binding => binding.channelId === channel.id)) { rows.push({ id: sub.ownerId, label: name(sub.ownerId), text: localize('ade.messaging.subscriptionRow', "{0} → {1}: Subscription {2} · At Least Once, Explicit Ack, Ack Timeout {3} ms · {4} Effect Attempts, Backoff [{5}] ms · Dead Letter {6} · Serial Delivery · Idempotency {7}", channel.name, name(sub.ownerId), sub.durable, sub.ackWaitMs, sub.maxAttempts, sub.backoffMs.join(', '), sub.deadLetter.subject, sub.idempotency) }); } }
	return rows;
}
