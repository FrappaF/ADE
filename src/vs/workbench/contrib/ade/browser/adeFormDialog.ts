/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/ade.css';
import * as dom from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { AdeControls } from './adeControls.js';

interface TextOptions {
	multiline?: boolean;
	required?: boolean;
	placeholder?: string;
	validate?: (value: string) => string | undefined;
}

/** A detached, labeled form with one explicit commit boundary and native modal focus handling. */
export class AdeFormDialog extends Disposable {
	readonly body: HTMLFormElement;
	private readonly element: HTMLDialogElement;
	private readonly footer: HTMLElement;
	private readonly message: HTMLElement;
	private readonly validators: { control: HTMLInputElement | HTMLTextAreaElement; message: HTMLElement; validate: (value: string) => string | undefined }[] = [];
	private readonly controls: (HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement)[] = [];
	private readonly restoreFocus = AdeControls.captureActiveFocus();
	private cancel: (() => void) | undefined;
	private closed = false;

	constructor(parent: HTMLElement, options: { title: string; description?: string; confirmLabel?: string }) {
		super();
		this.element = dom.append(parent, dom.$<HTMLDialogElement>('dialog.ade-form-dialog'));
		const header = dom.append(this.element, dom.$('header'));
		const title = dom.append(header, dom.$('h2', { id: generateUuid() }));
		title.textContent = options.title;
		this.element.setAttribute('aria-labelledby', title.id);
		if (options.description) {
			const description = dom.append(header, dom.$('p', { id: generateUuid() }));
			description.textContent = options.description;
			this.element.setAttribute('aria-describedby', description.id);
		}
		this.body = dom.append(this.element, dom.$<HTMLFormElement>('form.ade-form-body', { id: generateUuid(), novalidate: 'novalidate' }));
		this.message = dom.append(this.element, dom.$('p.ade-form-validation', { role: 'alert', id: generateUuid() }));
		this.body.setAttribute('aria-describedby', this.message.id);
		this.footer = dom.append(this.element, dom.$('footer'));
		this.button(this.footer, localize('ade.form.cancel', "Cancel"), () => this.cancel?.());
		const save = dom.append(this.footer, dom.$<HTMLButtonElement>('button.primary', { type: 'submit', form: this.body.id }));
		save.textContent = options.confirmLabel ?? localize('ade.form.save', "Save Changes");
		this._register(dom.addDisposableListener(this.element, 'cancel', event => { event.preventDefault(); this.cancel?.(); }));
	}

	private field(parent: HTMLElement, label: string): HTMLLabelElement {
		const field = dom.append(parent, dom.$<HTMLLabelElement>('label.ade-form-field'));
		field.htmlFor = generateUuid();
		dom.append(field, dom.$('span', { id: `${field.htmlFor}-label` })).textContent = label;
		return field;
	}

	text(parent: HTMLElement, label: string, value?: string, options?: TextOptions & { multiline?: false }): HTMLInputElement;
	text(parent: HTMLElement, label: string, value: string | undefined, options: TextOptions & { multiline: true }): HTMLTextAreaElement;
	text(parent: HTMLElement, label: string, value = '', options: TextOptions = {}): HTMLInputElement | HTMLTextAreaElement {
		const field = this.field(parent, label);
		const input = options.multiline ? dom.append(field, dom.$<HTMLTextAreaElement>('textarea', { rows: '4' })) : dom.append(field, dom.$<HTMLInputElement>('input', { type: 'text' }));
		input.id = field.htmlFor; input.setAttribute('aria-labelledby', `${field.htmlFor}-label`);
		input.value = value;
		input.required = options.required ?? false;
		input.placeholder = options.placeholder ?? '';
		const message = dom.append(field, dom.$('span.ade-form-field-error', { id: generateUuid(), 'aria-live': 'polite' }));
		input.setAttribute('aria-describedby', message.id);
		const validate = (value: string) => options.required && !value.trim() ? localize('ade.form.required', "Enter a value.") : options.validate?.(value);
		this.validators.push({ control: input, message, validate });
		this.controls.push(input);
		this._register(dom.addDisposableListener(input, 'input', () => {
			input.setCustomValidity(''); input.removeAttribute('aria-invalid'); message.textContent = ''; this.message.textContent = '';
		}));
		return input;
	}

	select(parent: HTMLElement, label: string, value: string, choices: readonly { value: string; label: string }[], options: { required?: boolean } = {}): HTMLSelectElement {
		const field = this.field(parent, label);
		const select = dom.append(field, dom.$<HTMLSelectElement>('select', { id: field.htmlFor, 'aria-labelledby': `${field.htmlFor}-label` }));
		for (const choice of choices) {
			const option = dom.append(select, dom.$<HTMLOptionElement>('option', { value: choice.value }));
			option.textContent = choice.label;
		}
		select.value = value;
		select.required = options.required ?? false;
		this.controls.push(select);
		return select;
	}

	checkbox(parent: HTMLElement, label: string, checked: boolean): HTMLInputElement {
		const field = this.field(parent, label); field.classList.add('ade-form-checkbox');
		const input = dom.prepend(field, dom.$<HTMLInputElement>('input', { type: 'checkbox' }));
		input.id = field.htmlFor; input.setAttribute('aria-labelledby', `${field.htmlFor}-label`);
		input.checked = checked;
		this.controls.push(input);
		return input;
	}

	button(parent: HTMLElement, label: string, action: () => void, options: { primary?: boolean } = {}): HTMLButtonElement {
		const button = dom.append(parent, dom.$<HTMLButtonElement>('button', { type: 'button' }));
		button.textContent = label; button.classList.toggle('primary', !!options.primary);
		this.controls.push(button);
		this._register(dom.addDisposableListener(button, 'click', action));
		return button;
	}

	/** Values stay in the dialog until every field validates and the user explicitly submits. */
	async open<T>(read: () => T, validate?: (value: T) => string | undefined): Promise<T | undefined> {
		try {
			return await new Promise<T | undefined>(resolve => {
				this.cancel = () => resolve(undefined);
				this._register(dom.addDisposableListener(this.body, 'submit', event => {
					event.preventDefault();
					let firstInvalid: HTMLElement | undefined;
					for (const { control, message, validate } of this.validators) {
						if (!this.body.contains(control) || control.matches(':disabled') || control.closest('[hidden]')) { continue; }
						const error = validate(control.value);
						control.setCustomValidity(error ?? '');
						control.setAttribute('aria-invalid', String(!!error));
						message.textContent = error ?? '';
						if (error) { firstInvalid ??= control; }
					}
					if (firstInvalid) { firstInvalid.focus(); return; }
					if (!this.body.reportValidity()) { return; }
					const value = read();
					const error = validate?.(value);
					this.message.textContent = error ?? '';
					if (!error) { resolve(value); }
				}));
				this.element.showModal();
				this.controls.find(control => this.body.contains(control) && !control.matches(':disabled') && !control.closest('[hidden]'))?.focus();
			});
		} finally { this.dispose(); }
	}

	override dispose(): void {
		if (this.closed) { return; }
		this.closed = true;
		this.cancel?.(); this.cancel = undefined;
		this.element.close(); this.element.remove();
		super.dispose(); this.restoreFocus();
	}
}
