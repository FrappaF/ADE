/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { diagramToolDefinitions, diagramSessionInstruction } from '../common/diagramTools.js';
import { ILanguageModelsService } from '../../chat/common/languageModels.js';
import { ILanguageModelToolsService, ToolDataSource } from '../../chat/common/tools/languageModelToolsService.js';
import { IAgentHostActiveClientService } from '../../chat/browser/agentSessions/agentHost/agentHostActiveClientService.js';
import { type IJSONSchema } from '../../../../base/common/jsonSchema.js';
import { localize } from '../../../../nls.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
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
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IAdeAiDialogService, type AdeAiMessage } from '../browser/adeAiDialog.js';
import { getNewChatSessionResource } from '../../chat/common/model/chatUri.js';
import { IAdeProjectService } from '../browser/adeProjectService.js';
import { IAdeCodeService } from '../browser/adeCodeService.js';
import { type AdeDiagramReview } from '../browser/adeAiService.js';
import { IAdeOperationService, AdeOperationService } from '../browser/adeOperationService.js';
import { AdeInput } from '../browser/adeInput.js';
import { viewLabels } from '../browser/adeLabels.js';
import { ThrottledDelayer } from '../../../../base/common/async.js';
import { canonicalJson, semanticContent } from '../common/modelSerialization.js';
import { CodeDiagramProgress, CodeDiagramExploration } from '../common/codeBridge.js';
import { getDiagramExplorationPhase } from '../common/diagramExplorationState.js';
import { type CliConfig, type AdeAiProject, type AdeAiWorkflow } from './adeAiTypes.js';
import { AdeAiConnection } from './adeAiConnection.js';

/** Diagram exploration, generation and review workflow; lifecycle belongs to this component. */
export class AdeAiDiagrams extends Disposable {
	private _diagramReview: AdeDiagramReview | undefined;

	private chatOpening = false;

	private diagramRunning = false;

	private diagramError: INotificationHandle | undefined;

	get generatingDiagrams(): boolean { return this.diagramRunning; }

	private conversation: { root: string; resource?: URI; attachedModel?: string } | undefined;

	private readonly conversationWatch = this._register(new DisposableStore());

	get chatLocation(): 'modal' | undefined { return this.conversation ? 'modal' : undefined; }

	private _diagramProgress: CodeDiagramProgress | undefined;

	private _diagramExploration: CodeDiagramExploration | undefined;

	private exploration: { root: string; id: string; snapshot: string; resource?: string; selectedModel?: string } | undefined;

	private readonly explorationTools = this._register(new DisposableStore());

	private explorationBinding: string | undefined;

	private explorationToolResource: URI | undefined;

	async chat(initialPrompt?: string): Promise<void> {
		if (this.host.busy || this.operations.busy || this.chatOpening || this.configuration.getValue<boolean>('chat.disableAIFeatures') === true) { return; }
		await this.discardMissingExploration();
		if (this.code.context && this.configuration.getValue<boolean>('ade.diagramImport.incremental') !== false && this.exploration?.root !== this.code.context.sourceRoot) { await this.exploreDiagrams(initialPrompt); return; }
		const opening = this.operations.acquire('ai');
		if (!opening) { return; }
		this.chatOpening = true; this.host.busy = true;
		this.host.report(localize('ade.ai.chatOpening', "Opening Codex…"));
		try {
			if (!await this.trust.requestWorkspaceTrust() || this.project.modelUri && !await this.project.save()) { this.host.report(localize('ade.ai.chatNotOpened', "Codex Was Not Opened")); return; }
			const root = this.code.context?.sourceRoot ?? this.project.projectRoot?.fsPath ?? this.project.model.id;
			if (this.conversation?.root !== root) { this.conversation = undefined; }
			const native = this.codexAccount.account.status === 'signedIn' && this.setup.setups.some(setup => setup.agent === 'codex' && setup.download === 'ready') && !this.configuration.getValue<string>(AgentHostCodexAgentCodexHomeSettingId) && (!this.connection.config || this.connection.config.provider !== 'codex' || this.connection.config.executable === 'codex');
			if (native) {
				await this.configuration.updateValue(AgentHostCodexAgentEnabledSettingId, true, this.exploration ? ConfigurationTarget.WORKSPACE : ConfigurationTarget.USER);
				const firstQuestion = !this.conversation?.resource;
				const resource = this.conversation?.resource ?? getNewChatSessionResource('agent-host-codex');
				if (this.exploration?.root === root) { this.bindExplorationTools(resource); }
				const widget = await this.aiDialog.open({ resource, onClose: () => this.closeConversation(root) });
				if (!widget) { this.host.report(localize('ade.ai.dialog.closed', "Assistant Closed")); return; }
				if (this.exploration?.root === root) {
					const chosen = this.storage.get('ade.ai.diagramModel.codex', StorageScope.PROFILE);
					if (chosen && (firstQuestion || this.exploration.selectedModel !== chosen)) {
						const selected = this.languageModels.getLanguageModelIds().map(identifier => ({ identifier, metadata: this.languageModels.lookupLanguageModel(identifier) })).find(entry => entry.metadata?.targetChatSessionType === 'agent-host-codex' && parseCodexModelSelection({ id: entry.metadata.id })?.modelId === chosen && parseCodexModelSelection({ id: entry.metadata.id })?.modelProvider === 'openai');
						if (!selected?.metadata) { throw new Error(localize('ade.explore.modelUnavailable', "The Selected Diagram Model Is Not Available in Codex Chat: {0}. Choose an Available Model and Retry.", chosen)); }
						widget.input.setCurrentLanguageModel({ identifier: selected.identifier, metadata: selected.metadata }, false, false);
						this.exploration.selectedModel = chosen;
					}
					this.exploration.resource = resource.toString(); this.persistExploration();
					widget.attachmentModel.updateContext(['ade:exploration'], [{ kind: 'generic', id: 'ade:exploration', name: localize('ade.explore.context', "Architecture Exploration"), value: JSON.stringify({ instruction: diagramSessionInstruction, sessionId: this.exploration.id, root, activeView: this.project.activeView?.id ?? null }) }]);
				}
				if (this.project.modelUri && !this.exploration) {
					const previous = this.conversation?.attachedModel;
					if (previous && previous !== this.project.modelUri.toString()) { widget.attachmentModel.delete(previous); }
					if (!widget.attachmentModel.fileAttachments.some(uri => uri.toString() === this.project.modelUri!.toString())) { await widget.attachmentModel.addFile(this.project.modelUri); }
				}
				widget.attachmentModel.updateContext(['ade:diagram-context'], [{ kind: 'generic', id: 'ade:diagram-context', name: localize('ade.ai.currentDiagramContext', "Current Diagram"), value: JSON.stringify({ ...(this.exploration?.root === root ? { sessionId: this.exploration.id } : { model: this.project.modelUri?.fsPath }), diagram: this.project.activeView ? { id: this.project.activeView.id, name: this.project.activeView.name } : null }) }]);
				this.conversation = { root, resource, attachedModel: this.project.modelUri?.toString() };
				if (initialPrompt !== undefined || this.exploration?.root === root && firstQuestion) { widget.setInput(initialPrompt ?? this.conversationPrompt()); }
				widget.setInputPlaceholder(localize('ade.ai.chatPlaceholder', "Ask Codex to Change the Diagram or Its Code…")); widget.focusInput();
			} else {
				const provider = this.connection.config?.provider ?? 'codex';
				const executable = await this.connection.resolveCli(provider);
				if (!executable) { return; }
				const account = await this.code.checkCliAccount(provider, executable);
				if (account.status !== 'signedIn') { if (account.status === 'signedOut') { await this.connection.signIn(provider, true); } else { await this.connection.checkAccount(provider, executable); } return; }
				let model = this.storage.get(`ade.ai.diagramModel.${provider}`, StorageScope.PROFILE) ?? this.connection.config?.model;
				if (!model) { model = await this.selectDiagramModel({ version: 1, provider, connection: 'cli', executable, model: '', timeoutMs: 180000, maxContextBytes: 262144, maxCalls: 1 }); if (!model) { return; } }
				const config: CliConfig = { version: 1, provider, connection: 'cli', executable, model, timeoutMs: 300000, maxContextBytes: 262144, maxCalls: this.connection.config?.maxCalls ?? 1 };
				this.conversation = { root };
				await this.aiDialog.open({ prompt: initialPrompt ?? (this.exploration?.root === root ? this.conversationPrompt() : ''), onClose: () => this.closeConversation(root), send: (messages, token) => this.sendConversation(root, config, messages, token) });
			}
			this.watchConversation();
			this.host.report(localize('ade.ai.chatModalReady', "Assistant Is Open · Diagrams Update Automatically"));
		} catch (error) { await this.aiDialog.close(); this.conversation = undefined; this.conversationWatch.clear(); const message = localize('ade.ai.chatFailed', "Could Not Open Codex: {0}", error instanceof Error ? error.message : String(error)); this.host.report(message); this.notifications.error(message); }
		finally { this.chatOpening = false; this.host.busy = false; opening.dispose(); this.host.changed(); }
	}

	private conversationPrompt(): string {
		if (getDiagramExplorationPhase(this._diagramExploration) === 'applied') { return ''; }
		return this._diagramExploration?.plan ? localize('ade.explore.repairPrompt', "Continue the saved diagram plan. Inspect its existing drafts and final-review blockers first. Keep valid diagrams and shared IDs. Repair assigned invalid drafts with supersedes and relink their tasks. Archive obsolete unassigned invalid attempts with ade_proposal_discard and a reason. Complete missing diagrams without intermediate approvals, then report whether the complete project review is ready.") : localize('ade.explore.firstQuestion', "Plan the relevant project diagrams from overview to detail using the ADE tools, then create and preview every planned draft. Continue without intermediate approvals and finish with one complete project review.");
	}

	async returnToDiagrams(): Promise<void> { await this.aiDialog.close(); }

	private async closeConversation(root: string): Promise<void> {
		if (this.conversation?.root !== root) { return; }
		this.conversation = undefined; this.conversationWatch.clear();
		this.explorationTools.clear(); this.explorationBinding = undefined;
		if (this.exploration?.root === root) { this.exploration.resource = undefined; this.persistExploration(); }
		try { await this.refreshExploration(true); } catch (error) { this.notifications.error(String(error)); }
		this.host.changed();
	}

	private watchConversation(): void {
		this.conversationWatch.clear();
		const session = this.exploration;
		if (!session) { return; }
		const directory = URI.joinPath(URI.file(session.root), '.ade', 'exploration');
		const resource = URI.joinPath(directory, `${session.id}.json`);
		const refresh = this.conversationWatch.add(new ThrottledDelayer<void>(300));
		const watcher = this.conversationWatch.add(this.files.createWatcher(directory, { recursive: false, excludes: [] }));
		this.conversationWatch.add(watcher.onDidChange(event => {
			if (!event.contains(resource)) { return; }
			void refresh.trigger(async () => {
				if (this.exploration?.id === session.id) { await this.refreshExploration(true); }
			}).catch(error => { if (this.conversation && !isCancellationError(error)) { this.notifications.error(String(error)); } });
		}));
	}

	private async sendConversation(root: string, config: CliConfig, messages: AdeAiMessage[], token: CancellationToken): Promise<string> {
		if (!this.conversation || this.conversation.root !== root || !await this.trust.requestWorkspaceTrust()) { throw new Error(localize('ade.explore.scopeChanged', "The Exploration Project Is No Longer Active.")); }
		const operation = this.operations.acquire('ai');
		if (!operation) { throw new Error(localize('ade.ai.busy', "Another A.D.E Operation Is Running. Wait for It to Finish.")); }
		this.host.busy = true; this.host.changed();
		const requestId = generateUuid(), conversation = this.conversation;
		const progress = this.code.onDidAiProgress(event => { if (event.requestId === requestId && this.conversation === conversation && !token.isCancellationRequested) { this.aiDialog.updateConversation(event); } });
		try {
			const session = this.exploration?.root === root ? this.exploration : undefined;
			const result: { text: string } = JSON.parse(await this.code.executeReconciliation({ operation: 'diagramChat', requestId, root, ...(session ? { snapshot: this.code.context!.snapshot, sessionId: session.id } : {}), config: JSON.stringify(config), messages: session ? messages : [{ role: 'user', text: `Project context: model file ${this.project.modelUri?.fsPath ?? 'not saved'}, active diagram ${this.project.activeView?.id ?? 'none'}. Preserve semantic IDs and valid references. Only edit files when the user requests a change.` }, ...messages] }, token));
			return result.text;
		} finally {
			progress.dispose(); operation.dispose(); this.host.busy = false;
			if (this.code.context?.sourceRoot === root) { try { await this.refreshExploration(true); } catch (error) { this.notifications.error(String(error)); } }
			if (!token.isCancellationRequested && this._diagramReview?.root === root) { await this.reviewDiagramProposal(this._diagramReview.id); }
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
		try {
			await this.files.stat(URI.joinPath(URI.file(session.root), '.ade', 'exploration', `${session.id}.json`));
		} catch (error) {
			if (!(error instanceof Error) || toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) { throw error; }
			if (this.exploration !== session || this.code.context?.sourceRoot !== session.root) { return; }
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

	private async refreshExploration(live = false): Promise<void> {
		await this.discardMissingExploration();
		if (!this.exploration || this.exploration.root !== this.code.context?.sourceRoot) { return; }
		const session = this.exploration;
		const result = await this.explorationRequest({ action: live ? 'status' : 'open', sessionId: session.id });
		if (this.exploration !== session || this.code.context?.sourceRoot !== session.root) { return; }
		this._diagramExploration = result.data; this.host.changed();
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

	private async exploreDiagrams(initialPrompt?: string): Promise<void> {
		if (this.host.busy || this.operations.busy || !this.code.context) { return; }
		let opened = false, needsBudget = false;
		await this.host.run(async token => {
			if (!await this.project.save()) { return; }
			const root = this.code.context!.sourceRoot;
			if (this.exploration?.root !== root) { this.exploration = undefined; }
			await this.discardMissingExploration();
			const result = await this.explorationRequest({ action: 'open', workflow: 'project', ...(!this.exploration || this._diagramExploration?.workflow !== 'project' ? { budget: { maxToolCalls: 400, maxReadBytes: 8388608, maxDurationMs: 5400000, maxModelTurns: 32 } } : {}), ...(this.exploration ? { sessionId: this.exploration.id } : {}), ...(!this.exploration ? { model: this.storage.get('ade.ai.diagramModel.codex', StorageScope.PROFILE) ?? 'chat-selected' } : {}) }, token);
			this.exploration = { ...this.exploration, root, id: result.sessionId, snapshot: this.code.context!.snapshot };
			this._diagramExploration = result.data; needsBudget = !!result.data.budgetStatus?.exhausted.length; this._diagramProgress = undefined; this.persistExploration();
			opened = true;
		}, { kind: 'diagram' });
		if (opened && needsBudget) { await this.configureDiagramBudget(); if (this._diagramExploration?.budgetStatus?.exhausted.length) { return; } }
		if (opened) { await this.chat(initialPrompt); }
	}

	async configureDiagramBudget(): Promise<void> {
		if (!this.exploration || this.host.busy) { return; }
		const selected = await this.quick.pick([
			{ label: localize('ade.explore.budgetSmall', "Explore One Scenario"), description: localize('ade.explore.budgetSmallDetail', "8 Reported Turns · 80 Local Tool Calls · 1 MiB Retrieved · 30 Minutes"), calls: 80, bytes: 1048576, turns: 8, duration: 1800000 },
			{ label: localize('ade.explore.budgetMedium', "Explore Several Scenarios"), description: localize('ade.explore.budgetMediumDetail', "16 Reported Turns · 160 Local Tool Calls · 2 MiB Retrieved · 60 Minutes"), calls: 160, bytes: 2097152, turns: 16, duration: 3600000 }
		], { title: localize('ade.explore.budget', "Add Exploration Budget"), placeHolder: localize('ade.explore.budgetHint', "Evidence and Drafts Are Retained. Provider Turns and Tokens Are Counted Only When Reported.") });
		if (!selected || !this._diagramExploration) { return; }
		const usage = this._diagramExploration.usage;
		await this.host.run(async token => { await this.explorationRequest({ action: 'budget', sessionId: this.exploration!.id, budget: { maxToolCalls: Math.min(1000, usage.toolCalls + selected.calls), maxReadBytes: Math.min(33554432, usage.readBytes + selected.bytes), maxModelTurns: Math.min(100, usage.modelTurns.length + selected.turns), maxDurationMs: selected.duration } }, token); await this.refreshExploration(); }, { kind: 'local' });
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
			this._diagramReview = { id: proposal.id, sessionId, root, modelUri, semanticRevision, proposal: structuredClone(proposal), changes: report.changes ?? report.diff?.items ?? [], sources: report.sourceAnchors ?? [], images: preview.data.images ?? [], contents, ...(projectReview ? { projectReviewId: preview.data.reviewId, plan: preview.data.plan, tasks: preview.data.tasks } : {}), ...(preview.diagnostics.length ? { problem: preview.diagnostics.map(entry => entry.code).join(' · ') } : {}) };
			await this.editors.openEditor({ resource: AdeInput.RESOURCE, options: { pinned: true, revealIfOpened: true } });
			this.host.changed();
		}, { kind: 'local' });
	}

	closeDiagramReview(): void { this._diagramReview = undefined; this.host.changed(); }

	async inspectDiagramReview(): Promise<void> {
		const review = this._diagramReview;
		if (review) { await this.editors.openEditor({ contents: review.contents, languageId: 'json', options: { pinned: true } }); }
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
		if (this.configuration.getValue<boolean>('ade.diagramImport.incremental') === false) { await this.generateDiagrams(true); return; }
		await this.exploreDiagrams(localize('ade.explore.updatePrompt', "Update the project diagrams from the current codebase using the ADE tools. Inspect the saved project, diagram plan and drafts first. Identify code changes and preserve existing diagram and object IDs and manual layout where they still apply. Prepare the necessary additions, updates and removals, including any missing views from overview to detail. Reconcile the plan and task assignments, resolve validation errors and preview every proposed diagram. Continue without intermediate approvals and finish with a single complete project review. Do not publish changes: I will apply them from the review."));
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
			let clarification: string | undefined;
			if (resume && this._diagramProgress?.questions.length) { clarification = await this.quick.input({ title: localize('ade.ai.diagramClarify', "Clarify Diagram Interpretation"), prompt: this._diagramProgress.questions.join(' '), ignoreFocusLost: true }); if (!clarification) { return; } }
			let job: CodeDiagramProgress = JSON.parse(await this.code.executeReconciliation({ operation: 'diagramPrepare', snapshot: context.snapshot, config: JSON.stringify(config), ...(resume && this._diagramProgress ? { resume: this._diagramProgress.id } : {}), clarification }, token));
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
		if (selected && this.exploration && this.configuration.getValue<boolean>('ade.diagramImport.incremental') !== false) { await this.chat(); }
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
	beginGeneration(): void { this.diagramError?.close(); this.diagramError = undefined; }
	failGeneration(message: string): void { this.diagramError = this.notifications.notify({ severity: Severity.Error, message }); }
	finishOperation(): void { this.diagramRunning = false; }
	resetProject(): void {
		void this.aiDialog.close();
		this.conversation = undefined; this.conversationWatch.clear();
		this.explorationTools.clear(); this.explorationBinding = undefined;
		this._diagramExploration = undefined; this._diagramReview = undefined;
	}
	followCodeContext(): void {
		const context = this.code.context;
		if (this.conversation && context && this.conversation.root !== context.sourceRoot) { void this.aiDialog.close(); this.conversation = undefined; this.conversationWatch.clear(); this.host.activityStatus = undefined; this.host.changed(); }
		if (this.exploration && context && this.exploration.root !== context.sourceRoot) { this.explorationTools.clear(); this.explorationBinding = undefined; this._diagramExploration = undefined; }
		if (this._diagramProgress && context && this._diagramProgress.sourceRoot !== context.sourceRoot) { this._diagramProgress = undefined; this.host.changed(); }
	}
}
