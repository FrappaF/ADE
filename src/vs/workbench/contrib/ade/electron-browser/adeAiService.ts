/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { diagramToolDefinitions, diagramSessionInstruction } from '../common/diagramTools.js';
import { IMAGE_PREVIEW_EDITOR_ID } from '../../mediaPreview/common/mediaPreview.js';
import { ILanguageModelsService } from '../../chat/common/languageModels.js';
import { ILanguageModelToolsService, ToolDataSource } from '../../chat/common/tools/languageModelToolsService.js';
import { IAgentHostActiveClientService } from '../../chat/browser/agentSessions/agentHost/agentHostActiveClientService.js';
import type { IJSONSchema } from '../../../../base/common/jsonSchema.js';
import { assertPureProject } from '../common/modelProject.js';
import { ModelContinuity, type ContinuityPolicy } from '../common/modelContinuity.js';
import { validateSemanticModel } from '../common/semanticModel.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { editAdeMessagingCriteria } from '../browser/adeMessagingCriteria.js';
import { editAdeStateCriteria } from '../browser/adeStateCriteria.js';
import { describeAdeStateSimulation } from '../browser/adeStateContent.js';
import { interpretModelStateMachine } from '../common/modelStates.js';
import { editAdeInteractionCriteria } from '../browser/adeInteractionCriteria.js';
import type { StructuralProjectSession as StructuralSession, ProjectCriteria } from '../common/modelProject.js';
import { localize, localize2 } from '../../../../nls.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { isDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { INotificationService, INotificationHandle, Severity } from '../../../../platform/notification/common/notification.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IConfigurationService, ConfigurationTarget } from '../../../../platform/configuration/common/configuration.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IAgentHostService, AgentHostCodexAgentEnabledSettingId, AgentHostClaudeAgentEnabledSettingId, AgentHostCodexAgentCodexHomeSettingId, CodexPreferAgentHostEditorSettingId } from '../../../../platform/agentHost/common/agentService.js';
import { ICodexAccountService } from '../../../services/agentHost/browser/codexAccountService.js';
import { parseCodexModelSelection } from '../../../../platform/agentHost/common/codexModelSelection.js';
import { readAgentModelPricingMeta } from '../../../../platform/agentHost/common/meta/agentModelMeta.js';
import { IAgentSdkSetupService } from '../../../services/agentHost/browser/agentSdkSetupService.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ITerminalService, ITerminalGroupService, ITerminalInstance } from '../../terminal/browser/terminal.js';
import { IChatWidgetService, ChatViewPaneTarget } from '../../chat/browser/chat.js';
import { getNewChatSessionResource } from '../../chat/common/model/chatUri.js';
import { IAdeProjectService, AdeProjectService } from '../browser/adeProjectService.js';
import { IAdeCodeService } from '../browser/adeCodeService.js';
import { IAdeAiService } from '../browser/adeAiService.js';
import { IAdeOperationService, AdeOperationService } from '../browser/adeOperationService.js';
import { AdeInput } from '../browser/adeInput.js';
import { viewLabels } from '../browser/adeLabels.js';
import { openAdeTerminal } from '../browser/adeTerminal.js';
import { getModelImpact } from '../common/modelImpact.js';
import { canonicalJson, semanticContent } from '../common/modelSerialization.js';
import { isSourceEvidenceModel } from '../common/semanticModel.js';
import { CodePreview, CodeReconciliationContext, CodeResolution, CodeDiagramProgress, CodeDiagramExploration } from '../common/codeBridge.js';

interface CliConfig {
	version: 1; provider: 'codex' | 'claude'; connection: 'cli'; model: string; executable: string;
	timeoutMs: number; maxContextBytes: number; maxCalls: number;
}
interface PreparedReview { reviewId: string; request: { snapshot: string }; context: { sources: { file: string }[] } }
interface Proposal { planId: string; usage?: { inputTokens: number | null; outputTokens: number | null }; plan: { summary: string; questions: { question: string; reason: string }[]; changes: { file: string; kind: string; reason: string }[]; steps: { description: string }[] } }
interface CollaborationSession {
	id: string; root: string; worktree: string; reviewId: string; status: 'staged' | 'passed' | 'failed' | 'applied' | 'undone';
	generated: { summary: string; files: { file: string; content: string | null }[] };
	before: { file: string; content: string | null }[];
	verification?: { code: number; output: string; durationMs: number };
	usage: { inputTokens: number | null; outputTokens: number | null }; cost: number | null;
}
interface ModelRates { input: number; output: number; unit: string; source: string; asOf: string }
interface ModelBenchmark {
	kind: string; recordedAt: string; defaultModel: string | null;
	models: { candidate: { config: CliConfig; rates?: ModelRates }; eligible: boolean; estimatedConsumption: number | null; cases: { repository?: string; language?: string; direction?: string; passed: boolean; durationMs: number; inputTokens: number | null; outputTokens: number | null }[] }[];
}

/** Native shell: original provider login/CLI, explicit disclosure, staged diffs and recoverable application. */
export class AdeAiService extends Disposable implements IAdeAiService {
	declare readonly _serviceBrand: undefined;
	readonly available = true;
	private readonly changes = this._register(new Emitter<void>());
	readonly onDidChange = this.changes.event;
	busy = false;
	private readonly loginWatch = this._register(new DisposableStore());
	private _connectionStatus: string | undefined;
	private activityStatus: string | undefined;
	private accountGeneration = 0;
	private chatOpening = false;
	private diagramRunning = false;
	private diagramError: INotificationHandle | undefined;
	get generatingDiagrams(): boolean { return this.diagramRunning; }
	private conversation: { root: string; resource?: URI; terminal?: ITerminalInstance; attachedModel?: string } | undefined;
	get workflowStatus(): string | undefined { return this.activityStatus; }
	get chatLocation(): 'chat' | 'terminal' | undefined { return this.conversation?.terminal ? 'terminal' : this.conversation?.resource ? 'chat' : undefined; }
	get connectionStatus(): string { return this._connectionStatus ?? localize('ade.ai.unchecked', "CLI Account Not Checked Yet"); }
	private config: CliConfig | undefined;
	diagramProgress: CodeDiagramProgress | undefined;
	diagramExploration: CodeDiagramExploration | undefined;
	private exploration: { root: string; id: string; snapshot: string; resource?: string; selectedModel?: string } | undefined;
	private readonly explorationTools = this._register(new DisposableStore());
	private explorationBinding: string | undefined;
	private explorationToolResource: URI | undefined;

	private session: CollaborationSession | undefined;
	private structuralSession: StructuralSession | undefined;
	private structuralInvalid = false;
	private preparationProblem: string | undefined;
	get structuralProblem(): string | undefined { return this.preparationProblem ?? this.continuity.error; }
	get structuralReview(): StructuralSession | undefined { return this.structuralSession; }
	private readonly continuity = this._register(new ModelContinuity<StructuralSession>(session => {
		this.structuralInvalid = false; this.preparationProblem = undefined; this.structuralSession = session; this.session = undefined;
		this.storage.store('ade.structural.session', JSON.stringify({ root: session.root, id: session.id }), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}, policy => {
		if (policy) { this.storage.store('ade.structural.continuity', JSON.stringify(policy), StorageScope.WORKSPACE, StorageTarget.MACHINE); }
		this.changes.fire();
	}));
	get continuityStatus(): string {
		const labels = { off: localize('ade.continuity.off', "Off"), paused: localize('ade.continuity.paused', "Paused"), waiting: localize('ade.continuity.waiting', "Waiting for Stable Edits"), preparing: localize('ade.continuity.preparing', "Preparing Review"), review: localize('ade.continuity.review', "Review Required"), aligned: localize('ade.continuity.aligned', "Aligned"), blocked: localize('ade.continuity.blocked', "Complete the Specification"), exhausted: localize('ade.continuity.exhausted', "Budget Exhausted"), failed: localize('ade.continuity.failed', "Preparation Failed") };
		const budget = this.continuity.budget;
		return localize('ade.continuity.status', "Continuous Preparation: {0} · {1}/{2} Jobs · Zero AI Calls · Manual Publication", labels[this.continuity.state], budget?.attempted ?? 0, budget?.maxPreparations ?? 0) + (this.continuity.error ? ` · ${this.continuity.error}` : '');
	}
	async configureContinuity(): Promise<void> {
		const root = this.project.projectRoot?.fsPath;
		if (!root || (this.project.model.version !== 4 && this.project.model.version !== 5)) { return; }
		if (this.continuity.active) { this.continuity.pause(); return; }
		let saved: ContinuityPolicy | undefined;
		try { saved = JSON.parse(this.storage.get('ade.structural.continuity', StorageScope.WORKSPACE) ?? 'null'); } catch { /* Invalid saved policy requires a new explicit budget. */ }
		const choice = saved?.root === root ? await this.quick.pick([{ label: localize('ade.continuity.resume', "Resume Saved Budget"), value: 'resume' }, { label: localize('ade.continuity.new', "Set New Budget"), value: 'new' }], { title: localize('ade.continuity.title', "Continuous Preparation") }) : { value: 'new' };
		if (!choice) { return; }
		let policy = saved;
		if (choice.value === 'new') {
			const jobs = await this.quick.input({ title: localize('ade.continuity.limit', "Preparation Budget (1–100 Jobs)"), value: '10', validateInput: async value => /^([1-9]|[1-9][0-9]|100)$/.test(value) ? undefined : localize('ade.continuity.integer', "Enter an integer from 1 to 100.") }); if (!jobs) { return; }
			policy = { version: 1, revision: generateUuid(), root, maxPreparations: Number(jobs), attempted: 0, maxInputBytes: 196608, outputReserveBytes: 65536, review: 'manual', providerCalls: 0 };
		}
		if (!policy || policy.root !== root || this.project.projectRoot?.fsPath !== root) { return; }
		if (!(await this.dialogs.confirm({ message: localize('ade.continuity.enable', "Enable Continuous Local Preparation for This Project?"), detail: localize('ade.continuity.disclose', "Valid semantic edits are saved and coalesced into reviewed Node ESM proposals. At most {0} further preparations, 192 KiB per context and 64 KiB output reserve. Zero provider calls. Tests and publication require explicit review. Stop at any time; resuming retains consumption. Restarting the workbench leaves preparation paused.", policy.maxPreparations - policy.attempted), primaryButton: localize('ade.continuity.start', "Enable Preparation") })).confirmed || this.project.projectRoot?.fsPath !== root || !await this.trust.requestWorkspaceTrust()) { return; }
		this.continuity.configure(policy); this.updateContinuity();
	}
	private updateContinuity(): void {
		if (!this.continuity.active) { return; }
		const root = this.project.projectRoot?.fsPath;
		if (root !== this.continuity.budget?.root) { this.continuity.pause(); return; }
		let valid = this.project.editable !== false && !this.project.error && (this.project.model.version === 4 || this.project.model.version === 5) && !validateSemanticModel(this.project.model).some(item => item.severity === 'error');
		if (valid && (this.project.model.version === 4 || this.project.model.version === 5)) { try { assertPureProject(this.project.model); } catch { valid = false; } }
		const revision = `${root}:${valid}:${canonicalJson(semanticContent(this.project.model))}`;
		this.continuity.update(revision, valid, async (signal, policy) => {
			const operation = this.operations.acquire('ai');
			if (!operation || this.busy) { operation?.dispose(); throw new Error(localize('ade.continuity.busy', "Another Project Operation Is Active. Pause and Resume Preparation to Retry.")); }
			const cancellation = new CancellationTokenSource(), cancel = () => cancellation.cancel(); signal.addEventListener('abort', cancel, { once: true });
			this.busy = true; this.changes.fire();
			try {
				signal.throwIfAborted();
				if (!await this.trust.requestWorkspaceTrust() || !await this.project.save() || revision !== `${this.project.projectRoot?.fsPath}:true:${canonicalJson(semanticContent(this.project.model))}`) { throw new Error(localize('ade.continuity.changed', "The Project Changed Before Preparation.")); }
				signal.throwIfAborted();
				const result = await this.request<{ session?: StructuralSession }>({ operation: 'structuralPrepare', root, direction: 'forward', maxInputBytes: policy.maxInputBytes }, cancellation.token);
				return result.session;
			} finally { signal.removeEventListener('abort', cancel); cancellation.dispose(); operation.dispose(); this.busy = false; this.changes.fire(); }
		});
	}
	private get structuralCurrent(): boolean {
		const session = this.structuralSession; if (!session || this.structuralInvalid || this.project.projectRoot?.fsPath !== session.root) { return false; }
		const expected = session.status === 'applied' ? session.next.model : JSON.parse(session.observed.find(entry => entry.file === '.ade/model.json')!.value!.content);
		return canonicalJson(semanticContent(this.project.model)) === canonicalJson(semanticContent(expected));
	}
	get status(): string {
		if (this.structuralSession && !this.structuralCurrent) { return localize('ade.pure.changed', "Model Behavior Changed · Prepare a New Review"); }
		if (this.structuralSession) { return localize('ade.pure.status', "Model Behavior · {0} · {1} Independent Cases · {2} AI Calls", this.structuralSession.status, this.structuralSession.verification?.independent ?? (this.structuralSession.criteria.cases.length + (this.structuralSession.criteria.interactions?.length ?? 0) + (this.structuralSession.criteria.states?.length ?? 0) + (this.structuralSession.criteria.messaging?.length ?? 0)), this.structuralSession.calls); }
		if (this.activityStatus) { return this.activityStatus; }
		if (this.session) {
			const labels = { staged: localize('ade.ai.staged', "Changes Ready for Review"), passed: localize('ade.ai.passed', "Tests Passed · Ready to Apply"), failed: localize('ade.ai.failed', "Verification Failed · Changes Not Applied"), applied: localize('ade.ai.applied', "Applied · Undo Available"), undone: localize('ade.ai.undone', "Changes Undone") };
			return labels[this.session.status];
		}
		return this._connectionStatus ?? (this.config ? localize('ade.ai.selected', "{0} · {1}", this.config!.provider === 'codex' ? 'Codex' : 'Claude Code', this.config!.model) : localize('ade.ai.setup', "Choose an AI Model in AI Settings"));
	}
	get canVerify(): boolean { return this.structuralCurrent && !!this.structuralSession && ['staged', 'failed', 'passed', 'rolledBack'].includes(this.structuralSession.status) || !!this.session && ['staged', 'failed', 'passed'].includes(this.session.status); }
	get canApply(): boolean { return this.structuralCurrent && this.structuralSession?.status === 'passed' || this.session?.status === 'passed'; }
	get canUndo(): boolean { return this.structuralCurrent && this.structuralSession?.status === 'applied' || this.session?.status === 'applied'; }

	constructor(
		@IAdeProjectService private readonly project: Pick<AdeProjectService, '_serviceBrand' | 'model' | 'save' | 'projectRoot' | 'modelUri' | 'activeView' | 'onDidChange' | 'revert' | 'editable' | 'error'>,
		@IAdeCodeService private readonly code: IAdeCodeService,
		@IQuickInputService private readonly quick: IQuickInputService,
		@INotificationService private readonly notifications: INotificationService,
		@IProgressService private readonly progress: IProgressService,
		@IDialogService private readonly dialogs: IDialogService,
		@IFileService private readonly files: IFileService,
		@IEditorService private readonly editors: IEditorService,
		@ITerminalService private readonly terminals: ITerminalService,
		@ITerminalGroupService private readonly terminalGroups: ITerminalGroupService,
		@IChatWidgetService private readonly chatWidgets: IChatWidgetService,
		@ICodexAccountService private readonly codexAccount: ICodexAccountService,
		@IAgentSdkSetupService private readonly setup: IAgentSdkSetupService,
		@IAgentHostService private readonly agents: IAgentHostService,
		@IConfigurationService private readonly configuration: IConfigurationService,
		@IStorageService private readonly storage: IStorageService,
		@IWorkspaceTrustRequestService private readonly trust: IWorkspaceTrustRequestService,
		@IAdeOperationService private readonly operations: AdeOperationService,
		@ILanguageModelToolsService private readonly tools: ILanguageModelToolsService,
		@IAgentHostActiveClientService private readonly activeClients: IAgentHostActiveClientService,
		@ILanguageModelsService private readonly languageModels: ILanguageModelsService
	) {
		super();
		let projectId = project.model.id;
		this._register(project.onDidChange(() => {
			if (projectId !== project.model.id) { this.continuity.pause(); this.preparationProblem = undefined; this.conversation = undefined; this.explorationTools.clear(); this.explorationBinding = undefined; this.diagramExploration = undefined; this.structuralSession = undefined; projectId = project.model.id; }
			this.updateContinuity();
			if (!this.busy) { this.activityStatus = undefined; this.changes.fire(); }
		}));
		const saved = storage.get('ade.ai.cliConfig', StorageScope.PROFILE);
		if (saved) { try { this.config = JSON.parse(saved); } catch { /* choose a connection again */ } }
		try { this.exploration = JSON.parse(storage.get('ade.ai.exploration', StorageScope.WORKSPACE) ?? 'null') ?? undefined; } catch { /* Invalid session must be reopened. */ }
		const diagramJob = storage.get('ade.ai.diagramJob', StorageScope.WORKSPACE);
		if (diagramJob) { try { this.diagramProgress = JSON.parse(diagramJob); } catch { /* invalid saved progress */ } }
		this._register(code.onDidChange(() => {
			if (this.conversation && code.context && this.conversation.root !== code.context.sourceRoot) { this.conversation = undefined; this.activityStatus = undefined; this.changes.fire(); }
			if (this.session && code.context && this.session.root !== code.context.sourceRoot) { this.session = undefined; this.changes.fire(); }
			if (this.exploration && code.context && this.exploration.root !== code.context.sourceRoot) { this.explorationTools.clear(); this.explorationBinding = undefined; this.diagramExploration = undefined; }
			if (this.diagramProgress && code.context && this.diagramProgress.sourceRoot !== code.context.sourceRoot) { this.diagramProgress = undefined; this.changes.fire(); }
		}));
	}

	private report(message: string): void { this.activityStatus = message; this.changes.fire(); }
	private info(message: string): void { this.report(message); this.notifications.info(message); }
	private async request<T>(request: { operation: string; [key: string]: unknown }, token = CancellationToken.None): Promise<T> {
		const labels: Record<string, string> = {
			prepare: localize('ade.ai.phase.prepare', "Preparing Feature Context"), plan: localize('ade.ai.phase.plan', "Waiting for the Provider Plan"),
			interpret: localize('ade.ai.phase.interpret', "Interpreting Evidence"), stage: localize('ade.ai.phase.stage', "Generating Changes in the Worktree"),
			verify: localize('ade.ai.phase.verify', "Running Reviewed Tests"), apply: localize('ade.ai.phase.apply', "Applying Verified Changes"),
			undo: localize('ade.ai.phase.undo', "Restoring Original Files"), session: localize('ade.ai.phase.session', "Loading Saved Implementation"),
			recover: localize('ade.ai.phase.recover', "Recovering Interrupted Implementation"), benchmark: localize('ade.ai.phase.benchmark', "Comparing Models")
		};
		const label = labels[request.operation] ?? localize('ade.ai.phase.request', "Running AI Operation");
		this.report(label);
		const result = JSON.parse(await this.code.executeCollaboration(JSON.stringify(request), token));
		this.report(localize('ade.ai.phase.done', "{0} · Completed", label));
		return result;
	}
	private async run(task: (token: CancellationToken) => Promise<void>, diagramJob = false, local = false): Promise<void> {
		if (!local && this.configuration.getValue<boolean>('chat.disableAIFeatures') === true) { this.info(localize('ade.ai.disabled', "AI Features Are Disabled in Settings.")); return; }
		const operation = this.operations.acquire('ai');
		if (this.busy || !operation) { operation?.dispose(); this.notifications.info(localize('ade.ai.busy', "An A.D.E operation is already running. Wait for it to finish or cancel it before starting another.")); return; }
		if (diagramJob) { this.diagramError?.close(); this.diagramError = undefined; }
		this.busy = true; this.report(local ? localize('ade.states.simulation.preparing', "Preparing Local Operation") : localize('ade.ai.starting', "Preparing AI Operation"));
		const cancelled = () => local ? localize('ade.states.simulation.cancelled', "Local Operation Cancelled") : diagramJob ? localize('ade.ai.diagramCancelled', "Diagram Generation Paused · Completed Steps Can Be Resumed") : localize('ade.ai.cancelled', "AI Operation Cancelled. Review Any Existing Worktree Before Continuing.");
		const cancellation = new CancellationTokenSource();
		try {
			if (!local && !await this.trust.requestWorkspaceTrust({ message: localize('ade.ai.trust', "A.D.E runs the original AI CLI and reviewed project tests on this computer.") })) { this.info(localize('ade.ai.untrusted', "AI Operation Cancelled · Workspace Trust Was Not Granted.")); return; }
			await this.progress.withProgress({ location: ProgressLocation.Notification, title: local ? localize('ade.states.simulation.progress', "A.D.E Local Operation") : localize('ade.ai.progress', "A.D.E AI"), cancellable: true }, () => task(cancellation.token), () => cancellation.cancel());
			if (cancellation.token.isCancellationRequested) { this.info(cancelled()); }
		}
		catch (error) {
			const message = cancellation.token.isCancellationRequested ? cancelled() : localize('ade.ai.error', "A.D.E AI: {0}", error instanceof Error ? error.message : String(error));
			this.report(message); if (cancellation.token.isCancellationRequested) { if (!diagramJob) { this.notifications.info(message); } } else if (diagramJob) { this.diagramError = this.notifications.notify({ severity: Severity.Error, message }); } else { this.notifications.error(message); }
		}
		finally { cancellation.dispose(); operation.dispose(); this.busy = false; this.diagramRunning = false; this.changes.fire(); }
	}
	private async ensureConfigured(): Promise<boolean> {
		if (!this.config) { this.info(localize('ade.ai.configurationNeeded', "Choose an AI Model, CLI and Budget to Continue. An Existing CLI Login Does Not Need to Be Repeated.")); await this.connect(); }
		return !!this.config;
	}
	private async checkAccount(provider: CliConfig['provider'], executable: string): Promise<boolean> {
		const generation = ++this.accountGeneration;
		this.setConnectionStatus(localize('ade.ai.checkingAccount', "Checking the Original CLI Account…"));
		try {
			const state = await this.code.checkCliAccount(provider, executable);
			if (generation !== this.accountGeneration) { return false; }
			if (state.status === 'signedIn') {
				this.setConnectionStatus(localize('ade.ai.cliConnected', "{0} CLI Account Connected · {1}", provider === 'codex' ? 'Codex' : 'Claude Code', this.config?.provider === provider ? this.config!.model : localize('ade.ai.chooseModelNext', "Choose a Model to Continue")));
				return true;
			}
			if (state.reason === 'notFound') { await this.resolveCli(provider); return false; }
			const message = state.status === 'signedOut'
				? localize('ade.ai.cliSignedOut', "{0} CLI Requires Sign-In. Choose Sign In with CLI, Then Refresh Account and Models.", provider === 'codex' ? 'Codex' : 'Claude Code')
				: localize('ade.ai.cliCheckFailed', "Could Not Verify the CLI Account ({0}). Open the AI CLI to Inspect Login, CLI Version and Configuration; Then Refresh Account and Models.", state.reason ?? 'failed');
			this.setConnectionStatus(message); this.notifications.info(message);
			return false;
		} catch (error) { const message = localize('ade.ai.accountCheckError', "CLI Account Check Failed: {0}", error instanceof Error ? error.message : String(error)); this.setConnectionStatus(message); this.notifications.error(message); return false; }
	}
	async refreshConnection(): Promise<void> {
		if (this.configuration.getValue<boolean>('chat.disableAIFeatures') === true) { return; }
		if (this.busy) { this.notifications.info(localize('ade.operationWait', "Wait for the Active A.D.E Operation to Finish.")); return; }
		if (!this.config) { this.setConnectionStatus(localize('ade.ai.configureConnection', "Connect an Original AI CLI and Choose a Model. Its Existing Login Will Be Checked.")); return; }
		const provider = this.config?.provider ?? 'codex';
		await this.checkAccount(provider, this.config?.executable ?? provider);
	}
	private async readyConfig(): Promise<CliConfig | undefined> {
		if (!await this.ensureConfigured()) { return undefined; }
		if (this.config!.maxCalls === 0) { return { ...this.config! }; }
		const executable = await this.resolveCli(this.config!.provider);
		if (!executable || !await this.checkAccount(this.config!.provider, executable)) { return undefined; }
		return { ...this.config!, executable };
	}
	private nativeModels(provider: CliConfig['provider']): { label: string; id: string; rates?: ModelRates }[] {
		if (provider === 'codex' && (this.configuration.getValue<string>(AgentHostCodexAgentCodexHomeSettingId) || this.config?.provider === provider && this.config.executable !== 'codex')) { return []; }
		const root = this.agents.rootState.value;
		const models = root && !(root instanceof Error) ? root.agents.find(agent => agent.provider === provider)?.models ?? [] : [];
		return models.flatMap(model => {
			const native = provider === 'codex' ? parseCodexModelSelection({ id: model.id }) : undefined;
			if (provider === 'codex' ? native?.modelProvider !== 'openai' : model.provider !== 'anthropic') { return []; }
			const price = readAgentModelPricingMeta(model);
			const rates = typeof price.inputCost === 'number' && typeof price.outputCost === 'number' && [price.inputCost, price.outputCost].every(value => Number.isFinite(value) && value >= 0)
				? { input: price.inputCost, output: price.outputCost, unit: 'account-credits', source: 'Agent Host native account catalog', asOf: new Date().toISOString() } : undefined;
			return [{ label: model.name, id: native?.modelId ?? model.id, rates }];
		});
	}
	private setConnectionStatus(message: string): void {
		this._connectionStatus = message;
		this.activityStatus = undefined;
		this.changes.fire();
	}
	private async chooseCliExecutable(provider: CliConfig['provider'], value: string, model?: string): Promise<string | undefined> {
		const hint = localize('ade.ai.executableHint', "Enter the CLI program name ({0}) or its absolute path, not a model ID. The selected model ({1}) is configured separately.", provider, model ?? localize('ade.ai.modelNext', "chosen separately"));
		const validate = async (input: string): Promise<string | undefined> => {
			try { if (input.trim() && await this.code.resolveCli(input.trim())) { return undefined; } } catch { /* Show a field error without persisting an unusable command. */ }
			return localize('ade.ai.invalidExecutable', "Executable not found. Enter {0} or the full path to the installed CLI. A model ID belongs in the Model field.", provider);
		};
		const executable = await this.quick.input({ title: localize('ade.ai.executable', "Original CLI Executable"), value, prompt: hint, validateInput: validate, ignoreFocusLost: true });
		if (!executable) { return undefined; }
		const error = await validate(executable);
		if (error) { this.setConnectionStatus(error); this.notifications.error(error); return undefined; }
		return executable.trim();
	}
	private async resolveCli(provider: CliConfig['provider']): Promise<string | undefined> {
		const executable = this.config?.provider === provider ? this.config.executable : provider;
		const resolved = await this.code.resolveCli(executable);
		if (!resolved && executable !== provider && this.config?.provider === provider) {
			const installed = await this.code.resolveCli(provider);
			if (installed) {
				const choice = await this.quick.pick([
					{ label: localize('ade.ai.useInstalledCli', "Use Installed {0} CLI", provider === 'codex' ? 'Codex' : 'Claude Code'), description: installed, id: 'installed' },
					{ label: localize('ade.ai.chooseExecutable', "Choose Executable Path"), id: 'choose' }
				], { title: localize('ade.ai.repairExecutable', "Repair CLI Executable"), placeHolder: localize('ade.ai.executableMismatch', "Cannot find program {0}. The executable and model ({1}) are separate settings.", executable, this.config.model) });
				const replacement = choice?.id === 'installed' ? provider : choice?.id === 'choose' ? await this.chooseCliExecutable(provider, executable, this.config.model) : undefined;
				if (!replacement) { this.setConnectionStatus(localize('ade.ai.executableUnchanged', "CLI Configuration Unchanged. Choose an Installed Executable to Continue.")); return undefined; }
				this.config = { ...this.config, executable: replacement };
				this.storage.store('ade.ai.cliConfig', JSON.stringify(this.config), StorageScope.PROFILE, StorageTarget.MACHINE);
				this.setConnectionStatus(localize('ade.ai.executableRepaired', "CLI Executable Updated · Model Kept: {0}", this.config.model));
				return this.code.resolveCli(replacement);
			}
		}
		if (!resolved) {
			const installation = provider === 'codex'
				? localize('ade.ai.installCodex', "Install the official CLI in a terminal with: npm install -g @openai/codex.")
				: localize('ade.ai.installClaude', "Install the official Claude Code CLI using https://code.claude.com/docs/en/setup.");
			const message = localize('ade.ai.cliMissing', "Cannot find or execute {0}: {1}. {2} If it is already installed, use Choose Model and CLI to set its absolute executable path. On macOS/Linux, run command -v {3} in your terminal to find it, then retry Sign In.", provider === 'codex' ? 'Codex' : 'Claude Code', executable, installation, provider);
			this.setConnectionStatus(message);
			this.notifications.error(message);
		}
		return resolved;
	}
	private nativeSignIn(): void {
		const finish = (message: string, error = false) => {
			this.loginWatch.clear();
			this.setConnectionStatus(message);
			if (error) { this.notifications.error(message); } else { this.notifications.info(message); }
		};
		if (this.codexAccount.account.status === 'signedIn') {
			finish(localize('ade.ai.alreadySignedIn', "Codex is already signed in to ChatGPT. Choose Model and CLI to continue."));
			return;
		}
		const waiting = localize('ade.ai.nativeLoginStarting', "Starting Codex sign-in. Waiting for the ChatGPT authorization page…");
		this.setConnectionStatus(waiting);
		this.notifications.info(waiting);
		const timeout = this.loginWatch.add(new RunOnceScheduler(() => finish(localize('ade.ai.nativeLoginTimeout', "Codex did not provide a sign-in page. Choose Sign In with CLI to open codex login in the terminal, or Refresh Account and Models to retry the native connection."), true), 15000));
		let browserRequested = false;
		this.loginWatch.add(this.codexAccount.onDidChangeAccount(account => {
			if (account.status === 'signedIn') {
				finish(localize('ade.ai.signedIn', "Codex is signed in to ChatGPT. Choose Model and CLI to continue."));
			} else if (account.status === 'error' || account.status === 'unavailable') {
				finish(localize('ade.ai.nativeLoginFailed', "Native Codex sign-in failed. Choose Sign In with CLI to run codex login and see the provider's output in the terminal."), true);
			} else if (account.authUrl && !browserRequested) {
				browserRequested = true;
				timeout.cancel();
				const message = localize('ade.ai.nativeLoginBrowser', "Complete Codex sign-in in your browser. If no browser opens, choose Sign In with CLI to use the terminal instead.");
				this.setConnectionStatus(message);
				this.notifications.info(message);
			} else if (account.status === 'downloading') {
				this.setConnectionStatus(localize('ade.ai.nativeLoginDownload', "Downloading the Codex agent for sign-in… You can also choose Sign In with CLI."));
			}
		}));
		timeout.schedule();
		this.codexAccount.signIn();
	}
	private async signIn(provider: CliConfig['provider'], useCli: boolean): Promise<void> {
		this.loginWatch.clear();
		try {
			this.setConnectionStatus(localize('ade.ai.checkingCli', "Checking the {0} CLI…", provider === 'codex' ? 'Codex' : 'Claude Code'));
			const executable = await this.resolveCli(provider);
			if (!executable) { return; }
			const nativeCodexLogin = !useCli && provider === 'codex' && !this.configuration.getValue<string>(AgentHostCodexAgentCodexHomeSettingId) && (!this.config || this.config!.provider !== 'codex' || this.config.executable === 'codex') && this.setup.setups.some(setup => setup.agent === 'codex' && setup.download === 'ready');
			if (nativeCodexLogin) { this.nativeSignIn(); return; }
			let exited = false;
			await openAdeTerminal(this.terminals, this.terminalGroups, { name: provider === 'codex' ? 'Codex Login' : 'Claude Code', executable, args: provider === 'codex' ? ['login'] : ['auth', 'login'], cwd: this.code.context?.sourceRoot ?? this.project.projectRoot, ...(this.configuration.getValue<string>(AgentHostCodexAgentCodexHomeSettingId) ? { env: { CODEX_HOME: this.configuration.getValue<string>(AgentHostCodexAgentCodexHomeSettingId) } } : {}) }, terminal => { this.loginWatch.add(terminal.onExit(() => { exited = true; void this.checkAccount(provider, executable); })); });
			if (exited) { return; }
			const message = localize('ade.ai.terminalLogin', "Complete {0} sign-in in the integrated terminal, then choose Refresh Account and Models.", provider === 'codex' ? 'Codex' : 'Claude Code');
			this.setConnectionStatus(message);
			this.notifications.info(message);
		} catch (error) {
			this.loginWatch.clear();
			const message = localize('ade.ai.connectionError', "Could not start {0}: {1}. Check the CLI executable in Choose Model and CLI.", provider === 'codex' ? 'Codex' : 'Claude Code', error instanceof Error ? error.message : String(error));
			this.setConnectionStatus(message);
			this.notifications.error(message);
		}
	}

	async connect(): Promise<void> {
		if (this.busy || this.configuration.getValue<boolean>('chat.disableAIFeatures') === true) { this.notifications.info(localize('ade.ai.connectionBlocked', "AI Setup Is Unavailable While an Operation Is Running or AI Features Are Disabled.")); return; }
		const selected = await this.quick.pick([{ label: 'Codex', provider: 'codex' as const }, { label: 'Claude Code', provider: 'claude' as const }], { title: localize('ade.ai.provider', "Choose AI CLI") });
		if (!selected) { return; }
		const provider = selected.provider;
		const connected = await this.checkAccount(provider, this.config?.provider === provider ? this.config.executable : provider);
		await this.configuration.updateValue(provider === 'codex' ? AgentHostCodexAgentEnabledSettingId : AgentHostClaudeAgentEnabledSettingId, true, ConfigurationTarget.USER);
		if (provider === 'codex') { await this.configuration.updateValue(CodexPreferAgentHostEditorSettingId, true, ConfigurationTarget.USER); }
		const action = await this.quick.pick([
			{ label: localize('ade.ai.configure', "Choose Model and CLI"), description: connected ? localize('ade.ai.configure.connected', "CLI Account Already Connected · No New Login Required") : localize('ade.ai.configure.executable', "Select the Original CLI Executable, Model and Budget"), id: 'configure' },
			{ label: localize('ade.ai.login', "Sign In"), id: 'login' },
			...(provider === 'codex' ? [{ label: localize('ade.ai.cliLogin', "Sign In with CLI"), id: 'cliLogin' }] : []),
			{ label: localize('ade.ai.nativeChat', "Open Native Agent Chat"), id: 'chat' },
			{ label: localize('ade.ai.reload', "Refresh Account and Models"), id: 'reload' }
		], { title: selected.label });
		if (!action) { this.info(localize('ade.ai.setupCancelled', "AI Setup Cancelled. The Existing CLI Account Is Unchanged.")); return; }
		if (action.id === 'login' || action.id === 'cliLogin') {
			await this.signIn(provider, action.id === 'cliLogin');
			return;
		}
		if (action.id === 'reload') { this.setup.requestReload(provider); await this.checkAccount(provider, this.config?.provider === provider ? this.config.executable : provider); return; }
		if (action.id === 'chat') { await this.chatWidgets.openSession(getNewChatSessionResource('agent-host-' + provider)); return; }
		const choices = this.nativeModels(provider);
		let preferred: string | null = null;
		try {
			for (const [key, kind] of [['ade.ai.benchmark', 'live-provider-benchmark']]) {
				const measured: ModelBenchmark = JSON.parse(this.storage.get(key, StorageScope.PROFILE) ?? '{}');
				const result = measured.models?.find(model => model.candidate.config.provider === provider && model.candidate.config.model === measured.defaultModel);
				const current = choices.find(model => model.id === measured.defaultModel);
				if (measured.kind === kind && result?.eligible && current?.rates && result.candidate.rates?.input === current.rates.input && result.candidate.rates.output === current.rates.output && result.candidate.rates.unit === current.rates.unit && Date.now() - Date.parse(measured.recordedAt) < 30 * 86400000) { preferred = measured.defaultModel; break; }
			}
		} catch { /* no measured account default */ }
		choices.sort((left, right) => Number(right.id === preferred) - Number(left.id === preferred));
		const model = choices.length ? (await this.quick.pick(choices, { title: localize('ade.ai.model', "Choose a Model Available to Your Account") }))?.id
			: await this.quick.input({ title: localize('ade.ai.modelManual', "Model ID from Your CLI"), value: this.config?.provider === provider ? this.config.model : undefined, prompt: localize('ade.ai.noCatalog', "No account catalog is available yet. Sign in and refresh, or enter an exact model ID. Access is checked by the provider."), ignoreFocusLost: true });
		if (!model) { this.info(localize('ade.ai.noModel', "No Model Selected. Choose Model and CLI Before Implementing a Feature.")); return; }
		const executable = await this.chooseCliExecutable(provider, this.config?.provider === provider ? this.config.executable : provider, model);
		if (!executable) { return; }
		const budget = await this.quick.pick([
			{ label: localize('ade.ai.budgetTwo', "Plan and Implementation · At Most Two Agent Runs"), maxCalls: 2 },
			{ label: localize('ade.ai.budgetOne', "Plan or Reconciliation Proposal · At Most One Agent Run"), maxCalls: 1 },
			{ label: localize('ade.ai.budgetZero', "Prepare Context Only · No AI Requests"), maxCalls: 0 }
		], { title: localize('ade.ai.budget', "Agent Run Budget · Provider Usage Is Managed by Its CLI") });
		if (!budget) { this.info(localize('ade.ai.noBudget', "No Budget Selected. AI Configuration Was Not Saved.")); return; }
		this.config = { version: 1, provider, connection: 'cli', model, executable, timeoutMs: 180000, maxContextBytes: 262144, maxCalls: budget.maxCalls };
		this.loginWatch.clear(); this.accountGeneration++;
		this._connectionStatus = undefined;
		this.info(localize('ade.ai.configured', "AI Settings Saved. Build Diagrams or Update Code to Continue."));
		this.storage.store('ade.ai.cliConfig', JSON.stringify(this.config), StorageScope.PROFILE, StorageTarget.MACHINE);
		this.changes.fire();
	}

	async openCli(): Promise<void> {
		if (this.busy) { this.notifications.info(localize('ade.operationWait', "Wait for the Active A.D.E Operation to Finish.")); return; }
		if (!await this.ensureConfigured()) { return; }
		if (this.configuration.getValue<boolean>('chat.disableAIFeatures') === true || !await this.trust.requestWorkspaceTrust()) { this.info(localize('ade.ai.cliBlocked', "Opening the AI CLI Requires Enabled AI Features and Workspace Trust.")); return; }
		const staged = this.session && ['staged', 'passed', 'failed'].includes(this.session.status) ? this.session.worktree : undefined;
		try {
			const executable = await this.resolveCli(this.config!.provider);
			if (!executable) { return; }
			await openAdeTerminal(this.terminals, this.terminalGroups, { name: staged ? localize('ade.ai.worktreeTerminal', "AI Review Worktree") : this.config!.provider === 'codex' ? 'Codex' : 'Claude Code', executable, args: ['--model', this.config!.model], cwd: staged ?? this.code.context?.sourceRoot ?? this.project.projectRoot, ...(this.configuration.getValue<string>(AgentHostCodexAgentCodexHomeSettingId) ? { env: { CODEX_HOME: this.configuration.getValue<string>(AgentHostCodexAgentCodexHomeSettingId) } } : {}) });
			this.info(localize('ade.ai.cliOpened', "AI CLI Opened in the Integrated Terminal · {0}", staged ?? this.code.context?.sourceRoot ?? this.project.projectRoot?.fsPath ?? localize('ade.ai.workspaceDirectory', "Current Workspace")));
		} catch (error) {
			this.notifications.error(localize('ade.ai.openCliFailed', "Could not open the AI CLI: {0}", error instanceof Error ? error.message : String(error)));
		}
	}

	/** One visible entry point to the user's Codex account, with the active diagram attached. */
	async chat(): Promise<void> {
		if (this.code.context && this.configuration.getValue<boolean>('ade.diagramImport.incremental') !== false && this.exploration?.root !== this.code.context.sourceRoot) { await this.exploreDiagrams(); return; }
		if (this.busy || this.operations.busy || this.chatOpening || this.configuration.getValue<boolean>('chat.disableAIFeatures') === true) { return; }
		const opening = this.operations.acquire('ai');
		if (!opening) { return; }
		this.chatOpening = true; this.busy = true;
		this.report(localize('ade.ai.chatOpening', "Opening Codex…"));
		try {
			if (!await this.trust.requestWorkspaceTrust() || this.project.modelUri && !await this.project.save()) { this.report(localize('ade.ai.chatNotOpened', "Codex Was Not Opened")); return; }
			const root = this.code.context?.sourceRoot ?? this.project.projectRoot?.toString() ?? this.project.model.id;
			if (this.conversation?.root !== root) { this.conversation = undefined; }
			const terminal = this.conversation?.terminal;
			if (terminal && !terminal.isDisposed) { this.terminals.setActiveInstance(terminal); await this.terminalGroups.showPanel(true); await terminal.focusWhenReady(); this.report(localize('ade.ai.chatTerminalReady', "Codex Is Open in the Terminal · Back to Diagrams to Continue")); return; }
			if (terminal) { this.conversation = undefined; }
			const native = this.codexAccount.account.status === 'signedIn' && this.setup.setups.some(setup => setup.agent === 'codex' && setup.download === 'ready') && !this.configuration.getValue<string>(AgentHostCodexAgentCodexHomeSettingId) && (!this.config || this.config.provider !== 'codex' || this.config.executable === 'codex');
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
				const executable = await this.resolveCli('codex');
				if (!executable) { return; }
				const account = await this.code.checkCliAccount('codex', executable);
				if (account.status !== 'signedIn') { if (account.status === 'signedOut') { await this.signIn('codex', true); } else { await this.checkAccount('codex', executable); } return; }
				let model = this.exploration?.root === root ? this.storage.get('ade.ai.diagramModel.codex', StorageScope.PROFILE) ?? (this.config?.provider === 'codex' ? this.config.model : undefined) : this.config?.provider === 'codex' ? this.config.model : undefined;
				if (this.exploration?.root === root && !model) { model = await this.selectDiagramModel({ version: 1, provider: 'codex', connection: 'cli', executable, model: '', timeoutMs: 180000, maxContextBytes: 262144, maxCalls: 8 }); if (!model) { return; } }
				const prompt = localize('ade.ai.chatContext', "Help me work on this project's A.D.E diagrams and implementation. The model is {0}, active diagram: {1}. Preserve semantic IDs and valid model v3 references. Resolve the current model from .ade/code-project.json before editing because snapshot paths can change. Model edits appear in the visual editor; after code changes I will use Update Diagrams to reconcile them. I will describe the requested change next; do not edit files until I do.", this.project.modelUri?.fsPath ?? localize('ade.ai.noModelContext', "not created yet"), this.project.activeView?.name ?? this.project.model.name);
				const terminal = await openAdeTerminal(this.terminals, this.terminalGroups, { name: localize('ade.ai.codexChat', "Codex Chat · Your Account"), executable, args: [...(model ? ['--model', model] : []), ...(this.exploration?.root === root ? await this.explorationCliArguments() : []), this.exploration?.root === root ? diagramSessionInstruction : prompt], cwd: this.code.context?.sourceRoot ?? this.project.projectRoot, ...(this.configuration.getValue<string>(AgentHostCodexAgentCodexHomeSettingId) ? { env: { CODEX_HOME: this.configuration.getValue<string>(AgentHostCodexAgentCodexHomeSettingId) } } : {}) });
				this.conversation = { root, terminal };
				this._register(terminal.onExit(() => { if (this.conversation?.terminal === terminal) { this.conversation = undefined; this.changes.fire(); } }));
			}
			this.report(this.chatLocation === 'terminal' ? localize('ade.ai.chatTerminalReady', "Codex Is Open in the Terminal · Back to Diagrams to Continue") : localize('ade.ai.chatPaneReady', "Codex Chat Is Open · Your Diagram Is Attached"));
		} catch (error) { this.conversation = undefined; const message = localize('ade.ai.chatFailed', "Could Not Open Codex: {0}", error instanceof Error ? error.message : String(error)); this.report(message); this.notifications.error(message); }
		finally { this.chatOpening = false; this.busy = false; opening.dispose(); this.changes.fire(); }
	}

	async returnToDiagrams(): Promise<void> {
		this.terminalGroups.hidePanel();
		try { await this.refreshExploration(); } catch (error) { this.notifications.error(String(error)); }
		await this.editors.openEditor({ resource: AdeInput.RESOURCE, options: { pinned: true, revealIfOpened: true } });
		if (this.code.changed) { this.report(localize('ade.ai.reviewAfterChat', "Code Changed · Update Diagrams to Review the Result")); }
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
		this.diagramExploration = result.data; this.changes.fire();
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
		if (this.busy || this.operations.busy || !this.code.context) { return; }
		await this.run(async token => {
			if (!await this.project.save()) { return; }
			const root = this.code.context!.sourceRoot;
			if (this.exploration?.root !== root) { this.exploration = undefined; }
			const result = await this.explorationRequest({ action: 'open', ...(this.exploration ? { sessionId: this.exploration.id } : {}), ...(!this.exploration ? { model: this.storage.get('ade.ai.diagramModel.codex', StorageScope.PROFILE) ?? 'chat-selected' } : {}) }, token);
			this.exploration = { ...this.exploration, root, id: result.sessionId, snapshot: this.code.context!.snapshot };
			this.diagramExploration = result.data; this.diagramProgress = undefined; this.persistExploration();
		}, true);
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
		if (!this.exploration || this.busy) { return; }
		const selected = await this.quick.pick([
			{ label: localize('ade.explore.budgetSmall', "Explore One Scenario"), description: localize('ade.explore.budgetSmallDetail', "8 Reported Turns · 80 Local Tool Calls · 1 MiB Retrieved · 30 Minutes"), calls: 80, bytes: 1048576, turns: 8, duration: 1800000 },
			{ label: localize('ade.explore.budgetMedium', "Explore Several Scenarios"), description: localize('ade.explore.budgetMediumDetail', "16 Reported Turns · 160 Local Tool Calls · 2 MiB Retrieved · 60 Minutes"), calls: 160, bytes: 2097152, turns: 16, duration: 3600000 }
		], { title: localize('ade.explore.budget', "Add Exploration Budget"), placeHolder: localize('ade.explore.budgetHint', "Evidence and Drafts Are Retained. Provider Turns and Tokens Are Counted Only When Reported.") });
		if (!selected || !this.diagramExploration) { return; }
		const usage = this.diagramExploration.usage;
		await this.run(async token => { await this.explorationRequest({ action: 'budget', sessionId: this.exploration!.id, budget: { maxToolCalls: Math.min(1000, usage.toolCalls + selected.calls), maxReadBytes: Math.min(33554432, usage.readBytes + selected.bytes), maxModelTurns: Math.min(100, usage.modelTurns.length + selected.turns), maxDurationMs: selected.duration } }, token); await this.refreshExploration(); }, false, true);
	}
	async reviewDiagramProposal(id?: string): Promise<void> {
		if (!this.exploration || this.busy || this.operations.busy) { return; }
		await this.run(async token => {
			await this.refreshExploration();
			const proposal = id ? this.diagramExploration?.proposals.find(entry => entry.id === id) : (await this.quick.pick(this.diagramExploration?.proposals.filter(entry => entry.status !== 'applied').map(entry => ({ label: entry.views.map(view => view.name).join(', ') || entry.id, description: entry.status, proposal: entry })) ?? [], { title: localize('ade.explore.review', "Review Diagram Draft") }))?.proposal;
			if (!proposal || !await this.project.save()) { return; }
			const preview = await this.explorationRequest({ action: 'tool', sessionId: this.exploration!.id, tool: 'ade_view_preview', arguments: { proposalId: proposal.id } }, token);
			const review = preview.data.reviewFile ? (await this.files.readFile(URI.file(preview.data.reviewFile))).value.toString() : JSON.stringify(preview, null, '\t');
			const resource = URI.from({ scheme: 'untitled', path: `A.D.E Proposal Review ${proposal.id}.json` });
			await this.editors.openEditor({ resource, contents: review, languageId: 'json', options: { pinned: true } });
			for (const image of preview.data.images ?? []) { await this.editors.openEditor({ resource: URI.file(image.path), options: { pinned: true, override: IMAGE_PREVIEW_EDITOR_ID } }); }
			if (proposal.status !== 'ready') { this.info(localize('ade.explore.draftInvalid', "This Draft Has Diagnostics. Continue the Conversation to Correct It; Other Drafts Can Be Applied.")); return; }
			if (!(await this.dialogs.confirm({ message: localize('ade.explore.apply', "Apply This Diagram Proposal?"), detail: localize('ade.explore.applyDetail', "{0}\nThe preview contains the resolved changes. This applies only this proposal and its dependencies. Other drafts remain available.", proposal.views.map(view => view.name).join(', ')), primaryButton: localize('ade.explore.applyButton', "Apply Proposal") })).confirmed) { return; }
			const result = await this.explorationRequest({ action: 'publish', sessionId: this.exploration!.id, proposalId: proposal.id }, token);
			if (result.data.snapshot) { const context = JSON.parse(await this.code.executeReconciliation({ operation: 'inspect', snapshot: result.data.snapshot }, token)); await this.code.openContext(context); }
			await this.refreshExploration();
		}, false, true);
	}

	/** First use asks only for the diagram model; advanced coding settings stay separate. */
	private async readyDiagramConfig(): Promise<CliConfig | undefined> {
		if (!this.config) {
			let executable = 'codex';
			if (!await this.code.resolveCli(executable)) {
				const selected = await this.chooseCliExecutable('codex', executable);
				if (!selected) { this.report(localize('ade.ai.setupDeferred', "Setup Cancelled · Choose Build Diagrams to Continue")); return; }
				executable = selected;
			}
			const draft: CliConfig = { version: 1, provider: 'codex', connection: 'cli', model: '', executable, timeoutMs: 180000, maxContextBytes: 262144, maxCalls: 1 };
			const model = await this.selectDiagramModel(draft);
			if (!model) { this.report(localize('ade.ai.modelDeferred', "No Model Selected · Choose Build Diagrams to Continue")); return; }
			this.config = { ...draft, model };
			this.storage.store('ade.ai.cliConfig', JSON.stringify(this.config), StorageScope.PROFILE, StorageTarget.MACHINE);
		}
		if (!this.config.maxCalls) { return { ...this.config }; }
		const executable = await this.resolveCli(this.config.provider);
		if (!executable) { return undefined; }
		const state = await this.code.checkCliAccount(this.config.provider, executable);
		if (state.status === 'signedOut') {
			await this.signIn(this.config.provider, true);
			this.report(localize('ade.ai.finishDiagramSignIn', "Finish Signing In in the Terminal, Then Choose Build Diagrams Again")); return undefined;
		}
		if (state.status !== 'signedIn') { throw new Error(localize('ade.ai.diagramAccountCheck', "Could Not Verify the CLI Account. Check Its Connection and Retry Build Diagrams.")); }
		return { ...this.config, executable };
	}

	async buildDiagrams(): Promise<void> { if (this.configuration.getValue<boolean>('ade.diagramImport.incremental') !== false) { await this.exploreDiagrams(); } else { await this.generateDiagrams(false); } }
	async resumeDiagrams(): Promise<void> { if (this.configuration.getValue<boolean>('ade.diagramImport.incremental') !== false) { await this.exploreDiagrams(); } else { await this.generateDiagrams(true); } }
	private async generateDiagrams(resume: boolean): Promise<void> {
		if (this.busy || this.operations.busy || !this.code.context) { return; }
		await this.run(async token => {
			const context = this.code.context;
			const configured = await this.readyDiagramConfig();
			if (!configured || !context || !await this.project.save()) { return; }
			const diagramModel = this.storage.get(`ade.ai.diagramModel.${configured.provider}`, StorageScope.PROFILE) ?? await this.selectDiagramModel(configured);
			if (!diagramModel) { return; }
			const config = { ...configured, model: diagramModel };
			let clarification: string | undefined;
			if (resume && this.diagramProgress?.questions.length) { clarification = await this.quick.input({ title: localize('ade.ai.diagramClarify', "Clarify Diagram Interpretation"), prompt: this.diagramProgress.questions.join(' '), ignoreFocusLost: true }); if (!clarification) { return; } }
			let job: CodeDiagramProgress = JSON.parse(await this.code.executeReconciliation({ operation: 'diagramPrepare', snapshot: context.snapshot, config: JSON.stringify(config), ...(resume && this.diagramProgress ? { resume: this.diagramProgress.id } : {}), clarification }, token));
			this.diagramProgress = job; this.storage.store('ade.ai.diagramJob', JSON.stringify(job), StorageScope.WORKSPACE, StorageTarget.MACHINE); this.changes.fire();
			if (!config.maxCalls) { this.info(localize('ade.ai.diagramsNoBudget', "Diagram Scope Prepared. Enable AI Requests in AI Settings to Generate It.")); return; }
			const accepted = job.status === 'plan' ? { confirmed: true } : await this.dialogs.confirm({ message: localize('ade.ai.buildConfirm', "Propose a Diagram Plan with {0}?", config.model), detail: [localize('ade.ai.buildScopeShort', "{0} files · {1} indexed symbols.\nUp to {2} additional requests to {3}.", job.files, job.symbols, job.remainingRequests ?? job.total - job.completed, config.provider === 'codex' ? 'Codex' : 'Claude Code'), localize('ade.ai.buildDisclosure', "Source evidence is sent through your signed-in CLI account to analyze responsibilities and propose necessary diagrams. You will review the proposal before generating its views."), job.inputBudgetBytes ? localize('ade.ai.diagramContextBudget', "Input and schema: up to {0} bytes per request. {1} bytes left as estimated response headroom.", job.inputBudgetBytes, job.responseHeadroomBytes ?? 0) : '', job.calls ? localize('ade.ai.buildAttempted', "{0} requests already attempted. Completed steps will be reused.", job.calls) : '', job.excluded ? localize('ade.ai.buildExcluded', "{0} documentation, binary or oversized files excluded.", job.excluded) : ''].filter(Boolean).join('\n\n'), primaryButton: localize('ade.ai.buildButton', "Propose Diagrams") });
			if (!accepted.confirmed) { return; }
			this.diagramRunning = true;
			while (job.status === 'ready' || job.status === 'running' || job.status === 'plan') {
				if (job.status === 'plan') {
					this.diagramRunning = false; this.report(localize('ade.ai.diagramPlanReady', "Diagram Plan Ready · Review Before Generating Views"));
					const plan = job.plan ?? [];
					const approved = await this.dialogs.confirm({ message: localize('ade.ai.reviewDiagramPlan', "Review the Proposed Diagrams"), detail: [plan.map((item, index) => localize('ade.ai.diagramPlanRow', "{0}. {1} · {2}\n{3}", index + 1, item.name, viewLabels[item.kind], item.intent)).join('\n\n'), localize('ade.ai.diagramPlanBudget', "{0} diagrams · Up to {1} additional requests to {2}. Each diagram is a saved step. All approved diagrams must pass validation before the new snapshot is published.", plan.length, job.remainingRequests ?? plan.length, job.model)].join('\n\n'), primaryButton: localize('ade.ai.generatePlan', "Generate {0} Diagrams", plan.length) });
					if (!approved.confirmed) { this.report(localize('ade.ai.diagramPlanSaved', "Diagram Plan Saved · Review Diagram Plan to Continue")); return; }
					if (this.code.context?.snapshot !== context.snapshot) { throw new Error(localize('ade.ai.diagramProjectChanged', "The Active Project Changed. Open Its Diagrams to Continue.")); }
					job = JSON.parse(await this.code.executeReconciliation({ operation: 'diagramApprovePlan', snapshot: context.snapshot, id: job.id, reviewId: job.reviewId }, token));
					this.diagramProgress = job; this.storage.store('ade.ai.diagramJob', JSON.stringify(job), StorageScope.WORKSPACE, StorageTarget.MACHINE); this.diagramRunning = true; this.changes.fire();
					continue;
				}
				const nextDiagram = job.plan?.find(item => item.status !== 'complete');
				this.report(nextDiagram ? localize('ade.ai.generatingView', "Generating {0} · {1} · {2}", nextDiagram.name, viewLabels[nextDiagram.kind], job.model) : localize('ade.ai.planningDiagramStep', "Analyzing Responsibilities and Planning Diagrams · {0} of {1} Steps · {2}", job.completed, job.total, job.model));
				try { job = JSON.parse(await this.code.executeReconciliation({ operation: 'diagramStep', snapshot: context.snapshot, id: job.id, reviewId: job.reviewId }, token)); }
				catch (error) {
					this.diagramProgress = { ...job, status: 'failed', error: token.isCancellationRequested ? localize('ade.ai.diagramPaused', "Generation Paused · Resume to Keep Completed Steps") : error instanceof Error ? error.message : String(error) };
					this.storage.store('ade.ai.diagramJob', JSON.stringify(this.diagramProgress), StorageScope.WORKSPACE, StorageTarget.MACHINE); throw error;
				}
				if (this.code.context?.snapshot !== context.snapshot) { throw new Error(localize('ade.ai.diagramProjectChanged', "The Active Project Changed. Open Its Diagrams to Continue.")); }
				this.diagramProgress = job; this.storage.store('ade.ai.diagramJob', JSON.stringify(job), StorageScope.WORKSPACE, StorageTarget.MACHINE); this.changes.fire();
				if (job.context) { await this.code.openContext(job.context); this.report(localize('ade.ai.diagramsReady', "Diagrams Ready · {0} Responsibilities in {1} Views", this.project.model.semantics.elements.filter(item => item.kind !== 'feature').length, this.project.model.views.length)); return; }
				if (job.questions.length) { this.info(job.questions.join('\n')); return; }
			}
		}, true);
	}

	async chooseDiagramModel(): Promise<void> {
		if (this.busy || this.operations.busy || !await this.ensureConfigured()) { return; }
		const selected = await this.selectDiagramModel(this.config!);
		if (selected && this.exploration && this.configuration.getValue<boolean>('ade.diagramImport.incremental') !== false) { await this.chat(); }
	}
	private async selectDiagramModel(configured: CliConfig): Promise<string | undefined> {
		const choices = (configured.provider === 'codex' && configured.executable !== 'codex' && this.config?.executable !== 'codex' ? [] : this.nativeModels(configured.provider)).sort((a, b) => (a.rates ? a.rates.input + a.rates.output : Infinity) - (b.rates ? b.rates.input + b.rates.output : Infinity));
		const model = choices.length ? (await this.quick.pick(choices, { title: localize('ade.ai.diagramModel', "Model for Diagrams"), placeHolder: localize('ade.ai.diagramModelHint', "Choose a Lower-Cost Model for Interpretation. Your Coding Model Is Kept Separately.") }))?.id : await this.quick.input({ title: localize('ade.ai.diagramModel', "Model for Diagrams"), value: this.storage.get(`ade.ai.diagramModel.${configured.provider}`, StorageScope.PROFILE) ?? configured.model, prompt: localize('ade.ai.diagramModelManual', "Use an exact model ID shown by /model in Codex or by your provider CLI. This model is saved separately for diagrams."), ignoreFocusLost: true });
		if (model) { this.storage.store(`ade.ai.diagramModel.${configured.provider}`, model, StorageScope.PROFILE, StorageTarget.MACHINE); }
		return model;
	}

	async implement(): Promise<void> {
		if ((this.project.model.version === 4 || this.project.model.version === 5)) { await this.preparePureProject('forward'); return; }
		this.structuralSession = undefined; await this.collaborate('plan');
	}
	async structuralReverse(): Promise<void> { await this.preparePureProject('reverse'); }
	async movePureSource(): Promise<void> {
		const model = this.project.model; if ((model.version !== 4 && model.version !== 5)) { return; }
		const behavior = await this.quick.pick([...(model.foundation.predicates ?? []).map(predicate => ({ label: predicate.id, id: predicate.id })), ...model.foundation.interactions.filter(entry => entry.execution).map(entry => ({ label: entry.id, id: entry.id })), ...(model.foundation.messaging ?? []).map(entry => ({ label: entry.id, id: entry.id })), ...(model.foundation.stateMachines ?? []).map(entry => ({ label: model.semantics.elements.find(element => element.id === entry.ownerId)?.name ?? entry.id, id: entry.id }))], { title: localize('ade.pure.move', "Move Model Behavior Source") }); if (!behavior) { return; }
		const file = await this.quick.input({ title: localize('ade.pure.move.path', "Destination Source"), value: 'src/model-behavior.mjs', prompt: localize('ade.pure.move.hint', "Choose a source filename. The reviewed plan preserves the behavior identity.") });
		if (file) { await this.preparePureProject('forward', { [behavior.id]: file }); }
	}
	private async preparePureProject(direction: 'forward' | 'reverse', paths?: Record<string, string>): Promise<void> {
		await this.run(async token => {
			const root = this.project.projectRoot?.fsPath;
			if (!root || !this.project.modelUri?.path.endsWith('/.ade/model.json') || !await this.project.save() || !await this.trust.requestWorkspaceTrust()) { return; }
			const revision = canonicalJson(semanticContent(this.project.model));
			this.preparationProblem = undefined;
			let result: { status: string; session?: StructuralSession };
			try { result = await this.request({ operation: 'structuralPrepare', root, direction, ...(paths ? { paths } : {}) }, token); }
			catch (error) { if (!token.isCancellationRequested) { this.preparationProblem = error instanceof Error ? error.message : String(error); this.changes.fire(); } throw error; }
			if (token.isCancellationRequested || this.project.projectRoot?.fsPath !== root || revision !== canonicalJson(semanticContent(this.project.model))) { return; }
			if (!result.session) { this.structuralSession = undefined; this.session = undefined; this.structuralInvalid = false; this.info(localize('ade.pure.aligned', "Model Behavior Is Aligned · No Proposal · No AI Calls")); return; }
			this.structuralInvalid = false; this.structuralSession = result.session; this.session = undefined;
			this.storage.store('ade.structural.session', JSON.stringify({ root, id: result.session.id }), StorageScope.WORKSPACE, StorageTarget.MACHINE);
			await this.reviewPureProject();
		}, false, true);
	}
	async structuralTechnicalReview(): Promise<void> { await this.run(async () => this.reviewPureProject(true), false, true); }
	private async reviewPureProject(technical = false): Promise<void> {
		const session = this.structuralSession; if (!session) { return; }
		if (!technical) { await this.editors.openEditor({ resource: AdeInput.RESOURCE, options: { pinned: true, revealIfOpened: true } }); this.changes.fire(); return; }
		const summary = session.mutations.map(edit => ({ file: edit.file, action: edit.before === null ? 'create' : edit.after === null ? 'delete' : 'modify', before: edit.before?.content ?? null, after: edit.after?.content ?? null }));
		for (const edit of summary) {
			const folder = URI.joinPath(URI.file(session.root), '.ade', 'structural', 'sessions', session.id, 'review');
			const original = URI.joinPath(folder, 'before', edit.file), modified = URI.joinPath(folder, 'after', edit.file);
			await this.files.createFolder(URI.joinPath(original, '..')); await this.files.createFolder(URI.joinPath(modified, '..'));
			await this.files.writeFile(original, VSBuffer.fromString(edit.before ?? '')); await this.files.writeFile(modified, VSBuffer.fromString(edit.after ?? ''));
			const pane = await this.editors.openEditor({ original: { resource: original }, modified: { resource: modified }, label: edit.file, options: { pinned: true } });
			const control = pane?.getControl(); if (isDiffEditor(control)) { control.updateOptions({ readOnly: true, originalEditable: false }); }
		}
		await this.editors.openEditor({ contents: JSON.stringify({ status: this.status, direction: session.direction, changes: summary.map(({ before, after, ...entry }) => entry), coverage: session.coverage, context: session.packets.map(entry => JSON.parse(entry.packet.bytes)), verification: session.verification ?? null, calls: 0, cost: null }, null, '\t'), languageId: 'json', options: { pinned: true } });
	}
	private async runPureAction(operation: 'structuralVerify' | 'structuralApply' | 'structuralUndo'): Promise<void> {
		await this.run(async token => {
			if (!(operation === 'structuralVerify' ? this.canVerify : operation === 'structuralUndo' ? this.canUndo : this.canApply)) { return; }
			const session = this.structuralSession; if (!session || !this.structuralCurrent || this.project.projectRoot?.fsPath !== session.root || !await this.project.save()) { return; }
			const message = operation === 'structuralVerify' ? localize('ade.pure.verify', "Verify the Reviewed Model Behavior?") : operation === 'structuralUndo' ? localize('ade.pure.undo', "Restore the Previous Model and Code?") : localize('ade.pure.apply', "Publish the Verified Model and Code?");
			if (!(await this.dialogs.confirm({ message, detail: operation === 'structuralVerify' ? localize('ade.pure.runner', "Runs domain-emitted expressions, interactions and flat state machines with scripted response data and independent business criteria. Custom project code and tests are excluded.") : session.mutations.map(edit => edit.file).join('\n'), primaryButton: localize('ade.pure.continue', "Continue") })).confirmed) { return; }
			if (!this.structuralCurrent || this.project.projectRoot?.fsPath !== session.root || !await this.project.save() || operation === 'structuralVerify' && !await this.trust.requestWorkspaceTrust()) { return; }
			try { this.structuralSession = await this.request<StructuralSession>({ operation, root: session.root, id: session.id, reviewId: session.reviewId }, token); }
			catch (error) { this.structuralInvalid = true; this.preparationProblem = error instanceof Error ? error.message : String(error); this.changes.fire(); throw error; }
			if (operation !== 'structuralVerify') { this.continuity.pause(); await this.project.revert(); }
			await this.reviewPureProject();
		}, false, true);
	}
	async structuralResume(): Promise<void> { await this.resumePureProject(false); }
	async structuralRecover(): Promise<void> { await this.resumePureProject(true); }
	private async resumePureProject(recover: boolean): Promise<void> {
		await this.run(async token => {
			const saved = this.storage.get('ade.structural.session', StorageScope.WORKSPACE); if (!saved) { return; }
			const request: { root: string; id: string } = JSON.parse(saved);
			if (request.root !== this.project.projectRoot?.fsPath || !await this.project.save()) { return; }
			this.structuralSession = await this.request<StructuralSession>({ ...request, operation: recover ? 'structuralRecover' : 'structuralSession' }, token); this.structuralInvalid = false; this.preparationProblem = undefined; this.session = undefined;
			if (recover) { await this.project.revert(); } await this.reviewPureProject();
		}, false, true);
	}
	async simulateStates(): Promise<void> {
		await this.run(async token => {
			const root = this.project.projectRoot, model = this.project.model; if (!root || (model.version !== 4 && model.version !== 5)) { return; }
			const version = canonicalJson(semanticContent(model)), file = URI.joinPath(root, '.ade', 'criteria.json'); if (!await this.files.exists(file)) { this.info(localize('ade.states.simulation.author', "Author an Independent State Case Before Simulating.")); return; }
			const before = (await this.files.readFile(file)).value.toString(); if (new TextEncoder().encode(before).length > 2097152) { throw new Error(localize('ade.states.simulation.budget', "The Criteria File Exceeds the Local Simulation Budget.")); } const criteria: ProjectCriteria = JSON.parse(before);
			const choice = await this.quick.pick((criteria.states ?? []).map(entry => ({ label: entry.id, entry })), { title: localize('ade.states.simulation.select', "Simulate Authored State Scenario") }); if (!choice) { return; }
			const controller = new AbortController(), listener = token.onCancellationRequested(() => controller.abort()); let result: Awaited<ReturnType<typeof interpretModelStateMachine>>;
			try { if (token.isCancellationRequested) { controller.abort(); } result = await interpretModelStateMachine(model, choice.entry.machineId, choice.entry.scenario, controller.signal); } finally { listener.dispose(); }
			if (canonicalJson(semanticContent(this.project.model)) !== version || this.project.projectRoot?.toString() !== root.toString() || (await this.files.readFile(file)).value.toString() !== before) { throw new Error(localize('ade.states.simulation.stale', "The Specification Changed. Run a New Simulation.")); }
			await this.editors.openEditor({ contents: describeAdeStateSimulation(model, choice.entry.machineId, result), languageId: 'plaintext', options: { pinned: true } });
		}, false, true);
	}
	async editPureCriteria(): Promise<void> {
		await this.run(async () => {
			const root = this.project.projectRoot; if (!root) { return; } const file = URI.joinPath(root, '.ade', 'criteria.json');
			const exists = await this.files.exists(file); const before = exists ? (await this.files.readFile(file)).value.toString() : undefined; const criteria: ProjectCriteria = before ? JSON.parse(before) : { version: 1, revision: '1', cases: [] };
			const model = this.project.model, version = canonicalJson(semanticContent(this.project.model));
			if ((model.version === 4 || model.version === 5) && (model.foundation.interactions.some(entry => entry.execution) || model.foundation.stateMachines?.length || model.foundation.messaging?.length)) {
				const mode = await this.quick.pick([...(model.foundation.messaging?.length ? [{ label: localize('ade.messaging.newCase', "Author Independent Messaging Case"), interaction: true, messaging: true }] : []), ...(model.foundation.stateMachines?.length ? [{ label: localize('ade.criteria.newState', "Author Independent State Case"), interaction: true, states: true }] : []), { label: localize('ade.criteria.newInteraction', "Author Independent Interaction Case"), interaction: true }, ...(criteria.cases.length ? [{ label: localize('ade.criteria.predicate', "Edit Predicate Expectation"), interaction: false }] : [])], { title: localize('ade.pure.criteria', "Independent Business Expectations") }); if (!mode) { return; }
				if (mode.interaction) {
					const next = 'messaging' in mode && mode.messaging ? await editAdeMessagingCriteria(this.quick, model, criteria) : 'states' in mode && mode.states ? await editAdeStateCriteria(this.quick, model, criteria) : await editAdeInteractionCriteria(this.quick, model, criteria); if (!next) { return; }
					if (canonicalJson(semanticContent(this.project.model)) !== version || this.project.projectRoot?.toString() !== root.toString() || (await this.files.exists(file) ? (await this.files.readFile(file)).value.toString() : undefined) !== before) { throw new Error(localize('ade.pure.criteria.stale', "Criteria changed. Open them again.")); }
					if (exists) { await this.files.writeFile(file, VSBuffer.fromString(JSON.stringify(next, null, '\t') + '\n')); } else { await this.files.createFile(file, VSBuffer.fromString(JSON.stringify(next, null, '\t') + '\n'), { overwrite: false }); } return;
				}
			}
			const entry = await this.quick.pick(criteria.cases.map(entry => ({ label: entry.id, description: JSON.stringify(entry.input), entry })), { title: localize('ade.pure.criteria', "Independent Business Expectations") }); if (!entry) { return; }
			const expected = await this.quick.pick([{ label: localize('ade.pure.true', "Satisfied"), value: true }, { label: localize('ade.pure.false', "Not Satisfied"), value: false }, { label: localize('ade.pure.unknown', "Indeterminate"), value: null }, { label: localize('ade.pure.error', "Input Type Error"), value: 'typeError' as const }, { label: localize('ade.expression.zero', "Division by Zero"), value: 'arithmeticZero' as const }, { label: localize('ade.expression.precision', "Nonintegral Result or Integer Overflow"), value: 'arithmeticPrecision' as const }], { title: localize('ade.pure.expected', "Expected Result · Independent of the Generator") }); if (!expected) { return; }
			if ((await this.files.readFile(file)).value.toString() !== before) { throw new Error(localize('ade.pure.criteria.stale', "Criteria changed. Open them again.")); }
			entry.entry.expected = expected.value; criteria.revision = String(Date.now()); await this.files.writeFile(file, VSBuffer.fromString(JSON.stringify(criteria, null, '\t') + '\n'));
		});
	}
	async interpret(): Promise<void> {
		await this.collaborate('interpret');
	}
	async reconcile(preview: CodePreview, resolutions: CodeResolution[] = [], direction?: 'model' | 'code'): Promise<CodePreview | undefined> {
		if (this.busy || this.operations.busy || !this.code.context) { return undefined; }
		if (this.code.context.diagramState === 'index' || isSourceEvidenceModel(this.project.model) || !this.project.model.views.some(view => view.nodes.length > 0)) {
			await this.buildDiagrams();
			return undefined;
		}
		if (!await this.ensureConfigured()) { return undefined; }
		let result: CodePreview | undefined;
		await this.run(async token => {
			const config = await this.readyConfig();
			const context = this.code.context;
			if (!config || !context || context.snapshot !== preview.context.snapshot || !await this.project.save()) { return; }
			const needsSourceReview = !!preview.ai?.questions.length;
			let clarification: string | undefined;
			if (preview.ai?.questions.length) {
				clarification = await this.quick.input({ title: localize('ade.ai.reconcileClarify', "Clarify the Reconciliation"), prompt: preview.ai.questions.join(' '), ignoreFocusLost: true });
				if (!clarification) { return; }
			}
			if (preview.ai || preview.reconciliation?.status === 'verificationFailed') { preview = JSON.parse(await this.code.executeReconciliation({ operation: 'preview', snapshot: context.snapshot, scope: context.scope }, token)); }
			const changed = new Set([...preview.files.added, ...preview.files.changed]);
			for (const file of preview.context.files.filter(file => preview.context.declarations.some(item => item.evidence.file === file.path && preview.impact.elementIds.includes(item.id)))) { changed.add(file.path); }
			const suggested = preview.context.files.filter(file => changed.has(file.path) && file.status !== 'excluded' && file.status !== 'configuration');
			const selected = direction && suggested.length > 0 && !needsSourceReview ? suggested.map(file => ({ label: file.path })) : await this.quick.pick(preview.context.files.filter(file => file.status !== 'excluded' && file.status !== 'configuration').map(file => ({ label: file.path, picked: changed.has(file.path) })), { title: localize('ade.ai.reconcileSources', "Review Source Files for Bidirectional Sync"), placeHolder: localize('ade.ai.reconcileSourcesHint', "Select the affected implementation and callers in any language. Only bounded windows of selected files are sent."), canPickMany: true });
			if (!selected) { return; }
			const prepared: CodeReconciliationContext = JSON.parse(await this.code.executeReconciliation({ operation: 'reconciliationPrepare', token: preview.token, config: JSON.stringify(config), sourceFiles: selected.map(item => item.label), resolutions, clarification: [direction === 'model' ? 'Update the implementation to satisfy the edited diagrams and preserve unrelated code. Ask about concurrent changes.' : '', clarification].filter(Boolean).join('\n') }, token));
			if (!direction) { await this.editors.openEditor({ contents: prepared.contents, languageId: 'json', options: { pinned: true } }); }
			if (!config.maxCalls) { this.info(localize('ade.ai.reconcileContextOnly', "Reconciliation Context Prepared · The Saved Budget Allows No AI Calls.")); return; }
			const consent = await this.dialogs.confirm({ message: localize('ade.ai.reconcileDisclose', "Prepare Code Changes with {0}?", config.model), detail: localize('ade.ai.reconcileBytes', "{0} input bytes including schema; {1} source bytes disclosed from {2} available. One CLI invocation, with the saved model and budget. Token estimate: {3}; actual usage is reported separately. No source or model is changed until Apply Sync.", prepared.metrics.inputBytes + prepared.metrics.schemaBytes, prepared.metrics.disclosedBytes, prepared.metrics.sourceBytes, prepared.metrics.estimatedTokens), primaryButton: localize('ade.ai.reconcileSend', "Propose Reconciliation") });
			if (!consent.confirmed) { return; }
			result = JSON.parse(await this.code.executeReconciliation({ operation: 'reconciliationPropose', token: preview.token, reviewId: prepared.reviewId }, token));
			if (!direction) { await this.editors.openEditor({ contents: JSON.stringify(result?.ai ?? result?.reconciliation, null, '\t'), languageId: 'json', options: { pinned: true } }); }
		});
		return result;
	}
	private async collaborate(operation: 'plan' | 'interpret'): Promise<void> {
		if ((this.project.model.version === 4 || this.project.model.version === 5)) { this.info(localize('ade.ai.v4Profile', "Choose a Compatible Generation Profile Before Implementing This Specification. You Can Continue Editing and Saving the Draft.")); return; }
		if (this.busy || this.operations.busy) { this.notifications.info(localize('ade.ai.busy', "An A.D.E operation is already running. Wait for it to finish or cancel it before starting another.")); return; }
		if (!this.code.context) { this.info(localize('ade.ai.importRequired', "Import a Git Codebase with a Commit and Add a Feature Before Implementing. Use Import Codebase or Sync Project.")); return; }
		if (!await this.ensureConfigured()) { return; }
		await this.run(async token => {
			const config = await this.readyConfig();
			if (!config) { return; }
			const context = this.code.context;
			if (!context || !this.project.model || !await this.project.save()) { throw new Error(localize('ade.ai.importFirst', "Save the model and import or Sync its Git codebase first.")); }
			const projectId = this.project.model.id;
			const saveCurrent = async (): Promise<boolean> => {
				if (this.code.context?.snapshot !== context.snapshot || this.project.model?.id !== projectId) { throw new Error(localize('ade.ai.contextChanged', "The active project changed. Prepare and review a new context.")); }
				const saved = await this.project.save();
				if (!saved) { this.info(localize('ade.ai.saveCancelled', "The Model Was Not Saved. The AI Operation Was Cancelled.")); }
				return saved;
			};
			const feature = await this.quick.pick(this.project.model.semantics.elements.filter(element => element.kind === 'feature').map(element => ({ label: element.name, id: element.id })), { title: localize('ade.ai.feature', "Implement Feature") });
			if (!feature) { this.info(localize('ade.ai.featureCancelled', "No Feature Selected · AI Operation Cancelled. Add a Feature if the Project Is Empty.")); return; }
			const intent = await this.quick.input({ title: localize('ade.ai.intent', "Requested Behavior"), prompt: localize('ade.ai.intentHint', "Describe the implementation change. Acceptance criteria come from the feature's behavioral contract."), ignoreFocusLost: true });
			if (!intent) { this.info(localize('ade.ai.intentCancelled', "No Behavior Entered · AI Operation Cancelled.")); return; }
			const impact = getModelImpact(this.project.model, feature.id);
			const relatedIds = new Set([...impact.scope.map(element => element.id), ...impact.dependents.map(entry => entry.element.id)]);
			const suggested = new Set([...this.project.model.codeMappings.filter(mapping => relatedIds.has(mapping.elementId)).map(mapping => mapping.file), ...context.declarations.filter(declaration => relatedIds.has(declaration.id)).map(declaration => declaration.evidence.file)]);
			const selected = await this.quick.pick(context.files.filter(file => ['parsed', 'partial'].includes(file.status)).map(file => ({ label: file.path, picked: suggested.has(file.path) })), { title: localize('ade.ai.sources', "Review Source Files to Share · Suggested from Model Evidence"), canPickMany: true });
			if (!selected) { this.info(localize('ade.ai.filesCancelled', "File Review Cancelled · No AI Request Was Made.")); return; }
			const prepared = await this.request<PreparedReview>({ operation: 'prepare', config, request: { version: 1, snapshot: context.snapshot, featureId: feature.id, intent, constraints: [], sourceFiles: selected.map(file => file.label) } }, token);
			await this.editors.openEditor({ contents: JSON.stringify(prepared.context, null, '\t'), languageId: 'json', options: { pinned: true } });
			if (!config.maxCalls) { this.info(localize('ade.ai.contextOnly', "Context Prepared · No AI Request Was Made Because the Budget Is Zero.")); return; }
			const consent = await this.dialogs.confirm({ message: localize('ade.ai.disclose', "Send the reviewed feature context to {0}?", this.config!.provider === 'codex' ? 'Codex' : 'Claude Code'), detail: localize('ade.ai.disclosure', "Includes the selected model elements, contracts, impact, source evidence and {0} selected files. The original CLI uses its own account and configuration. Review the open context before continuing.", selected.length), primaryButton: localize('ade.ai.send', "Send Context") });
			if (!consent.confirmed) { this.info(localize('ade.ai.reviewCancelled', "Operation Cancelled During Review.")); return; }
			if (!await saveCurrent()) { return; }
			if (operation === 'interpret') {
				const result = await this.request<{ status: string; hypotheses: { description: string; rationale: string }[]; questions: string[] }>({ operation, prepared, reviewId: prepared.reviewId }, token);
				if (result.status === 'not-needed') { this.notifications.info(localize('ade.ai.noResiduals', "The selected evidence has no residual diagnostics to interpret. No AI request was made.")); }
				else { await this.editors.openEditor({ contents: localize('ade.ai.hypotheses', "Hypotheses for Review · These Are Not Model Facts") + '\n\n' + result.hypotheses.map(item => item.description + '\n' + item.rationale).join('\n\n') + '\n\n' + result.questions.join('\n'), languageId: 'plaintext', options: { pinned: true } }); }
				return;
			}
			const proposal = await this.request<Proposal>({ operation, prepared, reviewId: prepared.reviewId }, token);
			await this.editors.openEditor({ contents: proposal.plan.summary + '\n\n' + proposal.plan.steps.map((step, index) => `${index + 1}. ${step.description}`).join('\n') + '\n\n' + proposal.plan.changes.map(change => `${change.file} · ${change.reason}`).join('\n') + '\n\n' + localize('ade.ai.planTokens', "Reported Plan Tokens · Input: {0} · Output: {1}", proposal.usage?.inputTokens ?? localize('ade.ai.unknown', "Unavailable"), proposal.usage?.outputTokens ?? localize('ade.ai.unknown', "Unavailable")), languageId: 'plaintext', options: { pinned: true } });
			if (proposal.plan.questions.length) { this.notifications.info(proposal.plan.questions.map(item => item.question).join('\n')); return; }
			if (config.maxCalls < 2) { this.info(localize('ade.ai.planOnly', "Plan Ready · Generation Is Not Included in the Saved One-Run Budget.")); return; }
			const accepted = await this.dialogs.confirm({ message: proposal.plan.summary, detail: proposal.plan.changes.map(change => `${change.kind}: ${change.file} · ${change.reason}`).join('\n'), primaryButton: localize('ade.ai.generate', "Generate in Worktree") });
			if (!accepted.confirmed) { this.info(localize('ade.ai.generationCancelled', "Plan Ready · Generation Cancelled. Project Sources Are Unchanged.")); return; }
			if (!await saveCurrent()) { return; }
			this.session = await this.request<CollaborationSession>({ operation: 'stage', prepared, plan: proposal.plan, reviewId: proposal.planId }, token);
			this.activityStatus = undefined;
			this.storage.store('ade.ai.session', JSON.stringify({ root: this.session.root, id: this.session.id }), StorageScope.WORKSPACE, StorageTarget.MACHINE);
			await this.reviewCurrent();
		});
	}

	async review(): Promise<void> { await this.run(async () => this.structuralSession ? this.reviewPureProject() : this.reviewCurrent()); }
	private async reviewCurrent(): Promise<void> {
		if (!this.session) { this.info(localize('ade.ai.sessionRequired', "No Implementation Is Open. Implement a Feature or Resume a Saved Session First.")); return; }
		const session = this.session;
		for (const file of session.generated.files) {
			const directory = URI.joinPath(URI.file(session.root), '.ade', 'collaboration', session.id, 'review');
			const original = URI.joinPath(directory, 'before', file.file);
			const modified = URI.joinPath(directory, 'after', file.file);
			await this.files.createFolder(URI.joinPath(original, '..'));
			await this.files.createFolder(URI.joinPath(modified, '..'));
			await this.files.writeFile(original, VSBuffer.fromString(session.before.find(before => before.file === file.file)?.content ?? ''));
			await this.files.writeFile(modified, VSBuffer.fromString(file.content ?? ''));
			const pane = await this.editors.openEditor({ original: { resource: original }, modified: { resource: modified }, label: file.file, options: { pinned: true } });
			const control = pane?.getControl();
			if (isDiffEditor(control)) { control.updateOptions({ readOnly: true, originalEditable: false }); }
		}
		if (session.verification) { await this.editors.openEditor({ contents: session.verification.output, languageId: 'plaintext', options: { pinned: true } }); }
		await this.editors.openEditor({ contents: [session.generated.summary, this.status,
			localize('ade.ai.resultProject', "Project: {0}", session.root),
			localize('ade.ai.resultFiles', "Changed files: {0}", session.generated.files.map(file => file.file).join(', ')),
			localize('ade.ai.resultTokens', "Reported Generation Tokens · Input: {0} · Output: {1}", session.usage.inputTokens ?? localize('ade.ai.unknown', "Unavailable"), session.usage.outputTokens ?? localize('ade.ai.unknown', "Unavailable")),
			localize('ade.ai.actualCost', "Actual charge: unavailable. Subscription quota and token counts are distinct."),
			localize('ade.ai.sourceState', "Generated tests describe this reviewed worktree revision. Use Sync after applying or undoing source changes.")
		].join('\n\n'), languageId: 'plaintext', options: { pinned: true } });
	}
	async verify(): Promise<void> {
		if (this.structuralSession) { await this.runPureAction('structuralVerify'); return; }
		if (!this.canVerify) { this.info(localize('ade.ai.verifyRequired', "Generate or Resume Changes Before Running Tests.")); return; }
		await this.run(async token => {
			if (!this.session) { this.info(localize('ade.ai.sessionRequired', "No Implementation Is Open. Implement a Feature or Resume a Saved Session First.")); return; }
			const consent = await this.dialogs.confirm({ message: localize('ade.ai.runTests', "Run the Reviewed Tests in the Worktree?"), detail: localize('ade.ai.runTestsDetail', "Node.js runs the generated test files on this computer. The main project stays unchanged."), primaryButton: localize('ade.ai.verify', "Run Tests") });
			if (!consent.confirmed) { this.info(localize('ade.ai.reviewCancelled', "Operation Cancelled During Review.")); return; }
			this.session = await this.request<CollaborationSession>({ operation: 'verify', root: this.session.root, id: this.session.id, reviewId: this.session.reviewId }, token);
			this.activityStatus = undefined;
			await this.reviewCurrent();
		});
	}
	async apply(): Promise<void> { if (this.structuralSession) { await this.runPureAction('structuralApply'); return; } await this.changeSource(false); }
	async undo(): Promise<void> { if (this.structuralSession) { await this.runPureAction('structuralUndo'); return; } await this.changeSource(true); }
	private async changeSource(undo: boolean): Promise<void> {
		if (undo ? !this.canUndo : !this.canApply) { this.info(localize('ade.ai.applyPrerequisite', "Apply Requires Passing Tests; Undo Requires an Applied Implementation. Review the Current Session First.")); return; }
		await this.run(async token => {
			if (!this.session) { this.info(localize('ade.ai.sessionRequired', "No Implementation Is Open. Implement a Feature or Resume a Saved Session First.")); return; }
			if (this.code.context?.sourceRoot !== this.session.root) { throw new Error(localize('ade.ai.wrongProject', "Open the code project associated with this implementation before changing its source files.")); }
			const consent = await this.dialogs.confirm({ message: undo ? localize('ade.ai.undo', "Undo This Implementation?") : localize('ade.ai.apply', "Apply the Verified Changes to the Project?"), detail: this.session.generated.summary, primaryButton: undo ? localize('ade.ai.undoButton', "Undo Implementation") : localize('ade.ai.applyButton', "Apply Changes") });
			if (!consent.confirmed) { this.info(localize('ade.ai.reviewCancelled', "Operation Cancelled During Review.")); return; }
			if (!undo && !await this.project.save()) { this.info(localize('ade.ai.saveCancelled', "The Model Was Not Saved. The AI Operation Was Cancelled.")); return; }
			this.session = await this.request<CollaborationSession>({ operation: undo ? 'undo' : 'apply', root: this.session.root, id: this.session.id, reviewId: this.session.reviewId }, token);
			this.activityStatus = undefined;
		});
	}
	async resume(): Promise<void> {
		await this.run(async token => {
			const saved = this.storage.get('ade.ai.session', StorageScope.WORKSPACE);
			if (!saved) { this.info(localize('ade.ai.noSession', "No A.D.E implementation session is saved for this workspace.")); return; }
			const request: { root: string; id: string } = JSON.parse(saved);
			this.session = await this.request<CollaborationSession>({ ...request, operation: 'session' }, token);
			this.activityStatus = undefined;
			await this.reviewCurrent();
		});
	}
	async recover(): Promise<void> {
		await this.run(async token => {
			const saved = this.storage.get('ade.ai.session', StorageScope.WORKSPACE);
			if (!saved) { this.info(localize('ade.ai.noRecovery', "No Saved Implementation Is Available to Recover in This Workspace.")); return; }
			const request: { root: string; id: string } = JSON.parse(saved);
			this.session = await this.request<CollaborationSession>({ ...request, operation: 'recover' }, token);
			this.activityStatus = undefined;
		});
	}
	async benchmark(): Promise<void> {
		await this.compareModels(false);
	}
	async benchmarkReconciliation(): Promise<void> {
		await this.compareModels(true);
	}
	private async compareModels(reconciliation: boolean): Promise<void> {
		if (!await this.ensureConfigured()) { return; }
		if (this.config!.maxCalls < (reconciliation ? 1 : 2)) { this.info(localize('ade.ai.benchmarkBudget', "The benchmark needs a saved AI request budget. Configure one run per reconciliation case or two per implementation case.")); return; }
		await this.run(async token => {
			const config = await this.readyConfig();
			if (!config) { return; }
			const models = this.nativeModels(config.provider);
			const alternatives = models.filter(model => model.id !== config.model);
			const alternative = alternatives.length ? (await this.quick.pick(alternatives, { title: localize('ade.ai.compareModel', "Choose the Model to Compare") }))?.id
				: await this.quick.input({ title: localize('ade.ai.compareModel', "Choose the Model to Compare"), prompt: localize('ade.ai.compareExact', "Enter an exact model ID available to the same CLI account."), ignoreFocusLost: true });
			if (!alternative || alternative === config.model) { this.info(localize('ade.ai.compareCancelled', "Choose a Different Model to Run a Comparison. No Benchmark Was Started.")); return; }
			const consent = await this.dialogs.confirm({ message: localize('ade.ai.benchmarkConfirm', "Compare These Models on Three Sample Projects?"), detail: reconciliation ? localize('ade.ai.reconcileBenchmarkDetail', "Compares Python, Java and Go in both directions and with concurrent conflicts. Starts eighteen CLI invocations for two models, using only generated sample projects. Records prompt/output size, reported tokens, latency, identity continuity and preservation of custom code. This benchmark checks structural reconciliation; it does not certify arbitrary behavior or all languages.") : localize('ade.ai.benchmarkDetail', "Compares checkout, inventory and authorization in separate Git worktrees. Starts up to twelve agent runs and executes generated Node.js tests with independent acceptance checks on this computer. Only sample code is sent. Provider requests and retries within each run are managed by the original CLI; actual monetary charges may be unavailable."), primaryButton: localize('ade.ai.benchmarkRun', "Run Model Benchmark") });
			if (!consent.confirmed) { this.info(localize('ade.ai.reviewCancelled', "Operation Cancelled During Review.")); return; }
			const candidates = [config.model, alternative].map(model => ({ config: { ...config, model }, rates: models.find(candidate => candidate.id === model)?.rates }));
			const report = await this.request<ModelBenchmark>({ operation: reconciliation ? 'reconciliationBenchmark' : 'benchmark', candidates }, token);
			this.storage.store(reconciliation ? 'ade.ai.reconciliationBenchmark' : 'ade.ai.benchmark', JSON.stringify(report), StorageScope.PROFILE, StorageTarget.MACHINE);
			const summary = report.models.map(model => `${model.candidate.config.model}\n${model.cases.map(result => `${result.repository ?? `${result.language} · ${result.direction}`}: ${result.passed ? localize('ade.ai.benchmarkPass', "Passed") : localize('ade.ai.benchmarkFail', "Failed")} · ${result.durationMs} ms`).join('\n')}`).join('\n\n');
			await this.editors.openEditor({ contents: summary + '\n\n' + (report.defaultModel ? localize('ade.ai.benchmarkDefault', "Measured economical default: {0}. It is offered first in model selection while available with the same quoted rates.", report.defaultModel) : localize('ade.ai.benchmarkNoDefault', "No economical default was selected. Quality, account availability and comparable quoted consumption must all be known. Your explicit model selection is preserved.")), languageId: 'plaintext', options: { pinned: true } });
		});
	}
	async exportBenchmark(): Promise<void> {
		const report = this.storage.get('ade.ai.reconciliationBenchmark', StorageScope.PROFILE) ?? this.storage.get('ade.ai.benchmark', StorageScope.PROFILE);
		if (!report) { this.info(localize('ade.ai.noBenchmark', "Run a model benchmark before exporting its measured results.")); return; }
		await this.editors.openEditor({ contents: JSON.stringify(JSON.parse(report), null, '\t'), languageId: 'json', options: { pinned: true } });
	}
}
registerSingleton(IAdeAiService, AdeAiService, InstantiationType.Delayed);

registerAction2(class extends Action2 {
	constructor() { super({ id: 'ade.ai.reconcile', title: localize2('ade.ai.reconcileCommand', "A.D.E: Propose Bidirectional Reconciliation"), f1: false }); }
	override run(accessor: ServicesAccessor, preview: CodePreview, resolutions?: CodeResolution[], direction?: 'model' | 'code'): Promise<CodePreview | undefined> { return accessor.get(IAdeAiService).reconcile(preview, resolutions, direction); }
});

for (const [id, title, method] of [
	['ade.ai.connect', localize2('ade.ai.connectCommand', "A.D.E: Connect Claude Code or Codex"), 'connect'],
	['ade.ai.cli', localize2('ade.ai.cliCommand', "A.D.E: Open AI CLI"), 'openCli'],
	['ade.ai.reviewDiagramProposal', localize2('ade.explore.reviewCommand', "A.D.E: Review Diagram Draft"), 'reviewDiagramProposal'],
	['ade.ai.configureDiagramBudget', localize2('ade.explore.budgetCommand', "A.D.E: Configure Exploration Budget"), 'configureDiagramBudget'],
	['ade.ai.chooseDiagramModel', localize2('ade.ai.diagramModelCommand', "Choose Diagram Model"), 'chooseDiagramModel'],
	['ade.ai.returnToDiagrams', localize2('ade.ai.returnToDiagramsCommand', "A.D.E: Back to Diagrams"), 'returnToDiagrams'],
	['ade.ai.chat', localize2('ade.ai.chatCommand', "A.D.E: Chat with Codex"), 'chat'],
	['ade.ai.buildDiagrams', localize2('ade.ai.buildDiagramsCommand', "A.D.E: Build Semantic Diagrams"), 'buildDiagrams'],
	['ade.ai.resumeDiagrams', localize2('ade.ai.resumeDiagramsCommand', "A.D.E: Resume Diagram Generation"), 'resumeDiagrams'],
	['ade.ai.implement', localize2('ade.ai.implementCommand', "A.D.E: Implement Feature"), 'implement'],
	['ade.ai.interpret', localize2('ade.ai.interpretCommand', "A.D.E: Interpret Unresolved Evidence"), 'interpret'],
	['ade.ai.review', localize2('ade.ai.reviewCommand', "A.D.E: Review Implementation"), 'review'],
	['ade.ai.verify', localize2('ade.ai.verifyCommand', "A.D.E: Verify Implementation"), 'verify'],
	['ade.ai.apply', localize2('ade.ai.applyCommand', "A.D.E: Apply Verified Implementation"), 'apply'],
	['ade.ai.undo', localize2('ade.ai.undoCommand', "A.D.E: Undo Implementation"), 'undo'],
	['ade.ai.resume', localize2('ade.ai.resumeCommand', "A.D.E: Resume Implementation"), 'resume'],
	['ade.ai.recover', localize2('ade.ai.recoverCommand', "A.D.E: Recover Interrupted Implementation"), 'recover'],
	['ade.ai.configureContinuity', localize2('ade.continuity.command', "A.D.E: Start or Stop Continuous Preparation"), 'configureContinuity'],
	['ade.ai.structuralTechnicalReview', localize2('ade.pure.technical.command', "A.D.E: Inspect Technical Review"), 'structuralTechnicalReview'],
	['ade.ai.structuralReverse', localize2('ade.pure.reverse.command', "A.D.E: Reverse Model Behavior from Code"), 'structuralReverse'],
	['ade.ai.structuralResume', localize2('ade.pure.resume.command', "A.D.E: Resume Model Behavior Review"), 'structuralResume'],
	['ade.ai.structuralRecover', localize2('ade.pure.recover.command', "A.D.E: Recover Model Behavior Publication"), 'structuralRecover'],
	['ade.ai.simulateStates', localize2('ade.states.simulation.command', "A.D.E: Simulate State Machine"), 'simulateStates'],
	['ade.ai.editPureCriteria', localize2('ade.pure.criteria.command', "A.D.E: Edit Independent Business Expectations"), 'editPureCriteria'],
	['ade.ai.movePureSource', localize2('ade.pure.move.command', "A.D.E: Move Model Behavior Source"), 'movePureSource'],
	['ade.ai.benchmark', localize2('ade.ai.benchmarkCommand', "A.D.E: Compare AI Models"), 'benchmark'],
	['ade.ai.benchmarkReconciliation', localize2('ade.ai.benchmarkReconciliationCommand', "A.D.E: Compare Reconciliation Models"), 'benchmarkReconciliation'],
	['ade.ai.exportBenchmark', localize2('ade.ai.exportBenchmarkCommand', "A.D.E: Export Model Benchmark Results"), 'exportBenchmark']
] as const) {
	registerAction2(class extends Action2 {
		constructor() { super({ id, title, f1: true }); }
		override run(accessor: ServicesAccessor): Promise<void> { return accessor.get(IAdeAiService)[method](); }
	});
}
