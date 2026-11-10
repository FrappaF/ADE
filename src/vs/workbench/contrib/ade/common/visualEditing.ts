/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { modelObjects } from './modelFoundation.js';
import { readSemanticDraft, readSemanticModel } from './modelValidation.js';
import { type ModelView, type SemanticModel } from './modelTypes.js';
import { type ModelIdFactory } from './modelMigration.js';
import { type VisualEdit } from './visualEditTypes.js';
import { upgradeVisualModel } from './visualEditSupport.js';
import { applyFoundationVisualEdit } from './visualEditFoundation.js';
import { applyElementsVisualEdit } from './visualEditElements.js';
import { applyViewsVisualEdit } from './visualEditViews.js';
import { applyBehaviorVisualEdit } from './visualEditBehavior.js';

export type { VisualEdit } from './visualEditTypes.js';
export { upgradeVisualModel, getDeletionImpact } from './visualEditSupport.js';

export function applyVisualEdit(model: SemanticModel, edit: VisualEdit, nextId: ModelIdFactory = () => globalThis.crypto.randomUUID()): SemanticModel {
	const candidate = upgradeVisualModel(model);
	const view = (id: string): ModelView => {
		const result = candidate.views.find(view => view.id === id);
		if (!result) { throw new Error(`Unknown diagram: ${id}`); }
		return result;
	};
	switch (edit.kind) {
		case 'taskIntent':
		case 'predicate':
		case 'blueprint':
		case 'decision':
		case 'type':
		case 'integration':
		case 'elementScope':
		case 'ownership':
		case 'membership':
		case 'platformBinding':
		case 'assertion': {
			const result = applyFoundationVisualEdit({ model, candidate, nextId, view }, edit);
			if (result !== undefined) { return result; }
			break;
		}
		case 'feature':
		case 'resource':
		case 'element':
		case 'relation':
		case 'rename':
		case 'description':
		case 'renameRelation':
		case 'parent':
		case 'elementDetails':
		case 'relationDetails':
		case 'condition':
		case 'behavior':
		case 'relationError':
		case 'updateRelation':
		case 'deleteRelation':
		case 'deleteElement': {
			const result = applyElementsVisualEdit({ model, candidate, nextId, view }, edit);
			if (result !== undefined) { return result; }
			break;
		}
		case 'c4View':
		case 'diagram':
		case 'include':
		case 'exclude':
		case 'position':
		case 'layout':
		case 'deleteDiagram': {
			const result = applyViewsVisualEdit({ model, candidate, nextId, view }, edit);
			if (result !== undefined) { return result; }
			break;
		}
		case 'stateDefinition':
		case 'messagingOccurrence':
		case 'messaging':
		case 'viewMessaging':
		case 'stateMachine':
		case 'viewStateMachine':
		case 'interaction':
		case 'viewInteraction':
		case 'stateDiagram':
		case 'stateLifecycle':
		case 'stateTransition':
		case 'sequenceMessage':
		case 'sequenceOrder':
		case 'sequenceRemove': {
			const result = applyBehaviorVisualEdit({ model, candidate, nextId, view }, edit);
			if (result !== undefined) { return result; }
			break;
		}
		default: { const exhaustive: never = edit; throw new Error('Unsupported visual edit: ' + JSON.stringify(exhaustive)); }
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
