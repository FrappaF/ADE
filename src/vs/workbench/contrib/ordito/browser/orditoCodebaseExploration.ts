import './media/orditoCodebaseExploration.css';
import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { type ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { type CodeDiagramExploration } from '../common/codeBridge.js';
import { getDiagramExplorationPhase } from '../common/diagramExplorationState.js';
import { type IOrditoAiService } from './orditoAiService.js';
import { type IOrditoCodeService } from './orditoCodeService.js';
import { type OrditoControls } from './orditoControls.js';
import { diagramIcon, prependOrditoIcon } from './orditoIcons.js';
import { viewLabels } from './orditoLabels.js';
import { renderOrditoWorkflowSteps } from './orditoWorkflowSteps.js';

type DiagramPlanItem = NonNullable<CodeDiagramExploration['plan']>['items'][number];
type DiagramTask = CodeDiagramExploration['tasks'][number];
type Proposal = CodeDiagramExploration['proposals'][number];
type Stage = { title: string; description?: string; icon: ThemeIcon; tone: 'ready' | 'active' | 'attention' | 'success' };

const steps = [
	{ label: localize('ordito.explore.step.inventory', "Inventory"), icon: Codicon.repo },
	{ label: localize('ordito.explore.step.features', "Features"), icon: Codicon.symbolEvent },
	{ label: localize('ordito.explore.step.diagrams', "Diagrams"), icon: Codicon.typeHierarchy },
	{ label: localize('ordito.explore.step.review', "Review"), icon: Codicon.eye }
];

function toolLabel(tool: string): string | undefined {
	switch (tool) {
		case 'ordito_project_inspect': return localize('ordito.explore.tool.inventory', "Inspect source inventory");
		case 'ordito_source_search': return localize('ordito.explore.tool.search', "Search source code");
		case 'ordito_source_read': return localize('ordito.explore.tool.read', "Read source evidence");
		case 'ordito_code_references': return localize('ordito.explore.tool.references', "Check code references");
		case 'ordito_model_query':
		case 'ordito_model_query_batch': return localize('ordito.explore.tool.model', "Check existing architecture elements");
		case 'ordito_feature_catalog': return localize('ordito.explore.tool.features', "Save the feature catalog");
		case 'ordito_diagram_plan': return localize('ordito.explore.tool.plan', "Save the diagram plan");
		case 'ordito_model_propose': return localize('ordito.explore.tool.propose', "Save a diagram draft");
		case 'ordito_view_preview': return localize('ordito.explore.tool.preview', "Validate a diagram preview");
		case 'ordito_proposal_discard': return localize('ordito.explore.tool.archive', "Archive an invalid draft");
		case 'ordito_task_update': return localize('ordito.explore.tool.checkpoint', "Save diagram progress");
		case 'ordito_audit_inventory': return localize('ordito.explore.tool.auditInventory', "Compare code and diagram coverage");
		case 'ordito_audit_diagram': return localize('ordito.explore.tool.auditDiagram', "Inspect a generated diagram");
		case 'ordito_audit_reuse': return localize('ordito.explore.tool.auditReuse', "Check shared diagram elements");
		case 'ordito_audit_submit': return localize('ordito.explore.tool.auditSubmit', "Save the codebase audit report");
		case 'ordito_audit_report': return localize('ordito.explore.tool.auditReport', "Read the codebase audit finding");
		case 'ordito_audit_repair': return localize('ordito.explore.tool.auditRepair', "Apply a correction to the draft set");
	}
	return undefined;
}

function draftReady(task: DiagramTask | undefined): boolean {
	return task?.status === 'ready' || task?.status === 'applied';
}

function taskStatus(task: DiagramTask | undefined, current: boolean, running: boolean): { label: string; tone: Stage['tone'] } {
	switch (task?.status) {
		case 'applied': return { label: localize('ordito.explore.applied', "Applied"), tone: 'success' };
		case 'ready': return { label: localize('ordito.explore.generated', "Draft Prepared"), tone: 'success' };
		case 'cancelled': return { label: localize('ordito.explore.excluded', "Excluded"), tone: 'ready' };
		case 'blocked': case 'waitingContext': case 'waitingUser': return { label: localize('ordito.explore.taskBlocked', "Needs attention"), tone: 'attention' };
	}
	return current && running ? { label: localize('ordito.explore.running', "Generating"), tone: 'active' } : { label: localize('ordito.explore.pending', "Pending"), tone: 'ready' };
}

/** Project import and its saved checkpoints, rendered without opening the AI conversation. */
export class OrditoCodebaseExploration {
	constructor(private readonly controls: OrditoControls, private readonly ai: IOrditoAiService, private readonly code: IOrditoCodeService) { }

	renderHeader(parent: HTMLElement): void {
		const header = dom.append(parent, dom.$('header.ordito-explore-header'));
		const identity = dom.append(header, dom.$('div.ordito-explore-identity'));
		const icon = dom.append(identity, dom.$('span.ordito-explore-project-icon'));
		prependOrditoIcon(icon, Codicon.repo);
		const copy = dom.append(identity, dom.$('div.ordito-explore-heading'));
		dom.append(copy, dom.$('h1')).textContent = localize('ordito.import.interpretTitle', "Explore Your Codebase");
		const context = this.code.context;
		if (!context) { return; }
		if (context.files && context.declarations) {
			const files = context.files.filter(file => file.status !== 'excluded').length;
			const declarations = context.declarations.length;
			const fileLabel = files === 1 ? localize('ordito.explore.oneSourceFile', "1 source file") : localize('ordito.explore.sourceFiles', "{0} source files", files);
			const declarationLabel = declarations === 1 ? localize('ordito.explore.oneDeclaration', "1 indexed declaration") : localize('ordito.explore.declarations', "{0} indexed declarations", declarations);
			dom.append(copy, dom.$('p')).textContent = localize('ordito.explore.sourceSummary', "{0} · {1}", fileLabel, declarationLabel);
		}
		this.action(header, localize('ordito.code.inspect', "Inspect Code Evidence"), Codicon.fileCode, () => this.code.inspect(), 'inventory-evidence').disabled = this.code.busy;
	}

	render(parent: HTMLElement, exploration: CodeDiagramExploration | undefined, landing: boolean): void {
		const panel = dom.append(parent, dom.$('section.ordito-explore', { 'aria-label': localize('ordito.explore.title', "Architecture Exploration") }));
		if (landing) { this.renderHeader(panel); }
		else { dom.append(panel, dom.$('h2.ordito-explore-title')).textContent = localize('ordito.explore.title', "Architecture Exploration"); }

		const phase = getDiagramExplorationPhase(exploration);
		const running = this.ai.generatingDiagrams;
		const clarification = running ? undefined : this.ai.diagramClarification;
		const issue = running ? undefined : this.ai.diagramExplorationIssue;
		const items = exploration?.plan?.items ?? [];
		const tasks = new Map(exploration?.tasks.map(task => [task.id, task]));
		const prepared = items.filter(item => draftReady(tasks.get(item.id))).length;
		const preparingDiagrams = items.length > 0 || !!exploration?.phase && exploration.phase !== 'discovery';
		const currentStep = phase === 'applied' ? steps.length : phase === 'review' || exploration?.phase === 'review' ? 3 : preparingDiagrams ? 2 : 1;

		const card = dom.append(panel, dom.$('div.ordito-explore-card'));
		renderOrditoWorkflowSteps(card, localize('ordito.explore.steps', "Exploration stages"), steps, currentStep);
		const stage = this.getStage(exploration, phase, running, prepared, clarification, issue);
		const body = dom.append(card, dom.$('div.ordito-explore-stage', { 'data-tone': stage.tone }));
		const content = dom.append(body, dom.$('div.ordito-explore-stage-main'));
		const glyph = dom.append(content, dom.$('span.ordito-explore-stage-icon'));
		prependOrditoIcon(glyph, stage.icon);
		if (running) { glyph.classList.add('ordito-explore-stage-icon-running'); }
		const copy = dom.append(content, dom.$('div.ordito-explore-stage-copy'));
		const announcement = dom.append(copy, dom.$('div.ordito-explore-live', { role: 'status' }));
		dom.append(announcement, dom.$(landing ? 'h2' : 'h3')).textContent = stage.title;
		if (stage.description) { dom.append(announcement, dom.$('p')).textContent = stage.description; }
		const live = running ? this.liveStatus() : undefined;
		if (live) {
			const activity = dom.append(announcement, dom.$('p.ordito-explore-now'));
			activity.textContent = live;
			prependOrditoIcon(activity, Codicon.pulse);
		}
		if (running && this.ai.diagramLiveProgress?.retrying && this.ai.diagramLiveProgress.state !== 'stopping') {
			dom.append(announcement, dom.$('p.ordito-explore-notice')).textContent = localize('ordito.explore.retryingTimeout', "Resuming the saved step after the AI provider timed out.");
		}
		if (exploration?.invalidation?.viewIds.length) {
			dom.append(copy, dom.$('p.ordito-explore-notice')).textContent = localize('ordito.explore.staleViews', "{0} Diagrams Have Changed Source Evidence · Review the Affected Scenarios", exploration.invalidation.viewIds.length);
		}

		const busy = this.ai.busy || this.code.busy;
		const drafts = exploration?.proposals.filter(proposal => proposal.status !== 'applied') ?? [];
		const actions = dom.append(body, dom.$('div.ordito-explore-actions'));
		if (running && this.ai.stopDiagramExploration) {
			const stopping = this.ai.diagramLiveProgress?.state === 'stopping';
			this.action(actions, stopping ? localize('ordito.explore.stopping', "Stopping…") : localize('ordito.explore.stop', "Stop Generation"), Codicon.debugStop, () => this.ai.stopDiagramExploration?.(), 'exploration-action').disabled = stopping;
		} else if (clarification && this.ai.clarifyDiagramExploration) {
			this.action(actions, localize('ordito.explore.continueWithAnswer', "Answer and Continue"), Codicon.commentDiscussion, () => this.ai.clarifyDiagramExploration?.(), 'exploration-action', true).disabled = busy;
		} else if (phase === 'review' && exploration?.workflow === 'project') {
			this.action(actions, localize('ordito.explore.reviewAll', "Review All Changes"), Codicon.eye, () => this.ai.reviewDiagramProposal(), exploration.phase ? 'exploration-action' : 'project-review', true).disabled = busy;
		} else if (!running && phase !== 'applied' && phase !== 'review') {
			const label = exploration ? exploration.workflow === 'project' ? localize('ordito.explore.continueProject', "Continue Generation") : localize('ordito.explore.continue', "Continue Exploration") : localize('ordito.explore.start', "Explore Architecture");
			this.action(actions, label, exploration ? Codicon.play : Codicon.sparkle, () => this.ai.resumeDiagrams(), 'exploration-action', true).disabled = busy;
			if (exploration?.workflow === 'project' && drafts.length && (!exploration.phase || exploration.phase === 'review')) {
				this.action(actions, localize('ordito.explore.reviewAll', "Review All Changes"), Codicon.eye, () => this.ai.reviewDiagramProposal(), 'project-review').disabled = busy;
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
			const details = this.disclosure(panel, proposal.views.map(view => view.name).join(', ') || localize('ordito.explore.untitledDraft', "Diagram Draft"), `exploration-proposal:${proposal.id}`, Codicon.typeHierarchy);
			dom.append(details, dom.$('p')).textContent = proposal.status === 'ready' ? localize('ordito.explore.draftReady', "Draft Ready for Review") : localize('ordito.explore.draftBlocked', "Draft Needs Correction");
			this.renderDiagnostics(details, proposal);
			if (exploration.workflow !== 'project' && !(phase === 'review' && drafts.length === 1)) { this.reviewDraft(details, proposal, busy, phase === 'review'); }
		}
		this.renderActivity(panel, exploration, busy);
	}

	private getStage(exploration: CodeDiagramExploration | undefined, phase: ReturnType<typeof getDiagramExplorationPhase>, running: boolean, prepared: number, clarification?: string, issue?: string): Stage {
		if (phase === 'applied') { return { title: localize('ordito.explore.allApplied', "All Diagram Changes Applied"), icon: Codicon.check, tone: 'success' }; }
		if (clarification) { return { title: localize('ordito.explore.clarification', "Clarification Needed"), description: clarification, icon: Codicon.commentDiscussion, tone: 'attention' }; }
		if (phase === 'review' && exploration && !running) {
			const count = exploration.proposals.filter(proposal => proposal.status === 'ready').reduce((sum, proposal) => sum + proposal.views.length, 0);
			return {
				title: localize('ordito.explore.stage.review', "Diagrams ready for review"),
				description: count === 1 ? localize('ordito.explore.reviewOneDraft', "1 diagram draft to review before applying.") : localize('ordito.explore.reviewDrafts', "{0} diagram drafts to review before applying.", count),
				icon: Codicon.check, tone: 'success'
			};
		}
		const scope = exploration?.featureCatalog?.features.find(feature => feature.id === exploration.nextFeatureId)?.name ?? localize('ordito.explore.systemScope', "System Overview");
		const item = exploration?.plan?.items.find(item => item.id === exploration.nextTaskId);
		const scopeLabel = item ? localize('ordito.explore.currentDiagram', "{0} · {1}", scope, item.name) : scope;
		if (running) {
			switch (exploration?.phase) {
				case 'planning': return { title: localize('ordito.explore.stage.planning', "Planning diagrams"), description: scope, icon: Codicon.listTree, tone: 'active' };
				case 'diagrams': return { title: localize('ordito.explore.stage.generating', "Generating diagrams"), description: scopeLabel, icon: Codicon.typeHierarchy, tone: 'active' };
				case 'audit': return { title: localize('ordito.explore.stage.audit', "Checking diagrams against the codebase"), description: localize('ordito.explore.stage.auditDetail', "The audit checks coverage, source evidence and shared model elements."), icon: Codicon.inspect, tone: 'active' };
				case 'repair': return { title: localize('ordito.explore.stage.repair', "Correcting diagrams from the audit"), description: exploration.auditReport?.findings.find(finding => finding.id === exploration.nextFindingId)?.summary, icon: Codicon.tools, tone: 'active' };
				case 'review': return { title: localize('ordito.explore.stage.modelCheck', "Checking the diagram set"), icon: Codicon.inspect, tone: 'active' };
				default: return { title: localize('ordito.explore.stage.discovery', "Identifying project features"), icon: Codicon.search, tone: 'active' };
			}
		}
		if (exploration?.budgetStatus?.exhausted.length) { return { title: localize('ordito.explore.budgetReached', "Exploration budget reached"), description: localize('ordito.explore.budgetResume', "Continue generation to adjust the budget and resume from the saved step."), icon: Codicon.warning, tone: 'attention' }; }
		if (issue) { return { title: localize('ordito.explore.generationPaused', "Generation paused"), description: issue, icon: Codicon.warning, tone: 'attention' }; }
		if (exploration?.phase === 'review' || (!exploration?.phase && exploration?.batch?.blockers.length)) {
			return { title: localize('ordito.explore.reviewNeedsAttention', "Diagram review needs attention"), description: localize('ordito.explore.reviewResolve', "Continue generation to resolve pending diagrams before applying the set."), icon: Codicon.warning, tone: 'attention' };
		}
		if (exploration?.phase === 'audit' || exploration?.phase === 'repair') {
			return {
				title: exploration.phase === 'audit' ? localize('ordito.explore.auditPaused', "Diagram audit paused") : localize('ordito.explore.repairPaused', "Diagram corrections paused"),
				description: localize('ordito.explore.auditResume', "Continue generation to resume this step."), icon: Codicon.history, tone: 'ready'
			};
		}
		if (exploration?.phase === 'planning' || exploration?.phase === 'diagrams') {
			return {
				title: localize('ordito.explore.generationPaused', "Generation paused"),
				description: prepared ? localize('ordito.explore.resumeScopeWithDrafts', "{0} · {1} drafts prepared", scopeLabel, prepared) : scopeLabel,
				icon: Codicon.history, tone: 'ready'
			};
		}
		if (exploration?.phase === 'discovery' && exploration.usage.toolCalls > 0) {
			return { title: localize('ordito.explore.discoveryPaused', "Feature discovery paused"), description: localize('ordito.explore.resumeDiscovery', "Continue from the saved step."), icon: Codicon.history, tone: 'ready' };
		}
		return { title: localize('ordito.explore.ready', "Ready to explore"), description: localize('ordito.explore.readyDescription', "Identify features in your source code and prepare their diagrams for review."), icon: Codicon.sparkle, tone: 'ready' };
	}

	private liveStatus(): string {
		const live = this.ai.diagramLiveProgress;
		const tool = live?.activeTool && toolLabel(live.activeTool);
		if (live?.state === 'tool' && tool) { return localize('ordito.explore.currentActivity', "In progress · {0}", tool); }
		if (!live) { return localize('ordito.explore.starting', "Starting the exploration…"); }
		if (live.state === 'stopping') { return localize('ordito.explore.stoppingActivity', "Keeping the progress already saved."); }
		if (live.state === 'connecting') { return localize('ordito.explore.connecting', "Connecting to the AI provider…"); }
		const completed = live.lastCompletedTool && toolLabel(live.lastCompletedTool);
		if (live.state === 'waiting') {
			return completed ? localize('ordito.explore.waitingAfterTool', "Waiting for the AI provider · Last completed · {0}", completed) : localize('ordito.explore.waiting', "Waiting for the AI provider…");
		}
		return completed ? localize('ordito.explore.lastActivity', "Last completed · {0}", completed) : localize('ordito.explore.working', "Analyzing project evidence…");
	}

	private renderProgress(parent: HTMLElement, scope: readonly DiagramPlanItem[], tasks: ReadonlyMap<string, DiagramTask>): void {
		const progress = dom.append(parent, dom.$<HTMLProgressElement>('progress.ordito-explore-progress', { 'aria-label': localize('ordito.diagramGenerationProgress', "Diagram Generation Progress") }));
		if (scope.length) {
			const done = scope.filter(item => draftReady(tasks.get(item.id))).length;
			progress.max = scope.length;
			progress.value = done;
			const label = localize('ordito.explore.scopeProgress', "{0} of {1} diagrams prepared in this scope", done, scope.length);
			progress.setAttribute('aria-valuetext', label);
			dom.append(parent, dom.$('p.ordito-explore-progress-label')).textContent = label;
		}
	}

	private renderPlan(parent: HTMLElement, exploration: CodeDiagramExploration, items: readonly DiagramPlanItem[], tasks: ReadonlyMap<string, DiagramTask>, running: boolean): void {
		const features = exploration.featureCatalog?.features;
		const counts = [];
		if (features) { counts.push(features.length === 1 ? localize('ordito.explore.oneFeature', "1 feature") : localize('ordito.explore.featureCount', "{0} features", features.length)); }
		const included = items.filter(item => tasks.get(item.id)?.status !== 'cancelled');
		if (included.length) { counts.push(localize('ordito.explore.planProgress', "{0}/{1} drafts", included.filter(item => draftReady(tasks.get(item.id))).length, included.length)); }
		const plan = this.disclosure(parent, features ? localize('ordito.explore.featurePlan', "Features and Diagram Plan") : localize('ordito.explore.plan', "Diagram Plan"), features ? 'exploration-feature-plan' : 'exploration-plan', Codicon.listTree, counts.join(' · '));
		const system = { id: undefined, name: localize('ordito.explore.systemScope', "System Overview"), description: '' };
		for (const group of [system, ...(features ?? [])]) {
			const groupPlan = exploration.featurePlans?.find(entry => entry.featureId === group.id);
			const groupItems = features ? items.filter(item => item.featureId === group.id) : items;
			if (!group.id && !groupPlan && !groupItems.length) { continue; }
			const section = dom.append(plan, dom.$('section.ordito-explore-plan-group'));
			if (features) { dom.append(section, dom.$('h3')).textContent = group.name; }
			if (group.description) { dom.append(section, dom.$('p')).textContent = group.description; }
			if (groupItems.length) {
				const list = dom.append(section, dom.$('ul.ordito-explore-views'));
				for (const item of groupItems) {
					const task = tasks.get(item.id);
					const row = dom.append(list, dom.$('li'));
					const main = dom.append(row, dom.$('div.ordito-explore-view'));
					prependOrditoIcon(main, diagramIcon(item.viewKind));
					const name = dom.append(main, dom.$('span'));
					name.textContent = item.name;
					dom.append(main, dom.$('small')).textContent = viewLabels[item.viewKind];
					const status = taskStatus(task, item.id === exploration.nextTaskId, running);
					dom.append(main, dom.$('span.ordito-explore-tag', { 'data-tone': status.tone })).textContent = status.label;
					const parentItem = items.find(candidate => candidate.id === item.parentId);
					if (parentItem) { dom.append(row, dom.$('p')).textContent = localize('ordito.explore.planParent', "Detail of {0}", parentItem.name); }
					const proposal = exploration.proposals.find(entry => entry.id === task?.proposalId);
					if (proposal) { this.renderDiagnostics(row, proposal); }
				}
			} else if (!groupPlan) { dom.append(section, dom.$('p')).textContent = localize('ordito.explore.featurePlanPending', "Diagram Plan Pending"); }
			for (const gap of groupPlan?.gaps ?? []) { dom.append(section, dom.$('p.ordito-explore-notice')).textContent = gap; }
		}
	}

	private renderActivity(parent: HTMLElement, exploration: CodeDiagramExploration, busy: boolean): void {
		const activity = this.disclosure(parent, localize('ordito.explore.activityDetails', "Activity Details"), 'exploration-activity', Codicon.history);
		const events = this.ai.diagramActivity ?? [];
		if (events.length) {
			const log = dom.append(activity, dom.$('ol.ordito-explore-log', { 'aria-label': localize('ordito.explore.recentActivity', "Recent activity"), tabindex: '0' }));
			this.controls.trackFocus('exploration-log', log);
			for (const event of [...events].reverse()) {
				const entry = dom.append(log, dom.$('li'));
				prependOrditoIcon(entry, event.kind === 'tool' ? Codicon.tools : Codicon.commentDiscussion);
				const content = dom.append(entry, dom.$('div'));
				dom.append(content, dom.$('strong')).textContent = event.kind === 'tool' ? toolLabel(event.text) ?? localize('ordito.explore.activityToolGroup', "Tool") : localize('ordito.explore.activityMessageGroup', "Assistant");
				dom.append(content, dom.$(event.kind === 'tool' ? 'code' : 'p')).textContent = event.text;
			}
		} else if (exploration.phase) {
			dom.append(activity, dom.$('p')).textContent = localize('ordito.explore.noActivity', "No activity recorded for this session yet.");
		}
		const usage = this.disclosure(activity, localize('ordito.explore.usageDetails', "Exploration Usage"), 'exploration-usage', Codicon.pulse);
		const grid = dom.append(usage, dom.$('dl.ordito-explore-usage'));
		this.metric(grid, localize('ordito.explore.toolCalls', "Local tool calls"), localize('ordito.explore.usageFraction', "{0} / {1}", exploration.usage.toolCalls, exploration.budget.maxToolCalls));
		this.metric(grid, localize('ordito.explore.toolResponseData', "Tool response data"), localize('ordito.explore.readFraction', "{0} / {1} KiB", Math.ceil(exploration.usage.readBytes / 1024), Math.ceil(exploration.budget.maxReadBytes / 1024)));
		if (exploration.budgetWindow) {
			const remaining = exploration.budgetWindow.remainingMs;
			this.metric(grid, localize('ordito.explore.remaining', "Time remaining at last refresh"), `${Math.floor(remaining / 60000)}:${String(Math.floor(remaining / 1000) % 60).padStart(2, '0')}`);
		}
		if (exploration.usage.turnsObservable) {
			this.metric(grid, localize('ordito.explore.modelTurns', "Reported request turns"), localize('ordito.explore.usageFraction', "{0} / {1}", exploration.usage.modelTurns.length, exploration.budget.maxModelTurns));
		}
		const goals = this.disclosure(activity, localize('ordito.explore.goals', "Exploration Goals and Gaps"), 'exploration-goals', Codicon.tasklist);
		for (const task of exploration.tasks) {
			dom.append(goals, dom.$('p')).textContent = task.intent;
			for (const gap of task.gaps) { dom.append(goals, dom.$('p.ordito-explore-notice')).textContent = gap; }
		}
		dom.append(goals, dom.$('p')).textContent = localize('ordito.explore.coverage', "Inventory, Analyzer Coverage and Explored Responsibilities Are Separate. An Unexplored Area Is Not a Verified Absence.");
		this.action(goals, localize('ordito.explore.adjustBudget', "Add Exploration Budget"), Codicon.settingsGear, () => this.ai.configureDiagramBudget(), 'exploration-budget').disabled = busy;
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
			dom.append(parent, dom.$('p.ordito-explore-notice')).textContent = localize('ordito.explore.inferredOrder', "Inferred Ordering Constraints: {0}. Review the Source Evidence; Runtime Behavior Has Not Been Verified.", inferred);
		}
		const technical = this.disclosure(parent, localize('ordito.explore.diagnosticDetails', "Diagnostic Details ({0})", proposal.diagnostics.length), `proposal-diagnostics:${proposal.id}`, Codicon.output);
		for (const diagnostic of proposal.diagnostics) {
			dom.append(technical, dom.$('p')).textContent = `${diagnostic.code} · ${diagnostic.path} · ${diagnostic.args.join(' · ')}`;
		}
	}

	private reviewDraft(parent: HTMLElement, proposal: Proposal, disabled: boolean, primary: boolean): void {
		this.action(parent, localize('ordito.explore.reviewDraft', "Review Draft"), Codicon.eye, () => this.ai.reviewDiagramProposal(proposal.id), `proposal-review:${proposal.id}`, primary).disabled = disabled;
	}

	private action(parent: HTMLElement, label: string, icon: ThemeIcon, run: () => unknown, id: string, primary = false): HTMLButtonElement {
		const button = this.controls.button(parent, label, run, id);
		button.classList.add('ordito-explore-button');
		button.classList.toggle('ordito-primary-action', primary);
		prependOrditoIcon(button, icon);
		return button;
	}

	private disclosure(parent: HTMLElement, label: string, id: string, icon: ThemeIcon, meta?: string): HTMLElement {
		const content = this.controls.details(parent, label, id);
		const details = content.parentElement!;
		details.classList.add('ordito-explore-details');
		const summary = details.firstElementChild as HTMLElement;
		const text = dom.$('span.ordito-explore-detail-label');
		text.textContent = label;
		summary.replaceChildren(text);
		prependOrditoIcon(summary, icon);
		prependOrditoIcon(summary, Codicon.chevronRight);
		if (meta) { dom.append(summary, dom.$('span.ordito-explore-detail-meta')).textContent = meta; }
		return content;
	}
}
