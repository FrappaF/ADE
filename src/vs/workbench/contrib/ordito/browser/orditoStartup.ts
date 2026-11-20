import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { OrditoInput } from './orditoInput.js';
import { IOrditoProjectService, OrditoProjectService } from './orditoProjectService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';

export class OrditoStartup {
	static readonly ID = 'workbench.contrib.orditoStartup';
	constructor(
		@IEditorService editorService: IEditorService,
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IOrditoProjectService project: OrditoProjectService,
		@ICommandService commands: ICommandService
	) {
		const explicitFiles = environmentService.filesToOpenOrCreate?.length || environmentService.filesToDiff?.length || environmentService.filesToMerge?.length;
		// A restored model may already be behind a resumed review; startup must preserve that editor's focus.
		const restored = editorService.editors.some(editor => editor instanceof OrditoInput);
		const startupEditor = configurationService.getValue('workbench.startupEditor');
		if (!environmentService.skipWelcome && !explicitFiles && !restored && (startupEditor === 'orditoHome' || startupEditor === 'adeHome')) {
			void editorService.openEditor({ resource: OrditoInput.RESOURCE, options: { pinned: true, revealIfOpened: true } });
		}
		void this.restoreWorkspaceFiles(project, commands);
	}

	private async restoreWorkspaceFiles(project: OrditoProjectService, commands: ICommandService): Promise<void> {
		await project.restore();
		if (project.takeWorkspaceFilesRequest()) {
			await commands.executeCommand('workbench.view.explorer');
			if (project.projectRoot) { await commands.executeCommand('revealInExplorer', project.projectRoot); }
		}
	}
}
