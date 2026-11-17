/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { type ThemeIcon } from '../../../../base/common/themables.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { AdeControls } from './adeControls.js';
import { prependAdeIcon } from './adeIcons.js';

interface ActionPresentation {
	id?: string;
	icon?: ThemeIcon;
	description?: string;
	detail?: string;
	kind?: 'action' | 'navigation' | 'destructive';
	emphasis?: 'primary';
	current?: boolean;
}

/** Shared visual roles for command lists, settings palettes and contextual information sheets. */
export class AdeActionMenu {
	constructor(private readonly controls: AdeControls) { }

	header(parent: HTMLElement, title: string, subtitle?: string, icon?: ThemeIcon): HTMLElement {
		parent.classList.add('ade-action-menu');
		const header = dom.append(parent, dom.$('header.ade-menu-header'));
		if (icon) { prependAdeIcon(header, icon); }
		const text = dom.append(header, dom.$('div.ade-menu-header-text'));
		dom.append(text, dom.$('h2')).textContent = title;
		if (subtitle) { dom.append(text, dom.$('p')).textContent = subtitle; }
		return header;
	}

	section(parent: HTMLElement, title: string, options: { description?: string; tone?: 'danger'; compact?: boolean } = {}): HTMLElement {
		parent.classList.add('ade-action-menu');
		const section = dom.append(parent, dom.$('section.ade-menu-section'));
		section.classList.toggle('ade-menu-danger', options.tone === 'danger');
		section.classList.toggle('ade-menu-section-compact', !!options.compact);
		const heading = dom.append(section, dom.$('h3.ade-menu-section-title', { id: generateUuid() }));
		heading.textContent = title;
		section.setAttribute('aria-labelledby', heading.id);
		if (options.description) { dom.append(section, dom.$('p.ade-menu-section-description')).textContent = options.description; }
		return dom.append(section, dom.$('div.ade-menu-section-body'));
	}

	action<T>(parent: HTMLElement, label: string, run: () => T, options: ActionPresentation = {}): HTMLButtonElement {
		return this.decorate(this.controls.button(parent, label, run, options.id), options);
	}

	/** Descriptions remain accessible without becoming part of the command's name. */
	decorate(button: HTMLButtonElement, options: ActionPresentation = {}): HTMLButtonElement {
		const label = button.getAttribute('aria-label') ?? button.textContent ?? '';
		dom.clearNode(button);
		button.classList.add('ade-menu-action');
		button.classList.toggle('ade-menu-action-navigation', options.kind === 'navigation');
		button.classList.toggle('ade-menu-action-destructive', options.kind === 'destructive');
		button.classList.toggle('ade-menu-action-primary', options.emphasis === 'primary');
		button.setAttribute('aria-label', label);
		if (options.icon) { prependAdeIcon(button, options.icon); }
		else { dom.append(button, dom.$('span.ade-menu-icon-space', { 'aria-hidden': 'true' })); }
		const text = dom.append(button, dom.$('span.ade-menu-action-text'));
		dom.append(text, dom.$('span.ade-menu-action-label')).textContent = label;
		const descriptions: string[] = [];
		if (options.description) {
			const description = dom.append(text, dom.$('span.ade-menu-action-description', { id: generateUuid() }));
			description.textContent = options.description; descriptions.push(description.id);
		}
		const trailing = options.current || options.detail || options.kind === 'navigation' ? dom.append(button, dom.$('span.ade-menu-action-trailing')) : undefined;
		if (options.current || options.detail) {
			const detail = dom.append(trailing!, dom.$('span.ade-menu-action-detail', { id: generateUuid() }));
			detail.textContent = options.current ? localize('ade.menu.current', "Current") : options.detail!;
			descriptions.push(detail.id);
		}
		if (descriptions.length) { button.setAttribute('aria-describedby', descriptions.join(' ')); }
		if (options.current) { button.setAttribute('aria-current', 'true'); button.disabled = true; }
		else if (options.kind === 'navigation') {
			const arrow = dom.append(trailing!, dom.$('span.ade-menu-action-arrow', { 'aria-hidden': 'true' }));
			prependAdeIcon(arrow, Codicon.chevronRight);
		}
		return button;
	}

	info(parent: HTMLElement, label: string, value: string, icon?: ThemeIcon): HTMLElement {
		const row = dom.append(parent, dom.$('dl.ade-menu-fact'));
		const term = dom.append(row, dom.$('dt'));
		if (icon) { prependAdeIcon(term, icon); }
		dom.append(term, dom.$('span')).textContent = label;
		dom.append(row, dom.$('dd')).textContent = value;
		return row;
	}

	disclosure(parent: HTMLElement, label: string, id: string, options: { icon?: ThemeIcon; description?: string; openByDefault?: boolean } = {}): HTMLElement {
		parent.classList.add('ade-action-menu');
		const body = this.controls.details(parent, label, id, { openByDefault: options.openByDefault });
		body.classList.add('ade-menu-disclosure-body');
		const details = body.parentElement!; details.classList.add('ade-menu-disclosure');
		const summary = details.firstElementChild as HTMLElement;
		summary.setAttribute('aria-label', label);
		dom.clearNode(summary);
		if (options.icon) { prependAdeIcon(summary, options.icon); }
		dom.append(summary, dom.$('span.ade-menu-disclosure-label')).textContent = label;
		const arrow = dom.append(summary, dom.$('span.ade-menu-disclosure-chevron', { 'aria-hidden': 'true' }));
		prependAdeIcon(arrow, Codicon.chevronRight);
		if (options.description) {
			const description = dom.prepend(body, dom.$('p.ade-menu-section-description', { id: generateUuid() }));
			description.textContent = options.description;
			summary.setAttribute('aria-describedby', description.id);
		}
		return body;
	}
}
