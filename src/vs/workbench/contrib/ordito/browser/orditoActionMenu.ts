import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { type ThemeIcon } from '../../../../base/common/themables.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { OrditoControls } from './orditoControls.js';
import { prependOrditoIcon } from './orditoIcons.js';

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
export class OrditoActionMenu {
	constructor(private readonly controls: OrditoControls) { }

	header(parent: HTMLElement, title: string, subtitle?: string, icon?: ThemeIcon): HTMLElement {
		parent.classList.add('ordito-action-menu');
		const header = dom.append(parent, dom.$('header.ordito-menu-header'));
		if (icon) { prependOrditoIcon(header, icon); }
		const text = dom.append(header, dom.$('div.ordito-menu-header-text'));
		dom.append(text, dom.$('h2')).textContent = title;
		if (subtitle) { dom.append(text, dom.$('p')).textContent = subtitle; }
		return header;
	}

	headerAction<T>(header: HTMLElement, label: string, run: () => T, icon: ThemeIcon, id: string): void {
		const button = this.controls.button(header, label, run, id);
		button.classList.add('ordito-menu-header-action');
		prependOrditoIcon(button, icon);
	}

	section(parent: HTMLElement, title: string, options: { description?: string; tone?: 'danger'; compact?: boolean } = {}): HTMLElement {
		parent.classList.add('ordito-action-menu');
		const section = dom.append(parent, dom.$('section.ordito-menu-section'));
		section.classList.toggle('ordito-menu-danger', options.tone === 'danger');
		section.classList.toggle('ordito-menu-section-compact', !!options.compact);
		const heading = dom.append(section, dom.$('h3.ordito-menu-section-title', { id: generateUuid() }));
		heading.textContent = title;
		section.setAttribute('aria-labelledby', heading.id);
		if (options.description) { dom.append(section, dom.$('p.ordito-menu-section-description')).textContent = options.description; }
		return dom.append(section, dom.$('div.ordito-menu-section-body'));
	}

	action<T>(parent: HTMLElement, label: string, run: () => T, options: ActionPresentation = {}): HTMLButtonElement {
		return this.decorate(this.controls.button(parent, label, run, options.id), options);
	}

	/** Descriptions remain accessible without becoming part of the command's name. */
	decorate(button: HTMLButtonElement, options: ActionPresentation = {}): HTMLButtonElement {
		const label = button.getAttribute('aria-label') ?? button.textContent ?? '';
		dom.clearNode(button);
		button.classList.add('ordito-menu-action');
		button.classList.toggle('ordito-menu-action-navigation', options.kind === 'navigation');
		button.classList.toggle('ordito-menu-action-destructive', options.kind === 'destructive');
		button.classList.toggle('ordito-menu-action-primary', options.emphasis === 'primary');
		button.setAttribute('aria-label', label);
		if (options.icon) { prependOrditoIcon(button, options.icon); }
		else { dom.append(button, dom.$('span.ordito-menu-icon-space', { 'aria-hidden': 'true' })); }
		const text = dom.append(button, dom.$('span.ordito-menu-action-text'));
		dom.append(text, dom.$('span.ordito-menu-action-label')).textContent = label;
		const descriptions: string[] = [];
		if (options.description) {
			const description = dom.append(text, dom.$('span.ordito-menu-action-description', { id: generateUuid() }));
			description.textContent = options.description; descriptions.push(description.id);
		}
		const trailing = options.current || options.detail || options.kind === 'navigation' ? dom.append(button, dom.$('span.ordito-menu-action-trailing')) : undefined;
		if (options.current || options.detail) {
			const detail = dom.append(trailing!, dom.$('span.ordito-menu-action-detail', { id: generateUuid() }));
			detail.textContent = options.current ? localize('ordito.menu.current', "Current") : options.detail!;
			descriptions.push(detail.id);
		}
		if (descriptions.length) { button.setAttribute('aria-describedby', descriptions.join(' ')); }
		if (options.current) { button.setAttribute('aria-current', 'true'); button.disabled = true; }
		else if (options.kind === 'navigation') {
			const arrow = dom.append(trailing!, dom.$('span.ordito-menu-action-arrow', { 'aria-hidden': 'true' }));
			prependOrditoIcon(arrow, Codicon.chevronRight);
		}
		return button;
	}

	info(parent: HTMLElement, label: string, value: string, icon?: ThemeIcon): HTMLElement {
		const row = dom.append(parent, dom.$('dl.ordito-menu-fact'));
		const term = dom.append(row, dom.$('dt'));
		if (icon) { prependOrditoIcon(term, icon); }
		dom.append(term, dom.$('span')).textContent = label;
		dom.append(row, dom.$('dd')).textContent = value;
		return row;
	}

	disclosure(parent: HTMLElement, label: string, id: string, options: { icon?: ThemeIcon; description?: string; openByDefault?: boolean } = {}): HTMLElement {
		parent.classList.add('ordito-action-menu');
		const body = this.controls.details(parent, label, id, { openByDefault: options.openByDefault });
		body.classList.add('ordito-menu-disclosure-body');
		const details = body.parentElement!; details.classList.add('ordito-menu-disclosure');
		const summary = details.firstElementChild as HTMLElement;
		summary.setAttribute('aria-label', label);
		dom.clearNode(summary);
		if (options.icon) { prependOrditoIcon(summary, options.icon); }
		dom.append(summary, dom.$('span.ordito-menu-disclosure-label')).textContent = label;
		const arrow = dom.append(summary, dom.$('span.ordito-menu-disclosure-chevron', { 'aria-hidden': 'true' }));
		prependOrditoIcon(arrow, Codicon.chevronRight);
		if (options.description) {
			const description = dom.prepend(body, dom.$('p.ordito-menu-section-description', { id: generateUuid() }));
			description.textContent = options.description;
			summary.setAttribute('aria-describedby', description.id);
		}
		return body;
	}
}
