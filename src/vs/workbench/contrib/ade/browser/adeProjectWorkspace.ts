/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { isEqual } from '../../../../base/common/resources.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IWorkspaceEditingService } from '../../../services/workspaces/common/workspaceEditing.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { ITerminalService, ITerminalGroupService } from '../../terminal/browser/terminal.js';
import { openAdeTerminal } from './adeTerminal.js';
import { IAdeProjectService, AdeProjectService } from './adeProjectService.js';

export const IAdeProjectWorkspaceService = createDecorator<AdeProjectWorkspace>('adeProjectWorkspace');

/** Enter project folders through native workspace APIs, preserving multi-root workspaces and running terminals. */
export class AdeProjectWorkspace {
	declare readonly _serviceBrand: undefined;
	constructor(
		@IAdeProjectService private readonly project: AdeProjectService,
		@IWorkspaceContextService private readonly context: IWorkspaceContextService,
		@IWorkspaceEditingService private readonly editing: IWorkspaceEditingService,
		@IHostService private readonly host: IHostService,
		@IStorageService private readonly storage: IStorageService,
		@ITerminalService private readonly terminals: ITerminalService,
		@ITerminalGroupService private readonly terminalGroups: ITerminalGroupService,
		@ICommandService private readonly commands: ICommandService,
		@INotificationService private readonly notifications: INotificationService
	) { }

	async align(showFiles = false): Promise<void> {
		const root = this.project.projectRoot;
		if (!root) { return; }
		this.storage.store('ade.project.activeRoot', root.toString(), StorageScope.PROFILE, StorageTarget.MACHINE);
		const folders = this.context.getWorkspace().folders;
		if (folders.some(folder => isEqual(folder.uri, root))) { return; }
		if (folders.length > 1 || this.context.getWorkbenchState() === WorkbenchState.WORKSPACE) { await this.editing.addFolders([{ uri: root }], true); }
		else { this.project.prepareWorkspaceOpen(showFiles); await this.host.openWindow([{ folderUri: root }], { forceReuseWindow: true }); }
	}
	async files(): Promise<void> {
		await this.align(true);
		await this.commands.executeCommand('workbench.view.explorer');
		if (this.project.projectRoot) { await this.commands.executeCommand('revealInExplorer', this.project.projectRoot); }
	}
	async terminal(): Promise<void> {
		const root = this.project.projectRoot;
		if (!root) { this.notifications.info(localize('ade.terminal.noProject', "No A.D.E project is open. The terminal uses the current workspace directory.")); }
		await openAdeTerminal(this.terminals, this.terminalGroups, { name: localize('ade.terminal.project', "A.D.E Project"), cwd: root });
	}
}
registerSingleton(IAdeProjectWorkspaceService, AdeProjectWorkspace, InstantiationType.Delayed);
for (const [id, title, method] of [
	['ade.openFiles', localize2('ade.files.command', "A.D.E: Open Project Files"), 'files'],
	['ade.openTerminal', localize2('ade.terminal.command', "A.D.E: New Project Terminal"), 'terminal']
] as const) {
	registerAction2(class extends Action2 {
		constructor() { super({ id, title, f1: true }); }
		async run(accessor: import('../../../../platform/instantiation/common/instantiation.js').ServicesAccessor): Promise<void> {
			const service = accessor.get(IAdeProjectWorkspaceService), notifications = accessor.get(INotificationService);
			try { await service[method](); }
			catch (error) { notifications.error(localize('ade.workspace.failed', "Could not open the project tool: {0}", String(error.message ?? error))); }
		}
	});
}
