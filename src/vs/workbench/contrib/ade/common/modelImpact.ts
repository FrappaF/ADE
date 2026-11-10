/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type SemanticElement, type SemanticModel, type SemanticRelation } from './modelTypes.js';

type ImpactReference =
	| { kind: 'relationship'; sourceId: string; targetId: string; relation: SemanticRelation }
	| { kind: 'contract'; sourceId: string; targetId: string }
	| { kind: 'module'; sourceId: string; targetId: string }
	| { kind: 'authorization'; sourceId: string; targetId: string; capability: string };

/** Records are evidence supplied by the document, never a claim about the current code or its execution. */
export function getElementEvidence(model: SemanticModel, id: string) {
	const element = model.semantics.elements.find(element => element.id === id);
	if (!element) { throw new Error(`Unknown element: ${id}`); }
	const mappings = model.codeMappings.filter(mapping => mapping.elementId === id);
	const verifications = model.verifications.filter(verification => verification.elementId === id);
	return elementEvidence(element, mappings, verifications);
}

function elementEvidence(element: SemanticElement, mappings: SemanticModel['codeMappings'], verifications: SemanticModel['verifications']) {
	const byCriterion = Map.groupBy(verifications, record => record.criterionId);
	const criteria = (element.behavior?.acceptanceCriteria ?? []).map(criterion => {
		const records = byCriterion.get(criterion.id) ?? [];
		return { criterion, records, mixedOutcomes: new Set(records.map(record => record.outcome)).size > 1 };
	});
	return {
		element, mappings, verifications, criteria,
		outcomes: {
			passed: verifications.filter(record => record.outcome === 'passed').length,
			failed: verifications.filter(record => record.outcome === 'failed').length,
			unknown: verifications.filter(record => record.outcome === 'unknown').length
		},
		criteriaWithoutRecords: criteria.filter(entry => !entry.records.length).map(entry => entry.criterion),
		criteriaWithMixedOutcomes: criteria.filter(entry => entry.mixedOutcomes).map(entry => entry.criterion)
	};
}

/** Conservative model-only review scope: containment, then reverse directed references, with cycle-safe reasons. */
export function getModelImpact(model: SemanticModel, id: string) {
	const elements = new Map(model.semantics.elements.map(element => [element.id, element]));
	const subject = elements.get(id);
	if (!subject) { throw new Error(`Unknown element: ${id}`); }
	const children = new Map<string, string[]>();
	const hierarchy = (model.version === 4 || model.version === 5) ? [
		...model.foundation.ownership.map(entry => ({ child: entry.elementId, parent: entry.ownerId })),
		...model.foundation.memberships.map(entry => ({ child: entry.elementId, parent: entry.featureId }))
	] : [...elements.values()].flatMap(element => element.parentId ? [{ child: element.id, parent: element.parentId }] : []);
	for (const entry of hierarchy) {
		if (!elements.has(entry.child) || !elements.has(entry.parent)) { continue; }
		const group = children.get(entry.parent) ?? [];
		group.push(entry.child); children.set(entry.parent, group);
	}
	const scopeIds = new Set([id]);
	const scopeQueue = [id];
	for (let index = 0; index < scopeQueue.length; index++) {
		for (const child of children.get(scopeQueue[index]) ?? []) {
			if (!scopeIds.has(child)) { scopeIds.add(child); scopeQueue.push(child); }
		}
	}
	const incoming = new Map<string, ImpactReference[]>();
	const addReference = (reference: ImpactReference): void => {
		if (!elements.has(reference.sourceId) || !elements.has(reference.targetId)) { return; }
		const group = incoming.get(reference.targetId) ?? [];
		group.push(reference);
		incoming.set(reference.targetId, group);
	};
	for (const relation of model.semantics.relations) {
		if (!relation.classification) { addReference({ kind: 'relationship', sourceId: relation.from, targetId: relation.to, relation }); }
	}
	for (const element of elements.values()) {
		for (const permission of element.behavior?.permissions ?? []) { addReference({ kind: 'authorization', sourceId: element.id, targetId: permission.actorId, capability: permission.capability }); }
	}
	if ((model.version === 4 || model.version === 5) && model.foundation.blueprint) {
		const b = model.foundation.blueprint;
		const interactions = new Map(model.foundation.interactions.map(entry => [entry.id, entry]));
		const interfaces = new Map(b.interfaces.map(entry => [entry.id, entry]));
		const ports = new Map(b.ports.map(entry => [entry.id, entry]));
		for (const topology of model.foundation.messaging ?? []) {
			const channels = new Map(topology.channels.map(entry => [entry.id, entry]));
			const brokers = new Map(topology.brokers.map(entry => [entry.id, entry]));
			for (const binding of [...topology.publishers, ...topology.subscriptions]) {
				const channel = channels.get(binding.channelId);
				const broker = channel && brokers.get(channel.brokerId);
				if (broker) { addReference({ kind: 'contract', sourceId: binding.ownerId, targetId: broker.elementId }); }
			}
		}
		for (const machine of model.foundation.stateMachines ?? []) {
			for (const state of machine.states) { addReference({ kind: 'contract', sourceId: machine.ownerId, targetId: state.elementId }); }
			for (const action of machine.actions) {
				const interaction = interactions.get(action.interactionId);
				if (interaction?.ownerId) { addReference({ kind: 'contract', sourceId: machine.ownerId, targetId: interaction.ownerId }); }
			}
		}
		for (const port of b.ports) {
			const contract = interfaces.get(port.interfaceId);
			if (contract) { addReference({ kind: 'contract', sourceId: port.elementId, targetId: contract.elementId }); }
		}
		for (const connection of b.connections) {
			const consumer = ports.get(connection.requiredPortId);
			const provider = ports.get(connection.providedPortId);
			if (consumer && provider) { addReference({ kind: 'contract', sourceId: consumer.elementId, targetId: provider.elementId }); }
		}
		for (const module of b.modules) { for (const consumerId of module.consumerIds) { addReference({ kind: 'module', sourceId: consumerId, targetId: module.elementId }); } }
		for (const operation of b.operations) { for (const permission of operation.permissions) { addReference({ kind: 'authorization', sourceId: operation.ownerId, targetId: permission.actorId, capability: permission.capability }); } }
	}
	const visited = new Set(scopeIds);
	const queue = scopeQueue.map(id => ({ id, distance: 0 }));
	const dependents: { element: typeof subject; distance: number; via: ImpactReference }[] = [];
	for (let index = 0; index < queue.length; index++) {
		const current = queue[index];
		for (const reference of incoming.get(current.id) ?? []) {
			if (!visited.has(reference.sourceId)) {
				visited.add(reference.sourceId);
				const distance = current.distance + 1;
				dependents.push({ element: elements.get(reference.sourceId)!, distance, via: reference });
				queue.push({ id: reference.sourceId, distance });
			}
		}
	}
	const parents = new Map((model.version === 4 || model.version === 5) ? model.foundation.ownership.map(entry => [entry.elementId, entry.ownerId]) : []);
	const parentOf = (id: string) => (model.version === 4 || model.version === 5) ? parents.get(id) : elements.get(id)?.parentId;
	const ownershipIds = new Set<string>();
	for (const elementId of visited) {
		const seen = new Set<string>();
		let parentId = parentOf(elementId);
		while (parentId && !seen.has(parentId)) {
			seen.add(parentId);
			if (!visited.has(parentId) && elements.has(parentId)) { ownershipIds.add(parentId); }
			parentId = parentOf(parentId);
		}
	}
	const relationships = model.semantics.relations.filter(relation => visited.has(relation.from) || visited.has(relation.to));
	const relationshipIds = new Set(relationships.map(relation => relation.id));
	const mappings = Map.groupBy(model.codeMappings, mapping => mapping.elementId);
	const verifications = Map.groupBy(model.verifications, verification => verification.elementId);
	return {
		subject,
		scope: scopeQueue.map(id => elements.get(id)!),
		dependents,
		owners: [...ownershipIds].map(id => elements.get(id)!),
		relationships,
		unclassified: relationships.filter(relation => !!relation.classification),
		views: model.views.filter(view => (view.featureId && visited.has(view.featureId)) || view.nodes.some(node => visited.has(node.elementId)) || view.relationIds.some(id => relationshipIds.has(id))),
		evidence: [...visited].map(id => elementEvidence(elements.get(id)!, mappings.get(id) ?? [], verifications.get(id) ?? []))
	};
}
