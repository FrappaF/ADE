import * as dom from '../../../../base/browser/dom.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { equals } from '../../../../base/common/objects.js';
import { hasKey } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { type SemanticModel, type SemanticModelV4 } from '../common/modelTypes.js';
import { applyVisualEdit, type VisualEdit } from '../common/visualEditing.js';
import { blueprintConnectionActivity } from './adeBlueprintConnectionForms.js';
import { blueprintDataActivity } from './adeBlueprintDataForms.js';
import { blueprintDecisionActivity } from './adeBlueprintDecisionForms.js';
import { adeBlueprintAreas, type BlueprintEditMode } from './adeBlueprintEditing.js';
import { type BlueprintActivity, type BlueprintActivityContext, BlueprintForm } from './adeBlueprintForm.js';
import { blueprintStructureActivity } from './adeBlueprintStructureForms.js';
import { describeAdeError } from './adeErrors.js';
import { type AdeProjectService } from './adeProjectService.js';

type BlueprintProject = Pick<AdeProjectService, 'model' | 'documentVersion' | 'modelUri' | 'activeView' | 'selectedId' | 'editable' | 'editBatch' | 'showDiagram'>;

interface DraftConfiguration {
	readonly key: string;
	readonly mode: BlueprintEditMode;
	readonly recordId?: string;
	readonly form: BlueprintForm;
	readonly label: string;
	readonly creating: boolean;
	touched: boolean;
}

interface BlueprintChange {
	readonly configuration: DraftConfiguration;
	readonly edits: readonly VisualEdit[];
	readonly error?: string;
}

const activities = adeBlueprintAreas.flatMap(area => area.modes);
const replayOrder: readonly BlueprintEditMode[] = [
	'scope', 'owner', 'membership', 'c4', 'c4Dependencies', 'c4Visibility', 'types', 'operations', 'interfaces',
	'integration', 'binding', 'ports', 'connections', 'transports', 'modules', 'mapping', 'assertion', 'decision',
];

function structuralModel(model: SemanticModel): SemanticModelV4 | undefined {
	return model.version === 4 || model.version === 5 ? model : undefined;
}

function changeRecordId(edit: VisualEdit): string | undefined {
	if (hasKey(edit, { entry: true }) && hasKey(edit.entry, { id: true }) && typeof edit.entry.id === 'string') {
		return edit.entry.id;
	}
	return edit.kind === 'c4View' ? edit.view.id : undefined;
}

/** A detached transaction keeps configurations editable while other activities have focus. */
class BlueprintDraft extends Disposable {
	readonly forms = this._register(new DisposableMap<string, BlueprintForm>());
	readonly configurations = new Map<string, DraftConfiguration>();
	readonly selections = new Map<BlueprintEditMode, string>();
	readonly rememberedForms = new Map<BlueprintEditMode, string>();
	working: SemanticModelV4;
	changes: readonly BlueprintChange[] = [];
	mode: BlueprintEditMode = 'c4';
	active?: DraftConfiguration;
	targetId?: string;
	viewId?: string;
	reviewing = false;
	applied = false;
	error?: string;

	constructor(public base: SemanticModelV4, public version: string) {
		super();
		this.working = base;
	}

	remove(configuration: DraftConfiguration): void {
		this.forms.deleteAndDispose(configuration.key);
		this.configurations.delete(configuration.key);
		if (this.rememberedForms.get(configuration.mode) === configuration.key) {
			this.rememberedForms.delete(configuration.mode);
		}
		if (this.active === configuration) {
			this.active = undefined;
		}
	}

	reset(model: SemanticModelV4, version: string): void {
		this.forms.clearAndDisposeAll();
		this.configurations.clear();
		this.rememberedForms.clear();
		this.active = undefined;
		this.base = this.working = model;
		this.version = version;
		this.changes = [];
		this.error = undefined;
		this.reviewing = false;
	}

	recalculate(): void {
		let working = this.base;
		const changes: BlueprintChange[] = [];
		const pending = Array.from(this.configurations.values()).filter(configuration => configuration.touched || configuration.creating);
		pending.sort((a, b) => replayOrder.indexOf(a.mode) - replayOrder.indexOf(b.mode));
		for (const configuration of pending) {
			const form = configuration.form;
			if (form.invalidField()) {
				changes.push({ configuration, edits: [], error: localize('ade.blueprint.completeConfiguration', "Complete the required fields in this configuration.") });
				continue;
			}
			try {
				const proposed = form.edits(working);
				const next = structuralModel(proposed.reduce((model, edit) => applyVisualEdit(model, edit), working as SemanticModel))!;
				if (!equals(working, next)) {
					changes.push({ configuration, edits: proposed });
					working = next;
				} else if (configuration.creating) {
					changes.push({ configuration, edits: [], error: localize('ade.blueprint.finishCreation', "Complete this configuration or cancel its creation.") });
				}
			} catch (error) {
				changes.push({ configuration, edits: [], error: describeAdeError(error, 'validation', working).cause });
			}
		}
		this.working = working;
		this.changes = changes;
	}
}

/** Persistent workspace for the structural model. Applying a draft never changes the active activity. */
export class AdeBlueprintEditor extends Disposable {
	private readonly root = dom.$('section.ade-blueprint-editor', { 'aria-label': localize('ade.blueprint.sidebar', "Structural Blueprint"), tabindex: '-1' });
	private readonly navigation = dom.append(this.root, dom.$('nav.ade-blueprint-activities', { 'aria-label': localize('ade.blueprint.activities', "Blueprint Activities") }));
	private readonly main = dom.append(this.root, dom.$('div.ade-blueprint-main'));
	private readonly sheet = dom.append(this.main, dom.$('div.ade-blueprint-sheet'));
	private readonly review = dom.append(this.main, dom.$('section.ade-blueprint-review', { 'aria-label': localize('ade.blueprint.reviewDraft', "Review Draft") }));
	private readonly footer = dom.append(this.root, dom.$('footer.ade-blueprint-footer'));
	private readonly status = dom.append(this.footer, dom.$('span.ade-blueprint-status', { role: 'status' }));
	private readonly actions = dom.append(this.footer, dom.$('div.ade-blueprint-actions'));
	private readonly discardButton = this.button(this.actions, localize('ade.blueprint.discardDraft', "Discard Draft"), () => this.discard(), this._store);
	private readonly reviewButton = this.button(this.actions, localize('ade.blueprint.reviewButton', "Review"), () => this.toggleReview(), this._store);
	private readonly applyButton = this.button(this.actions, localize('ade.blueprint.applyToModel', "Apply to Model"), () => this.apply(), this._store);
	private readonly sheets = this._register(new DisposableStore());
	private readonly reviewListeners = this._register(new DisposableStore());
	private readonly sessions = this._register(new DisposableMap<string, BlueprintDraft>());
	private session?: BlueprintDraft;
	private applying = false;
	private expanded?: string;
	private rendered?: DraftConfiguration;
	private caption?: HTMLElement;
	private heading?: HTMLElement;
	private reviewHeading?: HTMLElement;
	private recordSelect?: HTMLSelectElement;
	private readonly areaControls: { label: string; toggle: HTMLButtonElement; list: HTMLElement }[] = [];

	constructor(private readonly project: BlueprintProject, private readonly openDiagram = (id: string) => project.showDiagram(id)) {
		super();
		this.applyButton.classList.add('ade-primary-action');
	}

	open(id?: string, mode?: BlueprintEditMode): void {
		const session = this.sync();
		if (!session) { return; }
		const target = id ?? this.project.selectedId;
		session.targetId = target;
		session.viewId = this.project.activeView?.id ?? session.viewId;
		const contextual = mode ?? (id ? this.activityForId(session.working, id) : undefined);
		this.show(contextual ?? session.mode, contextual ? id : undefined, contextual !== undefined);
	}

	render(parent: HTMLElement): void {
		if (this.root.parentElement !== parent) {
			parent.append(this.root);
		}
		if (this.applying) { return; }
		const session = this.sync();
		if (!session) {
			this.renderUnavailable();
		} else if (!session.active || this.rendered !== session.active) {
			this.show(session.mode);
		} else {
			this.renderStatus(session);
		}
	}

	focus(): void {
		(this.heading ?? this.root).focus({ preventScroll: true });
	}

	private sync(): BlueprintDraft | undefined {
		const model = structuralModel(this.project.model);
		if (!model) {
			this.session = undefined;
			return;
		}
		const key = `${this.project.modelUri?.toString() ?? ''}:${model.id}`;
		let session = this.sessions.get(key);
		if (!session) {
			session = new BlueprintDraft(model, this.project.documentVersion);
			this.sessions.set(key, session);
		}
		if (this.session !== session) {
			this.expanded = undefined;
			this.rendered = undefined;
		}
		this.session = session;
		if (!session.changes.length && session.version !== this.project.documentVersion) {
			session.reset(model, this.project.documentVersion);
			session.applied = false;
		}
		return session;
	}

	private context(session: BlueprintDraft): BlueprintActivityContext {
		return {
			get model() { return session.working; },
			targetId: session.targetId,
			get activeView() { return session.working.views.find(view => view.id === session.viewId); },
			open: (mode, id) => {
				this.show(mode, id, id !== undefined);
				this.focus();
			}
		};
	}

	private activity(mode: BlueprintEditMode, session: BlueprintDraft): BlueprintActivity {
		const context = this.context(session);
		return (blueprintStructureActivity(mode, context) ?? blueprintDataActivity(mode, context) ?? blueprintConnectionActivity(mode, context) ?? blueprintDecisionActivity(mode, context))!;
	}

	private activityForId(model: SemanticModelV4, id: string): BlueprintEditMode | undefined {
		if (model.views.some(view => view.id === id)) { return 'c4'; }
		if (model.foundation.types.some(type => type.id === id || type.fields.some(field => field.id === id))) { return 'types'; }
		if (model.foundation.blueprint?.operations.some(operation => operation.id === id)) { return 'operations'; }
		if (model.foundation.decisions.some(decision => decision.id === id)) { return 'decision'; }
		return model.semantics.elements.some(element => element.id === id) ? 'scope' : undefined;
	}

	private show(mode: BlueprintEditMode, id?: string, contextual = false, configuration?: DraftConfiguration): void {
		const session = this.session;
		if (!session) { return; }
		const previous = session.active;
		if (id !== undefined && contextual) { session.targetId = id; }
		const activity = this.activity(mode, session);
		const choices = activity.records;
		const contains = (candidate?: string) => choices.some(choice => choice.id === candidate);
		const remembered = session.rememberedForms.get(mode);
		const recordId = (contains(id) ? id : undefined) ?? (contextual ? activity.initialId : session.selections.get(mode)) ?? activity.initialId;
		const chosen = contains(recordId) ? recordId : choices[0]?.id;
		session.mode = mode;
		session.active = configuration ?? (!contextual && id === undefined && remembered ? session.configurations.get(remembered) : undefined)
			?? (chosen ? this.configuration(session, mode, activity, chosen) : undefined);
		session.active?.form.refresh();
		if (session.active?.creating || session.active?.touched) { session.recalculate(); }
		if (session.active) {
			session.rememberedForms.set(mode, session.active.key);
		} else {
			session.rememberedForms.delete(mode);
		}
		if (chosen && !session.active?.creating) { session.selections.set(mode, chosen); }
		if (previous && previous !== session.active && !session.changes.some(change => change.configuration === previous)) {
			session.remove(previous);
		}
		this.expanded = adeBlueprintAreas.find(area => area.modes.some(item => item.value === mode))?.label;
		this.renderSheet(session, this.activity(mode, session));
	}

	private configuration(session: BlueprintDraft, mode: BlueprintEditMode, activity: BlueprintActivity, recordId?: string): DraftConfiguration {
		if (recordId) {
			const existing = Array.from(session.configurations.values()).find(configuration => configuration.mode === mode && (configuration.recordId ?? configuration.form.newId) === recordId);
			if (existing) { return existing; }
		}
		const info = activities.find(item => item.value === mode)!;
		const form = new BlueprintForm(this.context(session), () => {
			configuration.touched = true;
			session.error = undefined;
			session.recalculate();
			if (this.session === session) { this.renderStatus(session); }
		});
		const configuration: DraftConfiguration = {
			key: form.newId, mode, recordId, form, creating: recordId === undefined, touched: false,
			label: activity.records.find(option => option.id === recordId)?.label ?? activity.createLabel ?? info.label
		};
		session.forms.set(configuration.key, form);
		session.configurations.set(configuration.key, configuration);
		try {
			activity.render(form, recordId);
		} catch (error) {
			session.remove(configuration);
			throw error;
		}
		return configuration;
	}

	private startCreation(session: BlueprintDraft): void {
		const activity = this.activity(session.mode, session);
		const configuration = this.configuration(session, session.mode, activity);
		session.recalculate();
		this.show(session.mode, undefined, false, configuration);
		if (!configuration.form.focusFirstField()) { this.focus(); }
	}

	private renderUnavailable(): void {
		this.sheets.clear();
		this.reviewListeners.clear();
		dom.clearNode(this.navigation);
		dom.clearNode(this.sheet);
		this.heading = dom.append(this.sheet, dom.$('h2', { tabindex: '-1' }));
		this.heading.textContent = localize('ade.blueprint.sidebar', "Structural Blueprint");
		dom.append(this.sheet, dom.$('p')).textContent = localize('ade.blueprint.upgrade', "Upgrade the model to version 4 to edit its blueprint.");
		this.review.hidden = true;
		this.footer.hidden = true;
	}

	private renderSheet(session: BlueprintDraft, activity: BlueprintActivity): void {
		this.sheets.clear();
		this.rendered = session.active;
		this.renderNavigation(session);
		dom.clearNode(this.sheet);
		const info = activities.find(item => item.value === session.mode)!;
		const header = dom.append(this.sheet, dom.$('header.ade-blueprint-heading'));
		dom.append(header, dom.$('p.ade-blueprint-path')).textContent = this.expanded ?? '';
		const title = dom.append(header, dom.$('div.ade-blueprint-title'));
		this.heading = dom.append(title, dom.$('h2', { tabindex: '-1' }));
		this.heading.textContent = info.label;
		if (activity.createLabel && this.project.editable) {
			const add = this.button(title, activity.createLabel, () => this.startCreation(session), this.sheets);
			add.classList.add('ade-primary-action');
		}
		dom.append(header, dom.$('p.ade-blueprint-note')).textContent = info.description;

		const records = this.records(session, activity);
		this.recordSelect = undefined;
		if (records.length > 0) {
			const row = dom.append(this.sheet, dom.$('div.ade-blueprint-record'));
			const field = dom.append(row, dom.$('label.ade-blueprint-field'));
			dom.append(field, dom.$('span')).textContent = localize('ade.blueprint.configuration', "Configuration");
			const select = dom.append(field, dom.$<HTMLSelectElement>('select'));
			this.recordSelect = select;
			for (const entry of records) {
				dom.append(select, dom.$('option', { value: entry.id })).textContent = entry.label;
			}
			select.value = session.active?.recordId ?? session.active?.key ?? '';
			this.sheets.add(dom.addDisposableListener(select, 'change', () => {
				const pending = session.configurations.get(select.value);
				this.show(session.mode, pending ? undefined : select.value, false, pending);
				this.recordSelect?.focus({ preventScroll: true });
			}));
		}
		if (session.active) {
			const configuration = session.active;
			const recordTitle = dom.append(this.sheet, dom.$('div.ade-blueprint-record-title'));
			this.caption = dom.append(recordTitle, dom.$('h3'));
			if (configuration.creating) {
				this.button(recordTitle, localize('ade.blueprint.cancelCreation', "Cancel Creation"), () => {
					session.remove(configuration);
					session.recalculate();
					this.show(configuration.mode);
					this.focus();
				}, this.sheets);
			} else if (['c4', 'c4Visibility', 'c4Dependencies'].includes(configuration.mode) && configuration.recordId && this.project.model.views.some(view => view.id === configuration.recordId)) {
				const id = configuration.recordId;
				this.button(recordTitle, localize('ade.blueprint.openDiagram', "Open Diagram"), () => this.openDiagram(id), this.sheets);
			}
			this.sheet.append(configuration.form.element);
		} else {
			this.caption = undefined;
			dom.append(this.sheet, dom.$('p.ade-blueprint-empty')).textContent = activity.createLabel
				? localize('ade.blueprint.noConfigurationsCreate', "No configurations yet. Use {0} to start one.", activity.createLabel)
				: localize('ade.blueprint.noConfigurations', "There are no model objects available for this activity.");
		}
		this.renderStatus(session);
	}

	private records(session: BlueprintDraft, activity: BlueprintActivity): readonly { id: string; label: string }[] {
		const pending = Array.from(session.configurations.values()).filter(configuration => configuration.mode === session.mode && configuration.creating);
		return [
			...activity.records.filter(option => !pending.some(configuration => configuration.form.newId === option.id)).map(option => ({
				id: option.id,
				label: option.description ? localize('ade.blueprint.recordDetail', "{0} · {1}", option.label, option.description) : option.label
			})),
			...pending.map(configuration => ({ id: configuration.key, label: localize('ade.blueprint.draftRecord', "{0} (Draft)", this.configurationLabel(session, configuration, activity)) }))
		];
	}

	private configurationLabel(session: BlueprintDraft, configuration: DraftConfiguration, activity = this.activity(configuration.mode, session)): string {
		const id = configuration.recordId ?? configuration.form.newId;
		return activity.records.find(record => record.id === id)?.label ?? configuration.label;
	}

	private renderNavigation(session: BlueprintDraft): void {
		dom.clearNode(this.navigation);
		this.areaControls.length = 0;
		for (const [index, area] of adeBlueprintAreas.entries()) {
			const group = dom.append(this.navigation, dom.$('section.ade-blueprint-area-nav'));
			const list = dom.$('div.ade-blueprint-activity-list', { id: `ade-blueprint-activities-${index}` });
			list.hidden = this.expanded !== area.label;
			const section = this.button(group, area.label, () => {
				this.expanded = list.hidden ? area.label : undefined;
				for (const { label, toggle, list: entries } of this.areaControls) {
					entries.hidden = label !== this.expanded;
					toggle.setAttribute('aria-expanded', String(!entries.hidden));
				}
			}, this.sheets);
			this.areaControls.push({ label: area.label, toggle: section, list });
			section.setAttribute('aria-expanded', String(!list.hidden));
			section.setAttribute('aria-controls', list.id);
			for (const activity of area.modes) {
				const button = this.button(list, activity.label, () => {
					this.show(activity.value);
					this.focus();
				}, this.sheets);
				button.setAttribute('aria-current', String(session.mode === activity.value));
			}
			group.append(list);
		}
	}

	private renderStatus(session: BlueprintDraft): void {
		const stale = session.version !== this.project.documentVersion;
		const count = session.changes.length;
		const incomplete = session.changes.some(change => !!change.error);
		const canApply = this.project.editable && !stale && count > 0 && !incomplete;
		this.footer.hidden = false;
		this.status.textContent = stale
			? localize('ade.blueprint.staleDraft', "The project changed. Your draft is still available to review. Discard it to work from the current model.")
			: session.error ?? (count === 0
				? session.applied && this.project.documentVersion === session.version
					? localize('ade.blueprint.modelUpdated', "Model Updated · Save the project to keep these changes.")
					: localize('ade.blueprint.noDraftChanges', "No changes in draft.")
				: incomplete
					? localize('ade.blueprint.draftIncomplete', "Review the draft to complete unfinished configurations.")
					: count === 1 ? localize('ade.blueprint.oneDraftConfiguration', "1 configuration in draft") : localize('ade.blueprint.draftConfigurations', "{0} configurations in draft", count));
		this.applyButton.setAttribute('aria-disabled', String(!canApply));
		this.discardButton.setAttribute('aria-disabled', String(!count));
		this.reviewButton.setAttribute('aria-disabled', String(!count));
		this.reviewButton.setAttribute('aria-expanded', String(session.reviewing && count > 0));
		if (this.caption && session.active) {
			this.caption.textContent = this.configurationLabel(session, session.active);
		}
		const options = this.recordSelect;
		if (options && session.active?.creating && options.selectedOptions[0]) {
			options.selectedOptions[0].textContent = localize('ade.blueprint.draftRecord', "{0} (Draft)", this.configurationLabel(session, session.active));
		}
		this.renderReview(session);
	}

	private toggleReview(): void {
		const session = this.session;
		if (!session?.changes.length) { return; }
		session.reviewing = !session.reviewing;
		this.renderStatus(session);
		if (session.reviewing) { this.reviewHeading?.focus(); }
	}

	private renderReview(session: BlueprintDraft): void {
		this.reviewListeners.clear();
		this.review.hidden = !session.reviewing || !session.changes.length;
		dom.clearNode(this.review);
		this.reviewHeading = undefined;
		if (this.review.hidden) { return; }
		this.reviewHeading = dom.append(this.review, dom.$('h3', { tabindex: '-1' }));
		this.reviewHeading.textContent = localize('ade.blueprint.reviewDraft', "Review Draft");
		const entries = dom.append(this.review, dom.$('ul'));
		for (const { configuration, error } of session.changes) {
			const item = dom.append(entries, dom.$('li'));
			this.button(item, this.configurationLabel(session, configuration), () => {
				this.show(configuration.mode, undefined, false, configuration);
				this.focusConfiguration(configuration);
			}, this.reviewListeners);
			if (error) {
				dom.append(item, dom.$('p.ade-blueprint-error')).textContent = error;
			}
			const changes = configuration.form.describeChanges();
			if (changes.length) {
				const list = dom.append(item, dom.$('ul'));
				for (const field of changes) {
					dom.append(list, dom.$('li')).textContent = localize('ade.blueprint.fieldChange', "{0}: {1} → {2}", field.label, field.before || '—', field.after || '—');
				}
			} else if (!error) {
				dom.append(item, dom.$('p')).textContent = configuration.creating ? localize('ade.blueprint.willCreate', "New configuration") : localize('ade.blueprint.willUpdate', "Configuration updated");
			}
		}
	}

	private focusConfiguration(configuration: DraftConfiguration): void {
		const field = configuration.form.invalidField();
		if (field) { configuration.form.focusField(field); } else { this.focus(); }
	}

	private discard(): void {
		const session = this.session;
		const model = structuralModel(this.project.model);
		if (!session?.changes.length || !model) { return; }
		const section = session.active?.form.activeSection;
		session.reset(model, this.project.documentVersion);
		session.applied = false;
		this.show(session.mode);
		this.restoreSection(session, section);
		this.focus();
	}

	private apply(): void {
		const session = this.session;
		if (!session || !this.project.editable || session.version !== this.project.documentVersion) { return; }
		session.recalculate();
		if (!session.changes.length || session.changes.some(change => !!change.error)) {
			this.renderStatus(session);
			return;
		}
		const active = session.active;
		const activeChanges = session.changes.find(change => change.configuration === active);
		const selected = active?.recordId ?? activeChanges?.edits.map(changeRecordId).find(id => !!id);
		const section = active?.form.activeSection;
		this.applying = true;
		try {
			this.project.editBatch(session.changes.flatMap(change => [...change.edits]));
			session.reset(structuralModel(this.project.model)!, this.project.documentVersion);
			session.applied = true;
			this.show(session.mode, selected, true);
			this.restoreSection(session, section);
			this.applyButton.focus({ preventScroll: true });
		} catch (error) {
			const details = describeAdeError(error, 'edit', session.working);
			session.error = localize('ade.blueprint.applyError', "{0} {1}", details.cause, details.resolution);
			session.reviewing = true;
			this.renderStatus(session);
		} finally {
			this.applying = false;
		}
	}

	private restoreSection(session: BlueprintDraft, section?: string): void {
		if (section) { session.active?.form.selectSection(section); }
	}

	private button(parent: HTMLElement, label: string, action: () => void, listeners: DisposableStore): HTMLButtonElement {
		const button = dom.append(parent, dom.$<HTMLButtonElement>('button', { type: 'button' }));
		button.textContent = label;
		listeners.add(dom.addDisposableListener(button, 'click', () => {
			if (button.getAttribute('aria-disabled') !== 'true') { action(); }
		}));
		return button;
	}
}
