/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
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
import { ITerminalService } from '../../terminal/browser/terminal.js';
import { IChatWidgetService } from '../../chat/browser/chat.js';
import { getNewChatSessionResource } from '../../chat/common/model/chatUri.js';
import { IAdeProjectService, AdeProjectService } from '../browser/adeProjectService.js';
import { IAdeCodeService } from '../browser/adeCodeService.js';
import { IAdeAiService } from '../browser/adeAiService.js';
import { getModelImpact } from '../common/modelImpact.js';

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
	models: { candidate: { config: CliConfig; rates?: ModelRates }; eligible: boolean; estimatedConsumption: number | null; cases: { repository: string; passed: boolean; durationMs: number; inputTokens: number | null; outputTokens: number | null }[] }[];
}

/** Native shell: original provider login/CLI, explicit disclosure, staged diffs and recoverable application. */
export class AdeAiService extends Disposable implements IAdeAiService {
	declare readonly _serviceBrand: undefined;
	readonly available = true;
	private readonly changes = this._register(new Emitter<void>());
	readonly onDidChange = this.changes.event;
	busy = false;
	private config: CliConfig | undefined;
	private session: CollaborationSession | undefined;
	get status(): string {
		if (this.session) {
			const labels = { staged: localize('ade.ai.staged', "Changes Ready for Review"), passed: localize('ade.ai.passed', "Tests Passed · Ready to Apply"), failed: localize('ade.ai.failed', "Verification Failed · Changes Not Applied"), applied: localize('ade.ai.applied', "Applied · Undo Available"), undone: localize('ade.ai.undone', "Changes Undone") };
			return labels[this.session.status];
		}
		return this.config ? localize('ade.ai.selected', "{0} · {1}", this.config.provider === 'codex' ? 'Codex' : 'Claude Code', this.config.model) : localize('ade.ai.setup', "Connect Claude Code or Codex to Implement a Feature");
	}
	get canVerify(): boolean { return !!this.session && ['staged', 'failed', 'passed'].includes(this.session.status); }
	get canApply(): boolean { return this.session?.status === 'passed'; }
	get canUndo(): boolean { return this.session?.status === 'applied'; }

	constructor(
		@IAdeProjectService private readonly project: Pick<AdeProjectService, '_serviceBrand' | 'model' | 'save'>,
		@IAdeCodeService private readonly code: IAdeCodeService,
		@IQuickInputService private readonly quick: IQuickInputService,
		@INotificationService private readonly notifications: INotificationService,
		@IProgressService private readonly progress: IProgressService,
		@IDialogService private readonly dialogs: IDialogService,
		@IFileService private readonly files: IFileService,
		@IEditorService private readonly editors: IEditorService,
		@ITerminalService private readonly terminals: ITerminalService,
		@IChatWidgetService private readonly chatWidgets: IChatWidgetService,
		@ICodexAccountService private readonly codexAccount: ICodexAccountService,
		@IAgentSdkSetupService private readonly setup: IAgentSdkSetupService,
		@IAgentHostService private readonly agents: IAgentHostService,
		@IConfigurationService private readonly configuration: IConfigurationService,
		@IStorageService private readonly storage: IStorageService,
		@IWorkspaceTrustRequestService private readonly trust: IWorkspaceTrustRequestService
	) {
		super();
		const saved = storage.get('ade.ai.cliConfig', StorageScope.PROFILE);
		if (saved) { try { this.config = JSON.parse(saved); } catch { /* choose a connection again */ } }
		this._register(code.onDidChange(() => {
			if (this.session && code.context && this.session.root !== code.context.sourceRoot) { this.session = undefined; this.changes.fire(); }
		}));
	}

	private async request<T>(request: object, token = CancellationToken.None): Promise<T> {
		return JSON.parse(await this.code.executeCollaboration(JSON.stringify(request), token));
	}
	private async run(task: (token: CancellationToken) => Promise<void>): Promise<void> {
		if (this.busy || this.configuration.getValue<boolean>('chat.disableAIFeatures') === true) { return; }
		this.busy = true; this.changes.fire();
		const cancellation = new CancellationTokenSource();
		try {
			if (!await this.trust.requestWorkspaceTrust({ message: localize('ade.ai.trust', "A.D.E runs the original AI CLI and reviewed project tests on this computer.") })) { return; }
			await this.progress.withProgress({ location: ProgressLocation.Notification, title: localize('ade.ai.progress', "A.D.E Feature Implementation"), cancellable: true }, () => task(cancellation.token), () => cancellation.cancel());
		}
		catch (error) { if (!cancellation.token.isCancellationRequested) { this.notifications.error(localize('ade.ai.error', "A.D.E implementation: {0}", error instanceof Error ? error.message : String(error))); } }
		finally { cancellation.dispose(); this.busy = false; this.changes.fire(); }
	}
	private nativeModels(provider: CliConfig['provider']): { label: string; id: string; rates?: ModelRates }[] {
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

	async connect(): Promise<void> {
		if (this.busy || this.configuration.getValue<boolean>('chat.disableAIFeatures') === true) { return; }
		const selected = await this.quick.pick([{ label: 'Codex', provider: 'codex' as const }, { label: 'Claude Code', provider: 'claude' as const }], { title: localize('ade.ai.provider', "Choose AI CLI") });
		if (!selected) { return; }
		const provider = selected.provider;
		await this.configuration.updateValue(provider === 'codex' ? AgentHostCodexAgentEnabledSettingId : AgentHostClaudeAgentEnabledSettingId, true, ConfigurationTarget.USER);
		if (provider === 'codex') { await this.configuration.updateValue(CodexPreferAgentHostEditorSettingId, true, ConfigurationTarget.USER); }
		const action = await this.quick.pick([
			{ label: localize('ade.ai.login', "Sign In"), id: 'login' },
			{ label: localize('ade.ai.configure', "Choose Model and CLI"), id: 'configure' },
			{ label: localize('ade.ai.nativeChat', "Open Native Agent Chat"), id: 'chat' },
			{ label: localize('ade.ai.reload', "Refresh Account and Models"), id: 'reload' }
		], { title: selected.label });
		if (!action) { return; }
		if (action.id === 'login') {
			const nativeCodexLogin = provider === 'codex' && !this.configuration.getValue<string>(AgentHostCodexAgentCodexHomeSettingId) && (!this.config || this.config.provider !== 'codex' || this.config.executable === 'codex') && this.setup.setups.some(setup => setup.agent === 'codex' && setup.download === 'ready');
			if (nativeCodexLogin) { this.codexAccount.signIn(); }
			else if (provider === 'codex') { await this.terminals.createAndFocusTerminal({ config: { name: 'Codex Login', executable: this.config?.provider === 'codex' ? this.config.executable : 'codex', args: ['login'] } }); }
			else { await this.terminals.createAndFocusTerminal({ config: { name: 'Claude Code', executable: this.config?.provider === 'claude' ? this.config.executable : 'claude', args: ['auth', 'login'], cwd: this.code.context?.sourceRoot } }); }
			return;
		}
		if (action.id === 'reload') { this.setup.requestReload(provider); return; }
		if (action.id === 'chat') { await this.chatWidgets.openSession(getNewChatSessionResource('agent-host-' + provider)); return; }
		const choices = this.nativeModels(provider);
		let preferred: string | null = null;
		try {
			const measured: ModelBenchmark = JSON.parse(this.storage.get('ade.ai.benchmark', StorageScope.PROFILE) ?? '{}');
			const result = measured.models?.find(model => model.candidate.config.provider === provider && model.candidate.config.model === measured.defaultModel);
			const current = choices.find(model => model.id === measured.defaultModel);
			if (measured.kind === 'live-provider-benchmark' && result?.eligible && current?.rates && result.candidate.rates?.input === current.rates.input && result.candidate.rates.output === current.rates.output && Date.now() - Date.parse(measured.recordedAt) < 30 * 86400000) { preferred = measured.defaultModel; }
		} catch { /* no measured account default */ }
		choices.sort((left, right) => Number(right.id === preferred) - Number(left.id === preferred));
		const model = choices.length ? (await this.quick.pick(choices, { title: localize('ade.ai.model', "Choose a Model Available to Your Account") }))?.id
			: await this.quick.input({ title: localize('ade.ai.modelManual', "Model ID from Your CLI"), prompt: localize('ade.ai.noCatalog', "No account catalog is available yet. Sign in and refresh, or enter an exact model ID. Access is checked by the provider."), ignoreFocusLost: true });
		if (!model) { return; }
		const executable = await this.quick.input({ title: localize('ade.ai.executable', "Original CLI Executable"), value: provider, prompt: localize('ade.ai.executableHint', "Use the installed CLI name or its absolute executable path. Credentials remain with the provider."), ignoreFocusLost: true });
		if (!executable) { return; }
		const budget = await this.quick.pick([
			{ label: localize('ade.ai.budgetTwo', "Plan and Implementation · At Most Two Agent Runs"), maxCalls: 2 },
			{ label: localize('ade.ai.budgetOne', "Plan Only · At Most One Agent Run"), maxCalls: 1 },
			{ label: localize('ade.ai.budgetZero', "Prepare Context Only · No AI Requests"), maxCalls: 0 }
		], { title: localize('ade.ai.budget', "Agent Run Budget · Provider Usage Is Managed by Its CLI") });
		if (!budget) { return; }
		this.config = { version: 1, provider, connection: 'cli', model, executable, timeoutMs: 180000, maxContextBytes: 262144, maxCalls: budget.maxCalls };
		this.storage.store('ade.ai.cliConfig', JSON.stringify(this.config), StorageScope.PROFILE, StorageTarget.MACHINE);
		this.changes.fire();
	}

	async openCli(): Promise<void> {
		if (this.busy) { return; }
		if (!this.config) { await this.connect(); return; }
		if (this.configuration.getValue<boolean>('chat.disableAIFeatures') === true || !await this.trust.requestWorkspaceTrust()) { return; }
		const staged = this.session && ['staged', 'passed', 'failed'].includes(this.session.status) ? this.session.worktree : undefined;
		await this.terminals.createAndFocusTerminal({ config: { name: this.config.provider === 'codex' ? 'Codex' : 'Claude Code', executable: this.config.executable, args: ['--model', this.config.model], cwd: staged ?? this.code.context?.sourceRoot } });
	}

	async implement(): Promise<void> {
		await this.collaborate('plan');
	}
	async interpret(): Promise<void> {
		await this.collaborate('interpret');
	}
	private async collaborate(operation: 'plan' | 'interpret'): Promise<void> {
		if (!this.config) { await this.connect(); return; }
		await this.run(async token => {
			const context = this.code.context;
			if (!context || !this.project.model || !await this.project.save()) { throw new Error(localize('ade.ai.importFirst', "Save the model and import or Sync its Git codebase first.")); }
			const projectId = this.project.model.id;
			const saveCurrent = async (): Promise<boolean> => {
				if (this.code.context?.snapshot !== context.snapshot || this.project.model?.id !== projectId) { throw new Error(localize('ade.ai.contextChanged', "The active project changed. Prepare and review a new context.")); }
				return this.project.save();
			};
			const feature = await this.quick.pick(this.project.model.semantics.elements.filter(element => element.kind === 'feature').map(element => ({ label: element.name, id: element.id })), { title: localize('ade.ai.feature', "Implement Feature") });
			if (!feature) { return; }
			const intent = await this.quick.input({ title: localize('ade.ai.intent', "Requested Behavior"), prompt: localize('ade.ai.intentHint', "Describe the implementation change. Acceptance criteria come from the feature's behavioral contract."), ignoreFocusLost: true });
			if (!intent) { return; }
			const impact = getModelImpact(this.project.model, feature.id);
			const relatedIds = new Set([...impact.scope.map(element => element.id), ...impact.dependents.map(entry => entry.element.id)]);
			const suggested = new Set([...this.project.model.codeMappings.filter(mapping => relatedIds.has(mapping.elementId)).map(mapping => mapping.file), ...context.declarations.filter(declaration => relatedIds.has(declaration.id)).map(declaration => declaration.evidence.file)]);
			const selected = await this.quick.pick(context.files.filter(file => ['parsed', 'partial'].includes(file.status)).map(file => ({ label: file.path, picked: suggested.has(file.path) })), { title: localize('ade.ai.sources', "Review Source Files to Share · Suggested from Model Evidence"), canPickMany: true });
			if (!selected) { return; }
			const prepared = await this.request<PreparedReview>({ operation: 'prepare', config: this.config, request: { version: 1, snapshot: context.snapshot, featureId: feature.id, intent, constraints: [], sourceFiles: selected.map(file => file.label) } }, token);
			await this.editors.openEditor({ contents: JSON.stringify(prepared.context, null, '\t'), languageId: 'json', options: { pinned: true } });
			if (!this.config!.maxCalls) { return; }
			const consent = await this.dialogs.confirm({ message: localize('ade.ai.disclose', "Send the reviewed feature context to {0}?", this.config!.provider === 'codex' ? 'Codex' : 'Claude Code'), detail: localize('ade.ai.disclosure', "Includes the selected model elements, contracts, impact, source evidence and {0} selected files. The original CLI uses its own account and configuration. Review the open context before continuing.", selected.length), primaryButton: localize('ade.ai.send', "Send Context") });
			if (!consent.confirmed) { return; }
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
			if (this.config!.maxCalls < 2) { return; }
			const accepted = await this.dialogs.confirm({ message: proposal.plan.summary, detail: proposal.plan.changes.map(change => `${change.kind}: ${change.file} · ${change.reason}`).join('\n'), primaryButton: localize('ade.ai.generate', "Generate in Worktree") });
			if (!accepted.confirmed) { return; }
			if (!await saveCurrent()) { return; }
			this.session = await this.request<CollaborationSession>({ operation: 'stage', prepared, plan: proposal.plan, reviewId: proposal.planId }, token);
			this.storage.store('ade.ai.session', JSON.stringify({ root: this.session.root, id: this.session.id }), StorageScope.WORKSPACE, StorageTarget.MACHINE);
			await this.review();
		});
	}

	async review(): Promise<void> {
		if (!this.session) { return; }
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
		await this.run(async token => {
			if (!this.session) { return; }
			const consent = await this.dialogs.confirm({ message: localize('ade.ai.runTests', "Run the Reviewed Tests in the Worktree?"), detail: localize('ade.ai.runTestsDetail', "Node.js runs the generated test files on this computer. The main project stays unchanged."), primaryButton: localize('ade.ai.verify', "Run Tests") });
			if (!consent.confirmed) { return; }
			this.session = await this.request<CollaborationSession>({ operation: 'verify', root: this.session.root, id: this.session.id, reviewId: this.session.reviewId }, token);
			await this.review();
		});
	}
	async apply(): Promise<void> { await this.changeSource(false); }
	async undo(): Promise<void> { await this.changeSource(true); }
	private async changeSource(undo: boolean): Promise<void> {
		if (undo ? !this.canUndo : !this.canApply) { return; }
		await this.run(async token => {
			if (!this.session) { return; }
			if (this.code.context?.sourceRoot !== this.session.root) { throw new Error(localize('ade.ai.wrongProject', "Open the code project associated with this implementation before changing its source files.")); }
			const consent = await this.dialogs.confirm({ message: undo ? localize('ade.ai.undo', "Undo This Implementation?") : localize('ade.ai.apply', "Apply the Verified Changes to the Project?"), detail: this.session.generated.summary, primaryButton: undo ? localize('ade.ai.undoButton', "Undo Implementation") : localize('ade.ai.applyButton', "Apply Changes") });
			if (!consent.confirmed) { return; }
			if (!undo && !await this.project.save()) { return; }
			this.session = await this.request<CollaborationSession>({ operation: undo ? 'undo' : 'apply', root: this.session.root, id: this.session.id, reviewId: this.session.reviewId }, token);
		});
	}
	async resume(): Promise<void> {
		await this.run(async token => {
			const saved = this.storage.get('ade.ai.session', StorageScope.WORKSPACE);
			if (!saved) { this.notifications.info(localize('ade.ai.noSession', "No A.D.E implementation session is saved for this workspace.")); return; }
			const request: { root: string; id: string } = JSON.parse(saved);
			this.session = await this.request<CollaborationSession>({ ...request, operation: 'session' }, token);
			await this.review();
		});
	}
	async recover(): Promise<void> {
		await this.run(async token => {
			const saved = this.storage.get('ade.ai.session', StorageScope.WORKSPACE);
			if (!saved) { return; }
			const request: { root: string; id: string } = JSON.parse(saved);
			this.session = await this.request<CollaborationSession>({ ...request, operation: 'recover' }, token);
		});
	}
	async benchmark(): Promise<void> {
		if (!this.config) { await this.connect(); return; }
		if (this.config.maxCalls < 2) { this.notifications.info(localize('ade.ai.benchmarkBudget', "The complete benchmark requires the saved two-request budget for each sample. Configure that budget first.")); return; }
		await this.run(async token => {
			const config = this.config!;
			const models = this.nativeModels(config.provider);
			const alternatives = models.filter(model => model.id !== config.model);
			const alternative = alternatives.length ? (await this.quick.pick(alternatives, { title: localize('ade.ai.compareModel', "Choose the Model to Compare") }))?.id
				: await this.quick.input({ title: localize('ade.ai.compareModel', "Choose the Model to Compare"), prompt: localize('ade.ai.compareExact', "Enter an exact model ID available to the same CLI account."), ignoreFocusLost: true });
			if (!alternative || alternative === config.model) { return; }
			const consent = await this.dialogs.confirm({ message: localize('ade.ai.benchmarkConfirm', "Compare These Models on Three Sample Projects?"), detail: localize('ade.ai.benchmarkDetail', "Compares checkout, inventory and authorization in separate Git worktrees. Starts up to twelve agent runs and executes generated Node.js tests with independent acceptance checks on this computer. Only sample code is sent. Provider requests and retries within each run are managed by the original CLI; actual monetary charges may be unavailable."), primaryButton: localize('ade.ai.benchmarkRun', "Run Model Benchmark") });
			if (!consent.confirmed) { return; }
			const candidates = [config.model, alternative].map(model => ({ config: { ...config, model }, rates: models.find(candidate => candidate.id === model)?.rates }));
			const report = await this.request<ModelBenchmark>({ operation: 'benchmark', candidates }, token);
			this.storage.store('ade.ai.benchmark', JSON.stringify(report), StorageScope.PROFILE, StorageTarget.MACHINE);
			const summary = report.models.map(model => `${model.candidate.config.model}\n${model.cases.map(result => `${result.repository}: ${result.passed ? localize('ade.ai.benchmarkPass', "Passed") : localize('ade.ai.benchmarkFail', "Failed")} · ${result.durationMs} ms`).join('\n')}`).join('\n\n');
			await this.editors.openEditor({ contents: summary + '\n\n' + (report.defaultModel ? localize('ade.ai.benchmarkDefault', "Measured economical default: {0}. It is offered first in model selection while available with the same quoted rates.", report.defaultModel) : localize('ade.ai.benchmarkNoDefault', "No economical default was selected. Quality, account availability and comparable quoted consumption must all be known. Your explicit model selection is preserved.")), languageId: 'plaintext', options: { pinned: true } });
		});
	}
	async exportBenchmark(): Promise<void> {
		const report = this.storage.get('ade.ai.benchmark', StorageScope.PROFILE);
		if (!report) { this.notifications.info(localize('ade.ai.noBenchmark', "Run a model benchmark before exporting its measured results.")); return; }
		await this.editors.openEditor({ contents: JSON.stringify(JSON.parse(report), null, '\t'), languageId: 'json', options: { pinned: true } });
	}
}
registerSingleton(IAdeAiService, AdeAiService, InstantiationType.Delayed);

for (const [id, title, method] of [
	['ade.ai.connect', localize2('ade.ai.connectCommand', "A.D.E: Connect Claude Code or Codex"), 'connect'],
	['ade.ai.cli', localize2('ade.ai.cliCommand', "A.D.E: Open AI CLI"), 'openCli'],
	['ade.ai.implement', localize2('ade.ai.implementCommand', "A.D.E: Implement Feature"), 'implement'],
	['ade.ai.interpret', localize2('ade.ai.interpretCommand', "A.D.E: Interpret Unresolved Evidence"), 'interpret'],
	['ade.ai.review', localize2('ade.ai.reviewCommand', "A.D.E: Review Implementation"), 'review'],
	['ade.ai.verify', localize2('ade.ai.verifyCommand', "A.D.E: Verify Implementation"), 'verify'],
	['ade.ai.apply', localize2('ade.ai.applyCommand', "A.D.E: Apply Verified Implementation"), 'apply'],
	['ade.ai.undo', localize2('ade.ai.undoCommand', "A.D.E: Undo Implementation"), 'undo'],
	['ade.ai.resume', localize2('ade.ai.resumeCommand', "A.D.E: Resume Implementation"), 'resume'],
	['ade.ai.recover', localize2('ade.ai.recoverCommand', "A.D.E: Recover Interrupted Implementation"), 'recover'],
	['ade.ai.benchmark', localize2('ade.ai.benchmarkCommand', "A.D.E: Compare AI Models"), 'benchmark'],
	['ade.ai.exportBenchmark', localize2('ade.ai.exportBenchmarkCommand', "A.D.E: Export Model Benchmark Results"), 'exportBenchmark']
] as const) {
	registerAction2(class extends Action2 {
		constructor() { super({ id, title, f1: true }); }
		override run(accessor: ServicesAccessor): Promise<void> { return accessor.get(IAdeAiService)[method](); }
	});
}
