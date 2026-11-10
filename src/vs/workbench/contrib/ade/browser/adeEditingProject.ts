/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { type AdeEditingContext } from './adeEditingContext.js';
import { type AdeEditingCommand } from './adeEditingCommands.js';

/** Collects project intent; domain mutation remains in the project service. */
export async function runAdeProjectCommand(ui: AdeEditingContext, command: Extract<AdeEditingCommand, 'createProject' | 'openProject' | 'saveCopy' | 'reload'>): Promise<void> {

	if (command === 'createProject' || command === 'openProject') {
		const name = command === 'createProject' ? await ui.name() : undefined;
		if (command === 'createProject' && !name) { return; }
		const folders = await ui.files.showOpenDialog({ title: localize('ade.projectFolder', "Choose Project Folder"), canSelectFiles: false, canSelectFolders: true, canSelectMany: false });
		if (folders?.[0]) {
			if (name) { ui.projectChanged = await ui.project.createProject(name, folders[0]); } else { await ui.project.openProject(folders[0]); ui.projectChanged = !ui.project.error; }
		}
		return;
	}
	if (command === 'saveCopy') { await ui.project.saveAs(); return; }
	if (command === 'reload') {
		if (!ui.project.dirty || (await ui.dialogs.confirm({ message: localize('ade.discard', "Discard Unsaved Changes and Reload the Project?"), primaryButton: localize('ade.reload', "Reload") })).confirmed) {
			await ui.project.revert();
		}
		return;
	}
}
