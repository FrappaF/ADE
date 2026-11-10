/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type StructuralProjectSession as StructuralSession } from '../common/modelProject.js';
import { localize, localize2 } from '../../../../nls.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../base/common/event.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IAdeProjectService, AdeProjectService } from '../browser/adeProjectService.js';
import { IAdeCodeService } from '../browser/adeCodeService.js';
import { IAdeAiService, type AdeDiagramReview } from '../browser/adeAiService.js';
import { IAdeOperationService, AdeOperationService } from '../browser/adeOperationService.js';
import { CodePreview, CodeResolution, CodeDiagramProgress, CodeDiagramExploration } from '../common/codeBridge.js';
import { type AdeAiWorkflow, type AdeAiRunOptions } from './adeAiTypes.js';
import { AdeAiConnection } from './adeAiConnection.js';
import { AdeAiDiagrams } from './adeAiDiagrams.js';
import { AdeAiStructural } from './adeAiStructural.js';
import { AdeAiImplementation } from './adeAiImplementation.js';

/** Coordinates independent ADE AI workflows through one native service boundary. */
export class AdeAiService extends Disposable implements IAdeAiService {
	declare readonly _serviceBrand: undefined;

	readonly available = true;

	private readonly changes = this._register(new Emitter<void>());

	readonly onDidChange = this.changes.event;

	busy = false;

	get diagramReview(): AdeDiagramReview | undefined { return this.diagrams.diagramReview; }

	private activityStatus: string | undefined;

	get generatingDiagrams(): boolean { return this.diagrams.generatingDiagrams; }

	get workflowStatus(): string | undefined { return this.activityStatus; }

	get chatLocation(): 'chat' | 'terminal' | undefined { return this.diagrams.chatLocation; }

	get connectionStatus(): string { return this.connection.connectionStatus; }

	get diagramProgress(): CodeDiagramProgress | undefined { return this.diagrams.diagramProgress; }

	get diagramExploration(): CodeDiagramExploration | undefined { return this.diagrams.diagramExploration; }

	get structuralProblem(): string | undefined { return this.structural.structuralProblem; }

	get structuralReview(): StructuralSession | undefined { return this.structural.structuralReview; }

	get continuityStatus(): string { return this.structural.continuityStatus; }

	async configureContinuity(): Promise<void> { return this.structural.configureContinuity(); }

	get status(): string { return this.structural.status ?? this.activityStatus ?? (this.implementation.session ? this.implementation.status : this.connection.status); }

	get canVerify(): boolean { return this.structural.canVerify || this.implementation.canVerify; }

	get canApply(): boolean { return this.structural.canApply || this.implementation.canApply; }

	get canUndo(): boolean { return this.structural.canUndo || this.implementation.canUndo; }

	private report(message: string): void { this.activityStatus = message; this.changes.fire(); }

	private info(message: string): void { this.report(message); this.notifications.info(message); }

	private async request<T>(request: { operation: string;[key: string]: unknown }, token = CancellationToken.None): Promise<T> {
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

	private async run(task: (token: CancellationToken) => Promise<void>, options: AdeAiRunOptions = {}): Promise<void> {
		const diagramJob = options.kind === 'diagram', local = options.kind === 'local', review = options.review;
		if (!local && this.configuration.getValue<boolean>('chat.disableAIFeatures') === true) { this.info(localize('ade.ai.disabled', "AI Features Are Disabled in Settings.")); return; }
		const operation = this.operations.acquire('ai');
		if (this.busy || !operation) { operation?.dispose(); this.notifications.info(localize('ade.ai.busy', "An A.D.E operation is already running. Wait for it to finish or cancel it before starting another.")); return; }
		if (diagramJob) { this.diagrams.beginGeneration(); }
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
			this.report(message); if (cancellation.token.isCancellationRequested) { if (!diagramJob) { this.notifications.info(message); } } else if (review && this.diagrams.diagramReview === review && review.problem) { /* The active review owns this recoverable error. */ } else if (diagramJob) { this.diagrams.failGeneration(message); } else { this.notifications.error(message); }
		}
		finally { cancellation.dispose(); operation.dispose(); this.busy = false; this.diagrams.finishOperation(); this.changes.fire(); }
	}

	async refreshConnection(): Promise<void> { return this.connection.refreshConnection(); }

	async connect(): Promise<void> { return this.connection.connect(); }

	async openCli(): Promise<void> { return this.connection.openCli(); }

	async chat(): Promise<void> { return this.diagrams.chat(); }

	async returnToDiagrams(): Promise<void> { return this.diagrams.returnToDiagrams(); }

	async configureDiagramBudget(): Promise<void> { return this.diagrams.configureDiagramBudget(); }

	async reviewDiagramProposal(id?: string): Promise<void> { return this.diagrams.reviewDiagramProposal(id); }

	closeDiagramReview(): void { return this.diagrams.closeDiagramReview(); }

	async inspectDiagramReview(): Promise<void> { return this.diagrams.inspectDiagramReview(); }

	async applyDiagramReview(): Promise<void> { return this.diagrams.applyDiagramReview(); }

	async buildDiagrams(): Promise<void> { return this.diagrams.buildDiagrams(); }

	async resumeDiagrams(): Promise<void> { return this.diagrams.resumeDiagrams(); }

	async chooseDiagramModel(): Promise<void> { return this.diagrams.chooseDiagramModel(); }

	async implement(): Promise<void> {
		if ((this.project.model.version === 4 || this.project.model.version === 5)) { await this.structural.preparePureProject('forward'); return; }
		this.structural.clear(); await this.implementation.collaborate('plan');
	}

	async structuralReverse(): Promise<void> { return this.structural.structuralReverse(); }

	async movePureSource(): Promise<void> { return this.structural.movePureSource(); }

	async structuralTechnicalReview(): Promise<void> { return this.structural.structuralTechnicalReview(); }

	async structuralResume(): Promise<void> { return this.structural.structuralResume(); }

	async structuralRecover(): Promise<void> { return this.structural.structuralRecover(); }

	async simulateStates(): Promise<void> { return this.structural.simulateStates(); }

	async editPureCriteria(): Promise<void> { return this.structural.editPureCriteria(); }

	async interpret(): Promise<void> { return this.implementation.interpret(); }

	async reconcile(preview: CodePreview, resolutions: CodeResolution[] = [], direction?: 'model' | 'code'): Promise<CodePreview | undefined> { return this.implementation.reconcile(preview, resolutions, direction); }

	async review(): Promise<void> { await this.run(async () => this.structural.structuralReview ? this.structural.reviewPureProject() : this.implementation.reviewCurrent()); }

	async verify(): Promise<void> {
		if (this.structural.structuralReview) { await this.structural.runPureAction('structuralVerify'); return; }
		await this.implementation.verify();
	}

	async apply(): Promise<void> { if (this.structural.structuralReview) { await this.structural.runPureAction('structuralApply'); return; } await this.implementation.changeSource(false); }

	async undo(): Promise<void> { if (this.structural.structuralReview) { await this.structural.runPureAction('structuralUndo'); return; } await this.implementation.changeSource(true); }

	async resume(): Promise<void> { return this.implementation.resume(); }

	async recover(): Promise<void> { return this.implementation.recover(); }

	async benchmark(): Promise<void> { return this.implementation.benchmark(); }

	async benchmarkReconciliation(): Promise<void> { return this.implementation.benchmarkReconciliation(); }

	async exportBenchmark(): Promise<void> { return this.implementation.exportBenchmark(); }

	private readonly connection: AdeAiConnection;

	private readonly diagrams: AdeAiDiagrams;

	private readonly structural: AdeAiStructural;

	private readonly implementation: AdeAiImplementation;

	constructor(
		@IAdeProjectService private readonly project: Pick<AdeProjectService, '_serviceBrand' | 'model' | 'save' | 'saveError' | 'projectRoot' | 'modelUri' | 'activeView' | 'onDidChange' | 'revert' | 'editable' | 'error'>,
		@IAdeCodeService private readonly code: IAdeCodeService,
		@INotificationService private readonly notifications: INotificationService,
		@IProgressService private readonly progress: IProgressService,
		@IConfigurationService private readonly configuration: IConfigurationService,
		@IWorkspaceTrustRequestService private readonly trust: IWorkspaceTrustRequestService,
		@IAdeOperationService private readonly operations: AdeOperationService,
		@IInstantiationService instantiation: IInstantiationService
	) {
		super();
		const self = this;
		const workflow: AdeAiWorkflow = {
			get busy() { return self.busy; }, set busy(value) { self.busy = value; },
			get activityStatus() { return self.activityStatus; }, set activityStatus(value) { self.activityStatus = value; },
			changed: () => this.changes.fire(), report: message => this.report(message), info: message => this.info(message),
			request: (request, token) => this.request(request, token), run: (task, options) => this.run(task, options),
			clearImplementation: () => { this.implementation.clear(); }, buildDiagrams: () => this.diagrams.buildDiagrams(),
			get reviewSession() { return self.implementation.session; }
		};
		this.connection = this._register(instantiation.createInstance(AdeAiConnection, workflow));
		this.diagrams = this._register(instantiation.createInstance(AdeAiDiagrams, workflow, this.connection));
		this.structural = this._register(instantiation.createInstance(AdeAiStructural, workflow));
		this.implementation = this._register(instantiation.createInstance(AdeAiImplementation, workflow, this.connection));

		let projectId = project.model.id;
		this._register(project.onDidChange(() => {
			if (projectId !== project.model.id) { this.structural.resetProject(); this.diagrams.resetProject(); projectId = project.model.id; }
			this.structural.updateContinuity();
			if (!this.busy) { this.activityStatus = undefined; this.changes.fire(); }
		}));
		this._register(code.onDidChange(() => {
			this.diagrams.followCodeContext();
			this.implementation.followCodeContext();
		}));

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
