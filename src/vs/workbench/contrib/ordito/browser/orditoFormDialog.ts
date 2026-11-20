import './media/ordito.css';
import * as dom from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { hasKey } from '../../../../base/common/types.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { OrditoControls } from './orditoControls.js';
import { describeOrditoError, type OrditoErrorContext } from './orditoErrors.js';
import { renderOrditoErrorNotice } from './orditoErrorNotice.js';

interface TextOptions {
	multiline?: boolean;
	required?: boolean;
	placeholder?: string;
	validate?: (value: string) => string | undefined;
}

/** A detached, labeled form with one explicit commit boundary and native modal focus handling. */
export class OrditoFormDialog extends Disposable {
	readonly body: HTMLFormElement;
	private readonly element: HTMLDialogElement;
	private readonly footer: HTMLElement;
	private readonly message: HTMLElement;
	private readonly messageControls = this._register(new OrditoControls());
	private readonly validators: { label: string; control: HTMLInputElement | HTMLTextAreaElement; message: HTMLElement; validate: (value: string) => string | undefined }[] = [];
	private readonly controls: (HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement)[] = [];
	private readonly restoreFocus = OrditoControls.captureActiveFocus();
	private cancel: (() => void) | undefined;
	private closed = false;

	constructor(parent: HTMLElement, options: { title: string; description?: string; confirmLabel?: string }) {
		super();
		this.element = dom.append(parent, dom.$<HTMLDialogElement>('dialog.ordito-form-dialog'));
		const header = dom.append(this.element, dom.$('header'));
		const title = dom.append(header, dom.$('h2', { id: generateUuid() }));
		title.textContent = options.title;
		this.element.setAttribute('aria-labelledby', title.id);
		if (options.description) {
			const description = dom.append(header, dom.$('p', { id: generateUuid() }));
			description.textContent = options.description;
			this.element.setAttribute('aria-describedby', description.id);
		}
		this.body = dom.append(this.element, dom.$<HTMLFormElement>('form.ordito-form-body', { id: generateUuid(), novalidate: 'novalidate' }));
		this.message = dom.append(this.element, dom.$('div.ordito-form-validation', { id: generateUuid() }));
		this.body.setAttribute('aria-describedby', this.message.id);
		for (const event of ['input', 'change']) { this._register(dom.addDisposableListener(this.body, event, () => this.showError())); }
		this.footer = dom.append(this.element, dom.$('footer'));
		this.button(this.footer, localize('ordito.form.cancel', "Cancel"), () => this.cancel?.());
		const save = dom.append(this.footer, dom.$<HTMLButtonElement>('button.primary', { type: 'submit', form: this.body.id }));
		save.textContent = options.confirmLabel ?? localize('ordito.form.save', "Save Changes");
		this._register(dom.addDisposableListener(this.element, 'cancel', event => { event.preventDefault(); this.cancel?.(); }));
	}

	private field(parent: HTMLElement, label: string): HTMLLabelElement {
		const field = dom.append(parent, dom.$<HTMLLabelElement>('label.ordito-form-field'));
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
		const message = dom.append(field, dom.$('span.ordito-form-field-error', { id: generateUuid(), 'aria-live': 'polite' }));
		input.setAttribute('aria-describedby', message.id);
		const validate = (value: string) => options.required && !value.trim() ? localize('ordito.form.required', "Enter a value.") : options.validate?.(value);
		this.validators.push({ label, control: input, message, validate });
		this.controls.push(input);
		this._register(dom.addDisposableListener(input, 'input', () => {
			input.setCustomValidity(''); input.removeAttribute('aria-invalid'); message.textContent = ''; this.showError();
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
		const field = this.field(parent, label); field.classList.add('ordito-form-checkbox');
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
					try {
						let firstInvalid: HTMLElement | undefined;
						const errors: string[] = [];
						for (const { label, control, message, validate } of this.validators) {
							if (!this.body.contains(control) || control.matches(':disabled') || control.closest('[hidden]')) { continue; }
							const error = validate(control.value);
							control.setCustomValidity(error ?? '');
							control.setAttribute('aria-invalid', String(!!error));
							message.textContent = error ?? '';
							if (error) { firstInvalid ??= control; errors.push(localize('ordito.form.fieldError', "{0}: {1}", label, error)); }
						}
						if (firstInvalid) { this.showError(errors.join('\n')); firstInvalid.focus(); return; }
						if (!this.body.reportValidity()) {
							const invalid = this.controls.find(control => this.body.contains(control) && control.matches(':invalid'));
							if (invalid && hasKey(invalid, { validationMessage: true })) { this.showError(invalid.validationMessage); }
							return;
						}
						const value = read();
						const error = validate?.(value);
						this.showError(error);
						if (!error) { resolve(value); }
					} catch (error) { this.showError(error, 'edit'); }
				}));
				this.element.showModal();
				this.controls.find(control => this.body.contains(control) && !control.matches(':disabled') && !control.closest('[hidden]'))?.focus();
			});
		} finally { this.dispose(); }
	}

	private showError(error?: unknown, context: OrditoErrorContext = 'validation'): void {
		this.messageControls.render(this.message, () => {
			dom.clearNode(this.message);
			if (error) { renderOrditoErrorNotice(this.message, describeOrditoError(error, context), this.messageControls); }
		});
	}

	override dispose(): void {
		if (this.closed) { return; }
		this.closed = true;
		this.cancel?.(); this.cancel = undefined;
		this.element.close(); this.element.remove();
		super.dispose(); this.restoreFocus();
	}
}
