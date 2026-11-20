import { localize } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IDialogService, IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { SemanticElement } from '../common/modelTypes.js';
import { getEditableScenario, getProjectedInteraction } from '../common/visualNavigation.js';
import { VisualEdit } from '../common/visualEditing.js';
import { getDeletionPreview } from '../common/deletionPreview.js';
import { confirmAdeDeletion } from './adeDeletionDialog.js';
import { AdeEditor } from './adeEditor.js';
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
import { AdeFormDialog } from './adeFormDialog.js';
import { adeErrorNotification } from './adeErrors.js';

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

	async name(value?: string, title = localize('ade.name', "Name")): Promise<string | undefined> {
		const dialog = new AdeFormDialog(this.container, { title });
		try {
			const input = dialog.text(dialog.body, title, value, { required: true });
			return await dialog.open(() => input.value.trim());
		} finally { dialog.dispose(); }
	}

	async feature(id?: string): Promise<SemanticElement | undefined> {
		const features = this.project.model.semantics.elements.filter(element => element.kind === 'feature');
		if (id) { return features.find(feature => feature.id === id); }
		const picked = await this.quickInput.pick(features.map(feature => ({ label: feature.name, feature })), { title: localize('ade.pickFeature', "Choose Feature") });
		return picked?.feature;
	}

	async run(command: Exclude<AdeEditingCommand, 'blueprint' | 'projectDecisions'>, id?: string): Promise<void> {
		switch (command) {
			case 'createProject':
			case 'openProject':
			case 'saveCopy':
			case 'reload': return runAdeProjectCommand(this, command);
		}
		if (!this.project.editable) { return; }
		const view = this.project.activeView;
		const model = this.project.model;
		if (view && getProjectedInteraction(model, view) && (command === 'layout' || !getEditableScenario(model, view) && ['addElement', 'addExisting', 'addExistingRelation', 'addSequenceMessage', 'connect', 'removeElementFromDiagram', 'removeRelationFromDiagram'].includes(command))) {
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
			case 'editScenario':
			case 'predicate':
			case 'prepareStructuralContext': return runAdeSpecificationCommand(this, command, id);
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
			const editorOptions = { pinned: true, revealIfOpened: true };
			const workspace = command === 'createProject' || command === 'openProject' ? accessor.get(IAdeProjectWorkspaceService) : undefined;
			try {
				if (command === 'blueprint' || command === 'projectDecisions') {
					await project.restore();
					if (!project.editable) { return; }
					const version = project.model.version;
					if (version !== 4 && version !== 5) { throw new Error(localize('ade.blueprint.upgrade', "Upgrade the model to version 4 to edit its blueprint.")); }
					const resource = project.modelUri?.toString();
					const pane = await editor.openEditor({ resource: AdeInput.RESOURCE, options: editorOptions });
					if (pane instanceof AdeEditor && project.editable && project.modelUri?.toString() === resource) {
						pane.showBlueprint(id, command === 'projectDecisions' ? 'decision' : mode);
					}
					return;
				}
				const ui = new EditingUI(accessor.get(IWorkbenchLayoutService).activeContainer, project, accessor.get(IQuickInputService), accessor.get(IDialogService), accessor.get(IFileDialogService));
				await ui.run(command, id);
				if (ui.projectChanged) { await workspace?.align(); }
				await editor.openEditor({ resource: AdeInput.RESOURCE, options: editorOptions });
			} catch (error) { notifications.error(adeErrorNotification(error, 'edit', project.model)); }
		}
	});
}
