/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { adeErrorNotification, describeAdeError } from './adeErrors.js';
import { renderAdeErrorNotice } from './adeErrorNotice.js';
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
import { renderAdeCodeActions } from './adeCodeActions.js';
import { assertPureProject } from '../common/modelProject.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { type ThemeIcon } from '../../../../base/common/themables.js';
import { AdeActionMenu } from './adeActionMenu.js';

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
		] as const) { this.host.button(account, label, () => action().catch(error => this.notifications.error(adeErrorNotification(error, 'ai', this.project.model)))).disabled = this.ai.busy || this.code.busy; }
		const requests = this.group(parent, localize('ade.ai.requestSettings', "AI Requests"), this.ai.requestStatus);
		this.host.button(requests, localize('ade.ai.requestBudget', "Configure AI Request Budget"), () => this.ai.configureRequestBudget().catch(error => this.notifications.error(adeErrorNotification(error, 'ai', this.project.model)))).disabled = this.ai.busy || this.code.busy;
		this.host.paragraph(requests, localize('ade.ai.requestBudgetHint', "Changing This Budget Sends No Request. Project Exploration Has a Separate Budget."));
		const budget = this.group(parent, localize('ade.ai.generationSettings', "Diagram Generation"), localize('ade.ai.generationSettingsHint', "Control How Much Source the Assistant Can Explore While Preparing Diagrams."));
		this.host.button(budget, localize('ade.explore.adjustBudget', "Add Exploration Budget"), () => this.ai.configureDiagramBudget()).disabled = this.ai.busy || !this.ai.diagramExploration;
		if (!this.ai.diagramExploration) { this.host.paragraph(budget, localize('ade.explore.initializeBudget', "Open Architecture Exploration to Initialize a Project Budget. No AI Request Is Sent Until You Send a Message.")); }
		const advanced = this.controls.details(parent, localize('ade.ai.advancedSettings', "Advanced · Model Benchmarks"), 'ai-benchmarks');
		for (const [label, action] of [
			[localize('ade.ai.benchmarkButton', "Compare AI Models"), () => this.ai.benchmark()],
			[localize('ade.ai.reconciliationBenchmarkButton', "Compare Reconciliation Models"), () => this.ai.benchmarkReconciliation()],
			[localize('ade.ai.exportButton', "Export Model Benchmark Results"), () => this.ai.exportBenchmark()]
		] as const) { this.host.button(advanced, label, () => action().catch(error => this.notifications.error(adeErrorNotification(error, 'ai', this.project.model)))).disabled = this.ai.busy || this.code.busy; }
	}

	renderWorkflow(parent: HTMLElement, history = false): void {
		if (this.ai.structuralProblem) {
			const issue = dom.append(parent, dom.$('section.ade-structural-review')); issue.setAttribute('role', 'alert');
			this.host.paragraph(issue, localize('ade.review.resolve', "Model and Code Need Review Before Applying")); this.host.paragraph(issue, this.ai.structuralProblem);
			this.host.button(issue, localize('ade.review.revise', "Review Specification and Constraints"), () => this.commandService.executeCommand('ade.blueprint'));
			this.host.button(issue, localize('ade.task.edit', "Tasks and Clarifications"), () => this.commandService.executeCommand('ade.taskIntent'));
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
			if (phase !== 'applied' && phase !== 'review') { const resume = this.host.button(panel, exploration ? exploration.workflow === 'project' ? localize('ade.explore.continueProject', "Continue Generation") : localize('ade.explore.continue', "Continue Exploration") : localize('ade.explore.start', "Explore Architecture"), () => this.ai.resumeDiagrams()); resume.disabled = this.ai.busy || this.code.busy; resume.classList.add('ade-primary-action'); }
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
						const review = this.host.button(panel, localize('ade.explore.reviewAll', "Review All Changes"), () => this.ai.reviewDiagramProposal(), 'project-review');
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
					if (exploration.workflow !== 'project') { const review = this.host.button(details, localize('ade.explore.reviewDraft', "Review Draft"), () => this.ai.reviewDiagramProposal(proposal.id), `proposal-review:${proposal.id}`); review.disabled = this.ai.busy || this.code.busy; review.classList.toggle('ade-primary-action', phase === 'review'); }
				}
				const tasks = this.controls.details(panel, localize('ade.explore.goals', "Exploration Goals and Gaps"), 'exploration-goals');
				for (const task of exploration.tasks) { this.host.paragraph(tasks, task.intent); for (const gap of task.gaps) { this.host.paragraph(tasks, gap); } }
				this.host.button(tasks, localize('ade.explore.adjustBudget', "Add Exploration Budget"), () => this.ai.configureDiagramBudget());
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
				if (pending && progress.error) { renderAdeErrorNotice(banner, describeAdeError(progress.error, 'ai', this.project.model), this.controls); }
				if (pending && progress.questions.length) { this.host.paragraph(banner, progress.questions.join(' ')); }
				const resume = this.host.button(banner, progress?.status === 'plan' ? localize('ade.reviewDiagramPlan', "Review Diagram Plan") : started ? localize('ade.resumeDiagrams', "Resume Diagrams") : localize('ade.buildDiagrams', "Build Diagrams with AI"), () => (pending ? this.ai.resumeDiagrams() : this.ai.buildDiagrams()));
				resume.disabled = this.ai.busy || this.code.busy; resume.classList.toggle('ade-primary-action', started);
				if (pending) {
					const options = this.controls.details(banner, localize('ade.diagramJobOptions', "Generation Options"), 'diagram-job-options');
					this.host.button(options, localize('ade.restartDiagrams', "Start Again"), () => this.ai.buildDiagrams()).disabled = this.ai.busy || this.code.busy;
				}
			}
		} else if (this.code.changed) {
			const banner = dom.append(parent, dom.$('section.ade-workflow'));
			this.host.paragraph(banner, localize('ade.sourceChanged', "Code Has Changed. Choose Update Diagrams to Reflect the Changes Here."));
		}
		if (this.ai.canApply || this.ai.canVerify) {
			this.host.button(parent, this.ai.canApply ? localize('ade.ai.applyButton', "Apply Verified Changes") : localize('ade.ai.verifyButton', "Run Tests"), () => (this.ai.canApply ? this.ai.apply() : this.ai.verify())).disabled = this.ai.busy || this.code.busy || !this.project.editable || this.project.hasStructuralErrors || !this.ai.available || !this.code.available || this.configurationService.getValue<boolean>('chat.disableAIFeatures') === true;
		}
	}

	renderTools(toolbar: HTMLElement): void {
		toolbar.setAttribute('aria-label', localize('ade.documentStatus', "Document Status"));
		const status = dom.append(toolbar, dom.$('span.ade-sync-status'));
		status.setAttribute('role', 'status'); status.textContent = this.host.documentStatus();
	}

	renderCodeActions(parent: HTMLElement, settings: () => void, reviewActions?: (container: HTMLElement) => void): void {
		const busy = this.ai.busy || this.code.busy;
		const reason = this.project.loading || this.project.error ? localize('ade.code.waitForProject', "Open a valid project before using code actions.") : busy ? localize('ade.operationWait', "Wait for the Active A.D.E Operation to Finish.") : !this.project.editable ? localize('ade.generation.readonly', "Open a writable project to prepare code changes.") : this.project.hasStructuralErrors ? localize('ade.code.correctModel', "Correct the draft specification in Project Settings first.") : undefined;
		const aiReason = reason ?? (this.configurationService.getValue<boolean>('chat.disableAIFeatures') === true ? localize('ade.ai.disabled', "AI Features Are Disabled in Settings.") : !this.ai.available ? localize('ade.code.aiUnavailable', "Connect an AI provider in AI Settings to prepare code changes.") : undefined);
		const structuralReason = reason ?? (!this.ai.available || !this.code.available ? localize('ade.generation.unavailable', "Local code generation and verification are unavailable in this environment.") : !this.project.projectRoot ? localize('ade.codeUpdate.saveFirst', "Open or Save a Project Before Updating Its Codebase.") : this.project.model.version !== 4 && this.project.model.version !== 5 ? localize('ade.code.executableModel', "This action requires a project with executable behavior. Configure the model in Project Settings.") : undefined);
		let executable = false;
		try { const model = this.project.model; if (model.version === 4 || model.version === 5) { assertPureProject(model); executable = true; } } catch { /* The settings action remains available for incomplete designs. */ }
		const action = (label: string, run: () => Promise<void>, reason?: string) => ({ label, reason, run: () => run().catch(error => this.notifications.error(adeErrorNotification(error, 'ai', this.project.model))) });
		const recovery = [
			action(localize('ade.pure.resume', "Resume Model Behavior Review"), () => this.ai.structuralResume(), structuralReason),
			action(localize('ade.pure.recover', "Recover Model Behavior Publication"), () => this.ai.structuralRecover(), structuralReason),
			action(localize('ade.ai.resumeButton', "Resume Implementation"), () => this.ai.resume(), aiReason),
			action(localize('ade.ai.recoverButton', "Recover Interrupted Implementation"), () => this.ai.recover(), aiReason),
			action(localize('ade.undoSync', "Undo Last Sync"), () => this.commandService.executeCommand('ade.undoSync'), reason ?? (!this.code.context ? localize('ade.code.noSync', "Open a project linked to a codebase to manage synchronization.") : undefined)),
			action(localize('ade.recoverSync', "Recover Sync"), () => this.commandService.executeCommand('ade.restoreCodeSnapshot'), reason ?? (!this.code.context ? localize('ade.code.noSync', "Open a project linked to a codebase to manage synchronization.") : undefined))
		];
		if (this.project.model.version !== 4 && this.project.model.version !== 5 && !isSourceEvidenceModel(this.project.model)) { recovery.push(action(localize('ade.syncProject', "Sync Project"), () => this.code.sync(), reason ?? (!this.code.context ? localize('ade.code.noSync', "Open a project linked to a codebase to manage synchronization.") : undefined))); }
		renderAdeCodeActions(parent, this.controls, {
			update: action(localize('ade.codeUpdate.button', "Update Codebase from Diagrams"), () => this.ai.updateCodebase(), aiReason ?? (!this.project.projectRoot ? localize('ade.codeUpdate.saveFirst', "Open or Save a Project Before Updating Its Codebase.") : undefined)),
			prepare: action(localize('ade.review.prepare', "Prepare Model to Code Review"), () => this.ai.implement(), structuralReason ?? (!executable ? localize('ade.code.behaviorRequired', "Complete the executable behavior and runtime in Project Settings to prepare a local code review.") : undefined)),
			continuity: action(localize('ade.continuity.toggle', "Start or Stop Continuous Preparation"), () => this.ai.configureContinuity(), structuralReason),
			continuityStatus: this.ai.continuityStatus,
			review: this.ai.structuralReview ? { label: localize('ade.ai.reviewButton', "Review Changes"), run: () => this.host.showReview() } : undefined,
			sources: this.code.context ? [
				action(localize('ade.code.inspectButton', "Code Evidence"), () => this.code.inspect(), this.code.busy ? localize('ade.operationWait', "Wait for the Active A.D.E Operation to Finish.") : undefined),
				action(localize('ade.shortcuts.update', "Update Diagrams from Codebase"), () => this.commandService.executeCommand('ade.ai.updateDiagrams'), aiReason)
			] : undefined,
			recovery, settings, reviewActions
		});
		this.renderWorkflow(parent, true);
	}

	renderProjectActions(parent: HTMLElement): void {
		parent.classList.add('ade-action-menu');
		dom.append(parent, dom.$('h1')).textContent = localize('ade.project.settingsTitle', "Project Settings");
		const menu = new AdeActionMenu(this.controls);
		const commands = (container: HTMLElement, entries: readonly (readonly [string, string, ThemeIcon, string?, ('action' | 'navigation')?])[]) => {
			for (const [label, command, icon, description, kind] of entries) { menu.action(container, label, () => this.commandService.executeCommand(command), { icon, description, kind }); }
		};
		const files = menu.disclosure(parent, localize('ade.project.files', "Open and Save"), 'project-files', { icon: Codicon.folderOpened, openByDefault: true });
		commands(files, [
			[localize('ade.saveCopy', "Save Project Copy"), 'ade.saveCopy', Codicon.saveAs, localize('ade.project.copyHelp', "Save a separate copy of this project.")],
			[localize('ade.reload', "Reload Project"), 'ade.reload', Codicon.refresh, localize('ade.project.reloadHelp', "Read the saved project again; review unsaved changes first.")],
			[localize('ade.importCode', "Import Codebase"), 'ade.importCodebase', Codicon.fileCode, localize('ade.project.importHelp', "Start a source inventory from an existing codebase.")]
		]);
		const modelFiles = menu.disclosure(files, localize('ade.project.modelFiles', "Advanced · Model Files"), 'project-model-files', { icon: Codicon.json });
		commands(modelFiles, [[localize('ade.openModel', "Open Model"), 'ade.openModel', Codicon.goToFile, undefined, 'navigation']]);
		if (this.project.error || this.project.loading) { return; }
		const model = menu.disclosure(parent, localize('ade.project.design', "Model and Architecture"), 'project-architecture', { icon: Codicon.symbolStructure, openByDefault: true });
		const explore = menu.section(model, localize('ade.project.explore', "Explore"), { compact: true });
		commands(explore, [[localize('ade.systemMap', "System Map"), 'ade.showSystemMap', Codicon.typeHierarchy, localize('ade.project.mapHelp', "Explore boundaries, elements and relationships."), 'navigation']]);
		if ((this.project.model.version === 4 || this.project.model.version === 5) && this.project.editable) {
			const define = menu.section(model, localize('ade.project.define', "Edit Specification"), { compact: true });
			commands(define, [
				[localize('ade.blueprint.edit', "Edit Blueprint"), 'ade.blueprint', Codicon.edit, localize('ade.project.blueprintHelp', "Define structure, ownership and shared contracts.")],
				[localize('ade.task.edit', "Tasks and Clarifications"), 'ade.taskIntent', Codicon.tasklist],
				[localize('ade.task.profile', "Choose Runtime and Review Stack Plan"), 'ade.selectStructuralProfile', Codicon.server]
			]);
			const behavior = menu.disclosure(parent, localize('ade.project.behavior', "Executable Behavior"), 'project-behavior', { icon: Codicon.symbolMethod });
			const edit = menu.section(behavior, localize('ade.behavior.edit', "Edit Behavior"), { compact: true });
			commands(edit, [
				[localize('ade.states.edit', "Edit Executable State Machine"), 'ade.stateMachine', Codicon.circleLarge],
				[localize('ade.interaction.edit', "Edit Executable Interaction"), 'ade.interaction', Codicon.arrowSwap],
				[localize('ade.predicate.edit', "Edit Pure Predicate"), 'ade.predicate', Codicon.symbolOperator],
				[localize('ade.messaging.edit', "Edit Messaging Topology"), 'ade.messaging', Codicon.broadcast]
			]);
			const verify = menu.section(behavior, localize('ade.behavior.verify', "Cases and Simulation"), { compact: true });
			if (this.project.model.foundation.messaging?.length) { commands(verify, [[localize('ade.messaging.simulate', "Simulate Messaging"), 'ade.simulateMessaging', Codicon.play]]); }
			if (this.project.model.foundation.stateMachines?.length) { commands(verify, [[localize('ade.states.simulate', "Simulate State Machine"), 'ade.ai.simulateStates', Codicon.play]]); }
			menu.action(verify, localize('ade.pure.expectations', "Independent Business Expectations"), () => this.ai.editPureCriteria(), { icon: Codicon.beaker });
			const technical = menu.disclosure(behavior, localize('ade.behavior.technical', "Code and Context"), 'project-behavior-code', { icon: Codicon.code });
			commands(technical, [[localize('ade.task.preview', "Structural AI Context Preview"), 'ade.prepareStructuralContext', Codicon.eye, undefined, 'navigation']]);
			menu.action(technical, localize('ade.pure.reverse', "Reverse Model Behavior from Code"), () => this.ai.structuralReverse(), { icon: Codicon.arrowSwap });
		}
		const developer = menu.disclosure(parent, localize('ade.project.developerTools', "Developer Tools"), 'project-developer-tools', { icon: Codicon.tools });
		commands(developer, [
			[localize('ade.files', "Files"), 'ade.openFiles', Codicon.files, undefined, 'navigation'],
			[localize('ade.terminal', "Terminal"), 'ade.openTerminal', Codicon.terminal, undefined, 'navigation'],
			[localize('ade.debug', "Debug"), 'workbench.view.debug', Codicon.debugAlt, undefined, 'navigation'],
			[localize('ade.git', "Git"), 'workbench.view.scm', Codicon.sourceControl, undefined, 'navigation']
		]);
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
