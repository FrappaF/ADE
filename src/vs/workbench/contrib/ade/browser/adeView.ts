/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/ade.css';
import * as dom from '../../../../base/browser/dom.js';
import { localize } from '../../../../nls.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IViewPaneOptions, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { getDiagramGroups, getFeatureViews } from '../common/visualNavigation.js';
import { isSourceEvidenceModel, ModelView } from '../common/semanticModel.js';
import { AdeControls } from './adeControls.js';
import { AdeProjectService, IAdeProjectService } from './adeProjectService.js';
import { adeFocusedSurface, getAdeAccessibilityHint } from './adeAccessibilityContext.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';

export const ADE_VIEW_CONTAINER_ID = 'workbench.view.ade';
export const ADE_VIEW_ID = 'ade.systemFeatures';

/** Native sidebar, deliberately separate from the physical file explorer. */
export class AdeView extends ViewPane {
	private navigationBody: HTMLElement | undefined;
	private readonly controls = this._register(new AdeControls());
	private readonly groupListeners = this._register(new DisposableStore());
	private readonly collapsed = new Map<string, Set<string>>();
	private readonly groups = new Map<string, HTMLDetailsElement>();
	private groupContext = '';
	private renderedState = '';

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IStorageService storageService: IStorageService,
		@IAdeProjectService private readonly project: AdeProjectService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
		const saved = storageService.getObject<Record<string, string[]>>('ade.sidebar.collapsedGroups', StorageScope.WORKSPACE, {});
		if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
			for (const [context, ids] of Object.entries(saved)) {
				if (Array.isArray(ids)) { this.collapsed.set(context, new Set(ids.filter(id => typeof id === 'string'))); }
			}
		}
		this._register(storageService.onWillSaveState(() => {
			this.captureGroups();
			storageService.store('ade.sidebar.collapsedGroups', JSON.stringify(Object.fromEntries([...this.collapsed].map(([context, ids]) => [context, [...ids]]))), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}));
		this._register(project.onDidChange(() => this.renderNavigation()));
		this._register(configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(AccessibilityVerbositySettingId.Ade)) { this.renderNavigation(true); }
		}));
		this._register(keybindingService.onDidUpdateKeybindings(() => this.renderNavigation(true)));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		this.navigationBody = dom.append(container, dom.$('nav.ade-sidebar'));
		this.navigationBody.tabIndex = -1;
		adeFocusedSurface.bindTo(this._register(this.scopedContextKeyService.createScoped(this.navigationBody))).set('navigation');
		this.navigationBody.setAttribute('aria-label', localize('ade.systemFeatures', "System and Features"));
		void this.project.restore();
		this.renderNavigation(true);
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		if (this.navigationBody) { dom.size(this.navigationBody, width, height); }
	}

	override focus(): void {
		super.focus();
		this.controls.focusFirst();
	}

	captureAccessibilityFocus(): () => void {
		return this.navigationBody ? this.controls.captureFocus(this.navigationBody) : () => this.focus();
	}

	private captureGroups(): void {
		const collapsed = this.collapsed.get(this.groupContext);
		if (collapsed) {
			for (const [id, details] of this.groups) {
				if (details.open) { collapsed.delete(id); } else { collapsed.add(id); }
			}
		}
	}

	private group(parent: HTMLElement, id: string, title: string): HTMLElement {
		const collapsed = this.collapsed.get(this.groupContext)!;
		const details = dom.append(parent, dom.$<HTMLDetailsElement>('details.ade-navigation-group'));
		details.open = !collapsed.has(id);
		const summary = dom.append(details, dom.$('summary'));
		summary.textContent = title;
		this.controls.trackFocus(id, summary);
		this.groups.set(id, details);
		this.groupListeners.add(dom.addDisposableListener(details, 'toggle', () => {
			if (details.open) { collapsed.delete(id); } else { collapsed.add(id); }
		}));
		return dom.append(details, dom.$('.ade-navigation-group-content'));
	}

	private diagramButton(parent: HTMLElement, view: ModelView, id = `view:${view.id}`): void {
		const button = this.controls.button(parent, view.name, () => {
			this.project.showDiagram(view.id);
			void this.commandService.executeCommand('ade.showDiagram');
		}, id);
		button.setAttribute('aria-current', String(this.project.section === 'diagram' && view.id === this.project.activeView?.id));
	}

	private renderNavigation(force = false): void {
		const body = this.navigationBody;
		if (!body) { return; }
		// Selection changes update the editor, not the sidebar's semantic groups.
		const state = JSON.stringify([this.project.documentVersion, this.project.section, this.project.activeView?.id, this.project.loading, this.project.error, this.project.editable]);
		if (!force && this.renderedState === state) { return; }
		this.renderedState = state;
		this.captureGroups();
		this.groups.clear();
		this.groupListeners.clear();
		const model = this.project.model;
		this.groupContext = JSON.stringify([this.project.modelUri?.toString() ?? 'demo', model.id]);
		if (!this.collapsed.has(this.groupContext)) { this.collapsed.set(this.groupContext, new Set()); }
		body.setAttribute('aria-description', getAdeAccessibilityHint(this.configurationService, this.keybindingService));
		this.controls.render(body, () => {
			dom.clearNode(body);
			this.controls.button(body, localize('ade.home', "Home"), () => { void this.commandService.executeCommand('ade.showHome'); });
			const more = this.controls.details(body, localize('ade.navigationOptions', "Navigation Options"), 'navigation-options');
			this.controls.button(more, localize('ade.systemMap', "System Map"), () => { void this.commandService.executeCommand('ade.showSystemMap'); }).disabled = this.project.loading || !!this.project.error;
			this.controls.button(more, localize('ade.search.button', "Search System"), () => { void this.commandService.executeCommand('ade.search'); }).disabled = this.project.loading || !!this.project.error;
			if (this.project.editable && !isSourceEvidenceModel(model)) {
				this.controls.button(more, localize('ade.addFeature', "Add Feature"), () => { void this.commandService.executeCommand('ade.addFeature'); });
			}
			if (this.project.loading || this.project.error) {
				const status = dom.append(body, dom.$('p.ade-status'));
				status.setAttribute('role', this.project.error ? 'alert' : 'status');
				status.textContent = this.project.error ?? localize('ade.loading', "Loading model…");
				this.controls.button(more, localize('ade.openModel', "Open Model"), () => { void this.commandService.executeCommand('ade.openModel'); });
				return;
			}
			if (isSourceEvidenceModel(model)) {
				dom.append(body, dom.$('p')).textContent = localize('ade.import.pendingSidebar', "Source Evidence Ready. Create diagrams with AI to see your system's capabilities and flows here.");
				this.controls.button(body, localize('ade.buildDiagrams', "Build Diagrams with AI"), () => { void this.commandService.executeCommand('ade.ai.buildDiagrams'); });
				return;
			}
			for (const group of getDiagramGroups(model)) {
				if (!group.featureId && !group.views.length && model.views.length) { continue; }
				const section = dom.append(body, dom.$('section.ade-diagram-group'));
				section.setAttribute('aria-label', group.name);
				const context = this.group(section, group.featureId ? `feature:${group.featureId}` : 'system', group.name);
				if (this.project.editable && group.featureId) {
					const actions = this.controls.details(context, localize('ade.featureOptions', "Feature Options"), `feature-options:${group.featureId}`);
					for (const [label, command] of [
						[localize('ade.addDiagram', "Add Diagram"), 'ade.addDiagram'],
						[localize('ade.renameFeature', "Rename Feature"), 'ade.renameFeature'],
						[localize('ade.deleteFeature', "Delete Feature"), 'ade.deleteFeature']
					]) {
						this.controls.button(actions, label, () => { void this.commandService.executeCommand(command, group.featureId); }, `${command}:${group.featureId}`);
					}
				}
				const feature = model.semantics.elements.find(element => element.id === group.featureId);
				const related = feature ? getFeatureViews(model, feature).filter(view => !group.views.some(owned => owned.id === view.id)) : [];
				if (!group.views.length && !related.length) {
					dom.append(context, dom.$('p')).textContent = localize('ade.noGroupDiagrams', "No diagrams in this context.");
				}
				for (const view of group.views) {
					this.diagramButton(context, view);
				}
				if (related.length) {
					dom.append(context, dom.$('p')).textContent = localize('ade.relatedDiagrams', "Related Diagrams");
					for (const view of related) { this.diagramButton(context, view, `related:${JSON.stringify([group.featureId, view.id])}`); }
				}
			}
			this.controls.button(more, localize('ade.openModel', "Open Model"), () => { void this.commandService.executeCommand('ade.openModel'); });
		});
	}
}
