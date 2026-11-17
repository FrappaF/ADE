/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { AdeInput } from './adeInput.js';

/** Borrow the native layout while ADE is the only visible editor; restore it for code and other tools. */
export class AdeDiagramLayout extends Disposable {
	static readonly ID = 'workbench.contrib.adeDiagramLayout';
	private readonly tabs = this._register(new MutableDisposable());
	private readonly parts = [Parts.ACTIVITYBAR_PART, Parts.STATUSBAR_PART, Parts.SIDEBAR_PART, Parts.AUXILIARYBAR_PART, Parts.PANEL_PART];
	private original: Parts[] | undefined;
	private readonly storageKey = 'ade.diagramLayout.previousParts';

	constructor(
		@IWorkbenchLayoutService private readonly layout: IWorkbenchLayoutService,
		@IEditorGroupsService private readonly groups: IEditorGroupsService,
		@IEditorService private readonly editors: IEditorService,
		@IConfigurationService private readonly configuration: IConfigurationService,
		@IStorageService private readonly storage: IStorageService
	) {
		super();
		this._register(editors.onDidActiveEditorChange(() => this.update()));
		this._register(layout.onDidChangePartVisibility(event => {
			if (this.original && event.visible && (event.partId === Parts.ACTIVITYBAR_PART || event.partId === Parts.STATUSBAR_PART)) { this.layout.setPartHidden(true, event.partId); }
		}));
		this._register(editors.onDidVisibleEditorsChange(() => this.update()));
		this._register(configuration.onDidChangeConfiguration(event => { if (event.affectsConfiguration('ade.focusDiagrams')) { this.update(); } }));
		this._register(toDisposable(() => this.restore()));
		this.update();
	}

	private update(): void {
		const focused = this.configuration.getValue<boolean>('ade.focusDiagrams') !== false && this.editors.activeEditor instanceof AdeInput && this.editors.visibleEditors.every(editor => editor instanceof AdeInput);
		if (!focused) { this.restore(); return; }
		if (this.original) { return; }
		const saved = this.storage.getObject<string[]>(this.storageKey, StorageScope.WORKSPACE);
		this.original = saved ? this.parts.filter(part => saved.includes(part)) : this.parts.filter(part => this.layout.isVisible(part, mainWindow));
		this.storage.store(this.storageKey, this.original, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		this.layout.mainContainer.classList.add('ade-diagram-focus');
		this.tabs.value = this.groups.mainPart.enforcePartOptions({ showTabs: 'none', editorActionsLocation: 'hidden' });
		for (const part of this.parts) { this.layout.setPartHidden(part !== Parts.SIDEBAR_PART, part); }
	}

	private restore(): void {
		if (!this.original) { return; }
		const original = this.original; this.original = undefined;
		this.layout.mainContainer.classList.remove('ade-diagram-focus');
		this.tabs.clear();
		for (const part of original) { this.layout.setPartHidden(false, part); }
		this.storage.remove(this.storageKey, StorageScope.WORKSPACE);
	}
}
