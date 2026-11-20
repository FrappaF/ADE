import './media/ade.css';
import * as dom from '../../../../base/browser/dom.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { type IInputOptions, type IPickOptions, type IQuickInputService, type IQuickPickItem, type QuickPickInput } from '../../../../platform/quickinput/common/quickInput.js';
import { AdeControls } from './adeControls.js';
import { describeAdeError, type AdeErrorContext } from './adeErrors.js';
import { renderAdeErrorNotice } from './adeErrorNotice.js';

type Answer = { kind: 'input'; value: string } | { kind: 'pick'; indices: number[] };
interface WizardStep { title: string; answer: Answer; summary: string }
type WizardPickOptions<T extends IQuickPickItem> = IPickOptions<T> & { requireSelection?: boolean };
type WizardInputOptions = IInputOptions & { multiline?: boolean; summarize?(value: string): string };
export interface AdeWizardReviewLabels { heading: string; help: string; confirm: string }
export class WizardBack extends Error { constructor(readonly index: number, readonly review = false) { super('back'); } }
export class WizardCanceled extends Error { }

/** Shared modal workflow for detached editors, with reversible steps and an explicit commit boundary. */
export class AdeEditingWizard extends Disposable implements Pick<IQuickInputService, 'pick' | 'input'> {
	protected readonly element: HTMLDialogElement;
	private readonly phases: HTMLElement[];
	private readonly heading: HTMLElement;
	protected readonly context: HTMLElement;
	protected readonly content: HTMLElement;
	private readonly footer: HTMLElement;
	protected readonly pageListeners = this._register(new DisposableStore());
	private readonly restoreFocus = AdeControls.captureActiveFocus();
	protected steps: WizardStep[] = [];
	protected cursor = 0;
	protected replayUntil = 0;
	protected reviewEdit = false;
	private pageVersion = 0;
	protected interrupt: ((error: Error) => void) | undefined;
	private saveDraft: (() => void) | undefined;
	private closed = false;
	private reviewLabels?: AdeWizardReviewLabels;

	constructor(parent: HTMLElement, title = localize('ade.editing.wizard.title', "Edit Project Details"), private readonly hasChooser = false) {
		super();
		this.element = dom.append(parent, dom.$<HTMLDialogElement>('dialog.ade-blueprint-wizard.ade-editing-wizard'));
		this.element.setAttribute('aria-label', title);
		const header = dom.append(this.element, dom.$('header'));
		this.heading = dom.append(header, dom.$('h2')); this.heading.textContent = title;
		this.context = dom.append(header, dom.$('p'));
		const phases = dom.append(this.element, dom.$('ol.ade-blueprint-phases'));
		phases.setAttribute('aria-label', localize('ade.editing.wizard.progress', "Editing Progress"));
		this.phases = [localize('ade.blueprint.wizard.choose', "Choose"), localize('ade.blueprint.wizard.configure', "Configure"), localize('ade.blueprint.wizard.review', "Review")].map((label, index) => {
			const phase = dom.append(phases, dom.$('li')); phase.textContent = label; phase.hidden = !hasChooser && index === 0; return phase;
		});
		this.content = dom.append(this.element, dom.$('div.ade-blueprint-body'));
		this.footer = dom.append(this.element, dom.$('footer'));
		this._register(dom.addDisposableListener(this.element, 'cancel', event => { event.preventDefault(); this.interrupt?.(new WizardCanceled()); }));
	}

	/** The collector must only construct detached values: callers apply them after this method resolves. */
	async run<T>(title: string, context: string, collect: (quick: Pick<IQuickInputService, 'pick' | 'input'>) => Promise<T | undefined>, reviewLabels?: AdeWizardReviewLabels): Promise<T | undefined> {
		this.element.setAttribute('aria-label', title);
		this.heading.textContent = title;
		this.context.textContent = context;
		this.reviewLabels = reviewLabels;
		try {
			this.element.showModal();
			while (true) {
				try {
					this.cursor = 0;
					const result = await collect(this);
					if (result === undefined) { return; }
					this.steps.length = this.cursor;
					await this.review();
					return result;
				} catch (error) {
					if (error instanceof WizardCanceled) { return; }
					if (error instanceof WizardBack) {
						this.replayUntil = Math.max(0, error.index);
						this.reviewEdit = error.review;
						continue;
					}
					try { await this.showMessage(localize('ade.editing.wizard.unavailable', "This Step Needs More Information"), error instanceof Error ? error.message : String(error), error); }
					catch (navigation) {
						if (navigation instanceof WizardCanceled) { return; }
						if (!(navigation instanceof WizardBack)) { throw navigation; }
						this.replayUntil = Math.max(0, navigation.index);
						this.reviewEdit = false;
					}
				}
			}
		} finally { this.dispose(); }
	}

	protected button(parent: HTMLElement, label: string, action: () => void, primary = false): HTMLButtonElement {
		const button = dom.append(parent, dom.$<HTMLButtonElement>('button', { type: 'button' }));
		button.textContent = label; button.classList.toggle('primary', primary);
		this.pageListeners.add(dom.addDisposableListener(button, 'click', action));
		return button;
	}

	protected page(phase: number, title: string, hint: string, back: number): void {
		this.pageVersion++;
		this.pageListeners.clear(); this.saveDraft = undefined;
		dom.clearNode(this.content); dom.clearNode(this.footer); this.content.scrollTop = 0;
		this.phases.forEach((element, index) => {
			if (index === phase) { element.setAttribute('aria-current', 'step'); } else { element.removeAttribute('aria-current'); }
		});
		const heading = dom.append(this.content, dom.$('h3', { tabindex: '-1' })); heading.textContent = title;
		dom.append(this.content, dom.$('p.ade-blueprint-hint')).textContent = hint;
		if (phase && (this.hasChooser || back >= 0)) {
			this.button(this.footer, localize('ade.blueprint.wizard.back', "Back"), () => { this.saveDraft?.(); this.interrupt?.(new WizardBack(back)); });
		}
		this.button(this.footer, localize('ade.blueprint.wizard.cancel', "Cancel"), () => this.interrupt?.(new WizardCanceled())).classList.add('ade-blueprint-cancel');
		heading.focus();
	}

	private async step(title: string, hint: string, initial: Answer, render: (form: HTMLFormElement, answer: Answer) => { read(): Answer; summary(answer: Answer): string; validate?(answer: Answer): Promise<string | undefined>; empty?: boolean; control?: HTMLElement }, validateReplay?: (answer: Answer) => Promise<string | undefined>): Promise<Answer> {
		const index = this.cursor++;
		const previous = this.steps[index];
		let replayError: string | undefined;
		if (index < this.replayUntil && previous) {
			const interrupted = new Promise<never>((_, reject) => { this.interrupt = reject; });
			replayError = await Promise.race([validateReplay?.(previous.answer), interrupted]);
			if (!replayError) { return previous.answer; }
			this.replayUntil = index;
			this.reviewEdit = true;
		}
		this.page(1, title, hint, index - 1);
		const form = dom.append(this.content, dom.$<HTMLFormElement>('form'));
		const field = render(form, previous?.answer ?? initial);
		const message = dom.append(form, dom.$('div.ade-blueprint-validation', { id: generateUuid() }));
		const errorControls = this.pageListeners.add(new AdeControls());
		const showError = (error?: unknown, context: AdeErrorContext = 'validation') => errorControls.render(message, () => {
			dom.clearNode(message);
			if (error) { renderAdeErrorNotice(message, describeAdeError(error, context), errorControls); }
		});
		for (const event of ['input', 'change']) { this.pageListeners.add(dom.addDisposableListener(form, event, () => { showError(); field.control?.removeAttribute('aria-invalid'); })); }
		form.setAttribute('aria-describedby', message.id);
		showError(replayError);
		if (replayError) { field.control?.setAttribute('aria-invalid', 'true'); }
		const next = this.button(this.footer, localize('ade.blueprint.wizard.next', "Next"), () => form.requestSubmit(), true);
		next.disabled = !!field.empty;
		this.saveDraft = () => {
			const answer = field.read();
			if (answer.kind === 'pick' && JSON.stringify(previous?.answer) !== JSON.stringify(answer)) { this.steps.length = index; this.reviewEdit = false; }
			this.steps[index] = { title, answer, summary: field.summary(answer) };
		};
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
					if (error) { showError(error); next.disabled = false; return; }
					if (answer.kind === 'pick' && JSON.stringify(previous?.answer) !== JSON.stringify(answer)) { this.steps.length = index; this.reviewEdit = false; }
					this.steps[index] = { title, answer, summary: field.summary(answer) };
					if (this.reviewEdit) { this.replayUntil = this.steps.length; this.reviewEdit = false; }
					resolve(answer);
				} catch (error) {
					if (version !== this.pageVersion) { return; }
					showError(error, 'edit'); next.disabled = false;
				}
			}));
		});
	}

	pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: WizardPickOptions<T> & { canPickMany: true }): Promise<T[] | undefined>;
	pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: WizardPickOptions<T> & { canPickMany: false }): Promise<T | undefined>;
	pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: Omit<WizardPickOptions<T>, 'canPickMany'>): Promise<T | undefined>;
	async pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: WizardPickOptions<T>): Promise<T | T[] | undefined> {
		const items = (await picks).filter((item): item is T => item.type !== 'separator');
		const active = await options?.activeItem;
		const create = items.findIndex(item => item.label === localize('ade.blueprint.new', "Create New"));
		const selectionRequired = !options?.canPickMany || options.requireSelection === true;
		const selected = options?.canPickMany ? items.flatMap((item, index) => item.picked ? [index] : []) : active ? [items.indexOf(active)] : create >= 0 ? [create] : [];
		const title = options?.title ?? localize('ade.blueprint.wizard.select', "Choose an Option");
		const answer = await this.step(title, options?.prompt ?? options?.placeHolder ?? (options?.canPickMany ? localize('ade.blueprint.wizard.many', "Select the items to include, then choose Next. You can leave all items unchecked.") : localize('ade.blueprint.wizard.one', "Select an option, then choose Next. Use Back to revisit a previous choice.")), { kind: 'pick', indices: selected }, (form, answer) => {
			if (!items.length) { dom.append(form, dom.$('p')).textContent = localize('ade.blueprint.wizard.empty', "No compatible items are available. Use Back to choose another option and add the required elements or definitions first."); }
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
				validate: async answer => selectionRequired && answer.kind === 'pick' && !answer.indices.length ? localize('ade.blueprint.wizard.selectionRequired', "Choose an option to continue.") : undefined,
				empty: !items.length && selectionRequired
			};
		}, async answer => answer.kind !== 'pick' || selectionRequired && !answer.indices.length || answer.indices.some(index => index < 0 || index >= items.length) ? localize('ade.blueprint.wizard.selectionRequired', "Choose an option to continue.") : undefined);
		if (answer.kind !== 'pick') { return; }
		return options?.canPickMany ? answer.indices.map(index => items[index]) : items[answer.indices[0]];
	}

	async input(options?: WizardInputOptions): Promise<string | undefined> {
		const validate = async (answer: Answer) => {
			const error = answer.kind === 'input' ? await options?.validateInput?.(answer.value) : undefined;
			return typeof error === 'string' ? error : error?.content;
		};
		const answer = await this.step(options?.title ?? localize('ade.blueprint.wizard.value', "Enter a Value"), options?.prompt ?? localize('ade.blueprint.wizard.inputHelp', "Complete this field, then choose Next. Your changes will be applied after the review."), { kind: 'input', value: options?.value ?? '' }, (form, answer) => {
			const label = dom.append(form, dom.$('label.ade-blueprint-field')); label.textContent = options?.title ?? '';
			const input = options?.multiline && !options.password ? dom.append(label, dom.$<HTMLTextAreaElement>('textarea', { rows: '5' })) : dom.append(label, dom.$<HTMLInputElement>('input', { type: options?.password ? 'password' : 'text' }));
			input.value = answer.kind === 'input' ? answer.value : ''; input.placeholder = options?.placeHolder ?? '';
			input.focus(); input.select();
			return {
				control: input,
				read: () => ({ kind: 'input', value: input.value }),
				summary: answer => options?.password ? '••••' : answer.kind === 'input' ? options?.summarize?.(answer.value) ?? (answer.value || localize('ade.blueprint.wizard.emptyValue', "Empty")) : '',
				validate: async answer => {
					const error = await validate(answer);
					input.setAttribute('aria-invalid', String(!!error));
					return error;
				}
			};
		}, validate);
		return answer.kind === 'input' ? answer.value : undefined;
	}

	protected review(): Promise<void> {
		const title = this.reviewLabels?.heading ?? (this.hasChooser ? localize('ade.blueprint.wizard.reviewTitle', "Review Your Blueprint Changes") : localize('ade.editing.wizard.reviewTitle', "Review Your Changes"));
		const help = this.reviewLabels?.help ?? localize('ade.blueprint.wizard.reviewHelp', "Check your choices before applying them. You can edit any step or cancel without changing the project.");
		this.page(2, title, help, this.steps.length - 1);
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
			this.button(this.footer, this.reviewLabels?.confirm ?? localize('ade.blueprint.wizard.apply', "Apply Changes"), () => resolve(), true);
		});
	}

	protected showMessage(title: string, message: string, error?: unknown): Promise<never> {
		this.page(1, title, error ? '' : message, this.cursor - 1);
		if (error) { renderAdeErrorNotice(this.content, describeAdeError(error, 'edit'), this.pageListeners.add(new AdeControls())); }
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
