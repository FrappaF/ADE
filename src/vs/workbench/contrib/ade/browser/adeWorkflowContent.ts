/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import * as dom from '../../../../base/browser/dom.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { isSourceEvidenceModel } from '../common/modelFoundation.js';
import { IAdeCodeService } from './adeCodeService.js';
import { IAdeAiService } from './adeAiService.js';
import { AdeProjectService } from './adeProjectService.js';
import { AdeControls } from './adeControls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { viewLabels } from './adeLabels.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { getDiagramExplorationPhase } from '../common/diagramExplorationState.js';
import { type CodeDiagramExploration } from '../common/codeBridge.js';

interface AdeWorkflowContentHost {
	paragraph(parent: HTMLElement, content: string): void;
	button(parent: HTMLElement, label: string, action: () => void, id?: string): HTMLButtonElement;
	documentStatus(): string;
	readonly root: HTMLElement;
	showReview(): void;
}

/** Renders AI workflow, settings and secondary tools for the ADE editor. */
export class AdeWorkflowContent {
	private group(parent: HTMLElement, title: string, description?: string): HTMLElement {
		const section = dom.append(parent, dom.$('section.ade-action-group'));
		dom.append(section, dom.$('h2')).textContent = title;
		if (description) { this.host.paragraph(section, description); }
		return dom.append(section, dom.$('div.ade-action-list'));
	}

	private renderExplorationDiagnostics(parent: HTMLElement, proposal: CodeDiagramExploration['proposals'][number]): void {
		const inferredOrder = (diagnostic: typeof proposal.diagnostics[number]) => diagnostic.code === 'contract' && diagnostic.args[0] === 'fidelity' && diagnostic.args[1] === 'inferredOrder';
		const inferred = proposal.diagnostics.filter(inferredOrder).length;
		if (inferred) { this.host.paragraph(parent, localize('ade.explore.inferredOrder', "Inferred Ordering Constraints: {0}. Review the Source Evidence; Runtime Behavior Has Not Been Verified.", inferred)); }
		for (const diagnostic of proposal.diagnostics.filter(diagnostic => !inferredOrder(diagnostic))) { this.host.paragraph(parent, `${diagnostic.code} · ${diagnostic.path} · ${diagnostic.args.join(' · ')}`); }
		if (inferred) {
			const technical = this.controls.details(parent, localize('ade.explore.diagnosticDetails', "Diagnostic Details ({0})", proposal.diagnostics.length), `proposal-diagnostics:${proposal.id}`);
			for (const diagnostic of proposal.diagnostics) { this.host.paragraph(technical, `${diagnostic.code} · ${diagnostic.path} · ${diagnostic.args.join(' · ')}`); }
		}
	}

	renderAiSettings(parent: HTMLElement): void {
		dom.append(parent, dom.$('h1')).textContent = localize('ade.ai.settings', "AI Settings");
		if (!this.ai.available || this.configurationService.getValue<boolean>('chat.disableAIFeatures') === true) {
			this.host.paragraph(parent, localize('ade.ai.disabled', "AI Features Are Disabled in Settings.")); return;
		}
		const account = this.group(parent, localize('ade.ai.account', "Account and Model"), this.ai.connectionStatus);
		for (const [label, action] of [
			[localize('ade.ai.diagramModel', "Choose Diagram Model"), () => this.ai.chooseDiagramModel()],
			[localize('ade.ai.connectButton', "Connect Claude Code or Codex"), () => this.ai.connect()],
			[localize('ade.ai.refresh', "Refresh Account and Models"), () => this.ai.refreshConnection()]
		] as const) { this.host.button(account, label, () => { void action().catch(error => this.notifications.error(String(error.message ?? error))); }).disabled = this.ai.busy || this.code.busy; }
		const requests = this.group(parent, localize('ade.ai.requestSettings', "AI Requests"), this.ai.requestStatus);
		this.host.button(requests, localize('ade.ai.requestBudget', "Configure AI Request Budget"), () => { void this.ai.configureRequestBudget().catch(error => this.notifications.error(String(error.message ?? error))); }).disabled = this.ai.busy || this.code.busy;
		this.host.paragraph(requests, localize('ade.ai.requestBudgetHint', "Changing This Budget Sends No Request. Project Exploration Has a Separate Budget."));
		const budget = this.group(parent, localize('ade.ai.generationSettings', "Diagram Generation"), localize('ade.ai.generationSettingsHint', "Control How Much Source the Assistant Can Explore While Preparing Diagrams."));
		this.host.button(budget, localize('ade.explore.adjustBudget', "Add Exploration Budget"), () => { void this.ai.configureDiagramBudget(); }).disabled = this.ai.busy || !this.ai.diagramExploration;
		if (!this.ai.diagramExploration) { this.host.paragraph(budget, localize('ade.explore.initializeBudget', "Open Architecture Exploration to Initialize a Project Budget. No AI Request Is Sent Until You Send a Message.")); }
		const advanced = this.controls.details(parent, localize('ade.ai.advancedSettings', "Advanced · Model Benchmarks"), 'ai-benchmarks');
		for (const [label, action] of [
			[localize('ade.ai.benchmarkButton', "Compare AI Models"), () => this.ai.benchmark()],
			[localize('ade.ai.reconciliationBenchmarkButton', "Compare Reconciliation Models"), () => this.ai.benchmarkReconciliation()],
			[localize('ade.ai.exportButton', "Export Model Benchmark Results"), () => this.ai.exportBenchmark()]
		] as const) { this.host.button(advanced, label, () => { void action().catch(error => this.notifications.error(String(error.message ?? error))); }).disabled = this.ai.busy || this.code.busy; }
	}

	renderWorkflow(parent: HTMLElement, history = false): void {
		if (this.ai.structuralProblem) {
			const issue = dom.append(parent, dom.$('section.ade-structural-review')); issue.setAttribute('role', 'alert');
			this.host.paragraph(issue, localize('ade.review.resolve', "Model and Code Need Review Before Applying")); this.host.paragraph(issue, this.ai.structuralProblem);
			this.host.button(issue, localize('ade.review.revise', "Review Specification and Constraints"), () => { void this.commandService.executeCommand('ade.blueprint'); });
			this.host.button(issue, localize('ade.task.edit', "Tasks and Clarifications"), () => { void this.commandService.executeCommand('ade.taskIntent'); });
		}
		if (!this.code.context || !this.ai.available || this.configurationService.getValue<boolean>('chat.disableAIFeatures') === true) { return; }
		const exploration = this.ai.diagramExploration;
		if (this.configurationService.getValue<boolean>('ade.diagramImport.incremental') !== false && (exploration || this.code.context.diagramState === 'index')) {
			const phase = getDiagramExplorationPhase(exploration);
			if (phase === 'applied' && !history) { return; }
			const panel = dom.append(parent, dom.$('section.ade-workflow'));
			panel.setAttribute('aria-label', localize('ade.explore.title', "Architecture Exploration"));
			dom.append(panel, dom.$('h2')).textContent = localize('ade.explore.title', "Architecture Exploration");
			this.host.paragraph(panel, phase === 'applied' ? localize('ade.explore.allApplied', "All Diagram Changes Applied. Your Diagrams Are Ready to Explore.") : exploration ? localize('ade.explore.saved', "Plan and Generate the Project Diagrams, Then Review All Changes") : localize('ade.explore.inventoryReady', "Source Inventory Ready · Plan the Project Diagrams with Codex"));
			if (phase !== 'applied' && phase !== 'review') { const resume = this.host.button(panel, exploration ? exploration.workflow === 'project' ? localize('ade.explore.continueProject', "Continue Generation") : localize('ade.explore.continue', "Continue Exploration") : localize('ade.explore.start', "Explore Architecture"), () => { void this.ai.resumeDiagrams(); }); resume.disabled = this.ai.busy || this.code.busy; resume.classList.add('ade-primary-action'); }
			if (exploration) {
				if (exploration.invalidation?.viewIds.length) { this.host.paragraph(panel, localize('ade.explore.staleViews', "{0} Diagrams Have Changed Source Evidence · Review the Affected Scenarios", exploration.invalidation.viewIds.length)); }
				const usage = this.controls.details(panel, localize('ade.explore.usageDetails', "Exploration Usage"), 'exploration-usage');
				this.host.paragraph(usage, localize('ade.explore.usage', "{0}/{1} Local Tool Calls · {2}/{3} KiB Retrieved", exploration.usage.toolCalls, exploration.budget.maxToolCalls, Math.ceil(exploration.usage.readBytes / 1024), Math.ceil(exploration.budget.maxReadBytes / 1024)));
				if (exploration.budgetWindow) {
					const time = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
					this.host.paragraph(usage, localize('ade.explore.budgetTime', "Current Budget Window (min:sec): {0} Used · {1} Remaining at Last Refresh", time(exploration.budgetWindow.elapsedMs), time(exploration.budgetWindow.remainingMs)));
				} else { this.host.paragraph(usage, localize('ade.explore.budgetTimeUnknown', "Budget Time Is Not Available from This Engine.")); }
				this.host.paragraph(usage, exploration.usage.turnsObservable ? localize('ade.explore.reportedTurns', "Reported Request Turns: {0}/{1}. Internal Turns and Tokens Are Not Reported.", exploration.usage.modelTurns.length, exploration.budget.maxModelTurns) : localize('ade.explore.unreportedUsage', "Provider Turns and Token Usage Are Not Reported by This Connection."));
				if (exploration.workflow === 'project') {
					if (phase !== 'applied') {
						const review = this.host.button(panel, localize('ade.explore.reviewAll', "Review All Changes"), () => { void this.ai.reviewDiagramProposal(); }, 'project-review');
						review.disabled = this.ai.busy || this.code.busy || !exploration.proposals.some(proposal => proposal.status !== 'applied');
						review.classList.toggle('ade-primary-action', phase === 'review');
					}
					if (exploration.plan) {
						const plan = phase === 'applied' ? this.controls.details(panel, localize('ade.explore.plan', "Diagram Plan"), 'exploration-plan') : panel;
						if (phase !== 'applied') { dom.append(plan, dom.$('h3')).textContent = localize('ade.explore.plan', "Diagram Plan"); }
						const list = dom.append(plan, dom.$('ol'));
						for (const item of exploration.plan.items) {
							const task = exploration.tasks.find(task => task.id === item.id);
							const status = task?.status === 'ready' ? localize('ade.explore.generated', "Draft Prepared") : task?.status === 'applied' ? localize('ade.explore.applied', "Applied") : task?.status === 'cancelled' ? localize('ade.explore.excluded', "Excluded") : task?.status === 'running' ? localize('ade.explore.running', "Generating") : localize('ade.explore.pending', "Pending");
							const row = dom.append(list, dom.$('li'));
							row.textContent = `${item.name} · ${viewLabels[item.viewKind]} · ${status}`;
							const parent = exploration.plan.items.find(parent => parent.id === item.parentId);
							if (parent) { dom.append(row, dom.$('p.ade-supporting-text')).textContent = localize('ade.explore.planParent', "Detail of {0}", parent.name); }
							if (task?.gaps.length) { dom.append(row, dom.$('p.ade-supporting-text')).textContent = localize('ade.explore.notesSummary', "Coverage Notes: {0}. Open Exploration Goals and Gaps for Details.", task.gaps.length); }
							const proposal = exploration.proposals.find(proposal => proposal.id === task?.proposalId);
							if (proposal) { this.renderExplorationDiagnostics(row, proposal); }
						}
					} else { this.host.paragraph(panel, localize('ade.explore.planning', "The Agent Will Plan the Relevant Diagram Types Before Preparing the Drafts.")); }
					if (exploration.batch?.blockers.length) { this.host.paragraph(panel, localize('ade.explore.incomplete', "Generation Is Incomplete. Continue to Resolve Pending Diagrams or Record Explicit Exclusions Before Applying All Changes.")); }
				}
				const plannedProposals = new Set(exploration.tasks.map(task => task.proposalId).filter(Boolean));
				for (const proposal of exploration.proposals.filter(entry => entry.status !== 'applied' && (exploration.workflow !== 'project' || !plannedProposals.has(entry.id)))) {
					const details = dom.append(panel, dom.$('section.ade-proposal-summary'));
					dom.append(details, dom.$('h3')).textContent = proposal.views.map(view => view.name).join(', ') || localize('ade.explore.untitledDraft', "Diagram Draft");
					this.host.paragraph(details, proposal.status === 'ready' ? localize('ade.explore.draftReady', "Draft Ready for Review") : localize('ade.explore.draftBlocked', "Draft Needs Correction · Other Diagrams Remain Available"));
					this.renderExplorationDiagnostics(details, proposal);
					if (exploration.workflow !== 'project') { const review = this.host.button(details, localize('ade.explore.reviewDraft', "Review Draft"), () => { void this.ai.reviewDiagramProposal(proposal.id); }, `proposal-review:${proposal.id}`); review.disabled = this.ai.busy || this.code.busy; review.classList.toggle('ade-primary-action', phase === 'review'); }
				}
				const tasks = this.controls.details(panel, localize('ade.explore.goals', "Exploration Goals and Gaps"), 'exploration-goals');
				for (const task of exploration.tasks) { this.host.paragraph(tasks, task.intent); for (const gap of task.gaps) { this.host.paragraph(tasks, gap); } }
				this.host.button(tasks, localize('ade.explore.adjustBudget', "Add Exploration Budget"), () => { void this.ai.configureDiagramBudget(); });
				this.host.paragraph(tasks, localize('ade.explore.coverage', "Inventory, Analyzer Coverage and Explored Responsibilities Are Separate. An Unexplored Area Is Not a Verified Absence."));
			}
			return;
		}
		const progress = this.ai.diagramProgress;
		const pending = progress && progress.status !== 'complete';
		if (this.code.context.diagramState === 'index' || pending) {
			const banner = dom.append(parent, dom.$('section.ade-workflow'));
			banner.setAttribute('aria-label', localize('ade.diagramImport', "Build Diagrams"));
			const active = !!pending && this.ai.generatingDiagrams;
			const started = !!pending && (progress.calls > 0 || progress.completed > 0 || progress.status === 'failed' || progress.status === 'questions');
			const nextDiagram = progress?.plan?.find(item => item.status !== 'complete');
			this.host.paragraph(banner, pending && progress.status === 'plan' ? localize('ade.diagramPlanReady', "Diagram Plan Ready · {0} Proposed Views", progress.plan?.length ?? 0) : active && nextDiagram ? localize('ade.diagramViewRunning', "Generating {0} · {1} of {2} Diagrams Ready", nextDiagram.name, progress.plan!.filter(item => item.status === 'complete').length, progress.plan!.length) : active ? localize('ade.diagramPlanning', "Analyzing Code and Planning Diagrams · {0} of {1} Steps", progress.completed, progress.total) : pending && progress.status === 'failed' ? localize('ade.diagramPaused', "Diagram Generation Paused · {0} of {1} Steps Completed", progress.completed, progress.total) : pending && !started ? localize('ade.diagramReady', "Ready to Propose Diagrams") : pending ? localize('ade.diagramProgress', "Build Diagrams · {0} of {1} Steps Completed · {2}", progress.completed, progress.total, progress.model) : localize('ade.indexReady', "Source Evidence Ready · Create Capability and Flow Diagrams with AI"));
			if (pending && progress.plan?.length) {
				const details = this.controls.details(banner, localize('ade.diagramPlanDetails', "Diagram Plan and Steps"), 'diagram-plan');
				const list = dom.append(details, dom.$('ol.ade-diagram-plan'));
				for (const item of progress.plan) {
					const row = dom.append(list, dom.$('li'));
					const label = dom.append(row, dom.$('span'));
					label.textContent = localize('ade.diagramPlanItem', "{0} · {1} · {2}", item.name, viewLabels[item.kind], item.status === 'complete' ? localize('ade.diagramStepComplete', "Ready") : active && item === nextDiagram ? localize('ade.diagramStepRunning', "Generating") : localize('ade.diagramStepPending', "Pending"));
					this.host.paragraph(row, item.intent);
				}
			}

			if (active) {
				const meter = dom.append(banner, dom.$('progress'));
				meter.setAttribute('max', String(progress.total)); meter.setAttribute('value', String(progress.completed));
				meter.setAttribute('aria-label', localize('ade.diagramGenerationProgress', "Diagram Generation Progress"));
			} else {
				if (pending && progress.error) { const error = dom.append(banner, dom.$('p')); error.setAttribute('role', 'alert'); error.textContent = localize('ade.diagramResumeHint', "Completed Steps Are Saved. Resume to Continue, or Open Generation Options for Details."); }
				if (pending && progress.questions.length) { this.host.paragraph(banner, progress.questions.join(' ')); }
				const resume = this.host.button(banner, progress?.status === 'plan' ? localize('ade.reviewDiagramPlan', "Review Diagram Plan") : started ? localize('ade.resumeDiagrams', "Resume Diagrams") : localize('ade.buildDiagrams', "Build Diagrams with AI"), () => { void (pending ? this.ai.resumeDiagrams() : this.ai.buildDiagrams()); });
				resume.disabled = this.ai.busy || this.code.busy; resume.classList.toggle('ade-primary-action', started);
				if (pending) {
					const options = this.controls.details(banner, localize('ade.diagramJobOptions', "Generation Options"), 'diagram-job-options');
					if (progress.error) { this.host.paragraph(options, progress.error); }
					this.host.button(options, localize('ade.restartDiagrams', "Start Again"), () => { void this.ai.buildDiagrams(); }).disabled = this.ai.busy || this.code.busy;
				}
			}
		} else if (this.code.changed) {
			const banner = dom.append(parent, dom.$('section.ade-workflow'));
			this.host.paragraph(banner, localize('ade.sourceChanged', "Code Has Changed. Choose Update Diagrams to Reflect the Changes Here."));
		}
		if (this.ai.canApply || this.ai.canVerify) {
			this.host.button(parent, this.ai.canApply ? localize('ade.ai.applyButton', "Apply Verified Changes") : localize('ade.ai.verifyButton', "Run Tests"), () => { void (this.ai.canApply ? this.ai.apply() : this.ai.verify()); }).disabled = this.ai.busy || this.code.busy || !this.project.editable || this.project.hasStructuralErrors || !this.ai.available || !this.code.available || this.configurationService.getValue<boolean>('chat.disableAIFeatures') === true;
		}
	}

	renderTools(toolbar: HTMLElement): void {
		toolbar.setAttribute('aria-label', localize('ade.documentStatus', "Document Status"));
		const status = dom.append(toolbar, dom.$('span.ade-sync-status'));
		status.setAttribute('role', 'status'); status.textContent = this.host.documentStatus();
	}

	renderCodeActions(parent: HTMLElement): void {
		dom.append(parent, dom.$('h1')).textContent = localize('ade.code.title', "Code");
		const commands = (container: HTMLElement, entries: readonly (readonly [string, string])[]) => {
			for (const [label, command] of entries) { this.host.button(container, label, () => { void this.commandService.executeCommand(command); }); }
		};
		if (this.project.error || this.project.loading) { return; }
		const codeUpdate = this.group(parent, localize('ade.codeUpdate.group', "Codebase from Diagrams"));
		const update = this.host.button(codeUpdate, localize('ade.codeUpdate.button', "Update Codebase from Diagrams"), () => { void this.ai.updateCodebase(); }); update.disabled = this.ai.busy || this.code.busy || !this.project.editable || !this.project.projectRoot || this.project.hasStructuralErrors || !this.ai.available || this.configurationService.getValue<boolean>('chat.disableAIFeatures') === true;
		update.classList.add('ade-primary-action');
		if (this.code.context) {
			const evidence = this.group(parent, localize('ade.code.sources', "Source Code"));
			this.host.button(evidence, localize('ade.code.inspectButton', "Code Evidence"), () => { void this.code.inspect(); }).disabled = this.code.busy;
			this.host.button(evidence, localize('ade.shortcuts.update', "Update Diagrams from Codebase"), () => { void this.commandService.executeCommand('ade.ai.updateDiagrams'); }).disabled = this.ai.busy || this.code.busy;
		}
		if (this.ai.structuralReview) { this.host.button(parent, localize('ade.ai.reviewButton', "Review Changes"), () => this.host.showReview()); }
		this.renderWorkflow(parent, true);
		if ((this.project.model.version === 4 || this.project.model.version === 5) && this.project.editable) {
			const preparation = this.controls.details(parent, localize('ade.code.automation', "Automatic Preparation"), 'code-automation');
			this.host.paragraph(preparation, this.ai.continuityStatus);
			this.host.button(preparation, localize('ade.continuity.toggle', "Start or Stop Continuous Preparation"), () => { void this.ai.configureContinuity(); }).disabled = this.ai.busy || this.code.busy;
		}
		const recovery = this.controls.details(parent, localize('ade.project.recovery', "Recovery and Synchronization"), 'project-recovery');
		if (this.project.model.version === 4 || this.project.model.version === 5) {
			for (const [label, action] of [
				[localize('ade.pure.resumeButton', "Resume Model Behavior Review"), () => this.ai.structuralResume()],
				[localize('ade.pure.recoverButton', "Recover Model Behavior Publication"), () => this.ai.structuralRecover()]
			] as const) { this.host.button(recovery, label, () => { void action(); }).disabled = this.ai.busy || this.code.busy; }
		}
		for (const [label, action] of [
			[localize('ade.ai.resumeButton', "Resume Implementation"), () => this.ai.resume()],
			[localize('ade.ai.recoverButton', "Recover Interrupted Implementation"), () => this.ai.recover()]
		] as const) { this.host.button(recovery, label, () => { void action(); }).disabled = this.ai.busy || this.code.busy; }
		if (this.project.model.version !== 4 && this.project.model.version !== 5 && !isSourceEvidenceModel(this.project.model)) { this.host.button(recovery, localize('ade.syncProject', "Sync Project"), () => { void this.code.sync(); }).disabled = this.code.busy || this.ai.busy || !this.code.context; }
		commands(recovery, [[localize('ade.undoSync', "Undo Last Sync"), 'ade.undoSync'], [localize('ade.recoverSync', "Recover Sync"), 'ade.restoreCodeSnapshot']]);
	}

	renderProjectActions(parent: HTMLElement): void {
		dom.append(parent, dom.$('h1')).textContent = localize('ade.project.settingsTitle', "Project Settings");
		const commands = (container: HTMLElement, entries: readonly (readonly [string, string])[]) => {
			for (const [label, command] of entries) { this.host.button(container, label, () => { void this.commandService.executeCommand(command); }); }
		};
		const files = this.controls.details(parent, localize('ade.project.files', "Open and Save"), 'project-files');
		commands(files, [[localize('ade.saveCopy', "Save Project Copy"), 'ade.saveCopy'], [localize('ade.reload', "Reload Project"), 'ade.reload'], [localize('ade.importCode', "Import Codebase"), 'ade.importCodebase']]);
		const modelFiles = this.controls.details(files, localize('ade.project.modelFiles', "Advanced · Model Files"), 'project-model-files');
		commands(modelFiles, [[localize('ade.openModel', "Open Model"), 'ade.openModel']]);
		if (this.project.error || this.project.loading) { return; }
		const model = this.controls.details(parent, localize('ade.project.design', "Model and Architecture"), 'project-architecture');
		commands(model, [[localize('ade.systemMap', "System Map"), 'ade.showSystemMap']]);
		if ((this.project.model.version === 4 || this.project.model.version === 5) && this.project.editable) {
			commands(model, [[localize('ade.blueprint.edit', "Edit Blueprint"), 'ade.blueprint'], [localize('ade.task.edit', "Tasks and Clarifications"), 'ade.taskIntent'], [localize('ade.task.profile', "Choose Runtime and Review Stack Plan"), 'ade.selectStructuralProfile']]);
			const behavior = this.controls.details(parent, localize('ade.project.behavior', "Executable Behavior"), 'project-behavior');
			const edit = this.controls.details(behavior, localize('ade.behavior.edit', "Edit Behavior"), 'project-edit-behavior');
			commands(edit, [[localize('ade.states.edit', "Edit Executable State Machine"), 'ade.stateMachine'], [localize('ade.interaction.edit', "Edit Executable Interaction"), 'ade.interaction'], [localize('ade.predicate.edit', "Edit Pure Predicate"), 'ade.predicate'], [localize('ade.messaging.edit', "Edit Messaging Topology"), 'ade.messaging']]);
			const verify = this.controls.details(behavior, localize('ade.behavior.verify', "Cases and Simulation"), 'project-simulate-behavior');
			if (this.project.model.foundation.messaging?.length) { commands(verify, [[localize('ade.messaging.simulate', "Simulate Messaging"), 'ade.simulateMessaging']]); }
			if (this.project.model.foundation.stateMachines?.length) { commands(verify, [[localize('ade.states.simulate', "Simulate State Machine"), 'ade.ai.simulateStates']]); }
			this.host.button(verify, localize('ade.pure.expectations', "Independent Business Expectations"), () => { void this.ai.editPureCriteria(); });
			const technical = this.controls.details(behavior, localize('ade.behavior.technical', "Code and Context"), 'project-behavior-code');
			commands(technical, [[localize('ade.task.preview', "Structural AI Context Preview"), 'ade.prepareStructuralContext']]);
			this.host.button(technical, localize('ade.pure.reverse', "Reverse Model Behavior from Code"), () => { void this.ai.structuralReverse(); });
		}
		const developer = this.controls.details(parent, localize('ade.project.developerTools', "Developer Tools"), 'project-developer-tools');
		commands(developer, [[localize('ade.files', "Files"), 'ade.openFiles'], [localize('ade.terminal', "Terminal"), 'ade.openTerminal'], [localize('ade.debug', "Debug"), 'workbench.view.debug'], [localize('ade.git', "Git"), 'workbench.view.scm']]);
	}

	constructor(
		private readonly host: AdeWorkflowContentHost,
		private readonly controls: AdeControls,
		private readonly project: AdeProjectService,
		private readonly ai: IAdeAiService,
		private readonly configurationService: IConfigurationService,
		private readonly notifications: INotificationService,
		private readonly code: IAdeCodeService,
		private readonly commandService: ICommandService
	) {
	}
}
