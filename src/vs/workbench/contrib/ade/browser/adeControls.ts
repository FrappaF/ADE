/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';

/** Native actions with stable focus identities across presentation updates. */
export class AdeControls extends Disposable {
	private readonly listeners = this._register(new DisposableStore());
	private readonly targets = new Map<string, HTMLElement>();
	private readonly disclosures = new Map<string, HTMLDetailsElement>();
	private readonly expanded = new Set<string>();

	trackFocus(id: string, element: HTMLElement): void {
		this.targets.set(id, element);
	}

	focusTarget(id: string): boolean {
		const target = this.targets.get(id);
		if (!target?.isConnected) { return false; }
		target.focus();
		return true;
	}

	/** Resolve the control again on close: project updates may have replaced its DOM node. */
	captureFocus(root: HTMLElement): () => void {
		const active = dom.getActiveElement();
		const id = [...this.targets].find(([, element]) => element === active)?.[0];
		return () => {
			if (root.isConnected) { (id ? this.targets.get(id) ?? root : root).focus({ preventScroll: true }); }
		};
	}

	button(parent: HTMLElement, label: string, action: () => void, id = label): HTMLButtonElement {
		const button = dom.append(parent, dom.$<HTMLButtonElement>('button'));
		button.type = 'button';
		button.textContent = label;
		this.targets.set(id, button);
		this.listeners.add(dom.addDisposableListener(button, 'click', action));
		return button;
	}

	/** Keep secondary actions available to keyboard users without crowding the diagram. */
	details(parent: HTMLElement, label: string, id: string): HTMLElement {
		const details = dom.append(parent, dom.$<HTMLDetailsElement>('details.ade-options'));
		details.open = this.expanded.has(id);
		const summary = dom.append(details, dom.$('summary'));
		summary.textContent = label;
		this.targets.set(id, summary);
		this.disclosures.set(id, details);
		return dom.append(details, dom.$('.ade-options-content'));
	}

	/** Preserve keyboard location without moving focus from another workbench surface. */
	render(root: HTMLElement, render: () => void): void {
		const active = dom.getActiveElement();
		const focused = [...this.targets].find(([, button]) => button === active)?.[0];
		for (const [id, details] of this.disclosures) {
			if (details.open) { this.expanded.add(id); } else { this.expanded.delete(id); }
		}
		this.disclosures.clear();
		this.listeners.clear();
		this.targets.clear();
		render();
		if (focused) { (this.targets.get(focused) ?? root).focus({ preventScroll: true }); }
	}

	focusFirst(): void {
		this.targets.values().next().value?.focus();
	}
}
