import * as dom from '../../../../base/browser/dom.js';
import { localize } from '../../../../nls.js';
import { type ModelView, type SemanticModelV4 } from '../common/modelTypes.js';
import { type VisualEdit } from '../common/visualEditing.js';
import { adeBlueprintAreas, editAdeBlueprint, type BlueprintEditMode } from './adeBlueprintEditing.js';
import { AdeEditingWizard, WizardBack, WizardCanceled } from './adeEditingWizard.js';

/** Blueprint activity selection reuses the shared detached editing workflow. */
export class AdeBlueprintWizard extends AdeEditingWizard {
	constructor(parent: HTMLElement) { super(parent, localize('ade.blueprint.wizard.title', "Structural Blueprint"), true); }
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
					this.steps.length = this.cursor;
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
					try { await this.showMessage(localize('ade.blueprint.wizard.unavailable', "This Step Needs More Information"), error instanceof Error ? error.message : String(error), error); }
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

}
