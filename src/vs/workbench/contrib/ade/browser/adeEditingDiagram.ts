/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ElementKind, RelationKind, SemanticElement } from '../common/modelTypes.js';
import { acceptsNotationElement, acceptsNotationRelation } from '../common/modelNotation.js';
import { isCompatibleRelation } from '../common/modelValidation.js';
import { getAvailableDiagramRelations, isDiagramContextElement } from '../common/visualEditSupport.js';
import { VisualEdit } from '../common/visualEditing.js';
import { elementLabels, relationLabels, viewLabels } from './adeLabels.js';
import { isSequenceMessage } from '../common/sequenceDiagram.js';
import { getStateDiagram, isResourceTransition } from '../common/stateDiagram.js';
import { getElementPath } from '../common/visualNavigation.js';
import { type AdeEditingContext } from './adeEditingContext.js';
import { type AdeEditingCommand } from './adeEditingCommands.js';

/** Collects diagram intent; domain mutation remains in the project service. */
export async function runAdeDiagramCommand(ui: AdeEditingContext, command: Extract<AdeEditingCommand, 'addDiagram' | 'addElement' | 'addExisting' | 'addExistingRelation' | 'addExistingState' | 'includeLifecycle' | 'addTransition' | 'addSequenceMessage' | 'connect' | 'editRelation' | 'removeElementFromDiagram' | 'removeRelationFromDiagram' | 'renameDiagram' | 'deleteDiagram' | 'renameRelation' | 'condition' | 'relationError' | 'deleteRelation' | 'layout'>, id?: string): Promise<void> {
	const view = ui.project.activeView;
	const model = ui.project.model;
	const context = (element: SemanticElement): string => [model.name, ...getElementPath(model, element.id).slice(0, -1).map(parent => parent.name)].join(' / ');
	const selected = model.semantics.elements.find(element => element.id === ui.project.selectedId);
	if (command === 'addDiagram') {
		const chooseFeature = !!id || model.semantics.elements.some(element => element.kind === 'feature');
		const feature = chooseFeature ? await ui.feature(id) : undefined;
		if (chooseFeature && !feature) { return; }
		const creationLabels: Partial<typeof viewLabels> = { structure: localize('ade.structure', "Structure Diagram"), activity: localize('ade.activity', "Activity Flow"), sequence: localize('ade.sequence', "Sequence Diagram"), state: localize('ade.stateDiagram', "State Diagram") };
		const types = (Object.keys(viewLabels) as (keyof typeof viewLabels)[]).map(kind => ({ label: creationLabels[kind] ?? viewLabels[kind], kind }));
		const title = localize('ade.diagramType', "Diagram Type");
		const common = await ui.quickInput.pick([...types.filter(item => ['structure', 'activity', 'sequence', 'state'].includes(item.kind)), { label: localize('ade.diagram.more', "More Diagram Types"), kind: undefined }], { title });
		if (!common) { return; }
		let kind: { kind: keyof typeof viewLabels } | undefined = common.kind ? { kind: common.kind } : undefined;
		while (!kind) {
			const area = await ui.quickInput.pick([
				{ label: localize('ade.element.architecture', "Architecture"), kinds: ['c4Context', 'c4Container', 'c4Component'] },
				{ label: localize('ade.element.data', "Data"), kinds: ['erd', 'databaseSchema', 'class'] },
				{ label: localize('ade.diagram.implementation', "Implementation"), kinds: ['component', 'package', 'deployment', 'network'] },
				{ label: localize('ade.element.behavior', "Behavior"), kinds: ['useCase', 'dataFlow'] }
			], { title });
			if (!area) { return; }
			const picked = await ui.quickInput.pick([...types.filter(item => area.kinds.includes(item.kind)), { label: localize('ade.element.back', "Back"), kind: undefined }], { title: area.label });
			if (!picked) { return; }
			if (picked.kind) { kind = { kind: picked.kind }; }
		}
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
				edits.push({ kind: 'resource', id: resourceId, name, parentId: feature?.id });
			}
		}
		const name = await ui.name();
		if (!name) { return; }
		const viewId = generateUuid();
		edits.push(kind.kind === 'state' ? { kind: 'stateDiagram', id: viewId, name, featureId: feature?.id, resourceId: resourceId! } : { kind: 'diagram', id: viewId, name, featureId: feature?.id, viewKind: kind.kind });
		ui.edit(edits);
		ui.project.showDiagram(viewId);
	}
	if (command === 'addElement' && view) {
		const scopedC4 = (model.version === 4 || model.version === 5) && !!view.subjectId && ['c4Context', 'c4Container', 'c4Component'].includes(view.kind);
		const candidates = (Object.keys(elementLabels) as ElementKind[])
			.filter(kind => kind !== 'feature' && acceptsNotationElement(view.kind, { kind }))
			.map(kind => ({
				label: kind === 'system' && scopedC4 ? localize('ade.externalSystemElement', "External Software System") : elementLabels[kind],
				description: kind === 'container' && scopedC4 && view.kind === 'c4Component' ? localize('ade.contextContainerElement', "Context Container") : (model.version === 4 || model.version === 5) && view.kind === 'class' && view.subjectId ? localize('ade.contractContextElement', "Contract Diagram Context") : undefined,
				kind
			}));
		const title = localize('ade.elementType', "Element Type");
		let kind: { kind: ElementKind } | undefined;
		if (view.kind === 'state') { kind = { kind: 'state' }; }
		else if (candidates.length <= 6) { kind = await ui.quickInput.pick(candidates, { title }); }
		else {
			const common = candidates.filter(item => ['actor', 'component', 'resource', 'view'].includes(item.kind));
			const choice = await ui.quickInput.pick([...common, { label: localize('ade.element.more', "More Element Types"), kind: undefined }], { title });
			if (!choice) { return; }
			if (choice.kind) { kind = { kind: choice.kind }; }
			else {
				const areas = [
					{ label: localize('ade.element.architecture', "Architecture"), kinds: ['system', 'container', 'package'] },
					{ label: localize('ade.element.data', "Data"), kinds: ['entity', 'table', 'class', 'contract', 'dataStore'] },
					{ label: localize('ade.element.interfaces', "Interfaces"), kinds: ['interface'] },
					{ label: localize('ade.element.behavior', "Behavior"), kinds: ['controller', 'action', 'state', 'useCase', 'process'] },
					{ label: localize('ade.element.flow', "Flow"), kinds: ['decision', 'start', 'end'] },
					{ label: localize('ade.element.infrastructure', "Infrastructure"), kinds: ['deploymentNode', 'artifact', 'networkNode'] }
				].filter(area => candidates.some(item => area.kinds.includes(item.kind)));
				while (!kind) {
					const area = await ui.quickInput.pick(areas, { title }); if (!area) { return; }
					const picked = await ui.quickInput.pick([...candidates.filter(item => area.kinds.includes(item.kind)), { label: localize('ade.element.back', "Back"), kind: undefined }], { title: area.label });
					if (!picked) { return; }
					if (picked.kind) { kind = { kind: picked.kind }; }
				}
			}
		}
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
		const candidates = model.semantics.elements.filter(element => !view.nodes.some(node => node.elementId === element.id)
			&& acceptsNotationElement(view.kind, element)
			&& (command !== 'addExistingState' || element.kind === 'state')
			&& (!resources || element.kind !== 'state' || resources.has(element.parentId ?? ''))).map(element => ({ label: element.name, description: isDiagramContextElement(model, view, element.id) ? localize('ade.includeContext', "Context · {0}", elementLabels[element.kind]) : elementLabels[element.kind], detail: context(element), element }));
		if (!candidates.length) {
			await ui.dialogs.info(command === 'addExistingState' ? localize('ade.state.noExisting', "No Existing States to Add") : localize('ade.noExisting', "No Existing Elements to Add"), localize('ade.noExistingHelp', "There are no compatible elements available to add to {0}. Use {1} to create one.", view.name, view.kind === 'state' ? localize('ade.state.addState', "Add State") : localize('ade.addElement', "Add Element")));
			return;
		}
		const picked = await ui.quickInput.pick(candidates, { title: command === 'addExistingState' ? localize('ade.state.addExisting', "Add Existing State") : localize('ade.include', "Add Existing Element") });
		if (picked) {
			ui.edit({ kind: 'include', id: picked.element.id, viewId: view.id });
			ui.project.selectElement(picked.element.id);
		}
	}
	if (command === 'addExistingRelation' && view) {
		const names = new Map(model.semantics.elements.map(element => [element.id, element.name]));
		const candidates = getAvailableDiagramRelations(model, view).map(relation => ({
			label: localize('ade.existingRelation', "{0} → {1}: {2}", names.get(relation.from)!, names.get(relation.to)!, relation.name), description: relationLabels[relation.kind], relation
		}));
		if (!candidates.length) {
			await ui.dialogs.info(localize('ade.noExistingRelations', "No Existing Relationships to Add"), localize('ade.noExistingRelationsHelp', "Include both endpoints with Add Existing Element first. Only compatible relationships that are not already in this diagram are available. Use Connect to create a new relationship."));
			return;
		}
		const picked = await ui.quickInput.pick(candidates, { title: localize('ade.addExistingRelation', "Add Existing Relationship") });
		if (picked) { ui.edit({ kind: 'includeRelation', viewId: view.id, id: picked.relation.id }); }
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
