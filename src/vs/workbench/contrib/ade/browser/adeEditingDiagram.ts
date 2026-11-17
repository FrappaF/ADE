/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { SemanticElement } from '../common/modelTypes.js';
import { acceptsNotationElement } from '../common/modelNotation.js';
import { getAvailableDiagramRelations, isDiagramContextElement } from '../common/visualEditSupport.js';
import { elementLabels, relationLabels } from './adeLabels.js';
import { isSequenceMessage } from '../common/sequenceDiagram.js';
import { getStateDiagram, isResourceTransition } from '../common/stateDiagram.js';
import { getElementPath } from '../common/visualNavigation.js';
import { type AdeEditingContext } from './adeEditingContext.js';
import { type AdeEditingCommand } from './adeEditingCommands.js';
import { AdeFormDialog } from './adeFormDialog.js';
import { createAdeDiagramForm, createAdeElementForm } from './adeCreationForms.js';
import { editAdeRelationForm } from './adeRelationForm.js';

/** Collects diagram intent; domain mutation remains in the project service. */
export async function runAdeDiagramCommand(ui: AdeEditingContext, command: Extract<AdeEditingCommand, 'addDiagram' | 'addElement' | 'addExisting' | 'addExistingRelation' | 'addExistingState' | 'includeLifecycle' | 'addTransition' | 'addSequenceMessage' | 'connect' | 'editRelation' | 'removeElementFromDiagram' | 'removeRelationFromDiagram' | 'renameDiagram' | 'deleteDiagram' | 'renameRelation' | 'condition' | 'relationError' | 'deleteRelation' | 'layout'>, id?: string): Promise<void> {
	const view = ui.project.activeView;
	const model = ui.project.model;
	const context = (element: SemanticElement): string => [model.name, ...getElementPath(model, element.id).slice(0, -1).map(parent => parent.name)].join(' / ');
	const selected = model.semantics.elements.find(element => element.id === ui.project.selectedId);
	if (command === 'addDiagram') {
		const edits = await createAdeDiagramForm(ui.container, model, id);
		if (!edits?.length) { return; }
		ui.edit(edits);
		const diagram = edits.find(edit => edit.kind === 'diagram' || edit.kind === 'stateDiagram');
		if (diagram && (diagram.kind === 'diagram' || diagram.kind === 'stateDiagram')) { ui.project.showDiagram(diagram.id); }
	}
	if (command === 'addElement' && view) {
		const value = await createAdeElementForm(ui.container, model, view);
		if (!value) { return; }
		const elementId = generateUuid();
		ui.edit({ kind: 'element', id: elementId, viewId: view.id, name: value.name, elementKind: value.kind, parentId: value.parentId });
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
		const value = await editAdeRelationForm(ui.container, model, { sourceId: selected.id, view });
		if (value) {
			const relationId = generateUuid();
			const { errorCode, ...fields } = value;
			ui.edit([{ kind: 'relation', id: relationId, viewId: view.id, ...fields }, ...(errorCode ? [{ kind: 'relationError' as const, id: relationId, errorCode }] : [])]);
		}
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
		const value = await editAdeRelationForm(ui.container, model, { relation });
		if (value) { ui.edit({ kind: 'updateRelation', id, ...value }); }
	}
	if (command === 'removeElementFromDiagram' && selected && view) {
		ui.edit({ kind: 'exclude', viewId: view.id, id: selected.id, target: 'element' });
	}
	if (command === 'removeRelationFromDiagram' && id && view) {
		ui.edit({ kind: 'exclude', viewId: view.id, id, target: 'relation' });
	}
	if ((command === 'condition' || command === 'renameRelation') && id) {
		const relation = model.semantics.relations.find(relation => relation.id === id);
		if (!relation) { return; }
		const dialog = new AdeFormDialog(ui.container, { title: command === 'condition' ? localize('ade.editCondition', "Edit Condition") : localize('ade.state.eventInput', "Transition Event (Optional)"), description: relation.name });
		try {
			const field = command === 'condition' ? dialog.text(dialog.body, localize('ade.conditionInput', "Condition (Optional)"), relation.condition ?? '', { multiline: true }) : dialog.text(dialog.body, localize('ade.state.eventInput', "Transition Event (Optional)"), relation.name);
			const value = await dialog.open(() => field.value);
			if (value !== undefined) { ui.edit(command === 'condition' ? { kind: 'condition', id, condition: value } : { kind: 'renameRelation', id, name: value }); }
		} finally { dialog.dispose(); }
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
