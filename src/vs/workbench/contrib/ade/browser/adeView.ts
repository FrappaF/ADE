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
import { viewLabels } from './adeLabels.js';
import { getDiagramGroups, getFeatureViews } from '../common/visualNavigation.js';
import { isSourceEvidenceModel } from '../common/modelFoundation.js';
import { ModelView } from '../common/modelTypes.js';
import { AdeControls } from './adeControls.js';
import { AdeProjectService, IAdeProjectService } from './adeProjectService.js';
import { adeFocusedSurface, getAdeAccessibilityHint } from './adeAccessibilityContext.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { IAdeAiService } from './adeAiService.js';
import { IAdeCodeService } from './adeCodeService.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { type ThemeIcon } from '../../../../base/common/themables.js';
import { diagramIcon, prependAdeIcon } from './adeIcons.js';

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
		@IAdeAiService private readonly ai: IAdeAiService,
		@IAdeCodeService private readonly code: IAdeCodeService,
		@INotificationService private readonly notifications: INotificationService,
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
		this._register(ai.onDidChange(() => this.renderNavigation()));
		this._register(code.onDidChange(() => this.renderNavigation()));
		this._register(configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(AccessibilityVerbositySettingId.Ade) || event.affectsConfiguration('chat.disableAIFeatures')) { this.renderNavigation(true); }
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

	private group(parent: HTMLElement, id: string, title: string, icon: ThemeIcon = Codicon.folder, count?: number): HTMLElement {
		const collapsed = this.collapsed.get(this.groupContext)!;
		const details = dom.append(parent, dom.$<HTMLDetailsElement>('details.ade-navigation-group'));
		details.open = !collapsed.has(id);
		const summary = dom.append(details, dom.$('summary'));
		details.dataset.level = id === 'system' ? 'system' : id.startsWith('feature:') ? 'feature' : 'category';
		const chevron = renderIcon(Codicon.chevronRight); chevron.classList.add('ade-nav-chevron'); chevron.setAttribute('aria-hidden', 'true'); summary.append(chevron);
		const glyph = renderIcon(icon); glyph.setAttribute('aria-hidden', 'true'); summary.append(glyph);
		dom.append(summary, dom.$('span.ade-nav-label')).textContent = title;
		if (count !== undefined) { const badge = dom.append(summary, dom.$('span.ade-nav-count')); badge.textContent = String(count); badge.setAttribute('aria-hidden', 'true'); summary.setAttribute('aria-label', localize('ade.navigation.diagramCount', "{0}, {1} diagrams", title, count)); }
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
		button.classList.add('ade-diagram-entry');
		prependAdeIcon(button, diagramIcon(view.kind));
	}


	private renderNavigation(force = false): void {
		const body = this.navigationBody;
		if (!body) { return; }
		// Selection changes update the editor, not the sidebar's semantic groups.
		const state = JSON.stringify([this.project.modelUri?.toString(), this.project.model.id, this.project.documentVersion, this.project.section, this.project.activeView?.id, this.project.loading, this.project.error, this.project.editable, this.project.hasStructuralErrors, this.ai.busy, this.ai.available, this.code.busy, this.code.available, this.code.context?.sourceRoot]);
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
			const toolbar = dom.append(body, dom.$('div.ade-outline-tools.ade-sidebar-navigation'));
			prependAdeIcon(this.controls.button(toolbar, localize('ade.home', "Home"), () => { void this.commandService.executeCommand('ade.showHome').catch(error => this.notifications.error(error)); }), Codicon.home);
			const map = this.controls.button(toolbar, localize('ade.systemMap', "System Map"), () => { void this.commandService.executeCommand('ade.showSystemMap').catch(error => this.notifications.error(error)); });
			map.disabled = this.project.loading || !!this.project.error; map.setAttribute('aria-current', String(this.project.section === 'map')); prependAdeIcon(map, Codicon.typeHierarchy);
			const search = this.controls.button(toolbar, localize('ade.search.button', "Search System"), () => { void this.commandService.executeCommand('ade.search').catch(error => this.notifications.error(error)); });
			search.disabled = this.project.loading || !!this.project.error; prependAdeIcon(search, Codicon.search);
			if (this.project.editable && !isSourceEvidenceModel(model)) {
				const create = this.controls.details(toolbar, localize('ade.outline.new', "New"), 'outline-new');
				for (const [label, command] of [[localize('ade.addFeature', "Add Feature"), 'ade.addFeature'], [localize('ade.addDiagram', "Add Diagram"), 'ade.addDiagram']]) {
					this.controls.button(create, label, () => { this.controls.setExpanded('outline-new', false); void this.commandService.executeCommand(command); }).disabled = this.ai.busy || this.code.busy || this.project.hasStructuralErrors;
				}
			}
			if (this.project.loading || this.project.error) {
				const status = dom.append(body, dom.$('p.ade-status'));
				status.setAttribute('role', this.project.error ? 'alert' : 'status');
				status.textContent = this.project.error ?? localize('ade.loading', "Loading model…");
				this.controls.button(body, localize('ade.openModel', "Open Model"), () => { void this.commandService.executeCommand('ade.openModel'); });
				return;
			}
			const project = this.group(body, 'system', model.name, Codicon.server);
			if (this.project.hasStructuralErrors) {
				dom.append(body, dom.$('p')).textContent = localize('ade.draft.navigation', "Correct the Draft Specification to Restore Diagram Navigation. Saving and Undo Remain Available.");
				this.controls.button(body, localize('ade.openModelSource', "Edit Model Specification"), () => { void this.commandService.executeCommand('ade.openModelSource'); });
				return;
			}
			if (isSourceEvidenceModel(model)) {
				dom.append(project, dom.$('p')).textContent = localize('ade.import.pendingSidebar', "Source inventory ready. Generate the project diagrams, then review and apply all changes together.");
				return;
			}
			for (const group of getDiagramGroups(model)) {
				if (!group.featureId && !group.views.length && model.views.length) { continue; }
				const section = dom.append(project, dom.$('section.ade-diagram-group'));
				section.setAttribute('aria-label', group.name);
				const feature = model.semantics.elements.find(element => element.id === group.featureId);
				const related = feature ? getFeatureViews(model, feature).filter(view => !group.views.some(owned => owned.id === view.id)) : [];
				const context = group.featureId ? this.group(section, `feature:${group.featureId}`, group.name, Codicon.symbolEvent, group.views.length + related.length) : section;
				if (this.project.editable && group.featureId) {
					const actions = this.controls.details(context, localize('ade.featureOptions', "Feature Options"), `feature-options:${group.featureId}`);
					actions.parentElement?.classList.add('ade-feature-options');
					for (const [label, command] of [
						[localize('ade.addDiagram', "Add Diagram"), 'ade.addDiagram'],
						[localize('ade.renameFeature', "Rename Feature"), 'ade.renameFeature'],
						[localize('ade.deleteFeature', "Delete Feature"), 'ade.deleteFeature']
					]) {
						this.controls.button(actions, label, () => { void this.commandService.executeCommand(command, group.featureId); }, `${command}:${group.featureId}`);
					}
				}
				if (!group.views.length && !related.length) {
					dom.append(context, dom.$('p')).textContent = localize('ade.noGroupDiagrams', "No diagrams in this context.");
				}
				for (const [kind, views] of Map.groupBy(group.views, view => view.kind)) {
					const category = this.group(context, `${group.featureId ?? 'system'}:${kind}`, viewLabels[kind], diagramIcon(kind), views.length);
					category.parentElement!.dataset.kind = kind;
					for (const view of views) {
						this.diagramButton(category, view);
					}
				}
				if (related.length) {
					dom.append(context, dom.$('p')).textContent = localize('ade.relatedDiagrams', "Related Diagrams");
					for (const view of related) { this.diagramButton(context, view, `related:${JSON.stringify([group.featureId, view.id])}`); }
				}
			}
		});
	}
}
