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

/** Native dialogs collect intent; atomic edits and persistence remain in the project service. */
class EditingUI {
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

	private name(value?: string): Promise<string | undefined> {
		return this.quickInput.input({ title: localize('ade.name', "Name"), value,
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
				if (name) { await this.project.createProject(name, folders[0]); } else { await this.project.openProject(folders[0]); }
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
				{ label: localize('ade.activity', "Activity Flow"), kind: 'activity' as const }
			], { title: localize('ade.diagramType', "Diagram Type") });
			if (!kind) { return; }
			const name = await this.name();
			if (!name) { return; }
			const viewId = generateUuid();
			this.edit({ kind: 'diagram', id: viewId, name, featureId: feature.id, viewKind: kind.kind });
			this.project.showDiagram(viewId);
		} else if (command === 'renameFeature' || command === 'deleteFeature') {
			const feature = await this.feature(id);
			if (!feature) { return; }
			if (command === 'deleteFeature') { await this.deleteElement(feature); } else {
				const name = await this.name(feature.name);
				if (name) { this.edit({ kind: 'rename', target: 'element', id: feature.id, name }); }
			}
		} else if (command === 'addElement' && view) {
			const kind = await this.quickInput.pick((Object.keys(elementLabels) as ElementKind[]).filter(kind => kind !== 'feature').map(kind => ({ label: elementLabels[kind], kind })), { title: localize('ade.elementType', "Element Type") });
			if (!kind) { return; }
			let parentId: string | undefined;
			if (kind.kind === 'state') {
				const resource = await this.quickInput.pick(model.semantics.elements.filter(element => element.kind === 'resource').map(element => ({ label: element.name, element })), { title: localize('ade.stateOwner', "Resource Whose State Is Represented") });
				if (!resource) { return; }
				parentId = resource.element.id;
			}
			const name = await this.name();
			if (!name) { return; }
			const elementId = generateUuid();
			this.edit({ kind: 'element', id: elementId, viewId: view.id, name, elementKind: kind.kind, parentId });
			this.project.selectElement(elementId);
		} else if (command === 'addExisting' && view) {
			const picked = await this.quickInput.pick(model.semantics.elements.filter(element => !view.nodes.some(node => node.elementId === element.id)).map(element => ({ label: element.name, description: elementLabels[element.kind], element })), { title: localize('ade.include', "Add Existing Element") });
			if (picked) {
				this.edit({ kind: 'include', id: picked.element.id, viewId: view.id });
				this.project.selectElement(picked.element.id);
			}
		} else if (command === 'connect' && view && selected) {
			const kinds = (Object.keys(relationLabels) as RelationKind[]).filter(kind => view.nodes.some(node => {
				const target = model.semantics.elements.find(element => element.id === node.elementId)!;
				return target.id !== selected.id && isCompatibleRelation(kind, selected.kind, target.kind) && (kind !== 'transition' || target.parentId === selected.parentId);
			}));
			const kind = await this.quickInput.pick(kinds.map(kind => ({ label: relationLabels[kind], kind })), { title: localize('ade.relationType', "Relationship Type") });
			if (!kind) { return; }
			const targets = model.semantics.elements.filter(target => target.id !== selected.id && view.nodes.some(node => node.elementId === target.id)
				&& isCompatibleRelation(kind.kind, selected.kind, target.kind) && (kind.kind !== 'transition' || target.parentId === selected.parentId));
			const target = await this.quickInput.pick(targets.map(element => ({ label: element.name, element })), { title: localize('ade.target', "Target Element") });
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
		} else if (command === 'deleteElement' && selected) {
			await this.deleteElement(selected);
		} else if (command === 'condition' && id) {
			const relation = model.semantics.relations.find(relation => relation.id === id);
			if (!relation) { return; }
			const condition = await this.quickInput.input({ title: localize('ade.conditionInput', "Condition (Optional)"), value: relation.condition });
			if (condition !== undefined) { this.edit({ kind: 'condition', id, condition }); }
		} else if (command === 'deleteRelation' && id) {
			if ((await this.dialogs.confirm({ message: localize('ade.deleteRelation', "Delete This Relationship from the System and All Diagrams?"), primaryButton: localize('ade.delete', "Delete") })).confirmed) {
				this.edit({ kind: 'deleteRelation', id });
			}
		} else if (command === 'layout' && view) {
			this.edit({ kind: 'layout', viewId: view.id });
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
	['connect', localize2('ade.connect', "A.D.E: Connect Selection")],
	['renameFeature', localize2('ade.renameFeature', "A.D.E: Rename Feature")],
	['deleteFeature', localize2('ade.deleteFeature', "A.D.E: Delete Feature")],
	['renameDiagram', localize2('ade.renameDiagram', "A.D.E: Rename Diagram")],
	['deleteDiagram', localize2('ade.deleteDiagram.command', "A.D.E: Delete Diagram")],
	['renameElement', localize2('ade.renameElement', "A.D.E: Rename Element")],
	['description', localize2('ade.description.command', "A.D.E: Edit Description")],
	['deleteElement', localize2('ade.deleteElement.command', "A.D.E: Delete Element")],
	['condition', localize2('ade.condition', "A.D.E: Edit Condition")],
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
			const ui = new EditingUI(project, accessor.get(IQuickInputService), accessor.get(IDialogService), accessor.get(IFileDialogService));
			try {
				await ui.run(command, id);
				await editor.openEditor({ resource: AdeInput.RESOURCE, options: { pinned: true, revealIfOpened: true } });
			} catch (error) { notifications.error(localize('ade.editFailed', "Could not complete the project change: {0}", String(error.message ?? error))); }
		}
	});
}
