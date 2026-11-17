/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IConfigurationService, ConfigurationTarget } from '../../../../platform/configuration/common/configuration.js';
import { IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IAdeProjectService } from '../browser/adeProjectService.js';
import { adeErrorNotification } from '../browser/adeErrors.js';
import { canonicalJson } from '../common/modelSerialization.js';
import { codeUpdateContent, type SavedModelChange } from '../common/modelCodeUpdate.js';
import { type AdeAiProject, type AdeAiWorkflow } from './adeAiTypes.js';
import { type AdeAiDiagrams } from './adeAiDiagrams.js';

/** A saved model is implementation intent; it never resumes source-to-diagram exploration. */
export class AdeAiCodeUpdates extends Disposable {
	private opening = false;
	constructor(
		private readonly host: Pick<AdeAiWorkflow, 'busy' | 'info'>,
		private readonly diagrams: AdeAiDiagrams,
		@IAdeProjectService private readonly project: AdeAiProject,
		@IFileService private readonly files: IFileService,
		@IDialogService private readonly dialogs: IDialogService,
		@IConfigurationService private readonly configuration: IConfigurationService,
		@IWorkspaceTrustRequestService private readonly trust: IWorkspaceTrustRequestService
	) {
		super();
		this._register(project.onDidSaveModel(change => { void this.suggest(change).catch(error => this.host.info(adeErrorNotification(error, 'ai', this.project.model))); }));
	}
	private enabled(): boolean { return !this.host.busy && !this.opening && this.configuration.getValue<boolean>('chat.disableAIFeatures') !== true && this.project.projectRoot?.scheme === 'file' && this.project.modelUri?.scheme === 'file' && this.project.editable && !this.project.error && !this.project.hasStructuralErrors; }
	private current(change: SavedModelChange): boolean { return change.modelUri === this.project.modelUri?.toString() && canonicalJson(codeUpdateContent(change.model)) === canonicalJson(codeUpdateContent(this.project.model)); }
	private async suggest(change: SavedModelChange): Promise<void> {
		if (!this.enabled() || !this.current(change) || this.configuration.getValue<boolean>('ade.codeUpdates.suggestAfterSave') === false) { return; }
		this.opening = true;
		try {
			const result = await this.dialogs.confirm({ message: localize('ade.codeUpdate.suggest', "Update the Codebase from Your Saved Diagram Changes?"), detail: localize('ade.codeUpdate.suggestDetail', "{0} model changes saved in {1}. The assistant will receive the exact changes and saved model to implement them in this project's codebase.", change.changes.length, change.model.name), primaryButton: localize('ade.codeUpdate.button', "Update Codebase from Diagrams"), checkbox: { label: localize('ade.codeUpdate.dontAsk', "Don't Ask Again in This Workspace") } });
			if (result.checkboxChecked) { await this.configuration.updateValue('ade.codeUpdates.suggestAfterSave', false, ConfigurationTarget.WORKSPACE); }
			if (!result.confirmed || !this.current(change)) { return; }
		} finally { this.opening = false; }
		await this.update(change);
	}
	async update(saved?: SavedModelChange): Promise<void> {
		if (!this.enabled()) { return; }
		this.opening = true;
		try {
			if (!await this.trust.requestWorkspaceTrust() || !await this.project.save() || this.project.hasStructuralErrors) { return; }
			const change = saved ?? this.project.lastSavedChange;
			if (change && !this.current(change)) { this.host.info(localize('ade.codeUpdate.stale', "The Saved Model Changed. Save It and Retry the Codebase Update.")); return; }
			const modelUri = this.project.modelUri!, root = this.project.projectRoot!;
			const model = structuredClone(this.project.model), revision = canonicalJson(model);
			const folder = URI.joinPath(root, '.ade', 'code-updates');
			await this.files.createFolder(folder);
			const artifact = URI.joinPath(folder, generateUuid() + '.json');
			await this.files.writeFile(artifact, VSBuffer.fromString(JSON.stringify({ version: 1, direction: 'model-to-code', root: root.fsPath, modelFile: modelUri.fsPath, model, changes: change?.changes ?? [], scope: change ? 'latest-save' : 'saved-model' }, null, '\t') + '\n'));
			if (this.project.modelUri?.toString() !== modelUri.toString() || canonicalJson(this.project.model) !== revision) { return; }
			await this.diagrams.returnToDiagrams();
			await this.diagrams.chat(localize('ade.codeUpdate.prompt', "Update this project's codebase to implement the saved ADE model. Read the implementation context at {0}; it contains the exact saved model and the additions, modifications and removals from the latest save, when available. Treat these authored changes as the desired specification, not as facts already implemented in source code. Inspect the affected diagrams, shared objects, descriptions, attributes, relationships, conditions and behavioral contracts, then compare them with the current code. Removing an object from one diagram does not remove its shared definition or authorize deleting its implementation. Preserve unrelated code and local changes. Follow the existing project's language, framework, authentication, authorization and persistence conventions. Implement the necessary source changes, migrations and meaningful tests. Resolve missing functional decisions with the user instead of inventing rules. Run relevant verification and report the mapping from model changes to code, changed files, test results, remaining gaps and any migration commands. Preserve all ADE model files, semantic IDs and manual layout. Leave code changes local for review; do not commit, push, deploy or run destructive migrations.", artifact.fsPath), { modelUri: modelUri.toString(), revision, contextFile: artifact.fsPath });
		} finally { this.opening = false; }
	}
}
