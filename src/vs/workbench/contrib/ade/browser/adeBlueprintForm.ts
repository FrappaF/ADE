/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { hasKey } from '../../../../base/common/types.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { type ModelView, type SemanticModelV4 } from '../common/modelTypes.js';
import { type VisualEdit } from '../common/visualEditing.js';
import { type BlueprintEditMode } from './adeBlueprintEditing.js';
import { AdeControls } from './adeControls.js';

export interface BlueprintActivityContext {
	readonly model: SemanticModelV4;
	readonly targetId?: string;
	readonly activeView?: ModelView;
	open(mode: BlueprintEditMode, id?: string): void;
}

export interface BlueprintOption {
	readonly id: string;
	readonly label: string;
	readonly description?: string;
}

export interface BlueprintActivity {
	readonly records: readonly BlueprintOption[];
	readonly initialId?: string;
	readonly createLabel?: string;
	render(form: BlueprintForm, recordId?: string): void;
}

interface BlueprintFieldOptions {
	readonly required?: boolean;
	readonly placeholder?: string;
}

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/** Owns native controls for one configuration while the editor switches between activities. */
export class BlueprintForm extends Disposable {
	readonly element = dom.$('div.ade-blueprint-form');
	readonly newId = generateUuid();
	private readonly fields = new Map<Field, { label: string; initial: string; initialDisplay: string }>();
	private readonly actions = new WeakMap<HTMLButtonElement, () => void>();
	private readonly showListeners: (() => void)[] = [];
	private sections?: ReturnType<AdeControls['tabs']>;
	private readonly tabPanels = new Set<HTMLElement>();
	private collect?: (model: SemanticModelV4) => VisualEdit | readonly VisualEdit[] | undefined;

	constructor(readonly context: BlueprintActivityContext, private readonly didChange: () => void) {
		super();
		this._register(dom.addDisposableListener(this.element, 'input', () => this.changed()));
		this._register(dom.addDisposableListener(this.element, 'change', () => this.changed()));
		this._register(dom.addDisposableListener(this.element, 'click', (event: MouseEvent) => {
			const button = dom.isHTMLElement(event.target) ? event.target.closest('button') : null;
			if (button) { this.actions.get(button)?.(); }
		}));
	}

	group(title: string, description?: string): HTMLElement {
		const group = dom.append(this.element, dom.$('section.ade-blueprint-group'));
		dom.append(group, dom.$('h3')).textContent = title;
		if (description) { this.note(group, description); }
		return group;
	}

	tabs(sections: readonly { id: string; label: string; groups: readonly HTMLElement[] }[]): void {
		const controls = this._register(new AdeControls());
		this.sections = controls.tabs(this.element, this.newId, sections);
		for (const { id, groups } of sections) {
			const panel = this.sections.panels.get(id)!;
			this.tabPanels.add(panel);
			panel.append(...groups);
		}
	}

	get activeSection(): string | undefined { return this.sections?.activeId; }
	selectSection(id: string): void { this.sections?.select(id); }

	text(parent: HTMLElement, label: string, value = '', options?: BlueprintFieldOptions & { multiline?: boolean }): HTMLInputElement | HTMLTextAreaElement {
		const control = options?.multiline ? dom.$<HTMLTextAreaElement>('textarea', { rows: '3' }) : dom.$<HTMLInputElement>('input', { type: 'text' });
		control.value = value;
		control.required = !!options?.required;
		if (options?.placeholder) { control.placeholder = options.placeholder; }
		this.field(parent, label, control);
		return control;
	}

	select(parent: HTMLElement, label: string, choices: readonly BlueprintOption[], value?: string, options?: BlueprintFieldOptions): HTMLSelectElement {
		const control = dom.$<HTMLSelectElement>('select');
		control.required = !!options?.required;
		const prompt = dom.append(control, dom.$<HTMLOptionElement>('option', { value: '' }));
		prompt.textContent = options?.placeholder ?? localize('ade.blueprint.chooseValue', "Choose an Option");
		for (const choice of choices) {
			const option = dom.append(control, dom.$<HTMLOptionElement>('option', { value: choice.id }));
			option.textContent = choice.description ? localize('ade.blueprint.optionDetail', "{0} · {1}", choice.label, choice.description) : choice.label;
		}
		control.value = value ?? '';
		this.field(parent, label, control);
		return control;
	}

	check(parent: HTMLElement, label: string, value: boolean): HTMLInputElement {
		const control = dom.$<HTMLInputElement>('input', { type: 'checkbox' });
		control.checked = value;
		this.field(parent, label, control).classList.add('ade-blueprint-check');
		return control;
	}

	action(parent: HTMLElement, label: string, run: () => void): HTMLButtonElement {
		const button = dom.append(parent, dom.$<HTMLButtonElement>('button', { type: 'button' }));
		button.textContent = label;
		this.actions.set(button, run);
		return button;
	}

	note(parent: HTMLElement, description: string): void {
		dom.append(parent, dom.$('p.ade-blueprint-note')).textContent = description;
	}

	onEdit(collect: (model: SemanticModelV4) => VisualEdit | readonly VisualEdit[] | undefined): void { this.collect = collect; }
	onShow(refresh: () => void): void { this.showListeners.push(refresh); }
	refresh(): void {
		for (const listener of this.showListeners) { listener(); }
		this.forgetRemovedFields();
	}

	changed(): void {
		this.forgetRemovedFields();
		this.didChange();
	}

	edits(model: SemanticModelV4): readonly VisualEdit[] {
		const result = this.collect?.(model);
		return !result ? [] : hasKey(result, { kind: true }) ? [result as VisualEdit] : result;
	}

	invalidField(): Field | undefined {
		return Array.from(this.fields.keys()).find(field => this.inForm(field) && field.willValidate && (!field.validity.valid || field.required && !field.value.trim()));
	}

	focusFirstField(): boolean {
		const field = Array.from(this.fields.keys()).find(field => this.inForm(field));
		if (field) { this.focusField(field); }
		return !!field;
	}

	focusField(field: Field): void {
		if (this.sections) {
			const section = Array.from(this.sections.panels).find(([, panel]) => panel.contains(field));
			if (section) { this.sections.select(section[0]); }
		}
		field.focus();
	}

	describeChanges(): readonly { label: string; before: string; after: string }[] {
		return Array.from(this.fields).filter(([field, state]) => this.inForm(field) && this.value(field) !== state.initial).map(([field, state]) => ({
			label: state.label,
			before: state.initialDisplay,
			after: this.display(field)
		}));
	}

	private field(parent: HTMLElement, label: string, control: Field): HTMLLabelElement {
		const wrapper = dom.append(parent, dom.$<HTMLLabelElement>('label.ade-blueprint-field'));
		dom.append(wrapper, dom.$('span')).textContent = label;
		dom.append(wrapper, control);
		this.fields.set(control, { label, initial: this.value(control), initialDisplay: this.display(control) });
		return wrapper;
	}

	private inForm(field: Field): boolean {
		if (!this.element.contains(field) || field.matches(':disabled')) {
			return false;
		}
		for (let parent = field.parentElement; parent && parent !== this.element; parent = parent.parentElement) {
			if (parent.hidden && !this.tabPanels.has(parent)) { return false; }
		}
		return true;
	}

	private forgetRemovedFields(): void {
		for (const field of this.fields.keys()) {
			if (!this.element.contains(field)) { this.fields.delete(field); }
		}
	}

	private value(field: Field): string {
		return field instanceof field.ownerDocument.defaultView!.HTMLInputElement && field.type === 'checkbox' ? String(field.checked) : field.value;
	}

	private display(field: Field): string {
		if (field.tagName === 'SELECT') {
			return (field as HTMLSelectElement).selectedOptions[0]?.textContent ?? '';
		}
		if (field instanceof field.ownerDocument.defaultView!.HTMLInputElement && field.type === 'checkbox') {
			return field.checked ? localize('ade.blueprint.yes', "Yes") : localize('ade.blueprint.no', "No");
		}
		return field.value;
	}
}
