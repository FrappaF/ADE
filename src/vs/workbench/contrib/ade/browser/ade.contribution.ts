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
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { EditorExtensions, IEditorFactoryRegistry, IEditorSerializer } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { AdeInput } from './adeInput.js';
import { AdeEditor } from './adeEditor.js';

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
		await accessor.get(IEditorService).openEditor({ resource: AdeInput.RESOURCE, options: { pinned: true, revealIfOpened: true } });
	}
});

// Compatibility command for the semantic shell introduced in M1.
registerAction2(class extends Action2 {
	constructor() { super({ id: 'ade.workbench.open', title: localize2('ade.openProjectHome', "A.D.E: Open Project Home"), f1: true }); }
	async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(IEditorService).openEditor({ resource: AdeInput.RESOURCE, options: { pinned: true, revealIfOpened: true } });
	}
});

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerDefaultConfigurations([
	{ overrides: {
		'workbench.startupEditor': 'adeHome',
		'workbench.welcomePage.experimentalOnboarding': false,
		'workbench.secondarySideBar.defaultVisibility': 'hidden',
		'chat.disableAIFeatures': true
	} }
]);

class AdeStartup {
	static readonly ID = 'workbench.contrib.adeStartup';
	constructor(
		@IEditorService editorService: IEditorService,
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService
	) {
		if (!environmentService.skipWelcome && !editorService.activeEditor && configurationService.getValue('workbench.startupEditor') === 'adeHome') {
			void editorService.openEditor({ resource: AdeInput.RESOURCE, options: { pinned: true } });
		}
	}
}
registerWorkbenchContribution2(AdeStartup.ID, AdeStartup, WorkbenchPhase.AfterRestored);
