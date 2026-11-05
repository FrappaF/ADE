/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IDialogService, IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ElementKind, isCompatibleRelation, RelationKind, SemanticElement } from '../common/semanticModel.js';
import { getDeletionImpact, upgradeVisualModel, VisualEdit } from '../common/visualEditing.js';
import { AdeInput } from './adeInput.js';
import { AdeProjectService, IAdeProjectService } from './adeProjectService.js';
import { elementLabels, relationLabels } from './adeLabels.js';
import { editAdeBehavior } from './adeBehaviorEditing.js';
import { isSequenceMessage } from '../common/sequenceDiagram.js';
import { getStateDiagram, isResourceTransition } from '../common/stateDiagram.js';
import { getElementPath } from '../common/visualNavigation.js';
import { IAdeProjectWorkspaceService } from './adeProjectWorkspace.js';

/** Native dialogs collect intent; atomic edits and persistence remain in the project service. */
class EditingUI {
	projectChanged = false;
	private readonly version: string;
	constructor(
		private readonly project: AdeProjectService,
		private readonly quickInput: IQuickInputService,
		private readonly dialogs: IDialogService,
		private readonly files: IFileDialogService,
	) { this.version = project.documentVersion; }

	private edit(edit: VisualEdit | VisualEdit[]): void {
		if (this.project.documentVersion !== this.version) { throw new Error(localize('ade.staleEdit', "The project changed while the dialog was open. Review the current model and try again.")); }
		this.project.editBatch(Array.isArray(edit) ? edit : [edit]);
	}

	private name(value?: string, title = localize('ade.name', "Name")): Promise<string | undefined> {
		return this.quickInput.input({ title, value,
			validateInput: async value => value.trim() ? undefined : localize('ade.nameRequired', "Enter a name.") });
	}

	private async feature(id?: string): Promise<SemanticElement | undefined> {
		const features = this.project.model.semantics.elements.filter(element => element.kind === 'feature');
		if (id) { return features.find(feature => feature.id === id); }
		const picked = await this.quickInput.pick(features.map(feature => ({ label: feature.name, feature })), { title: localize('ade.pickFeature', "Choose Feature") });
		return picked?.feature;
	}

	async run(command: string, id?: string): Promise<void> {
		if (command === 'createProject' || command === 'openProject') {
			const name = command === 'createProject' ? await this.name() : undefined;
			if (command === 'createProject' && !name) { return; }
			const folders = await this.files.showOpenDialog({ title: localize('ade.projectFolder', "Choose Project Folder"), canSelectFiles: false, canSelectFolders: true, canSelectMany: false });
			if (folders?.[0]) {
				if (name) { this.projectChanged = await this.project.createProject(name, folders[0]); } else { await this.project.openProject(folders[0]); this.projectChanged = !this.project.error; }
			}
			return;
		}
		if (command === 'saveCopy') { await this.project.saveAs(); return; }
		if (command === 'reload') {
			if (!this.project.dirty || (await this.dialogs.confirm({ message: localize('ade.discard', "Discard Unsaved Changes and Reload the Project?"), primaryButton: localize('ade.reload', "Reload") })).confirmed) {
				await this.project.revert();
			}
			return;
		}
		if (!this.project.editable) { return; }
		const view = this.project.activeView;
		const model = this.project.model;
		const context = (element: SemanticElement): string => [model.name, ...getElementPath(model, element.id).slice(0, -1).map(parent => parent.name)].join(' / ');
		const selected = model.semantics.elements.find(element => element.id === this.project.selectedId);
		if (command === 'addFeature') {
			const name = await this.name();
			if (!name) { return; }
			const featureId = generateUuid();
			const structureId = generateUuid();
			this.edit([
				{ kind: 'feature', id: featureId, name },
				{ kind: 'diagram', id: structureId, featureId, name: localize('ade.structureName', "{0} · Structure", name), viewKind: 'structure' },
				{ kind: 'diagram', id: generateUuid(), featureId, name: localize('ade.activityName', "{0} · Flow", name), viewKind: 'activity' }
			]);
			this.project.showDiagram(structureId);
		} else if (command === 'addDiagram') {
			const feature = await this.feature(id);
			if (!feature) { return; }
			const kind = await this.quickInput.pick([
				{ label: localize('ade.structure', "Structure Diagram"), kind: 'structure' as const },
				{ label: localize('ade.activity', "Activity Flow"), kind: 'activity' as const },
				{ label: localize('ade.sequence', "Sequence Diagram"), kind: 'sequence' as const },
				{ label: localize('ade.stateDiagram', "State Diagram"), kind: 'state' as const }
			], { title: localize('ade.diagramType', "Diagram Type") });
			if (!kind) { return; }
			const edits: VisualEdit[] = [];
			let resourceId: string | undefined;
			if (kind.kind === 'state') {
				const resource = await this.quickInput.pick([
					...model.semantics.elements.filter(element => element.kind === 'resource').map(resource => ({ label: resource.name, description: context(resource), resource })),
					{ label: localize('ade.state.createResource', "Create New Resource"), resource: undefined }
				], { title: localize('ade.state.pickResource', "Resource Lifecycle") });
				if (!resource) { return; }
				resourceId = resource.resource?.id;
				if (!resourceId) {
					const name = await this.name(undefined, localize('ade.state.resourceName', "Resource Name"));
					if (!name) { return; }
					resourceId = generateUuid();
					edits.push({ kind: 'resource', id: resourceId, name, parentId: feature.id });
				}
			}
			const name = await this.name();
			if (!name) { return; }
			const viewId = generateUuid();
			edits.push(kind.kind === 'state' ? { kind: 'stateDiagram', id: viewId, name, featureId: feature.id, resourceId: resourceId! } : { kind: 'diagram', id: viewId, name, featureId: feature.id, viewKind: kind.kind });
			this.edit(edits);
			this.project.showDiagram(viewId);
		} else if (command === 'renameFeature' || command === 'deleteFeature') {
			const feature = await this.feature(id);
			if (!feature) { return; }
			if (command === 'deleteFeature') { await this.deleteElement(feature); } else {
				const name = await this.name(feature.name);
				if (name) { this.edit({ kind: 'rename', target: 'element', id: feature.id, name }); }
			}
		} else if (command === 'addElement' && view) {
			const kind = view.kind === 'state' ? { kind: 'state' as const } : await this.quickInput.pick((Object.keys(elementLabels) as ElementKind[]).filter(kind => kind !== 'feature').map(kind => ({ label: elementLabels[kind], kind })), { title: localize('ade.elementType', "Element Type") });
			if (!kind) { return; }
			let parentId: string | undefined;
			if (kind.kind === 'state') {
				const resources = view.kind === 'state' ? getStateDiagram(model, view).groups.map(group => group.resource) : model.semantics.elements.filter(element => element.kind === 'resource');
				const resource = resources.length === 1 ? resources[0] : (await this.quickInput.pick(resources.map(element => ({ label: element.name, description: context(element), element })), { title: localize('ade.stateOwner', "Resource Whose State Is Represented") }))?.element;
				if (!resource) { return; }
				parentId = resource.id;
			}
			const name = await this.name();
			if (!name) { return; }
			const elementId = generateUuid();
			this.edit({ kind: 'element', id: elementId, viewId: view.id, name, elementKind: kind.kind, parentId });
			this.project.selectElement(elementId);
		} else if ((command === 'addExisting' || command === 'addExistingState') && view) {
			const resources = view.kind === 'state' ? new Set(getStateDiagram(model, view).groups.map(group => group.resource.id)) : undefined;
			const picked = await this.quickInput.pick(model.semantics.elements.filter(element => !view.nodes.some(node => node.elementId === element.id)
				&& (command !== 'addExistingState' || element.kind === 'state')
				&& (!resources || element.kind !== 'state' || resources.has(element.parentId ?? ''))).map(element => ({ label: element.name, description: elementLabels[element.kind], detail: context(element), element })), { title: command === 'addExistingState' ? localize('ade.state.addExisting', "Add Existing State") : localize('ade.include', "Add Existing Element") });
			if (picked) {
				this.edit({ kind: 'include', id: picked.element.id, viewId: view.id });
				this.project.selectElement(picked.element.id);
			}
		} else if (command === 'includeLifecycle' && view?.kind === 'state') {
			const resources = getStateDiagram(model, view).groups.map(group => group.resource);
			const resource = resources.length === 1 ? resources[0] : (await this.quickInput.pick(resources.map(resource => ({ label: resource.name, description: context(resource), resource })), { title: localize('ade.state.pickResource', "Resource Lifecycle") }))?.resource;
			if (resource) { this.edit({ kind: 'stateLifecycle', viewId: view.id, resourceId: resource.id }); }
		} else if (command === 'addTransition' && view?.kind === 'state') {
			const resources = new Set(getStateDiagram(model, view).groups.map(group => group.resource.id));
			const names = new Map(model.semantics.elements.map(element => [element.id, element.name]));
			const picked = await this.quickInput.pick(model.semantics.relations.filter(relation => isResourceTransition(model, relation) && !view.relationIds.includes(relation.id)
				&& resources.has(model.semantics.elements.find(element => element.id === relation.from)!.parentId!)).map(relation => ({ label: localize('ade.state.existingTransition', "{0} → {1}: {2}", names.get(relation.from)!, names.get(relation.to)!, relation.name), relation })), { title: localize('ade.state.addTransition', "Add Existing Transition") });
			if (picked) {
				this.edit({ kind: 'stateTransition', viewId: view.id, id: picked.relation.id });
				this.project.selectElement(picked.relation.from);
			}
		} else if (command === 'addSequenceMessage' && view?.kind === 'sequence') {
			const names = new Map(model.semantics.elements.map(element => [element.id, element.name]));
			const picked = await this.quickInput.pick(model.semantics.relations.filter(relation => isSequenceMessage(relation) && !view.relationIds.includes(relation.id)).map(relation => ({
				label: localize('ade.sequence.existing', "{0} → {1}: {2}", names.get(relation.from)!, names.get(relation.to)!, relation.name), description: relationLabels[relation.kind], relation
			})), { title: localize('ade.sequence.addMessage', "Add Existing Message") });
			if (picked) {
				this.edit({ kind: 'sequenceMessage', viewId: view.id, id: picked.relation.id });
				this.project.selectElement(picked.relation.from);
			}
		} else if (command === 'connect' && view && selected) {
			const kinds = (Object.keys(relationLabels) as RelationKind[]).filter(kind => (view.kind !== 'sequence' || isSequenceMessage({ kind })) && (view.kind !== 'state' || kind === 'transition') && view.nodes.some(node => {
				const target = model.semantics.elements.find(element => element.id === node.elementId)!;
				return (target.id !== selected.id || view.kind === 'sequence' || view.kind === 'state') && isCompatibleRelation(kind, selected.kind, target.kind) && (kind !== 'transition' || target.parentId === selected.parentId)
					&& (view.kind !== 'state' || isResourceTransition(model, { id: '', kind, from: selected.id, to: target.id, name: '' }));
			}));
			const kind = await this.quickInput.pick(kinds.map(kind => ({ label: relationLabels[kind], kind })), { title: localize('ade.relationType', "Relationship Type") });
			if (!kind) { return; }
			const targets = model.semantics.elements.filter(target => (target.id !== selected.id || view.kind === 'sequence' || view.kind === 'state') && view.nodes.some(node => node.elementId === target.id)
				&& isCompatibleRelation(kind.kind, selected.kind, target.kind) && (kind.kind !== 'transition' || target.parentId === selected.parentId));
			const target = await this.quickInput.pick(targets.map(element => ({ label: element.name, description: context(element), element })), { title: localize('ade.target', "Target Element") });
			if (!target) { return; }
			const name = await this.quickInput.input({ title: localize('ade.relationName', "Relationship Name") });
			if (name === undefined) { return; }
			const condition = await this.quickInput.input({ title: localize('ade.conditionInput', "Condition (Optional)") });
			if (condition === undefined) { return; }
			this.edit({ kind: 'relation', id: generateUuid(), viewId: view.id, from: selected.id, to: target.element.id, relationKind: kind.kind, name, condition });
		} else if (command === 'renameDiagram' && view) {
			const name = await this.name(view.name);
			if (name) { this.edit({ kind: 'rename', target: 'diagram', id: view.id, name }); }
		} else if (command === 'deleteDiagram' && view) {
			if ((await this.dialogs.confirm({ message: localize('ade.deleteDiagram', "Delete Diagram {0}?", view.name), detail: localize('ade.keepElements', "Semantic elements and their relationships remain available in the system."), primaryButton: localize('ade.delete', "Delete") })).confirmed) {
				this.edit({ kind: 'deleteDiagram', id: view.id });
			}
		} else if (command === 'renameElement' && selected) {
			const name = await this.name(selected.name);
			if (name) { this.edit({ kind: 'rename', target: 'element', id: selected.id, name }); }
		} else if (command === 'description' && selected) {
			const description = await this.quickInput.input({ title: localize('ade.description', "Description"), value: selected.description });
			if (description !== undefined) { this.edit({ kind: 'description', id: selected.id, description }); }
		} else if (command === 'behavior' && selected) {
			const behavior = await editAdeBehavior(this.quickInput, model, selected);
			if (behavior) { this.edit({ kind: 'behavior', id: selected.id, behavior }); }
		} else if (command === 'deleteElement' && selected) {
			await this.deleteElement(selected);
		} else if (command === 'editRelation' && id) {
			const relation = model.semantics.relations.find(relation => relation.id === id);
			if (!relation) { return; }
			const affected = model.views.filter(view => view.relationIds.includes(id));
			const candidates = model.semantics.elements.filter(element => affected.every(view => view.nodes.some(node => node.elementId === element.id)));
			const from = await this.quickInput.pick(candidates.map(element => ({ label: element.name, description: context(element), element, picked: element.id === relation.from })), { title: localize('ade.relation.source', "Relationship Source") });
			if (!from) { return; }
			const supported = (kind: RelationKind, target: SemanticElement): boolean => isCompatibleRelation(kind, from.element.kind, target.kind)
				&& (kind !== 'transition' || from.element.parentId === target.parentId)
				&& affected.every(view => view.kind !== 'sequence' || isSequenceMessage({ kind }))
				&& affected.every(view => view.kind !== 'state' || isResourceTransition(model, { ...relation, from: from.element.id, to: target.id, kind }));
			const kind = await this.quickInput.pick((Object.keys(relationLabels) as RelationKind[]).filter(kind => candidates.some(target => supported(kind, target))).map(kind => ({ label: relationLabels[kind], kind, picked: kind === relation.kind })), { title: localize('ade.relationType', "Relationship Type") });
			if (!kind) { return; }
			const to = await this.quickInput.pick(candidates.filter(target => supported(kind.kind, target)).map(element => ({ label: element.name, element, picked: element.id === relation.to })), { title: localize('ade.target', "Target Element") });
			if (!to) { return; }
			const name = await this.quickInput.input({ title: localize('ade.relationName', "Relationship Name"), value: relation.name });
			if (name === undefined) { return; }
			const condition = await this.quickInput.input({ title: localize('ade.conditionInput', "Condition (Optional)"), value: relation.condition });
			if (condition === undefined) { return; }
			const error = await this.quickInput.pick([{ label: localize('ade.noRelationError', "No Error"), errorCode: undefined as string | undefined }, ...(from.element.behavior?.errors ?? []).map(error => ({ label: error.code, errorCode: error.code }))], { title: localize('ade.relationError', "Relationship Error") });
			if (error) { this.edit({ kind: 'updateRelation', id, from: from.element.id, to: to.element.id, relationKind: kind.kind, name, condition, errorCode: error.errorCode }); }
		} else if (command === 'removeElementFromDiagram' && selected && view) {
			this.edit({ kind: 'exclude', viewId: view.id, id: selected.id, target: 'element' });
		} else if (command === 'removeRelationFromDiagram' && id && view) {
			this.edit({ kind: 'exclude', viewId: view.id, id, target: 'relation' });
		} else if (command === 'condition' && id) {
			const relation = model.semantics.relations.find(relation => relation.id === id);
			if (!relation) { return; }
			const condition = await this.quickInput.input({ title: localize('ade.conditionInput', "Condition (Optional)"), value: relation.condition });
			if (condition !== undefined) { this.edit({ kind: 'condition', id, condition }); }
		} else if (command === 'renameRelation' && id) {
			const relation = model.semantics.relations.find(relation => relation.id === id);
			if (!relation) { return; }
			const name = await this.quickInput.input({ title: localize('ade.state.eventInput', "Transition Event (Optional)"), value: relation.name });
			if (name !== undefined) { this.edit({ kind: 'renameRelation', id, name }); }
		} else if (command === 'relationError' && id) {
			const relation = model.semantics.relations.find(relation => relation.id === id);
			if (!relation) { return; }
			const errors = model.semantics.elements.find(element => element.id === relation.from)?.behavior?.errors ?? [];
			const picked = await this.quickInput.pick([
				{ label: localize('ade.noRelationError', "No Error"), errorCode: undefined },
				...errors.map(error => ({ label: error.code, description: error.description, errorCode: error.code }))
			], { title: localize('ade.relationError', "Relationship Error") });
			if (picked) { this.edit({ kind: 'relationError', id, errorCode: picked.errorCode }); }
		} else if (command === 'deleteRelation' && id) {
			if ((await this.dialogs.confirm({ message: localize('ade.deleteRelation', "Delete This Relationship from the System and All Diagrams?"), primaryButton: localize('ade.delete', "Delete") })).confirmed) {
				this.edit({ kind: 'deleteRelation', id });
			}
		} else if (command === 'layout' && view) {
			const density = await this.quickInput.pick([
				{ label: localize('ade.layout.balanced', "Balanced"), density: 'balanced' as const },
				{ label: localize('ade.layout.spacious', "Spacious"), density: 'spacious' as const },
				{ label: localize('ade.layout.compact', "Compact"), density: 'compact' as const }
			], { title: localize('ade.layout.density', "Diagram Spacing") });
			if (density) { this.edit({ kind: 'layout', viewId: view.id, density: density.density }); }
		}
	}

	private async deleteElement(element: SemanticElement): Promise<void> {
		const impact = getDeletionImpact(upgradeVisualModel(this.project.model), element.id);
		if ((await this.dialogs.confirm({
			message: localize('ade.deleteElement', "Delete {0} from the System?", element.name),
			detail: localize('ade.deleteImpact', "This removes {0} elements and {1} relationships, affects {2} diagrams, and removes {3} code mappings, {4} verification records and {5} authorization references. Owned feature diagrams are deleted. This can be undone.", impact.elements.length, impact.relations.length, impact.views.length, impact.mappings, impact.verifications, impact.permissions),
			primaryButton: localize('ade.delete', "Delete")
		})).confirmed) { this.edit({ kind: 'deleteElement', id: element.id }); }
	}
}

for (const [command, title] of [
	['createProject', localize2('ade.createProject', "A.D.E: Create Project")],
	['openProject', localize2('ade.openProject', "A.D.E: Open Project")],
	['addFeature', localize2('ade.addFeature', "A.D.E: Add Feature")],
	['addDiagram', localize2('ade.addDiagram', "A.D.E: Add Diagram")],
	['addElement', localize2('ade.addElement', "A.D.E: Add Element")],
	['addExisting', localize2('ade.addExisting', "A.D.E: Add Existing Element")],
	['addExistingState', localize2('ade.state.addExisting.command', "A.D.E: Add Existing State")],
	['includeLifecycle', localize2('ade.state.includeLifecycle.command', "A.D.E: Include Resource Lifecycle")],
	['addTransition', localize2('ade.state.addTransition.command', "A.D.E: Add Existing Transition")],
	['renameRelation', localize2('ade.state.event.command', "A.D.E: Edit Transition Event")],
	['addSequenceMessage', localize2('ade.sequence.addMessage.command', "A.D.E: Add Existing Message")],
	['connect', localize2('ade.connect', "A.D.E: Connect Selection")],
	['editRelation', localize2('ade.editRelation.command', "A.D.E: Edit Relationship")],
	['removeElementFromDiagram', localize2('ade.removeElement.command', "A.D.E: Remove Element from Diagram")],
	['removeRelationFromDiagram', localize2('ade.removeRelation.command', "A.D.E: Remove Relationship from Diagram")],
	['renameFeature', localize2('ade.renameFeature', "A.D.E: Rename Feature")],
	['deleteFeature', localize2('ade.deleteFeature', "A.D.E: Delete Feature")],
	['renameDiagram', localize2('ade.renameDiagram', "A.D.E: Rename Diagram")],
	['deleteDiagram', localize2('ade.deleteDiagram.command', "A.D.E: Delete Diagram")],
	['renameElement', localize2('ade.renameElement', "A.D.E: Rename Element")],
	['description', localize2('ade.description.command', "A.D.E: Edit Description")],
	['behavior', localize2('ade.behavior.command', "A.D.E: Edit Behavioral Contract")],
	['deleteElement', localize2('ade.deleteElement.command', "A.D.E: Delete Element")],
	['condition', localize2('ade.condition', "A.D.E: Edit Condition")],
	['relationError', localize2('ade.relationError.command', "A.D.E: Edit Relationship Error")],
	['deleteRelation', localize2('ade.deleteRelation.command', "A.D.E: Delete Relationship")],
	['layout', localize2('ade.layout', "A.D.E: Arrange Diagram")],
	['reload', localize2('ade.reload.command', "A.D.E: Reload Project")],
	['saveCopy', localize2('ade.saveCopy', "A.D.E: Save Project Copy")]
] as const) {
	registerAction2(class extends Action2 {
		constructor() { super({ id: `ade.${command}`, title, f1: true }); }
		async run(accessor: ServicesAccessor, id?: string): Promise<void> {
			const project = accessor.get(IAdeProjectService);
			const editor = accessor.get(IEditorService);
			const notifications = accessor.get(INotificationService);
			const workspace = command === 'createProject' || command === 'openProject' ? accessor.get(IAdeProjectWorkspaceService) : undefined;
			const ui = new EditingUI(project, accessor.get(IQuickInputService), accessor.get(IDialogService), accessor.get(IFileDialogService));
			try {
				await ui.run(command, id);
				if (ui.projectChanged) { await workspace?.align(); }
				await editor.openEditor({ resource: AdeInput.RESOURCE, options: { pinned: true, revealIfOpened: true } });
			} catch (error) { notifications.error(localize('ade.editFailed', "Could not complete the project change: {0}", String(error.message ?? error))); }
		}
	});
}
