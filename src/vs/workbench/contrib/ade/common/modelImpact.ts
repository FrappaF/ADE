/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SemanticModel, SemanticRelation } from './semanticModel.js';

type ImpactReference =
	| { kind: 'relationship'; sourceId: string; targetId: string; relation: SemanticRelation }
	| { kind: 'authorization'; sourceId: string; targetId: string; capability: string };

/** Records are evidence supplied by the document, never a claim about the current code or its execution. */
export function getElementEvidence(model: SemanticModel, id: string) {
	const element = model.semantics.elements.find(element => element.id === id);
	if (!element) { throw new Error(`Unknown element: ${id}`); }
	const mappings = model.codeMappings.filter(mapping => mapping.elementId === id);
	const verifications = model.verifications.filter(verification => verification.elementId === id);
	const criteria = (element.behavior?.acceptanceCriteria ?? []).map(criterion => {
		const records = verifications.filter(record => record.criterionId === criterion.id);
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
	for (const element of elements.values()) {
		if (element.parentId) {
			const group = children.get(element.parentId) ?? [];
			group.push(element.id);
			children.set(element.parentId, group);
		}
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
	const ownershipIds = new Set<string>();
	for (const elementId of visited) {
		const seen = new Set<string>();
		let parentId = elements.get(elementId)?.parentId;
		while (parentId && !seen.has(parentId)) {
			seen.add(parentId);
			if (!visited.has(parentId)) { ownershipIds.add(parentId); }
			parentId = elements.get(parentId)?.parentId;
		}
	}
	const relationships = model.semantics.relations.filter(relation => visited.has(relation.from) || visited.has(relation.to));
	const relationshipIds = new Set(relationships.map(relation => relation.id));
	return {
		subject,
		scope: scopeQueue.map(id => elements.get(id)!),
		dependents,
		owners: [...ownershipIds].map(id => elements.get(id)!),
		relationships,
		unclassified: relationships.filter(relation => !!relation.classification),
		views: model.views.filter(view => (view.featureId && visited.has(view.featureId)) || view.nodes.some(node => visited.has(node.elementId)) || view.relationIds.some(id => relationshipIds.has(id))),
		evidence: [...visited].map(id => getElementEvidence(model, id))
	};
}
