/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { AdeInput } from './adeInput.js';
import { IAdeProjectService, AdeProjectService } from './adeProjectService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';

export class AdeStartup {
	static readonly ID = 'workbench.contrib.adeStartup';
	constructor(
		@IEditorService editorService: IEditorService,
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IAdeProjectService project: AdeProjectService,
		@ICommandService commands: ICommandService
	) {
		const explicitFiles = environmentService.filesToOpenOrCreate?.length || environmentService.filesToDiff?.length || environmentService.filesToMerge?.length;
		// A restored model may already be behind a resumed review; startup must preserve that editor's focus.
		const restored = editorService.editors.some(editor => editor instanceof AdeInput);
		if (!environmentService.skipWelcome && !explicitFiles && !restored && configurationService.getValue('workbench.startupEditor') === 'adeHome') {
			void editorService.openEditor({ resource: AdeInput.RESOURCE, options: { pinned: true, revealIfOpened: true } });
		}
		void this.restoreWorkspaceFiles(project, commands);
	}

	private async restoreWorkspaceFiles(project: AdeProjectService, commands: ICommandService): Promise<void> {
		await project.restore();
		if (project.takeWorkspaceFilesRequest()) {
			await commands.executeCommand('workbench.view.explorer');
			if (project.projectRoot) { await commands.executeCommand('revealInExplorer', project.projectRoot); }
		}
	}
}
