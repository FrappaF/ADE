/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
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
	serialize(): string { return ''; }
	deserialize(instantiationService: IInstantiationService): EditorInput { return instantiationService.createInstance(AdeInput); }
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
		const viewsService = accessor.get(IViewsService);
		const editorService = accessor.get(IEditorService);
		await viewsService.openViewContainer(ADE_VIEW_CONTAINER_ID, false);
		await editorService.openEditor({ resource: AdeInput.RESOURCE, options: { pinned: true, revealIfOpened: true } });
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({ id: 'ade.showDiagram', title: localize2('ade.return', "A.D.E: Return to Model"), f1: true,
			keybinding: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyD, weight: KeybindingWeight.WorkbenchContrib } });
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const project = accessor.get(IAdeProjectService);
		const viewsService = accessor.get(IViewsService);
		const editorService = accessor.get(IEditorService);
		await project.restore();
		if (project.activeView) { project.showDiagram(project.activeView.id); }
		await viewsService.openViewContainer(ADE_VIEW_CONTAINER_ID, false);
		await editorService.openEditor({ resource: AdeInput.RESOURCE, options: { pinned: true, revealIfOpened: true } });
	}
});
CommandsRegistry.registerCommandAlias('ade.returnToDiagram', 'ade.showDiagram');

registerAction2(class extends Action2 {
	constructor() { super({ id: 'ade.openModel', title: localize2('ade.openModel', "A.D.E: Open Model"), f1: true }); }
	async run(accessor: ServicesAccessor): Promise<void> {
		const project = accessor.get(IAdeProjectService);
		const editorService = accessor.get(IEditorService);
		await project.chooseModel();
		await editorService.openEditor({ resource: AdeInput.RESOURCE, options: { pinned: true, revealIfOpened: true } });
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
		'workbench.secondarySideBar.defaultVisibility': 'hidden'
	} }
]);

registerWorkbenchContribution2(AdeStartup.ID, AdeStartup, WorkbenchPhase.AfterRestored);
