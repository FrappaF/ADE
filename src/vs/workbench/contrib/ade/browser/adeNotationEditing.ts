/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { ElementDetails, RelationDetails, SemanticElement, SemanticRelation } from '../common/semanticModel.js';

/** Dialogs edit a detached declaration; Cancel never commits a partial member. */
export async function editAdeElementNotation(quick: IQuickInputService, element: SemanticElement, version: 2 | 3 | 4 | 5 = 3): Promise<ElementDetails | undefined> {
	const details = structuredClone(element.details ?? { technology: '', environment: '', members: [] });
	const choice = await quick.pick([
		{ label: localize('ade.notation.technology', "Technology"), kind: 'technology' as const },
		{ label: localize('ade.notation.environment', "Environment"), kind: 'environment' as const },
		{ label: localize('ade.notation.addMember', "Add Attribute or Method"), kind: 'member' as const },
		...details.members.map((member, index) => ({ label: member.name, description: member.type, kind: 'existing' as const, index }))
	], { title: element.name });
	if (!choice) { return; }
	if (choice.kind === 'technology' || choice.kind === 'environment') {
		const value = await quick.input({ title: choice.label, value: details[choice.kind] });
		if (value === undefined) { return; } details[choice.kind] = value; return details;
	}
	const existing = choice.kind === 'existing' ? details.members[choice.index] : undefined;
	if (existing) {
		const action = await quick.pick([{ label: localize('ade.notation.editMember', "Edit Member"), remove: false }, { label: localize('ade.notation.removeMember', "Remove Member"), remove: true }], { title: existing.name });
		if (!action) { return; }
		if (action.remove) { details.members.splice(choice.kind === 'existing' ? choice.index : -1, 1); return details; }
	}
	const kind = await quick.pick([{ label: localize('ade.notation.attribute', "Attribute / Column"), value: 'attribute' as const }, { label: localize('ade.notation.method', "Method"), value: 'method' as const }].filter(option => element.kind !== 'table' || option.value === 'attribute'), { title: localize('ade.notation.memberKind', "Member Kind") });
	if (!kind) { return; }
	const name = await quick.input({ title: localize('ade.notation.memberName', "Member Name"), value: existing?.name, validateInput: async value => !value.trim() || kind.value === 'attribute' && details.members.some(member => member !== existing && member.kind === 'attribute' && member.name === value) ? localize('ade.notation.uniqueMember', "Enter a nonempty name; attribute names must be unique.") : undefined });
	if (name === undefined) { return; }
	const type = await quick.input({ title: localize('ade.notation.memberType', "Type or Method Signature (Empty if Unknown)"), value: existing?.type,
		validateInput: async value => kind.value === 'method' && details.members.some(member => member !== existing && member.kind === 'method' && member.name === name && member.type === value) ? localize('ade.notation.uniqueSignature', "This method signature already exists.") : undefined });
	if (type === undefined) { return; }
	const key = kind.value === 'method' ? { value: 'none' as const } : await quick.pick([{ label: localize('ade.notation.noKey', "No Key"), value: 'none' as const }, { label: localize('ade.notation.pk', "Primary Key"), value: 'primary' as const }, { label: localize('ade.notation.fk', "Foreign Key"), value: 'foreign' as const }, { label: localize('ade.notation.unique', "Unique Key"), value: 'unique' as const }], { title: localize('ade.notation.keyKind', "Key Kind") });
	if (!key) { return; }
	const required = await quick.pick([{ label: (version === 4 || version === 5) ? localize('ade.blueprint.requiredField', "Required") : localize('ade.notation.required', "Required / Not Null"), value: true }, { label: (version === 4 || version === 5) ? localize('ade.blueprint.optionalField', "Optional") : localize('ade.notation.optional', "Optional / Nullable"), value: false }], { title: (version === 4 || version === 5) ? localize('ade.blueprint.presence', "Field Presence") : localize('ade.notation.nullability', "Nullability") });
	if (!required) { return; }
	const nullability = (version === 4 || version === 5) ? await quick.pick([{ label: localize('ade.blueprint.notNull', "Non-null Value"), value: false }, { label: localize('ade.blueprint.null', "Null Allowed"), value: true }], { title: localize('ade.blueprint.nullable', "Nullability (Independent of Presence)") }) : undefined;
	if ((version === 4 || version === 5) && !nullability) { return; }
	const member = { ...(existing?.id ? { id: existing.id } : {}), ...(existing?.typeId && existing.type === type ? { typeId: existing.typeId } : {}), ...(nullability ? { nullable: { state: 'known' as const, value: nullability.value } } : existing?.nullable ? { nullable: existing.nullable } : {}), name, type, kind: kind.value, key: key.value, required: required.value };
	if (choice.kind === 'existing') { details.members[choice.index] = member; } else { details.members.push(member); }
	return details;
}

export async function editAdeRelationNotation(quick: IQuickInputService, relation: SemanticRelation): Promise<RelationDetails | undefined> {
	const details = structuredClone(relation.details ?? { sourceMultiplicity: '', targetMultiplicity: '', sourceMember: '', targetMember: '', protocol: '' });
	for (const [key, title] of [
		['sourceMultiplicity', localize('ade.notation.sourceMultiplicity', "Source Multiplicity (e.g. 1, 0..1, 0..*, 1..*)")],
		['targetMultiplicity', localize('ade.notation.targetMultiplicity', "Target Multiplicity (e.g. 1, 0..1, 0..*, 1..*)")],
		['sourceMember', localize('ade.notation.sourceColumn', "Source Attribute / Column (Empty if Unknown)")],
		['targetMember', localize('ade.notation.targetColumn', "Target Attribute / Column (Empty if Unknown)")],
		['protocol', localize('ade.notation.protocol', "Protocol / Transport (Empty if Unknown)")]
	] as const) {
		const value = await quick.input({ title, value: details[key], validateInput: async value => key.endsWith('Multiplicity') && value !== '' && !/^(?:\*|\d+(?:\.\.(?:\d+|\*))?)$/.test(value) ? localize('ade.notation.invalidMultiplicity', "Enter a multiplicity such as 1, 0..1 or 0..*, or leave it empty.") : undefined });
		if (value === undefined) { return; } details[key] = value;
	}
	return details;
}
