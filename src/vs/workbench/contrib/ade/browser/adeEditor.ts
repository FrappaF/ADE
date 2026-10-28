/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/ade.css';
import * as dom from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { AdeInput } from './adeInput.js';

// Demonstration only: semantic editing and provider integration belong to M1–M5.
const demo = [
	{ id: 'customer', label: localize('ade.customer', "Customer"), role: localize('ade.actor', "Actor"), detail: localize('ade.customer.detail', "Starts checkout and receives the order confirmation.") },
	{ id: 'checkout', label: localize('ade.checkout', "Checkout"), role: localize('ade.view', "View"), detail: localize('ade.checkout.detail', "Collects the purchase details and requests confirmation.") },
	{ id: 'controller', label: localize('ade.controller', "Order Controller"), role: localize('ade.controller.role', "Controller"), detail: localize('ade.controller.detail', "Coordinates payment and order creation.") },
	{ id: 'payment', label: localize('ade.payment', "Payment"), role: localize('ade.resource', "Resource"), detail: localize('ade.payment.detail', "Processes the payment request.") },
	{ id: 'order', label: localize('ade.order', "Order"), role: localize('ade.resource', "Resource"), detail: localize('ade.order.detail', "Records the confirmed purchase.") }
];
type Page = 'home' | 'model' | 'properties' | 'ai';
const stateKey = 'ade.shell.navigation';

export class AdeEditor extends EditorPane {
	static readonly ID = AdeInput.ID;
	private container!: HTMLElement;
	private readonly controls = this._register(new DisposableStore());
	private page: Page = 'home';
	private selected = 'checkout';

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService private readonly adeStorageService: IStorageService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService
	) {
		super(AdeEditor.ID, group, telemetryService, themeService, adeStorageService);
		try {
			const state = JSON.parse(adeStorageService.get(stateKey, StorageScope.WORKSPACE, '{}'));
			if (['home', 'model', 'properties', 'ai'].includes(state.page)) { this.page = state.page; }
			if (demo.some(node => node.id === state.selected)) { this.selected = state.selected; }
		} catch { /* A damaged navigation preference must not prevent startup. */ }
	}

	protected override createEditor(parent: HTMLElement): void {
		this.container = dom.append(parent, dom.$('.ade-shell'));
		this.container.tabIndex = -1;
		this.render();
	}

	private navigate(page: Page, selected = this.selected): void {
		this.page = page;
		this.selected = selected;
		this.adeStorageService.store(stateKey, JSON.stringify({ page, selected }), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		this.render();
		this.focus();
	}

	private button(parent: HTMLElement, label: string, action: () => void, secondary = true): Button {
		const button = this.controls.add(new Button(parent, { ...defaultButtonStyles, secondary }));
		button.label = label;
		this.controls.add(button.onDidClick(action));
		return button;
	}

	private render(): void {
		this.controls.clear();
		dom.clearNode(this.container);
		const header = dom.append(this.container, dom.$('header'));
		dom.append(header, dom.$('h1', undefined, 'A.D.E'));
		dom.append(header, dom.$('p', undefined, localize('ade.tagline', "Design the system. Explore its behavior.")));
		const navigation = dom.append(this.container, dom.$('nav'));
		navigation.setAttribute('aria-label', localize('ade.navigation', "A.D.E Navigation"));
		for (const [page, label] of [
			['home', localize('ade.home.tab', "Project")],
			['model', localize('ade.model.tab', "Model")],
			['properties', localize('ade.properties.tab', "Properties")],
			['ai', localize('ade.ai.tab', "AI Collaboration")]
		] as const) {
			const button = this.button(navigation, label, () => this.navigate(page), this.page !== page);
			button.element.setAttribute('aria-current', this.page === page ? 'page' : 'false');
		}
		const content = dom.append(this.container, dom.$('main'));
		if (this.page === 'home') {
			dom.append(content, dom.$('h2', undefined, localize('ade.start', "Your Project")));
			dom.append(content, dom.$('p', undefined, localize('ade.intro', "Explore the checkout demonstration or open a project folder.")));
			const actions = dom.append(content, dom.$('.ade-actions'));
			this.button(actions, localize('ade.demo', "Open Checkout Demo"), () => this.navigate('model'), false);
			this.button(actions, localize('ade.open', "Open Project"), () => { void this.fileDialogService.pickFolderAndOpen({ forceNewWindow: false }); });
			this.button(actions, localize('ade.create', "Create Project — Coming in M2"), () => {}).enabled = false;
			this.button(actions, localize('ade.import', "Import Codebase — Coming in M4"), () => {}).enabled = false;
			dom.append(content, dom.$('p', undefined, localize('ade.scope', "This is a read-only demonstration. Visual editing, code analysis and AI generation are planned in the roadmap.")));
		} else if (this.page === 'ai') {
			dom.append(content, dom.$('h2', undefined, localize('ade.ai.heading', "AI Collaboration")));
			dom.append(content, dom.$('p', undefined, localize('ade.ai.unavailable', "Not available yet. Provider configuration, plans and verified changes will be introduced in M5.")));
		} else {
			const layout = dom.append(content, dom.$('.ade-model-layout'));
			const explorer = dom.append(layout, dom.$('aside'));
			explorer.setAttribute('aria-label', localize('ade.explorer', "System Explorer"));
			dom.append(explorer, dom.$('h2', undefined, localize('ade.checkout.title', "Checkout Demo")));
			for (const node of demo) {
				this.button(explorer, node.label, () => this.navigate(this.page, node.id), this.selected !== node.id);
			}
			const detail = dom.append(layout, dom.$('section'));
			if (this.page === 'model') {
				dom.append(detail, dom.$('h2', undefined, localize('ade.flow', "Purchase Flow")));
				dom.append(detail, dom.$('p', undefined, localize('ade.flow.description', "Customer → Checkout → Order Controller → Payment → Order. Select an element to inspect its responsibility.")));
				const flow = dom.append(detail, dom.$('.ade-flow'));
				for (const node of demo) {
					this.button(flow, node.label, () => this.navigate('properties', node.id));
				}
			} else {
				const node = demo.find(node => node.id === this.selected)!;
				dom.append(detail, dom.$('h2', undefined, node.label));
				dom.append(detail, dom.$('p', undefined, node.role));
				dom.append(detail, dom.$('p', undefined, node.detail));
				this.button(detail, localize('ade.back', "Back to Model"), () => this.navigate('model'));
			}
			dom.append(detail, dom.$('p', undefined, localize('ade.unverified', "Design demonstration · implementation and runtime behavior have not been verified.")));
		}
	}

	override focus(): void { this.container?.focus(); }
	override layout(dimension: dom.Dimension): void {
		this.container.style.height = `${dimension.height}px`;
		this.container.style.width = `${dimension.width}px`;
	}
}
