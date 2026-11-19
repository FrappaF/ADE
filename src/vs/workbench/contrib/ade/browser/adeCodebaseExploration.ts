/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/adeCodebaseExploration.css';
import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { type ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { type CodeDiagramExploration } from '../common/codeBridge.js';
import { getDiagramExplorationPhase } from '../common/diagramExplorationState.js';
import { type IAdeAiService } from './adeAiService.js';
import { type IAdeCodeService } from './adeCodeService.js';
import { type AdeControls } from './adeControls.js';
import { diagramIcon, prependAdeIcon } from './adeIcons.js';
import { viewLabels } from './adeLabels.js';

type DiagramPlanItem = NonNullable<CodeDiagramExploration['plan']>['items'][number];
type DiagramTask = CodeDiagramExploration['tasks'][number];
type Proposal = CodeDiagramExploration['proposals'][number];
type Stage = { title: string; description?: string; icon: ThemeIcon; tone: 'ready' | 'active' | 'attention' | 'success' };

const steps = [
	{ label: localize('ade.explore.step.inventory', "Inventory"), icon: Codicon.repo },
	{ label: localize('ade.explore.step.features', "Features"), icon: Codicon.symbolEvent },
	{ label: localize('ade.explore.step.diagrams', "Diagrams"), icon: Codicon.typeHierarchy },
	{ label: localize('ade.explore.step.review', "Review"), icon: Codicon.eye }
];

function toolLabel(tool: string): string | undefined {
	switch (tool) {
		case 'ade_project_inspect': return localize('ade.explore.tool.inventory', "Inspect source inventory");
		case 'ade_source_search': return localize('ade.explore.tool.search', "Search source code");
		case 'ade_source_read': return localize('ade.explore.tool.read', "Read source evidence");
		case 'ade_code_references': return localize('ade.explore.tool.references', "Check code references");
		case 'ade_model_query': return localize('ade.explore.tool.model', "Check existing architecture elements");
		case 'ade_feature_catalog': return localize('ade.explore.tool.features', "Save the feature catalog");
		case 'ade_diagram_plan': return localize('ade.explore.tool.plan', "Save the diagram plan");
		case 'ade_model_propose': return localize('ade.explore.tool.propose', "Save a diagram draft");
		case 'ade_view_preview': return localize('ade.explore.tool.preview', "Validate a diagram preview");
		case 'ade_proposal_discard': return localize('ade.explore.tool.archive', "Archive an invalid draft");
		case 'ade_task_update': return localize('ade.explore.tool.checkpoint', "Save diagram progress");
	}
	return undefined;
}

function draftReady(task: DiagramTask | undefined): boolean {
	return task?.status === 'ready' || task?.status === 'applied';
}

function taskStatus(task: DiagramTask | undefined, current: boolean, running: boolean): { label: string; tone: Stage['tone'] } {
	switch (task?.status) {
		case 'applied': return { label: localize('ade.explore.applied', "Applied"), tone: 'success' };
		case 'ready': return { label: localize('ade.explore.generated', "Draft Prepared"), tone: 'success' };
		case 'cancelled': return { label: localize('ade.explore.excluded', "Excluded"), tone: 'ready' };
		case 'blocked': case 'waitingContext': case 'waitingUser': return { label: localize('ade.explore.taskBlocked', "Needs attention"), tone: 'attention' };
	}
	return current && running ? { label: localize('ade.explore.running', "Generating"), tone: 'active' } : { label: localize('ade.explore.pending', "Pending"), tone: 'ready' };
}

/** Project import and its saved checkpoints, rendered without opening the AI conversation. */
export class AdeCodebaseExploration {
	constructor(private readonly controls: AdeControls, private readonly ai: IAdeAiService, private readonly code: IAdeCodeService) { }

	renderHeader(parent: HTMLElement): void {
		const header = dom.append(parent, dom.$('header.ade-explore-header'));
		const identity = dom.append(header, dom.$('div.ade-explore-identity'));
		const icon = dom.append(identity, dom.$('span.ade-explore-project-icon'));
		prependAdeIcon(icon, Codicon.repo);
		const copy = dom.append(identity, dom.$('div.ade-explore-heading'));
		dom.append(copy, dom.$('h1')).textContent = localize('ade.import.interpretTitle', "Explore Your Codebase");
		const context = this.code.context;
		if (!context) { return; }
		if (context.files && context.declarations) {
			const files = context.files.filter(file => file.status !== 'excluded').length;
			const declarations = context.declarations.length;
			const fileLabel = files === 1 ? localize('ade.explore.oneSourceFile', "1 source file") : localize('ade.explore.sourceFiles', "{0} source files", files);
			const declarationLabel = declarations === 1 ? localize('ade.explore.oneDeclaration', "1 indexed declaration") : localize('ade.explore.declarations', "{0} indexed declarations", declarations);
			dom.append(copy, dom.$('p')).textContent = localize('ade.explore.sourceSummary', "{0} · {1}", fileLabel, declarationLabel);
		}
		this.action(header, localize('ade.code.inspect', "Inspect Code Evidence"), Codicon.fileCode, () => this.code.inspect(), 'inventory-evidence').disabled = this.code.busy;
	}

	render(parent: HTMLElement, exploration: CodeDiagramExploration | undefined, landing: boolean): void {
		const panel = dom.append(parent, dom.$('section.ade-explore', { 'aria-label': localize('ade.explore.title', "Architecture Exploration") }));
		if (landing) { this.renderHeader(panel); }
		else { dom.append(panel, dom.$('h2.ade-explore-title')).textContent = localize('ade.explore.title', "Architecture Exploration"); }

		const phase = getDiagramExplorationPhase(exploration);
		const running = this.ai.generatingDiagrams;
		const clarification = running ? undefined : this.ai.diagramClarification;
		const issue = running ? undefined : this.ai.diagramExplorationIssue;
		const items = exploration?.plan?.items ?? [];
		const tasks = new Map(exploration?.tasks.map(task => [task.id, task]));
		const prepared = items.filter(item => draftReady(tasks.get(item.id))).length;
		const currentStep = phase === 'applied' ? steps.length : phase === 'review' || exploration?.phase === 'review' ? 3 : exploration?.phase === 'planning' || exploration?.phase === 'diagrams' || items.length ? 2 : 1;

		const card = dom.append(panel, dom.$('div.ade-explore-card'));
		this.renderSteps(card, currentStep);
		const stage = this.getStage(exploration, phase, running, prepared, clarification, issue);
		const body = dom.append(card, dom.$('div.ade-explore-stage', { 'data-tone': stage.tone }));
		const content = dom.append(body, dom.$('div.ade-explore-stage-main'));
		const glyph = dom.append(content, dom.$('span.ade-explore-stage-icon'));
		prependAdeIcon(glyph, stage.icon);
		if (running) { glyph.classList.add('ade-explore-stage-icon-running'); }
		const copy = dom.append(content, dom.$('div.ade-explore-stage-copy'));
		const announcement = dom.append(copy, dom.$('div.ade-explore-live', { role: 'status' }));
		dom.append(announcement, dom.$(landing ? 'h2' : 'h3')).textContent = stage.title;
		if (stage.description) { dom.append(announcement, dom.$('p')).textContent = stage.description; }
		const live = running ? this.liveStatus() : undefined;
		if (live) {
			const activity = dom.append(announcement, dom.$('p.ade-explore-now'));
			activity.textContent = live;
			prependAdeIcon(activity, Codicon.pulse);
		}
		if (running && this.ai.diagramLiveProgress?.retrying && this.ai.diagramLiveProgress.state !== 'stopping') {
			dom.append(announcement, dom.$('p.ade-explore-notice')).textContent = localize('ade.explore.retryingTimeout', "Resuming the saved step after the AI provider timed out.");
		}
		if (exploration?.invalidation?.viewIds.length) {
			dom.append(copy, dom.$('p.ade-explore-notice')).textContent = localize('ade.explore.staleViews', "{0} Diagrams Have Changed Source Evidence · Review the Affected Scenarios", exploration.invalidation.viewIds.length);
		}

		const busy = this.ai.busy || this.code.busy;
		const drafts = exploration?.proposals.filter(proposal => proposal.status !== 'applied') ?? [];
		const actions = dom.append(body, dom.$('div.ade-explore-actions'));
		if (running && this.ai.stopDiagramExploration) {
			const stopping = this.ai.diagramLiveProgress?.state === 'stopping';
			this.action(actions, stopping ? localize('ade.explore.stopping', "Stopping…") : localize('ade.explore.stop', "Stop Generation"), Codicon.debugStop, () => this.ai.stopDiagramExploration?.(), 'exploration-action').disabled = stopping;
		} else if (clarification && this.ai.clarifyDiagramExploration) {
			this.action(actions, localize('ade.explore.continueWithAnswer', "Answer and Continue"), Codicon.commentDiscussion, () => this.ai.clarifyDiagramExploration?.(), 'exploration-action', true).disabled = busy;
		} else if (phase === 'review' && exploration?.workflow === 'project') {
			this.action(actions, localize('ade.explore.reviewAll', "Review All Changes"), Codicon.eye, () => this.ai.reviewDiagramProposal(), exploration.phase ? 'exploration-action' : 'project-review', true).disabled = busy;
		} else if (!running && phase !== 'applied' && phase !== 'review') {
			const label = exploration ? exploration.workflow === 'project' ? localize('ade.explore.continueProject', "Continue Generation") : localize('ade.explore.continue', "Continue Exploration") : localize('ade.explore.start', "Explore Architecture");
			this.action(actions, label, exploration ? Codicon.play : Codicon.sparkle, () => this.ai.resumeDiagrams(), 'exploration-action', true).disabled = busy;
			if (exploration?.workflow === 'project' && drafts.length && (!exploration.phase || exploration.phase === 'review')) {
				this.action(actions, localize('ade.explore.reviewAll', "Review All Changes"), Codicon.eye, () => this.ai.reviewDiagramProposal(), 'project-review').disabled = busy;
			}
		}
		if (phase === 'review' && exploration?.workflow !== 'project' && drafts.length === 1) {
			this.reviewDraft(actions, drafts[0], busy, true);
		}
		if (running) {
			const scope = exploration?.phase === 'diagrams' ? items.filter(item => item.featureId === exploration.nextFeatureId && tasks.get(item.id)?.status !== 'cancelled') : [];
			this.renderProgress(card, scope, tasks);
		}
		if (!exploration) { return; }

		if (exploration.featureCatalog || exploration.plan) { this.renderPlan(panel, exploration, items, tasks, running); }
		const plannedProposals = new Set(exploration.tasks.map(task => task.proposalId));
		for (const proposal of drafts.filter(draft => exploration.workflow !== 'project' || !plannedProposals.has(draft.id))) {
			if (phase === 'review' && exploration.workflow !== 'project' && drafts.length === 1 && !proposal.diagnostics.length) { continue; }
			const details = this.disclosure(panel, proposal.views.map(view => view.name).join(', ') || localize('ade.explore.untitledDraft', "Diagram Draft"), `exploration-proposal:${proposal.id}`, Codicon.typeHierarchy);
			dom.append(details, dom.$('p')).textContent = proposal.status === 'ready' ? localize('ade.explore.draftReady', "Draft Ready for Review") : localize('ade.explore.draftBlocked', "Draft Needs Correction");
			this.renderDiagnostics(details, proposal);
			if (exploration.workflow !== 'project' && !(phase === 'review' && drafts.length === 1)) { this.reviewDraft(details, proposal, busy, phase === 'review'); }
		}
		this.renderActivity(panel, exploration, busy);
	}

	private getStage(exploration: CodeDiagramExploration | undefined, phase: ReturnType<typeof getDiagramExplorationPhase>, running: boolean, prepared: number, clarification?: string, issue?: string): Stage {
		if (phase === 'applied') { return { title: localize('ade.explore.allApplied', "All Diagram Changes Applied"), icon: Codicon.check, tone: 'success' }; }
		if (clarification) { return { title: localize('ade.explore.clarification', "Clarification Needed"), description: clarification, icon: Codicon.commentDiscussion, tone: 'attention' }; }
		if (phase === 'review' && exploration && !running) {
			const count = exploration.proposals.filter(proposal => proposal.status === 'ready').reduce((sum, proposal) => sum + proposal.views.length, 0);
			return {
				title: localize('ade.explore.stage.review', "Diagrams ready for review"),
				description: count === 1 ? localize('ade.explore.reviewOneDraft', "1 diagram draft to review before applying.") : localize('ade.explore.reviewDrafts', "{0} diagram drafts to review before applying.", count),
				icon: Codicon.check, tone: 'success'
			};
		}
		const scope = exploration?.featureCatalog?.features.find(feature => feature.id === exploration.nextFeatureId)?.name ?? localize('ade.explore.systemScope', "System Overview");
		const item = exploration?.plan?.items.find(item => item.id === exploration.nextTaskId);
		const scopeLabel = item ? localize('ade.explore.currentDiagram', "{0} · {1}", scope, item.name) : scope;
		if (running) {
			switch (exploration?.phase) {
				case 'planning': return { title: localize('ade.explore.stage.planning', "Planning diagrams"), description: scope, icon: Codicon.listTree, tone: 'active' };
				case 'diagrams': return { title: localize('ade.explore.stage.generating', "Generating diagrams"), description: scopeLabel, icon: Codicon.typeHierarchy, tone: 'active' };
				case 'review': return { title: localize('ade.explore.stage.modelCheck', "Checking the diagram set"), icon: Codicon.inspect, tone: 'active' };
				default: return { title: localize('ade.explore.stage.discovery', "Identifying project features"), icon: Codicon.search, tone: 'active' };
			}
		}
		if (exploration?.budgetStatus?.exhausted.length) { return { title: localize('ade.explore.budgetReached', "Exploration budget reached"), description: localize('ade.explore.budgetResume', "Continue generation to adjust the budget and resume from the saved step."), icon: Codicon.warning, tone: 'attention' }; }
		if (issue) { return { title: localize('ade.explore.generationPaused', "Generation paused"), description: issue, icon: Codicon.warning, tone: 'attention' }; }
		if (exploration?.phase === 'review' || (!exploration?.phase && exploration?.batch?.blockers.length)) {
			return { title: localize('ade.explore.reviewNeedsAttention', "Diagram review needs attention"), description: localize('ade.explore.reviewResolve', "Continue generation to resolve pending diagrams before applying the set."), icon: Codicon.warning, tone: 'attention' };
		}
		if (exploration?.phase === 'planning' || exploration?.phase === 'diagrams') {
			return {
				title: localize('ade.explore.generationPaused', "Generation paused"),
				description: prepared ? localize('ade.explore.resumeScopeWithDrafts', "{0} · {1} drafts prepared", scopeLabel, prepared) : scopeLabel,
				icon: Codicon.history, tone: 'ready'
			};
		}
		if (exploration?.phase === 'discovery' && exploration.usage.toolCalls > 0) {
			return { title: localize('ade.explore.discoveryPaused', "Feature discovery paused"), description: localize('ade.explore.resumeDiscovery', "Continue from the saved step."), icon: Codicon.history, tone: 'ready' };
		}
		return { title: localize('ade.explore.ready', "Ready to explore"), description: localize('ade.explore.readyDescription', "Identify features in your source code and prepare their diagrams for review."), icon: Codicon.sparkle, tone: 'ready' };
	}

	private liveStatus(): string {
		const live = this.ai.diagramLiveProgress;
		const tool = live?.activeTool && toolLabel(live.activeTool);
		if (live?.state === 'tool' && tool) { return localize('ade.explore.currentActivity', "In progress · {0}", tool); }
		if (!live) { return localize('ade.explore.starting', "Starting the exploration…"); }
		if (live.state === 'stopping') { return localize('ade.explore.stoppingActivity', "Keeping the progress already saved."); }
		if (live.state === 'connecting') { return localize('ade.explore.connecting', "Connecting to the AI provider…"); }
		const completed = live.lastCompletedTool && toolLabel(live.lastCompletedTool);
		if (live.state === 'waiting') {
			return completed ? localize('ade.explore.waitingAfterTool', "Waiting for the AI provider · Last completed · {0}", completed) : localize('ade.explore.waiting', "Waiting for the AI provider…");
		}
		return completed ? localize('ade.explore.lastActivity', "Last completed · {0}", completed) : localize('ade.explore.working', "Analyzing project evidence…");
	}

	private renderSteps(parent: HTMLElement, current: number): void {
		const list = dom.append(parent, dom.$('ol.ade-explore-steps', { 'aria-label': localize('ade.explore.steps', "Exploration stages") }));
		for (const [index, step] of steps.entries()) {
			const state = index < current ? 'complete' : index === current ? 'current' : 'pending';
			const li = dom.append(list, dom.$('li', { 'data-state': state }));
			if (state === 'current') { li.setAttribute('aria-current', 'step'); }
			const marker = dom.append(li, dom.$('span.ade-explore-step-icon'));
			prependAdeIcon(marker, state === 'complete' ? Codicon.check : step.icon);
			const text = dom.append(li, dom.$('span.ade-explore-step-label'));
			text.textContent = step.label;
			if (state === 'complete') { li.setAttribute('aria-label', localize('ade.explore.stepComplete', "{0} complete", step.label)); }
		}
	}

	private renderProgress(parent: HTMLElement, scope: readonly DiagramPlanItem[], tasks: ReadonlyMap<string, DiagramTask>): void {
		const progress = dom.append(parent, dom.$<HTMLProgressElement>('progress.ade-explore-progress', { 'aria-label': localize('ade.diagramGenerationProgress', "Diagram Generation Progress") }));
		if (scope.length) {
			const done = scope.filter(item => draftReady(tasks.get(item.id))).length;
			progress.max = scope.length;
			progress.value = done;
			const label = localize('ade.explore.scopeProgress', "{0} of {1} diagrams prepared in this scope", done, scope.length);
			progress.setAttribute('aria-valuetext', label);
			dom.append(parent, dom.$('p.ade-explore-progress-label')).textContent = label;
		}
	}

	private renderPlan(parent: HTMLElement, exploration: CodeDiagramExploration, items: readonly DiagramPlanItem[], tasks: ReadonlyMap<string, DiagramTask>, running: boolean): void {
		const features = exploration.featureCatalog?.features;
		const counts = [];
		if (features) { counts.push(features.length === 1 ? localize('ade.explore.oneFeature', "1 feature") : localize('ade.explore.featureCount', "{0} features", features.length)); }
		const included = items.filter(item => tasks.get(item.id)?.status !== 'cancelled');
		if (included.length) { counts.push(localize('ade.explore.planProgress', "{0}/{1} drafts", included.filter(item => draftReady(tasks.get(item.id))).length, included.length)); }
		const plan = this.disclosure(parent, features ? localize('ade.explore.featurePlan', "Features and Diagram Plan") : localize('ade.explore.plan', "Diagram Plan"), features ? 'exploration-feature-plan' : 'exploration-plan', Codicon.listTree, counts.join(' · '));
		const system = { id: undefined, name: localize('ade.explore.systemScope', "System Overview"), description: '' };
		for (const group of [system, ...(features ?? [])]) {
			const groupPlan = exploration.featurePlans?.find(entry => entry.featureId === group.id);
			const groupItems = features ? items.filter(item => item.featureId === group.id) : items;
			if (!group.id && !groupPlan && !groupItems.length) { continue; }
			const section = dom.append(plan, dom.$('section.ade-explore-plan-group'));
			if (features) { dom.append(section, dom.$('h3')).textContent = group.name; }
			if (group.description) { dom.append(section, dom.$('p')).textContent = group.description; }
			if (groupItems.length) {
				const list = dom.append(section, dom.$('ul.ade-explore-views'));
				for (const item of groupItems) {
					const task = tasks.get(item.id);
					const row = dom.append(list, dom.$('li'));
					const main = dom.append(row, dom.$('div.ade-explore-view'));
					prependAdeIcon(main, diagramIcon(item.viewKind));
					const name = dom.append(main, dom.$('span'));
					name.textContent = item.name;
					dom.append(main, dom.$('small')).textContent = viewLabels[item.viewKind];
					const status = taskStatus(task, item.id === exploration.nextTaskId, running);
					dom.append(main, dom.$('span.ade-explore-tag', { 'data-tone': status.tone })).textContent = status.label;
					const parentItem = items.find(candidate => candidate.id === item.parentId);
					if (parentItem) { dom.append(row, dom.$('p')).textContent = localize('ade.explore.planParent', "Detail of {0}", parentItem.name); }
					const proposal = exploration.proposals.find(entry => entry.id === task?.proposalId);
					if (proposal) { this.renderDiagnostics(row, proposal); }
				}
			} else if (!groupPlan) { dom.append(section, dom.$('p')).textContent = localize('ade.explore.featurePlanPending', "Diagram Plan Pending"); }
			for (const gap of groupPlan?.gaps ?? []) { dom.append(section, dom.$('p.ade-explore-notice')).textContent = gap; }
		}
	}

	private renderActivity(parent: HTMLElement, exploration: CodeDiagramExploration, busy: boolean): void {
		const activity = this.disclosure(parent, localize('ade.explore.activityDetails', "Activity Details"), 'exploration-activity', Codicon.history);
		const events = this.ai.diagramActivity ?? [];
		if (events.length) {
			const log = dom.append(activity, dom.$('ol.ade-explore-log', { 'aria-label': localize('ade.explore.recentActivity', "Recent activity"), tabindex: '0' }));
			this.controls.trackFocus('exploration-log', log);
			for (const event of [...events].reverse()) {
				const entry = dom.append(log, dom.$('li'));
				prependAdeIcon(entry, event.kind === 'tool' ? Codicon.tools : Codicon.commentDiscussion);
				const content = dom.append(entry, dom.$('div'));
				dom.append(content, dom.$('strong')).textContent = event.kind === 'tool' ? toolLabel(event.text) ?? localize('ade.explore.activityToolGroup', "Tool") : localize('ade.explore.activityMessageGroup', "Assistant");
				dom.append(content, dom.$(event.kind === 'tool' ? 'code' : 'p')).textContent = event.text;
			}
		} else if (exploration.phase) {
			dom.append(activity, dom.$('p')).textContent = localize('ade.explore.noActivity', "No activity recorded for this session yet.");
		}
		const usage = this.disclosure(activity, localize('ade.explore.usageDetails', "Exploration Usage"), 'exploration-usage', Codicon.pulse);
		const grid = dom.append(usage, dom.$('dl.ade-explore-usage'));
		this.metric(grid, localize('ade.explore.toolCalls', "Local tool calls"), localize('ade.explore.usageFraction', "{0} / {1}", exploration.usage.toolCalls, exploration.budget.maxToolCalls));
		this.metric(grid, localize('ade.explore.retrieved', "Source retrieved"), localize('ade.explore.readFraction', "{0} / {1} KiB", Math.ceil(exploration.usage.readBytes / 1024), Math.ceil(exploration.budget.maxReadBytes / 1024)));
		if (exploration.budgetWindow) {
			const remaining = exploration.budgetWindow.remainingMs;
			this.metric(grid, localize('ade.explore.remaining', "Time remaining at last refresh"), `${Math.floor(remaining / 60000)}:${String(Math.floor(remaining / 1000) % 60).padStart(2, '0')}`);
		}
		if (exploration.usage.turnsObservable) {
			this.metric(grid, localize('ade.explore.modelTurns', "Reported request turns"), localize('ade.explore.usageFraction', "{0} / {1}", exploration.usage.modelTurns.length, exploration.budget.maxModelTurns));
		}
		const goals = this.disclosure(activity, localize('ade.explore.goals', "Exploration Goals and Gaps"), 'exploration-goals', Codicon.tasklist);
		for (const task of exploration.tasks) {
			dom.append(goals, dom.$('p')).textContent = task.intent;
			for (const gap of task.gaps) { dom.append(goals, dom.$('p.ade-explore-notice')).textContent = gap; }
		}
		dom.append(goals, dom.$('p')).textContent = localize('ade.explore.coverage', "Inventory, Analyzer Coverage and Explored Responsibilities Are Separate. An Unexplored Area Is Not a Verified Absence.");
		this.action(goals, localize('ade.explore.adjustBudget', "Add Exploration Budget"), Codicon.settingsGear, () => this.ai.configureDiagramBudget(), 'exploration-budget').disabled = busy;
	}

	private metric(parent: HTMLElement, label: string, value: string): void {
		const entry = dom.append(parent, dom.$('div'));
		dom.append(entry, dom.$('dt')).textContent = label;
		dom.append(entry, dom.$('dd')).textContent = value;
	}

	private renderDiagnostics(parent: HTMLElement, proposal: Proposal): void {
		if (!proposal.diagnostics.length) { return; }
		const inferred = proposal.diagnostics.filter(diagnostic => diagnostic.code === 'contract' && diagnostic.args[0] === 'fidelity' && diagnostic.args[1] === 'inferredOrder').length;
		if (inferred) {
			dom.append(parent, dom.$('p.ade-explore-notice')).textContent = localize('ade.explore.inferredOrder', "Inferred Ordering Constraints: {0}. Review the Source Evidence; Runtime Behavior Has Not Been Verified.", inferred);
		}
		const technical = this.disclosure(parent, localize('ade.explore.diagnosticDetails', "Diagnostic Details ({0})", proposal.diagnostics.length), `proposal-diagnostics:${proposal.id}`, Codicon.output);
		for (const diagnostic of proposal.diagnostics) {
			dom.append(technical, dom.$('p')).textContent = `${diagnostic.code} · ${diagnostic.path} · ${diagnostic.args.join(' · ')}`;
		}
	}

	private reviewDraft(parent: HTMLElement, proposal: Proposal, disabled: boolean, primary: boolean): void {
		this.action(parent, localize('ade.explore.reviewDraft', "Review Draft"), Codicon.eye, () => this.ai.reviewDiagramProposal(proposal.id), `proposal-review:${proposal.id}`, primary).disabled = disabled;
	}

	private action(parent: HTMLElement, label: string, icon: ThemeIcon, run: () => unknown, id: string, primary = false): HTMLButtonElement {
		const button = this.controls.button(parent, label, run, id);
		button.classList.add('ade-explore-button');
		button.classList.toggle('ade-primary-action', primary);
		prependAdeIcon(button, icon);
		return button;
	}

	private disclosure(parent: HTMLElement, label: string, id: string, icon: ThemeIcon, meta?: string): HTMLElement {
		const content = this.controls.details(parent, label, id);
		const details = content.parentElement!;
		details.classList.add('ade-explore-details');
		const summary = details.firstElementChild as HTMLElement;
		const text = dom.$('span.ade-explore-detail-label');
		text.textContent = label;
		summary.replaceChildren(text);
		prependAdeIcon(summary, icon);
		prependAdeIcon(summary, Codicon.chevronRight);
		if (meta) { dom.append(summary, dom.$('span.ade-explore-detail-meta')).textContent = meta; }
		return content;
	}
}
