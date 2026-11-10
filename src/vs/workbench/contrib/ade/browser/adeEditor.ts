/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/ade.css';
import { localize } from '../../../../nls.js';
import * as dom from '../../../../base/browser/dom.js';
import { Emitter } from '../../../../base/common/event.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { type ModelView } from '../common/modelTypes.js';
import { isSourceEvidenceModel } from '../common/modelFoundation.js';
import { IAdeCodeService } from './adeCodeService.js';
import { IAdeAiService } from './adeAiService.js';
import { AdeInput } from './adeInput.js';
import { renderStructuralReview } from './adeStructuralReview.js';
import { renderAdeWelcome, renderAdeProjectStart } from './adeWelcome.js';
import { adeDocumentStatus } from './adeDocumentStatus.js';
import { describeAdeDiagram } from './adeAccessibleContent.js';
import { renderAdeDiagramReview } from './adeDiagramReview.js';
import { canonicalJson, semanticContent } from '../common/modelSerialization.js';
import { assertPureProject } from '../common/modelProject.js';
import { AdeProjectService, IAdeProjectService } from './adeProjectService.js';
import { getC4DrillDown } from '../common/modelBlueprint.js';
import { AdeControls } from './adeControls.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { adeFocusedSurface, getAdeAccessibilityHint } from './adeAccessibilityContext.js';
import { elementLabels, relationLabels, viewLabels } from './adeLabels.js';
import { getDiagramGroups, getElementPath } from '../common/visualNavigation.js';
import { getSystemMap } from '../common/systemMap.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IQuickInputService, type IQuickPickItem, type IQuickPickSeparator } from '../../../../platform/quickinput/common/quickInput.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { renderChangeImpact } from './adeImpact.js';
import { AdeCanvasController } from './adeCanvasController.js';
import { AdeCanvasSurface } from './adeCanvasSurface.js';
import { AdeInspector } from './adeInspector.js';
import { AdeWorkflowContent } from './adeWorkflowContent.js';
import { getDiagramExplorationPhase } from '../common/diagramExplorationState.js';

export class AdeEditor extends EditorPane {
	static readonly ID = AdeInput.ID;

	private root!: HTMLElement;

	private reviewOpen = false;

	private activeTab: 'workspace' | 'project' | 'ai' = 'workspace';

	private reviewContext: string | undefined;

	private activeReview: HTMLElement | undefined;

	private lastElementSelection = '';

	private readonly controls = this._register(new AdeControls());

	private readonly readingChanged = this._register(new Emitter<void>());

	readonly onDidChangeReading = this.readingChanged.event;

	private renderedContext: string | undefined;

	private content: HTMLElement | undefined;

	private readonly scrollPositions = new Map<string, { left: number; top: number }>();

	private readonly contentPositions = new Map<string, number>();

	protected override createEditor(parent: HTMLElement): void {
		this.root = dom.append(parent, dom.$('.ade-shell'));
		this.root.tabIndex = -1;
		this.root.setAttribute('aria-label', localize('ade.workbenchLabel', "A.D.E Visual Workbench"));
		adeFocusedSurface.bindTo(this._register(this.contextKeyService.createScoped(this.root))).set('editor');
		void this.project.restore();
		this.render();
		void this.ai.refreshConnection();
		this._register(dom.addDisposableListener(this.root, 'keydown', (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				if (this.surface.pendingConnection) { this.surface.pendingConnection = undefined; this.render(); }
				else if (this.surface.inspectorOpen) { this.surface.inspectorOpen = false; this.render(); this.canvas.canvasViewport?.focus(); }
				this.controls.setExpanded('canvas-actions', false);
			}
		}));
	}

	override layout(dimension: dom.Dimension): void {
		dom.size(this.root, dimension.width, dimension.height);
		this.root.classList.toggle('ade-narrow', dimension.width < 850);
		this.root.classList.toggle('ade-short', dimension.height < 480);
		this.canvas.applyCamera();
	}

	override focus(): void { this.root?.focus(); }

	showWorkspace(): void { this.activeTab = 'workspace'; if (this.root) { this.render(); } }

	captureAccessibilityFocus(): () => void { return this.controls.captureFocus(this.root); }

	describeCurrentContext(): string {
		return !this.project.error && !this.project.loading && this.root.classList.contains('ade-review-mode')
			? this.activeReview?.innerText ?? describeAdeDiagram(this.project)
			: describeAdeDiagram(this.project);
	}

	focusSelection(): void {
		if (!this.controls.focusTarget(`node:${this.project.selectedId}`)) { this.focus(); }
	}

	private revealElement(id: string, viewId?: string): void {
		this.surface.relationSelection = undefined;
		if (this.project.revealElement(id, viewId)) { this.focusSelection(); }
	}

	private button(parent: HTMLElement, label: string, action: () => void, id = label): HTMLButtonElement {
		return this.controls.button(parent, label, action, id);
	}

	private paragraph(parent: HTMLElement, content: string): void {
		dom.append(parent, dom.$('p')).textContent = content;
	}

	private render(): void {
		if (this.lastElementSelection !== this.project.selectedId || !this.project.activeView?.relationIds.includes(this.surface.relationSelection ?? '')) { this.surface.relationSelection = undefined; }
		this.lastElementSelection = this.project.selectedId;
		if (this.surface.pendingConnection && (this.surface.pendingConnection.version !== this.project.documentVersion || this.surface.pendingConnection.viewId !== this.project.activeView?.id)) { this.surface.pendingConnection = undefined; }
		this.root.setAttribute('aria-description', getAdeAccessibilityHint(this.configurationService, this.keybindingService));
		if (this.renderedContext) {
			if (this.canvas.canvasViewport) { this.scrollPositions.set(this.renderedContext, { left: this.canvas.canvasViewport.scrollLeft, top: this.canvas.canvasViewport.scrollTop }); }
			if (this.content) { this.contentPositions.set(this.renderedContext, this.content.scrollTop); }
		}
		this.canvas.canvasViewport = undefined;
		this.canvas.canvasContent = undefined;
		this.canvas.floatingMenu = undefined;
		this.canvas.floatingInspector = undefined;
		this.activeReview = undefined;
		this.renderedContext = `${this.project.modelUri?.toString() ?? 'demo'}:${this.project.section}:${this.project.section === 'element' || this.project.section === 'impact' ? this.project.selectedId : this.project.activeView?.id ?? ''}`;
		const reviewContext = this.ai.structuralReview ? `${this.ai.structuralReview.root}:${this.ai.structuralReview.id}` : undefined;
		if (reviewContext !== this.reviewContext) { this.reviewOpen = !!reviewContext; this.reviewContext = reviewContext; if (reviewContext) { this.activeTab = 'workspace'; } }
		const reviewMode = this.activeTab === 'workspace' && (!!this.ai.diagramReview || this.reviewOpen && !!this.ai.structuralReview && this.project.section !== 'home') && !this.project.error && !this.project.loading;
		this.root.classList.toggle('ade-review-mode', reviewMode);
		const sourceEvidence = isSourceEvidenceModel(this.project.model);
		const canvasMode = this.activeTab === 'workspace' && !reviewMode && !sourceEvidence && this.project.section === 'diagram' && !!this.project.activeView && !this.project.loading && !this.project.error && !this.project.hasStructuralErrors;
		this.root.classList.toggle('ade-canvas-mode', canvasMode);
		if (this.canvas.cameraKey) { this.canvas.cameras.set(this.canvas.cameraKey, { ...this.canvas.camera }); }
		const cameraKey = canvasMode ? `${this.project.projectRoot?.toString() ?? 'demo'}:${this.project.model.id}:${this.project.activeView!.id}` : undefined;
		if (canvasMode && cameraKey !== this.canvas.cameraKey) { this.canvas.camera = this.canvas.cameras.get(cameraKey ?? '') ?? { x: 80, y: 112, zoom: 1 }; this.canvas.cameraKey = cameraKey; this.surface.inspectorOpen = false; }
		this.canvas.interactions.clear();
		this.controls.render(this.root, () => {
			dom.clearNode(this.root);
			this.renderTabs(this.root);
			if (!canvasMode) { this.renderNavigation(this.root); }
			const content = dom.append(this.root, dom.$('main.ade-content'));
			this.content = content;
			content.setAttribute('role', 'tabpanel'); content.setAttribute('aria-labelledby', `ade-tab-${this.activeTab}`);
			if (this.activeTab === 'workspace' && !reviewMode && !canvasMode && !sourceEvidence && this.project.section !== 'home' && !this.project.error && !this.project.loading) { this.workflow.renderWorkflow(content); }
			if (this.activeTab === 'project') {
				this.workflow.renderProjectActions(content);
			} else if (this.activeTab === 'ai') {
				this.workflow.renderAiSettings(content);
			} else if (reviewMode) {
				this.renderReview(content);
			} else if (this.project.hasStructuralErrors && !this.project.error && !this.project.loading) {
				dom.append(content, dom.$('h1')).textContent = localize('ade.draft.title', "Draft Needs Correction");
				this.paragraph(content, localize('ade.draft.recoverable', "Your draft can be saved, reopened and undone. Correct its references before using its diagrams or generating code."));
				for (const diagnostic of this.project.diagnostics) { this.paragraph(content, diagnostic); }
				if ((this.project.model.version === 4 || this.project.model.version === 5) && this.project.editable) { this.button(content, localize('ade.blueprint.edit', "Edit Blueprint"), () => { void this.commandService.executeCommand('ade.blueprint'); }); }
				this.button(content, localize('ade.openModelSource', "Edit Model Specification"), () => { void this.commandService.executeCommand('ade.openModelSource'); });
			} else if (sourceEvidence && !this.project.loading && !this.project.error) {
				dom.append(content, dom.$('h1')).textContent = localize('ade.import.interpretTitle', "Explore Your Codebase");
				this.paragraph(content, localize('ade.import.interpretDescription', "Your local source inventory is ready. Plan and generate the project diagrams with AI, then review and apply them together."));
				if (this.code.context) { this.workflow.renderWorkflow(content); }
				else { this.paragraph(content, localize('ade.import.readingEvidence', "Preparing source evidence…")); }
				if (!this.ai.available || this.configurationService.getValue<boolean>('chat.disableAIFeatures') === true) { this.paragraph(content, localize('ade.import.aiRequired', "Enable AI features to interpret the source into diagrams. The technical index stays available as code evidence.")); }
			} else if (this.project.section === 'home' && !this.project.error && !this.project.loading) {
				this.renderHome(content);
			} else if (this.project.loading || this.project.error) {
				const status = dom.append(content, dom.$('p.ade-status'));
				status.setAttribute('role', this.project.error ? 'alert' : 'status');
				status.textContent = this.project.error ?? localize('ade.loading', "Loading model…");
				if (this.project.error) {
					this.button(content, localize('ade.retry', "Retry"), () => { void this.project.retry(); });
					this.button(content, localize('ade.openModel', "Open Model"), () => { void this.project.chooseModel(); });
				}
			} else if (this.project.section === 'map') {
				this.renderSystemMap(content);
			} else if (this.project.section === 'element') {
				this.renderElement(content);
			} else if (this.project.section === 'impact') {
				this.renderImpact(content);
			} else {
				this.renderDiagram(content);
			}
			if (!canvasMode) { this.workflow.renderTools(dom.append(this.root, dom.$('nav.ade-tools'))); }
			// Restore the camera before restoring keyboard focus: focus may reveal a node.
			if (canvasMode) { this.canvas.applyCamera(); }
		});
		if (!canvasMode) { this.restoreCanvasScroll(); }
		if (this.content) { this.content.scrollTop = this.contentPositions.get(this.renderedContext) ?? 0; }
		this.readingChanged.fire();
	}

	private renderTabs(parent: HTMLElement): void {
		const tabs = dom.append(parent, dom.$('nav.ade-workspace-tabs'));
		tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', localize('ade.workspaceSections', "Workspace Sections"));
		const entries = [['workspace', localize('ade.workspaceTab', "Diagrams")], ['project', localize('ade.projectTab', "Project")], ['ai', localize('ade.ai.settings', "AI Settings")]] as const;
		for (const [id, label] of entries) {
			const button = this.button(tabs, label, () => { this.activeTab = id; this.render(); }, `workspace-tab:${id}`);
			button.id = `ade-tab-${id}`; button.setAttribute('role', 'tab'); button.setAttribute('aria-selected', String(this.activeTab === id)); button.tabIndex = this.activeTab === id ? 0 : -1;
		}
		this.canvas.interactions.add(dom.addDisposableListener(tabs, 'keydown', (event: KeyboardEvent) => {
			const index = entries.findIndex(([id]) => id === this.activeTab);
			const next = event.key === 'ArrowRight' ? (index + 1) % entries.length : event.key === 'ArrowLeft' ? (index + entries.length - 1) % entries.length : event.key === 'Home' ? 0 : event.key === 'End' ? entries.length - 1 : undefined;
			if (next !== undefined) { event.preventDefault(); this.activeTab = entries[next][0]; this.render(); this.controls.focusTarget(`workspace-tab:${this.activeTab}`); }
		}));
	}

	private renderNavigation(parent: HTMLElement, canvas = false): void {
		const navigation = dom.append(parent, dom.$('nav.ade-navigation'));
		navigation.setAttribute('aria-label', localize('ade.navigation', "Project Navigation"));
		this.iconButton(navigation, localize('ade.back', "Back"), Codicon.arrowLeft, () => { this.activeTab = 'workspace'; this.project.goBack(); }).disabled = !this.project.canGoBack;
		this.iconButton(navigation, localize('ade.forward', "Forward"), Codicon.arrowRight, () => { this.activeTab = 'workspace'; this.project.goForward(); }).disabled = !this.project.canGoForward;
		this.iconButton(navigation, localize('ade.home', "Home"), Codicon.home, () => { this.activeTab = 'workspace'; this.project.showHome(); });
		if (!canvas && this.project.section !== 'home' && !this.project.error && !this.project.loading) {
			dom.append(navigation, dom.$('span.ade-project-name')).textContent = this.project.model.name;
			this.button(navigation, localize('ade.diagrams', "Diagrams"), () => { void this.chooseDiagram(); }).disabled = isSourceEvidenceModel(this.project.model);
			this.renderPrimaryActions(navigation);
		}
	}

	private renderPrimaryActions(parent: HTMLElement): void {
		if (this.project.error || this.project.loading || this.root.classList.contains('ade-review-mode')) { return; }
		const busy = this.ai.busy || this.code.busy;
		const model = this.project.model;
		if (this.ai.structuralReview) {
			if (!this.reviewOpen) { this.button(parent, localize('ade.ai.reviewButton', "Review Changes"), () => this.showReview()).classList.add('ade-primary-action'); }
		} else if ((model.version === 4 || model.version === 5) && this.project.modelUri?.path.endsWith('/.ade/model.json') && model.semantics.elements.length) {
			const prepare = this.button(parent, localize('ade.review.prepare', "Prepare Model to Code Review"), () => { void this.ai.implement(); });
			let generationReady = false;
			try { assertPureProject(model); generationReady = true; } catch { /* Incomplete designs remain editable, without promising code generation. */ }
			const reason = !this.ai.available || !this.code.available ? localize('ade.generation.unavailable', "Local code generation and verification are unavailable in this environment.") : !this.project.editable ? localize('ade.generation.readonly', "Open a writable project to prepare code changes.") : busy ? localize('ade.operationWait', "Wait for the Active A.D.E Operation to Finish.") : localize('ade.generation.requirements', "Code review requires a complete executable contract and a supported runtime. Continue editing the specification in Project Actions.");
			this.explainDisabled(prepare, busy || !this.ai.available || !this.code.available || !this.project.editable || this.project.hasStructuralErrors || !generationReady, reason);
			if (!prepare.disabled) { prepare.classList.add('ade-primary-action'); }
		} else if (this.code.context && this.code.context.diagramState !== 'index' && model.version !== 4 && model.version !== 5) {
			const sync = this.button(parent, localize('ade.updateCode', "Update Code"), () => { void this.code.sync('model'); });
			this.explainDisabled(sync, !this.code.available || busy || isSourceEvidenceModel(model), localize('ade.operationWait', "Wait for the Active A.D.E Operation to Finish."), false);
		}
		if (this.ai.available && this.configurationService.getValue<boolean>('chat.disableAIFeatures') !== true && this.code.context?.diagramState === 'diagrams') {
			const exploration = this.ai.diagramExploration, phase = getDiagramExplorationPhase(exploration);
			if (phase === 'review' || phase === 'incomplete' || this.code.changed || exploration?.invalidation?.viewIds.length) {
				const review = phase === 'review';
				const label = review ? exploration?.workflow === 'project' ? localize('ade.explore.reviewAll', "Review All Changes") : localize('ade.explore.reviewDraft', "Review Draft") : phase === 'incomplete' ? exploration?.workflow === 'project' ? localize('ade.explore.continueProject', "Continue Generation") : localize('ade.explore.continue', "Continue Exploration") : localize('ade.updateDiagrams', "Update Diagrams");
				const action = this.button(parent, label, () => { void (review ? this.ai.reviewDiagramProposal(exploration?.workflow === 'project' ? undefined : exploration?.proposals.find(proposal => proposal.status === 'ready')?.id) : this.ai.resumeDiagrams()); });
				action.disabled = busy;
				if (!this.ai.structuralReview) { action.classList.add('ade-primary-action'); }
			}
			this.button(parent, localize('ade.ai.chat', "Chat with Codex"), () => { void this.ai.chat(); }).disabled = busy;
		}
	}

	private showReview(): void {
		this.activeTab = 'workspace';
		this.reviewOpen = true;
		this.render();
		this.controls.focusTarget(this.ai.canApply ? 'review-publish' : 'review-verify');
	}

	private renderReview(parent: HTMLElement): void {
		const diagramReview = this.ai.diagramReview;
		if (diagramReview) {
			this.activeReview = renderAdeDiagramReview(parent, diagramReview, this.controls, {
				busy: this.ai.busy || this.code.busy,
				current: this.project.modelUri?.toString() === diagramReview.modelUri && canonicalJson(semanticContent(this.project.model)) === diagramReview.semanticRevision,
				apply: () => { void this.ai.applyDiagramReview(); }, refresh: () => { void this.ai.reviewDiagramProposal(diagramReview.id); },
				continue: () => { void this.ai.resumeDiagrams(); },
				close: () => { this.ai.closeDiagramReview(); this.controls.focusTarget(`proposal-review:${diagramReview.id}`); },
				technical: () => { void this.ai.inspectDiagramReview(); }
			});
			return;
		}
		const session = this.ai.structuralReview;
		if (!session) { return; }
		this.activeReview = renderStructuralReview(parent, this.project.model, session, this.controls, {
			busy: this.ai.busy || this.code.busy, canVerify: this.ai.canVerify, canApply: this.ai.canApply, canUndo: this.ai.canUndo,
			problem: this.project.saveError ?? this.ai.structuralProblem, prepare: () => { void this.ai.implement(); },
			verify: () => { void this.ai.verify(); }, apply: () => { void this.ai.apply(); }, undo: () => { void this.ai.undo(); },
			technical: () => { void this.ai.structuralTechnicalReview(); },
			returnToDiagram: () => { this.reviewOpen = false; this.render(); this.focusSelection(); }
		});
	}

	private restoreCanvasScroll(): void {
		if (this.canvas.canvasViewport && this.renderedContext) {
			const position = this.scrollPositions.get(this.renderedContext);
			if (position) {
				this.canvas.canvasViewport.scrollLeft = position.left;
				this.canvas.canvasViewport.scrollTop = position.top;
			}
		}
	}

	private renderHome(content: HTMLElement): void {
		renderAdeWelcome(content, this.controls, {
			open: () => { void this.commandService.executeCommand('ade.openProject'); },
			create: () => { void this.commandService.executeCommand('ade.createProject'); },
			importCode: () => { void this.code.importCodebase(); },
			canImport: this.code.available && !this.code.busy && !this.ai.busy,
			openModel: () => { void this.project.chooseModel(); }, example: () => { void this.project.useDemo(); }
		});
		if (this.project.modelUri) {
			const current = dom.append(content, dom.$('section.ade-current-project'));
			dom.append(current, dom.$('h2')).textContent = localize('ade.welcome.current', "Current Project · {0}", this.project.model.name);
			this.paragraph(current, this.project.projectRoot?.fsPath ?? this.project.modelUri.fsPath);
			this.button(current, localize('ade.welcome.resume', "Continue Current Project"), () => { void this.commandService.executeCommand('ade.showDiagram'); });
		} else if (this.project.workspaceFolder) {
			this.paragraph(content, localize('ade.workspaceFolder', "Current Folder: {0}", this.project.workspaceFolder.fsPath));
		}
	}

	private renderDiagram(content: HTMLElement): void {
		const model = this.project.model;
		const view = this.project.activeView;
		if (!view && model.semantics.elements.length) { this.renderBreadcrumbs(content); dom.append(content, dom.$('h1')).textContent = model.name; this.surface.renderEditingToolbar(content); }
		if (this.project.saveError) {
			const error = dom.append(content, dom.$('p.ade-status'));
			error.setAttribute('role', 'alert');
			error.textContent = this.project.saveError;
		}
		for (const diagnostic of this.project.diagnostics) { this.paragraph(content, diagnostic); }
		if (!view) {
			if (this.project.editable && !model.semantics.elements.length) {
				renderAdeProjectStart(content, this.controls, model.name, this.project.canCreatePureFeature ? () => { void this.commandService.executeCommand('ade.createPureFeature'); } : undefined, () => { void this.commandService.executeCommand('ade.addFeature'); });
				return;
			}
			if (model.semantics.elements.some(element => element.kind === 'feature')) {
				this.paragraph(content, localize('ade.noDiagramsExistingFeatures', "This project has no diagrams. Add a diagram to an existing feature to continue."));
				this.button(content, localize('ade.addDiagram', "Add Diagram"), () => { void this.commandService.executeCommand('ade.addDiagram'); });
			} else { this.paragraph(content, localize('ade.noDiagrams', "This project has no diagrams. Add a feature to begin designing its structure and flow.")); }
			this.button(content, localize('ade.openModel', "Open Model"), () => { void this.project.chooseModel(); });
			return;
		}
		if (view.subjectId) { this.renderBreadcrumbs(content); }
		const workspace = dom.append(content, dom.$('.ade-workspace'));
		workspace.classList.toggle('has-inspector', this.surface.inspectorOpen);
		const visual = dom.append(workspace, dom.$('section.ade-visual'));
		this.surface.renderCanvas(dom.append(visual, dom.$('.ade-canvas-scroll')), model, view);
		const help = dom.append(visual, dom.$('p.ade-canvas-help'));
		help.classList.toggle('is-pending', !!this.surface.pendingConnection);
		help.id = 'ade-canvas-help';
		help.textContent = view.kind === 'sequence' && this.project.editable
			? localize('ade.sequence.help', "Select a participant or message to inspect its shared contract. Use Properties to order participants and messages or remove them from this diagram. Focus the background and use arrow keys to pan.")
			: view.kind === 'sequence' ? localize('ade.sequence.readonlyHelp', "Select a participant or message to inspect its shared contract. Read Diagram presents the sequence as text. Focus the background and use arrow keys to pan.")
				: this.project.editable
					? localize('ade.editableCanvasHelp', "Tab to an element and press Enter to select it. Arrow keys move the focused element; Shift increases the step. Focus the diagram background and use arrow keys to pan. Relationships and conditions appear in Properties.")
					: localize('ade.canvasHelp', "Tab to an element and press Enter to select it. Focus the diagram background and use arrow keys to pan. Relationships and conditions appear in Properties.");
		if (this.surface.pendingConnection) { help.textContent = localize('ade.connection.pending', "Choose a Compatible Target on the Canvas for {0}, or Press Escape to Cancel.", relationLabels[this.surface.pendingConnection.kind]); }
		const accessibilityHint = getAdeAccessibilityHint(this.configurationService, this.keybindingService);
		if (accessibilityHint) { help.textContent = localize('ade.canvasHelpWithHint', "{0} {1}", help.textContent, accessibilityHint); }
		this.surface.renderCanvasMenus(content, view);
		if (this.surface.inspectorOpen) {
			const inspector = this.canvas.floatingInspector = dom.append(workspace, dom.$('aside.ade-properties'));
			this.iconButton(inspector, localize('ade.closeProperties', "Close Properties"), Codicon.close, () => { this.surface.inspectorOpen = false; this.render(); });
			if (this.surface.relationSelection) { this.inspector.renderRelationProperties(inspector, this.surface.relationSelection); } else { this.inspector.renderProperties(inspector, model, view); }
		}
	}

	private renderSystemMap(content: HTMLElement): void {
		const model = this.project.model;
		const overview = getSystemMap(model);
		const elements = new Map(model.semantics.elements.map(element => [element.id, element]));
		dom.append(content, dom.$('h1')).textContent = model.name;
		this.paragraph(content, localize('ade.map.intent', "System Map · Design intent. Groups follow semantic containment; connections summarize declared relationships."));
		this.surface.renderEditingToolbar(content);
		if (this.project.saveError) { const error = dom.append(content, dom.$('p')); error.setAttribute('role', 'alert'); error.textContent = this.project.saveError; }
		for (const diagnostic of this.project.diagnostics) { this.paragraph(content, diagnostic); }
		this.paragraph(content, localize('ade.map.counts', "{0} elements · {1} relationships · {2} diagrams", elements.size, model.semantics.relations.length, model.views.length));
		if (!overview.branches.length) { this.paragraph(content, localize('ade.map.empty', "This system has no elements. Add a feature to begin.")); }
		const groups = dom.append(content, dom.$('.ade-system-map'));
		const diagrams = getDiagramGroups(model);
		for (const branch of overview.branches) {
			const card = dom.append(groups, dom.$('section.ade-map-branch'));
			card.setAttribute('aria-label', branch.root.name);
			const heading = dom.append(card, dom.$('h2'));
			this.button(heading, branch.root.name, () => this.project.inspectElement(branch.root.id), `map:${branch.root.id}`);
			this.paragraph(card, elementLabels[branch.root.kind]);
			const members = dom.append(card, dom.$('ul.ade-map-members'));
			for (const member of branch.members.slice(1)) {
				const row = dom.append(members, dom.$('li'));
				row.style.marginInlineStart = `${Math.min(member.depth - 1, 5)}em`;
				this.button(row, member.element.name, () => this.project.inspectElement(member.element.id), `map:${member.element.id}`);
				dom.append(row, dom.$('span')).textContent = elementLabels[member.element.kind];
			}
			const memberIds = new Set(branch.members.map(member => member.element.id));
			const views = diagrams.filter(group => group.featureId && memberIds.has(group.featureId)).flatMap(group => group.views);
			for (const view of views) { this.button(card, view.name, () => this.project.showDiagram(view.id), `map-view:${view.id}`); }
		}
		const shared = diagrams.find(group => !group.featureId)?.views ?? [];
		if (shared.length) {
			dom.append(content, dom.$('h2')).textContent = localize('ade.map.systemDiagrams', "System Diagrams");
			for (const view of shared) { this.button(content, view.name, () => this.project.showDiagram(view.id), `map-view:${view.id}`); }
		}
		dom.append(content, dom.$('h2')).textContent = localize('ade.map.connections', "Connections Between Groups");
		if (!overview.connections.length) { this.paragraph(content, localize('ade.map.noConnections', "No declared relationships.")); }
		for (const connection of overview.connections) {
			const from = elements.get(connection.from)!;
			const to = elements.get(connection.to)!;
			const label = from.id === to.id
				? localize('ade.map.internal', "Within {0} ({1})", from.name, connection.relations.length)
				: localize('ade.map.connection', "{0} → {1} ({2})", from.name, to.name, connection.relations.length);
			const details = this.controls.details(content, label, `map-connection:${JSON.stringify([from.id, to.id])}`);
			for (const relation of connection.relations) {
				this.paragraph(details, localize('ade.map.relation', "{0} → {1}: {2} · {3}", elements.get(relation.from)!.name, elements.get(relation.to)!.name, relationLabels[relation.kind], relation.name));
				if (relation.condition) { this.paragraph(details, localize('ade.map.condition', "Condition: {0}", relation.condition)); }
				if (relation.errorCode) { this.paragraph(details, localize('ade.map.error', "Error: {0}", relation.errorCode)); }
				this.button(details, localize('ade.map.source', "Source: {0}", elements.get(relation.from)!.name), () => this.project.inspectElement(relation.from), `map-source:${relation.id}`);
				this.button(details, localize('ade.map.target', "Target: {0}", elements.get(relation.to)!.name), () => this.project.inspectElement(relation.to), `map-target:${relation.id}`);
			}
		}
	}

	private renderBreadcrumbs(parent: HTMLElement): void {
		const model = this.project.model;
		const breadcrumbs = dom.append(parent, dom.$('nav.ade-breadcrumbs'));
		breadcrumbs.setAttribute('aria-label', localize('ade.breadcrumbs', "Semantic Path"));
		this.button(breadcrumbs, model.name, () => this.project.showSystemMap(), 'breadcrumb:system');
		if (this.project.section === 'element' || this.project.section === 'impact') {
			for (const element of getElementPath(model, this.project.selectedId)) {
				if (element.id === this.project.selectedId) {
					const current = dom.append(breadcrumbs, dom.$('span'));
					current.textContent = element.name;
					current.setAttribute('aria-current', 'page');
				} else { this.button(breadcrumbs, element.name, () => this.project.inspectElement(element.id), `breadcrumb:${element.id}`); }
			}
		} else {
			const view = this.project.activeView;
			if ((model.version === 4 || model.version === 5) && view?.subjectId) {
				for (const element of getElementPath(model, view.subjectId)) { this.button(breadcrumbs, element.name, () => { const next = getC4DrillDown(model, element.id)[0]; if (next) { this.project.showDiagram(next.id); this.project.selectElement(element.id); } else { this.project.inspectElement(element.id); } }, `c4-breadcrumb:${element.id}`); }
			}
			const group = getDiagramGroups(model).find(group => group.featureId && group.views.some(candidate => candidate.id === view?.id));
			if (group?.featureId) { this.button(breadcrumbs, group.name, () => this.project.inspectElement(group.featureId!), `breadcrumb:${group.featureId}`); }
			if (view) {
				const current = dom.append(breadcrumbs, dom.$('span'));
				current.textContent = view.name;
				current.setAttribute('aria-current', 'page');
			}
		}
	}

	private renderInspectionHeader(content: HTMLElement, title: string, intent: string): void {
		this.renderBreadcrumbs(content);
		dom.append(content, dom.$('h1')).textContent = title;
		this.paragraph(content, intent);
		this.surface.renderEditingToolbar(content);
		if (this.project.saveError) {
			const error = dom.append(content, dom.$('p.ade-status'));
			error.setAttribute('role', 'alert');
			error.textContent = this.project.saveError;
		}
		for (const diagnostic of this.project.diagnostics) { this.paragraph(content, diagnostic); }
	}

	private renderImpact(content: HTMLElement): void {
		const model = this.project.model;
		const element = model.semantics.elements.find(element => element.id === this.project.selectedId);
		if (!element) { return; }
		this.renderInspectionHeader(content, localize('ade.impact.title', "Change Impact: {0}", element.name), localize('ade.impact.intent', "{0} · Declared Model Review", model.name));
		this.button(content, localize('ade.elementDetails', "Element Details"), () => this.project.inspectElement(element.id), 'impact-details');
		renderChangeImpact(content, model, element.id, this.controls, id => this.project.inspectElement(id), id => this.project.showDiagram(id));
		this.inspector.renderProperties(dom.append(content, dom.$('section.ade-properties')), model);
	}

	private renderElement(content: HTMLElement): void {
		const model = this.project.model;
		const element = model.semantics.elements.find(element => element.id === this.project.selectedId);
		if (!element) { return; }
		this.renderInspectionHeader(content, element.name, localize('ade.elementDetailsIntent', "Element Details · {0} · Design intent", model.name));
		if (element.kind === 'feature') {
			const diagrams = getDiagramGroups(model).find(group => group.featureId === element.id)?.views ?? [];
			dom.append(content, dom.$('h2')).textContent = localize('ade.featureDiagrams', "Feature Diagrams");
			for (const view of diagrams) { this.button(content, view.name, () => this.project.showDiagram(view.id), `feature-view:${view.id}`); }
			if (this.project.editable) { this.button(content, localize('ade.addDiagram', "Add Diagram"), () => { void this.commandService.executeCommand('ade.addDiagram', element.id); }); }
		}
		const children = model.semantics.elements.filter(child => child.parentId === element.id);
		if (children.length) {
			dom.append(content, dom.$('h2')).textContent = localize('ade.containedElements', "Contained Elements");
			for (const child of children) { this.button(content, child.name, () => this.revealElement(child.id), `child:${child.id}`); }
		}
		this.inspector.renderProperties(dom.append(content, dom.$('section.ade-properties')), model);
	}

	private explainDisabled(button: HTMLButtonElement, disabled: boolean, reason: string, inline = true): void {
		button.disabled = disabled;
		if (disabled) {
			button.setAttribute('aria-description', reason);
			if (inline) { const explanation = dom.append(button.parentElement!, dom.$('span.ade-unavailable-reason')); explanation.textContent = reason; }
		}
		this.canvas.interactions.add(this.hover.setupManagedHover(getDefaultHoverDelegate('mouse'), button, disabled ? reason : button.getAttribute('aria-label') ?? button.textContent ?? ''));
	}

	private iconButton(parent: HTMLElement, label: string, icon: ThemeIcon, action: () => void, id = label): HTMLButtonElement {
		const button = this.button(parent, label, action, id);
		button.setAttribute('aria-label', label);
		dom.clearNode(button); button.appendChild(renderIcon(icon));
		this.canvas.interactions.add(this.hover.setupManagedHover(getDefaultHoverDelegate('mouse'), button, label));
		return button;
	}

	private async chooseDiagram(): Promise<void> {
		if (isSourceEvidenceModel(this.project.model)) { this.project.showHome(); return; }
		const items: ((IQuickPickItem & { view?: ModelView }) | IQuickPickSeparator)[] = [];
		for (const group of getDiagramGroups(this.project.model)) {
			if (!group.views.length) { continue; }
			items.push({ type: 'separator', label: group.name });
			for (const view of group.views) { items.push({ label: view.name, description: viewLabels[view.kind], detail: view.subjectId ? this.project.model.semantics.elements.find(element => element.id === view.subjectId)?.name : undefined, view }); }
		}
		const choice = await this.quick.pick<IQuickPickItem & { view?: ModelView }>(items, { title: localize('ade.chooseDiagram', "Choose Diagram"), matchOnDescription: true });
		if (choice?.view) { this.project.showDiagram(choice.view.id); }
	}

	private documentStatus(): string {
		return adeDocumentStatus({ error: this.project.error, saveError: this.project.saveError, loading: this.project.loading, dirty: this.project.dirty, hasDocument: !!this.project.modelUri, draft: this.project.hasStructuralErrors, operation: this.ai.busy ? this.ai.status : this.code.busy ? this.code.status : undefined, codeChanged: this.code.changed });
	}

	private readonly canvas: AdeCanvasController;

	private readonly surface: AdeCanvasSurface;

	private readonly inspector: AdeInspector;

	private readonly workflow: AdeWorkflowContent;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@ICommandService private readonly commandService: ICommandService,
		@IAdeProjectService private readonly project: AdeProjectService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IAdeCodeService private readonly code: IAdeCodeService,
		@IAdeAiService private readonly ai: IAdeAiService,
		@IContextMenuService private readonly contextMenus: IContextMenuService,
		@IQuickInputService private readonly quick: IQuickInputService,
		@INotificationService private readonly notifications: INotificationService,
		@IHoverService private readonly hover: IHoverService
	) {
		super(AdeEditor.ID, group, telemetryService, themeService, storageService);
		const self = this;
		this.canvas = this._register(new AdeCanvasController({ get root() { return self.root; } }, this.controls, this.project, storageService));
		this.surface = new AdeCanvasSurface({ button: (parent, label, action, id) => this.button(parent, label, action, id), chooseDiagram: () => this.chooseDiagram(), focusSelection: () => this.focusSelection(), renderBreadcrumbs: (parent) => this.renderBreadcrumbs(parent), renderNavigation: (parent, canvas) => this.renderNavigation(parent, canvas), renderPrimaryActions: (parent) => this.renderPrimaryActions(parent), documentStatus: () => this.documentStatus(), render: () => this.render(), renderTools: (toolbar) => this.workflow.renderTools(toolbar), iconButton: (parent, label, icon, action, id) => this.iconButton(parent, label, icon, action, id), paragraph: (parent, content) => this.paragraph(parent, content), get root() { return self.root; }, revealElement: (id, viewId) => this.revealElement(id, viewId) }, this.canvas, this.controls, this.project, this.commandService, this.quick, this.contextMenus, this.notifications);
		this.inspector = new AdeInspector({ paragraph: (parent, content) => this.paragraph(parent, content), button: (parent, label, action, id) => this.button(parent, label, action, id), get root() { return self.root; }, revealElement: (id, viewId) => this.revealElement(id, viewId), relationMenu: (id, x, y) => this.surface.relationMenu(id, x, y) }, this.controls, this.project, this.code, this.commandService);
		this.workflow = new AdeWorkflowContent({ paragraph: (parent, content) => this.paragraph(parent, content), button: (parent, label, action, id) => this.button(parent, label, action, id), documentStatus: () => this.documentStatus(), get root() { return self.root; }, showReview: () => this.showReview() }, this.controls, this.project, this.ai, this.configurationService, this.notifications, this.code, this.commandService);

		this._register(code.onDidChange(() => { if (this.root) { this.render(); } }));
		let reviewId = ai.diagramReview?.id;
		this._register(ai.onDidChange(() => { if (ai.diagramReview?.id !== reviewId) { reviewId = ai.diagramReview?.id; if (reviewId) { this.activeTab = 'workspace'; } } if (this.root) { this.render(); } }));
		let navigationContext = `${project.section}:${project.activeView?.id}`;
		this._register(project.onDidChange(() => { const context = `${project.section}:${project.activeView?.id}`; if (context !== navigationContext) { this.activeTab = 'workspace'; navigationContext = context; } if (this.root) { this.render(); } }));
		this._register(configurationService.onDidChangeConfiguration(event => {
			if (this.root && (event.affectsConfiguration(AccessibilityVerbositySettingId.Ade) || event.affectsConfiguration('chat.disableAIFeatures'))) { this.render(); }
		}));
		this._register(keybindingService.onDidUpdateKeybindings(() => { if (this.root) { this.render(); } }));

	}
}
