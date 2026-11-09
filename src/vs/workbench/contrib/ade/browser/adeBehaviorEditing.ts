/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { hasKey } from '../../../../base/common/types.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { ModelBehavior, SemanticElement, SemanticModel } from '../common/semanticModel.js';

/** Collect one complete change on a detached contract. Escape never commits a partial entry. */
export async function editAdeBehavior(quickInput: IQuickInputService, model: SemanticModel, element: SemanticElement): Promise<ModelBehavior | undefined> {
	const behavior: ModelBehavior = structuredClone(element.behavior ?? {
		inputs: [], outputs: [], preconditions: [], postconditions: [], errors: [], permissions: [], acceptanceCriteria: []
	});
	const section = await quickInput.pick([
		{ label: localize('ade.behavior.inputs', "Inputs"), key: 'inputs' as const },
		{ label: localize('ade.behavior.outputs', "Outputs"), key: 'outputs' as const },
		{ label: localize('ade.behavior.preconditions', "Preconditions"), key: 'preconditions' as const },
		{ label: localize('ade.behavior.postconditions', "Postconditions"), key: 'postconditions' as const },
		{ label: localize('ade.behavior.errors', "Errors"), key: 'errors' as const }
	], { title: localize('ade.behavior.title', "Behavioral Contract: {0}", element.name) });
	if (!section) { return undefined; }
	const entries = behavior[section.key];
	const entry = await quickInput.pick([
		{ label: localize('ade.behavior.add', "Add Entry"), index: -1 },
		...entries.map((value, index) => ({
			label: typeof value === 'string' ? value : hasKey(value, { name: true }) ? value.name : value.code,
			description: typeof value === 'string' ? undefined : hasKey(value, { type: true }) ? value.type : value.description,
			index
		}))
	], { title: section.label });
	if (!entry) { return undefined; }
	const index = entry.index;
	if (index >= 0) {
		const action = await quickInput.pick([
			{ label: localize('ade.behavior.edit', "Edit Entry"), remove: false },
			{ label: localize('ade.behavior.remove', "Remove Entry"), remove: true }
		], { title: localize('ade.behavior.entry', "Contract Entry: {0}", entry.label) });
		if (!action) { return undefined; }
		if (action.remove) {
			if (section.key === 'errors') { checkErrorReferences(behavior.errors[index].code); }
			entries.splice(index, 1);
			return behavior;
		}
	}
	const text = (title: string, value?: string, validate?: (value: string) => string | undefined) => quickInput.input({
		title, value, validateInput: async value => !value.trim() ? localize('ade.behavior.requiredText', "Enter a value.") : validate?.(value.trim())
	});
	if (section.key === 'inputs' || section.key === 'outputs') {
		const fields = behavior[section.key];
		const current = fields[index];
		const name = await text(localize('ade.behavior.fieldName', "Field Name"), current?.name,
			value => fields.some((field, position) => position !== index && field.name === value) ? localize('ade.behavior.duplicateField', "A field with this name already exists.") : undefined);
		if (name === undefined) { return undefined; }
		const type = await text(localize('ade.behavior.fieldType', "Field Type"), current?.type);
		if (type === undefined) { return undefined; }
		const required = await quickInput.pick([
			{ label: localize('ade.behavior.required', "Required"), required: true },
			{ label: localize('ade.behavior.optional', "Optional"), required: false }
		], { title: localize('ade.behavior.presence', "Field Presence") });
		if (!required) { return undefined; }
		fields.splice(index < 0 ? fields.length : index, index < 0 ? 0 : 1, { ...(current?.id ? { id: current.id } : {}), ...(current?.typeId && current.type === type.trim() ? { typeId: current.typeId } : {}), ...(current?.nullable ? { nullable: current.nullable } : {}), name: name.trim(), type: type.trim(), required: required.required });
	} else if (section.key === 'errors') {
		const current = behavior.errors[index];
		const code = await text(localize('ade.behavior.errorCode', "Error Code"), current?.code, value => {
			if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(value)) { return localize('ade.behavior.invalidCode', "Start with a letter or digit; use letters, digits, underscores, dots, colons or hyphens."); }
			if (behavior.errors.some((error, position) => position !== index && error.code === value)) { return localize('ade.behavior.duplicateError', "An error with this code already exists."); }
			if (current && value !== current.code && references(current.code)) { return referencedError(current.code); }
			return undefined;
		});
		if (code === undefined) { return undefined; }
		const description = await text(localize('ade.behavior.errorDescription', "Error Description"), current?.description);
		if (description === undefined) { return undefined; }
		behavior.errors.splice(index < 0 ? behavior.errors.length : index, index < 0 ? 0 : 1, { code: code.trim(), description: description.trim() });
	} else {
		const conditions = behavior[section.key];
		const condition = await text(section.label, conditions[index]);
		if (condition === undefined) { return undefined; }
		conditions.splice(index < 0 ? conditions.length : index, index < 0 ? 0 : 1, condition.trim());
	}
	return behavior;

	function references(code: string): boolean {
		return model.semantics.relations.some(relation => relation.from === element.id && relation.errorCode === code);
	}
	function referencedError(code: string): string {
		return localize('ade.behavior.referencedError', "Error {0} is used by a relationship. Change or clear its error reference in Properties before renaming or removing this error.", code);
	}
	function checkErrorReferences(code: string): void {
		if (references(code)) { throw new Error(referencedError(code)); }
	}
}
