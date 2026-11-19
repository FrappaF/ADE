/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { localize } from '../../../../nls.js';
import { diagramBudgetExtensionPresets, maximumDiagramExplorationBudget, minimumDiagramExplorationBudget, projectDiagramBudgetPresets, type DiagramExplorationBudget } from '../common/diagramExplorationBudget.js';
import { AdeFormDialog } from './adeFormDialog.js';

export type AdeDiagramBudgetFormOptions = { mode: 'default'; budget: DiagramExplorationBudget } | { mode: 'extension'; capacity: DiagramExplorationBudget };

interface BudgetField {
	key: keyof DiagramExplorationBudget;
	unit: number;
	control: HTMLInputElement;
	format(value: number): string;
}

function validateAmount(value: string, minimum: number, maximum: number): string | undefined {
	const text = value.trim();
	const amount = Number(text);
	if (!/^\d+$/.test(text) || !Number.isSafeInteger(amount) || amount < minimum || amount > maximum) {
		return localize('ade.diagram.budgetForm.amountRange', "Enter a whole number from {0} to {1}.", minimum, maximum);
	}
	return undefined;
}

/** Edits a detached default budget or an increase to a saved exploration. */
export class AdeDiagramBudgetForm extends AdeFormDialog {
	private readonly fields: readonly BudgetField[];
	private readonly extension: boolean;

	constructor(parent: HTMLElement, options: AdeDiagramBudgetFormOptions) {
		const extension = options.mode === 'extension';
		super(parent, extension ? {
			title: localize('ade.diagram.budgetForm.addTitle', "Add Exploration Budget"),
			description: localize('ade.diagram.budgetForm.addHelp', "Increase the budget for this exploration. Your saved drafts and evidence stay available."),
			confirmLabel: localize('ade.diagram.budgetForm.add', "Add Budget")
		} : {
			title: localize('ade.diagram.budgetForm.defaultTitle', "Default Exploration Budget"),
			description: localize('ade.diagram.budgetForm.defaultHelp', "These limits apply when you start a new diagram exploration."),
			confirmLabel: localize('ade.diagram.budgetForm.save', "Save Budget")
		});
		this.extension = extension;
		const standard = localize('ade.diagram.budgetForm.standard', "Standard");
		const large = localize('ade.diagram.budgetForm.large', "Large");
		const presets = extension ? [
			{ value: 'small', label: localize('ade.diagram.budgetForm.small', "Small"), budget: diagramBudgetExtensionPresets.small },
			{ value: 'standard', label: standard, budget: diagramBudgetExtensionPresets.standard },
			{ value: 'large', label: large, budget: diagramBudgetExtensionPresets.large }
		] : [
			{ value: 'compact', label: localize('ade.diagram.budgetForm.compact', "Compact"), budget: projectDiagramBudgetPresets.compact },
			{ value: 'standard', label: standard, budget: projectDiagramBudgetPresets.standard },
			{ value: 'large', label: large, budget: projectDiagramBudgetPresets.large }
		];
		const initial = extension ? diagramBudgetExtensionPresets.small : options.budget;
		const capacity = extension ? options.capacity : maximumDiagramExplorationBudget;
		const fieldSpecs: { key: keyof DiagramExplorationBudget; unit: number; label: string }[] = [
			{ key: 'maxToolCalls', unit: 1, label: extension ? localize('ade.diagram.budgetForm.addCalls', "Additional Local Tool Calls") : localize('ade.diagram.budgetForm.calls', "Local Tool Calls") },
			{ key: 'maxReadBytes', unit: 1024, label: extension ? localize('ade.diagram.budgetForm.addData', "Additional Retrieved Data (KiB)") : localize('ade.diagram.budgetForm.data', "Retrieved Data (KiB)") },
			{ key: 'maxDurationMs', unit: 60_000, label: extension ? localize('ade.diagram.budgetForm.addTime', "Additional Time (Minutes)") : localize('ade.diagram.budgetForm.time', "Exploration Time (Minutes)") },
			{ key: 'maxModelTurns', unit: 1, label: extension ? localize('ade.diagram.budgetForm.addTurns', "Additional Reported Request Turns") : localize('ade.diagram.budgetForm.turns', "Reported Request Turns") }
		];
		const initialPreset = extension ? 'small' : presets.find(preset => fieldSpecs.every(field => preset.budget[field.key] === initial[field.key]))?.value ?? 'custom';
		const picker = this.select(this.body, localize('ade.diagram.budgetForm.preset', "Budget Preset"), initialPreset, [...presets, { value: 'custom', label: localize('ade.diagram.budgetForm.custom', "Custom") }]);
		const grid = dom.append(this.body, dom.$('div.ade-form-grid'));
		this.fields = fieldSpecs.map(({ key, unit, label }) => {
			const minimum = extension ? 0 : Math.ceil(minimumDiagramExplorationBudget[key] / unit);
			const available = Number.isFinite(capacity[key]) ? capacity[key] : 0;
			const maximum = Math.max(0, Math.floor(Math.min(available, maximumDiagramExplorationBudget[key]) / unit));
			const format = (value: number) => String(Math.max(minimum, Math.min(maximum, Math.floor(value / unit))));
			const control = this.text(grid, label, format(initial[key]), { required: true, validate: value => validateAmount(value, minimum, maximum) });
			control.inputMode = 'numeric';
			return { key, unit, control, format };
		});
		this._register(dom.addDisposableListener(picker, 'change', () => {
			const preset = presets.find(preset => preset.value === picker.value);
			if (!preset) { return; }
			for (const field of this.fields) {
				field.control.value = field.format(preset.budget[field.key]);
				// Refresh the field's validation without reporting a manual edit to the preset selector.
				field.control.dispatchEvent(new Event('input'));
			}
		}));
		this._register(dom.addDisposableListener(this.body, 'input', event => {
			if (this.fields.some(field => field.control === event.target)) { picker.value = 'custom'; }
		}));
	}

	edit(): Promise<DiagramExplorationBudget | undefined> {
		return this.open(() => {
			const budget: DiagramExplorationBudget = { maxToolCalls: 0, maxReadBytes: 0, maxDurationMs: 0, maxModelTurns: 0 };
			for (const field of this.fields) { budget[field.key] = Number(field.control.value.trim()) * field.unit; }
			return budget;
		}, budget => this.extension && !Object.values(budget).some(amount => amount > 0) ? localize('ade.diagram.budgetForm.nonzero', "Increase at least one limit.") : undefined);
	}
}
