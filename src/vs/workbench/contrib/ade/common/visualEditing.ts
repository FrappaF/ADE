/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { reviseModelTask } from './modelWorkflow.js';
import { setModelMessaging } from './modelMessaging.js';
import { setModelStateMachine } from './modelStates.js';
import { setModelInteraction, type InteractionEdit } from './modelInteractions.js';
import { modelObjects, readSemanticDraft, readSemanticModel, type ModelBlueprint, type ModelType, type ModelDecision, type ModelFoundation, type ModelAssertion, type ElementDetails, type RelationDetails, type ElementKind, type ModelBehavior, type ModelView, type RelationKind, type SemanticModel } from './semanticModel.js';
import { reviseModelDecision, setBlueprintRecord } from './modelBlueprint.js';
import type { ModelIdFactory } from './modelMigration.js';
import { getDiagramGroups } from './visualNavigation.js';
import { isSequenceMessage } from './sequenceDiagram.js';
import { getStateDiagram, isResourceTransition } from './stateDiagram.js';
import { arrangeDiagram, type DiagramDensity } from './diagramLayout.js';

export type VisualEdit =
	| { kind: 'taskIntent'; entry: import('./semanticModel.js').ModelTaskIntent; expectedRevision?: string }
	| { kind: 'stateDefinition'; id: string; name: string; ownerId: string }
	| { kind: 'messagingOccurrence'; id: string; bindingId: string; topologyId: string }
	| { kind: 'messaging'; entry: import('./semanticModel.js').ModelMessaging; expectedRevision?: string }
	| { kind: 'viewMessaging'; viewId: string; messagingId: string }
	| { kind: 'stateMachine'; entry: import('./semanticModel.js').ModelStateMachine; expectedRevision?: string }
	| { kind: 'viewStateMachine'; viewId: string; stateMachineId: string }
	| { kind: 'interaction'; entry: InteractionEdit }
	| { kind: 'viewInteraction'; viewId: string; interactionId: string }
	| { kind: 'predicate'; entry: import('./semanticModel.js').ModelPredicate }
	| { kind: 'blueprint'; section: keyof ModelBlueprint; entry: ModelBlueprint[keyof ModelBlueprint][number] }
	| { kind: 'type'; entry: ModelType }
	| { kind: 'decision'; entry: ModelDecision; expectedRevision?: string }
	| { kind: 'c4View'; view: ModelView }
	| { kind: 'elementScope'; id: string; scope?: 'governed' | 'external'; runtimeKind?: import('./semanticModel.js').SemanticElement['runtimeKind'] }
	| { kind: 'integration'; entry: ModelFoundation['integrations'][number] }
	| { kind: 'ownership'; entry: ModelFoundation['ownership'][number] }
	| { kind: 'membership'; entry: ModelFoundation['memberships'][number]; included: boolean }
	| { kind: 'platformBinding'; entry: ModelFoundation['platform']['bindings'][number] }
	| { kind: 'assertion'; entry: ModelAssertion }
	| { kind: 'feature'; id: string; name: string }
	| { kind: 'resource'; id: string; name: string; parentId?: string }
	| { kind: 'diagram'; id: string; name: string; featureId?: string; viewKind: Exclude<ModelView['kind'], 'state'> }
	| { kind: 'stateDiagram'; id: string; name: string; featureId: string; resourceId: string }
	| { kind: 'stateLifecycle'; viewId: string; resourceId: string }
	| { kind: 'stateTransition'; viewId: string; id: string }
	| { kind: 'element'; id: string; name: string; elementKind: ElementKind; viewId: string; parentId?: string }
	| { kind: 'include'; id: string; viewId: string }
	| { kind: 'exclude'; id: string; viewId: string; target: 'element' | 'relation' }
	| { kind: 'sequenceMessage'; id: string; viewId: string }
	| { kind: 'sequenceOrder'; id: string; viewId: string; target: 'participant' | 'message'; direction: -1 | 1 }
	| { kind: 'sequenceRemove'; id: string; viewId: string; target: 'participant' | 'message' }
	| { kind: 'relation'; id: string; viewId: string; from: string; to: string; relationKind: RelationKind; name: string; condition?: string }
	| { kind: 'rename'; id: string; name: string; target: 'element' | 'diagram' }
	| { kind: 'renameRelation'; id: string; name: string }
	| { kind: 'description'; id: string; description: string }
	| { kind: 'behavior'; id: string; behavior: ModelBehavior }
	| { kind: 'parent'; id: string; parentId?: string }
	| { kind: 'elementDetails'; id: string; details: ElementDetails }
	| { kind: 'relationDetails'; id: string; details: RelationDetails }
	| { kind: 'condition'; id: string; condition: string }
	| { kind: 'relationError'; id: string; errorCode?: string }
	| { kind: 'updateRelation'; id: string; from: string; to: string; relationKind: RelationKind; name: string; condition?: string; errorCode?: string }
	| { kind: 'position'; viewId: string; id: string; x: number; y: number }
	| { kind: 'layout'; viewId: string; density?: DiagramDensity }
	| { kind: 'deleteElement'; id: string }
	| { kind: 'deleteDiagram'; id: string }
	| { kind: 'deleteRelation'; id: string };

/** Conservative upgrade: ownership becomes explicit, while semantic identities and layout stay intact. */
export function upgradeVisualModel(model: SemanticModel): SemanticModel {
	const candidate = structuredClone(model);
	if (candidate.version === 2) {
		candidate.version = 3;
		for (const group of getDiagramGroups(candidate)) {
			if (group.featureId) {
				for (const view of group.views) { view.featureId = group.featureId; }
			}
		}
	}

	return (candidate.version === 4 || candidate.version === 5) ? readSemanticDraft(candidate) : readSemanticModel(candidate);
}

/** All identities affected by a semantic deletion, including descendants and shared-view references. */
export function getDeletionImpact(model: SemanticModel, id: string) {
	const elements = new Set([id]);
	let changed = true;
	while (changed) {
		changed = false;
		for (const element of model.semantics.elements) {
			const parentId = (model.version === 4 || model.version === 5) ? model.foundation.ownership.find(entry => entry.elementId === element.id)?.ownerId : element.parentId;
			if (parentId && elements.has(parentId) && !elements.has(element.id)) {
				elements.add(element.id);
				changed = true;
			}
		}
	}
	return {
		elements: [...elements],
		relations: model.semantics.relations.filter(relation => elements.has(relation.from) || elements.has(relation.to)).map(relation => relation.id),
		views: model.views.filter(view => view.nodes.some(node => elements.has(node.elementId)) || (view.featureId && elements.has(view.featureId))).map(view => view.id),
		mappings: model.codeMappings.filter(mapping => elements.has(mapping.elementId)).length,
		verifications: model.verifications.filter(verification => elements.has(verification.elementId)).length,
		permissions: model.semantics.elements.flatMap(element => element.behavior?.permissions ?? []).filter(permission => elements.has(permission.actorId)).length
	};
}

/** Include references once, keeping already placed identities and their coordinates intact. */
function includeElement(view: ModelView, id: string): void {
	if (!view.nodes.some(node => node.elementId === id)) {
		const index = view.nodes.length;
		view.nodes.push({ elementId: id, x: view.kind === 'sequence' ? index * 260 : (index % 3) * 260, y: view.kind === 'sequence' ? 0 : Math.floor(index / 3) * 180 });
	}
}

/** Removing a local reference never removes the system identity or another view's references. */
function excludeFromView(model: SemanticModel, view: ModelView, id: string, target: 'element' | 'relation'): void {
	if (target === 'element') {
		view.nodes = view.nodes.filter(node => node.elementId !== id);
		const attached = new Set(model.semantics.relations.filter(relation => relation.from === id || relation.to === id).map(relation => relation.id));
		view.relationIds = view.relationIds.filter(id => !attached.has(id));
	} else { view.relationIds = view.relationIds.filter(relationId => relationId !== id); }
}

/** Apply one atomic, validated edit to a detached snapshot; no filesystem or UI dependencies. */
export function applyVisualEdit(model: SemanticModel, edit: VisualEdit, nextId: ModelIdFactory = () => globalThis.crypto.randomUUID()): SemanticModel {
	const candidate = upgradeVisualModel(model);
	const view = (id: string): ModelView => {
		const result = candidate.views.find(view => view.id === id);
		if (!result) { throw new Error(`Unknown diagram: ${id}`); }
		return result;
	};
	switch (edit.kind) {
		case 'taskIntent': { if ((candidate.version !== 4 && candidate.version !== 5)) { throw new Error('Task intent requires v4'); } reviseModelTask(candidate, edit.entry, edit.expectedRevision); break; }
		case 'stateDefinition': { if ((candidate.version !== 4 && candidate.version !== 5)) { throw new Error('States require v4'); } candidate.semantics.elements.push({ id: edit.id, name: edit.name, kind: 'state', parentId: edit.ownerId }); candidate.foundation.ownership.push({ id: nextId(), elementId: edit.id, ownerId: edit.ownerId, role: 'lifecycle' }); break; }
		case 'messagingOccurrence': { if ((candidate.version !== 4 && candidate.version !== 5)) { throw new Error('Messaging requires v4'); } const topology = candidate.foundation.messaging?.find(topology => topology.id === edit.topologyId), occurrence = candidate.foundation.occurrences.find(entry => entry.id === edit.id), publisher = topology?.publishers.find(binding => binding.id === edit.bindingId), subscriber = topology?.subscriptions.find(binding => binding.id === edit.bindingId), binding = publisher ?? subscriber, broker = topology?.brokers.find(broker => broker.id === topology.channels.find(channel => channel.id === binding?.channelId)?.brokerId); if (!occurrence || !binding || !broker || occurrence.execution) { throw new Error('Messaging occurrence binding unavailable'); } occurrence.messagingBindingId = binding.id; occurrence.operationId = binding.operationId; occurrence.from = publisher ? binding.ownerId : broker.elementId; occurrence.to = publisher ? broker.elementId : binding.ownerId; break; }
		case 'messaging': { if ((candidate.version !== 4 && candidate.version !== 5)) { throw new Error('Messaging requires v4'); } return setModelMessaging(candidate, edit.entry, edit.expectedRevision); }
		case 'viewMessaging': { if ((candidate.version !== 4 && candidate.version !== 5)) { throw new Error('Messaging requires v4'); } view(edit.viewId).messagingId = edit.messagingId; break; }
		case 'stateMachine': { if ((candidate.version !== 4 && candidate.version !== 5)) { throw new Error('States require v4'); } return setModelStateMachine(candidate, edit.entry, edit.expectedRevision); }
		case 'viewStateMachine': { if ((candidate.version !== 4 && candidate.version !== 5)) { throw new Error('States require v4'); } view(edit.viewId).stateMachineId = edit.stateMachineId; break; }
		case 'interaction': { if ((candidate.version !== 4 && candidate.version !== 5)) { throw new Error('Interactions require v4'); } return setModelInteraction(candidate, edit.entry); }
		case 'viewInteraction': { if ((candidate.version !== 4 && candidate.version !== 5)) { throw new Error('Interactions require v4'); } view(edit.viewId).interactionId = edit.interactionId; break; }
		case 'predicate': {
			if ((candidate.version !== 4 && candidate.version !== 5)) { throw new Error('Predicates require v4'); }
			const entries = candidate.foundation.predicates ?? [];
			candidate.foundation.predicates = entries.some(entry => entry.id === edit.entry.id) ? entries.map(entry => entry.id === edit.entry.id ? structuredClone(edit.entry) : entry) : [...entries, structuredClone(edit.entry)];
			break;
		}
		case 'blueprint': {
			if ((candidate.version !== 4 && candidate.version !== 5)) { throw new Error('Blueprint requires v4'); }
			return setBlueprintRecord(candidate, edit.section, edit.entry);
		}
		case 'decision': {
			if ((candidate.version !== 4 && candidate.version !== 5)) { throw new Error('Project decisions require v4'); }
			return reviseModelDecision(candidate, edit.entry, edit.expectedRevision);
		}
		case 'type':
		case 'integration': {
			if ((candidate.version !== 4 && candidate.version !== 5)) { throw new Error('Semantic records require v4'); }
			if (edit.kind === 'type') { candidate.foundation.types = [...candidate.foundation.types.filter(entry => entry.id !== edit.entry.id), structuredClone(edit.entry)]; }
			else { candidate.foundation.integrations = [...candidate.foundation.integrations.filter(entry => entry.id !== edit.entry.id), structuredClone(edit.entry)]; }
			break;
		}
		case 'c4View': candidate.views = candidate.views.some(view => view.id === edit.view.id) ? candidate.views.map(view => view.id === edit.view.id ? structuredClone(edit.view) : view) : [...candidate.views, structuredClone(edit.view)]; break;
		case 'elementScope': {
			if ((candidate.version !== 4 && candidate.version !== 5)) { throw new Error('C4 scope requires v4'); }
			const element = candidate.semantics.elements.find(element => element.id === edit.id); if (!element) { throw new Error('Unknown element'); }
			if (edit.scope) { element.scope = edit.scope; } if (edit.runtimeKind) { element.runtimeKind = edit.runtimeKind; }
			break;
		}
		case 'ownership':
		case 'membership':
		case 'platformBinding':
		case 'assertion': {
			if ((candidate.version !== 4 && candidate.version !== 5)) { throw new Error('Explicit semantic records require v4'); }
			if (edit.kind === 'ownership') { candidate.foundation.ownership = [...candidate.foundation.ownership.filter(entry => entry.elementId !== edit.entry.elementId), structuredClone(edit.entry)]; }
			else if (edit.kind === 'membership') { candidate.foundation.memberships = candidate.foundation.memberships.filter(entry => entry.elementId !== edit.entry.elementId || entry.featureId !== edit.entry.featureId); if (edit.included) { candidate.foundation.memberships.push(structuredClone(edit.entry)); } }
			else if (edit.kind === 'platformBinding') { candidate.foundation.platform.bindings = [...candidate.foundation.platform.bindings.filter(entry => entry.id !== edit.entry.id), structuredClone(edit.entry)]; }
			else { candidate.foundation.assertions = [...candidate.foundation.assertions.filter(entry => entry.id !== edit.entry.id), structuredClone(edit.entry)]; }
			break;
		}
		case 'feature':
			candidate.semantics.elements.push({ id: edit.id, kind: 'feature', name: edit.name });
			break;
		case 'resource':
			candidate.semantics.elements.push({ id: edit.id, kind: 'resource', name: edit.name, ...(edit.parentId ? { parentId: edit.parentId } : {}) });
			break;
		case 'diagram':
			candidate.views.push({ id: edit.id, name: edit.name, kind: edit.viewKind, featureId: edit.featureId, nodes: [], relationIds: [] });
			if (!edit.featureId) { delete candidate.views.at(-1)!.featureId; }
			break;
		case 'stateDiagram': {
			if (!candidate.semantics.elements.some(element => element.id === edit.resourceId && element.kind === 'resource')) { throw new Error(`Unknown resource: ${edit.resourceId}`); }
			candidate.views.push({ id: edit.id, name: edit.name, kind: 'state', featureId: edit.featureId, nodes: [{ elementId: edit.resourceId, x: 0, y: 0 }], relationIds: [] });
			break;
		}
		case 'stateLifecycle': {
			const diagram = view(edit.viewId);
			if (!getStateDiagram(candidate, diagram).groups.some(group => group.resource.id === edit.resourceId)) { throw new Error(`Resource is outside this state diagram: ${edit.resourceId}`); }
			for (const element of candidate.semantics.elements.filter(element => element.kind === 'state' && element.parentId === edit.resourceId)) { includeElement(diagram, element.id); }
			for (const relation of candidate.semantics.relations) {
				if (isResourceTransition(candidate, relation) && candidate.semantics.elements.find(element => element.id === relation.from)!.parentId === edit.resourceId && !diagram.relationIds.includes(relation.id)) { diagram.relationIds.push(relation.id); }
			}
			break;
		}
		case 'stateTransition': {
			const diagram = view(edit.viewId);
			const relation = candidate.semantics.relations.find(relation => relation.id === edit.id);
			if (!relation || !isResourceTransition(candidate, relation)) { throw new Error(`Unsupported resource transition: ${edit.id}`); }
			const resourceId = candidate.semantics.elements.find(element => element.id === relation.from)!.parentId;
			if (!getStateDiagram(candidate, diagram).groups.some(group => group.resource.id === resourceId)) { throw new Error(`Resource is outside this state diagram: ${resourceId}`); }
			for (const id of [relation.from, relation.to]) { includeElement(diagram, id); }
			if (!diagram.relationIds.includes(relation.id)) { diagram.relationIds.push(relation.id); }
			break;
		}
		case 'element': {
			const diagram = view(edit.viewId);
			const parentId = edit.parentId ?? diagram.featureId;
			if (diagram.kind === 'state' && edit.elementKind === 'state' && !getStateDiagram(candidate, diagram).groups.some(group => group.resource.id === parentId)) { throw new Error(`Resource is outside this state diagram: ${parentId}`); }
			candidate.semantics.elements.push({ id: edit.id, kind: edit.elementKind, name: edit.name, ...(parentId ? { parentId } : {}) });
			diagram.nodes.push({ elementId: edit.id, x: (diagram.nodes.length % 3) * 260, y: Math.floor(diagram.nodes.length / 3) * 180 });
			break;
		}
		case 'include': {
			const diagram = view(edit.viewId);
			const element = candidate.semantics.elements.find(element => element.id === edit.id);
			if (diagram.kind === 'state' && element?.kind === 'state' && !getStateDiagram(candidate, diagram).groups.some(group => group.resource.id === element.parentId)) { throw new Error(`Resource is outside this state diagram: ${element.parentId}`); }
			includeElement(diagram, edit.id);
			break;
		}
		case 'exclude':
			excludeFromView(candidate, view(edit.viewId), edit.id, edit.target);
			break;
		case 'relation': {
			const diagram = view(edit.viewId);
			if (diagram.kind === 'sequence' && !isSequenceMessage({ kind: edit.relationKind })) { throw new Error('Unsupported sequence message'); }
			if (diagram.kind === 'state' && !isResourceTransition(candidate, { id: edit.id, from: edit.from, to: edit.to, kind: edit.relationKind, name: edit.name })) { throw new Error('Unsupported resource transition'); }
			candidate.semantics.relations.push({ id: edit.id, kind: edit.relationKind, from: edit.from, to: edit.to, name: edit.name,
				...(edit.condition?.trim() ? { condition: edit.condition } : {}) });
			diagram.relationIds.push(edit.id);
			break;
		}
		case 'sequenceMessage': {
			const diagram = view(edit.viewId);
			const relation = candidate.semantics.relations.find(relation => relation.id === edit.id);
			if (diagram.kind !== 'sequence' || !relation || !isSequenceMessage(relation)) { throw new Error(`Unsupported sequence message: ${edit.id}`); }
			for (const elementId of [relation.from, relation.to]) { includeElement(diagram, elementId); }
			if (!diagram.relationIds.includes(relation.id)) { diagram.relationIds.push(relation.id); }
			break;
		}
		case 'sequenceOrder': {
			const diagram = view(edit.viewId);
			if (diagram.kind !== 'sequence') { throw new Error(`Not a sequence diagram: ${diagram.id}`); }
			const entries = edit.target === 'participant' ? diagram.nodes.map(node => node.elementId) : diagram.relationIds.filter(id => isSequenceMessage(candidate.semantics.relations.find(relation => relation.id === id)!));
			const index = entries.indexOf(edit.id);
			if (index < 0) { throw new Error(`Unknown sequence entry: ${edit.id}`); }
			const next = index + edit.direction;
			if (edit.target === 'participant') {
				if (next >= 0 && next < diagram.nodes.length) { [diagram.nodes[index], diagram.nodes[next]] = [diagram.nodes[next], diagram.nodes[index]]; }
			} else if (next >= 0 && next < entries.length) {
				const from = diagram.relationIds.indexOf(edit.id);
				const to = diagram.relationIds.indexOf(entries[next]);
				[diagram.relationIds[from], diagram.relationIds[to]] = [diagram.relationIds[to], diagram.relationIds[from]];
			}
			break;
		}
		case 'sequenceRemove': {
			const diagram = view(edit.viewId);
			if (diagram.kind !== 'sequence') { throw new Error(`Not a sequence diagram: ${diagram.id}`); }
			excludeFromView(candidate, diagram, edit.id, edit.target === 'participant' ? 'element' : 'relation');
			break;
		}
		case 'rename': {
			const target = edit.target === 'diagram' ? view(edit.id) : candidate.semantics.elements.find(element => element.id === edit.id);
			if (!target) { throw new Error(`Unknown element: ${edit.id}`); }
			target.name = edit.name;
			break;
		}
		case 'description': {
			const element = candidate.semantics.elements.find(element => element.id === edit.id);
			if (!element) { throw new Error(`Unknown element: ${edit.id}`); }
			element.description = edit.description;
			break;
		}
		case 'renameRelation': {
			const relation = candidate.semantics.relations.find(relation => relation.id === edit.id);
			if (!relation) { throw new Error(`Unknown relation: ${edit.id}`); }
			relation.name = edit.name;
			break;
		}
		case 'parent': {
			if ((candidate.version === 4 || candidate.version === 5)) { throw new Error('Edit architectural ownership and feature membership separately in v4'); }
			const element = candidate.semantics.elements.find(element => element.id === edit.id);
			if (!element) { throw new Error(`Unknown element: ${edit.id}`); }
			if (edit.parentId) { element.parentId = edit.parentId; } else { delete element.parentId; }
			break;
		}
		case 'elementDetails': {
			const element = candidate.semantics.elements.find(element => element.id === edit.id);
			if (!element) { throw new Error(`Unknown element: ${edit.id}`); }
			element.details = structuredClone(edit.details);
			break;
		}
		case 'relationDetails': {
			const relation = candidate.semantics.relations.find(relation => relation.id === edit.id);
			if (!relation) { throw new Error(`Unknown relation: ${edit.id}`); }
			relation.details = structuredClone(edit.details);
			break;
		}
		case 'condition': {
			const relation = candidate.semantics.relations.find(relation => relation.id === edit.id);
			if (!relation) { throw new Error(`Unknown relation: ${edit.id}`); }
			if (edit.condition.trim()) { relation.condition = edit.condition; } else { delete relation.condition; }
			break;
		}
		case 'behavior': {
			const element = candidate.semantics.elements.find(element => element.id === edit.id);
			if (!element) { throw new Error(`Unknown element: ${edit.id}`); }
			element.behavior = structuredClone(edit.behavior);
			break;
		}
		case 'relationError': {
			const relation = candidate.semantics.relations.find(relation => relation.id === edit.id);
			if (!relation) { throw new Error(`Unknown relation: ${edit.id}`); }
			if (edit.errorCode) { relation.errorCode = edit.errorCode; } else { delete relation.errorCode; }
			break;
		}
		case 'position': {
			const node = view(edit.viewId).nodes.find(node => node.elementId === edit.id);
			if (!node) { throw new Error(`Unknown node: ${edit.id}`); }
			node.x = edit.x;
			node.y = edit.y;
			break;
		}
		case 'updateRelation': {
			const relation = candidate.semantics.relations.find(relation => relation.id === edit.id);
			if (!relation) { throw new Error(`Unknown relation: ${edit.id}`); }
			Object.assign(relation, { from: edit.from, to: edit.to, kind: edit.relationKind, name: edit.name });
			delete relation.classification;
			for (const diagram of candidate.views.filter(diagram => diagram.relationIds.includes(edit.id))) {
				if (diagram.kind === 'sequence' && !isSequenceMessage(relation)) { throw new Error('Unsupported sequence message'); }
				if (diagram.kind === 'state' && !isResourceTransition(candidate, relation)) { throw new Error('Unsupported resource transition'); }
			}
			delete relation.condition; delete relation.errorCode;
			if (edit.condition) { relation.condition = edit.condition; }
			if (edit.errorCode) { relation.errorCode = edit.errorCode; }
			break;
		}
		case 'layout':
			view(edit.viewId).nodes = arrangeDiagram(candidate, view(edit.viewId), edit.density);
			break;
		case 'deleteDiagram':
			candidate.views = candidate.views.filter(view => view.id !== edit.id);
			break;
		case 'deleteRelation':
			candidate.semantics.relations = candidate.semantics.relations.filter(relation => relation.id !== edit.id);
			for (const diagram of candidate.views) { diagram.relationIds = diagram.relationIds.filter(id => id !== edit.id); }
			break;
		case 'deleteElement': {
			const impact = getDeletionImpact(candidate, edit.id);
			candidate.semantics.elements = candidate.semantics.elements.filter(element => !impact.elements.includes(element.id));
			candidate.semantics.relations = candidate.semantics.relations.filter(relation => !impact.relations.includes(relation.id));
			candidate.views = candidate.views.filter(view => !view.featureId || !impact.elements.includes(view.featureId));
			for (const diagram of candidate.views) {
				diagram.nodes = diagram.nodes.filter(node => !impact.elements.includes(node.elementId));
				diagram.relationIds = diagram.relationIds.filter(id => !impact.relations.includes(id));
			}
			for (const element of candidate.semantics.elements) {
				if (element.behavior) { element.behavior.permissions = element.behavior.permissions.filter(permission => !impact.elements.includes(permission.actorId)); }
			}
			candidate.codeMappings = candidate.codeMappings.filter(mapping => !impact.elements.includes(mapping.elementId));
			candidate.verifications = candidate.verifications.filter(verification => !impact.elements.includes(verification.elementId));
			break;
		}
	}
	if ((candidate.version === 4 || candidate.version === 5)) {
		const f = candidate.foundation;
		if (edit.kind === 'element' || edit.kind === 'resource') {
			const element = candidate.semantics.elements.find(item => item.id === edit.id)!;
			const parent = candidate.semantics.elements.find(item => item.id === element.parentId);
			if (parent?.kind === 'feature') { f.memberships.push({ id: nextId(), elementId: element.id, featureId: parent.id }); delete element.parentId; }
			else if (parent) { f.ownership.push({ id: nextId(), elementId: element.id, ownerId: parent.id, role: element.kind === 'state' ? 'lifecycle' : 'architecture' }); if (element.kind !== 'state') { delete element.parentId; } }
		}
		if (edit.kind === 'deleteElement' || edit.kind === 'deleteRelation' || edit.kind === 'deleteDiagram') {
			const elementIds = new Set(candidate.semantics.elements.map(item => item.id));
			const relationIds = new Set(candidate.semantics.relations.map(item => item.id));
			for (const element of candidate.semantics.elements) { if (element.parentId && !elementIds.has(element.parentId)) { delete element.parentId; } }
			f.ownership = f.ownership.filter(entry => elementIds.has(entry.elementId) && elementIds.has(entry.ownerId));
			f.memberships = f.memberships.filter(entry => elementIds.has(entry.elementId) && elementIds.has(entry.featureId));
			f.integrations = f.integrations.filter(entry => elementIds.has(entry.consumerId) && elementIds.has(entry.externalId));
			f.platform.bindings = f.platform.bindings.filter(entry => elementIds.has(entry.elementId));
			if (f.migration) { f.migration.unresolvedOwnershipIds = f.migration.unresolvedOwnershipIds.filter(id => elementIds.has(id)); }
			const operations = new Set([...(f.blueprint?.operations.map(operation => operation.id) ?? []), ...candidate.semantics.elements.flatMap(element => [element.behavior?.id, ...(element.details?.members.filter(member => member.kind === 'method').map(member => member.id) ?? [])])]);
			f.occurrences = f.occurrences.filter(entry => elementIds.has(entry.from) && elementIds.has(entry.to) && operations.has(entry.operationId));
			const occurrences = new Set(f.occurrences.map(entry => entry.id));
			for (const frame of f.frames) { frame.occurrenceIds = frame.occurrenceIds.filter(id => occurrences.has(id)); }
			f.interactions = f.interactions.filter(entry => !entry.ownerId || elementIds.has(entry.ownerId));
			if (f.stateMachines) { f.stateMachines = f.stateMachines.filter(machine => elementIds.has(machine.ownerId)); for (const view of candidate.views) { if (view.stateMachineId && !f.stateMachines.some(machine => machine.id === view.stateMachineId)) { delete view.stateMachineId; } } }
			for (const interaction of f.interactions) {
				interaction.occurrenceIds = interaction.occurrenceIds.filter(id => occurrences.has(id));
				if (interaction.legacyRelationOrder) { interaction.legacyRelationOrder = interaction.legacyRelationOrder.filter(id => relationIds.has(id)); }
				if (interaction.legacyViewId && !candidate.views.some(view => view.id === interaction.legacyViewId)) { delete interaction.legacyViewId; }
			}
			const objects = modelObjects(candidate);
			f.assertions = f.assertions.filter(entry => objects.has(`${entry.subject.kind}:${entry.subject.id}`));
		}
		for (const diagram of candidate.views.filter(view => view.kind === 'sequence')) {
			let interaction = f.interactions.find(item => item.legacyViewId === diagram.id);
			if (!interaction) { interaction = { id: nextId(), ...(diagram.featureId ? { ownerId: diagram.featureId } : {}), occurrenceIds: [], frameIds: [], legacyViewId: diagram.id, legacyRelationOrder: [...diagram.relationIds] }; f.interactions.push(interaction); }
			interaction.legacyRelationOrder = [...diagram.relationIds];
		}

		for (const element of candidate.semantics.elements) {
			if (element.behavior) {
				element.behavior.id ??= model.semantics.elements.find(item => item.id === element.id)?.behavior?.id ?? nextId();
				for (const field of [...element.behavior.inputs, ...element.behavior.outputs]) { field.id ??= nextId(); }
			}
			for (const member of element.details?.members ?? []) { member.id ??= nextId(); }
		}
	}
	if (candidate.version === 5) {
		for (const diagram of candidate.views.filter(view => view.spec)) {
			const previous = model.views.find(view => view.id === diagram.id);
			if (!previous) { continue; }
			if (JSON.stringify(previous.nodes) !== JSON.stringify(diagram.nodes)) {
				diagram.spec!.layoutRevision = nextId();
				if (edit.kind === 'position' && edit.viewId === diagram.id && !diagram.spec!.manualIds.includes(edit.id)) { diagram.spec!.manualIds.push(edit.id); }
				if (edit.kind === 'layout' && edit.viewId === diagram.id) { diagram.spec!.manualIds = []; }
			}
			if (JSON.stringify(previous.nodes.map(node => node.elementId)) !== JSON.stringify(diagram.nodes.map(node => node.elementId)) || JSON.stringify(previous.relationIds) !== JSON.stringify(diagram.relationIds)) { diagram.spec!.projectionRevision = nextId(); }
			if (previous.name !== diagram.name || previous.kind !== diagram.kind || previous.subjectId !== diagram.subjectId || previous.interactionId !== diagram.interactionId) { diagram.spec!.revision = nextId(); }
		}
	}
	return (candidate.version === 4 || candidate.version === 5) ? readSemanticDraft(candidate) : readSemanticModel(candidate);
}
