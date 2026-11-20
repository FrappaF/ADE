import * as dom from '../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { ElementDetails, RelationDetails, SemanticElement, SemanticRelation } from '../common/modelTypes.js';
import { AdeFormDialog } from './adeFormDialog.js';

/** Edit technology and all declarations together, committing only a complete, validated draft. */
export async function editAdeElementNotation(parent: HTMLElement, element: SemanticElement, version: 2 | 3 | 4 | 5 = 3): Promise<ElementDetails | undefined> {
	const details = structuredClone(element.details ?? { technology: '', environment: '', members: [] });
	const dialog = new AdeFormDialog(parent, {
		title: localize('ade.notation.title', "Attributes and Technology · {0}", element.name),
		description: localize('ade.notation.help', "Edit technology, environment and members together. Changes are applied only when you save.")
	});
	const listeners = new DisposableStore();
	try {
		const technology = dialog.text(dialog.body, localize('ade.notation.technology', "Technology"), details.technology);
		const environment = dialog.text(dialog.body, localize('ade.notation.environment', "Environment"), details.environment);
		const section = dom.append(dialog.body, dom.$('section.ade-form-members'));
		dom.append(section, dom.$('h3')).textContent = localize('ade.notation.members', "Attributes and Methods");
		const empty = dom.append(section, dom.$('p.ade-form-hint'));
		empty.textContent = localize('ade.notation.empty', "No members yet. Add an attribute or method below.");
		const list = dom.append(section, dom.$('div.ade-form-member-list'));
		const rows: { read: () => ElementDetails['members'][number]; focus: () => void }[] = [];
		const add = (member: ElementDetails['members'][number], focus = false) => {
			const card = dom.append(list, dom.$<HTMLFieldSetElement>('fieldset.ade-form-member'));
			const legend = dom.append(card, dom.$('legend'));
			legend.textContent = member.name || (member.kind === 'method' ? localize('ade.notation.newMethod', "New Method") : localize('ade.notation.newAttribute', "New Attribute"));
			const fields = dom.append(card, dom.$('div.ade-form-grid'));
			const kind = dialog.select(fields, localize('ade.notation.memberKind', "Member Kind"), member.kind, [
				{ label: localize('ade.notation.attribute', "Attribute / Column"), value: 'attribute' },
				...(element.kind === 'table' ? [] : [{ label: localize('ade.notation.method', "Method"), value: 'method' }])
			]);
			const name = dialog.text(fields, localize('ade.notation.memberName', "Member Name"), member.name, { required: true, validate: value => {
				const duplicate = rows.some(row => row !== entry && row.read().kind === kind.value && row.read().name === value.trim() && (kind.value === 'attribute' || row.read().type === type.value.trim()));
				return duplicate ? localize('ade.notation.uniqueMember', "Attribute names and method signatures must be unique.") : undefined;
			} });
			const type = dialog.text(fields, localize('ade.notation.memberType', "Type or Method Signature"), member.type);
			const key = dialog.select(fields, localize('ade.notation.keyKind', "Key Kind"), member.key, [
				{ label: localize('ade.notation.noKey', "No Key"), value: 'none' },
				{ label: localize('ade.notation.pk', "Primary Key"), value: 'primary' },
				{ label: localize('ade.notation.fk', "Foreign Key"), value: 'foreign' },
				{ label: localize('ade.notation.unique', "Unique Key"), value: 'unique' }
			]);
			const required = dialog.checkbox(fields, version >= 4 ? localize('ade.notation.presence', "Required Field") : localize('ade.notation.required', "Required / Not Null"), member.required);
			const nullable = version >= 4 ? dialog.select(fields, localize('ade.notation.nullability', "Nullability (Independent of Presence)"), member.nullable?.state === 'known' ? String(member.nullable.value) : 'unknown', [
				{ label: localize('ade.notation.nullUnknown', "Not Specified"), value: 'unknown' },
				{ label: localize('ade.notation.notNull', "Non-null Value"), value: 'false' },
				{ label: localize('ade.notation.null', "Null Allowed"), value: 'true' }
			]) : undefined;
			const updateKind = () => { key.disabled = kind.value === 'method'; };
			listeners.add(dom.addDisposableListener(kind, 'change', updateKind)); updateKind();
			listeners.add(dom.addDisposableListener(name, 'input', () => { legend.textContent = name.value.trim() || localize('ade.notation.unnamed', "Unnamed Member"); }));
			const entry = { focus: () => name.focus(), read: (): ElementDetails['members'][number] => ({
				...(member.id ? { id: member.id } : {}),
				...(member.typeId && member.type === type.value.trim() ? { typeId: member.typeId } : {}),
				...(nullable && nullable.value !== 'unknown' ? { nullable: { state: 'known' as const, value: nullable.value === 'true' } } : member.nullable?.state === 'unknown' ? { nullable: member.nullable } : !nullable && member.nullable ? { nullable: member.nullable } : {}),
				name: name.value.trim(), type: type.value.trim(), kind: kind.value as 'attribute' | 'method',
				key: kind.value === 'method' ? 'none' : key.value as 'none' | 'primary' | 'foreign' | 'unique', required: required.checked
			}) };
			rows.push(entry); empty.hidden = true;
			dialog.button(card, localize('ade.notation.removeMember', "Remove Member"), () => {
				const index = rows.indexOf(entry);
				const next = rows[index + 1] ?? rows[index - 1];
				rows.splice(index, 1); card.remove(); empty.hidden = rows.length > 0;
				if (next) { next.focus(); } else { addAttribute.focus(); }
			});
			if (focus) { name.focus(); }
		};
		for (const member of details.members) { add(member); }
		const actions = dom.append(section, dom.$('div.ade-form-actions'));
		const addAttribute = dialog.button(actions, localize('ade.notation.addAttribute', "Add Attribute"), () => add({ name: '', type: '', kind: 'attribute', key: 'none', required: true }, true));
		if (element.kind !== 'table') { dialog.button(actions, localize('ade.notation.addMethod', "Add Method"), () => add({ name: '', type: '', kind: 'method', key: 'none', required: true }, true)); }
		return await dialog.open(() => ({ technology: technology.value.trim(), environment: environment.value.trim(), members: rows.map(row => row.read()) }));
	} finally { listeners.dispose(); dialog.dispose(); }
}

/** Relationship annotations share one form, so both endpoints remain visible while editing. */
export async function editAdeRelationNotation(parent: HTMLElement, relation: SemanticRelation): Promise<RelationDetails | undefined> {
	const details = structuredClone(relation.details ?? { sourceMultiplicity: '', targetMultiplicity: '', sourceMember: '', targetMember: '', protocol: '' });
	const dialog = new AdeFormDialog(parent, { title: localize('ade.notation.relationTitle', "Relationship Details · {0}", relation.name) });
	try {
		const fields = [
			['sourceMultiplicity', localize('ade.notation.sourceMultiplicity', "Source Multiplicity")],
			['targetMultiplicity', localize('ade.notation.targetMultiplicity', "Target Multiplicity")],
			['sourceMember', localize('ade.notation.sourceColumn', "Source Attribute / Column")],
			['targetMember', localize('ade.notation.targetColumn', "Target Attribute / Column")],
			['protocol', localize('ade.notation.protocol', "Protocol / Transport")]
		] as const;
		const controls = fields.map(([key, label]) => ({ key, input: dialog.text(dialog.body, label, details[key], {
			...(key.endsWith('Multiplicity') ? { placeholder: '1, 0..1, 0..*, 1..*', validate: (value: string) => value.trim() && !/^(?:\*|\d+(?:\.\.(?:\d+|\*))?)$/.test(value.trim()) ? localize('ade.notation.invalidMultiplicity', "Enter a multiplicity such as 1, 0..1 or 0..*, or leave it empty.") : undefined } : {})
		}) }));
		return await dialog.open(() => { for (const { key, input } of controls) { details[key] = input.value.trim(); } return details; });
	} finally { dialog.dispose(); }
}
