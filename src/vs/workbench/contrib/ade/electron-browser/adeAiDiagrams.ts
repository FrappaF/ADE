/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { adeErrorNotification } from '../browser/adeErrors.js';
import { diagramToolDefinitions, diagramSessionInstruction } from '../common/diagramTools.js';
import { ILanguageModelsService } from '../../chat/common/languageModels.js';
import { ILanguageModelToolsService, ToolDataSource } from '../../chat/common/tools/languageModelToolsService.js';
import { IAgentHostActiveClientService } from '../../chat/browser/agentSessions/agentHost/agentHostActiveClientService.js';
import { type IJSONSchema } from '../../../../base/common/jsonSchema.js';
import { localize } from '../../../../nls.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { URI } from '../../../../base/common/uri.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { INotificationService, INotificationHandle, Severity } from '../../../../platform/notification/common/notification.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../platform/files/common/files.js';
import { IConfigurationService, ConfigurationTarget } from '../../../../platform/configuration/common/configuration.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { AgentHostCodexAgentEnabledSettingId, AgentHostCodexAgentCodexHomeSettingId } from '../../../../platform/agentHost/common/agentService.js';
import { ICodexAccountService } from '../../../services/agentHost/browser/codexAccountService.js';
import { parseCodexModelSelection } from '../../../../platform/agentHost/common/codexModelSelection.js';
import { IAgentSdkSetupService } from '../../../services/agentHost/browser/agentSdkSetupService.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { IFilesConfigurationService } from '../../../services/filesConfiguration/common/filesConfigurationService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IAdeAiDialogService, type AdeAiMessage } from '../browser/adeAiDialog.js';
import { getNewChatSessionResource } from '../../chat/common/model/chatUri.js';
import { IAdeProjectService } from '../browser/adeProjectService.js';
import { IAdeCodeService } from '../browser/adeCodeService.js';
import { type AdeDiagramActivity, type AdeDiagramLiveProgress, type AdeDiagramReview } from '../browser/adeAiService.js';
import { IAdeOperationService, AdeOperationService } from '../browser/adeOperationService.js';
import { AdeInput } from '../browser/adeInput.js';
import { viewLabels } from '../browser/adeLabels.js';
import { ThrottledDelayer } from '../../../../base/common/async.js';
import { equals } from '../../../../base/common/objects.js';
import { canonicalJson, semanticContent } from '../common/modelSerialization.js';
import { CodeDiagramProgress, CodeDiagramExploration, maxDiagramCheckpointTimeoutMinutes, type CodeAiProgress, type CodeDiagramCheckpointResult } from '../common/codeBridge.js';
import { getDiagramExplorationPhase } from '../common/diagramExplorationState.js';
import { diagramCheckpointTimeoutSetting, getDiagramCheckpointTimeoutMinutes, isDiagramCheckpointTimeoutMinutes } from '../common/diagramExplorationSettings.js';
import { type CliConfig, type AdeAiProject, type AdeAiWorkflow } from './adeAiTypes.js';
import { AdeAiConnection } from './adeAiConnection.js';

interface ExplorationSession {
	root: string;
	id: string;
	snapshot: string;
	resource?: string;
	selectedModel?: string;
	approvedScope?: string;
	goal?: string;
	clarification?: { checkpoint: string; question: string; answer?: string };
	activity?: AdeDiagramActivity[];
}

function checkpoint(state: CodeDiagramExploration): string {
	return JSON.stringify([state.phase, state.nextFeatureId, state.nextTaskId]);
}

function checkpointTimeoutIssue(timeout: NonNullable<CodeDiagramCheckpointResult['timeout']>): string {
	switch (timeout) {
		case 'startup': return localize('ade.explore.timeout.startup', "The AI provider did not start in time. Check the connection and selected model in AI Settings, then choose Continue Generation.");
		case 'idle': return localize('ade.explore.timeout.idle', "The AI provider stopped responding. ADE kept your saved progress. Check the connection and choose Continue Generation.");
		case 'deadline': return localize('ade.explore.timeout.deadline', "The AI provider reached the time limit for this step. ADE kept your saved progress. Choose Continue Generation to resume.");
	}
}

/** Diagram exploration, generation and review workflow; lifecycle belongs to this component. */
export class AdeAiDiagrams extends Disposable {
	private _diagramReview: AdeDiagramReview | undefined;

	private chatOpening = false;

	private diagramRunning = false;

	private diagramError: INotificationHandle | undefined;

	get generatingDiagrams(): boolean { return this.diagramRunning; }

	private conversation: { root: string; resource?: URI; attachedModel?: string; codeUpdate?: { modelUri: string; revision: string; contextFile: string } } | undefined;

	private readonly conversationWatch = this._register(new DisposableStore());

	get chatLocation(): 'modal' | undefined { return this.conversation ? 'modal' : undefined; }

	private _diagramProgress: CodeDiagramProgress | undefined;

	private _diagramExploration: CodeDiagramExploration | undefined;

	private _diagramLiveProgress: AdeDiagramLiveProgress | undefined;
	private diagramRequestId: string | undefined;
	private explorationRefresh = 0;
	private appliedExplorationRefresh = 0;

	private restoringExploration: string | undefined;

	private exploration: ExplorationSession | undefined;

	private readonly explorationRun = this._register(new MutableDisposable<CancellationTokenSource>());

	private _diagramExplorationIssue: string | undefined;

	private readonly explorationTools = this._register(new DisposableStore());

	private explorationBinding: string | undefined;

	private explorationToolResource: URI | undefined;

	async chat(initialPrompt?: string, codeUpdate?: { modelUri: string; revision: string; contextFile: string }): Promise<void> {
		if (this.host.busy || this.operations.busy || this.chatOpening || this.configuration.getValue<boolean>('chat.disableAIFeatures') === true) { return; }
		if (this.conversation && !!this.conversation.codeUpdate !== !!codeUpdate) { await this.aiDialog.close(); }
		if (!codeUpdate) { await this.discardMissingExploration(); }
		if (!codeUpdate && this.code.context && this.configuration.getValue<boolean>('ade.diagramImport.incremental') !== false && this.exploration?.root !== this.code.context.sourceRoot) { await this.exploreDiagrams(initialPrompt, false, true); return; }
		const session = codeUpdate ? undefined : this.exploration;
		const opening = this.operations.acquire('ai');
		if (!opening) { return; }
		this.chatOpening = true; this.host.busy = true;
		this.host.report(localize('ade.ai.chatOpening', "Opening Codex…"));
		try {
			if (!await this.trust.requestWorkspaceTrust() || this.project.modelUri && !await this.project.save()) { this.host.report(localize('ade.ai.chatNotOpened', "Codex Was Not Opened")); return; }
			const root = (codeUpdate ? this.project.projectRoot?.fsPath : this.code.context?.sourceRoot) ?? this.project.projectRoot?.fsPath ?? this.project.model.id;
			if (this.conversation?.root !== root) { this.conversation = undefined; }
			const native = this.codexAccount.account.status === 'signedIn' && this.setup.setups.some(setup => setup.agent === 'codex' && setup.download === 'ready') && !this.configuration.getValue<string>(AgentHostCodexAgentCodexHomeSettingId) && (!this.connection.config || this.connection.config.provider !== 'codex' || this.connection.config.executable === 'codex');
			if (native) {
				await this.configuration.updateValue(AgentHostCodexAgentEnabledSettingId, true, session ? ConfigurationTarget.WORKSPACE : ConfigurationTarget.USER);
				const firstQuestion = !this.conversation?.resource;
				const resource = this.conversation?.resource ?? getNewChatSessionResource('agent-host-codex');
				if (session?.root === root) { this.bindExplorationTools(resource); }
				const widget = await this.aiDialog.open({ resource, onClose: () => this.closeConversation(root) });
				if (!widget) { this.host.report(localize('ade.ai.dialog.closed', "Assistant Closed")); return; }
				if (session?.root === root) {
					const chosen = this.storage.get('ade.ai.diagramModel.codex', StorageScope.PROFILE);
					if (chosen && (firstQuestion || session.selectedModel !== chosen)) {
						const selected = this.languageModels.getLanguageModelIds().map(identifier => ({ identifier, metadata: this.languageModels.lookupLanguageModel(identifier) })).find(entry => entry.metadata?.targetChatSessionType === 'agent-host-codex' && parseCodexModelSelection({ id: entry.metadata.id })?.modelId === chosen && parseCodexModelSelection({ id: entry.metadata.id })?.modelProvider === 'openai');
						if (!selected?.metadata) { throw new Error(localize('ade.explore.modelUnavailable', "The Selected Diagram Model Is Not Available in Codex Chat: {0}. Choose an Available Model and Retry.", chosen)); }
						widget.input.setCurrentLanguageModel({ identifier: selected.identifier, metadata: selected.metadata }, false, false);
						session.selectedModel = chosen;
					}
					session.resource = resource.toString(); this.persistExploration();
					widget.attachmentModel.updateContext(['ade:exploration'], [{ kind: 'generic', id: 'ade:exploration', name: localize('ade.explore.context', "Architecture Exploration"), value: JSON.stringify({ instruction: diagramSessionInstruction, sessionId: session.id, root, activeView: this.project.activeView?.id ?? null }) }]);
				}
				if (codeUpdate) { await widget.attachmentModel.addFile(URI.file(codeUpdate.contextFile)); }
				if (this.project.modelUri && !session) {
					const previous = this.conversation?.attachedModel;
					if (previous && previous !== this.project.modelUri.toString()) { widget.attachmentModel.delete(previous); }
					if (!widget.attachmentModel.fileAttachments.some(uri => uri.toString() === this.project.modelUri!.toString())) { await widget.attachmentModel.addFile(this.project.modelUri); }
				}
				widget.attachmentModel.updateContext(['ade:diagram-context'], [{ kind: 'generic', id: 'ade:diagram-context', name: localize('ade.ai.currentDiagramContext', "Current Diagram"), value: JSON.stringify({ ...(session?.root === root ? { sessionId: session.id } : { model: this.project.modelUri?.fsPath }), diagram: this.project.activeView ? { id: this.project.activeView.id, name: this.project.activeView.name } : null }) }]);
				this.conversation = { root, resource, attachedModel: this.project.modelUri?.toString(), codeUpdate };
				if (initialPrompt !== undefined || session?.root === root && firstQuestion) { widget.setInput(initialPrompt ?? this.conversationPrompt()); }
				widget.setInputPlaceholder(localize('ade.ai.chatPlaceholder', "Ask Codex to Change the Diagram or Its Code…")); widget.focusInput();
			} else {
				const provider = this.connection.config?.provider ?? 'codex';
				const executable = await this.connection.resolveCli(provider);
				if (!executable) { return; }
				const account = await this.code.checkCliAccount(provider, executable);
				if (account.status !== 'signedIn') { if (account.status === 'signedOut') { await this.connection.signIn(provider, true); } else { await this.connection.checkAccount(provider, executable); } return; }
				let model = codeUpdate ? this.connection.config?.model : this.storage.get(`ade.ai.diagramModel.${provider}`, StorageScope.PROFILE) ?? this.connection.config?.model;
				if (!model) { model = await this.selectDiagramModel({ version: 1, provider, connection: 'cli', executable, model: '', timeoutMs: 180000, maxContextBytes: 262144, maxCalls: 1 }); if (!model) { return; } }
				const config: CliConfig = { version: 1, provider, connection: 'cli', executable, model, timeoutMs: 300000, maxContextBytes: 262144, maxCalls: this.connection.config?.maxCalls ?? 1 };
				this.conversation = { root, codeUpdate };
				await this.aiDialog.open({ prompt: initialPrompt ?? (session?.root === root ? this.conversationPrompt() : ''), onClose: () => this.closeConversation(root), send: (messages, token) => this.sendConversation(root, config, messages, token) });
			}
			this.watchConversation();
			this.host.report(codeUpdate ? localize('ade.codeUpdate.ready', "Assistant Is Open · Saved Model Ready for Code Implementation") : localize('ade.ai.chatModalReady', "Assistant Is Open · Diagrams Update Automatically"));
		} catch (error) { await this.aiDialog.close(); this.conversation = undefined; this.conversationWatch.clear(); const message = localize('ade.ai.chatFailed', "Could Not Open Codex: {0}", error instanceof Error ? error.message : String(error)); this.host.report(message); this.notifications.error(adeErrorNotification(error, 'ai', this.project.model)); }
		finally { this.chatOpening = false; this.host.busy = false; opening.dispose(); this.host.changed(); }
	}

	private conversationPrompt(): string {
		if (getDiagramExplorationPhase(this._diagramExploration) === 'applied') { return ''; }
		if (this._diagramExploration?.phase === 'discovery') { return localize('ade.explore.discoverFeatures', "Identify the project features and their source evidence with the ADE tools. Then prepare the necessary diagrams one feature at a time, reusing shared elements and relations by their existing IDs. Finish with one project review."); }
		if (this._diagramExploration?.phase) { return localize('ade.explore.resumeFeatures', "Inspect the saved ADE checkpoint and continue the next permitted step. Keep valid drafts and reuse existing elements and relations. Finish each feature before proceeding to the next, then open one project review."); }
		return this._diagramExploration?.plan ? localize('ade.explore.repairPrompt', "Continue the saved diagram plan. Inspect its existing drafts and final-review blockers first. Keep valid diagrams and shared IDs. Repair assigned invalid drafts with supersedes and relink their tasks. Archive obsolete unassigned invalid attempts with ade_proposal_discard and a reason. Complete missing diagrams without intermediate approvals, then report whether the complete project review is ready.") : localize('ade.explore.firstQuestion', "Plan the relevant project diagrams from overview to detail using the ADE tools, then create and preview every planned draft. Continue without intermediate approvals and finish with one complete project review.");
	}

	async returnToDiagrams(): Promise<void> { await this.aiDialog.close(); }

	private async closeConversation(root: string): Promise<void> {
		if (this.conversation?.root !== root) { return; }
		this.conversation = undefined; this.conversationWatch.clear();
		this.explorationTools.clear(); this.explorationBinding = undefined;
		if (this.exploration?.root === root) { this.exploration.resource = undefined; this.persistExploration(); }
		try { await this.refreshExploration(true); } catch (error) { this.notifications.error(adeErrorNotification(error, 'ai', this.project.model)); }
		this.host.changed();
	}

	private watchConversation(): void {
		this.conversationWatch.clear();
		const session = this.conversation?.codeUpdate ? undefined : this.exploration;
		if (!session) { return; }
		const refresh = this.conversationWatch.add(new ThrottledDelayer<void>(300));
		this.watchExplorationJournal(session, this.conversationWatch, () => {
			void refresh.trigger(async () => {
				if (this.exploration?.id === session.id) { await this.refreshExploration(true); }
			}).catch(error => { if (this.conversation && !isCancellationError(error)) { this.notifications.error(adeErrorNotification(error, 'ai', this.project.model)); } });
		});
	}

	private watchExplorationJournal(session: ExplorationSession, disposables: DisposableStore, refresh: () => void): void {
		const directory = URI.joinPath(URI.file(session.root), '.ade', 'exploration');
		const resource = URI.joinPath(directory, `${session.id}.json`);
		const watcher = disposables.add(this.files.createWatcher(directory, { recursive: false, excludes: [] }));
		disposables.add(watcher.onDidChange(event => {
			if (event.contains(resource)) { refresh(); }
		}));
	}

	private async sendConversation(root: string, config: CliConfig, messages: AdeAiMessage[], token: CancellationToken): Promise<string> {
		if (!this.conversation || this.conversation.root !== root || !await this.trust.requestWorkspaceTrust()) { throw new Error(localize('ade.explore.scopeChanged', "The Exploration Project Is No Longer Active.")); }
		const update = this.conversation.codeUpdate;
		if (update && (this.project.modelUri?.toString() !== update.modelUri || canonicalJson(this.project.model) !== update.revision)) { throw new Error(localize('ade.codeUpdate.changed', "The Model Changed. Close the Assistant and Choose Update Codebase from Diagrams Again to Use the Latest Saved Changes.")); }
		const operation = this.operations.acquire('ai');
		if (!operation) { throw new Error(localize('ade.ai.busy', "Another A.D.E Operation Is Running. Wait for It to Finish.")); }
		this.host.busy = true; this.host.changed();
		const requestId = generateUuid(), conversation = this.conversation;
		const progress = this.code.onDidAiProgress(event => { if (event.requestId === requestId && this.conversation === conversation && !token.isCancellationRequested) { this.aiDialog.updateConversation(event); } });
		try {
			const session = !update && this.exploration?.root === root ? this.exploration : undefined;
			const result: { text: string } = JSON.parse(await this.code.executeReconciliation({ operation: 'diagramChat', requestId, root, ...(session ? { snapshot: this.code.context!.snapshot, sessionId: session.id } : {}), config: JSON.stringify(config), messages: session ? messages : [{ role: 'user', text: `${update ? 'Code implementation context: read ' + update.contextFile + ' for the exact saved model and before/after changes. Preserve the ADE model files. ' : ''}Project context: model file ${this.project.modelUri?.fsPath ?? 'not saved'}, active diagram ${this.project.activeView?.id ?? 'none'}. Preserve semantic IDs and valid references. Only edit files when the user requests a change.` }, ...messages] }, token));
			return result.text;
		} finally {
			progress.dispose(); operation.dispose(); this.host.busy = false;
			if (!update && this.code.context?.sourceRoot === root) { try { await this.refreshExploration(true); } catch (error) { this.notifications.error(adeErrorNotification(error, 'ai', this.project.model)); } }
			if (!update && !token.isCancellationRequested && this._diagramReview?.root === root) { await this.reviewDiagramProposal(this._diagramReview.id); }
			this.host.changed();
		}
	}

	private persistExploration(): void {
		if (this.exploration) { this.storage.store('ade.ai.exploration', JSON.stringify(this.exploration), StorageScope.WORKSPACE, StorageTarget.MACHINE); }
	}

	/** A reimport can replace .ade while the workspace still remembers its old session. */
	private async discardMissingExploration(): Promise<void> {
		const session = this.exploration;
		if (!session || session.root !== this.code.context?.sourceRoot) { return; }
		const snapshot = this.code.context.snapshot;
		try {
			await this.files.stat(URI.joinPath(URI.file(session.root), '.ade', 'exploration', `${session.id}.json`));
		} catch (error) {
			if (!(error instanceof Error) || toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) { throw error; }
			if (this.exploration !== session || this.code.context?.sourceRoot !== session.root || this.code.context.snapshot !== snapshot) { return; }
			this.resetProject();
			this.exploration = undefined;
			this.storage.remove('ade.ai.exploration', StorageScope.WORKSPACE);
			this.host.report(localize('ade.explore.removed', "Previous Exploration Was Removed · Ready to Start a New Exploration"));
			this.host.changed();
		}
	}

	private async explorationRequest(request: object, token = CancellationToken.None, failOnDiagnostics = true): Promise<{ sessionId: string; data: CodeDiagramExploration & { reviewFile?: string; images?: { path: string; viewId: string }[]; snapshot?: string; reviewId?: string; proposal?: CodeDiagramExploration['proposals'][number]; mcp?: { command: string; args: string[] } }; diagnostics: { code: string }[] }> {
		const context = this.code.context;
		if (!context) { throw new Error(localize('ade.explore.importRequired', "Import a Project to Explore Its Architecture.")); }
		const result = JSON.parse(await this.code.executeReconciliation({ operation: 'exploration', snapshot: context.snapshot, request: JSON.stringify(request) }, token));
		if (failOnDiagnostics && result.diagnostics?.length) { throw new Error(result.diagnostics.map((entry: { code: string }) => entry.code).join(' · ')); }
		return result;
	}

	private async refreshExploration(live = false, token = CancellationToken.None): Promise<void> {
		const session = this.exploration, snapshot = this.code.context?.snapshot;
		if (!session || session.root !== this.code.context?.sourceRoot || token.isCancellationRequested) { return; }
		const refresh = ++this.explorationRefresh;
		const current = () => !token.isCancellationRequested && this.exploration === session && this.code.context?.sourceRoot === session.root && this.code.context.snapshot === snapshot && refresh >= this.appliedExplorationRefresh;
		await this.discardMissingExploration();
		if (!current()) { return; }
		const result = await this.explorationRequest({ action: live ? 'status' : 'open', sessionId: session.id }, token);
		if (!current() || result.sessionId !== session.id) { return; }
		this.appliedExplorationRefresh = refresh;
		const previous = this._diagramExploration;
		this._diagramExploration = result.data;
		const activityChanged = this.recordPersistedDiagramActivity(session, result.data, previous);
		if (activityChanged || !previous || !equals({ ...previous, budgetWindow: undefined }, { ...result.data, budgetWindow: undefined })) { this.host.changed(); }
		if (this.conversation) {
			const issues = result.data.batch?.blockers.length ?? 0;
			this.aiDialog.updateProgress(issues ? localize('ade.ai.dialog.repairProgress', "{0} Planned Diagrams · Review Needs Correction · {1} Project Tool Calls", result.data.plan?.items.length ?? 0, result.data.usage.toolCalls) : localize('ade.ai.dialog.progress', "{0} of {1} Planned Diagrams Prepared · {2} Project Tool Calls", result.data.tasks.filter(task => ['ready', 'applied', 'cancelled'].includes(task.status)).length, result.data.plan?.items.length ?? 0, result.data.usage.toolCalls));
		}
	}

	private bindExplorationTools(resource: URI): void {
		const session = this.exploration;
		if (!session) { return; }
		if (this.explorationBinding === session.id) { if (this.explorationToolResource && this.explorationToolResource.toString() !== resource.toString()) { this.activeClients.moveSessionTools(this.explorationToolResource, resource); this.explorationToolResource = resource; } return; }
		this.explorationTools.clear(); this.explorationBinding = session.id;
		const ids = diagramToolDefinitions.map(tool => {
			const id = `ade.${session.id}.${tool.name}`;
			this.explorationTools.add(this.tools.registerTool({ id, toolReferenceName: tool.name, displayName: localize('ade.explore.tool', "A.D.E Architecture: {0}", tool.name), modelDescription: tool.description, source: ToolDataSource.Internal, inputSchema: tool.inputSchema as IJSONSchema, canBeReferencedInPrompt: false, agentHostPreferences: { availability: 'session', defer: 'never' } }, {
				invoke: async (invocation, _countTokens, _progress, token) => {
					if (this.code.context?.sourceRoot !== session.root || !invocation.context || !await this.trust.requestWorkspaceTrust()) { throw new Error(localize('ade.explore.scopeChanged', "The Exploration Project Is No Longer Active.")); }
					const scope = this.activeClients.acquireSessionTools(invocation.context.sessionResource);
					try { if (!scope.object.get().some(definition => definition.name === tool.name)) { throw new Error(localize('ade.explore.sessionScope', "These Tools Belong to Another Conversation.")); } } finally { scope.dispose(); }
					if (this.exploration?.id === session.id && this.exploration.resource !== invocation.context.sessionResource.toString()) { this.exploration.resource = invocation.context.sessionResource.toString(); this.persistExploration(); }
					if (this.conversation?.root === session.root && this.conversation.resource) { this.conversation.resource = invocation.context.sessionResource; }
					const result = await this.explorationRequest({ action: 'tool', sessionId: session.id, tool: tool.name, arguments: invocation.parameters, callId: invocation.callId, ...(invocation.chatRequestId || invocation.context.requestId ? { turnId: invocation.chatRequestId ?? invocation.context.requestId } : {}), ...(invocation.modelId ? { model: invocation.modelId } : {}) }, token, false);
					await this.refreshExploration();
					return { content: [{ kind: 'text', value: JSON.stringify(result) }] };
				}
			}));
			return id;
		});
		this.activeClients.setSessionTools(resource, ids); this.explorationToolResource = resource;
		this.explorationTools.add({ dispose: () => this.activeClients.clearSessionTools(resource) });
	}

	private async exploreDiagrams(initialPrompt?: string, refreshApplied = false, openConversation = false): Promise<void> {
		if (this.host.busy || this.operations.busy || !this.code.context) { return; }
		let opened = false, needsBudget = false;
		await this.host.run(async token => {
			if (!await this.project.save()) { return; }
			const root = this.code.context!.sourceRoot;
			if (this.exploration?.root !== root) { this.exploration = undefined; }
			await this.discardMissingExploration();
			const startFresh = refreshApplied && !!this._diagramExploration?.phase && getDiagramExplorationPhase(this._diagramExploration) === 'applied';
			if (startFresh) { await this.returnToDiagrams(); }
			const previous = startFresh ? undefined : this.exploration;
			const result = await this.explorationRequest({ action: 'open', workflow: 'project', featureWorkflow: true, ...(!previous || this._diagramExploration?.workflow !== 'project' ? { budget: { maxToolCalls: 400, maxReadBytes: 8388608, maxDurationMs: 5400000, maxModelTurns: 32 } } : {}), ...(previous ? { sessionId: previous.id } : { model: this.storage.get('ade.ai.diagramModel.codex', StorageScope.PROFILE) ?? 'chat-selected' }) }, token);
			this.exploration = { ...previous, ...(!openConversation && initialPrompt ? { goal: initialPrompt } : {}), root, id: result.sessionId, snapshot: this.code.context!.snapshot };
			this._diagramExploration = result.data; needsBudget = !!result.data.budgetStatus?.exhausted.length; this._diagramProgress = undefined; this.persistExploration();
			opened = true;
		}, { kind: 'diagram', inline: true });
		if (opened && needsBudget) { await this.configureDiagramBudget(); if (this._diagramExploration?.budgetStatus?.exhausted.length) { return; } }
		if (!opened) { return; }
		if (openConversation || !this._diagramExploration?.phase) { await this.chat(initialPrompt); return; }
		if (getDiagramExplorationPhase(this._diagramExploration) === 'review') { await this.reviewDiagramProposal(); return; }
		await this.runFeatureExploration();
	}

	private recordDiagramActivity(session: ExplorationSession, entry: AdeDiagramActivity): boolean {
		const text = entry.text.trim().slice(0, 1600);
		if (!text) { return false; }
		const activity = session.activity ??= [];
		const previous = activity.findIndex(item => item.requestId === entry.requestId && item.kind === entry.kind && item.itemId === entry.itemId);
		if (previous >= 0) {
			if (activity[previous].text === text) { return false; }
			activity[previous] = { ...entry, text };
		} else {
			activity.push({ ...entry, text });
			if (activity.length > 30) { activity.shift(); }
		}
		return true;
	}

	private updateDiagramLiveProgress(changes: Partial<AdeDiagramLiveProgress>, activityChanged = false): boolean {
		const previous = this._diagramLiveProgress;
		if (!previous) { return false; }
		const next = { ...previous, ...changes };
		if (!activityChanged && equals(previous, next)) { return false; }
		this._diagramLiveProgress = { ...next, updatedAt: Date.now() };
		return true;
	}

	private recordPersistedDiagramActivity(session: ExplorationSession, state: CodeDiagramExploration, previous: CodeDiagramExploration | undefined): boolean {
		const requestId = this.diagramRequestId;
		if (!requestId || !this._diagramLiveProgress || !state.toolActivity) { return false; }
		const latest = state.toolActivity.findLast(call => call.turnId === requestId);
		const completed = state.toolActivity.findLast(call => call.state === 'complete');
		const known = new Set(previous?.toolActivity?.map(call => call.id));
		for (const call of state.toolActivity) {
			if (call.turnId === requestId && !known.has(call.id)) {
				this.recordDiagramActivity(session, { requestId, itemId: call.id, kind: 'tool', text: call.tool });
			}
		}
		const running = latest?.state === 'running';
		const previousLatest = previous?.toolActivity?.findLast(call => call.turnId === requestId);
		return this.updateDiagramLiveProgress({
			...(latest && this._diagramLiveProgress.state !== 'stopping' ? { state: running ? 'tool' : 'waiting', activeTool: running ? latest.tool : undefined } : {}),
			...(completed ? { lastCompletedTool: completed.tool } : {})
		}, latest?.id !== previousLatest?.id || latest?.state !== previousLatest?.state);
	}

	private recordDiagramProviderEvent(session: ExplorationSession, event: CodeAiProgress): void {
		if (event.kind === 'message') {
			if (event.text && this.recordDiagramActivity(session, { requestId: event.requestId, itemId: event.itemId, kind: 'message', text: event.text })) { this.host.changed(); }
		} else if (event.kind !== 'tool' && this._diagramLiveProgress?.state !== 'tool') {
			const state = event.kind === 'thinking' ? 'working' : event.kind;
			if (this.updateDiagramLiveProgress({ state })) { this.host.changed(); }
		}
	}

	private async runFeatureExploration(): Promise<void> {
		const session = this.exploration, context = this.code.context;
		if (!session || !context || session.root !== context.sourceRoot || !this._diagramExploration || getDiagramExplorationPhase(this._diagramExploration) !== 'incomplete' || this.diagramClarification) { return; }
		const snapshot = context.snapshot;
		this._diagramExplorationIssue = undefined;
		await this.host.run(async operationToken => {
			const cancellation = new CancellationTokenSource(operationToken);
			this.explorationRun.value = cancellation;
			const token = cancellation.token;
			const current = () => this.exploration === session && this.code.context?.sourceRoot === session.root && this.code.context.snapshot === snapshot;
			const liveWatch = new DisposableStore();
			this.diagramRunning = true;
			this.host.changed();
			try {
				const configured = await this.readyDiagramConfig();
				if (!configured || !current() || token.isCancellationRequested) { return; }
				if (!configured.maxCalls) { this._diagramExplorationIssue = localize('ade.explore.requestsOff', "Enable AI Requests to Prepare the Diagrams."); return; }
				const model = this.storage.get(`ade.ai.diagramModel.${configured.provider}`, StorageScope.PROFILE) ?? await this.selectDiagramModel(configured);
				if (!model || !current() || token.isCancellationRequested) { return; }
				const config = { ...configured, model };
				const approvedScope = canonicalJson([snapshot, context.scope, config.provider, config.model]);
				if (session.approvedScope !== approvedScope) {
					const provider = config.provider === 'codex' ? 'Codex' : 'Claude Code';
					const included = context.files.filter(file => file.status !== 'excluded').length;
					const confirmation = await this.dialogs.confirm({
						message: localize('ade.explore.confirmStart', "Generate Diagrams with {0}?", model),
						detail: localize('ade.explore.confirmScope', "{0}\nImported source scope · Included {1} · Excluded {2}\n{3} will receive relevant source excerpts as each feature is analyzed. You can stop at any time and review the proposed diagrams before applying them.", context.sourceRoot, included, context.files.length - included, provider),
						primaryButton: localize('ade.explore.confirmAction', "Generate Diagrams")
					});
					if (!confirmation.confirmed || !current() || token.isCancellationRequested) { return; }
					session.approvedScope = approvedScope;
					this.persistExploration();
				}
				const opened = await this.explorationRequest({ action: 'open', sessionId: session.id, model }, token);
				if (!current() || token.isCancellationRequested) { return; }
				this._diagramExploration = opened.data;
				const startedAt = Date.now();
				this._diagramLiveProgress = { state: 'connecting', startedAt, updatedAt: startedAt };
				const refresh = liveWatch.add(new ThrottledDelayer<void>(120));
				const refreshLive = () => {
					if (!current() || token.isCancellationRequested || refresh.isTriggered()) { return; }
					void refresh.trigger(async () => {
						if (current() && !token.isCancellationRequested) { await this.refreshExploration(true, token); }
					}).catch(() => { /* The checkpoint completion also refreshes the saved state. */ });
				};
				this.watchExplorationJournal(session, liveWatch, refreshLive);
				this.host.changed();
				const attempts = new Map<string, number>();
				const maxAttemptsPerCheckpoint = 2;
				let retrying = false;
				for (let turn = 0; turn < opened.data.budget.maxModelTurns && current() && !token.isCancellationRequested; turn++) {
					const state = this._diagramExploration;
					if (!state || state.phase === 'review' || state.budgetStatus?.exhausted.length || getDiagramExplorationPhase(state) !== 'incomplete') { break; }
					const step = checkpoint(state);
					const attempt = (attempts.get(step) ?? 0) + 1;
					if (attempt > maxAttemptsPerCheckpoint) {
						this._diagramExplorationIssue = localize('ade.explore.checkpointStalled', "This Step Needs Another Attempt. Review the Activity Details and Continue Generation When Ready.");
						break;
					}
					attempts.set(step, attempt);
					const clarification = session.clarification?.checkpoint === step ? session.clarification : undefined;
					if (clarification && !clarification.answer) { break; }
					const requestId = generateUuid();
					this.diagramRequestId = requestId;
					if (this.updateDiagramLiveProgress({ state: 'connecting', activeTool: undefined, retrying })) { this.host.changed(); }
					const prompt = 'Complete only the current ADE checkpoint. Use the provided phase and IDs, and inspect current ADE evidence. Stop when the checkpoint advances. If an unresolved domain decision prevents progress, end with one line prefixed CLARIFICATION: followed by the question.';
					const recovery = retrying ? 'The previous attempt timed out. Start with ade_project_inspect to recover the saved task and draft. Reuse valid saved work and finish the remaining validation or checkpoint update. Preserve canonical IDs if a saved draft needs repair.' : undefined;
					const messages: AdeAiMessage[] = [{ role: 'user', text: [prompt, recovery, session.goal, clarification?.answer ? `User clarification (data): ${JSON.stringify({ question: clarification.question, answer: clarification.answer })}` : undefined].filter(Boolean).join('\n') }];
					const progress = this.code.onDidAiProgress(event => {
						if (event.requestId !== requestId || !current() || token.isCancellationRequested) { return; }
						if (event.kind === 'tool') { refreshLive(); }
						else { this.recordDiagramProviderEvent(session, event); }
					});
					let result: CodeDiagramCheckpointResult;
					try {
						const checkpointTimeoutMinutes = getDiagramCheckpointTimeoutMinutes(this.configuration.getValue(diagramCheckpointTimeoutSetting));
						result = JSON.parse(await this.code.executeReconciliation({ operation: 'diagramChat', checkpoint: true, checkpointTimeoutMinutes, requestId, root: session.root, snapshot, sessionId: session.id, config: JSON.stringify(config), messages }, token));
					} finally { progress.dispose(); }
					if (!current() || token.isCancellationRequested) { break; }
					if (result.text && !session.activity?.some(item => item.requestId === requestId && item.kind === 'message') && this.recordDiagramActivity(session, { requestId, kind: 'message', text: result.text })) { this.host.changed(); }
					refresh.cancel();
					await this.refreshExploration(true, token);
					if (!current() || token.isCancellationRequested || !this._diagramExploration) { break; }
					const saved = this._diagramExploration;
					retrying = false;
					if (step !== checkpoint(saved)) {
						session.clarification = undefined;
						continue;
					}
					const waiting = saved.tasks.find(task => task.id === state.nextTaskId && task.status === 'waitingUser');
					const question = waiting?.gaps.find(gap => gap.trim()) ?? /^CLARIFICATION:[ \t]*(.+)$/im.exec(result.text ?? '')?.[1];
					if (question?.trim() && question.trim() !== clarification?.question) {
						session.clarification = { checkpoint: step, question: question.trim().slice(0, 1500) };
						break;
					}
					if (result.timeout) {
						if (saved.budgetStatus?.exhausted.length) { break; }
						if (attempt === maxAttemptsPerCheckpoint || turn + 1 === opened.data.budget.maxModelTurns) {
							this._diagramExplorationIssue = checkpointTimeoutIssue(result.timeout);
							break;
						}
						retrying = true;
					}
				}
				if (current() && token.isCancellationRequested) { this._diagramExplorationIssue = localize('ade.explore.stopped', "Generation Stopped. Continue from the Saved Step When Ready."); }
			} catch (error) {
				if (current()) {
					this._diagramExplorationIssue = token.isCancellationRequested || isCancellationError(error) ? localize('ade.explore.stopped', "Generation Stopped. Continue from the Saved Step When Ready.") : adeErrorNotification(error, 'ai', this.project.model);
				}
			} finally {
				liveWatch.dispose();
				this.explorationRun.clear();
				if (current()) {
					if (this.diagramRequestId && (token.isCancellationRequested || this._diagramExplorationIssue)) {
						await this.refreshExploration(true).catch(() => { /* Keep the last acknowledged state available. */ });
					}
					this.persistExploration();
				}
				this.diagramRequestId = undefined;
				this._diagramLiveProgress = undefined;
			}
		}, { kind: 'diagram', inline: true });
		if (this._diagramReview && this.exploration === session && getDiagramExplorationPhase(this._diagramExploration) === 'review') { await this.reviewDiagramProposal(); }
	}

	async configureDiagramCheckpointTimeout(): Promise<void> {
		const parseMinutes = (input: string) => /^\d+$/.test(input.trim()) ? Number(input) : undefined;
		const input = await this.quick.input({
			title: localize('ade.diagram.attemptLimitTitle', "Diagram Attempt Time Limit"),
			value: String(getDiagramCheckpointTimeoutMinutes(this.configuration.getValue(diagramCheckpointTimeoutSetting))),
			prompt: localize('ade.diagram.attemptLimitPrompt', "Enter minutes per attempt. The new limit applies when the next attempt starts."),
			showConfirmButton: true,
			validateInput: async value => isDiagramCheckpointTimeoutMinutes(parseMinutes(value)) ? undefined : localize('ade.diagram.attemptLimitRange', "Enter a whole number from 1 to {0}.", maxDiagramCheckpointTimeoutMinutes)
		});
		if (input === undefined) { return; }
		const minutes = parseMinutes(input);
		if (isDiagramCheckpointTimeoutMinutes(minutes)) {
			await this.configuration.updateValue(diagramCheckpointTimeoutSetting, minutes, ConfigurationTarget.USER);
		}
	}

	async configureDiagramBudget(): Promise<void> {
		if (!this.exploration || this.host.busy) { return; }
		const selected = await this.quick.pick([
			{ label: localize('ade.explore.budgetSmall', "Explore One Scenario"), description: localize('ade.explore.budgetSmallDetail', "8 Reported Turns · 80 Local Tool Calls · 1 MiB Retrieved · 30 Minutes"), calls: 80, bytes: 1048576, turns: 8, duration: 1800000 },
			{ label: localize('ade.explore.budgetMedium', "Explore Several Scenarios"), description: localize('ade.explore.budgetMediumDetail', "16 Reported Turns · 160 Local Tool Calls · 2 MiB Retrieved · 60 Minutes"), calls: 160, bytes: 2097152, turns: 16, duration: 3600000 }
		], { title: localize('ade.explore.budget', "Add Exploration Budget"), placeHolder: localize('ade.explore.budgetHint', "Evidence and Drafts Are Retained. Provider Turns and Tokens Are Counted Only When Reported.") });
		if (!selected || !this._diagramExploration) { return; }
		const { usage, budget: current, budgetWindow } = this._diagramExploration;
		const remainingMs = Math.max(0, current.maxDurationMs - (budgetWindow ? Math.max(0, Date.now() - budgetWindow.started) : 0));
		await this.host.run(async token => { await this.explorationRequest({ action: 'budget', sessionId: this.exploration!.id, budget: { maxToolCalls: Math.min(1000, Math.max(current.maxToolCalls, usage.toolCalls) + selected.calls), maxReadBytes: Math.min(33554432, Math.max(current.maxReadBytes, usage.readBytes) + selected.bytes), maxModelTurns: Math.min(100, Math.max(current.maxModelTurns, usage.modelTurns.length) + selected.turns), maxDurationMs: Math.min(86400000, Math.floor(remainingMs) + selected.duration) } }, token); await this.refreshExploration(); }, { kind: 'local' });
	}

	async reviewDiagramProposal(id?: string): Promise<void> {
		if (!this.exploration || this.host.busy || this.operations.busy) { return; }
		await this.host.run(async token => {
			await this.refreshExploration();
			const projectReview = this._diagramExploration?.workflow === 'project';
			let proposal = projectReview ? undefined : id ? this._diagramExploration?.proposals.find(entry => entry.id === id) : (await this.quick.pick(this._diagramExploration?.proposals.filter(entry => entry.status !== 'applied').map(entry => ({ label: entry.views.map(view => view.name).join(', ') || entry.id, description: entry.status, proposal: entry })) ?? [], { title: localize('ade.explore.review', "Review Diagram Draft") }))?.proposal;
			if ((!projectReview && (!proposal || proposal.status === 'applied')) || !await this.project.save() || !this.exploration) { return; }
			const modelUri = this.project.modelUri?.toString() ?? '';
			const semanticRevision = canonicalJson(semanticContent(this.project.model));
			const root = this.code.context!.sourceRoot;
			const sessionId = this.exploration.id;
			const preview = await this.explorationRequest(projectReview ? { action: 'review', sessionId } : { action: 'tool', sessionId, tool: 'ade_view_preview', arguments: { proposalId: proposal!.id } }, token, false);
			proposal = projectReview ? preview.data.proposal : proposal;
			if (!proposal || projectReview && !preview.data.reviewId) { throw new Error(localize('ade.explore.reviewMissing', "The Project Review Could Not Be Prepared. Continue Generation and Retry.")); }
			const contents = preview.data.reviewFile ? (await this.files.readFile(URI.file(preview.data.reviewFile))).value.toString() : JSON.stringify(preview.data, null, '\t');
			const report: { changes?: AdeDiagramReview['changes']; diff?: { items: AdeDiagramReview['changes'] }; sourceAnchors?: AdeDiagramReview['sources'] } = JSON.parse(contents);
			if (token.isCancellationRequested || this.code.context?.sourceRoot !== root || this.project.modelUri?.toString() !== modelUri || canonicalJson(semanticContent(this.project.model)) !== semanticRevision) { return; }
			this._diagramReview = { id: proposal.id, sessionId, root, modelUri, semanticRevision, proposal: structuredClone(proposal), changes: report.changes ?? report.diff?.items ?? [], sources: report.sourceAnchors ?? [], images: preview.data.images ?? [], contents, ...(projectReview ? { projectReviewId: preview.data.reviewId, plan: preview.data.plan, tasks: preview.data.tasks, featureCatalog: preview.data.featureCatalog, featurePlans: preview.data.featurePlans } : {}), ...(preview.diagnostics.length ? { problem: preview.diagnostics.map(entry => entry.code).join(' · ') } : {}) };
			await this.editors.openEditor({ resource: AdeInput.RESOURCE, options: { pinned: true, revealIfOpened: true } });
			this.host.changed();
		}, { kind: 'local' });
	}

	closeDiagramReview(): void { this._diagramReview = undefined; this.host.changed(); }

	async inspectDiagramReview(): Promise<void> {
		const review = this._diagramReview;
		if (review) {
			const resource = URI.joinPath(URI.file(review.root), '.ade', 'reports', generateUuid(), localize('ade.explore.reviewReportFile', "Diagram Review.json"));
			await this.files.createFolder(URI.joinPath(resource, '..'));
			await this.files.writeFile(resource, VSBuffer.fromString(review.contents + '\n'));
			await this.filesConfiguration.updateReadonly(resource, { value: localize('ade.explore.readonlyReview', "This is a diagram review snapshot. Refresh the review to create an updated version.") });
			await this.editors.openEditor({ resource, options: { pinned: true } });
		}
	}

	async applyDiagramReview(): Promise<void> {
		const review = this._diagramReview;
		if (!review || review.proposal.status !== 'ready' || review.problem || this.host.busy || this.operations.busy) { return; }
		await this.host.run(async token => {
			const current = () => this._diagramReview === review && this.exploration?.id === review.sessionId && this.code.context?.sourceRoot === review.root && this.project.modelUri?.toString() === review.modelUri && canonicalJson(semanticContent(this.project.model)) === review.semanticRevision;
			try {
				if (!await this.project.save()) { throw new Error(this.project.saveError ?? localize('ade.explore.saveRequired', "Save the Project Before Applying This Draft.")); }
				if (!current()) { throw new Error(localize('ade.explore.reviewChanged', "The Project Changed. Review This Draft Again Before Applying It.")); }
				if (!(await this.dialogs.confirm({ message: review.projectReviewId ? localize('ade.explore.applyAll', "Apply All Reviewed Diagram Changes?") : localize('ade.explore.apply', "Apply This Diagram Proposal?"), detail: localize('ade.explore.applyDetail', "{0}\nThe reviewed diagram changes are applied to the local project. Code files, Git commits and remotes are unchanged.", review.proposal.views.map(view => view.name).join(', ')), primaryButton: review.projectReviewId ? localize('ade.review.publishAll', "Apply All Changes") : localize('ade.review.publish', "Apply to Project") })).confirmed) { return; }
				if (!await this.project.save()) { throw new Error(this.project.saveError ?? localize('ade.explore.saveRequired', "Save the Project Before Applying This Draft.")); }
				if (!current() || token.isCancellationRequested) { throw new Error(localize('ade.explore.reviewChanged', "The Project Changed. Review This Draft Again Before Applying It.")); }
				const result = await this.explorationRequest(review.projectReviewId ? { action: 'publishAll', sessionId: review.sessionId, reviewId: review.projectReviewId } : { action: 'publish', sessionId: review.sessionId, proposalId: review.id }, token);
				this._diagramReview = undefined;
				if (result.data.snapshot) { const context = JSON.parse(await this.code.executeReconciliation({ operation: 'inspect', snapshot: result.data.snapshot }, token)); await this.code.openContext(context); }
				await this.refreshExploration();
			} catch (error) {
				if (this._diagramReview === review) { review.problem = error instanceof Error ? error.message : String(error); this.host.changed(); }
				throw error;
			}
		}, { kind: 'local', review });
	}

	private async readyDiagramConfig(): Promise<CliConfig | undefined> {
		if (!this.connection.config) {
			let executable = 'codex';
			if (!await this.code.resolveCli(executable)) {
				const selected = await this.connection.chooseCliExecutable('codex', executable);
				if (!selected) { this.host.report(localize('ade.ai.setupDeferred', "Setup Cancelled · Choose Build Diagrams to Continue")); return; }
				executable = selected;
			}
			const draft: CliConfig = { version: 1, provider: 'codex', connection: 'cli', model: '', executable, timeoutMs: 180000, maxContextBytes: 262144, maxCalls: 1 };
			const model = await this.selectDiagramModel(draft);
			if (!model) { this.host.report(localize('ade.ai.modelDeferred', "No Model Selected · Choose Build Diagrams to Continue")); return; }
			this.connection.configure({ ...draft, model });
		}
		if (!this.connection.config) { return undefined; }
		if (!this.connection.config.maxCalls) { return { ...this.connection.config }; }
		const executable = await this.connection.resolveCli(this.connection.config.provider);
		if (!executable) { return undefined; }
		const state = await this.code.checkCliAccount(this.connection.config.provider, executable);
		if (state.status === 'signedOut') {
			await this.connection.signIn(this.connection.config.provider, true);
			this.host.report(localize('ade.ai.finishDiagramSignIn', "Finish Signing In in the Terminal, Then Choose Build Diagrams Again")); return undefined;
		}
		if (state.status !== 'signedIn') { throw new Error(localize('ade.ai.diagramAccountCheck', "Could Not Verify the CLI Account. Check Its Connection and Retry Build Diagrams.")); }
		return { ...this.connection.config, executable };
	}

	async buildDiagrams(): Promise<void> { if (this.configuration.getValue<boolean>('ade.diagramImport.incremental') !== false) { await this.exploreDiagrams(); } else { await this.generateDiagrams(false); } }

	async resumeDiagrams(): Promise<void> { if (this.configuration.getValue<boolean>('ade.diagramImport.incremental') !== false) { await this.exploreDiagrams(); } else { await this.generateDiagrams(true); } }

	async updateDiagrams(): Promise<void> {
		if (this.host.busy || this.operations.busy || this.configuration.getValue<boolean>('chat.disableAIFeatures') === true || !await this.code.ensureProjectContext()) { return; }
		if (this.configuration.getValue<boolean>('ade.diagramImport.incremental') === false) { await this.generateDiagrams(true); return; }
		await this.exploreDiagrams(localize('ade.explore.updatePrompt', "Update the project diagrams from the current codebase using the ADE tools. Inspect the saved project and the workflow phase first. Identify code changes and preserve existing diagram and object IDs, feature identities and manual layout where they still apply. Prepare the affected diagrams in workflow order and reuse existing definitions. Read only the relevant sources, validate and preview all revised drafts, and finish with a single complete project review. Do not publish changes: I will apply them from the review."), true);
	}

	private async generateDiagrams(resume: boolean): Promise<void> {
		if (this.host.busy || this.operations.busy || !this.code.context) { return; }
		await this.host.run(async token => {
			const context = this.code.context;
			const configured = await this.readyDiagramConfig();
			if (!configured || !context || !await this.project.save()) { return; }
			const diagramModel = this.storage.get(`ade.ai.diagramModel.${configured.provider}`, StorageScope.PROFILE) ?? await this.selectDiagramModel(configured);
			if (!diagramModel) { return; }
			const config = { ...configured, model: diagramModel };
			// Completed jobs belong to their published snapshot. Updating from
			// later source changes needs a new interpretation, not a resume.
			const progress = resume && this._diagramProgress?.status !== 'complete' ? this._diagramProgress : undefined;
			let clarification: string | undefined;
			if (progress?.questions.length) { clarification = await this.quick.input({ title: localize('ade.ai.diagramClarify', "Clarify Diagram Interpretation"), prompt: progress.questions.join(' '), ignoreFocusLost: true }); if (!clarification) { return; } }
			let job: CodeDiagramProgress = JSON.parse(await this.code.executeReconciliation({ operation: 'diagramPrepare', snapshot: context.snapshot, config: JSON.stringify(config), ...(progress ? { resume: progress.id } : {}), clarification }, token));
			this._diagramProgress = job; this.storage.store('ade.ai.diagramJob', JSON.stringify(job), StorageScope.WORKSPACE, StorageTarget.MACHINE); this.host.changed();
			if (!config.maxCalls) { this.host.info(localize('ade.ai.diagramsNoBudget', "Diagram Scope Prepared. Enable AI Requests in AI Settings to Generate It.")); return; }
			const accepted = job.status === 'plan' ? { confirmed: true } : await this.dialogs.confirm({ message: localize('ade.ai.buildConfirm', "Propose a Diagram Plan with {0}?", config.model), detail: [localize('ade.ai.buildScopeShort', "{0} files · {1} indexed symbols.\nUp to {2} additional requests to {3}.", job.files, job.symbols, job.remainingRequests ?? job.total - job.completed, config.provider === 'codex' ? 'Codex' : 'Claude Code'), localize('ade.ai.buildDisclosure', "Source evidence is sent through your signed-in CLI account to analyze responsibilities and propose necessary diagrams. You will review the proposal before generating its views."), job.inputBudgetBytes ? localize('ade.ai.diagramContextBudget', "Input and schema: up to {0} bytes per request. {1} bytes left as estimated response headroom.", job.inputBudgetBytes, job.responseHeadroomBytes ?? 0) : '', job.calls ? localize('ade.ai.buildAttempted', "{0} requests already attempted. Completed steps will be reused.", job.calls) : '', job.excluded ? localize('ade.ai.buildExcluded', "{0} documentation, binary or oversized files excluded.", job.excluded) : ''].filter(Boolean).join('\n\n'), primaryButton: localize('ade.ai.buildButton', "Propose Diagrams") });
			if (!accepted.confirmed) { return; }
			this.diagramRunning = true;
			while (job.status === 'ready' || job.status === 'running' || job.status === 'plan') {
				if (job.status === 'plan') {
					this.diagramRunning = false; this.host.report(localize('ade.ai.diagramPlanReady', "Diagram Plan Ready · Review Before Generating Views"));
					const plan = job.plan ?? [];
					const approved = await this.dialogs.confirm({ message: localize('ade.ai.reviewDiagramPlan', "Review the Proposed Diagrams"), detail: [plan.map((item, index) => localize('ade.ai.diagramPlanRow', "{0}. {1} · {2}\n{3}", index + 1, item.name, viewLabels[item.kind], item.intent)).join('\n\n'), localize('ade.ai.diagramPlanBudget', "{0} diagrams · Up to {1} additional requests to {2}. Each diagram is a saved step. All approved diagrams must pass validation before the new snapshot is published.", plan.length, job.remainingRequests ?? plan.length, job.model)].join('\n\n'), primaryButton: localize('ade.ai.generatePlan', "Generate {0} Diagrams", plan.length) });
					if (!approved.confirmed) { this.host.report(localize('ade.ai.diagramPlanSaved', "Diagram Plan Saved · Review Diagram Plan to Continue")); return; }
					if (this.code.context?.snapshot !== context.snapshot) { throw new Error(localize('ade.ai.diagramProjectChanged', "The Active Project Changed. Open Its Diagrams to Continue.")); }
					job = JSON.parse(await this.code.executeReconciliation({ operation: 'diagramApprovePlan', snapshot: context.snapshot, id: job.id, reviewId: job.reviewId }, token));
					this._diagramProgress = job; this.storage.store('ade.ai.diagramJob', JSON.stringify(job), StorageScope.WORKSPACE, StorageTarget.MACHINE); this.diagramRunning = true; this.host.changed();
					continue;
				}
				const nextDiagram = job.plan?.find(item => item.status !== 'complete');
				this.host.report(nextDiagram ? localize('ade.ai.generatingView', "Generating {0} · {1} · {2}", nextDiagram.name, viewLabels[nextDiagram.kind], job.model) : localize('ade.ai.planningDiagramStep', "Analyzing Responsibilities and Planning Diagrams · {0} of {1} Steps · {2}", job.completed, job.total, job.model));
				try { job = JSON.parse(await this.code.executeReconciliation({ operation: 'diagramStep', snapshot: context.snapshot, id: job.id, reviewId: job.reviewId }, token)); }
				catch (error) {
					this._diagramProgress = { ...job, status: 'failed', error: token.isCancellationRequested ? localize('ade.ai.diagramPaused', "Generation Paused · Resume to Keep Completed Steps") : error instanceof Error ? error.message : String(error) };
					this.storage.store('ade.ai.diagramJob', JSON.stringify(this._diagramProgress), StorageScope.WORKSPACE, StorageTarget.MACHINE); throw error;
				}
				if (this.code.context?.snapshot !== context.snapshot) { throw new Error(localize('ade.ai.diagramProjectChanged', "The Active Project Changed. Open Its Diagrams to Continue.")); }
				this._diagramProgress = job; this.storage.store('ade.ai.diagramJob', JSON.stringify(job), StorageScope.WORKSPACE, StorageTarget.MACHINE); this.host.changed();
				if (job.context) { await this.code.openContext(job.context); this.host.report(localize('ade.ai.diagramsReady', "Diagrams Ready · {0} Responsibilities in {1} Views", this.project.model.semantics.elements.filter(item => item.kind !== 'feature').length, this.project.model.views.length)); return; }
				if (job.questions.length) { this.host.info(job.questions.join('\n')); return; }
			}
		}, { kind: 'diagram' });
	}

	async chooseDiagramModel(): Promise<void> {
		if (this.host.busy || this.operations.busy || !await this.connection.ensureConfigured()) { return; }
		const selected = await this.selectDiagramModel(this.connection.config!);
		if (selected && this.exploration && !this._diagramExploration?.phase && this.configuration.getValue<boolean>('ade.diagramImport.incremental') !== false) { await this.chat(); }
		else if (selected) { this.host.changed(); }
	}

	private async selectDiagramModel(configured: CliConfig): Promise<string | undefined> {
		const choices = (configured.provider === 'codex' && configured.executable !== 'codex' && this.connection.config?.executable !== 'codex' ? [] : this.connection.nativeModels(configured.provider)).sort((a, b) => (a.rates ? a.rates.input + a.rates.output : Infinity) - (b.rates ? b.rates.input + b.rates.output : Infinity));
		const model = choices.length ? (await this.quick.pick(choices, { title: localize('ade.ai.diagramModel', "Model for Diagrams"), placeHolder: localize('ade.ai.diagramModelHint', "Choose a Lower-Cost Model for Interpretation. Your Coding Model Is Kept Separately.") }))?.id : await this.quick.input({ title: localize('ade.ai.diagramModel', "Model for Diagrams"), value: this.storage.get(`ade.ai.diagramModel.${configured.provider}`, StorageScope.PROFILE) ?? configured.model, prompt: localize('ade.ai.diagramModelManual', "Use an exact model ID shown by /model in Codex or by your provider CLI. This model is saved separately for diagrams."), ignoreFocusLost: true });
		if (model) { this.storage.store(`ade.ai.diagramModel.${configured.provider}`, model, StorageScope.PROFILE, StorageTarget.MACHINE); }
		return model;
	}

	constructor(
		private readonly host: Pick<AdeAiWorkflow, 'activityStatus' | 'busy' | 'report' | 'changed' | 'run' | 'info'>,
		private readonly connection: AdeAiConnection,
		@IAdeProjectService private readonly project: AdeAiProject,
		@IAdeCodeService private readonly code: IAdeCodeService,
		@IQuickInputService private readonly quick: IQuickInputService,
		@INotificationService private readonly notifications: INotificationService,
		@IDialogService private readonly dialogs: IDialogService,
		@IFileService private readonly files: IFileService,
		@IEditorService private readonly editors: IEditorService,
		@IFilesConfigurationService private readonly filesConfiguration: IFilesConfigurationService,
		@IAdeAiDialogService private readonly aiDialog: IAdeAiDialogService,
		@ICodexAccountService private readonly codexAccount: ICodexAccountService,
		@IAgentSdkSetupService private readonly setup: IAgentSdkSetupService,
		@IConfigurationService private readonly configuration: IConfigurationService,
		@IStorageService private readonly storage: IStorageService,
		@IWorkspaceTrustRequestService private readonly trust: IWorkspaceTrustRequestService,
		@IAdeOperationService private readonly operations: AdeOperationService,
		@ILanguageModelToolsService private readonly tools: ILanguageModelToolsService,
		@IAgentHostActiveClientService private readonly activeClients: IAgentHostActiveClientService,
		@ILanguageModelsService private readonly languageModels: ILanguageModelsService
	) {
		super();
		try { this.exploration = JSON.parse(this.storage.get('ade.ai.exploration', StorageScope.WORKSPACE) ?? 'null') ?? undefined; } catch { /* Invalid session must be reopened. */ }
		const saved = this.storage.get('ade.ai.diagramJob', StorageScope.WORKSPACE);
		if (saved) { try { this._diagramProgress = JSON.parse(saved); } catch { /* Invalid saved progress. */ } }

	}

	get diagramReview(): AdeDiagramReview | undefined { return this._diagramReview; }
	get diagramProgress(): CodeDiagramProgress | undefined { return this._diagramProgress; }
	get diagramExploration(): CodeDiagramExploration | undefined { return this._diagramExploration; }
	get diagramActivity(): readonly AdeDiagramActivity[] | undefined { return this.exploration?.root === this.code.context?.sourceRoot ? this.exploration?.activity : undefined; }
	get diagramLiveProgress(): AdeDiagramLiveProgress | undefined { return this.exploration?.root === this.code.context?.sourceRoot && this.exploration?.snapshot === this.code.context?.snapshot ? this._diagramLiveProgress : undefined; }
	get diagramExplorationIssue(): string | undefined { return this._diagramExplorationIssue; }
	get diagramClarification(): string | undefined {
		const state = this._diagramExploration;
		if (!state || this.exploration?.root !== this.code.context?.sourceRoot) { return undefined; }
		const clarification = this.exploration?.clarification;
		if (clarification && clarification.checkpoint === checkpoint(state)) { return clarification.answer ? undefined : clarification.question; }
		return state.tasks.find(task => task.id === state.nextTaskId && task.status === 'waitingUser')?.gaps.find(gap => gap.trim());
	}
	stopDiagramExploration(showProgress = true): void {
		const run = this.explorationRun.value;
		if (!run || run.token.isCancellationRequested) { return; }
		const context = this.code.context;
		const stopping = showProgress && context && this.exploration?.root === context.sourceRoot && this.exploration.snapshot === context.snapshot;
		if (stopping) {
			const updatedAt = Date.now();
			this._diagramLiveProgress = { ...this._diagramLiveProgress, state: 'stopping', activeTool: undefined, startedAt: this._diagramLiveProgress?.startedAt ?? updatedAt, updatedAt };
		}
		run.cancel();
		if (stopping) { this.host.changed(); }
	}
	async clarifyDiagramExploration(): Promise<void> {
		const session = this.exploration, state = this._diagramExploration, question = this.diagramClarification;
		if (!session || !state || !question || this.host.busy || this.operations.busy) { return; }
		const answer = await this.quick.input({
			title: localize('ade.explore.clarification', "Clarification Needed"),
			prompt: question,
			ignoreFocusLost: true,
			validateInput: async value => value.trim().length > 2000 ? localize('ade.explore.answerLength', "Enter an Answer of 2,000 Characters or Fewer.") : undefined
		});
		if (!answer?.trim() || answer.trim().length > 2000 || this.exploration !== session || this._diagramExploration !== state || this.diagramClarification !== question) { return; }
		session.clarification = { checkpoint: checkpoint(state), question, answer: answer.trim() };
		this.persistExploration();
		this.host.changed();
		await this.runFeatureExploration();
	}
	beginGeneration(): void { this.diagramError?.close(); this.diagramError = undefined; }
	failGeneration(error: unknown): void { this.diagramError = this.notifications.notify({ severity: Severity.Error, message: adeErrorNotification(error, 'ai', this.project.model) }); }
	finishOperation(): void { this.diagramRunning = false; }
	resetProject(): void {
		this.stopDiagramExploration(false);
		this.appliedExplorationRefresh = ++this.explorationRefresh;
		this.diagramRequestId = undefined;
		this._diagramLiveProgress = undefined;
		void this.aiDialog.close().catch(error => { if (!isCancellationError(error)) { this.notifications.error(adeErrorNotification(error, 'ai', this.project.model)); } });
		this.conversation = undefined; this.conversationWatch.clear();
		this.explorationTools.clear(); this.explorationBinding = undefined;
		this._diagramExploration = undefined; this._diagramExplorationIssue = undefined; this._diagramReview = undefined;
	}
	followCodeContext(): void {
		const context = this.code.context;
		if (this.explorationRun.value && (context?.sourceRoot !== this.exploration?.root || context?.snapshot !== this.exploration?.snapshot)) { this.stopDiagramExploration(false); }
		if (this.conversation && context && this.conversation.root !== context.sourceRoot) { void this.aiDialog.close().catch(error => { if (!isCancellationError(error)) { this.notifications.error(adeErrorNotification(error, 'ai', this.project.model)); } }); this.conversation = undefined; this.conversationWatch.clear(); this.host.activityStatus = undefined; this.host.changed(); }
		if (this.exploration && context && this.exploration.root !== context.sourceRoot) { this.explorationTools.clear(); this.explorationBinding = undefined; this._diagramExploration = undefined; this._diagramExplorationIssue = undefined; }
		if (this._diagramProgress && context && this._diagramProgress.sourceRoot !== context.sourceRoot) { this._diagramProgress = undefined; this.host.changed(); }
		const session = this.exploration;
		if (session && context?.sourceRoot === session.root && !this._diagramExploration && this.configuration.getValue<boolean>('ade.diagramImport.incremental') !== false) {
			const key = JSON.stringify([session.root, session.id, context.snapshot]);
			if (this.restoringExploration === key) { return; }
			this.restoringExploration = key;
			void this.refreshExploration(true).catch(error => {
				if (this.exploration === session && this.code.context?.sourceRoot === session.root && !isCancellationError(error)) { this.notifications.error(adeErrorNotification(error, 'ai', this.project.model)); }
			}).finally(() => { if (this.restoringExploration === key) { this.restoringExploration = undefined; } });
		}

	}

	override dispose(): void {
		this.stopDiagramExploration(false);
		super.dispose();
	}
}
