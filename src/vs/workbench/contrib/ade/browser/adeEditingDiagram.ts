/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ElementKind, RelationKind, SemanticElement } from '../common/modelTypes.js';
import { acceptsNotationElement, acceptsNotationRelation } from '../common/modelNotation.js';
import { isCompatibleRelation } from '../common/modelValidation.js';
import { VisualEdit } from '../common/visualEditing.js';
import { elementLabels, relationLabels, viewLabels } from './adeLabels.js';
import { isSequenceMessage } from '../common/sequenceDiagram.js';
import { getStateDiagram, isResourceTransition } from '../common/stateDiagram.js';
import { getElementPath } from '../common/visualNavigation.js';
import { type AdeEditingContext } from './adeEditingContext.js';
import { type AdeEditingCommand } from './adeEditingCommands.js';

/** Collects diagram intent; domain mutation remains in the project service. */
export async function runAdeDiagramCommand(ui: AdeEditingContext, command: Extract<AdeEditingCommand, 'addDiagram' | 'addElement' | 'addExisting' | 'addExistingState' | 'includeLifecycle' | 'addTransition' | 'addSequenceMessage' | 'connect' | 'editRelation' | 'removeElementFromDiagram' | 'removeRelationFromDiagram' | 'renameDiagram' | 'deleteDiagram' | 'renameRelation' | 'condition' | 'relationError' | 'deleteRelation' | 'layout'>, id?: string): Promise<void> {
	const view = ui.project.activeView;
	const model = ui.project.model;
	const context = (element: SemanticElement): string => [model.name, ...getElementPath(model, element.id).slice(0, -1).map(parent => parent.name)].join(' / ');
	const selected = model.semantics.elements.find(element => element.id === ui.project.selectedId);
	if (command === 'addDiagram') {
		const feature = await ui.feature(id);
		if (!feature) { return; }
		const creationLabels: Partial<typeof viewLabels> = { structure: localize('ade.structure', "Structure Diagram"), activity: localize('ade.activity', "Activity Flow"), sequence: localize('ade.sequence', "Sequence Diagram"), state: localize('ade.stateDiagram', "State Diagram") };
		const kind = await ui.quickInput.pick((Object.keys(viewLabels) as (keyof typeof viewLabels)[]).map(kind => ({ label: creationLabels[kind] ?? viewLabels[kind], kind })), { title: localize('ade.diagramType', "Diagram Type") });
		if (!kind) { return; }
		const edits: VisualEdit[] = [];
		let resourceId: string | undefined;
		if (kind.kind === 'state') {
			const resource = await ui.quickInput.pick([
				...model.semantics.elements.filter(element => element.kind === 'resource').map(resource => ({ label: resource.name, description: context(resource), resource })),
				{ label: localize('ade.state.createResource', "Create New Resource"), resource: undefined }
			], { title: localize('ade.state.pickResource', "Resource Lifecycle") });
			if (!resource) { return; }
			resourceId = resource.resource?.id;
			if (!resourceId) {
				const name = await ui.name(undefined, localize('ade.state.resourceName', "Resource Name"));
				if (!name) { return; }
				resourceId = generateUuid();
				edits.push({ kind: 'resource', id: resourceId, name, parentId: feature.id });
			}
		}
		const name = await ui.name();
		if (!name) { return; }
		const viewId = generateUuid();
		edits.push(kind.kind === 'state' ? { kind: 'stateDiagram', id: viewId, name, featureId: feature.id, resourceId: resourceId! } : { kind: 'diagram', id: viewId, name, featureId: feature.id, viewKind: kind.kind });
		ui.edit(edits);
		ui.project.showDiagram(viewId);
	}
	if (command === 'addElement' && view) {
		const kind = view.kind === 'state' ? { kind: 'state' as const } : await ui.quickInput.pick((Object.keys(elementLabels) as ElementKind[]).filter(kind => kind !== 'feature' && acceptsNotationElement(view.kind, { kind })).map(kind => ({ label: elementLabels[kind], kind })), { title: localize('ade.elementType', "Element Type") });
		if (!kind) { return; }
		let parentId: string | undefined;
		if (kind.kind === 'state') {
			const resources = view.kind === 'state' ? getStateDiagram(model, view).groups.map(group => group.resource) : model.semantics.elements.filter(element => element.kind === 'resource');
			const resource = resources.length === 1 ? resources[0] : (await ui.quickInput.pick(resources.map(element => ({ label: element.name, description: context(element), element })), { title: localize('ade.stateOwner', "Resource Whose State Is Represented") }))?.element;
			if (!resource) { return; }
			parentId = resource.id;
		}
		const name = await ui.name();
		if (!name) { return; }
		const elementId = generateUuid();
		ui.edit({ kind: 'element', id: elementId, viewId: view.id, name, elementKind: kind.kind, parentId });
		ui.project.selectElement(elementId);
	}
	if ((command === 'addExisting' || command === 'addExistingState') && view) {
		const resources = view.kind === 'state' ? new Set(getStateDiagram(model, view).groups.map(group => group.resource.id)) : undefined;
		const picked = await ui.quickInput.pick(model.semantics.elements.filter(element => !view.nodes.some(node => node.elementId === element.id)
			&& acceptsNotationElement(view.kind, element)
			&& (command !== 'addExistingState' || element.kind === 'state')
			&& (!resources || element.kind !== 'state' || resources.has(element.parentId ?? ''))).map(element => ({ label: element.name, description: elementLabels[element.kind], detail: context(element), element })), { title: command === 'addExistingState' ? localize('ade.state.addExisting', "Add Existing State") : localize('ade.include', "Add Existing Element") });
		if (picked) {
			ui.edit({ kind: 'include', id: picked.element.id, viewId: view.id });
			ui.project.selectElement(picked.element.id);
		}
	}
	if (command === 'includeLifecycle' && view?.kind === 'state') {
		const resources = getStateDiagram(model, view).groups.map(group => group.resource);
		const resource = resources.length === 1 ? resources[0] : (await ui.quickInput.pick(resources.map(resource => ({ label: resource.name, description: context(resource), resource })), { title: localize('ade.state.pickResource', "Resource Lifecycle") }))?.resource;
		if (resource) { ui.edit({ kind: 'stateLifecycle', viewId: view.id, resourceId: resource.id }); }
	}
	if (command === 'addTransition' && view?.kind === 'state') {
		const resources = new Set(getStateDiagram(model, view).groups.map(group => group.resource.id));
		const names = new Map(model.semantics.elements.map(element => [element.id, element.name]));
		const picked = await ui.quickInput.pick(model.semantics.relations.filter(relation => isResourceTransition(model, relation) && !view.relationIds.includes(relation.id)
			&& resources.has(model.semantics.elements.find(element => element.id === relation.from)!.parentId!)).map(relation => ({ label: localize('ade.state.existingTransition', "{0} → {1}: {2}", names.get(relation.from)!, names.get(relation.to)!, relation.name), relation })), { title: localize('ade.state.addTransition', "Add Existing Transition") });
		if (picked) {
			ui.edit({ kind: 'stateTransition', viewId: view.id, id: picked.relation.id });
			ui.project.selectElement(picked.relation.from);
		}
	}
	if (command === 'addSequenceMessage' && view?.kind === 'sequence') {
		const names = new Map(model.semantics.elements.map(element => [element.id, element.name]));
		const picked = await ui.quickInput.pick(model.semantics.relations.filter(relation => isSequenceMessage(relation) && !view.relationIds.includes(relation.id)).map(relation => ({
			label: localize('ade.sequence.existing', "{0} → {1}: {2}", names.get(relation.from)!, names.get(relation.to)!, relation.name), description: relationLabels[relation.kind], relation
		})), { title: localize('ade.sequence.addMessage', "Add Existing Message") });
		if (picked) {
			ui.edit({ kind: 'sequenceMessage', viewId: view.id, id: picked.relation.id });
			ui.project.selectElement(picked.relation.from);
		}
	}
	if (command === 'connect' && view && selected) {
		const kinds = (Object.keys(relationLabels) as RelationKind[]).filter(kind => acceptsNotationRelation(view.kind, { kind }) && (view.kind !== 'sequence' || isSequenceMessage({ kind })) && (view.kind !== 'state' || kind === 'transition') && view.nodes.some(node => {
			const target = model.semantics.elements.find(element => element.id === node.elementId)!;
			return (target.id !== selected.id || view.kind === 'sequence' || view.kind === 'state') && isCompatibleRelation(kind, selected.kind, target.kind) && (kind !== 'transition' || target.parentId === selected.parentId)
				&& (view.kind !== 'state' || isResourceTransition(model, { id: '', kind, from: selected.id, to: target.id, name: '' }));
		}));
		const kind = await ui.quickInput.pick(kinds.map(kind => ({ label: relationLabels[kind], kind })), { title: localize('ade.relationType', "Relationship Type") });
		if (!kind) { return; }
		const targets = model.semantics.elements.filter(target => (target.id !== selected.id || view.kind === 'sequence' || view.kind === 'state') && view.nodes.some(node => node.elementId === target.id)
			&& isCompatibleRelation(kind.kind, selected.kind, target.kind) && (kind.kind !== 'transition' || target.parentId === selected.parentId));
		const target = await ui.quickInput.pick(targets.map(element => ({ label: element.name, description: context(element), element })), { title: localize('ade.target', "Target Element") });
		if (!target) { return; }
		const name = await ui.quickInput.input({ title: localize('ade.relationName', "Relationship Name") });
		if (name === undefined) { return; }
		const condition = await ui.quickInput.input({ title: localize('ade.conditionInput', "Condition (Optional)") });
		if (condition === undefined) { return; }
		ui.edit({ kind: 'relation', id: generateUuid(), viewId: view.id, from: selected.id, to: target.element.id, relationKind: kind.kind, name, condition });
	}
	if (command === 'renameDiagram' && view) {
		const name = await ui.name(view.name);
		if (name) { ui.edit({ kind: 'rename', target: 'diagram', id: view.id, name }); }
	}
	if (command === 'deleteDiagram' && view) {
		if ((await ui.dialogs.confirm({ message: localize('ade.deleteDiagram', "Delete Diagram {0}?", view.name), detail: localize('ade.keepElements', "Semantic elements and their relationships remain available in the system."), primaryButton: localize('ade.delete', "Delete") })).confirmed) {
			ui.edit({ kind: 'deleteDiagram', id: view.id });
		}
	}
	if (command === 'editRelation' && id) {
		const relation = model.semantics.relations.find(relation => relation.id === id);
		if (!relation) { return; }
		const affected = model.views.filter(view => view.relationIds.includes(id));
		const candidates = model.semantics.elements.filter(element => affected.every(view => view.nodes.some(node => node.elementId === element.id)));
		const from = await ui.quickInput.pick(candidates.map(element => ({ label: element.name, description: context(element), element, picked: element.id === relation.from })), { title: localize('ade.relation.source', "Relationship Source") });
		if (!from) { return; }
		const supported = (kind: RelationKind, target: SemanticElement): boolean => isCompatibleRelation(kind, from.element.kind, target.kind)
			&& affected.every(view => acceptsNotationRelation(view.kind, { kind }))
			&& (kind !== 'transition' || from.element.parentId === target.parentId)
			&& affected.every(view => view.kind !== 'sequence' || isSequenceMessage({ kind }))
			&& affected.every(view => view.kind !== 'state' || isResourceTransition(model, { ...relation, from: from.element.id, to: target.id, kind }));
		const kind = await ui.quickInput.pick((Object.keys(relationLabels) as RelationKind[]).filter(kind => candidates.some(target => supported(kind, target))).map(kind => ({ label: relationLabels[kind], kind, picked: kind === relation.kind })), { title: localize('ade.relationType', "Relationship Type") });
		if (!kind) { return; }
		const to = await ui.quickInput.pick(candidates.filter(target => supported(kind.kind, target)).map(element => ({ label: element.name, element, picked: element.id === relation.to })), { title: localize('ade.target', "Target Element") });
		if (!to) { return; }
		const name = await ui.quickInput.input({ title: localize('ade.relationName', "Relationship Name"), value: relation.name });
		if (name === undefined) { return; }
		const condition = await ui.quickInput.input({ title: localize('ade.conditionInput', "Condition (Optional)"), value: relation.condition });
		if (condition === undefined) { return; }
		const error = await ui.quickInput.pick([{ label: localize('ade.noRelationError', "No Error"), errorCode: undefined as string | undefined }, ...(from.element.behavior?.errors ?? []).map(error => ({ label: error.code, errorCode: error.code }))], { title: localize('ade.relationError', "Relationship Error") });
		if (error) { ui.edit({ kind: 'updateRelation', id, from: from.element.id, to: to.element.id, relationKind: kind.kind, name, condition, errorCode: error.errorCode }); }
	}
	if (command === 'removeElementFromDiagram' && selected && view) {
		ui.edit({ kind: 'exclude', viewId: view.id, id: selected.id, target: 'element' });
	}
	if (command === 'removeRelationFromDiagram' && id && view) {
		ui.edit({ kind: 'exclude', viewId: view.id, id, target: 'relation' });
	}
	if (command === 'condition' && id) {
		const relation = model.semantics.relations.find(relation => relation.id === id);
		if (!relation) { return; }
		const condition = await ui.quickInput.input({ title: localize('ade.conditionInput', "Condition (Optional)"), value: relation.condition });
		if (condition !== undefined) { ui.edit({ kind: 'condition', id, condition }); }
	}
	if (command === 'renameRelation' && id) {
		const relation = model.semantics.relations.find(relation => relation.id === id);
		if (!relation) { return; }
		const name = await ui.quickInput.input({ title: localize('ade.state.eventInput', "Transition Event (Optional)"), value: relation.name });
		if (name !== undefined) { ui.edit({ kind: 'renameRelation', id, name }); }
	}
	if (command === 'relationError' && id) {
		const relation = model.semantics.relations.find(relation => relation.id === id);
		if (!relation) { return; }
		const errors = model.semantics.elements.find(element => element.id === relation.from)?.behavior?.errors ?? [];
		const picked = await ui.quickInput.pick([
			{ label: localize('ade.noRelationError', "No Error"), errorCode: undefined },
			...errors.map(error => ({ label: error.code, description: error.description, errorCode: error.code }))
		], { title: localize('ade.relationError', "Relationship Error") });
		if (picked) { ui.edit({ kind: 'relationError', id, errorCode: picked.errorCode }); }
	}
	if (command === 'deleteRelation' && id) {
		if ((await ui.dialogs.confirm({ message: localize('ade.deleteRelation', "Delete This Relationship from the System and All Diagrams?"), primaryButton: localize('ade.delete', "Delete") })).confirmed) {
			ui.edit({ kind: 'deleteRelation', id });
		}
	}
	if (command === 'layout' && view) {
		const density = await ui.quickInput.pick([
			{ label: localize('ade.layout.spacious', "Spacious"), density: 'spacious' as const },
			{ label: localize('ade.layout.balanced', "Balanced"), density: 'balanced' as const },
			{ label: localize('ade.layout.compact', "Compact"), density: 'compact' as const }
		], { title: localize('ade.layout.density', "Diagram Spacing") });
		if (density) { ui.edit({ kind: 'layout', viewId: view.id, density: density.density }); }
	}
}
