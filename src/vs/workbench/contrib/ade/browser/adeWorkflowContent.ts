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
import { renderAdeCodeActions } from './adeCodeActions.js';
import { type AdeFeatureCodeGeneration, hasFeatureCodeReview } from './adeFeatureCodeGeneration.js';
import { assertPureProject } from '../common/modelProject.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { type ThemeIcon } from '../../../../base/common/themables.js';
import { AdeActionMenu } from './adeActionMenu.js';
import { AdeCodebaseExploration } from './adeCodebaseExploration.js';

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

	renderWorkflow(parent: HTMLElement, surface: 'workspace' | 'history' | 'import' = 'workspace'): void {
		const history = surface === 'history', landing = surface === 'import';
		if (this.ai.structuralProblem) {
			const issue = dom.append(parent, dom.$('section.ade-structural-review')); issue.setAttribute('role', 'alert');
			this.host.paragraph(issue, localize('ade.review.resolve', "Model and Code Need Review Before Applying")); this.host.paragraph(issue, this.ai.structuralProblem);
			this.host.button(issue, localize('ade.review.revise', "Review Specification and Constraints"), () => this.commandService.executeCommand('ade.blueprint'));
			this.host.button(issue, localize('ade.task.edit', "Tasks and Clarifications"), () => this.commandService.executeCommand('ade.taskIntent'));
		}
		const enabled = this.ai.available && this.configurationService.getValue<boolean>('chat.disableAIFeatures') !== true;
		const exploration = this.ai.diagramExploration;
		const context = this.code.context;
		const view = new AdeCodebaseExploration(this.controls, this.ai, this.code);
		if (context && enabled && this.configurationService.getValue<boolean>('ade.diagramImport.incremental') !== false && (exploration || context.diagramState === 'index')) {
			if (history || getDiagramExplorationPhase(exploration) !== 'applied') { view.render(parent, exploration, landing); }
			return;
		}
		if (landing) {
			const panel = dom.append(parent, dom.$('section.ade-explore'));
			view.renderHeader(panel);
			if (!context) {
				dom.append(panel, dom.$('p', { role: 'status' })).textContent = localize('ade.import.readingEvidence', "Preparing source evidence…");
			} else if (!enabled) {
				dom.append(panel, dom.$('p')).textContent = localize('ade.import.aiRequired', "Enable AI features to interpret the source into diagrams. The technical index stays available as code evidence.");
			}
		}
		if (!context || !enabled) { return; }
		const progress = this.ai.diagramProgress;
		const pending = progress && progress.status !== 'complete';
		if (context.diagramState === 'index' || pending) {
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
		if ((!history || this.project.model.version === 4 || this.project.model.version === 5) && (this.ai.canApply || this.ai.canVerify)) {
			this.host.button(parent, this.ai.canApply ? localize('ade.ai.applyButton', "Apply Verified Changes") : localize('ade.ai.verifyButton', "Run Tests"), () => (this.ai.canApply ? this.ai.apply() : this.ai.verify())).disabled = this.ai.busy || this.code.busy || !this.project.editable || this.project.hasStructuralErrors || !this.ai.available || !this.code.available || this.configurationService.getValue<boolean>('chat.disableAIFeatures') === true;
		}
	}

	renderTools(toolbar: HTMLElement): void {
		toolbar.setAttribute('aria-label', localize('ade.documentStatus', "Document Status"));
		const status = dom.append(toolbar, dom.$('span.ade-sync-status'));
		status.setAttribute('role', 'status'); status.textContent = this.host.documentStatus();
	}

	renderCodeActions(parent: HTMLElement, settings: () => void, reviewActions?: (container: HTMLElement) => void, generation?: { ui: AdeFeatureCodeGeneration; review(): void }): void {
		const busy = this.ai.busy || this.code.busy;
		const reason = this.project.loading || this.project.error ? localize('ade.code.waitForProject', "Open a valid project before using code actions.") : busy ? localize('ade.operationWait', "Wait for the Active A.D.E Operation to Finish.") : !this.project.editable ? localize('ade.generation.readonly', "Open a writable project to prepare code changes.") : this.project.hasStructuralErrors ? localize('ade.code.correctModel', "Correct the draft specification in Project Settings first.") : undefined;
		const aiDisabled = this.configurationService.getValue<boolean>('chat.disableAIFeatures') === true;
		const aiReason = reason ?? (aiDisabled ? localize('ade.ai.disabled', "AI Features Are Disabled in Settings.") : !this.ai.available ? localize('ade.code.aiUnavailable', "Connect an AI provider in AI Settings to prepare code changes.") : undefined);
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
		const worktree = this.project.model.version !== 4 && this.project.model.version !== 5 && this.code.context && this.ai.available && !aiDisabled && (this.ai.canApply || this.ai.canVerify) ? {
			...action(this.ai.canApply ? localize('ade.ai.applyButton', "Apply Verified Changes") : localize('ade.ai.verifyButton', "Run Tests"), () => this.ai.canApply ? this.ai.apply() : this.ai.verify(), aiReason ?? (!this.code.available ? structuralReason : undefined)),
			status: this.ai.status
		} : undefined;
		const updateReason = aiReason ?? (!this.project.projectRoot ? localize('ade.codeUpdate.saveFirst', "Open or Save a Project Before Updating Its Codebase.") : undefined);
		const assisted = generation && typeof this.ai.inspectCodeGeneration === 'function' ? generation : undefined;
		const run = assisted && this.ai.codeGeneration;
		const setupReason = updateReason ?? (!this.project.model.semantics.elements.some(element => element.kind === 'feature') ? localize('ade.featureCode.featureRequired', "Add a feature with a diagram before preparing code.") : undefined);
		const updateLabel = this.code.context ? localize('ade.codeUpdate.button', "Update Codebase from Diagrams") : localize('ade.featureCode.start', "Prepare Code from Diagrams");
		let update = assisted ? action(updateLabel, () => assisted.ui.configure(), setupReason) : action(localize('ade.codeUpdate.button', "Update Codebase from Diagrams"), () => this.ai.updateCodebase(), updateReason);
		if (assisted && run) {
			if (hasFeatureCodeReview(run)) { update = action(localize('ade.featureCode.openReview', "Review AI Code Changes"), async () => assisted.review(), aiReason); }
			else if (run.status === 'waitingUser') { update = action(localize('ade.featureCode.clarify', "Answer Clarifications"), () => assisted.ui.clarify(), aiReason); }
			else { update = action(localize('ade.featureCode.resume', "Resume Generation"), () => this.ai.resumeCodeGeneration(), aiReason); }
		}
		renderAdeCodeActions(parent, this.controls, {
			update: run?.status === 'generating' && busy ? undefined : update,
			newGeneration: assisted && run && ['ready', 'verified', 'failed', 'applied', 'undone'].includes(run.status) ? action(localize('ade.featureCode.startNew', "Prepare New Code Changes"), () => assisted.ui.configure(), setupReason) : undefined,
			generationStatus: assisted ? container => assisted.ui.renderProgress(container, run, this.controls, busy) : undefined,
			prepare: action(localize('ade.review.prepare', "Prepare Model to Code Review"), () => this.ai.implement(), structuralReason ?? (!executable ? localize('ade.code.behaviorRequired', "Complete the executable behavior and runtime in Project Settings to prepare a local code review.") : undefined)),
			continuity: action(localize('ade.continuity.toggle', "Start or Stop Continuous Preparation"), () => this.ai.configureContinuity(), structuralReason),
			continuityStatus: this.ai.continuityStatus,
			worktree,
			review: this.ai.structuralReview ? { label: localize('ade.ai.reviewButton', "Review Changes"), run: () => this.host.showReview() } : undefined,
			sources: this.code.context ? [
				action(localize('ade.code.inspectButton', "Code Evidence"), () => this.code.inspect(), this.code.busy ? localize('ade.operationWait', "Wait for the Active A.D.E Operation to Finish.") : undefined),
				action(localize('ade.shortcuts.update', "Update Diagrams from Codebase"), () => this.commandService.executeCommand('ade.ai.updateDiagrams'), aiReason)
			] : undefined,
			recovery, settings, reviewActions
		});
		this.renderWorkflow(parent, 'history');
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
