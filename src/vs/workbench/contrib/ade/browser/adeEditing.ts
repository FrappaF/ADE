/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IDialogService, IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { SemanticElement } from '../common/modelTypes.js';
import { getProjectedInteraction } from '../common/visualNavigation.js';
import { VisualEdit } from '../common/visualEditing.js';
import { getDeletionPreview } from '../common/deletionPreview.js';
import { confirmAdeDeletion } from './adeDeletionDialog.js';
import { AdeInput } from './adeInput.js';
import { AdeProjectService, IAdeProjectService } from './adeProjectService.js';
import { type BlueprintEditMode } from './adeBlueprintEditing.js';
import { IAdeProjectWorkspaceService } from './adeProjectWorkspace.js';
import { adeEditingCommands, type AdeEditingCommand } from './adeEditingCommands.js';
import { type AdeEditingContext } from './adeEditingContext.js';
import { runAdeProjectCommand } from './adeEditingProject.js';
import { runAdeSpecificationCommand } from './adeEditingSpecification.js';
import { runAdeStructureCommand } from './adeEditingStructure.js';
import { runAdeDiagramCommand } from './adeEditingDiagram.js';

/** Owns dialog revision checks and dispatches typed commands to focused handlers. */
class EditingUI implements AdeEditingContext {
	projectChanged = false;

	private readonly version: string;

	constructor(
		readonly container: HTMLElement,
		readonly project: AdeProjectService,
		readonly quickInput: IQuickInputService,
		readonly dialogs: IDialogService,
		readonly files: IFileDialogService,
	) { this.version = project.documentVersion; }

	edit(edit: VisualEdit | VisualEdit[]): void {
		if (this.project.documentVersion !== this.version) { throw new Error(localize('ade.staleEdit', "The project changed while the dialog was open. Review the current model and try again.")); }
		this.project.editBatch(Array.isArray(edit) ? edit : [edit]);
	}

	name(value?: string, title = localize('ade.name', "Name")): Promise<string | undefined> {
		return this.quickInput.input({
			title, value,
			validateInput: async value => value.trim() ? undefined : localize('ade.nameRequired', "Enter a name.")
		});
	}

	async feature(id?: string): Promise<SemanticElement | undefined> {
		const features = this.project.model.semantics.elements.filter(element => element.kind === 'feature');
		if (id) { return features.find(feature => feature.id === id); }
		const picked = await this.quickInput.pick(features.map(feature => ({ label: feature.name, feature })), { title: localize('ade.pickFeature', "Choose Feature") });
		return picked?.feature;
	}

	async run(command: AdeEditingCommand, id?: string, mode?: BlueprintEditMode): Promise<void> {
		switch (command) {
			case 'createProject':
			case 'openProject':
			case 'saveCopy':
			case 'reload': return runAdeProjectCommand(this, command);
		}
		if (!this.project.editable) { return; }
		if (this.project.activeView && getProjectedInteraction(this.project.model, this.project.activeView) && ['addElement', 'addExisting', 'addExistingRelation', 'addSequenceMessage', 'connect', 'removeElementFromDiagram', 'removeRelationFromDiagram', 'layout'].includes(command)) {
			throw new Error(localize('ade.interaction.derivedEdit', "This diagram is derived from its linked behavior. Edit the interaction or scenario to change its participants and messages."));
		}
		switch (command) {
			case 'taskIntent':
			case 'createPureFeature':
			case 'selectStructuralProfile':
			case 'messaging':
			case 'simulateMessaging':
			case 'stateMachine':
			case 'interaction':
			case 'predicate':
			case 'prepareStructuralContext':
			case 'blueprint':
			case 'projectDecisions': return runAdeSpecificationCommand(this, command, id, mode);
			case 'addFeature':
			case 'parent':
			case 'notation':
			case 'relationNotation':
			case 'renameFeature':
			case 'deleteFeature':
			case 'renameElement':
			case 'description':
			case 'behavior':
			case 'deleteElement': return runAdeStructureCommand(this, command, id);
			case 'addDiagram':
			case 'addElement':
			case 'addExistingRelation':
			case 'addExisting':
			case 'addExistingState':
			case 'includeLifecycle':
			case 'addTransition':
			case 'addSequenceMessage':
			case 'connect':
			case 'editRelation':
			case 'removeElementFromDiagram':
			case 'removeRelationFromDiagram':
			case 'renameDiagram':
			case 'deleteDiagram':
			case 'renameRelation':
			case 'condition':
			case 'relationError':
			case 'deleteRelation':
			case 'layout': return runAdeDiagramCommand(this, command, id);
			default: { const exhaustive: never = command; throw new Error('Unsupported ADE command: ' + exhaustive); }
		}
	}

	async deleteElement(element: SemanticElement): Promise<void> {
		const preview = getDeletionPreview(this.project.model, element.id);
		if (await confirmAdeDeletion(this.dialogs, element.name, preview, () => this.project.documentVersion === this.version)) { this.edit({ kind: 'deleteElement', id: element.id }); }
	}
}

for (const [command, title] of adeEditingCommands) {
	registerAction2(class extends Action2 {
		constructor() { super({ id: `ade.${command}`, title, f1: true }); }
		async run(accessor: ServicesAccessor, id?: string, mode?: BlueprintEditMode): Promise<void> {
			const project = accessor.get(IAdeProjectService);
			const editor = accessor.get(IEditorService);
			const notifications = accessor.get(INotificationService);
			const workspace = command === 'createProject' || command === 'openProject' ? accessor.get(IAdeProjectWorkspaceService) : undefined;
			const ui = new EditingUI(accessor.get(IWorkbenchLayoutService).activeContainer, project, accessor.get(IQuickInputService), accessor.get(IDialogService), accessor.get(IFileDialogService));
			try {
				await ui.run(command, id, mode);
				if (ui.projectChanged) { await workspace?.align(); }
				await editor.openEditor({ resource: AdeInput.RESOURCE, options: { pinned: true, revealIfOpened: true } });
			} catch (error) { notifications.error(localize('ade.editFailed', "Could not complete the project change: {0}", String(error.message ?? error))); }
		}
	});
}
