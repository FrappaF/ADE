import { localize } from '../../../../nls.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { SemanticElement } from '../common/modelTypes.js';
import { acceptsNotationElement } from '../common/modelNotation.js';
import { getAvailableDiagramRelations, isDiagramContextElement } from '../common/visualEditSupport.js';
import { elementLabels, relationLabels } from './orditoLabels.js';
import { isSequenceMessage } from '../common/sequenceDiagram.js';
import { getStateDiagram, isResourceTransition } from '../common/stateDiagram.js';
import { getEditableScenario, getElementPath } from '../common/visualNavigation.js';
import { type OrditoEditingContext } from './orditoEditingContext.js';
import { type OrditoEditingCommand } from './orditoEditingCommands.js';
import { OrditoFormDialog } from './orditoFormDialog.js';
import { createOrditoDiagramForm, createOrditoElementForm } from './orditoCreationForms.js';
import { editOrditoRelationForm } from './orditoRelationForm.js';
import { editOrditoDescriptiveMessage } from './orditoDescriptiveInteractionEditing.js';

/** Collects diagram intent; domain mutation remains in the project service. */
export async function runOrditoDiagramCommand(ui: OrditoEditingContext, command: Extract<OrditoEditingCommand, 'addDiagram' | 'addElement' | 'addExisting' | 'addExistingRelation' | 'addExistingState' | 'includeLifecycle' | 'addTransition' | 'addSequenceMessage' | 'connect' | 'editRelation' | 'removeElementFromDiagram' | 'removeRelationFromDiagram' | 'renameDiagram' | 'deleteDiagram' | 'renameRelation' | 'condition' | 'relationError' | 'deleteRelation' | 'layout'>, id?: string): Promise<void> {
	const view = ui.project.activeView;
	const model = ui.project.model;
	const context = (element: SemanticElement): string => [model.name, ...getElementPath(model, element.id).slice(0, -1).map(parent => parent.name)].join(' / ');
	const selected = model.semantics.elements.find(element => element.id === ui.project.selectedId);
	const scenario = view && getEditableScenario(model, view);
	if (command === 'addDiagram') {
		const edits = await createOrditoDiagramForm(ui.container, model, id);
		if (!edits?.length) { return; }
		ui.edit(edits);
		const diagram = edits.find(edit => edit.kind === 'diagram' || edit.kind === 'stateDiagram');
		if (diagram && (diagram.kind === 'diagram' || diagram.kind === 'stateDiagram')) { ui.project.showDiagram(diagram.id); }
	}
	if (command === 'addElement' && view) {
		const value = await createOrditoElementForm(ui.container, model, view);
		if (!value) { return; }
		const elementId = generateUuid();
		ui.edit({ kind: 'element', id: elementId, viewId: view.id, name: value.name, elementKind: value.kind, parentId: value.parentId });
		ui.project.selectElement(elementId);
	}
	if ((command === 'addExisting' || command === 'addExistingState') && view) {
		const resources = view.kind === 'state' ? new Set(getStateDiagram(model, view).groups.map(group => group.resource.id)) : undefined;
		const candidates = model.semantics.elements.filter(element => !view.nodes.some(node => node.elementId === element.id) && !scenario?.description.participantIds.includes(element.id)
			&& acceptsNotationElement(view.kind, element)
			&& (command !== 'addExistingState' || element.kind === 'state')
			&& (!resources || element.kind !== 'state' || resources.has(element.parentId ?? ''))).map(element => ({ label: element.name, description: isDiagramContextElement(model, view, element.id) ? localize('ordito.includeContext', "Context · {0}", elementLabels[element.kind]) : elementLabels[element.kind], detail: context(element), element }));
		if (!candidates.length) {
			await ui.dialogs.info(command === 'addExistingState' ? localize('ordito.state.noExisting', "No Existing States to Add") : localize('ordito.noExisting', "No Existing Elements to Add"), localize('ordito.noExistingHelp', "There are no compatible elements available to add to {0}. Use {1} to create one.", view.name, view.kind === 'state' ? localize('ordito.state.addState', "Add State") : localize('ordito.addElement', "Add Element")));
			return;
		}
		const picked = await ui.quickInput.pick(candidates, { title: command === 'addExistingState' ? localize('ordito.state.addExisting', "Add Existing State") : localize('ordito.include', "Add Existing Element") });
		if (picked) {
			ui.edit({ kind: 'include', id: picked.element.id, viewId: view.id });
			ui.project.selectElement(picked.element.id);
		}
	}
	if (command === 'addExistingRelation' && view) {
		const names = new Map(model.semantics.elements.map(element => [element.id, element.name]));
		const candidates = getAvailableDiagramRelations(model, view).map(relation => ({
			label: localize('ordito.existingRelation', "{0} → {1}: {2}", names.get(relation.from)!, names.get(relation.to)!, relation.name), description: relationLabels[relation.kind], relation
		}));
		if (!candidates.length) {
			await ui.dialogs.info(localize('ordito.noExistingRelations', "No Existing Relationships to Add"), localize('ordito.noExistingRelationsHelp', "Include both endpoints with Add Existing Element first. Only compatible relationships that are not already in this diagram are available. Use Connect to create a new relationship."));
			return;
		}
		const picked = await ui.quickInput.pick(candidates, { title: localize('ordito.addExistingRelation', "Add Existing Relationship") });
		if (picked) { ui.edit({ kind: 'includeRelation', viewId: view.id, id: picked.relation.id }); }
	}
	if (command === 'includeLifecycle' && view?.kind === 'state') {
		const resources = getStateDiagram(model, view).groups.map(group => group.resource);
		const resource = resources.length === 1 ? resources[0] : (await ui.quickInput.pick(resources.map(resource => ({ label: resource.name, description: context(resource), resource })), { title: localize('ordito.state.pickResource', "Resource Lifecycle") }))?.resource;
		if (resource) { ui.edit({ kind: 'stateLifecycle', viewId: view.id, resourceId: resource.id }); }
	}
	if (command === 'addTransition' && view?.kind === 'state') {
		const resources = new Set(getStateDiagram(model, view).groups.map(group => group.resource.id));
		const names = new Map(model.semantics.elements.map(element => [element.id, element.name]));
		const picked = await ui.quickInput.pick(model.semantics.relations.filter(relation => isResourceTransition(model, relation) && !view.relationIds.includes(relation.id)
			&& resources.has(model.semantics.elements.find(element => element.id === relation.from)!.parentId!)).map(relation => ({ label: localize('ordito.state.existingTransition', "{0} → {1}: {2}", names.get(relation.from)!, names.get(relation.to)!, relation.name), relation })), { title: localize('ordito.state.addTransition', "Add Existing Transition") });
		if (picked) {
			ui.edit({ kind: 'stateTransition', viewId: view.id, id: picked.relation.id });
			ui.project.selectElement(picked.relation.from);
		}
	}
	if (command === 'addSequenceMessage' && view && (view.kind === 'sequence' || scenario)) {
		const names = new Map(model.semantics.elements.map(element => [element.id, element.name]));
		const picked = await ui.quickInput.pick(model.semantics.relations.filter(relation => isSequenceMessage(relation) && (scenario || !view.relationIds.includes(relation.id))).map(relation => ({
			label: localize('ordito.sequence.existing', "{0} → {1}: {2}", names.get(relation.from)!, names.get(relation.to)!, relation.name), description: relationLabels[relation.kind], relation
		})), { title: view.kind === 'activity' ? localize('ordito.scenario.addExistingStep', "Add Existing Step") : localize('ordito.sequence.addMessage', "Add Existing Message") });
		if (picked) {
			ui.edit({ kind: 'sequenceMessage', viewId: view.id, id: picked.relation.id });
			ui.project.selectElement(picked.relation.from);
		}
	}
	if (command === 'connect' && view && scenario) {
		const from = id ?? selected?.id;
		return editOrditoDescriptiveMessage(ui, view, { from: from && scenario.description.participantIds.includes(from) ? from : undefined });
	}
	if (command === 'connect' && view && selected) {
		const value = await editOrditoRelationForm(ui.container, model, { sourceId: selected.id, view });
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
		if ((await ui.dialogs.confirm({ message: localize('ordito.deleteDiagram', "Delete Diagram {0}?", view.name), detail: localize('ordito.keepElements', "Semantic elements and their relationships remain available in the system."), primaryButton: localize('ordito.delete', "Delete") })).confirmed) {
			ui.edit({ kind: 'deleteDiagram', id: view.id });
		}
	}
	if (command === 'editRelation' && id) {
		const relation = model.semantics.relations.find(relation => relation.id === id);
		if (!relation) { return; }
		const value = await editOrditoRelationForm(ui.container, model, { relation });
		if (value) { ui.edit({ kind: 'updateRelation', id, ...value }); }
	}
	if (command === 'removeElementFromDiagram' && view) {
		const element = id ? model.semantics.elements.find(element => element.id === id) : selected;
		if (!element) { return; }
		if (scenario && model.version === 5) {
			const occurrences = model.foundation.occurrences.filter(call => scenario.occurrenceIds.includes(call.id) && (call.from === element.id || call.to === element.id)).length;
			const views = model.views.filter(candidate => candidate.interactionId === scenario.id).length;
			if ((occurrences || views > 1) && !(await ui.dialogs.confirm({
				message: localize('ordito.scenario.removeParticipantConfirm', "Remove {0} from the Scenario?", element.name),
				detail: occurrences
					? localize('ordito.scenario.removeParticipantImpact', "Linked diagrams will also lose the {0} associated steps. The shared element remains in the project.", occurrences)
					: localize('ordito.scenario.removeParticipantShared', "The participant will be removed from every diagram linked to this scenario. The shared element remains in the project."),
				primaryButton: localize('ordito.scenario.removeParticipantAction', "Remove Participant")
			})).confirmed) { return; }
		}
		ui.edit({ kind: 'exclude', viewId: view.id, id: element.id, target: 'element' });
	}
	if (command === 'removeRelationFromDiagram' && id && view) {
		ui.edit({ kind: 'exclude', viewId: view.id, id, target: 'relation' });
	}
	if ((command === 'condition' || command === 'renameRelation') && id) {
		const relation = model.semantics.relations.find(relation => relation.id === id);
		if (!relation) { return; }
		const dialog = new OrditoFormDialog(ui.container, { title: command === 'condition' ? localize('ordito.editCondition', "Edit Condition") : localize('ordito.state.eventInput', "Transition Event (Optional)"), description: relation.name });
		try {
			const field = command === 'condition' ? dialog.text(dialog.body, localize('ordito.conditionInput', "Condition (Optional)"), relation.condition ?? '', { multiline: true }) : dialog.text(dialog.body, localize('ordito.state.eventInput', "Transition Event (Optional)"), relation.name);
			const value = await dialog.open(() => field.value);
			if (value !== undefined) { ui.edit(command === 'condition' ? { kind: 'condition', id, condition: value } : { kind: 'renameRelation', id, name: value }); }
		} finally { dialog.dispose(); }
	}
	if (command === 'relationError' && id) {
		const relation = model.semantics.relations.find(relation => relation.id === id);
		if (!relation) { return; }
		const errors = model.semantics.elements.find(element => element.id === relation.from)?.behavior?.errors ?? [];
		const picked = await ui.quickInput.pick([
			{ label: localize('ordito.noRelationError', "No Error"), errorCode: undefined },
			...errors.map(error => ({ label: error.code, description: error.description, errorCode: error.code }))
		], { title: localize('ordito.relationError', "Relationship Error") });
		if (picked) { ui.edit({ kind: 'relationError', id, errorCode: picked.errorCode }); }
	}
	if (command === 'deleteRelation' && id) {
		if ((await ui.dialogs.confirm({ message: localize('ordito.deleteRelation', "Delete This Relationship from the System and All Diagrams?"), primaryButton: localize('ordito.delete', "Delete") })).confirmed) {
			ui.edit({ kind: 'deleteRelation', id });
		}
	}
	if (command === 'layout' && view) {
		const density = await ui.quickInput.pick([
			{ label: localize('ordito.layout.spacious', "Spacious"), density: 'spacious' as const },
			{ label: localize('ordito.layout.balanced', "Balanced"), density: 'balanced' as const },
			{ label: localize('ordito.layout.compact', "Compact"), density: 'compact' as const }
		], { title: localize('ordito.layout.density', "Diagram Spacing") });
		if (density) { ui.edit({ kind: 'layout', viewId: view.id, density: density.density }); }
	}
}
