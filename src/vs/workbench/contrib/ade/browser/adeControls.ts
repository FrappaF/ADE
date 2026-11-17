/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isThenable } from '../../../../base/common/async.js';
import * as dom from '../../../../base/browser/dom.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';

/** Native actions with stable focus identities across presentation updates. */
export class AdeControls extends Disposable {
	constructor(private readonly onError?: (error: unknown) => void) { super(); }

	private static readonly owners = new WeakMap<Element, AdeControls>();

	/** Resolve the original control after the assistant refreshes its underlying page. */
	static captureActiveFocus(): () => void {
		const active = dom.getActiveElement();
		const owner = active ? AdeControls.owners.get(active) : undefined;
		const root = active?.closest<HTMLElement>('.ade-shell, .ade-sidebar');
		if (owner && root) { return owner.captureFocus(root); }
		return () => { if (dom.isHTMLElement(active) && active.isConnected) { active.focus(); } };
	}

	private readonly listeners = this._register(new DisposableStore());
	private readonly targets = new Map<string, HTMLElement | SVGElement>();
	private readonly disclosures = new Map<string, HTMLDetailsElement>();
	private readonly expanded = new Map<string, boolean>();
	private deferredFocus: string | undefined;

	trackFocus(id: string, element: HTMLElement | SVGElement): void {
		this.targets.set(id, element);
		AdeControls.owners.set(element, this);
	}

	focusTarget(id: string): boolean {
		const target = this.targets.get(id);
		if (!target?.isConnected) { return false; }
		target.focus();
		return true;
	}

	setExpanded(id: string, open: boolean): void {
		this.expanded.set(id, open);
		const details = this.disclosures.get(id);
		if (details) { details.open = open; }
	}

	/** Resolve the control again on close: project updates may have replaced its DOM node. */
	captureFocus(root: HTMLElement): () => void {
		const active = dom.getActiveElement();
		const id = [...this.targets].find(([, element]) => element === active)?.[0];
		return () => {
			if (root.isConnected) { (id ? this.targets.get(id) ?? root : root).focus({ preventScroll: true }); }
		};
	}

	button<T>(parent: HTMLElement, label: string, action: () => T, id = label): HTMLButtonElement {
		const button = dom.append(parent, dom.$<HTMLButtonElement>('button'));
		button.type = 'button';
		button.textContent = label;
		this.trackFocus(id, button);
		this.listeners.add(dom.addDisposableListener(button, 'click', () => {
			const report = (error: unknown) => { if (this.onError) { this.onError(error); } else { throw error; } };
			try {
				const result = action();
				if (isThenable(result)) { void Promise.resolve(result).catch(report); }
			} catch (error) { report(error); }
		}));
		return button;
	}

	/** Keep secondary actions available to keyboard users without crowding the diagram. */
	details(parent: HTMLElement, label: string, id: string, options: { popup?: boolean; openByDefault?: boolean } = {}): HTMLElement {
		const details = dom.append(parent, dom.$<HTMLDetailsElement>('details.ade-options'));
		details.open = this.expanded.get(id) ?? options.openByDefault ?? false;
		const summary = dom.append(details, dom.$('summary'));
		summary.textContent = label;
		this.trackFocus(id, summary);
		this.disclosures.set(id, details);
		if (options.popup) {
			this.listeners.add(dom.addDisposableListener(parent.ownerDocument, 'pointerdown', (event: PointerEvent) => {
				if (details.open && (dom.isHTMLElement(event.target) || dom.isSVGElement(event.target)) && !details.contains(event.target)) { this.setExpanded(id, false); }
			}));
		}
		this.listeners.add(dom.addDisposableListener(details, 'keydown', (event: KeyboardEvent) => {
			if (event.key === 'Escape' && details.open) { event.preventDefault(); event.stopPropagation(); this.setExpanded(id, false); summary.focus(); }
		}));
		return dom.append(details, dom.$('.ade-options-content'));
	}

	/** Preserve keyboard location without moving focus from another workbench surface. */
	render(root: HTMLElement, render: () => void): void {
		const active = dom.getActiveElement();
		const focused = [...this.targets].find(([, button]) => button === active)?.[0] ?? (active === root ? this.deferredFocus : undefined);
		this.deferredFocus = undefined;
		for (const [id, details] of this.disclosures) {
			this.expanded.set(id, details.open);
		}
		this.disclosures.clear();
		this.listeners.clear();
		this.targets.clear();
		render();
		if (focused) {
			const target = this.targets.get(focused);
			const disabled = dom.isHTMLButtonElement(target) && target.disabled;
			const successor = disabled ? [...target.parentElement?.children ?? []].find((element): element is HTMLButtonElement => dom.isHTMLButtonElement(element) && !element.disabled) : undefined;
			if (disabled && !successor) { this.deferredFocus = focused; }
			(successor ?? (disabled ? root : target ?? root)).focus({ preventScroll: true });
		}
	}

	focusFirst(): void {
		this.targets.values().next().value?.focus();
	}
}
