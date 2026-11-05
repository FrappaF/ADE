/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { isDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
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
import { ITerminalService, ITerminalGroupService } from '../../terminal/browser/terminal.js';
import { IChatWidgetService, ChatViewPaneTarget } from '../../chat/browser/chat.js';
import { getNewChatSessionResource } from '../../chat/common/model/chatUri.js';
import { IAdeProjectService, AdeProjectService } from '../browser/adeProjectService.js';
import { IAdeCodeService } from '../browser/adeCodeService.js';
import { IAdeAiService } from '../browser/adeAiService.js';
import { IAdeOperationService, AdeOperationService } from '../browser/adeOperationService.js';
import { openAdeTerminal } from '../browser/adeTerminal.js';
import { getModelImpact } from '../common/modelImpact.js';
import { CodePreview, CodeReconciliationContext, CodeResolution, CodeDiagramProgress } from '../common/codeBridge.js';

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
	get connectionStatus(): string { return this._connectionStatus ?? localize('ade.ai.unchecked', "CLI Account Not Checked Yet"); }
	private config: CliConfig | undefined;
	diagramProgress: CodeDiagramProgress | undefined;
	private session: CollaborationSession | undefined;
	get status(): string {
		if (this.activityStatus) { return this.activityStatus; }
		if (this.session) {
			const labels = { staged: localize('ade.ai.staged', "Changes Ready for Review"), passed: localize('ade.ai.passed', "Tests Passed · Ready to Apply"), failed: localize('ade.ai.failed', "Verification Failed · Changes Not Applied"), applied: localize('ade.ai.applied', "Applied · Undo Available"), undone: localize('ade.ai.undone', "Changes Undone") };
			return labels[this.session.status];
		}
		return this._connectionStatus ?? (this.config ? localize('ade.ai.selected', "{0} · {1}", this.config!.provider === 'codex' ? 'Codex' : 'Claude Code', this.config!.model) : localize('ade.ai.setup', "Choose an AI Model in AI Settings"));
	}
	get canVerify(): boolean { return !!this.session && ['staged', 'failed', 'passed'].includes(this.session.status); }
	get canApply(): boolean { return this.session?.status === 'passed'; }
	get canUndo(): boolean { return this.session?.status === 'applied'; }

	constructor(
		@IAdeProjectService private readonly project: Pick<AdeProjectService, '_serviceBrand' | 'model' | 'save' | 'projectRoot' | 'modelUri' | 'activeView'>,
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
		@IAdeOperationService private readonly operations: AdeOperationService
	) {
		super();
		const saved = storage.get('ade.ai.cliConfig', StorageScope.PROFILE);
		if (saved) { try { this.config = JSON.parse(saved); } catch { /* choose a connection again */ } }
		const diagramJob = storage.get('ade.ai.diagramJob', StorageScope.WORKSPACE);
		if (diagramJob) { try { this.diagramProgress = JSON.parse(diagramJob); } catch { /* invalid saved progress */ } }
		this._register(code.onDidChange(() => {
			if (this.session && code.context && this.session.root !== code.context.sourceRoot) { this.session = undefined; this.changes.fire(); }
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
	private async run(task: (token: CancellationToken) => Promise<void>): Promise<void> {
		if (this.configuration.getValue<boolean>('chat.disableAIFeatures') === true) { this.info(localize('ade.ai.disabled', "AI Features Are Disabled in Settings.")); return; }
		const operation = this.operations.acquire('ai');
		if (this.busy || !operation) { operation?.dispose(); this.notifications.info(localize('ade.ai.busy', "An A.D.E operation is already running. Wait for it to finish or cancel it before starting another.")); return; }
		this.busy = true; this.report(localize('ade.ai.starting', "Preparing AI Operation"));
		const cancellation = new CancellationTokenSource();
		try {
			if (!await this.trust.requestWorkspaceTrust({ message: localize('ade.ai.trust', "A.D.E runs the original AI CLI and reviewed project tests on this computer.") })) { this.info(localize('ade.ai.untrusted', "AI Operation Cancelled · Workspace Trust Was Not Granted.")); return; }
			await this.progress.withProgress({ location: ProgressLocation.Notification, title: localize('ade.ai.progress', "A.D.E AI"), cancellable: true }, () => task(cancellation.token), () => cancellation.cancel());
			if (cancellation.token.isCancellationRequested) { this.info(localize('ade.ai.cancelled', "AI Operation Cancelled. Review Any Existing Worktree Before Continuing.")); }
		}
		catch (error) {
			const message = cancellation.token.isCancellationRequested ? localize('ade.ai.cancelled', "AI Operation Cancelled. Review Any Existing Worktree Before Continuing.") : localize('ade.ai.error', "A.D.E implementation: {0}", error instanceof Error ? error.message : String(error));
			this.report(message); if (cancellation.token.isCancellationRequested) { this.notifications.info(message); } else { this.notifications.error(message); }
		}
		finally { cancellation.dispose(); operation.dispose(); this.busy = false; this.changes.fire(); }
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
	private async resolveCli(provider: CliConfig['provider']): Promise<string | undefined> {
		const executable = this.config?.provider === provider ? this.config.executable : provider;
		const resolved = await this.code.resolveCli(executable);
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
		const executable = await this.quick.input({ title: localize('ade.ai.executable', "Original CLI Executable"), value: this.config?.provider === provider ? this.config.executable : provider, prompt: localize('ade.ai.executableHint', "Use the installed CLI name or its absolute executable path. Credentials remain with the provider."), ignoreFocusLost: true });
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
		if (this.busy || this.operations.busy || this.configuration.getValue<boolean>('chat.disableAIFeatures') === true) { return; }
		if (!await this.trust.requestWorkspaceTrust()) { return; }
		if (this.project.modelUri && !await this.project.save()) { return; }
		try {
			const native = this.codexAccount.account.status === 'signedIn' && this.setup.setups.some(setup => setup.agent === 'codex' && setup.download === 'ready') && !this.configuration.getValue<string>(AgentHostCodexAgentCodexHomeSettingId) && (!this.config || this.config.provider !== 'codex' || this.config.executable === 'codex');
			if (native) {
				await this.configuration.updateValue(AgentHostCodexAgentEnabledSettingId, true, ConfigurationTarget.USER);
				const widget = await this.chatWidgets.openSession(getNewChatSessionResource('agent-host-codex'), ChatViewPaneTarget);
				if (!widget) { throw new Error(localize('ade.ai.chatUnavailable', "Codex Chat Could Not Be Opened. Use AI Settings to Check the Connection.")); }
				if (this.project.modelUri) { await widget.attachmentModel.addFile(this.project.modelUri); }
				widget.setInputPlaceholder(localize('ade.ai.chatPlaceholder', "Ask Codex to Change the Diagram or Its Code…")); widget.focusInput();
			} else {
				const executable = await this.resolveCli('codex');
				if (!executable) { return; }
				const account = await this.code.checkCliAccount('codex', executable);
				if (account.status !== 'signedIn') { if (account.status === 'signedOut') { await this.signIn('codex', true); } else { await this.checkAccount('codex', executable); } return; }
				const model = this.config?.provider === 'codex' ? this.config.model : undefined;
				const prompt = localize('ade.ai.chatContext', "Help me work on this project's A.D.E diagrams and implementation. The model is {0}, active diagram: {1}. Preserve semantic IDs and valid model v3 references. Model edits appear in the visual editor; after code changes I will use Update Diagrams to reconcile them. I will describe the requested change next; do not edit files until I do.", this.project.modelUri?.fsPath ?? localize('ade.ai.noModelContext', "not created yet"), this.project.activeView?.name ?? this.project.model.name);
				await openAdeTerminal(this.terminals, this.terminalGroups, { name: localize('ade.ai.codexChat', "Codex Chat · Your Account"), executable, args: [...(model ? ['--model', model] : []), prompt], cwd: this.code.context?.sourceRoot ?? this.project.projectRoot, ...(this.configuration.getValue<string>(AgentHostCodexAgentCodexHomeSettingId) ? { env: { CODEX_HOME: this.configuration.getValue<string>(AgentHostCodexAgentCodexHomeSettingId) } } : {}) });
			}
			this.info(localize('ade.ai.chatReady', "Codex Is Open with Your Account and Project Context. After Code Changes, Choose Update Diagrams."));
		} catch (error) { this.notifications.error(localize('ade.ai.chatFailed', "Could Not Open Codex: {0}", error instanceof Error ? error.message : String(error))); }
	}

	async buildDiagrams(): Promise<void> { await this.generateDiagrams(false); }
	async resumeDiagrams(): Promise<void> { await this.generateDiagrams(true); }
	private async generateDiagrams(resume: boolean): Promise<void> {
		if (this.busy || this.operations.busy || !this.code.context || !await this.ensureConfigured()) { return; }
		await this.run(async token => {
			const context = this.code.context;
			const configured = await this.readyConfig();
			if (!configured || !context || !await this.project.save()) { return; }
			const diagramModel = this.storage.get(`ade.ai.diagramModel.${configured.provider}`, StorageScope.PROFILE) ?? await this.selectDiagramModel(configured);
			if (!diagramModel) { return; }
			const config = { ...configured, model: diagramModel };
			let clarification: string | undefined;
			if (resume && this.diagramProgress?.questions.length) { clarification = await this.quick.input({ title: localize('ade.ai.diagramClarify', "Clarify Diagram Interpretation"), prompt: this.diagramProgress.questions.join(' '), ignoreFocusLost: true }); if (!clarification) { return; } }
			let job: CodeDiagramProgress = JSON.parse(await this.code.executeReconciliation({ operation: 'diagramPrepare', snapshot: context.snapshot, config: JSON.stringify(config), ...(resume && this.diagramProgress ? { resume: this.diagramProgress.id } : {}), clarification }, token));
			this.diagramProgress = job; this.storage.store('ade.ai.diagramJob', JSON.stringify(job), StorageScope.WORKSPACE, StorageTarget.MACHINE); this.changes.fire();
			if (!config.maxCalls) { this.info(localize('ade.ai.diagramsNoBudget', "Diagram Scope Prepared. Enable AI Requests in AI Settings to Generate It.")); return; }
			const accepted = await this.dialogs.confirm({ message: localize('ade.ai.buildConfirm', "Build Semantic Diagrams with {0}?", config.model), detail: localize('ade.ai.buildScope', "{0} files and {1} indexed symbols; {4} additional documentation, binary or oversized files skipped. All symbols are processed in small batches, then composed into a system overview. Up to {2} additional requests; {3} already attempted. Source evidence is sent to your configured account. Code is kept intact and the previous model remains recoverable.", job.files, job.symbols, job.total - job.completed, job.calls, job.excluded), primaryButton: localize('ade.ai.buildButton', "Build Diagrams") });
			if (!accepted.confirmed) { return; }
			while (job.status === 'ready' || job.status === 'running') {
				this.report(localize('ade.ai.diagramStep', "Building Diagrams · {0} of {1} Steps · {2}", job.completed, job.total, job.model));
				job = JSON.parse(await this.code.executeReconciliation({ operation: 'diagramStep', snapshot: context.snapshot, id: job.id, reviewId: job.reviewId }, token));
				this.diagramProgress = job; this.storage.store('ade.ai.diagramJob', JSON.stringify(job), StorageScope.WORKSPACE, StorageTarget.MACHINE); this.changes.fire();
				if (job.context) { await this.code.openContext(job.context); this.info(localize('ade.ai.diagramsReady', "Diagrams Ready · All {0} Indexed Symbols Have a Semantic View", job.symbols)); return; }
				if (job.questions.length) { this.info(job.questions.join('\n')); return; }
			}
		});
	}

	async chooseDiagramModel(): Promise<void> {
		if (this.busy || this.operations.busy || !await this.ensureConfigured()) { return; }
		await this.selectDiagramModel(this.config!);
	}
	private async selectDiagramModel(configured: CliConfig): Promise<string | undefined> {
		const choices = this.nativeModels(configured.provider).sort((a, b) => (a.rates ? a.rates.input + a.rates.output : Infinity) - (b.rates ? b.rates.input + b.rates.output : Infinity));
		const model = choices.length ? (await this.quick.pick(choices, { title: localize('ade.ai.diagramModel', "Model for Diagrams"), placeHolder: localize('ade.ai.diagramModelHint', "Choose a Lower-Cost Model for Interpretation. Your Coding Model Is Kept Separately.") }))?.id : await this.quick.input({ title: localize('ade.ai.diagramModel', "Model for Diagrams"), value: this.storage.get(`ade.ai.diagramModel.${configured.provider}`, StorageScope.PROFILE) ?? configured.model, prompt: localize('ade.ai.diagramModelManual', "Enter a model available to your CLI account. This model is saved separately for diagram generation."), ignoreFocusLost: true });
		if (model) { this.storage.store(`ade.ai.diagramModel.${configured.provider}`, model, StorageScope.PROFILE, StorageTarget.MACHINE); }
		return model;
	}

	async implement(): Promise<void> {
		await this.collaborate('plan');
	}
	async interpret(): Promise<void> {
		await this.collaborate('interpret');
	}
	async reconcile(preview: CodePreview, resolutions: CodeResolution[] = [], direction?: 'model' | 'code'): Promise<CodePreview | undefined> {
		if (this.busy || this.operations.busy || !await this.ensureConfigured()) { return undefined; }
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
			const selected = direction && suggested.length > 0 && suggested.length <= 20 && !needsSourceReview ? suggested.map(file => ({ label: file.path })) : await this.quick.pick(preview.context.files.filter(file => file.status !== 'excluded' && file.status !== 'configuration').map(file => ({ label: file.path, picked: changed.has(file.path) })), { title: localize('ade.ai.reconcileSources', "Review Source Files for Bidirectional Sync"), placeHolder: localize('ade.ai.reconcileSourcesHint', "Select the affected implementation and callers in any language. Only bounded windows of selected files are sent."), canPickMany: true });
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

	async review(): Promise<void> { await this.run(async () => this.reviewCurrent()); }
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
	async apply(): Promise<void> { await this.changeSource(false); }
	async undo(): Promise<void> { await this.changeSource(true); }
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
	['ade.ai.chooseDiagramModel', localize2('ade.ai.diagramModelCommand', "Choose Diagram Model"), 'chooseDiagramModel'],
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
	['ade.ai.benchmark', localize2('ade.ai.benchmarkCommand', "A.D.E: Compare AI Models"), 'benchmark'],
	['ade.ai.benchmarkReconciliation', localize2('ade.ai.benchmarkReconciliationCommand', "A.D.E: Compare Reconciliation Models"), 'benchmarkReconciliation'],
	['ade.ai.exportBenchmark', localize2('ade.ai.exportBenchmarkCommand', "A.D.E: Export Model Benchmark Results"), 'exportBenchmark']
] as const) {
	registerAction2(class extends Action2 {
		constructor() { super({ id, title, f1: true }); }
		override run(accessor: ServicesAccessor): Promise<void> { return accessor.get(IAdeAiService)[method](); }
	});
}
