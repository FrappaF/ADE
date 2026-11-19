/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { EditorExtensions, IEditorFactoryRegistry, IEditorSerializer } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { AdeInput } from './adeInput.js';
import { AdeStartup } from './adeStartup.js';
import { AdeEditor } from './adeEditor.js';
import { AdeProjectService, IAdeProjectService } from './adeProjectService.js';
import { ADE_VIEW_CONTAINER_ID, ADE_VIEW_ID, AdeView } from './adeView.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { Extensions as ViewExtensions, IViewContainersRegistry, IViewsRegistry, ViewContainerLocation } from '../../../common/views.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { UndoCommand, RedoCommand } from '../../../../editor/browser/editorExtensions.js';
import './adeEditing.js';
import './adeNavigation.js';
import { AdeAccessibilityHelp, AdeAccessibleView, registerAdeAccessibleStartup } from './adeAccessibility.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { IWorkingCopyEditorService } from '../../../services/workingCopy/common/workingCopyEditorService.js';
import { IWorkingCopyIdentifier, NO_TYPE_ID } from '../../../services/workingCopy/common/workingCopy.js';
import { AdeDiagramLayout } from './adeDiagramLayout.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { IConfigurationService, ConfigurationTarget } from '../../../../platform/configuration/common/configuration.js';
import { defaultDiagramCheckpointTimeoutMinutes, diagramCheckpointReasoningEfforts, maxDiagramCheckpointTimeoutMinutes } from '../common/codeBridge.js';
import { defaultDiagramCheckpointReasoningEffort, diagramCheckpointReasoningEffortSetting, diagramCheckpointTimeoutSetting, diagramExplorationBudgetSetting } from '../common/diagramExplorationSettings.js';
import { defaultProjectDiagramExplorationBudget, maximumDiagramExplorationBudget, minimumDiagramExplorationBudget } from '../common/diagramExplorationBudget.js';

class AdeWorkingCopyEditor extends Disposable {
	static readonly ID = 'workbench.contrib.adeWorkingCopyEditor';
	constructor(
		@IWorkingCopyEditorService workingCopies: IWorkingCopyEditorService,
		@IAdeProjectService project: AdeProjectService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super();
		const handles = (copy: IWorkingCopyIdentifier) =>
			copy.typeId === NO_TYPE_ID && copy.resource.toString() === project.modelUri?.toString();
		this._register(workingCopies.registerHandler({
			handles,
			isOpen: (copy, editor) => handles(copy) && editor instanceof AdeInput,
			createEditor: () => instantiationService.createInstance(AdeInput)
		}));
	}
}
registerWorkbenchContribution2(AdeWorkingCopyEditor.ID, AdeWorkingCopyEditor, WorkbenchPhase.BlockStartup);

class AdeUndoRedo extends Disposable {
	static readonly ID = 'workbench.contrib.adeUndoRedo';
	constructor(
		@IEditorService editorService: IEditorService,
		@IAdeProjectService project: AdeProjectService
	) {
		super();
		this._register(UndoCommand.addImplementation(105, 'ade', () => editorService.activeEditor instanceof AdeInput ? project.undo() : false));
		this._register(RedoCommand.addImplementation(105, 'ade', () => editorService.activeEditor instanceof AdeInput ? project.redo() : false));
	}
}
registerWorkbenchContribution2(AdeUndoRedo.ID, AdeUndoRedo, WorkbenchPhase.AfterRestored);

class AdeAccessibility extends Disposable {
	static readonly ID = 'workbench.contrib.adeAccessibility';
	constructor() {
		super();
		for (const implementation of [new AdeAccessibleView(), new AdeAccessibilityHelp()]) {
			this._register(AccessibleViewRegistry.register(implementation));
			this._register(registerAdeAccessibleStartup(implementation));
		}
	}
}
registerWorkbenchContribution2(AdeAccessibility.ID, AdeAccessibility, WorkbenchPhase.BlockStartup);

const adeContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: ADE_VIEW_CONTAINER_ID,
	title: localize2('ade.systemFeatures', "System and Features"),
	icon: Codicon.typeHierarchy,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [ADE_VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: ADE_VIEW_CONTAINER_ID,
	order: -1
}, ViewContainerLocation.Sidebar, { isDefault: true });

Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([{
	id: ADE_VIEW_ID,
	name: localize2('ade.systemFeatures', "System and Features"),
	ctorDescriptor: new SyncDescriptor(AdeView),
	canToggleVisibility: false,
	canMoveView: true
}], adeContainer);

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(AdeEditor, AdeEditor.ID, localize('ade.editor', "A.D.E")), [new SyncDescriptor(AdeInput)]
);

class AdeSerializer implements IEditorSerializer {
	canSerialize(): boolean { return true; }
	serialize(editor: EditorInput): string { return JSON.stringify({ name: editor.getName() }); }
	deserialize(instantiationService: IInstantiationService, serialized: string): EditorInput {
		const input = instantiationService.createInstance(AdeInput);
		try {
			const saved = JSON.parse(serialized);
			if (typeof saved?.name === 'string' && saved.name.trim()) { input.restoreName(saved.name); }
		} catch { /* Older sessions did not persist a caption. */ }
		return input;
	}
}
Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(AdeInput.ID, AdeSerializer);

class AdeResolver extends Disposable {
	static readonly ID = 'workbench.contrib.adeResolver';
	constructor(
		@IEditorResolverService resolver: IEditorResolverService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super();
		this._register(resolver.registerEditor('ade-home:/**', {
			id: AdeInput.ID, label: localize('ade.label', "A.D.E"), priority: RegisteredEditorPriority.exclusive
		}, { singlePerResource: true }, {
			createEditorInput: () => ({ editor: instantiationService.createInstance(AdeInput), options: { pinned: true } })
		}));
	}
}
registerWorkbenchContribution2(AdeResolver.ID, AdeResolver, WorkbenchPhase.BlockStartup);

registerAction2(class extends Action2 {
	constructor() { super({ id: 'ade.showHome', title: localize2('ade.showHome', "A.D.E: Open Home"), f1: true }); }
	async run(accessor: ServicesAccessor): Promise<void> {
		accessor.get(IAdeProjectService).showHome();
		const editorService = accessor.get(IEditorService);
		const pane = await editorService.openEditor({ resource: AdeInput.RESOURCE, options: { pinned: true, revealIfOpened: true } });
		if (pane instanceof AdeEditor) { pane.showWorkspace(); }
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({ id: 'ade.showDiagram', title: localize2('ade.return', "A.D.E: Return to Model"), f1: true,
			keybinding: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyD, weight: KeybindingWeight.WorkbenchContrib } });
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const project = accessor.get(IAdeProjectService);
		const editorService = accessor.get(IEditorService);
		await project.restore();
		if (project.activeView) { project.showDiagram(project.activeView.id); }
		const pane = await editorService.openEditor({ resource: AdeInput.RESOURCE, options: { pinned: true, revealIfOpened: true } });
		if (pane instanceof AdeEditor) { pane.showWorkspace(); }
	}
});
registerAction2(class extends Action2 {
	constructor() { super({ id: 'ade.showNavigation', title: localize2('ade.showNavigation', "A.D.E: Show Diagram Navigation"), f1: true }); }
	async run(accessor: ServicesAccessor): Promise<void> { await accessor.get(IViewsService).openViewContainer(ADE_VIEW_CONTAINER_ID, true); }
});
CommandsRegistry.registerCommandAlias('ade.returnToDiagram', 'ade.showDiagram');

registerAction2(class extends Action2 {
	constructor() { super({ id: 'ade.ai.prepareReviewedCode', title: localize2('ade.featureCode.command', "A.D.E: Prepare Reviewed Code from Diagrams"), f1: true }); }
	async run(accessor: ServicesAccessor): Promise<void> {
		const project = accessor.get(IAdeProjectService);
		const editorService = accessor.get(IEditorService);
		await project.restore();
		const pane = await editorService.openEditor({ resource: AdeInput.RESOURCE, options: { pinned: true, revealIfOpened: true } });
		if (pane instanceof AdeEditor) { await pane.prepareReviewedCodeFromDiagrams(); }
	}
});

registerAction2(class extends Action2 {
	constructor() { super({ id: 'ade.openModel', title: localize2('ade.openModel', "A.D.E: Open Model"), f1: true }); }
	async run(accessor: ServicesAccessor): Promise<void> {
		const project = accessor.get(IAdeProjectService);
		const editorService = accessor.get(IEditorService);
		await project.chooseModel();
		await editorService.openEditor({ resource: AdeInput.RESOURCE, options: { pinned: true, revealIfOpened: true } });
	}
});

registerAction2(class extends Action2 {
	constructor() { super({ id: 'ade.upgradeModelV4', title: localize2('ade.upgradeModelV4', "A.D.E: Upgrade Model to Version 4"), f1: true }); }
	run(accessor: ServicesAccessor): void { accessor.get(IAdeProjectService).upgradeToV4(); }
});
registerAction2(class extends Action2 {
	constructor() { super({ id: 'ade.openModelSource', title: localize2('ade.openModelSource', "A.D.E: Edit Model Specification"), f1: true }); }
	async run(accessor: ServicesAccessor): Promise<void> {
		const resource = accessor.get(IAdeProjectService).modelUri;
		if (resource) { await accessor.get(IEditorService).openEditor({ resource, options: { override: 'default', pinned: true } }); }
	}
});

// Compatibility command for the semantic shell introduced in M1.
registerAction2(class extends Action2 {
	constructor() { super({ id: 'ade.workbench.open', title: localize2('ade.openProjectHome', "A.D.E: Open Project Home"), f1: true }); }
	async run(accessor: ServicesAccessor): Promise<void> {
		accessor.get(IAdeProjectService).showHome();
		await accessor.get(IEditorService).openEditor({ resource: AdeInput.RESOURCE, options: { pinned: true, revealIfOpened: true } });
	}
});

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerDefaultConfigurations([
	{ overrides: {
		'workbench.startupEditor': 'adeHome',
		'workbench.welcomePage.experimentalOnboarding': false,
		'workbench.secondarySideBar.defaultVisibility': 'hidden',
		'files.readonlyInclude': { '**/.ade/reports/**': true, '**/.ade/structural/sessions/*/review/**': true, '**/.ade/collaboration/*/review/**': true }
	} }
]);

registerWorkbenchContribution2(AdeStartup.ID, AdeStartup, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(AdeDiagramLayout.ID, AdeDiagramLayout, WorkbenchPhase.AfterRestored);

registerAction2(class extends Action2 {
	constructor() { super({ id: 'ade.toggleWorkbench', title: localize2('ade.toggleWorkbench', "A.D.E: Toggle IDE Tools"), f1: true }); }
	async run(accessor: ServicesAccessor): Promise<void> {
		const configuration = accessor.get(IConfigurationService);
		await configuration.updateValue('ade.focusDiagrams', configuration.getValue<boolean>('ade.focusDiagrams') === false, ConfigurationTarget.WORKSPACE);
	}
});

registerAction2(class extends Action2 {
	constructor() { super({ id: 'ade.toggleNavigation', title: localize2('ade.toggleNavigation', "A.D.E: Toggle Diagram Navigation"), f1: true }); }
	async run(accessor: ServicesAccessor): Promise<void> {
		const layout = accessor.get(IWorkbenchLayoutService);
		if (layout.isVisible(Parts.SIDEBAR_PART)) { layout.setPartHidden(true, Parts.SIDEBAR_PART); }
		else { await accessor.get(IViewsService).openView(ADE_VIEW_ID, true); }
	}
});


Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'ade', title: 'A.D.E', type: 'object', properties: {
		'ade.focusDiagrams': { type: 'boolean', default: true, description: localize('ade.focusDiagrams', "Keep diagram work focused. IDE tools return when you open another editor or choose Show IDE.") },
		'ade.codeUpdates.suggestAfterSave': { type: 'boolean', default: true, description: localize('ade.codeUpdates.suggestAfterSave', "Offer a codebase update after saving significant diagram changes. Disable in Workspace Settings to save without this prompt. Update Codebase from Diagrams remains available manually.") },
		'ade.diagramImport.incremental': { type: 'boolean', default: true, description: localize('ade.incremental.setting', "Explore architecture in a persistent Codex conversation with local tools and independent diagram drafts. Disable to use the legacy import pipeline.") },
		[diagramCheckpointTimeoutSetting]: {
			type: 'integer',
			minimum: 1,
			maximum: maxDiagramCheckpointTimeoutMinutes,
			default: defaultDiagramCheckpointTimeoutMinutes,
			scope: ConfigurationScope.APPLICATION,
			description: localize('ade.diagram.attemptMinutesSetting', "Maximum minutes for each attempt at a step in automatic diagram generation. The remaining exploration budget can end the attempt sooner.")
		},
		[diagramCheckpointReasoningEffortSetting]: {
			type: 'string',
			enum: [...diagramCheckpointReasoningEfforts],
			default: defaultDiagramCheckpointReasoningEffort,
			scope: ConfigurationScope.APPLICATION,
			description: localize('ade.diagram.reasoningEffortSetting', "Reasoning effort for automatic Codex diagram generation, audit, and corrections. Choose inherit to use the Codex CLI configuration.")
		},
		[diagramExplorationBudgetSetting]: {
			type: 'object',
			scope: ConfigurationScope.APPLICATION,
			default: { ...defaultProjectDiagramExplorationBudget },
			description: localize('ade.diagram.defaultBudgetSetting', "Limits for new diagram explorations. Use Set Default Exploration Budget in ADE AI Settings to choose a preset or enter values in KiB and minutes."),
			additionalProperties: false,
			required: ['maxToolCalls', 'maxReadBytes', 'maxDurationMs', 'maxModelTurns'],
			properties: {
				maxToolCalls: { type: 'integer', minimum: minimumDiagramExplorationBudget.maxToolCalls, maximum: maximumDiagramExplorationBudget.maxToolCalls },
				maxReadBytes: { type: 'integer', minimum: minimumDiagramExplorationBudget.maxReadBytes, maximum: maximumDiagramExplorationBudget.maxReadBytes },
				maxDurationMs: { type: 'integer', minimum: minimumDiagramExplorationBudget.maxDurationMs, maximum: maximumDiagramExplorationBudget.maxDurationMs },
				maxModelTurns: { type: 'integer', minimum: minimumDiagramExplorationBudget.maxModelTurns, maximum: maximumDiagramExplorationBudget.maxModelTurns }
			}
		}
	}
});
