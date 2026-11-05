/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/ade.css';
import { localize } from '../../../../nls.js';
import * as dom from '../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { isCompatibleRelation, ModelView, RelationKind, SemanticModel } from '../common/semanticModel.js';
import { IAdeCodeService } from './adeCodeService.js';
import { IAdeAiService } from './adeAiService.js';
import { AdeInput } from './adeInput.js';
import { AdeProjectService, IAdeProjectService } from './adeProjectService.js';
import { AdeControls } from './adeControls.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { adeFocusedSurface, getAdeAccessibilityHint } from './adeAccessibilityContext.js';
import { elementLabels, relationLabels, viewLabels } from './adeLabels.js';
import { getDiagramGroups, getElementPath } from '../common/visualNavigation.js';
import { getSystemMap } from '../common/systemMap.js';
import { DiagramBox, placeConnectionLabel, routeDiagramConnections } from '../common/diagramRouting.js';
import { getSequenceDiagram } from '../common/sequenceDiagram.js';
import { renderAdeSequence } from './adeSequence.js';
import { renderAdeState, stateTransitionLabel } from './adeState.js';
import { diagramNodeHeight, diagramNodeWidth } from '../common/diagramLayout.js';
import { IAction, Separator, toAction } from '../../../../base/common/actions.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { renderChangeImpact, renderRecordedEvidence } from './adeImpact.js';

export class AdeEditor extends EditorPane {
	static readonly ID = AdeInput.ID;
	private root!: HTMLElement;
	private readonly interactions = this._register(new DisposableStore());
	private zoom = 1;
	private relationSelection: string | undefined;
	private lastElementSelection = '';
	private pendingConnection: { from: string; kind: RelationKind; viewId: string; version: string } | undefined;
	private readonly controls = this._register(new AdeControls());
	private canvasViewport: HTMLElement | undefined;
	private canvasContent: HTMLElement | undefined;
	private renderedContext: string | undefined;
	private content: HTMLElement | undefined;
	private readonly scrollPositions = new Map<string, { left: number; top: number }>();
	private readonly contentPositions = new Map<string, number>();

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
		@IHoverService private readonly hover: IHoverService,
	) {
		super(AdeEditor.ID, group, telemetryService, themeService, storageService);
		this._register(code.onDidChange(() => { if (this.root) { this.render(); } }));
		this._register(ai.onDidChange(() => { if (this.root) { this.render(); } }));
		this._register(project.onDidChange(() => { if (this.root) { this.render(); } }));
		this._register(configurationService.onDidChangeConfiguration(event => {
			if (this.root && (event.affectsConfiguration(AccessibilityVerbositySettingId.Ade) || event.affectsConfiguration('chat.disableAIFeatures'))) { this.render(); }
		}));
		this._register(keybindingService.onDidUpdateKeybindings(() => { if (this.root) { this.render(); } }));
	}

	protected override createEditor(parent: HTMLElement): void {
		this.root = dom.append(parent, dom.$('.ade-shell'));
		this.root.tabIndex = -1;
		this.root.setAttribute('aria-label', localize('ade.workbenchLabel', "A.D.E Visual Workbench"));
		adeFocusedSurface.bindTo(this._register(this.contextKeyService.createScoped(this.root))).set('editor');
		void this.project.restore();
		this.render();
		void this.ai.refreshConnection();
		this._register(dom.addDisposableListener(this.root, 'keydown', (event: KeyboardEvent) => {
			if (event.key === 'Escape' && this.pendingConnection) { this.pendingConnection = undefined; this.render(); }
		}));
	}

	override layout(dimension: dom.Dimension): void {
		dom.size(this.root, dimension.width, dimension.height);
		this.root.classList.toggle('ade-narrow', dimension.width < 850);
	}

	override focus(): void { this.root?.focus(); }

	captureAccessibilityFocus(): () => void { return this.controls.captureFocus(this.root); }

	focusSelection(): void {
		if (!this.controls.focusTarget(`node:${this.project.selectedId}`)) { this.focus(); }
	}
	private revealElement(id: string, viewId?: string): void {
		if (this.project.revealElement(id, viewId)) { this.focusSelection(); }
	}

	private button(parent: HTMLElement, label: string, action: () => void, id = label): HTMLButtonElement {
		return this.controls.button(parent, label, action, id);
	}

	private paragraph(parent: HTMLElement, content: string): void {
		dom.append(parent, dom.$('p')).textContent = content;
	}

	private render(): void {
		if (this.lastElementSelection !== this.project.selectedId || !this.project.activeView?.relationIds.includes(this.relationSelection ?? '')) { this.relationSelection = undefined; }
		this.lastElementSelection = this.project.selectedId;
		if (this.pendingConnection && (this.pendingConnection.version !== this.project.documentVersion || this.pendingConnection.viewId !== this.project.activeView?.id)) { this.pendingConnection = undefined; }
		this.root.setAttribute('aria-description', getAdeAccessibilityHint(this.configurationService, this.keybindingService));
		if (this.renderedContext) {
			if (this.canvasViewport) { this.scrollPositions.set(this.renderedContext, { left: this.canvasViewport.scrollLeft, top: this.canvasViewport.scrollTop }); }
			if (this.content) { this.contentPositions.set(this.renderedContext, this.content.scrollTop); }
		}
		this.canvasViewport = undefined;
		this.canvasContent = undefined;
		this.renderedContext = `${this.project.modelUri?.toString() ?? 'demo'}:${this.project.section}:${this.project.section === 'element' || this.project.section === 'impact' ? this.project.selectedId : this.project.activeView?.id ?? ''}`;
		this.interactions.clear();
		this.controls.render(this.root, () => {
			dom.clearNode(this.root);
			const navigation = dom.append(this.root, dom.$('nav.ade-navigation'));
			navigation.setAttribute('aria-label', localize('ade.navigation', "Project Navigation"));
			this.iconButton(navigation, localize('ade.back', "Back"), Codicon.arrowLeft, () => this.project.goBack()).disabled = !this.project.canGoBack;
			this.iconButton(navigation, localize('ade.forward', "Forward"), Codicon.arrowRight, () => this.project.goForward()).disabled = !this.project.canGoForward;
			this.iconButton(navigation, localize('ade.home', "Home"), Codicon.home, () => this.project.showHome());
			this.button(navigation, localize('ade.systemMap', "System Map"), () => this.project.showSystemMap()).disabled = this.project.loading || !!this.project.error;
			this.iconButton(navigation, localize('ade.search.button', "Search System"), Codicon.search, () => { void this.commandService.executeCommand('ade.search'); }).disabled = this.project.loading || !!this.project.error;
			this.button(navigation, localize('ade.chooseDiagram', "Choose Diagram"), () => { void this.chooseDiagram(); });
			const sync = this.button(navigation, localize('ade.syncProject', "Sync Project"), () => { void this.code.sync(); });
			sync.classList.add('ade-sync-project');
			this.explainDisabled(sync, !this.code.available || this.code.busy || this.ai.busy, !this.code.available ? localize('ade.syncUnavailable', "Code Sync Is Available in the Desktop App.") : localize('ade.operationWait', "Wait for the Active A.D.E Operation to Finish."));
			const syncStatus = dom.append(navigation, dom.$('span.ade-sync-status'));
			syncStatus.setAttribute('role', 'status');
			syncStatus.textContent = this.code.changed ? localize('ade.code.lastStatus', "{0} · Source Changes Detected", this.code.status) : this.code.status;

			const content = dom.append(this.root, dom.$('main.ade-content'));
			this.content = content;
			if (this.project.section === 'home') {
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
			this.renderTools(dom.append(this.root, dom.$('nav.ade-tools')));
		});
		this.restoreCanvasScroll();
		if (this.content) { this.content.scrollTop = this.contentPositions.get(this.renderedContext) ?? 0; }
	}

	private restoreCanvasScroll(): void {
		if (this.canvasViewport && this.renderedContext) {
			const position = this.scrollPositions.get(this.renderedContext);
			if (position) {
				this.canvasViewport.scrollLeft = position.left;
				this.canvasViewport.scrollTop = position.top;
			}
		}
	}

	private renderHome(content: HTMLElement): void {
		dom.append(content, dom.$('h1')).textContent = localize('ade.welcome', "Your System, in Context");
		this.paragraph(content, localize('ade.intro', "Design and explore your system through its features and diagrams."));
		this.button(content, localize('ade.openProject', "Open Project"), () => { void this.commandService.executeCommand('ade.openProject'); });
		this.button(content, localize('ade.openModel', "Open Model"), () => { void this.project.chooseModel(); });
		this.button(content, localize('ade.demo', "Explore Purchase Example"), () => { void this.project.useDemo(); });
		this.button(content, localize('ade.createProject', "Create Project"), () => { void this.commandService.executeCommand('ade.createProject'); });
		this.button(content, localize('ade.importCode', "Import Codebase"), () => { void this.code.importCodebase(); }).disabled = !this.code.available || this.code.busy;
		this.paragraph(content, localize('ade.editingFuture', "Create a project, add a feature, and design its structure and flow. The purchase example is read-only."));
	}

	private renderDiagram(content: HTMLElement): void {
		const model = this.project.model;
		const view = this.project.activeView;
		this.renderBreadcrumbs(content);
		dom.append(content, dom.$('h1')).textContent = view?.name ?? model.name;
		this.paragraph(content, localize('ade.intent', "{0} · Design intent", model.name));
		if (view) { this.paragraph(content, localize('ade.diagramType', "Diagram Type: {0}", viewLabels[view.kind])); }
		this.renderEditingToolbar(content);
		if (this.project.saveError) {
			const error = dom.append(content, dom.$('p.ade-status'));
			error.setAttribute('role', 'alert');
			error.textContent = this.project.saveError;
		}
		for (const diagnostic of this.project.diagnostics) { this.paragraph(content, diagnostic); }
		if (!view) {
			if (model.semantics.elements.some(element => element.kind === 'feature')) {
				this.paragraph(content, localize('ade.noDiagramsExistingFeatures', "This project has no diagrams. Add a diagram to an existing feature to continue."));
				this.button(content, localize('ade.addDiagram', "Add Diagram"), () => { void this.commandService.executeCommand('ade.addDiagram'); });
			} else { this.paragraph(content, localize('ade.noDiagrams', "This project has no diagrams. Add a feature to begin designing its structure and flow.")); }
			this.button(content, localize('ade.openModel', "Open Model"), () => { void this.project.chooseModel(); });
			return;
		}
		if (view.kind === 'state') { renderAdeState(content, model, view, this.controls, id => this.project.inspectElement(id), id => { this.project.selectElement(id); this.focusSelection(); }); }
		const workspace = dom.append(content, dom.$('.ade-workspace'));
		const visual = dom.append(workspace, dom.$('section.ade-visual'));
		if (view.kind === 'sequence') { this.paragraph(visual, localize('ade.sequence.intent', "Declared sequence: invocations, reads and writes, one occurrence per relationship. Order is local to this diagram, not observed execution.")); }
		this.renderCanvas(dom.append(visual, dom.$('.ade-canvas-scroll')), model, view);
		this.paragraph(visual, localize('ade.relation.legend', "Relationships: solid arrow = invocation; dashed arrow = dependency; dashed triangle = realization. Read, write and transition types are named on each connection."));
		const help = dom.append(visual, dom.$('p'));
		help.id = 'ade-canvas-help';
		help.textContent = view.kind === 'sequence' && this.project.editable
			? localize('ade.sequence.help', "Select a participant or message to inspect its shared contract. Use Properties to order participants and messages or remove them from this diagram. Focus the background and use arrow keys to pan.")
			: view.kind === 'sequence' ? localize('ade.sequence.readonlyHelp', "Select a participant or message to inspect its shared contract. Read Diagram presents the sequence as text. Focus the background and use arrow keys to pan.")
			: this.project.editable
			? localize('ade.editableCanvasHelp', "Tab to an element and press Enter to select it. Arrow keys move the focused element; Shift increases the step. Focus the diagram background and use arrow keys to pan. Relationships and conditions appear in Properties.")
			: localize('ade.canvasHelp', "Tab to an element and press Enter to select it. Focus the diagram background and use arrow keys to pan. Relationships and conditions appear in Properties.");
		if (this.pendingConnection) { help.textContent = localize('ade.connection.pending', "Choose a Compatible Target on the Canvas for {0}, or Press Escape to Cancel.", relationLabels[this.pendingConnection.kind]); }
		const accessibilityHint = getAdeAccessibilityHint(this.configurationService, this.keybindingService);
		if (accessibilityHint) { help.textContent = localize('ade.canvasHelpWithHint', "{0} {1}", help.textContent, accessibilityHint); }
		const inspector = dom.append(workspace, dom.$('aside.ade-properties'));
		if (this.ai.available && this.configurationService.getValue<boolean>('chat.disableAIFeatures') !== true) {
			const collaboration = this.controls.details(inspector, localize('ade.ai.heading', "AI Collaboration"), 'ai-collaboration');
			this.renderAi(collaboration);
		}
		const properties = dom.append(inspector, dom.$('section.ade-element-properties'));
		if (this.relationSelection) { this.renderRelationProperties(properties, this.relationSelection); } else { this.renderProperties(properties, model, view); }
	}

	private renderSystemMap(content: HTMLElement): void {
		const model = this.project.model;
		const overview = getSystemMap(model);
		const elements = new Map(model.semantics.elements.map(element => [element.id, element]));
		dom.append(content, dom.$('h1')).textContent = model.name;
		this.paragraph(content, localize('ade.map.intent', "System Map · Design intent. Groups follow semantic containment; connections summarize declared relationships."));
		this.renderEditingToolbar(content);
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
		this.renderEditingToolbar(content);
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
		this.renderProperties(dom.append(content, dom.$('section.ade-properties')), model);
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
		this.renderProperties(dom.append(content, dom.$('section.ade-properties')), model);
	}

	private renderCanvas(parent: HTMLElement, model: SemanticModel, view: ModelView): void {
		this.canvasViewport = parent;
		parent.tabIndex = 0;
		this.controls.trackFocus('canvas', parent);
		parent.setAttribute('role', 'region');
		parent.setAttribute('aria-describedby', 'ade-canvas-help');
		parent.setAttribute('aria-label', localize('ade.canvas', "Diagram: {0}", view.name));
		if (!view.nodes.length) {
			this.paragraph(parent, localize('ade.emptyDiagram', "This diagram has no elements."));
			return;
		}
		if (view.kind === 'sequence') {
			const frame = dom.append(parent, dom.$('.ade-canvas'));
			const canvas = dom.append(frame, dom.$('.ade-canvas-content'));
			this.canvasContent = canvas;
			const size = renderAdeSequence(canvas, model, view, this.controls, this.project.selectedId, id => { if (this.pendingConnection) { void this.finishConnection(id); } else { this.project.selectElement(id); } }, {
				element: (target, id) => this.installContextMenu(target, (x, y) => this.elementMenu(id, x, y)),
				relation: (target, id) => this.installContextMenu(target, (x, y) => this.relationMenu(id, x, y))
			});
			dom.size(canvas, size.width, size.height);
			dom.size(frame, size.width * this.zoom, size.height * this.zoom);
			canvas.style.transformOrigin = '0 0';
			canvas.style.transform = `scale(${this.zoom})`;
			this.installPan(parent);
			const sequence = getSequenceDiagram(model, view);
			if (!sequence.messages.length) { this.paragraph(parent, localize('ade.sequence.empty', "No messages. Add an existing interaction or connect participants.")); }
			if (sequence.unsupported.length) {
				this.paragraph(parent, localize('ade.sequence.unsupported', "Not rendered as sequence messages: {0}. These relationships remain in Properties and Read Diagram.", sequence.unsupported.map(relation => relation.name || relationLabels[relation.kind]).join(', ')));
			}
			return;
		}
		const height = diagramNodeHeight;
		const left = Math.min(...view.nodes.map(node => node.x));
		const top = Math.min(...view.nodes.map(node => node.y));
		const frame = dom.append(parent, dom.$('.ade-canvas'));
		const canvas = dom.append(frame, dom.$('.ade-canvas-content'));
		this.canvasContent = canvas;
		canvas.style.transformOrigin = '0 0';
		this.installPan(parent);
		const svg = parent.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('role', 'group');
		svg.setAttribute('aria-label', localize('ade.connections', "Diagram Relationships"));
		canvas.appendChild(svg);
		const paths = parent.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g');
		const labels = parent.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g');
		svg.append(paths, labels);
		const boxes = view.nodes.map(node => ({ id: node.elementId, x: node.x - left + 64, y: node.y - top + 64, width: diagramNodeWidth(model.semantics.elements.find(element => element.id === node.elementId)!.name), height }));
		const relationships = model.semantics.relations.filter(relation => view.relationIds.includes(relation.id));
		const routes = routeDiagramConnections(boxes, relationships);
		const connections = relationships.map(relation => ({ relation, route: routes.get(relation.id) }));
		const points = connections.flatMap(connection => connection.route ?? []);
		const shiftX = Math.max(0, 32 - Math.min(...boxes.map(box => box.x), ...points.map(point => point.x)));
		const shiftY = Math.max(0, 32 - Math.min(...boxes.map(box => box.y), ...points.map(point => point.y)));
		for (const box of boxes) { box.x += shiftX; box.y += shiftY; }
		for (const point of points) { point.x += shiftX; point.y += shiftY; }
		const occupied: DiagramBox[] = [...boxes];
		for (const { relation, route } of connections) {
			if (!route || route.length < 2) { continue; }
			const end = route[route.length - 1];
			const previous = route[route.length - 2];
			const angle = Math.atan2(end.y - previous.y, end.x - previous.x);
			const path = parent.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
			path.setAttribute('data-relation-id', relation.id);
			path.setAttribute('d', `${route.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')} M ${end.x - 10 * Math.cos(angle - 0.5)} ${end.y - 10 * Math.sin(angle - 0.5)} L ${end.x} ${end.y} L ${end.x - 10 * Math.cos(angle + 0.5)} ${end.y - 10 * Math.sin(angle + 0.5)}`);
			const group = parent.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g');
			group.setAttribute('class', `ade-connection${this.relationSelection === relation.id ? ' selected' : ''}`);
			group.setAttribute('tabindex', '0'); group.setAttribute('role', 'button');
			group.setAttribute('data-relation-id', relation.id);
			const fromName = model.semantics.elements.find(element => element.id === relation.from)!.name;
			const toName = model.semantics.elements.find(element => element.id === relation.to)!.name;
			group.setAttribute('aria-label', localize('ade.relation.accessible', "{0} · {1} → {2} · {3}", relationLabels[relation.kind], fromName, toName, relation.name));
			group.setAttribute('aria-description', [relation.condition, relation.errorCode].filter(Boolean).join(' · '));
			this.controls.trackFocus(`edge:${relation.id}`, group);
			if (relation.kind === 'dependency' || relation.kind === 'realization') { path.setAttribute('stroke-dasharray', '6 4'); }
			if (relation.kind === 'realization') { path.setAttribute('d', path.getAttribute('d')! + ' Z'); }
			group.appendChild(path); paths.appendChild(group);
			const hit = path.cloneNode() as SVGPathElement;
			hit.setAttribute('class', 'ade-connection-hit'); hit.removeAttribute('data-relation-id'); hit.removeAttribute('stroke-dasharray');
			group.appendChild(hit);
			const candidatesAt = (x: number, y: number) => {
				const bounds = svg.getBoundingClientRect();
				const point = { x: (x - bounds.left) / this.zoom, y: (y - bounds.top) / this.zoom };
				return connections.filter(connection => connection.route?.slice(1).some((end, index) => {
					const start = connection.route![index];
					return point.x >= Math.min(start.x, end.x) - 8 / this.zoom && point.x <= Math.max(start.x, end.x) + 8 / this.zoom && point.y >= Math.min(start.y, end.y) - 8 / this.zoom && point.y <= Math.max(start.y, end.y) + 8 / this.zoom;
				})).map(connection => connection.relation);
			};
			const select = async (event?: MouseEvent) => {
				const candidates = event?.detail ? candidatesAt(event.clientX, event.clientY) : [];
				const chosen = candidates.length > 1 ? (await this.quick.pick(candidates.map(relation => ({ label: relation.name || relationLabels[relation.kind], description: relationLabels[relation.kind], relation })), { title: localize('ade.relation.chooseOverlap', "Choose a Relationship at This Point") }))?.relation : relation;
				if (chosen) { this.controls.setExpanded('ai-collaboration', false); this.relationSelection = chosen.id; group.focus(); this.render(); }
			};
			const context = (x: number, y: number) => {
				const candidates = candidatesAt(x, y);
				if (candidates.length > 1) { this.showMenu(x, y, candidates.map(relation => toAction({ id: `ade.overlap.${relation.id}`, label: `${relationLabels[relation.kind]} · ${relation.name}`, run: () => this.relationMenu(relation.id, x, y) }))); }
				else { this.relationMenu(relation.id, x, y); }
			};
			this.interactions.add(dom.addDisposableListener(group, 'click', (event: MouseEvent) => { void select(event); }));
			this.interactions.add(dom.addDisposableListener(group, 'keydown', (event: KeyboardEvent) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void select(); } }));
			this.installContextMenu(group, context);
			const label = parent.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'text');
			label.setAttribute('class', 'ade-connection-label');
			label.textContent = view.kind === 'state' && relation.kind === 'transition' ? stateTransitionLabel(relation) : [relationLabels[relation.kind], relation.name, relation.condition ? `[${relation.condition}]` : '', relation.errorCode].filter(Boolean).join(' · ');
			label.setAttribute('data-relation-id', relation.id);
			this.interactions.add(dom.addDisposableListener(label, 'click', (event: MouseEvent) => { void select(event); }));
			this.installContextMenu(label, context);
			labels.appendChild(label);
			const placement = placeConnectionLabel(route, label.getComputedTextLength() + 12, occupied);
			occupied.push(placement.box);
			const { x, y, width: labelWidth } = placement.box;
			const background = parent.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'rect');
			background.setAttribute('class', 'ade-connection-background');
			background.setAttribute('x', String(x)); background.setAttribute('y', String(y));
			background.setAttribute('width', String(labelWidth)); background.setAttribute('height', String(placement.box.height));
			labels.insertBefore(background, label);
			label.setAttribute('x', String(x + 6)); label.setAttribute('y', String(y + 14));
			if (placement.detached) {
				const leader = parent.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
				leader.setAttribute('class', 'ade-connection-leader');
				const attachmentX = Math.max(x, Math.min(placement.anchor.x, x + labelWidth));
				const attachmentY = Math.max(y, Math.min(placement.anchor.y, y + placement.box.height));
				leader.setAttribute('d', `M ${placement.anchor.x} ${placement.anchor.y} L ${attachmentX} ${attachmentY}`);
				paths.appendChild(leader);
			}
		}
		const canvasWidth = Math.max(...occupied.map(box => box.x + box.width), ...points.map(point => point.x)) + 32;
		const canvasHeight = Math.max(...occupied.map(box => box.y + box.height), ...points.map(point => point.y)) + 32;
		dom.size(frame, canvasWidth * this.zoom, canvasHeight * this.zoom);
		dom.size(canvas, canvasWidth, canvasHeight);
		svg.setAttribute('width', String(canvasWidth)); svg.setAttribute('height', String(canvasHeight));
		// Measure labels at their logical size before applying the viewport zoom.
		canvas.style.transform = `scale(${this.zoom})`;
		const positions = new Map(boxes.map(box => [box.id, box]));
		const blocked = connections.filter(connection => !connection.route).length;
		if (blocked) {
			this.paragraph(parent, localize('ade.routing.blocked', "{0} connections cannot be routed through overlapping nodes. Move the nodes apart; all relationships remain available in Properties and Read Diagram.", blocked));
		}
		for (const node of view.nodes) {
			const element = model.semantics.elements.find(element => element.id === node.elementId)!;
			const position = positions.get(element.id)!;
			const button = this.button(canvas, element.name, () => { if (this.pendingConnection) { void this.finishConnection(element.id); } else { this.controls.setExpanded('ai-collaboration', false); this.relationSelection = undefined; this.project.selectElement(element.id); } }, `node:${element.id}`);
			button.classList.add('ade-node');
			button.dataset.kind = elementLabels[element.kind];
			button.setAttribute('aria-label', element.name);
			const selectedRelation = model.semantics.relations.find(relation => relation.id === this.relationSelection);
			button.classList.toggle('ade-related-node', selectedRelation?.from === element.id || selectedRelation?.to === element.id);
			button.style.left = `${position.x}px`;
			button.style.top = `${position.y}px`;
			button.style.width = `${position.width}px`;
			button.style.height = `${height}px`;
			button.setAttribute('aria-pressed', String(!this.relationSelection && element.id === this.project.selectedId));
			button.setAttribute('aria-description', elementLabels[element.kind]);
			this.installContextMenu(button, (x, y) => this.elementMenu(element.id, x, y));
			if (this.project.editable) { this.installNodeEditing(button, view, element.id); }
		}
		// Keep the historical node-first tab order, followed by keyboard-accessible connections.
		canvas.appendChild(svg);
	}

	private renderProperties(detail: HTMLElement, model: SemanticModel, view?: ModelView): void {
		detail.setAttribute('aria-label', localize('ade.properties', "Properties"));
		dom.append(detail, dom.$('h2')).textContent = localize('ade.properties', "Properties");
		const element = model.semantics.elements.find(element => element.id === this.project.selectedId);
		if (!element) { return; }
		dom.append(detail, dom.$('h3')).textContent = element.name;
		this.paragraph(detail, localize('ade.elementKind', "Type: {0}", elementLabels[element.kind]));
		if (this.project.section !== 'impact') { this.button(detail, localize('ade.showImpact.button', "Show Change Impact"), () => this.project.showImpact(element.id), 'show-impact'); }
		if (element.kind === 'state' && element.parentId) {
			const resource = model.semantics.elements.find(candidate => candidate.id === element.parentId && candidate.kind === 'resource');
			if (resource) { this.button(detail, localize('ade.state.resource', "Resource: {0}", resource.name), () => this.project.inspectElement(resource.id), `state-owner:${resource.id}`); }
		}
		if (this.project.section === 'diagram') {
			this.button(detail, localize('ade.elementDetails', "Element Details"), () => this.project.inspectElement(element.id));
		}
		const views = model.views.filter(candidate => candidate.nodes.some(node => node.elementId === element.id));
		if (views.length) {
			const perspectives = dom.append(detail, dom.$('section'));
			dom.append(perspectives, dom.$('h3')).textContent = localize('ade.elementViews', "Diagrams Containing This Element");
			for (const candidate of views) {
				this.button(perspectives, candidate.name, () => this.revealElement(element.id, candidate.id), `element-view:${candidate.id}`).disabled = candidate.id === view?.id;
			}
		} else if (element.kind !== 'feature') { this.paragraph(detail, localize('ade.notPlaced', "This element is not placed in a diagram.")); }
		if (this.project.editable) {
			if (view?.kind === 'state') {
				this.button(detail, element.kind === 'state' ? localize('ade.state.removeState', "Remove State from Diagram") : localize('ade.state.removeContext', "Remove Element from Diagram"), () => this.project.edit({ kind: 'exclude', viewId: view.id, id: element.id, target: 'element' }));
			}
			if (view?.kind === 'sequence') {
				const index = view.nodes.findIndex(node => node.elementId === element.id);
				this.button(detail, localize('ade.sequence.left', "Move Participant Left"), () => this.project.edit({ kind: 'sequenceOrder', viewId: view.id, id: element.id, target: 'participant', direction: -1 })).disabled = index <= 0;
				this.button(detail, localize('ade.sequence.right', "Move Participant Right"), () => this.project.edit({ kind: 'sequenceOrder', viewId: view.id, id: element.id, target: 'participant', direction: 1 })).disabled = index === view.nodes.length - 1;
				this.button(detail, localize('ade.sequence.removeParticipant', "Remove Participant from Diagram"), () => this.project.edit({ kind: 'sequenceRemove', viewId: view.id, id: element.id, target: 'participant' }));
			}
			for (const [label, command] of [
				[localize('ade.renameElement', "Rename Element"), 'ade.renameElement'],
				[localize('ade.editDescription', "Edit Description"), 'ade.description'],
				[localize('ade.editBehavior', "Edit Behavioral Contract"), 'ade.behavior'],
				[localize('ade.connectSelection', "Connect Selection"), 'ade.connect'],
				[localize('ade.deleteElement', "Delete Element"), 'ade.deleteElement']
			]) {
				if (command === 'ade.connect' && !view) { continue; }
				this.button(detail, label, () => { void this.commandService.executeCommand(command); }).disabled = command === 'ade.connect' && view?.kind === 'state' && element.kind !== 'state';
			}
		}
		if (element.description) { this.paragraph(detail, element.description); }
		if (element.behavior) {
			dom.append(detail, dom.$('h3')).textContent = localize('ade.behavior.heading', "Behavioral Contract");
			this.paragraph(detail, localize('ade.behavior.intent', "Contract declarations describe expected behavior."));
			for (const field of element.behavior.inputs) { this.paragraph(detail, localize('ade.input', "Input: {0} ({1}), {2}", field.name, field.type, field.required ? localize('ade.field.required', "Required") : localize('ade.field.optional', "Optional"))); }
			for (const field of element.behavior.outputs) { this.paragraph(detail, localize('ade.output', "Output: {0} ({1}), {2}", field.name, field.type, field.required ? localize('ade.field.required', "Required") : localize('ade.field.optional', "Optional"))); }
			for (const condition of element.behavior.preconditions) { this.paragraph(detail, localize('ade.precondition', "Precondition: {0}", condition)); }
			for (const condition of element.behavior.postconditions) { this.paragraph(detail, localize('ade.postcondition', "Postcondition: {0}", condition)); }
			for (const error of element.behavior.errors) { this.paragraph(detail, localize('ade.behavior.error', "Error {0}: {1}", error.code, error.description)); }
			for (const permission of element.behavior.permissions) {
				this.paragraph(detail, localize('ade.permission', "Authorization: {0} · {1}", model.semantics.elements.find(element => element.id === permission.actorId)!.name, permission.capability));
			}
			for (const criterion of element.behavior.acceptanceCriteria) {
				this.paragraph(detail, localize('ade.acceptance', "Given {0}, when {1}, then {2}.", criterion.given, criterion.when, criterion.then));
			}
		}
		for (const relation of model.semantics.relations.filter(relation => relation.from === element.id || relation.to === element.id)) {
			const targetId = relation.from === element.id ? relation.to : relation.from;
			const from = model.semantics.elements.find(element => element.id === relation.from)!;
			const to = model.semantics.elements.find(element => element.id === relation.to)!;
			const label = localize('ade.relation', "{0} → {1}: {2}", from.name, to.name, relation.name || relation.kind);
			this.button(detail, label, () => this.revealElement(targetId), `relation:${relation.id}`);
			if (this.project.editable && view?.kind === 'sequence' && view.relationIds.includes(relation.id)) {
				const messages = getSequenceDiagram(model, view).messages;
				const index = messages.findIndex(message => message.id === relation.id);
				const actions = this.controls.details(detail, localize('ade.sequence.messageOptions', "Sequence Message Options: {0}", relation.name || relationLabels[relation.kind]), `sequence-options:${relation.id}`);
				this.button(actions, localize('ade.sequence.earlier', "Move Message Earlier"), () => this.project.edit({ kind: 'sequenceOrder', viewId: view.id, id: relation.id, target: 'message', direction: -1 }), `earlier:${relation.id}`).disabled = index <= 0;
				this.button(actions, localize('ade.sequence.later', "Move Message Later"), () => this.project.edit({ kind: 'sequenceOrder', viewId: view.id, id: relation.id, target: 'message', direction: 1 }), `later:${relation.id}`).disabled = index < 0 || index === messages.length - 1;
				this.button(actions, localize('ade.sequence.removeMessage', "Remove Message from Diagram"), () => this.project.edit({ kind: 'sequenceRemove', viewId: view.id, id: relation.id, target: 'message' }), `remove-message:${relation.id}`);
			}
			if (this.project.editable) {
				if (relation.kind === 'transition') {
					this.button(detail, localize('ade.state.editEvent', "Edit Transition Event"), () => { void this.commandService.executeCommand('ade.renameRelation', relation.id); }, `event:${relation.id}`);
				}
				if (view?.kind === 'state' && view.relationIds.includes(relation.id)) {
					this.button(detail, localize('ade.state.removeTransition', "Remove Relationship from Diagram"), () => this.project.edit({ kind: 'exclude', viewId: view.id, id: relation.id, target: 'relation' }), `exclude:${relation.id}`);
				}
				this.button(detail, localize('ade.editCondition', "Edit Condition"), () => { void this.commandService.executeCommand('ade.condition', relation.id); }, `condition:${relation.id}`);
				this.button(detail, localize('ade.editRelationError', "Edit Relationship Error"), () => { void this.commandService.executeCommand('ade.relationError', relation.id); }, `error:${relation.id}`);
				this.button(detail, localize('ade.deleteRelationship', "Delete Relationship"), () => { void this.commandService.executeCommand('ade.deleteRelation', relation.id); }, `delete:${relation.id}`);
			}
			if (relation.condition) { this.paragraph(detail, localize('ade.condition', "Condition: {0}", relation.condition)); }
			if (relation.errorCode) { this.paragraph(detail, localize('ade.errorCodeLabel', "Error: {0}", relation.errorCode)); }
		}
		renderRecordedEvidence(detail, model, element.id, this.controls);
	}

	private renderEditingToolbar(parent: HTMLElement): void {
		const toolbar = dom.append(parent, dom.$('nav.ade-editing'));
		toolbar.setAttribute('aria-label', localize('ade.editing', "Diagram Editing"));
		if (this.project.modelUri) {
			this.iconButton(toolbar, localize('ade.save', "Save"), Codicon.save, () => { void this.project.save(); }).disabled = !this.project.dirty;
			this.iconButton(toolbar, localize('ade.undo', "Undo"), Codicon.discard, () => { void this.project.undo(); }).disabled = !this.project.canUndo;
			this.iconButton(toolbar, localize('ade.redo', "Redo"), Codicon.redo, () => { void this.project.redo(); }).disabled = !this.project.canRedo;
			const actions = this.controls.details(toolbar, localize('ade.projectOptions', "Project Options"), 'project-options');
			this.button(actions, localize('ade.reload', "Reload Project"), () => { void this.commandService.executeCommand('ade.reload'); });
			this.button(actions, localize('ade.saveCopy', "Save Project Copy"), () => { void this.commandService.executeCommand('ade.saveCopy'); });
			this.paragraph(toolbar, this.project.dirty ? localize('ade.unsaved', "Unsaved Changes") : localize('ade.saved', "Saved"));
		}
		if (this.project.editable && this.project.section !== 'element' && this.project.section !== 'impact') {
			if (this.project.section === 'map') {
				this.button(toolbar, localize('ade.addFeature', "Add Feature"), () => { void this.commandService.executeCommand('ade.addFeature'); });
			} else {
				this.button(toolbar, this.project.activeView?.kind === 'state' ? localize('ade.state.addState', "Add State") : localize('ade.addElement', "Add Element"), () => { void this.commandService.executeCommand('ade.addElement'); }).disabled = !this.project.activeView;
				const actions = this.controls.details(toolbar, localize('ade.diagramOptions', "Diagram Options"), 'diagram-options');
				for (const [label, command] of [
					[localize('ade.addExisting', "Add Existing Element"), 'ade.addExisting'],
					[localize('ade.renameDiagram', "Rename Diagram"), 'ade.renameDiagram'],
					[localize('ade.deleteDiagram', "Delete Diagram"), 'ade.deleteDiagram']
				]) {
					this.button(actions, label, () => { void this.commandService.executeCommand(command); });
				}
				if (this.project.activeView?.kind === 'sequence') {
					this.button(toolbar, localize('ade.sequence.addMessage', "Add Existing Message"), () => { void this.commandService.executeCommand('ade.addSequenceMessage'); });
				}
				if (this.project.activeView?.kind === 'state') {
					this.button(toolbar, localize('ade.state.addExisting', "Add Existing State"), () => { void this.commandService.executeCommand('ade.addExistingState'); });
					this.button(toolbar, localize('ade.state.addTransition', "Add Existing Transition"), () => { void this.commandService.executeCommand('ade.addTransition'); });
					this.button(actions, localize('ade.state.includeLifecycle', "Include Resource Lifecycle"), () => { void this.commandService.executeCommand('ade.includeLifecycle'); });
				}
				if (this.project.activeView) {
					this.button(actions, localize('ade.addFeature', "Add Feature"), () => { void this.commandService.executeCommand('ade.addFeature'); });
				}
				if (!this.project.activeView) {
					this.button(toolbar, localize('ade.addFeature', "Add Feature"), () => { void this.commandService.executeCommand('ade.addFeature'); });
				}
			}
		}
		if (this.project.activeView) {
			if (this.project.editable && this.project.activeView.kind !== 'sequence') { this.button(toolbar, localize('ade.layout', "Arrange Diagram"), () => { void this.commandService.executeCommand('ade.layout'); }); }
			this.button(toolbar, localize('ade.createRelationship', "Create Relationship…"), () => { void this.beginConnection(this.project.selectedId); }).disabled = !this.project.editable;
			this.button(toolbar, localize('ade.readDiagram', "Read Diagram"), () => { void this.commandService.executeCommand('ade.readContext'); });
			this.button(toolbar, localize('ade.fitDiagram', "Fit Diagram"), () => this.fitDiagram());
			this.iconButton(toolbar, localize('ade.zoomOut', "Zoom Out"), Codicon.remove, () => { this.zoom = Math.max(0.4, this.zoom - 0.2); this.render(); });
			this.iconButton(toolbar, localize('ade.zoomReset', "Reset Zoom"), Codicon.screenNormal, () => { this.zoom = 1; this.render(); });
			this.iconButton(toolbar, localize('ade.zoomIn', "Zoom In"), Codicon.add, () => { this.zoom = Math.min(2, this.zoom + 0.2); this.render(); });
		} else if (this.project.section === 'element') {
			this.button(toolbar, localize('ade.readElement', "Read Element Details"), () => { void this.commandService.executeCommand('ade.readContext'); });
		} else if (this.project.section === 'impact') {
			this.button(toolbar, localize('ade.readImpact', "Read Change Impact"), () => { void this.commandService.executeCommand('ade.readContext'); });
		} else if (this.project.section === 'map') {
			this.button(toolbar, localize('ade.readMap', "Read System Map"), () => { void this.commandService.executeCommand('ade.readContext'); });
		}
	}

	private fitDiagram(): void {
		const viewport = this.canvasViewport;
		const canvas = this.canvasContent;
		if (!viewport || !canvas) { return; }
		const style = dom.getWindow(viewport).getComputedStyle(viewport);
		const heightLimit = parseFloat(style.maxHeight);
		const availableHeight = Number.isFinite(heightLimit) ? heightLimit : viewport.clientHeight;
		// Scrollbars can disappear after fitting; use the stable border box for width.
		const availableWidth = viewport.offsetWidth - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth);
		this.zoom = Math.max(0.1, Math.min(1, (availableWidth - 2) / canvas.offsetWidth, (availableHeight - 2) / canvas.offsetHeight));
		this.render();
		if (this.canvasViewport) { this.canvasViewport.scrollLeft = 0; this.canvasViewport.scrollTop = 0; }
	}

	private installPan(parent: HTMLElement): void {
		this.interactions.add(dom.addDisposableListener(parent, 'keydown', (event: KeyboardEvent) => {
			if (event.target !== parent) { return; }
			const step = event.shiftKey ? 80 : 40;
			const offset = event.key === 'ArrowLeft' ? [-step, 0] : event.key === 'ArrowRight' ? [step, 0] : event.key === 'ArrowUp' ? [0, -step] : event.key === 'ArrowDown' ? [0, step] : undefined;
			if (offset) {
				event.preventDefault();
				event.stopPropagation();
				parent.scrollLeft += offset[0];
				parent.scrollTop += offset[1];
			}
		}));
		let drag: { x: number; y: number; left: number; top: number } | undefined;
		this.interactions.add(dom.addDisposableListener(parent, 'pointerdown', (event: PointerEvent) => {
			if (event.button === 1 || (event.button === 0 && event.altKey)) {
				drag = { x: event.clientX, y: event.clientY, left: parent.scrollLeft, top: parent.scrollTop };
				parent.setPointerCapture(event.pointerId);
				event.preventDefault();
			}
		}));
		this.interactions.add(dom.addDisposableListener(parent, 'pointermove', (event: PointerEvent) => {
			if (drag) { parent.scrollLeft = drag.left - event.clientX + drag.x; parent.scrollTop = drag.top - event.clientY + drag.y; }
		}));
		this.interactions.add(dom.addDisposableListener(parent, 'pointerup', () => { drag = undefined; }));
		this.interactions.add(dom.addDisposableListener(parent, 'pointercancel', () => { drag = undefined; }));
	}

	private installNodeEditing(button: HTMLButtonElement, view: ModelView, id: string): void {
		const node = view.nodes.find(node => node.elementId === id)!;
		let drag: { x: number; y: number; left: number; top: number } | undefined;
		this.interactions.add(dom.addDisposableListener(button, 'pointerdown', (event: PointerEvent) => {
			if (event.button !== 0 || event.altKey) { return; }
			drag = { x: event.clientX, y: event.clientY, left: parseFloat(button.style.left), top: parseFloat(button.style.top) };
			button.setPointerCapture(event.pointerId);
		}));
		this.interactions.add(dom.addDisposableListener(button, 'pointermove', (event: PointerEvent) => {
			if (!drag) { return; }
			button.style.left = `${drag.left + (event.clientX - drag.x) / this.zoom}px`;
			button.style.top = `${drag.top + (event.clientY - drag.y) / this.zoom}px`;
		}));
		this.interactions.add(dom.addDisposableListener(button, 'pointerup', (event: PointerEvent) => {
			if (!drag) { return; }
			const dx = (event.clientX - drag.x) / this.zoom;
			const dy = (event.clientY - drag.y) / this.zoom;
			drag = undefined;
			if (Math.abs(dx) + Math.abs(dy) > 3) {
				this.project.edit({ kind: 'position', viewId: view.id, id, x: Math.round(node.x + dx), y: Math.round(node.y + dy) });
				this.project.selectElement(id);
			}
		}));
		this.interactions.add(dom.addDisposableListener(button, 'pointercancel', () => {
			if (drag) { button.style.left = `${drag.left}px`; button.style.top = `${drag.top}px`; drag = undefined; }
		}));
		this.interactions.add(dom.addDisposableListener(button, 'keydown', (event: KeyboardEvent) => {
			const step = event.shiftKey ? 40 : 20;
			const offset = event.key === 'ArrowLeft' ? [-step, 0] : event.key === 'ArrowRight' ? [step, 0] : event.key === 'ArrowUp' ? [0, -step] : event.key === 'ArrowDown' ? [0, step] : undefined;
			if (offset) {
				event.preventDefault();
				event.stopPropagation();
				this.project.edit({ kind: 'position', viewId: view.id, id, x: node.x + offset[0], y: node.y + offset[1] });
			}
		}));
	}

	private explainDisabled(button: HTMLButtonElement, disabled: boolean, reason: string): void {
		button.disabled = disabled;
		if (disabled) {
			button.setAttribute('aria-description', reason);
			const explanation = dom.append(button.parentElement!, dom.$('span.ade-unavailable-reason'));
			explanation.textContent = reason;
		}
		this.interactions.add(this.hover.setupManagedHover(getDefaultHoverDelegate('mouse'), button, disabled ? reason : button.getAttribute('aria-label') ?? button.textContent ?? ''));
	}

	private iconButton(parent: HTMLElement, label: string, icon: ThemeIcon, action: () => void): HTMLButtonElement {
		const button = this.button(parent, label, action);
		button.setAttribute('aria-label', label);
		dom.clearNode(button); button.appendChild(renderIcon(icon));
		this.interactions.add(this.hover.setupManagedHover(getDefaultHoverDelegate('mouse'), button, label));
		return button;
	}

	private async chooseDiagram(): Promise<void> {
		const choice = await this.quick.pick(this.project.model.views.map(view => ({ label: view.name, description: viewLabels[view.kind], view })), { title: localize('ade.chooseDiagram', "Choose Diagram") });
		if (choice) { this.project.showDiagram(choice.view.id); }
	}

	private installContextMenu(target: HTMLElement | SVGElement, show: (x: number, y: number) => void): void {
		this.interactions.add(dom.addDisposableListener(target, 'contextmenu', (event: MouseEvent) => { event.preventDefault(); event.stopPropagation(); show(event.clientX, event.clientY); }));
		this.interactions.add(dom.addDisposableListener(target, 'keydown', (event: KeyboardEvent) => {
			if (event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10') { event.preventDefault(); event.stopPropagation(); const box = target.getBoundingClientRect(); show(box.left, box.bottom); }
		}));
	}

	private showMenu(x: number, y: number, actions: IAction[]): void {
		const restore = this.controls.captureFocus(this.root);
		this.contextMenus.showContextMenu({ getAnchor: () => ({ x, y }), getActions: () => actions, autoSelectItem: true, onHide: cancelled => { if (cancelled) { restore(); } } });
	}

	private elementMenu(id: string, x: number, y: number): void {
		this.controls.setExpanded('ai-collaboration', false);
		this.relationSelection = undefined;
		this.project.selectElement(id);
		const command = (name: string, label: string) => toAction({ id: `ade.context.${name}`, label, run: () => this.commandService.executeCommand(`ade.${name}`) });
		const actions: IAction[] = [];
		if (this.project.editable) {
			actions.push(toAction({ id: 'ade.connectCanvas', label: localize('ade.context.connectCanvas', "Create Relationship on Canvas…"), run: () => this.beginConnection(id) }),
				command('connect', localize('ade.context.connect', "Create Relationship from List…")),
				command('renameElement', localize('ade.context.rename', "Rename…")), command('description', localize('ade.context.description', "Edit Description…")),
				command('behavior', localize('ade.context.behavior', "Edit Behavioral Contract…")), new Separator());
		}
		actions.push(toAction({ id: 'ade.context.details', label: localize('ade.elementDetails', "Element Details"), run: () => this.project.inspectElement(id) }),
			toAction({ id: 'ade.context.perspectives', label: localize('ade.context.perspectives', "Show in Another Diagram…"), run: async () => {
				const choices = this.project.model.views.filter(view => view.nodes.some(node => node.elementId === id));
				const picked = await this.quick.pick(choices.map(view => ({ label: view.name, view })), { title: localize('ade.elementViews', "Diagrams Containing This Element") });
				if (picked) { this.revealElement(id, picked.view.id); }
			} }), toAction({ id: 'ade.context.impact', label: localize('ade.showImpact.button', "Show Change Impact"), run: () => this.project.showImpact(id) }));
		if (this.project.editable) { actions.push(new Separator(), command('removeElementFromDiagram', localize('ade.context.remove', "Remove from This Diagram")), command('deleteElement', localize('ade.context.delete', "Delete from the System…"))); }
		this.showMenu(x, y, actions);
	}

	private relationMenu(id: string, x: number, y: number): void {
		const relation = this.project.model.semantics.relations.find(relation => relation.id === id);
		if (!relation) { return; }
		this.controls.setExpanded('ai-collaboration', false);
		this.relationSelection = id; this.render();
		const command = (name: string, label: string) => toAction({ id: `ade.context.${name}`, label, run: () => this.commandService.executeCommand(`ade.${name}`, id) });
		const actions: IAction[] = [];
		if (this.project.editable) { actions.push(command('editRelation', localize('ade.context.editRelation', "Edit Relationship…")), command('condition', localize('ade.editCondition', "Edit Condition")), command('relationError', localize('ade.editRelationError', "Edit Relationship Error")), new Separator()); }
		actions.push(toAction({ id: 'ade.context.source', label: localize('ade.context.source', "Go to Source"), run: () => this.revealElement(relation.from) }),
			toAction({ id: 'ade.context.target', label: localize('ade.context.target', "Go to Target"), run: () => this.revealElement(relation.to) }));
		if (this.project.editable) { actions.push(new Separator(), command('removeRelationFromDiagram', localize('ade.context.removeRelation', "Remove from This Diagram")), command('deleteRelation', localize('ade.context.deleteRelation', "Delete from All Diagrams…"))); }
		this.showMenu(x, y, actions);
	}

	private async beginConnection(id: string): Promise<void> {
		const view = this.project.activeView;
		const source = this.project.model.semantics.elements.find(element => element.id === id);
		if (!view || !source) { this.notifications.info(localize('ade.context.selectSource', "Select a Source Element Before Creating a Relationship.")); return; }
		const version = this.project.documentVersion;
		const kind = await this.quick.pick((Object.keys(relationLabels) as RelationKind[]).filter(kind => (view.kind !== 'state' || kind === 'transition') && (view.kind !== 'sequence' || ['invocation', 'read', 'write'].includes(kind))
			&& view.nodes.some(node => { const target = this.project.model.semantics.elements.find(element => element.id === node.elementId)!; return isCompatibleRelation(kind, source.kind, target.kind) && (kind !== 'transition' || source.parentId === target.parentId); })).map(kind => ({ label: relationLabels[kind], kind })), { title: localize('ade.relationType', "Relationship Type") });
		if (!kind || version !== this.project.documentVersion) { return; }
		this.pendingConnection = { from: id, kind: kind.kind, viewId: view.id, version }; this.render();
	}

	private async finishConnection(id: string): Promise<void> {
		const pending = this.pendingConnection;
		if (!pending) { return; }
		const from = this.project.model.semantics.elements.find(element => element.id === pending.from)!;
		const to = this.project.model.semantics.elements.find(element => element.id === id)!;
		if (!isCompatibleRelation(pending.kind, from.kind, to.kind) || pending.kind === 'transition' && from.parentId !== to.parentId) { this.notifications.info(localize('ade.context.incompatible', "This Target Is Incompatible with the Selected Relationship Type. Choose Another Target or Press Escape.")); return; }
		this.pendingConnection = undefined;
		const name = await this.quick.input({ title: localize('ade.relationName', "Relationship Name") });
		if (name === undefined) { this.render(); return; }
		const condition = await this.quick.input({ title: localize('ade.conditionInput', "Condition (Optional)") });
		if (condition === undefined) { this.render(); return; }
		if (pending.version !== this.project.documentVersion) { this.notifications.info(localize('ade.context.staleConnection', "The Project Changed. Create the Relationship Again from the Current Diagram.")); return; }
		this.project.edit({ kind: 'relation', id: generateUuid(), viewId: pending.viewId, from: pending.from, to: id, relationKind: pending.kind, name, condition });
	}

	private renderRelationProperties(parent: HTMLElement, id: string): void {
		const relation = this.project.model.semantics.relations.find(relation => relation.id === id);
		if (!relation) { return; }
		dom.append(parent, dom.$('h2')).textContent = localize('ade.relationshipProperties', "Relationship Properties");
		this.paragraph(parent, relation.name || relationLabels[relation.kind]);
		this.paragraph(parent, relationLabels[relation.kind]);
		for (const target of [relation.from, relation.to]) {
			this.button(parent, this.project.model.semantics.elements.find(element => element.id === target)!.name, () => this.revealElement(target));
		}
		if (relation.condition) { this.paragraph(parent, localize('ade.condition', "Condition: {0}", relation.condition)); }
		if (relation.errorCode) { this.paragraph(parent, localize('ade.errorCodeLabel', "Error: {0}", relation.errorCode)); }
		if (this.project.editable) { this.button(parent, localize('ade.context.editRelation', "Edit Relationship…"), () => { void this.commandService.executeCommand('ade.editRelation', id); }); }
		this.button(parent, localize('ade.context.moreRelation', "More Relationship Actions…"), () => { const box = parent.getBoundingClientRect(); this.relationMenu(id, box.left, box.top); });
	}

	private renderAi(parent: HTMLElement): void {
		if (!this.ai.available || this.configurationService.getValue<boolean>('chat.disableAIFeatures') === true) { return; }
		const connection = dom.append(parent, dom.$('p.ade-status'));
		connection.setAttribute('role', 'status'); connection.textContent = this.ai.connectionStatus;
		this.button(parent, localize('ade.ai.refresh', "Refresh Account and Models"), () => { void this.ai.refreshConnection(); });
		this.button(parent, localize('ade.ai.connectButton', "Connect Claude Code or Codex"), () => { void this.ai.connect(); });
		this.button(parent, localize('ade.ai.cliButton', "Open AI CLI"), () => { void this.ai.openCli(); });
		const status = dom.append(parent, dom.$('p.ade-status')); status.setAttribute('role', 'status'); status.textContent = this.ai.status;
		this.paragraph(parent, localize('ade.ai.steps', "1. Review Context and Plan → 2. Generate in a Worktree → 3. Test and Apply"));
		const implement = this.button(parent, localize('ade.ai.implementButton', "Implement Feature"), () => { void this.ai.implement(); });
		implement.classList.add('ade-primary-action');
		this.explainDisabled(implement, this.ai.busy || this.code.busy || !this.code.context, !this.code.context ? localize('ade.ai.importRequired', "Import a Git Codebase with a Commit and Add a Feature Before Implementing. Use Import Codebase or Sync Project.") : localize('ade.operationWait', "Wait for the Active A.D.E Operation to Finish."));
		const more = this.controls.details(parent, localize('ade.ai.more', "Review, Recovery and Other AI Actions"), 'ai-more');
		for (const [label, action, enabled, reason] of [
			[localize('ade.ai.interpretButton', "Interpret Unresolved Evidence"), () => this.ai.interpret(), !!this.code.context, localize('ade.ai.evidenceRequired', "Import a Codebase to Inspect Its Unresolved Evidence.")],
			[localize('ade.ai.reviewButton', "Review Changes"), () => this.ai.review(), this.ai.canVerify || this.ai.canApply || this.ai.canUndo, localize('ade.ai.reviewRequired', "Implement a Feature or Resume an Existing Implementation First.")],
			[localize('ade.ai.verifyButton', "Run Tests"), () => this.ai.verify(), this.ai.canVerify, localize('ade.ai.verifyRequired', "Generate or Resume Changes Before Running Tests.")],
			[localize('ade.ai.applyButton', "Apply Verified Changes"), () => this.ai.apply(), this.ai.canApply, localize('ade.ai.passingRequired', "Run Tests Successfully Before Applying Changes.")],
			[localize('ade.ai.undoButton', "Undo Implementation"), () => this.ai.undo(), this.ai.canUndo, localize('ade.ai.appliedRequired', "Undo Is Available After Applying an Implementation.")],
			[localize('ade.ai.resumeButton', "Resume Implementation"), () => this.ai.resume(), true, ''],
			[localize('ade.ai.recoverButton', "Recover Interrupted Implementation"), () => this.ai.recover(), true, ''],
			[localize('ade.ai.benchmarkButton', "Compare AI Models"), () => this.ai.benchmark(), true, ''],
			[localize('ade.ai.exportButton', "Export Model Benchmark Results"), () => this.ai.exportBenchmark(), true, '']
		] as const) {
			const button = this.button(more, label, () => { void action().catch(error => this.notifications.error(String(error.message ?? error))); });
			this.explainDisabled(button, this.ai.busy || this.code.busy || !enabled, this.ai.busy || this.code.busy ? localize('ade.operationWait', "Wait for the Active A.D.E Operation to Finish.") : reason);
		}
	}

	private renderTools(toolbar: HTMLElement): void {
		toolbar.setAttribute('aria-label', localize('ade.tools', "Technical Tools"));
		if (this.code.context) {
			this.button(toolbar, localize('ade.code.inspectButton', "Code Evidence"), () => { void this.code.inspect(this.project.selectedId || undefined); }).disabled = this.code.busy;
			this.paragraph(toolbar, this.code.changed ? localize('ade.code.changed', "Source Changes Detected · Run Sync to Review") : localize('ade.code.snapshot', "Code Snapshot · {0} Files", this.code.context.files.length));
		}
		const moreTools = this.controls.details(toolbar, localize('ade.moreTools', "More Tools"), 'technical-tools');
		for (const [label, command] of [
			[localize('ade.files', "Files"), 'ade.openFiles'],
			[localize('ade.terminal', "Terminal"), 'ade.openTerminal'],
			[localize('ade.debug', "Debug"), 'workbench.view.debug'],
			[localize('ade.git', "Git"), 'workbench.view.scm'],
			[localize('ade.return', "Return to Model"), 'ade.showDiagram']
		]) {
			const target = command === 'workbench.view.debug' || command === 'workbench.view.scm' ? moreTools : toolbar;
			this.button(target, label, () => { void this.commandService.executeCommand(command); });
		}
		if (this.project.section !== 'diagram' && this.ai.available && this.configurationService.getValue<boolean>('chat.disableAIFeatures') !== true) {
			this.renderAi(this.controls.details(toolbar, localize('ade.ai.heading', "AI Collaboration"), 'ai-collaboration'));
		}
	}
}
