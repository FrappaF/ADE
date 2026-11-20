import { localize } from '../../../../nls.js';
import { type OrditoEditingContext } from './orditoEditingContext.js';
import { type OrditoEditingCommand } from './orditoEditingCommands.js';

/** Collects project intent; domain mutation remains in the project service. */
export async function runOrditoProjectCommand(ui: OrditoEditingContext, command: Extract<OrditoEditingCommand, 'createProject' | 'openProject' | 'saveCopy' | 'reload'>): Promise<void> {

	if (command === 'createProject' || command === 'openProject') {
		const name = command === 'createProject' ? await ui.name() : undefined;
		if (command === 'createProject' && !name) { return; }
		const folders = await ui.files.showOpenDialog({ title: localize('ordito.projectFolder', "Choose Project Folder"), canSelectFiles: false, canSelectFolders: true, canSelectMany: false });
		if (folders?.[0]) {
			if (name) { ui.projectChanged = await ui.project.createProject(name, folders[0]); } else { await ui.project.openProject(folders[0]); ui.projectChanged = !ui.project.error; }
		}
		return;
	}
	if (command === 'saveCopy') { await ui.project.saveAs(); return; }
	if (command === 'reload') {
		if (!ui.project.dirty || (await ui.dialogs.confirm({ message: localize('ordito.discard', "Discard Unsaved Changes and Reload the Project?"), primaryButton: localize('ordito.reload', "Reload") })).confirmed) {
			await ui.project.revert();
		}
		return;
	}
}
