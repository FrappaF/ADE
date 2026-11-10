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
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { INotificationService, INotificationHandle, Severity } from '../../../../platform/notification/common/notification.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IConfigurationService, ConfigurationTarget } from '../../../../platform/configuration/common/configuration.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { AgentHostCodexAgentEnabledSettingId, AgentHostCodexAgentCodexHomeSettingId } from '../../../../platform/agentHost/common/agentService.js';
import { ICodexAccountService } from '../../../services/agentHost/browser/codexAccountService.js';
import { parseCodexModelSelection } from '../../../../platform/agentHost/common/codexModelSelection.js';
import { IAgentSdkSetupService } from '../../../services/agentHost/browser/agentSdkSetupService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ITerminalService, ITerminalGroupService, ITerminalInstance } from '../../terminal/browser/terminal.js';
import { IChatWidgetService, ChatViewPaneTarget } from '../../chat/browser/chat.js';
import { getNewChatSessionResource } from '../../chat/common/model/chatUri.js';
import { IAdeProjectService } from '../browser/adeProjectService.js';
import { IAdeCodeService } from '../browser/adeCodeService.js';
import { type AdeDiagramReview } from '../browser/adeAiService.js';
import { IAdeOperationService, AdeOperationService } from '../browser/adeOperationService.js';
import { AdeInput } from '../browser/adeInput.js';
import { viewLabels } from '../browser/adeLabels.js';
import { openAdeTerminal } from '../browser/adeTerminal.js';
import { canonicalJson, semanticContent } from '../common/modelSerialization.js';
import { CodeDiagramProgress, CodeDiagramExploration } from '../common/codeBridge.js';
import { type CliConfig, type AdeAiProject, type AdeAiWorkflow } from './adeAiTypes.js';
import { AdeAiConnection } from './adeAiConnection.js';

/** Diagram exploration, generation and review workflow; lifecycle belongs to this component. */
export class AdeAiDiagrams extends Disposable {
	private _diagramReview: AdeDiagramReview | undefined;

	private chatOpening = false;

	private diagramRunning = false;

	private diagramError: INotificationHandle | undefined;

	get generatingDiagrams(): boolean { return this.diagramRunning; }

	private conversation: { root: string; resource?: URI; terminal?: ITerminalInstance; attachedModel?: string } | undefined;

	get chatLocation(): 'chat' | 'terminal' | undefined { return this.conversation?.terminal ? 'terminal' : this.conversation?.resource ? 'chat' : undefined; }

	private _diagramProgress: CodeDiagramProgress | undefined;

	private _diagramExploration: CodeDiagramExploration | undefined;

	private exploration: { root: string; id: string; snapshot: string; resource?: string; selectedModel?: string } | undefined;

	private readonly explorationTools = this._register(new DisposableStore());

	private explorationBinding: string | undefined;

	private explorationToolResource: URI | undefined;

	async chat(): Promise<void> {
		if (this.code.context && this.configuration.getValue<boolean>('ade.diagramImport.incremental') !== false && this.exploration?.root !== this.code.context.sourceRoot) { await this.exploreDiagrams(); return; }
		if (this.host.busy || this.operations.busy || this.chatOpening || this.configuration.getValue<boolean>('chat.disableAIFeatures') === true) { return; }
		const opening = this.operations.acquire('ai');
		if (!opening) { return; }
		this.chatOpening = true; this.host.busy = true;
		this.host.report(localize('ade.ai.chatOpening', "Opening Codex…"));
		try {
			if (!await this.trust.requestWorkspaceTrust() || this.project.modelUri && !await this.project.save()) { this.host.report(localize('ade.ai.chatNotOpened', "Codex Was Not Opened")); return; }
			const root = this.code.context?.sourceRoot ?? this.project.projectRoot?.toString() ?? this.project.model.id;
			if (this.conversation?.root !== root) { this.conversation = undefined; }
			const terminal = this.conversation?.terminal;
			if (terminal && !terminal.isDisposed) { this.terminals.setActiveInstance(terminal); await this.terminalGroups.showPanel(true); await terminal.focusWhenReady(); this.host.report(localize('ade.ai.chatTerminalReady', "Codex Is Open in the Terminal · Back to Diagrams to Continue")); return; }
			if (terminal) { this.conversation = undefined; }
			const native = this.codexAccount.account.status === 'signedIn' && this.setup.setups.some(setup => setup.agent === 'codex' && setup.download === 'ready') && !this.configuration.getValue<string>(AgentHostCodexAgentCodexHomeSettingId) && (!this.connection.config || this.connection.config.provider !== 'codex' || this.connection.config.executable === 'codex');
			if (native) {
				await this.configuration.updateValue(AgentHostCodexAgentEnabledSettingId, true, this.exploration ? ConfigurationTarget.WORKSPACE : ConfigurationTarget.USER);
				const resource = this.conversation?.resource ?? (this.exploration?.root === root && this.exploration.resource ? URI.parse(this.exploration.resource) : getNewChatSessionResource('agent-host-codex'));
				if (this.exploration?.root === root) { this.bindExplorationTools(resource); }
				const widget = await this.chatWidgets.openSession(resource, ChatViewPaneTarget);
				if (!widget) { throw new Error(localize('ade.ai.chatUnavailable', "Codex Chat Could Not Be Opened. Use AI Settings to Check the Connection.")); }
				if (this.exploration?.root === root) {
					const chosen = this.storage.get('ade.ai.diagramModel.codex', StorageScope.PROFILE);
					if (chosen && this.exploration.selectedModel !== chosen) {
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
				if (this.exploration?.root === root && !this.conversation?.resource) { widget.setInput(localize('ade.explore.firstQuestion', "Explore this project and propose a concise overview of its main runtime responsibilities and integrations. Retrieve additional source evidence as needed and preview the proposal.")); }
				widget.setInputPlaceholder(localize('ade.ai.chatPlaceholder', "Ask Codex to Change the Diagram or Its Code…")); widget.focusInput();
			} else {
				const executable = await this.connection.resolveCli('codex');
				if (!executable) { return; }
				const account = await this.code.checkCliAccount('codex', executable);
				if (account.status !== 'signedIn') { if (account.status === 'signedOut') { await this.connection.signIn('codex', true); } else { await this.connection.checkAccount('codex', executable); } return; }
				let model = this.exploration?.root === root ? this.storage.get('ade.ai.diagramModel.codex', StorageScope.PROFILE) ?? (this.connection.config?.provider === 'codex' ? this.connection.config.model : undefined) : this.connection.config?.provider === 'codex' ? this.connection.config.model : undefined;
				if (this.exploration?.root === root && !model) { model = await this.selectDiagramModel({ version: 1, provider: 'codex', connection: 'cli', executable, model: '', timeoutMs: 180000, maxContextBytes: 262144, maxCalls: 8 }); if (!model) { return; } }
				const prompt = localize('ade.ai.chatContext', "Help me work on this project's A.D.E diagrams and implementation. The model is {0}, active diagram: {1}. Preserve semantic IDs and valid model v3 references. Resolve the current model from .ade/code-project.json before editing because snapshot paths can change. Model edits appear in the visual editor; after code changes I will use Update Diagrams to reconcile them. I will describe the requested change next; do not edit files until I do.", this.project.modelUri?.fsPath ?? localize('ade.ai.noModelContext', "not created yet"), this.project.activeView?.name ?? this.project.model.name);
				const terminal = await openAdeTerminal(this.terminals, this.terminalGroups, { name: localize('ade.ai.codexChat', "Codex Chat · Your Account"), executable, args: [...(model ? ['--model', model] : []), ...(this.exploration?.root === root ? await this.explorationCliArguments() : []), this.exploration?.root === root ? diagramSessionInstruction : prompt], cwd: this.code.context?.sourceRoot ?? this.project.projectRoot, ...(this.configuration.getValue<string>(AgentHostCodexAgentCodexHomeSettingId) ? { env: { CODEX_HOME: this.configuration.getValue<string>(AgentHostCodexAgentCodexHomeSettingId) } } : {}) });
				this.conversation = { root, terminal };
				this._register(terminal.onExit(() => { if (this.conversation?.terminal === terminal) { this.conversation = undefined; this.host.changed(); } }));
			}
			this.host.report(this.chatLocation === 'terminal' ? localize('ade.ai.chatTerminalReady', "Codex Is Open in the Terminal · Back to Diagrams to Continue") : localize('ade.ai.chatPaneReady', "Codex Chat Is Open · Your Diagram Is Attached"));
		} catch (error) { this.conversation = undefined; const message = localize('ade.ai.chatFailed', "Could Not Open Codex: {0}", error instanceof Error ? error.message : String(error)); this.host.report(message); this.notifications.error(message); }
		finally { this.chatOpening = false; this.host.busy = false; opening.dispose(); this.host.changed(); }
	}

	async returnToDiagrams(): Promise<void> {
		this.terminalGroups.hidePanel();
		try { await this.refreshExploration(); } catch (error) { this.notifications.error(String(error)); }
		await this.editors.openEditor({ resource: AdeInput.RESOURCE, options: { pinned: true, revealIfOpened: true } });
		if (this.code.changed) { this.host.report(localize('ade.ai.reviewAfterChat', "Code Changed · Update Diagrams to Review the Result")); }
	}

	private persistExploration(): void {
		if (this.exploration) { this.storage.store('ade.ai.exploration', JSON.stringify(this.exploration), StorageScope.WORKSPACE, StorageTarget.MACHINE); }
	}

	private async explorationRequest(request: object, token = CancellationToken.None, failOnDiagnostics = true): Promise<{ sessionId: string; data: CodeDiagramExploration & { reviewFile?: string; images?: { path: string; viewId: string }[]; snapshot?: string; mcp?: { command: string; args: string[] } }; diagnostics: { code: string }[] }> {
		const context = this.code.context;
		if (!context) { throw new Error(localize('ade.explore.importRequired', "Import a Project to Explore Its Architecture.")); }
		const result = JSON.parse(await this.code.executeReconciliation({ operation: 'exploration', snapshot: context.snapshot, request: JSON.stringify(request) }, token));
		if (failOnDiagnostics && result.diagnostics?.length) { throw new Error(result.diagnostics.map((entry: { code: string }) => entry.code).join(' · ')); }
		return result;
	}

	private async refreshExploration(): Promise<void> {
		if (!this.exploration || this.exploration.root !== this.code.context?.sourceRoot) { return; }
		const result = await this.explorationRequest({ action: 'open', sessionId: this.exploration.id });
		this._diagramExploration = result.data; this.host.changed();
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

	private async exploreDiagrams(): Promise<void> {
		if (this.host.busy || this.operations.busy || !this.code.context) { return; }
		await this.host.run(async token => {
			if (!await this.project.save()) { return; }
			const root = this.code.context!.sourceRoot;
			if (this.exploration?.root !== root) { this.exploration = undefined; }
			const result = await this.explorationRequest({ action: 'open', ...(this.exploration ? { sessionId: this.exploration.id } : {}), ...(!this.exploration ? { model: this.storage.get('ade.ai.diagramModel.codex', StorageScope.PROFILE) ?? 'chat-selected' } : {}) }, token);
			this.exploration = { ...this.exploration, root, id: result.sessionId, snapshot: this.code.context!.snapshot };
			this._diagramExploration = result.data; this._diagramProgress = undefined; this.persistExploration();
		}, { kind: 'diagram' });
		if (this.exploration) { await this.chat(); }
	}

	private async explorationCliArguments(): Promise<string[]> {
		const session = this.exploration!;
		const result = await this.explorationRequest({ action: 'open', sessionId: session.id });
		const mcp = result.data.mcp;
		if (!mcp) { throw new Error(localize('ade.explore.mcpMissing', "Rebuild ADE to Install the Local Diagram Tools.")); }
		return ['--sandbox', 'read-only', '-c', `mcp_servers.ade.command=${JSON.stringify(mcp.command)}`, '-c', `mcp_servers.ade.args=${JSON.stringify(mcp.args)}`];
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
			const proposal = id ? this._diagramExploration?.proposals.find(entry => entry.id === id) : (await this.quick.pick(this._diagramExploration?.proposals.filter(entry => entry.status !== 'applied').map(entry => ({ label: entry.views.map(view => view.name).join(', ') || entry.id, description: entry.status, proposal: entry })) ?? [], { title: localize('ade.explore.review', "Review Diagram Draft") }))?.proposal;
			if (!proposal || proposal.status === 'applied' || !await this.project.save()) { return; }
			const modelUri = this.project.modelUri?.toString() ?? '';
			const semanticRevision = canonicalJson(semanticContent(this.project.model));
			const root = this.code.context!.sourceRoot;
			const sessionId = this.exploration!.id;
			const preview = await this.explorationRequest({ action: 'tool', sessionId, tool: 'ade_view_preview', arguments: { proposalId: proposal.id } }, token, false);
			const contents = preview.data.reviewFile ? (await this.files.readFile(URI.file(preview.data.reviewFile))).value.toString() : JSON.stringify(preview.data, null, '\t');
			const report: { changes?: AdeDiagramReview['changes']; diff?: { items: AdeDiagramReview['changes'] }; sourceAnchors?: AdeDiagramReview['sources'] } = JSON.parse(contents);
			if (token.isCancellationRequested || this.code.context?.sourceRoot !== root || this.project.modelUri?.toString() !== modelUri || canonicalJson(semanticContent(this.project.model)) !== semanticRevision) { return; }
			this._diagramReview = { id: proposal.id, sessionId, root, modelUri, semanticRevision, proposal: structuredClone(proposal), changes: report.changes ?? report.diff?.items ?? [], sources: report.sourceAnchors ?? [], images: preview.data.images ?? [], contents, ...(preview.diagnostics.length ? { problem: preview.diagnostics.map(entry => entry.code).join(' · ') } : {}) };
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
				if (!(await this.dialogs.confirm({ message: localize('ade.explore.apply', "Apply This Diagram Proposal?"), detail: localize('ade.explore.applyDetail', "{0}\nThis applies only this proposal and its dependencies to the local project. Other drafts remain available. Code files, Git commits and remotes are unchanged.", review.proposal.views.map(view => view.name).join(', ')), primaryButton: localize('ade.review.publish', "Apply to Project") })).confirmed) { return; }
				if (!await this.project.save()) { throw new Error(this.project.saveError ?? localize('ade.explore.saveRequired', "Save the Project Before Applying This Draft.")); }
				if (!current() || token.isCancellationRequested) { throw new Error(localize('ade.explore.reviewChanged', "The Project Changed. Review This Draft Again Before Applying It.")); }
				const result = await this.explorationRequest({ action: 'publish', sessionId: review.sessionId, proposalId: review.id }, token);
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
		@ITerminalService private readonly terminals: ITerminalService,
		@ITerminalGroupService private readonly terminalGroups: ITerminalGroupService,
		@IChatWidgetService private readonly chatWidgets: IChatWidgetService,
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
		this.conversation = undefined;
		this.explorationTools.clear(); this.explorationBinding = undefined;
		this._diagramExploration = undefined; this._diagramReview = undefined;
	}
	followCodeContext(): void {
		const context = this.code.context;
		if (this.conversation && context && this.conversation.root !== context.sourceRoot) { this.conversation = undefined; this.host.activityStatus = undefined; this.host.changed(); }
		if (this.exploration && context && this.exploration.root !== context.sourceRoot) { this.explorationTools.clear(); this.explorationBinding = undefined; this._diagramExploration = undefined; }
		if (this._diagramProgress && context && this._diagramProgress.sourceRoot !== context.sourceRoot) { this._diagramProgress = undefined; this.host.changed(); }
	}
}
