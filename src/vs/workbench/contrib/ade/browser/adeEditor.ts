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
import { AdeActionMenu } from './adeActionMenu.js';
import { renderStructuralReview } from './adeStructuralReview.js';
import { renderAdeWelcome, renderAdeProjectHome } from './adeWelcome.js';
import { adeDocumentStatus } from './adeDocumentStatus.js';
import { describeAdeDiagram } from './adeAccessibleContent.js';
import { renderAdeDiagramReview } from './adeDiagramReview.js';
import { canonicalJson, semanticContent } from '../common/modelSerialization.js';
import { assertPureProject } from '../common/modelProject.js';
import { AdeProjectService, IAdeProjectService } from './adeProjectService.js';
import { getC4DrillDown } from '../common/modelBlueprint.js';
import { AdeControls } from './adeControls.js';
import { adeErrorNotification, describeAdeError } from './adeErrors.js';
import { renderAdeErrorNotice } from './adeErrorNotice.js';
import { diagnosticMessage } from './adeDiagnostics.js';
import { InvalidSemanticModelError, validateSemanticModel } from '../common/modelValidation.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { adeFocusedSurface, getAdeAccessibilityHint } from './adeAccessibilityContext.js';
import { elementLabels, relationLabels, viewLabels } from './adeLabels.js';
import { getDiagramGroups, getElementPath, getProjectedInteraction } from '../common/visualNavigation.js';
import { createSystemAtlasState, SystemAtlas, type SystemAtlasState } from '../common/systemAtlas.js';
import { renderAdeSystemMap } from './adeSystemMap.js';
import { prependAdeIcon } from './adeIcons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IQuickInputService, type IQuickPickItem, type IQuickPickSeparator } from '../../../../platform/quickinput/common/quickInput.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { renderChangeImpact } from './adeImpact.js';
import { impactScopeDescription } from './adeImpactContent.js';
import { AdeCanvasController } from './adeCanvasController.js';
import { AdeCanvasSurface } from './adeCanvasSurface.js';
import { AdeInspector } from './adeInspector.js';
import { AdeWorkflowContent } from './adeWorkflowContent.js';
import { AdeBlueprintEditor } from './adeBlueprintEditor.js';
import { type BlueprintEditMode } from './adeBlueprintEditing.js';
import { AdeFeatureCodeGeneration, hasFeatureCodeReview } from './adeFeatureCodeGeneration.js';
import { getDiagramExplorationPhase } from '../common/diagramExplorationState.js';

export class AdeEditor extends EditorPane {
	static readonly ID = AdeInput.ID;

	private root!: HTMLElement;

	private reviewOpen = false;

	private activeTab: 'workspace' | 'project' | 'ai' | 'code' | 'blueprint' = 'workspace';

	private reviewContext: string | undefined;

	private codeGenerationReviewId: string | undefined;

	private readonly codeGeneration: AdeFeatureCodeGeneration;

	private activeReview: HTMLElement | undefined;

	private lastElementSelection = '';

	private readonly controls = this._register(new AdeControls(error => this.notifications.error(adeErrorNotification(error, 'edit', this.project.model))));

	private readonly readingChanged = this._register(new Emitter<void>());

	readonly onDidChangeReading = this.readingChanged.event;

	private renderedContext: string | undefined;

	private content: HTMLElement | undefined;

	private readonly scrollPositions = new Map<string, { left: number; top: number }>();

	private readonly contentPositions = new Map<string, number>();

	private readonly mapStates = new Map<string, SystemAtlasState>();

	private mapAtlas: SystemAtlas | undefined;

	protected override createEditor(parent: HTMLElement): void {
		this.root = dom.append(parent, dom.$('.ade-shell'));
		this.root.tabIndex = -1;
		this.root.setAttribute('aria-label', localize('ade.workbenchLabel', "A.D.E Visual Workbench"));
		adeFocusedSurface.bindTo(this._register(this.contextKeyService.createScoped(this.root))).set('editor');
		void this.project.restore().catch(error => this.notifications.error(adeErrorNotification(error, 'load', this.project.model)));
		this.render();
		void this.ai.refreshConnection().catch(error => this.notifications.error(adeErrorNotification(error, 'ai', this.project.model)));
		this._register(dom.addDisposableListener(this.root, 'keydown', (event: KeyboardEvent) => {
			if (event.key === 'Escape' && this.activeTab !== 'blueprint') {
				if (this.surface.pendingConnection) { this.surface.pendingConnection = undefined; this.render(); }
				else if (this.surface.inspectorOpen) { this.surface.inspectorOpen = false; this.render(); this.canvas.canvasViewport?.focus(); }
				this.controls.setExpanded('canvas-actions', false);
			}
		}));
	}

	override layout(dimension: dom.Dimension): void {
		dom.size(this.root, dimension.width, dimension.height);
		this.root.classList.toggle('ade-narrow', dimension.width < 850);
		this.root.classList.toggle('ade-compact', dimension.width < 600);
		this.root.classList.toggle('ade-short', dimension.height < 480);
		this.canvas.applyCamera();
	}

	override focus(): void { this.root?.focus(); }

	showWorkspace(): void { this.activeTab = 'workspace'; if (this.root) { this.render(); } }

	showBlueprint(id?: string, mode?: BlueprintEditMode): void {
		this.blueprint.open(id, mode);
		this.activeTab = 'blueprint';
		if (this.root) {
			this.render();
			this.blueprint.focus();
		}
	}

	async prepareReviewedCodeFromDiagrams(): Promise<void> {
		this.showCode();
		if (this.ai.busy || this.code.busy || !this.ai.available || this.configurationService.getValue<boolean>('chat.disableAIFeatures') === true || this.project.loading || this.project.error || this.project.hasStructuralErrors || !this.project.editable || !this.project.projectRoot || !this.project.model.semantics.elements.some(element => element.kind === 'feature')) { return; }
		const run = this.ai.codeGeneration;
		if (run && run.status !== 'applied' && run.status !== 'undone') {
			if (hasFeatureCodeReview(run)) { this.showCodeGenerationReview(); } else { this.controls.focusTarget('code-update'); }
			return;
		}
		try { await this.codeGeneration.configure(); }
		catch (error) { this.notifications.error(adeErrorNotification(error, 'ai', this.project.model)); }
	}

	captureAccessibilityFocus(): () => void { return this.controls.captureFocus(this.root); }

	describeCurrentContext(): string {
		return !this.project.error && !this.project.loading && this.root.classList.contains('ade-review-mode')
			? this.activeReview?.innerText ?? describeAdeDiagram(this.project)
			: describeAdeDiagram(this.project);
	}

	focusSelection(): void {
		if (this.activeTab === 'blueprint') { this.showWorkspace(); }
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
		const active = dom.getActiveElement();
		const blueprintFocus = this.activeTab === 'blueprint' && dom.isHTMLElement(active) && this.content?.contains(active) ? active : undefined;
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
		const reviewContext = this.ai.structuralReview ? `${this.ai.structuralReview.root}:${this.ai.structuralReview.id}` : undefined;
		if (reviewContext !== this.reviewContext) { this.reviewOpen = !!reviewContext; this.reviewContext = reviewContext; if (reviewContext && this.activeTab !== 'blueprint') { this.activeTab = 'workspace'; } }
		const blueprintMode = this.activeTab === 'blueprint' && !this.project.error && !this.project.loading;
		this.renderedContext = JSON.stringify([this.project.modelUri?.toString(), this.activeTab, blueprintMode ? undefined : this.project.section, blueprintMode ? undefined : this.project.section === 'element' || this.project.section === 'impact' ? this.project.selectedId : this.project.activeView?.id]);
		const codeRun = this.ai.codeGeneration;
		const codeReview = this.activeTab === 'code' && codeRun?.id === this.codeGenerationReviewId && hasFeatureCodeReview(codeRun) ? codeRun : undefined;
		const reviewMode = (this.activeTab === 'workspace' && (!!this.ai.diagramReview || this.reviewOpen && !!this.ai.structuralReview && this.project.section !== 'home') || !!codeReview) && !this.project.error && !this.project.loading;
		this.root.classList.toggle('ade-blueprint-mode', blueprintMode);
		this.root.classList.toggle('ade-review-mode', reviewMode);
		const sourceEvidence = isSourceEvidenceModel(this.project.model);
		const warnings = this.project.error || this.project.loading ? [] : validateSemanticModel(this.project.model).filter(diagnostic => diagnostic.severity === 'warning');
		const showStructuralErrors = this.project.hasStructuralErrors && !this.project.hasDiagramErrors && !this.project.error && !blueprintMode;
		const canvasMode = this.activeTab === 'workspace' && !reviewMode && !sourceEvidence && this.project.section === 'diagram' && !!this.project.activeView && !this.project.loading && !this.project.error && !this.project.hasDiagramErrors;
		this.root.classList.toggle('ade-canvas-mode', canvasMode);
		if (this.canvas.cameraKey) { this.canvas.cameras.set(this.canvas.cameraKey, { ...this.canvas.camera }); }
		const cameraKey = canvasMode ? `${this.project.projectRoot?.toString() ?? 'demo'}:${this.project.model.id}:${this.project.activeView!.id}` : undefined;
		if (canvasMode && cameraKey !== this.canvas.cameraKey) { this.canvas.camera = this.canvas.cameras.get(cameraKey ?? '') ?? { x: 80, y: 112, zoom: 1 }; this.canvas.cameraKey = cameraKey; this.surface.inspectorOpen = false; }
		this.canvas.interactions.clear();
		this.controls.render(this.root, () => {
			dom.clearNode(this.root);
			this.renderWorkspaceBar(this.root);
			if (!canvasMode && this.activeTab === 'workspace' && this.project.section !== 'home' && this.project.model.views.length > 0) { this.renderNavigation(this.root); }
			if (warnings.length || this.project.saveError || showStructuralErrors) {
				const summary = dom.append(this.root, dom.$('div.ade-error-summary'));
				for (const warning of warnings) { dom.append(summary, dom.$('p', { role: 'status' })).textContent = diagnosticMessage(warning, this.project.model); }
				if (this.project.saveError) {
					const notice = renderAdeErrorNotice(summary, describeAdeError(this.project.saveErrorCause ?? this.project.saveError, 'save', this.project.model), this.controls);
					this.button(notice, localize('ade.retrySave', "Retry Save"), () => this.project.save());
					this.button(notice, localize('ade.saveCopy', "Save Copy"), () => this.commandService.executeCommand('ade.saveCopy'));
				}
				if (showStructuralErrors) {
					const notice = renderAdeErrorNotice(summary, describeAdeError(new InvalidSemanticModelError(validateSemanticModel(this.project.model)), 'edit', this.project.model), this.controls);
					this.button(notice, localize('ade.blueprint.edit', "Edit Blueprint"), () => this.commandService.executeCommand('ade.blueprint'));
				}
			}
			const content = dom.append(this.root, dom.$('main.ade-content'));
			this.content = content;
			content.setAttribute('role', 'region'); content.setAttribute('aria-label', blueprintMode ? localize('ade.blueprint.sidebar', "Structural Blueprint") : this.activeTab === 'code' ? localize('ade.code.title', "Code") : this.activeTab === 'project' ? localize('ade.project.settingsTitle', "Project Settings") : this.activeTab === 'ai' ? localize('ade.ai.settings', "AI Settings") : localize('ade.workspaceTab', "Diagrams"));
			if (this.activeTab === 'workspace' && !reviewMode && !canvasMode && !sourceEvidence && this.project.section !== 'home' && (this.project.section !== 'diagram' || !!this.project.activeView) && !this.project.error && !this.project.loading) { this.workflow.renderWorkflow(content); }
			if (blueprintMode) {
				content.tabIndex = -1;
				this.controls.trackFocus('workspace-blueprint-content', content);
				this.blueprint.render(content);
			} else if (this.activeTab === 'code') {
				if (reviewMode && codeReview) {
					this.activeReview = this.codeGeneration.renderReview(content, codeReview, this.controls, this.ai.busy || this.code.busy, () => {
						this.codeGenerationReviewId = undefined; this.render(); this.controls.focusTarget('code-update');
					});
				} else {
					this.workflow.renderCodeActions(content, () => { this.activeTab = 'project'; this.render(); }, parent => this.renderPrimaryActions(parent, true), { ui: this.codeGeneration, review: () => this.showCodeGenerationReview() });
				}
			} else if (this.activeTab === 'project') {
				this.workflow.renderProjectActions(content);
			} else if (this.activeTab === 'ai') {
				this.workflow.renderAiSettings(content);
			} else if (reviewMode) {
				this.renderReview(content);
			} else if (this.project.hasDiagramErrors && !this.project.error && !this.project.loading) {
				renderAdeErrorNotice(content, describeAdeError(new InvalidSemanticModelError(validateSemanticModel(this.project.model)), 'edit', this.project.model), this.controls);
				this.paragraph(content, localize('ade.draft.recoverable', "Your draft can be saved and reopened. Correct the reported issues before using diagrams or generating code. Undo is available for changes made in this session."));
				this.button(content, localize('ade.draft.undo', "Undo Last Change"), () => this.project.undo()).disabled = !this.project.canUndo;
				if ((this.project.model.version === 4 || this.project.model.version === 5) && this.project.editable) { this.button(content, localize('ade.blueprint.edit', "Edit Blueprint"), () => this.commandService.executeCommand('ade.blueprint')); }
				this.button(content, localize('ade.openModelSource', "Edit Model Specification"), () => this.commandService.executeCommand('ade.openModelSource'));
			} else if (sourceEvidence && !this.project.loading && !this.project.error) {
				dom.append(content, dom.$('h1')).textContent = localize('ade.import.interpretTitle', "Explore Your Codebase");
				this.paragraph(content, localize('ade.import.interpretDescription', "Your local source inventory is ready. Plan and generate the project diagrams with AI, then review and apply them together."));
				if (this.code.context) {
					this.button(content, localize('ade.code.inspect', "Inspect Code Evidence"), () => this.code.inspect(), 'inventory-evidence');
					this.workflow.renderWorkflow(content);
				}
				else { this.paragraph(content, localize('ade.import.readingEvidence', "Preparing source evidence…")); }
				if (!this.ai.available || this.configurationService.getValue<boolean>('chat.disableAIFeatures') === true) { this.paragraph(content, localize('ade.import.aiRequired', "Enable AI features to interpret the source into diagrams. The technical index stays available as code evidence.")); }
			} else if (this.project.section === 'home' && !this.project.error && !this.project.loading) {
				this.renderHome(content);
			} else if (this.project.loading || this.project.error) {
				if (this.project.error) { renderAdeErrorNotice(content, describeAdeError(this.project.errorCause ?? this.project.error, 'load', this.project.model), this.controls); }
				else { dom.append(content, dom.$('p.ade-status', { role: 'status' })).textContent = localize('ade.loading', "Loading model…"); }
				if (this.project.error) {
					if (this.project.canUndo) { this.button(content, localize('ade.draft.undo', "Undo Last Change"), () => this.project.undo()); }
					this.button(content, localize('ade.retry', "Retry"), () => this.project.retry()).classList.add('ade-primary-action');
					this.button(content, localize('ade.openProject', "Open Project"), () => this.commandService.executeCommand('ade.openProject'));
					const technical = this.controls.details(content, localize('ade.properties.technical', "Technical Details"), 'load-error-technical');
					if (this.project.modelUri) { this.button(technical, localize('ade.error.openModelSource', "Open Model Specification"), () => this.commandService.executeCommand('ade.openModelSource')); }
					this.button(technical, localize('ade.openModel', "Open Model"), () => this.project.chooseModel());
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
			// Restore the camera before restoring keyboard focus: focus may reveal a node.
			if (canvasMode) { this.canvas.applyCamera(); }
		});
		if (!canvasMode) { this.restoreCanvasScroll(); }
		if (this.content) { this.content.scrollTop = this.contentPositions.get(this.renderedContext) ?? 0; }
		if (blueprintMode && blueprintFocus?.isConnected && dom.getActiveElement() !== blueprintFocus) {
			blueprintFocus.focus({ preventScroll: true });
		}
		this.readingChanged.fire();
	}

	private renderWorkspaceBar(parent: HTMLElement): void {
		const bar = dom.append(parent, dom.$('nav.ade-workspace-bar'));
		bar.setAttribute('aria-label', localize('ade.workspaceSections', "Workspace"));
		const menu = this.controls.details(bar, this.project.section === 'home' && !this.project.modelUri ? localize('ade.project.menu', "Project") : this.project.model.name, 'workspace-project-menu', { popup: true });
		menu.parentElement!.classList.add('ade-project-menu');
		const actions = new AdeActionMenu(this.controls);
		actions.header(menu, this.project.model.name, localize('ade.project.menuSubtitle', "Project Workspace"), Codicon.folder);
		const navigation = actions.section(menu, localize('ade.menu.navigate', "Navigate"), { compact: true });
		const project = actions.section(menu, localize('ade.project.menu', "Project"));
		const preferences = actions.section(menu, localize('ade.menu.preferences', "Preferences"), { compact: true });
		const action = <T>(parent: HTMLElement, label: string, icon: ThemeIcon, run: () => T, description?: string, navigation = false) => actions.action(parent, label, () => { this.controls.setExpanded('workspace-project-menu', false); return run(); }, { icon, description, kind: navigation ? 'navigation' : 'action' });
		action(navigation, localize('ade.home', "Home"), Codicon.home, () => { this.activeTab = 'workspace'; this.project.showHome(); }, undefined, true);
		action(project, localize('ade.openProject', "Open Project"), Codicon.folderOpened, () => this.commandService.executeCommand('ade.openProject'));
		action(project, localize('ade.createProject', "Create Project"), Codicon.newFolder, () => this.commandService.executeCommand('ade.createProject'));
		const importCode = action(project, localize('ade.importCode', "Import Codebase"), Codicon.repo, () => this.code.importCodebase(), !this.code.available || this.code.busy || this.ai.busy ? localize('ade.welcome.importUnavailable', "Code import is unavailable here or an import is already running.") : localize('ade.menu.importHelp', "Build a model from an existing codebase."));
		importCode.disabled = !this.code.available || this.code.busy || this.ai.busy;
		action(preferences, localize('ade.project.settingsTitle', "Project Settings"), Codicon.settingsGear, () => { this.activeTab = 'project'; this.render(); }, undefined, true);
		action(preferences, localize('ade.ai.settings', "AI Settings"), Codicon.sparkle, () => { this.activeTab = 'ai'; this.render(); }, undefined, true);
		action(preferences, this.configurationService.getValue<boolean>('ade.focusDiagrams') === false ? localize('ade.layout.focus', "Focus on Diagrams") : localize('ade.layout.showIDE', "Show IDE"), Codicon.layout, () => this.commandService.executeCommand('ade.toggleWorkbench'));
		if (this.activeTab === 'blueprint') {
			const label = this.project.section === 'diagram' && this.project.activeView ? localize('ade.backToDiagram', "Back to Diagram") : localize('ade.blueprint.backToWorkspace', "Back to Workspace");
			this.button(bar, label, () => this.showWorkspace(), 'workspace-diagram').classList.add('ade-diagram-picker');
		} else if (this.activeTab === 'workspace' && this.project.section === 'diagram' && this.project.activeView) {
			const diagram = this.button(bar, this.project.activeView.name, () => { this.controls.setExpanded('workspace-project-menu', false); return this.chooseDiagram(); }, 'workspace-diagram');
			diagram.classList.add('ade-diagram-picker'); diagram.setAttribute('aria-haspopup', 'listbox'); diagram.setAttribute('aria-label', this.project.activeView.name);
		} else if (this.project.section !== 'home' && !!this.project.activeView && !this.project.error && !this.project.loading) {
			this.button(bar, localize('ade.backToDiagram', "Back to Diagram"), () => { this.activeTab = 'workspace'; this.project.showDiagram(this.project.selectedId); this.render(); }, 'workspace-diagram').classList.add('ade-diagram-picker');
		}
		const trailing = dom.append(bar, dom.$('div.ade-workspace-trailing'));
		if (this.project.modelUri || this.project.section !== 'home' && this.project.model.views.length) { this.button(trailing, localize('ade.diagrams', "Diagrams"), () => this.commandService.executeCommand('ade.toggleNavigation'), 'workspace-navigation'); }
		if (this.project.section !== 'home' && (this.project.section !== 'diagram' || !!this.project.activeView) && !this.project.loading && !this.project.error) {
			const map = this.button(trailing, localize('ade.systemMap', "System Map"), () => { this.activeTab = 'workspace'; this.project.showSystemMap(); }, 'workspace-map');
			prependAdeIcon(map, Codicon.typeHierarchy); map.setAttribute('aria-current', String(this.project.section === 'map'));
		}
		if ((this.project.section !== 'home' || !!this.project.modelUri) && !this.project.loading && !this.project.error && (this.project.model.semantics.elements.length > 0 || !!this.code.context)) {
			const code = this.button(trailing, localize('ade.code.title', "Code"), () => this.showCode(), 'workspace-code');
			code.setAttribute('aria-pressed', String(this.activeTab === 'code'));
		}
		if (this.project.editable) {
			const model = this.project.model;
			if ((model.version === 4 || model.version === 5) && !isSourceEvidenceModel(model)) {
				const blueprint = this.button(trailing, localize('ade.blueprint.sidebar', "Structural Blueprint"), () => this.showBlueprint(), 'workspace-blueprint');
				prependAdeIcon(blueprint, Codicon.symbolStructure);
				blueprint.setAttribute('aria-pressed', String(this.activeTab === 'blueprint'));
				blueprint.disabled = this.ai.busy || this.code.busy;
			}
		}
		if (this.project.dirty) { this.button(trailing, localize('ade.save', "Save"), () => this.project.save(true), 'workspace-save').classList.add('ade-primary-action'); }
		const state = dom.append(trailing, dom.$('span.ade-document-state')); state.setAttribute('role', 'status'); state.textContent = this.documentStatus();
	}

	private renderNavigation(parent: HTMLElement, canvas = false): void {
		const navigation = dom.append(parent, dom.$('nav.ade-navigation'));
		navigation.setAttribute('aria-label', localize('ade.navigation', "Project Navigation"));
		this.iconButton(navigation, localize('ade.back', "Back"), Codicon.arrowLeft, () => { this.activeTab = 'workspace'; this.project.goBack(); }).disabled = !this.project.canGoBack;
		this.iconButton(navigation, localize('ade.forward', "Forward"), Codicon.arrowRight, () => { this.activeTab = 'workspace'; this.project.goForward(); }).disabled = !this.project.canGoForward;
		this.iconButton(navigation, localize('ade.home', "Home"), Codicon.home, () => { this.activeTab = 'workspace'; this.project.showHome(); });
		if (!canvas && this.project.section !== 'home' && !this.project.error && !this.project.loading) {
			dom.append(navigation, dom.$('span.ade-project-name')).textContent = this.project.model.name;
			const map = this.button(navigation, localize('ade.systemMap', "System Map"), () => { this.activeTab = 'workspace'; this.project.showSystemMap(); });
			prependAdeIcon(map, Codicon.typeHierarchy); map.setAttribute('aria-current', String(this.project.section === 'map'));
			this.button(navigation, localize('ade.diagrams', "Diagrams"), () => this.chooseDiagram()).disabled = isSourceEvidenceModel(this.project.model);
		}
	}

	private renderPrimaryActions(parent: HTMLElement, contextOnly = false): void {
		if (this.project.error || this.project.loading || this.root.classList.contains('ade-review-mode')) { return; }
		const busy = this.ai.busy || this.code.busy;
		const model = this.project.model;
		if (!contextOnly && this.ai.structuralReview) {
			if (!this.reviewOpen) { this.button(parent, localize('ade.ai.reviewButton', "Review Changes"), () => this.showReview()).classList.add('ade-primary-action'); }
		} else if (!contextOnly && (model.version === 4 || model.version === 5) && this.project.modelUri?.path.endsWith('/.ade/model.json') && model.semantics.elements.length) {
			let generationReady = false;
			try { assertPureProject(model); generationReady = true; } catch { /* Incomplete designs remain editable, without promising code generation. */ }
			const reason = !this.ai.available || !this.code.available ? localize('ade.generation.unavailable', "Local code generation and verification are unavailable in this environment.") : !this.project.editable ? localize('ade.generation.readonly', "Open a writable project to prepare code changes.") : busy ? localize('ade.operationWait', "Wait for the Active A.D.E Operation to Finish.") : localize('ade.generation.requirements', "Complete the Executable Behavior in Project Settings Before Preparing a Local Code Review.");
			const disabled = busy || !this.ai.available || !this.code.available || !this.project.editable || this.project.hasStructuralErrors || !generationReady;
			if (disabled && parent.classList.contains('ade-floating-menu')) {
				this.paragraph(this.controls.details(parent, localize('ade.generation.whyUnavailable', "Code Review Unavailable"), 'canvas-code-unavailable'), reason);
			} else {
				const prepare = this.button(parent, localize('ade.review.prepare', "Prepare Model to Code Review"), () => this.ai.implement());
				this.explainDisabled(prepare, disabled, reason);
				if (!prepare.disabled) { prepare.classList.add('ade-primary-action'); }
			}
		} else if (this.code.context && this.code.context.diagramState !== 'index' && model.version !== 4 && model.version !== 5) {
			const sync = this.button(parent, localize('ade.updateCode', "Update Code"), () => this.code.sync('model'));
			this.explainDisabled(sync, !this.code.available || busy || isSourceEvidenceModel(model), localize('ade.operationWait', "Wait for the Active A.D.E Operation to Finish."), false);
		}
		if (this.ai.available && this.configurationService.getValue<boolean>('chat.disableAIFeatures') !== true && this.code.context?.diagramState === 'diagrams') {
			const exploration = this.ai.diagramExploration, phase = getDiagramExplorationPhase(exploration);
			if (exploration && phase !== 'applied') { return; }
			if (this.code.changed || exploration?.invalidation?.viewIds.length) {
				const action = this.button(parent, localize('ade.updateDiagrams', "Update Diagrams"), () => this.ai.updateDiagrams());
				action.disabled = busy;
				if (!this.ai.structuralReview) { action.classList.add('ade-primary-action'); }
			}
			this.button(parent, localize('ade.ai.chat', "Chat with Codex"), () => this.ai.chat()).disabled = busy;
		}
	}

	private showReview(): void {
		this.activeTab = 'workspace';
		this.reviewOpen = true;
		this.render();
		this.controls.focusTarget(this.ai.canApply ? 'review-publish' : 'review-verify');
	}

	private showCode(): void {
		this.controls.setExpanded('workspace-project-menu', false);
		this.codeGenerationReviewId = undefined;
		this.activeTab = 'code';
		this.render();
	}

	private showCodeGenerationReview(): void {
		const run = this.ai.codeGeneration;
		if (!run || !hasFeatureCodeReview(run)) { return; }
		this.codeGenerationReviewId = run.id;
		this.render();
		if (!this.controls.focusTarget(run.status === 'verified' ? 'feature-code-apply' : 'feature-code-verify')) { this.controls.focusTarget('feature-code-back'); }
	}

	private renderReview(parent: HTMLElement): void {
		const diagramReview = this.ai.diagramReview;
		if (diagramReview) {
			this.activeReview = renderAdeDiagramReview(parent, diagramReview, this.controls, {
				busy: this.ai.busy || this.code.busy,
				current: this.project.modelUri?.toString() === diagramReview.modelUri && canonicalJson(semanticContent(this.project.model)) === diagramReview.semanticRevision,
				apply: () => this.ai.applyDiagramReview(), refresh: () => this.ai.reviewDiagramProposal(diagramReview.id),
				continue: () => this.ai.resumeDiagrams(),
				close: () => { this.ai.closeDiagramReview(); this.controls.focusTarget(diagramReview.featureCatalog ? 'exploration-action' : diagramReview.projectReviewId ? 'project-review' : `proposal-review:${diagramReview.id}`); },
				technical: () => this.ai.inspectDiagramReview()
			});
			return;
		}
		const session = this.ai.structuralReview;
		if (!session) { return; }
		this.activeReview = renderStructuralReview(parent, this.project.model, session, this.controls, {
			busy: this.ai.busy || this.code.busy, canVerify: this.ai.canVerify, canApply: this.ai.canApply, canUndo: this.ai.canUndo,
			problem: this.project.saveError ?? this.ai.structuralProblem, prepare: () => this.ai.implement(),
			verify: () => this.ai.verify(), apply: () => this.ai.apply(), undo: () => this.ai.undo(),
			technical: () => this.ai.structuralTechnicalReview(),
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
		if (this.project.modelUri) { this.renderProjectHome(content); return; }
		renderAdeWelcome(content, this.controls, {
			open: () => this.commandService.executeCommand('ade.openProject'),
			create: () => this.commandService.executeCommand('ade.createProject'),
			importCode: () => this.code.importCodebase(),
			canImport: this.code.available && !this.code.busy && !this.ai.busy,
			openModel: () => this.project.chooseModel(), example: () => this.project.useDemo()
		});
		if (this.project.workspaceFolder) {
			this.paragraph(content, localize('ade.workspaceFolder', "Current Folder: {0}", this.project.workspaceFolder.fsPath));
		}
	}

	private renderProjectHome(content: HTMLElement): void {
		renderAdeProjectHome(content, this.controls, {
			model: this.project.model,
			editable: this.project.editable,
			busy: this.ai.busy || this.code.busy,
			resumeViewId: this.project.activeView?.id,
			addFeature: () => this.commandService.executeCommand('ade.addFeature'),
			addDiagram: featureId => this.commandService.executeCommand('ade.addDiagram', featureId),
			openDiagram: id => this.project.showDiagram(id),
			inspectFeature: id => this.project.inspectElement(id),
			systemMap: () => this.project.showSystemMap(),
			navigation: () => this.commandService.executeCommand('ade.showNavigation'),
			purchaseExample: () => this.project.useDemo(),
			quantityTemplate: this.project.canCreatePureFeature ? () => this.commandService.executeCommand('ade.createPureFeature') : undefined
		});
	}

	private renderDiagram(content: HTMLElement): void {
		const model = this.project.model;
		const view = this.project.activeView;
		if (!view) {
			this.renderProjectHome(content);
			return;
		}
		const workspace = dom.append(content, dom.$('.ade-workspace'));
		workspace.classList.toggle('has-inspector', this.surface.inspectorOpen);
		const visual = dom.append(workspace, dom.$('section.ade-visual'));
		this.surface.renderCanvas(dom.append(visual, dom.$('.ade-canvas-scroll')), model, view);
		const help = dom.append(visual, dom.$('p.ade-canvas-help'));
		help.classList.toggle('is-pending', !!this.surface.pendingConnection);
		help.id = 'ade-canvas-help';
		const interaction = getProjectedInteraction(model, view);
		help.textContent = interaction
			? interaction.execution
				? localize('ade.sequence.projectedHelp', "Select a participant, message, frame or branch to inspect its properties. Edit the linked behavior to change the diagram. Focus the background and use arrow keys to pan.")
				: localize('ade.interaction.descriptiveHelp', "Select an item to inspect its properties. Focus the background and use arrow keys to pan.")
			: view.kind === 'sequence' && this.project.editable
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
			const closeInspector = () => { this.surface.inspectorOpen = false; this.render(); };
			this.iconButton(inspector, localize('ade.closeProperties', "Close Properties"), Codicon.close, closeInspector);
			if (this.surface.relationSelection) { this.inspector.renderRelationProperties(inspector, this.surface.relationSelection); } else { this.inspector.renderProperties(inspector, model, view, closeInspector); }
		}
	}

	private renderSystemMap(content: HTMLElement): void {
		const model = this.project.model;
		dom.append(content, dom.$('h1')).textContent = model.name;
		this.paragraph(content, localize('ade.map.intent', "System Map · Layered Atlas. Filter by actors, areas, features and elements; use the arrows to explore their contents."));
		this.surface.renderEditingToolbar(content);
		const key = `${this.project.modelUri?.toString() ?? 'demo'}:${model.id}`;
		if (this.mapAtlas?.model !== model) { this.mapAtlas = new SystemAtlas(model); }
		const state = this.mapAtlas.normalizeState(this.mapStates.get(key) ?? createSystemAtlasState());
		this.mapStates.set(key, state);
		renderAdeSystemMap(content, this.mapAtlas, this.controls, this.canvas.interactions, {
			state,
			change: next => { this.mapStates.set(key, next); this.render(); },
			element: id => this.project.inspectElement(id),
			diagram: id => this.project.showDiagram(id)
		});
	}

	private renderBreadcrumbs(parent: HTMLElement): void {
		const model = this.project.model, view = this.project.activeView;
		const inspecting = this.project.section === 'element' || this.project.section === 'impact';
		const path = inspecting ? getElementPath(model, this.project.selectedId) : (model.version === 4 || model.version === 5) && view?.subjectId ? getElementPath(model, view.subjectId) : [];
		const group = !inspecting ? getDiagramGroups(model).find(group => group.featureId && !path.some(element => element.id === group.featureId) && group.views.some(candidate => candidate.id === view?.id)) : undefined;
		const names = [model.name, ...path.map(element => element.name), ...(group ? [group.name] : []), ...(!inspecting && view ? [view.name] : [])];
		const repeated = new Set(names.filter((name, index) => names.indexOf(name) !== index));
		const elementName = (element: typeof path[number]) => repeated.has(element.name) ? localize('ade.breadcrumb.elementRole', "{0}: {1}", elementLabels[element.kind], element.name) : element.name;
		const breadcrumbs = dom.append(parent, dom.$('nav.ade-breadcrumbs'));
		breadcrumbs.setAttribute('aria-label', localize('ade.breadcrumbs', "Semantic Path"));
		this.button(breadcrumbs, repeated.has(model.name) ? localize('ade.breadcrumb.projectRole', "Project: {0}", model.name) : model.name, () => this.project.showSystemMap(), 'breadcrumb:system');
		if (inspecting) {
			for (const element of path) {
				if (element.id === this.project.selectedId) {
					const current = dom.append(breadcrumbs, dom.$('span'));
					current.textContent = elementName(element);
					current.setAttribute('aria-current', 'page');
				} else { this.button(breadcrumbs, elementName(element), () => this.project.inspectElement(element.id), `breadcrumb:${element.id}`); }
			}
		} else {
			for (const element of path) { this.button(breadcrumbs, elementName(element), () => { const next = (model.version === 4 || model.version === 5) ? getC4DrillDown(model, element.id)[0] : undefined; if (next) { this.project.showDiagram(next.id); this.project.selectElement(element.id); } else { this.project.inspectElement(element.id); } }, `c4-breadcrumb:${element.id}`); }
			if (group?.featureId) { this.button(breadcrumbs, repeated.has(group.name) ? localize('ade.breadcrumb.featureRole', "Feature: {0}", group.name) : group.name, () => this.project.inspectElement(group.featureId!), `breadcrumb:${group.featureId}`); }
			if (view) {
				const current = dom.append(breadcrumbs, dom.$('span'));
				current.textContent = repeated.has(view.name) ? localize('ade.breadcrumb.diagramRole', "Diagram: {0}", view.name) : view.name;
				current.setAttribute('aria-current', 'page');
			}
		}
	}

	private renderInspectionHeader(content: HTMLElement, title: string, intent: string): void {
		this.renderBreadcrumbs(content);
		dom.append(content, dom.$('h1')).textContent = title;
		this.paragraph(content, intent);
		this.surface.renderEditingToolbar(content);
	}

	private renderImpact(content: HTMLElement): void {
		const model = this.project.model;
		const element = model.semantics.elements.find(element => element.id === this.project.selectedId);
		if (!element) { return; }
		const page = dom.append(content, dom.$('section.ade-impact-page'));
		this.renderBreadcrumbs(page);
		const header = dom.append(page, dom.$('header.ade-impact-header'));
		const introduction = dom.append(header, dom.$('div.ade-impact-introduction'));
		dom.append(introduction, dom.$('h1')).textContent = localize('ade.impact.title', "Change Impact: {0}", element.name);
		dom.append(introduction, dom.$('p.ade-page-description')).textContent = impactScopeDescription;
		const actions = dom.append(header, dom.$('div.ade-impact-actions'));
		this.surface.renderEditingToolbar(actions);
		const detailsLabel = localize('ade.elementDetails', "Element Details");
		const details = this.button(actions, detailsLabel, () => this.project.inspectElement(element.id), 'impact-details');
		details.setAttribute('aria-label', detailsLabel);
		prependAdeIcon(details, Codicon.info);
		renderChangeImpact(page, model, element.id, this.controls, id => this.project.inspectElement(id), id => this.project.showDiagram(id));
		const properties = new AdeActionMenu(this.controls).disclosure(page, localize('ade.impact.elementProperties', "Element Properties"), 'impact-properties', { icon: Codicon.settingsGear });
		properties.parentElement!.classList.add('ade-impact-disclosure', 'ade-impact-properties');
		this.inspector.renderProperties(dom.append(properties, dom.$('section.ade-properties')), model);
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
			if (this.project.editable) { this.button(content, localize('ade.addDiagram', "Add Diagram"), () => this.commandService.executeCommand('ade.addDiagram', element.id)); }
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
		const items: ((IQuickPickItem & { view?: ModelView; command?: string }) | IQuickPickSeparator)[] = [];
		for (const group of getDiagramGroups(this.project.model)) {
			if (!group.views.length) { continue; }
			items.push({ type: 'separator', label: group.name });
			for (const view of group.views) { items.push({ label: view.name, description: viewLabels[view.kind], detail: view.subjectId ? this.project.model.semantics.elements.find(element => element.id === view.subjectId)?.name : undefined, view }); }
		}
		if (this.project.editable && !this.project.hasDiagramErrors && !this.ai.busy && !this.code.busy) {
			items.push({ type: 'separator', label: localize('ade.diagram.create', "Create") }, { label: localize('ade.addDiagram', "Add Diagram"), command: 'ade.addDiagram' }, { label: localize('ade.addFeature', "Add Feature"), command: 'ade.addFeature' });
		}
		const choice = await this.quick.pick<IQuickPickItem & { view?: ModelView; command?: string }>(items, { title: localize('ade.chooseDiagram', "Choose Diagram"), matchOnDescription: true });
		if (choice?.view) { this.project.showDiagram(choice.view.id); }
		else if (choice?.command) { await this.commandService.executeCommand(choice.command); }
	}

	private documentStatus(): string {
		return adeDocumentStatus({ error: this.project.error, saveError: this.project.saveError, loading: this.project.loading, dirty: this.project.dirty, hasDocument: !!this.project.modelUri, draft: this.project.hasStructuralErrors, operation: this.ai.busy ? this.ai.status : this.code.busy ? this.code.status : undefined, codeChanged: this.code.changed, readOnly: !this.project.editable && (!!this.project.modelUri || this.project.section !== 'home') });
	}

	private readonly canvas: AdeCanvasController;

	private readonly surface: AdeCanvasSurface;

	private readonly inspector: AdeInspector;

	private readonly workflow: AdeWorkflowContent;

	private readonly blueprint: AdeBlueprintEditor;

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
		this.canvas = this._register(new AdeCanvasController({ get root() { return self.root; }, reportError: error => { this.notifications.error(adeErrorNotification(error, 'edit', this.project.model)); this.render(); } }, this.controls, this.project, storageService));
		this.surface = new AdeCanvasSurface({ button: (parent, label, action, id) => this.button(parent, label, action, id), chooseDiagram: () => this.chooseDiagram(), focusSelection: () => this.focusSelection(), renderBreadcrumbs: (parent) => this.renderBreadcrumbs(parent), renderNavigation: (parent, canvas) => this.renderNavigation(parent, canvas), renderPrimaryActions: (parent) => this.renderPrimaryActions(parent), documentStatus: () => this.documentStatus(), render: () => this.render(), iconButton: (parent, label, icon, action, id) => this.iconButton(parent, label, icon, action, id), paragraph: (parent, content) => this.paragraph(parent, content), get root() { return self.root; }, revealElement: (id, viewId) => this.revealElement(id, viewId) }, this.canvas, this.controls, this.project, this.commandService, this.quick, this.contextMenus, this.notifications);
		this.inspector = new AdeInspector({ paragraph: (parent, content) => this.paragraph(parent, content), button: (parent, label, action, id) => this.button(parent, label, action, id), get root() { return self.root; }, revealElement: (id, viewId) => this.revealElement(id, viewId), relationMenu: (id, x, y) => this.surface.relationMenu(id, x, y), beginConnection: id => this.surface.beginConnection(id) }, this.controls, this.project, this.code, this.commandService);
		this.codeGeneration = this._register(new AdeFeatureCodeGeneration(this.project, this.ai, () => this.root.parentElement ?? this.root));
		this.workflow = new AdeWorkflowContent({ paragraph: (parent, content) => this.paragraph(parent, content), button: (parent, label, action, id) => this.button(parent, label, action, id), documentStatus: () => this.documentStatus(), get root() { return self.root; }, showReview: () => this.showReview() }, this.controls, this.project, this.ai, this.configurationService, this.notifications, this.code, this.commandService);
		this.blueprint = this._register(new AdeBlueprintEditor(project, id => {
			project.showDiagram(id);
			if (this.activeTab === 'blueprint') { this.showWorkspace(); }
		}));

		this._register(code.onDidChange(() => { if (this.root) { this.render(); } }));
		let reviewId = ai.diagramReview?.id;
		this._register(ai.onDidChange(() => { if (ai.diagramReview?.id !== reviewId) { reviewId = ai.diagramReview?.id; if (reviewId && this.activeTab !== 'blueprint') { this.activeTab = 'workspace'; } } if (this.root) { this.render(); } }));
		const navigationKey = () => `${project.section}:${project.activeView?.id ?? (project.section === 'element' || project.section === 'impact' ? project.selectedId : '')}`;
		let navigationContext = navigationKey();
		let modelRevision = project.modelRevision;
		let modelResource = project.modelUri?.toString();
		this._register(project.onDidChange(() => {
			const context = navigationKey();
			const revision = project.modelRevision;
			const resource = project.modelUri?.toString();
			// Repair or creation may change the available diagram as part of applying a document edit.
			if (resource !== modelResource || context !== navigationContext && (this.activeTab !== 'blueprint' || revision === modelRevision)) {
				this.activeTab = 'workspace';
			}
			navigationContext = context;
			modelRevision = revision;
			modelResource = resource;
			if (this.root) { this.render(); }
		}));
		this._register(configurationService.onDidChangeConfiguration(event => {
			if (this.root && (event.affectsConfiguration(AccessibilityVerbositySettingId.Ade) || event.affectsConfiguration('chat.disableAIFeatures') || event.affectsConfiguration('ade.focusDiagrams'))) { this.render(); }
		}));
		this._register(keybindingService.onDidUpdateKeybindings(() => { if (this.root) { this.render(); } }));

	}
}
