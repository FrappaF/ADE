/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/ade.css';
import * as dom from '../../../../base/browser/dom.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { type IInputOptions, type IPickOptions, type IQuickInputService, type IQuickPickItem, type QuickPickInput } from '../../../../platform/quickinput/common/quickInput.js';
import { type ModelView, type SemanticModelV4 } from '../common/modelTypes.js';
import { type VisualEdit } from '../common/visualEditing.js';
import { adeBlueprintAreas, editAdeBlueprint, type BlueprintEditMode } from './adeBlueprintEditing.js';
import { AdeControls } from './adeControls.js';

type Answer = { kind: 'input'; value: string } | { kind: 'pick'; indices: number[] };
interface WizardStep { title: string; answer: Answer; summary: string }
class WizardBack extends Error { constructor(readonly index: number, readonly review = false) { super('back'); } }
class WizardCanceled extends Error { }

/** Presents the existing detached blueprint forms in one accessible, reversible wizard. */
export class AdeBlueprintWizard extends Disposable implements Pick<IQuickInputService, 'pick' | 'input'> {
	private readonly element: HTMLDialogElement;
	private readonly phases: HTMLElement[];
	private readonly context: HTMLElement;
	private readonly content: HTMLElement;
	private readonly footer: HTMLElement;
	private readonly pageListeners = this._register(new DisposableStore());
	private readonly restoreFocus = AdeControls.captureActiveFocus();
	private steps: WizardStep[] = [];
	private cursor = 0;
	private replayUntil = 0;
	private reviewEdit = false;
	private pageVersion = 0;
	private interrupt: ((error: Error) => void) | undefined;
	private saveDraft: (() => void) | undefined;
	private closed = false;

	constructor(parent: HTMLElement) {
		super();
		this.element = dom.append(parent, dom.$<HTMLDialogElement>('dialog.ade-blueprint-wizard'));
		this.element.setAttribute('aria-label', localize('ade.blueprint.wizard.title', "Structural Blueprint"));
		const header = dom.append(this.element, dom.$('header'));
		dom.append(header, dom.$('h2')).textContent = localize('ade.blueprint.wizard.title', "Structural Blueprint");
		this.context = dom.append(header, dom.$('p'));
		const phases = dom.append(this.element, dom.$('ol.ade-blueprint-phases'));
		phases.setAttribute('aria-label', localize('ade.blueprint.wizard.progress', "Blueprint Progress"));
		this.phases = [localize('ade.blueprint.wizard.choose', "Choose"), localize('ade.blueprint.wizard.configure', "Configure"), localize('ade.blueprint.wizard.review', "Review")].map(label => {
			const phase = dom.append(phases, dom.$('li')); phase.textContent = label; return phase;
		});
		this.content = dom.append(this.element, dom.$('div.ade-blueprint-body'));
		this.footer = dom.append(this.element, dom.$('footer'));
		this._register(dom.addDisposableListener(this.element, 'cancel', event => { event.preventDefault(); this.interrupt?.(new WizardCanceled()); }));
	}

	async open(model: SemanticModelV4, selectedId: string, view?: ModelView, initialMode?: BlueprintEditMode): Promise<VisualEdit[] | undefined> {
		let mode = initialMode;
		let contextual = !!initialMode;
		const selectionName = model.semantics.elements.find(element => element.id === selectedId)?.name ?? model.foundation.types.find(type => type.id === selectedId || type.fields.some(field => field.id === selectedId))?.name ?? model.foundation.blueprint?.operations.find(operation => operation.id === selectedId)?.name;
		try {
			this.element.showModal();
			while (true) {
				try {
					const context = contextual && selectionName ? localize('ade.blueprint.wizard.target', "{0} · {1}", model.name, selectionName) : model.name;
					this.context.textContent = context;
					mode ??= await this.chooseTask();
					this.context.textContent = localize('ade.blueprint.wizard.activity', "{0} · {1}", context, adeBlueprintAreas.flatMap(area => area.modes).find(task => task.value === mode)!.label);
					this.cursor = 0;
					// Replay only detached forms, resolving selections against fresh records on every pass.
					const edits = await editAdeBlueprint(this, model, contextual ? selectedId : '', view, mode);
					if (!edits?.length) { await this.showMessage(localize('ade.blueprint.wizard.noChanges', "No Changes to Apply"), localize('ade.blueprint.wizard.noChangesHelp', "This activity did not produce a change. Go back to review your choices or choose another activity.")); continue; }
					await this.review();
					return edits;
				} catch (error) {
					if (error instanceof WizardCanceled) { return; }
					if (error instanceof WizardBack) {
						this.replayUntil = error.index;
						this.reviewEdit = error.review;
						if (error.index < 0) { mode = undefined; contextual = false; this.steps = []; }
						continue;
					}
					try { await this.showMessage(localize('ade.blueprint.wizard.unavailable', "This Step Needs More Information"), error instanceof Error ? error.message : String(error)); }
					catch (navigation) {
						if (navigation instanceof WizardCanceled) { return; }
						if (!(navigation instanceof WizardBack)) { throw navigation; }
						this.replayUntil = navigation.index;
						this.reviewEdit = false;
						if (navigation.index < 0) { mode = undefined; contextual = false; this.steps = []; }
					}
				}
			}
		} finally { this.dispose(); }
	}

	private button(parent: HTMLElement, label: string, action: () => void, primary = false): HTMLButtonElement {
		const button = dom.append(parent, dom.$<HTMLButtonElement>('button', { type: 'button' }));
		button.textContent = label; button.classList.toggle('primary', primary);
		this.pageListeners.add(dom.addDisposableListener(button, 'click', action));
		return button;
	}

	private page(phase: number, title: string, hint: string, back: number): void {
		this.pageVersion++;
		this.pageListeners.clear(); this.saveDraft = undefined;
		dom.clearNode(this.content); dom.clearNode(this.footer); this.content.scrollTop = 0;
		this.phases.forEach((element, index) => {
			if (index === phase) { element.setAttribute('aria-current', 'step'); } else { element.removeAttribute('aria-current'); }
		});
		const heading = dom.append(this.content, dom.$('h3', { tabindex: '-1' })); heading.textContent = title;
		dom.append(this.content, dom.$('p.ade-blueprint-hint')).textContent = hint;
		if (phase) {
			this.button(this.footer, localize('ade.blueprint.wizard.back', "Back"), () => { this.saveDraft?.(); this.interrupt?.(new WizardBack(back)); });
		}
		this.button(this.footer, localize('ade.blueprint.wizard.cancel', "Cancel"), () => this.interrupt?.(new WizardCanceled())).classList.add('ade-blueprint-cancel');
		heading.focus();
	}

	private chooseTask(): Promise<BlueprintEditMode> {
		this.page(0, localize('ade.blueprint.wizard.what', "What Would You Like to Define?"), localize('ade.blueprint.wizard.intro', "Choose an activity. We will guide you through its fields, then review the changes together."), -1);
		return new Promise((resolve, reject) => {
			this.interrupt = reject;
			const sections: { element: HTMLElement; buttons: HTMLButtonElement[] }[] = [];
			const search = dom.append(this.content, dom.$<HTMLInputElement>('input', { type: 'search', placeholder: localize('ade.blueprint.wizard.find', "Find a Blueprint Activity…"), 'aria-label': localize('ade.blueprint.wizard.find', "Find a Blueprint Activity…") }));
			search.focus();
			this.pageListeners.add(dom.addDisposableListener(search, 'input', () => {
				for (const section of sections) {
					for (const button of section.buttons) { button.hidden = !button.textContent?.toLocaleLowerCase().includes(search.value.toLocaleLowerCase()); }
					section.element.hidden = section.buttons.every(button => button.hidden);
				}
			}));
			for (const area of adeBlueprintAreas) {
				const section = dom.append(this.content, dom.$('section.ade-blueprint-area'));
				const buttons: HTMLButtonElement[] = [];
				sections.push({ element: section, buttons });
				dom.append(section, dom.$('h4')).textContent = area.label;
				for (const task of area.modes) {
					const button = this.button(section, '', () => resolve(task.value));
					buttons.push(button);
					dom.append(button, dom.$('strong')).textContent = task.label;
					dom.append(button, dom.$('span')).textContent = task.description;
				}
			}
		});
	}

	private async step(title: string, hint: string, initial: Answer, render: (form: HTMLFormElement, answer: Answer) => { read(): Answer; summary(answer: Answer): string; validate?(answer: Answer): Promise<string | undefined>; empty?: boolean }): Promise<Answer> {
		const index = this.cursor++;
		const previous = this.steps[index];
		if (index < this.replayUntil && previous) { return previous.answer; }
		this.page(1, title, hint, index - 1);
		const form = dom.append(this.content, dom.$<HTMLFormElement>('form'));
		const field = render(form, previous?.answer ?? initial);
		const message = dom.append(form, dom.$('p.ade-blueprint-validation', { role: 'alert', id: generateUuid() }));
		form.setAttribute('aria-describedby', message.id);
		const next = this.button(this.footer, localize('ade.blueprint.wizard.next', "Next"), () => form.requestSubmit(), true);
		next.disabled = !!field.empty;
		this.saveDraft = () => { const answer = field.read(); this.steps[index] = { title, answer, summary: field.summary(answer) }; };
		const version = this.pageVersion;
		return new Promise((resolve, reject) => {
			this.interrupt = reject;
			this.pageListeners.add(dom.addDisposableListener(form, 'submit', async event => {
				event.preventDefault();
				if (next.disabled) { return; }
				next.disabled = true;
				try {
					const answer = field.read();
					const error = await field.validate?.(answer);
					if (version !== this.pageVersion) { return; }
					if (error) { message.textContent = error; next.disabled = false; return; }
					if (answer.kind === 'pick' && JSON.stringify(previous?.answer) !== JSON.stringify(answer)) { this.steps.length = index; this.reviewEdit = false; }
					this.steps[index] = { title, answer, summary: field.summary(answer) };
					if (this.reviewEdit) { this.replayUntil = this.steps.length; this.reviewEdit = false; }
					resolve(answer);
				} catch (error) { reject(error); }
			}));
		});
	}

	pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: IPickOptions<T> & { canPickMany: true }): Promise<T[] | undefined>;
	pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: IPickOptions<T> & { canPickMany: false }): Promise<T | undefined>;
	pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: Omit<IPickOptions<T>, 'canPickMany'>): Promise<T | undefined>;
	async pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: IPickOptions<T>): Promise<T | T[] | undefined> {
		const items = (await picks).filter((item): item is T => item.type !== 'separator');
		const active = await options?.activeItem;
		const create = items.findIndex(item => item.label === localize('ade.blueprint.new', "Create New"));
		const selected = options?.canPickMany ? items.flatMap((item, index) => item.picked ? [index] : []) : active ? [items.indexOf(active)] : create >= 0 ? [create] : [];
		const title = options?.title ?? localize('ade.blueprint.wizard.select', "Choose an Option");
		const answer = await this.step(title, options?.prompt ?? options?.placeHolder ?? (options?.canPickMany ? localize('ade.blueprint.wizard.many', "Select the items to include, then choose Next. You can leave all items unchecked.") : localize('ade.blueprint.wizard.one', "Select an option, then choose Next. Use Back to revisit a previous choice.")), { kind: 'pick', indices: selected }, (form, answer) => {
			if (!items.length) { dom.append(form, dom.$('p')).textContent = localize('ade.blueprint.wizard.empty', "No compatible items are available. Use Back to choose another activity and add the required elements or definitions first."); }
			const choices = dom.append(form, dom.$('fieldset.ade-blueprint-choices'));
			dom.append(choices, dom.$('legend')).textContent = title;
			const rows: HTMLElement[] = [];
			if (items.length > 8) {
				const search = dom.prepend(form, dom.$<HTMLInputElement>('input', { type: 'search', placeholder: localize('ade.blueprint.wizard.filter', "Filter Options…"), 'aria-label': localize('ade.blueprint.wizard.filter', "Filter Options…") }));
				this.pageListeners.add(dom.addDisposableListener(search, 'input', () => {
					for (const row of rows) { row.hidden = !row.textContent?.toLocaleLowerCase().includes(search.value.toLocaleLowerCase()); }
				}));
			}
			const inputs = items.map((item, index) => {
				const row = dom.append(choices, dom.$('label.ade-blueprint-choice'));
				rows.push(row);
				const input = dom.append(row, dom.$<HTMLInputElement>('input', { type: options?.canPickMany ? 'checkbox' : 'radio', name: 'choice', value: String(index) }));
				input.checked = answer.kind === 'pick' && answer.indices.includes(index);
				const text = dom.append(row, dom.$('span'));
				dom.append(text, dom.$('strong')).textContent = item.label;
				if (item.description || item.detail) { dom.append(text, dom.$('span')).textContent = [item.description, item.detail].filter(Boolean).join(' · '); }
				if (index === create) { choices.prepend(row); }
				return input;
			});
			return {
				read: () => ({ kind: 'pick', indices: inputs.flatMap((input, index) => input.checked ? [index] : []) }),
				summary: answer => answer.kind === 'pick' ? answer.indices.map(index => items[index].label).join(', ') || localize('ade.blueprint.wizard.none', "None") : '',
				validate: async answer => !options?.canPickMany && answer.kind === 'pick' && !answer.indices.length ? localize('ade.blueprint.wizard.selectionRequired', "Choose an option to continue.") : undefined,
				empty: !items.length && !options?.canPickMany
			};
		});
		if (answer.kind !== 'pick') { return; }
		return options?.canPickMany ? answer.indices.map(index => items[index]) : items[answer.indices[0]];
	}

	async input(options?: IInputOptions): Promise<string | undefined> {
		const answer = await this.step(options?.title ?? localize('ade.blueprint.wizard.value', "Enter a Value"), options?.prompt ?? localize('ade.blueprint.wizard.inputHelp', "Complete this field, then choose Next. Your changes will be applied after the review."), { kind: 'input', value: options?.value ?? '' }, (form, answer) => {
			const label = dom.append(form, dom.$('label.ade-blueprint-field')); label.textContent = options?.title ?? '';
			const input = dom.append(label, dom.$<HTMLInputElement>('input', { type: options?.password ? 'password' : 'text' }));
			input.value = answer.kind === 'input' ? answer.value : ''; input.placeholder = options?.placeHolder ?? '';
			input.focus(); input.select();
			return {
				read: () => ({ kind: 'input', value: input.value }),
				summary: answer => options?.password ? '••••' : answer.kind === 'input' ? answer.value || localize('ade.blueprint.wizard.emptyValue', "Empty") : '',
				validate: async answer => {
					const error = answer.kind === 'input' ? await options?.validateInput?.(answer.value) : undefined;
					input.setAttribute('aria-invalid', String(!!error));
					return typeof error === 'string' ? error : error?.content;
				}
			};
		});
		return answer.kind === 'input' ? answer.value : undefined;
	}

	private review(): Promise<void> {
		this.page(2, localize('ade.blueprint.wizard.reviewTitle', "Review Your Blueprint Changes"), localize('ade.blueprint.wizard.reviewHelp', "Check your choices before applying them. You can edit any step or cancel without changing the project."), this.steps.length - 1);
		return new Promise((resolve, reject) => {
			this.interrupt = reject;
			const list = dom.append(this.content, dom.$('dl.ade-blueprint-summary'));
			this.steps.forEach((step, index) => {
				const row = dom.append(list, dom.$('div'));
				dom.append(row, dom.$('dt')).textContent = step.title;
				dom.append(row, dom.$('dd')).textContent = step.summary;
				const edit = this.button(row, localize('ade.blueprint.wizard.edit', "Edit"), () => reject(new WizardBack(index, true)));
				edit.setAttribute('aria-label', localize('ade.blueprint.wizard.editStep', "Edit {0}", step.title));
			});
			this.button(this.footer, localize('ade.blueprint.wizard.apply', "Apply Changes"), () => resolve(), true);
		});
	}

	private showMessage(title: string, message: string): Promise<never> {
		this.page(1, title, message, this.cursor - 1);
		return new Promise((_, reject) => { this.interrupt = reject; });
	}

	override dispose(): void {
		if (this.closed) { return; }
		this.closed = true;
		this.interrupt?.(new WizardCanceled());
		this.pageVersion++;
		this.element.close(); this.element.remove();
		super.dispose(); this.restoreFocus();
	}
}
