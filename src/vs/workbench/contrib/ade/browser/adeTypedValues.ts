/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { type IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { type ModelField, type SemanticModelV4 } from '../common/modelTypes.js';
import { resolveValueType, type ModelValue } from '../common/modelValues.js';

type Dialogs = Pick<IQuickInputService, 'pick' | 'input'>;

/** Read ordinary typed values without requiring serialization syntax. */
export async function readAdeScalar(quick: Dialogs, primitive: 'string' | 'integer' | 'number' | 'boolean', title: string, current?: ModelValue): Promise<ModelValue | undefined> {
	if (primitive === 'boolean') {
		const choices = [{ label: localize('ade.criteria.true', "True"), value: true }, { label: localize('ade.criteria.false', "False"), value: false }];
		return (await quick.pick(choices, { title, activeItem: choices.find(choice => choice.value === current) }))?.value;
	}
	const value = await quick.input({ title, showConfirmButton: true, value: current === undefined || current === null ? '' : String(current), validateInput: async value => {
		if (primitive === 'integer' && (!/^-?\d+$/.test(value) || !Number.isSafeInteger(Number(value)))) { return localize('ade.criteria.integer', "Enter a safe integer."); }
		if (primitive === 'number' && (!value.trim() || !Number.isFinite(Number(value)))) { return localize('ade.criteria.number', "Enter a finite number."); }
		return undefined;
	} });
	return value === undefined ? undefined : primitive === 'string' ? value : Number(value);
}

/** Shared record, collection and scalar editor; negative cases are an explicit authoring choice. */
export function adeTypedValues(quick: Dialogs, model: SemanticModelV4, options: { negativeCases?: boolean } = {}) {
	const scalar = async (typeId: string, title: string, depth = 0, current?: ModelValue): Promise<ModelValue | undefined> => {
		if (depth > 16) { throw new Error(localize('ade.criteria.depth', "This Input Exceeds the Supported Depth.")); }
		const type = resolveValueType(model, typeId); if (!type) { return; }
		if (type.kind === 'enum') {
			const choices = type.values!.map(value => ({ label: value, value }));
			return (await quick.pick(choices, { title, activeItem: choices.find(choice => choice.value === current) }))?.value;
		}
		if (type.kind === 'record') { return fields(type.fields, depth + 1, current && typeof current === 'object' && !Array.isArray(current) ? current : undefined); }
		if (type.kind === 'collection') {
			const values: ModelValue[] = Array.isArray(current) ? structuredClone(current) : [];
			while (values.length <= 100) {
				const choices = [...values.map((value, index) => ({ label: localize('ade.criteria.item', "Item {0}", index + 1), index, action: 'edit' })), ...(values.length < 100 ? [{ label: localize('ade.criteria.add', "Add Item"), index: -1, action: 'add' }] : []), { label: localize('ade.criteria.done', "Finish Collection"), index: -1, action: 'finish' }];
				const choice = await quick.pick(choices, { title }); if (!choice) { return; }
				if (choice.action === 'finish') { return values; }
				if (choice.action === 'edit') {
					const edit = await quick.pick([{ label: localize('ade.criteria.editItem', "Edit Item"), value: 'edit' }, { label: localize('ade.criteria.removeItem', "Remove Item"), value: 'remove' }], { title: choice.label });
					if (!edit) { return; } if (edit.value === 'remove') { values.splice(choice.index, 1); continue; }
				}
				const value = await scalar(type.itemTypeId!, choice.action === 'edit' ? choice.label : title, depth + 1, choice.index < 0 ? undefined : values[choice.index]); if (value === undefined) { return; }
				if (choice.action === 'edit') { values[choice.index] = value; } else { values.push(value); }
			}
			return values;
		}
		return readAdeScalar(quick, type.primitive === 'integer' ? 'integer' : type.primitive === 'boolean' ? 'boolean' : 'string', title, current);
	};
	const fields = async (parameters: ModelField[], depth = 0, current?: Record<string, ModelValue>): Promise<Record<string, ModelValue> | undefined> => {
		const result: Record<string, ModelValue> = current ? structuredClone(current) : {};
		for (const field of parameters) {
			const nullable = field.nullable?.state === 'known' && field.nullable.value === true;
			if (field.required === false || nullable || options.negativeCases) {
				const choices = [{ label: localize('ade.criteria.value', "Value for {0}", field.name), value: 'set' }, ...(field.required === false || options.negativeCases ? [{ label: localize('ade.criteria.absent', "Absent"), value: 'absent' }] : []), ...(nullable || options.negativeCases ? [{ label: localize('ade.criteria.null', "Null"), value: 'null' }] : []), ...(options.negativeCases ? [{ label: localize('ade.criteria.differentType', "Different Value Type"), value: 'different' }] : [])];
				const previous = current ? !Object.hasOwn(current, field.id!) ? 'absent' : current[field.id!] === null ? 'null' : 'set' : 'set';
				const choice = await quick.pick(choices, { title: field.name, activeItem: choices.find(choice => choice.value === previous) }); if (!choice) { return; }
				if (choice.value === 'absent') { delete result[field.id!]; continue; }
				if (choice.value === 'null') { result[field.id!] = null; continue; }
				if (choice.value === 'different') {
					const kind = await quick.pick([{ label: localize('ade.criteria.text', "Text"), primitive: 'string' as const }, { label: localize('ade.criteria.numberType', "Number"), primitive: 'number' as const }, { label: localize('ade.criteria.booleanType', "True / False"), primitive: 'boolean' as const }], { title: field.name }); if (!kind) { return; }
					const value = await readAdeScalar(quick, kind.primitive, field.name); if (value === undefined) { return; } result[field.id!] = value; continue;
				}
			}
			const value = await scalar(field.typeId!, field.name, depth, current?.[field.id!]); if (value === undefined) { return; } result[field.id!] = value;
		}
		return result;
	};
	return { fields, scalar };
}
