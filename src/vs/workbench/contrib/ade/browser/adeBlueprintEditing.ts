/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { pickAdeFormAction } from './adeFormActions.js';
import { getContractProjection } from '../common/modelBlueprint.js';
import { localize } from '../../../../nls.js';
import { arrangeDiagram } from '../common/diagramLayout.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { equals } from '../../../../base/common/objects.js';
import { hasKey } from '../../../../base/common/types.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { emptyBlueprint, modelObjects } from '../common/modelFoundation.js';
import { type DecisionConstraint, type Knowledge, type ModelBlueprint, type ModelDecision, type ModelField, type ModelOperation, type ModelReference, type ModelType, type ModelView, type SemanticElement, type SemanticModelV4 } from '../common/modelTypes.js';
import { type VisualEdit } from '../common/visualEditing.js';
import { isValidModelOwnership } from '../common/modelValidation.js';

export type BlueprintEditMode = 'c4' | 'scope' | 'owner' | 'membership' | 'integration' | 'binding' | 'types' | 'operations' | 'interfaces' | 'ports' | 'connections' | 'transports' | 'modules' | 'mapping' | 'assertion' | 'decision';

/** Shared navigation and guidance for the command and the blueprint wizard. */
export const adeBlueprintAreas: { label: string; modes: { label: string; value: BlueprintEditMode; description: string }[] }[] = [
	{ label: localize('ade.blueprint.area.structure', "Structure"), modes: [
		{ label: localize('ade.blueprint.c4', "C4 View Subject and Context"), value: 'c4', description: localize('ade.blueprint.c4.help', "Create or update a C4 view. Choose its level, subject and visible elements.") },
		{ label: localize('ade.blueprint.scope', "System Scope or Container Responsibility"), value: 'scope', description: localize('ade.blueprint.scope.help', "Define a system boundary or describe what a container is responsible for.") },
		{ label: localize('ade.blueprint.owner', "Architectural or Lifecycle Owner"), value: 'owner', description: localize('ade.blueprint.owner.help', "Place an element inside its architectural owner or assign a lifecycle owner.") },
		{ label: localize('ade.blueprint.membership', "Feature Memberships"), value: 'membership', description: localize('ade.blueprint.membership.help', "Choose the features an element contributes to.") }
	] },
	{ label: localize('ade.blueprint.area.data', "Data and Operations"), modes: [
		{ label: localize('ade.blueprint.types', "Shared Types"), value: 'types', description: localize('ade.blueprint.types.help', "Define reusable data: primitives, records, enumerations, collections and references.") },
		{ label: localize('ade.blueprint.operations', "Shared Operations"), value: 'operations', description: localize('ade.blueprint.operations.help', "Create an operation or edit its inputs, results, errors and acceptance criteria.") },
		{ label: localize('ade.blueprint.interfaces', "Interfaces and Invariants"), value: 'interfaces', description: localize('ade.blueprint.interfaces.help', "Version an existing interface or contract and choose its declared operations.") }
	] },
	{ label: localize('ade.blueprint.area.connections', "Connections"), modes: [
		{ label: localize('ade.blueprint.integration', "External Integration"), value: 'integration', description: localize('ade.blueprint.integration.help', "Declare which external system an element depends on.") },
		{ label: localize('ade.blueprint.ports', "Provided or Required Interface"), value: 'ports', description: localize('ade.blueprint.ports.help', "Attach an existing interface to a provider or consumer.") },
		{ label: localize('ade.blueprint.connections', "Interface Connection"), value: 'connections', description: localize('ade.blueprint.connections.help', "Connect required and provided interfaces and map their operations.") },
		{ label: localize('ade.blueprint.transports', "Transport Contract"), value: 'transports', description: localize('ade.blueprint.transports.help', "Describe the protocol and payload of an existing relationship. Declare its schema type first.") }
	] },
	{ label: localize('ade.blueprint.area.technology', "Technology"), modes: [
		{ label: localize('ade.blueprint.binding', "Platform Binding"), value: 'binding', description: localize('ade.blueprint.binding.help', "Choose an element's platform profile and technology, or record an open decision.") },
		{ label: localize('ade.blueprint.modules', "Shared Library Binding"), value: 'modules', description: localize('ade.blueprint.modules.help', "Declare an existing package's library, version and consumers.") },
		{ label: localize('ade.blueprint.mapping', "Domain Field Mapping"), value: 'mapping', description: localize('ade.blueprint.mapping.help', "Map a declared domain field to an existing table column or class attribute.") }
	] },
	{ label: localize('ade.blueprint.area.decisions', "Decisions"), modes: [
		{ label: localize('ade.blueprint.assertion', "Knowledge and Acceptance"), value: 'assertion', description: localize('ade.blueprint.assertion.help', "Record what is known about a property and whether it has been accepted.") },
		{ label: localize('ade.blueprint.decisions', "Project Architecture Decisions"), value: 'decision', description: localize('ade.blueprint.decision.help', "Document an architecture decision, its scope, consequences and constraints.") }
	] }
];

/** Native guided dialogs return detached edits. Cancellation never changes the document. */
export async function editAdeBlueprint(quick: Pick<IQuickInputService, 'pick' | 'input'>, model: SemanticModelV4, selectedId: string, activeView?: ModelView, mode?: BlueprintEditMode): Promise<VisualEdit[] | undefined> {
	const b = structuredClone(model.foundation.blueprint ?? emptyBlueprint());
	const input = async (title: string, value = '', required = false, validate?: (value: string) => string | undefined) => quick.input({ title, value, validateInput: async value => required && !value.trim() ? localize('ade.blueprint.required', "Enter a value.") : validate?.(value) });
	const choose = async <T extends string>(title: string, options: { label: string; value: T }[], current?: T) => (await quick.pick(options, { title, activeItem: options.find(option => option.value === current) }))?.value;
	const element = async (title: string, filter: (element: SemanticElement) => boolean = () => true, current?: string) => {
		const elements = model.semantics.elements.filter(filter).map(element => ({ label: element.name, description: element.description, value: element.id }));
		return (await quick.pick(elements, { title, activeItem: elements.find(element => element.value === current) }))?.value;
	};
	const manyElements = async (title: string, initial: readonly string[] = []) => (await quick.pick(model.semantics.elements.map(element => ({ label: element.name, value: element.id, picked: initial.includes(element.id) })), { title, canPickMany: true }))?.map(item => item.value);
	const select = async <T>(title: string, records: T[], label: (record: T) => string, details?: (record: T) => { description?: string; detail?: string }): Promise<{ entry?: T } | undefined> => {
		const result = await quick.pick([...records.map(entry => ({ label: label(entry), ...details?.(entry), entry: entry as T | undefined })), { label: localize('ade.blueprint.new', "Create New"), entry: undefined as T | undefined }], { title });
		return result ? { entry: result.entry } : undefined;
	};
	const updateEntry = <T extends { id?: string }>(entries: T[], updated: T): T[] => {
		const index = updated.id ? entries.findIndex(entry => entry.id === updated.id) : -1;
		return index < 0 ? [...entries, updated] : entries.map((entry, position) => position === index ? updated : entry);
	};
	const knowledge = async (title: string, current?: Knowledge, scalar?: string | number | boolean | null): Promise<Knowledge | undefined> => {
		const state = await choose(title, [{ label: localize('ade.blueprint.known', "Known Value"), value: 'known' }, { label: localize('ade.blueprint.unknown', "Unknown — Requires Clarification"), value: 'unknown' }, { label: localize('ade.blueprint.omitted', "Explicitly Omitted"), value: 'omitted' }], current?.state);
		if (!state) { return; } if (state === 'omitted') { return { state }; }
		if (state === 'unknown') { const reason = await input(localize('ade.blueprint.reason', "Reason"), current?.state === 'unknown' ? current.reason : '', true); return reason === undefined ? undefined : { state, reason }; }
		const value = await input(title, String(current?.state === 'known' ? current.value ?? '' : scalar ?? ''), false, value => typeof scalar === 'boolean' && !['true', 'false'].includes(value) ? localize('ade.blueprint.booleanValue', "Enter true or false.") : typeof scalar === 'number' && (!value.trim() || !Number.isFinite(Number(value))) ? localize('ade.blueprint.numberValue', "Enter a finite number.") : undefined); if (value === undefined) { return; }
		return { state, value: scalar === null ? null : typeof scalar === 'boolean' ? value === 'true' : typeof scalar === 'number' ? Number(value) : value };
	};
	const typeDetails = (type: ModelType) => model.foundation.types.filter(other => other.name === type.name).length > 1 ? { description: type.kind === 'primitive' ? `${type.kind} · ${type.primitive}` : type.kind, detail: localize('ade.blueprint.identity', "ID: {0}", type.id) } : {};
	const typeId = async (current?: string) => {
		const types = model.foundation.types.map(type => ({ label: type.name, ...typeDetails(type), value: type.id }));
		return (await quick.pick(types, { title: localize('ade.blueprint.type', "Declared Type"), activeItem: types.find(type => type.value === current) }))?.value;
	};
	const field = async (previous?: ModelField): Promise<ModelField | undefined> => {
		const name = await input(localize('ade.blueprint.fieldName', "Field Name"), previous?.name, true); if (name === undefined) { return; }
		const type = await typeId(previous?.typeId); if (!type) { return; }
		const presence = await choose(localize('ade.blueprint.presence', "Field Presence"), [{ label: localize('ade.blueprint.requiredField', "Required"), value: 'required' }, { label: localize('ade.blueprint.optionalField', "Optional"), value: 'optional' }], previous ? previous.required === false ? 'optional' : 'required' : undefined); if (!presence) { return; }
		const nullable = await choose(localize('ade.blueprint.nullable', "Nullability (Independent of Presence)"), [{ label: localize('ade.blueprint.notNull', "Non-null Value"), value: 'no' }, { label: localize('ade.blueprint.null', "Null Allowed"), value: 'yes' }, { label: localize('ade.blueprint.nullUnknown', "Unknown"), value: 'unknown' }], previous?.nullable?.state === 'known' ? previous.nullable.value ? 'yes' : 'no' : previous?.nullable?.state === 'unknown' ? 'unknown' : undefined); if (!nullable) { return; }
		return { id: previous?.id ?? generateUuid(), name, type: '', typeId: type, required: presence === 'required', nullable: nullable === 'unknown' ? previous?.nullable?.state === 'unknown' ? structuredClone(previous.nullable) : { state: 'unknown', reason: localize('ade.blueprint.nullPending', "Nullability requires a design decision.") } : { state: 'known', value: nullable === 'yes' } };
	};
	const lines = async (title: string, current: string[], required = false) => { const result = await input(title, current.join('; '), false, value => required && !value.split(';').some(item => item.trim()) ? localize('ade.blueprint.valuesRequired', "Enter at least one value, separated by semicolons.") : undefined); return result === undefined ? undefined : result.split(';').map(value => value.trim()).filter(Boolean); };
	const subject = async (current?: ModelReference, currentField?: string): Promise<{ reference: ModelReference; field: string; value: string | number | boolean | null } | undefined> => {
		const all = modelObjects(model); const choices = [...all.entries()].filter(([, value]) => !hasKey(value, { history: true }));
		const items = choices.map(([key, value]) => {
			const metadata = value as { name?: string; title?: string; elementId?: string };
			return { label: typeof metadata.name === 'string' ? metadata.name : typeof metadata.title === 'string' ? metadata.title : model.semantics.elements.find(element => element.id === metadata.elementId)?.name ?? key, description: key.slice(0, key.indexOf(':')), detail: localize('ade.blueprint.identity', "ID: {0}", key.slice(key.indexOf(':') + 1)), key, value };
		});
		const chosen = await quick.pick(items, { title: localize('ade.blueprint.subject', "Constraint or Assertion Subject"), activeItem: items.find(item => item.key === `${current?.kind}:${current?.id}`) }); if (!chosen) { return; }
		const scalars: { label: string; path: string; value: string | number | boolean | null }[] = [];
		const collect = (value: object, path = '') => { for (const [key, child] of Object.entries(value)) { const next = `${path}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`; if (child === null || ['string', 'number', 'boolean'].includes(typeof child)) { scalars.push({ label: next, path: next, value: child }); } else if (child && typeof child === 'object') { collect(child, next); } } };
		collect(chosen.value); const picked = await quick.pick(scalars, { title: localize('ade.blueprint.property', "Declared Property"), activeItem: current && chosen.key === `${current.kind}:${current.id}` ? scalars.find(item => item.path === currentField) : undefined }); if (!picked) { return; }
		const split = chosen.key.indexOf(':'); return { reference: { kind: chosen.key.slice(0, split) as ModelReference['kind'], id: chosen.key.slice(split + 1) }, field: picked.path, value: picked.value };
	};
	const categories = adeBlueprintAreas.flatMap(area => area.modes);
	const areas = adeBlueprintAreas;
	let category: string | undefined = mode;
	while (!category) {
		const area = await quick.pick(areas, { title: localize('ade.blueprint.edit', "Edit Blueprint") });
		if (!area) { return; }
		const choice = await choose(area.label, [...categories.filter(item => area.modes.some(mode => mode.value === item.value)), { label: localize('ade.blueprint.back', "Back"), value: 'back' }]);
		if (!choice) { return; }
		if (choice !== 'back') { category = choice; }
	}
	const id = selectedId || (['scope', 'owner', 'membership', 'integration', 'binding', 'ports'].includes(category) ? await element(localize('ade.blueprint.element', "Element"), element => category !== 'owner' || !['feature', 'actor'].includes(element.kind)) : undefined);
	const emit = <K extends keyof ModelBlueprint>(section: K, entry: ModelBlueprint[K][number]): VisualEdit[] => [{ kind: 'blueprint', section, entry }];
	if (category === 'c4') {
		const picked = await select(localize('ade.blueprint.c4', "C4 View Subject and Context"), model.views.filter(view => ['c4Context', 'c4Container', 'c4Component', 'class'].includes(view.kind)), view => view.name); if (!picked) { return; }
		const existing = picked.entry;
		const kind = await choose(localize('ade.blueprint.level', "C4 Level"), [{ label: localize('ade.blueprint.l1', "L1 · System Context"), value: 'c4Context' }, { label: localize('ade.blueprint.l2', "L2 · Containers"), value: 'c4Container' }, { label: localize('ade.blueprint.l3', "L3 · Components"), value: 'c4Component' }, { label: localize('ade.blueprint.l4', "L4 · Contract"), value: 'class' }], picked.entry?.kind); if (!kind) { return; }
		const subjectId = await element(localize('ade.blueprint.viewSubject', "View Subject"), element => kind === 'c4Context' || kind === 'c4Container' ? element.kind === 'system' && element.scope === 'governed' : kind === 'c4Component' ? element.kind === 'container' : ['interface', 'contract', 'class'].includes(element.kind), picked.entry?.subjectId); if (!subjectId) { return; }
		const name = await input(localize('ade.blueprint.viewName', "View Name"), picked.entry?.name, true); if (name === undefined) { return; }
		const contextIds = await manyElements(localize('ade.blueprint.context', "Context Dependencies (Outside the Subject)"), existing?.contextIds); if (!contextIds) { return; }
		const nodeIds = await manyElements(localize('ade.blueprint.viewElements', "Visible Elements"), existing?.nodes.map(node => node.elementId) ?? [subjectId]); if (!nodeIds) { return; }
		const visible = new Set(nodeIds); const previous = picked.entry;
		const view: ModelView = { id: previous?.id ?? generateUuid(), name, kind, subjectId, contextIds, nodes: nodeIds.map((elementId, index) => previous?.nodes.find(node => node.elementId === elementId) ?? { elementId, x: index % 3 * 260, y: Math.floor(index / 3) * 180 }), relationIds: model.semantics.relations.filter(relation => visible.has(relation.from) && visible.has(relation.to)).map(relation => relation.id) };
		if (!previous) { view.nodes = arrangeDiagram(model, view, 'balanced'); }
		return [{ kind: 'c4View', view }];
	}
	if (category === 'scope' && id) {
		const target = model.semantics.elements.find(element => element.id === id);
		if (target?.kind === 'system') { const scope = await choose(localize('ade.blueprint.scope', "System Scope or Container Responsibility"), [{ label: localize('ade.blueprint.governed', "Governed System"), value: 'governed' }, { label: localize('ade.blueprint.external', "External System"), value: 'external' }], target.scope); return scope ? [{ kind: 'elementScope', id, scope }] : undefined; }
		const description = await input(localize('ade.blueprint.responsibility', "Responsibility"), target?.description, true); if (description === undefined) { return; }
		if (target?.kind !== 'container') { return [{ kind: 'description', id, description }]; }
		const runtimeKind = await choose(localize('ade.blueprint.runtimeRole', "Container Role"), [{ label: localize('ade.blueprint.application', "Application"), value: 'application' }, { label: localize('ade.blueprint.service', "Service"), value: 'service' }, { label: localize('ade.blueprint.spa', "Web Client"), value: 'spa' }, { label: localize('ade.blueprint.mobile', "Mobile Client"), value: 'mobile' }, { label: localize('ade.blueprint.store', "Data Store"), value: 'store' }, { label: localize('ade.blueprint.messaging', "Messaging"), value: 'messaging' }], target.runtimeKind); return runtimeKind ? [{ kind: 'description', id, description }, { kind: 'elementScope', id, runtimeKind }] : undefined;
	}
	if (category === 'owner' && id) {
		const target = model.semantics.elements.find(element => element.id === id); if (!target) { return; }
		if (['feature', 'actor'].includes(target.kind)) { throw new Error(localize('ade.blueprint.ownerUnsupported', "Select a structural element or lifecycle state to assign an owner. Actors and features do not have an architectural owner.")); }
		const current = model.foundation.ownership.find(entry => entry.elementId === id);
		const role = target.kind === 'state' ? 'lifecycle' : 'architecture';
		const canOwn = (owner: SemanticElement) => {
			if (!isValidModelOwnership(target, owner, role)) { return false; }
			const seen = new Set<string>(); let ancestor: string | undefined = owner.id;
			while (ancestor) { if (ancestor === id || seen.has(ancestor)) { return false; } seen.add(ancestor); ancestor = model.foundation.ownership.find(entry => entry.elementId === ancestor)?.ownerId; }
			return true;
		};
		if (!model.semantics.elements.some(canOwn)) { throw new Error(localize('ade.blueprint.ownerMissing', "Add a suitable owner first: a system, container, component, package, class or interface for architecture, or a resource, entity or class for a lifecycle state.")); }
		const ownerId = await element(localize('ade.blueprint.owner', "Architectural or Lifecycle Owner"), canOwn, current?.ownerId); if (!ownerId) { return; }
		const confirmedRole = await choose(localize('ade.blueprint.ownershipRole', "Ownership Role"), role === 'lifecycle' ? [{ label: localize('ade.blueprint.lifecycle', "Lifecycle"), value: 'lifecycle' }] : [{ label: localize('ade.blueprint.architecture', "Architecture"), value: 'architecture' }], role);
		return confirmedRole ? [{ kind: 'ownership', entry: { id: current?.id ?? generateUuid(), elementId: id, ownerId, role: confirmedRole } }] : undefined;
	}
	if (category === 'membership' && id) {
		const picked = await quick.pick(model.semantics.elements.filter(element => element.kind === 'feature').map(element => ({ label: element.name, value: element.id, picked: model.foundation.memberships.some(entry => entry.elementId === id && entry.featureId === element.id) })), { title: localize('ade.blueprint.membership', "Feature Memberships"), canPickMany: true }); if (!picked) { return; }
		return model.semantics.elements.filter(element => element.kind === 'feature').map(feature => ({ kind: 'membership', entry: { id: model.foundation.memberships.find(entry => entry.elementId === id && entry.featureId === feature.id)?.id ?? generateUuid(), elementId: id, featureId: feature.id }, included: picked.some(item => item.value === feature.id) }));
	}
	if (category === 'integration' && id) { const externalId = await element(localize('ade.blueprint.external', "External System"), element => element.scope === 'external'); return externalId ? [{ kind: 'integration', entry: { id: model.foundation.integrations.find(entry => entry.consumerId === id && entry.externalId === externalId)?.id ?? generateUuid(), consumerId: id, externalId } }] : undefined; }
	if (category === 'binding' && id) {
		const picked = await select(localize('ade.blueprint.binding', "Platform Binding"), model.foundation.platform.bindings.filter(entry => entry.elementId === id), entry => entry.profileId); if (!picked) { return; }
		const profileId = await input(localize('ade.blueprint.profile', "Declared Profile Identifier"), picked.entry?.profileId, true); if (!profileId) { return; }
		const technology = await knowledge(localize('ade.blueprint.technology', "Technology"), picked.entry?.technology); return technology ? [{ kind: 'platformBinding', entry: { id: picked.entry?.id ?? generateUuid(), elementId: id, profileId, technology } }] : undefined;
	}
	if (category === 'types') {
		const focused = mode === 'types' ? model.foundation.types.find(entry => entry.id === selectedId || entry.fields.some(field => field.id === selectedId)) : undefined;
		const picked = focused ? { entry: focused } : await select(localize('ade.blueprint.types', "Shared Types"), model.foundation.types, entry => entry.name, typeDetails); if (!picked) { return; }
		const entry: ModelType = structuredClone(picked.entry ?? { id: generateUuid(), name: '', kind: 'record', fields: [] });
		if (!picked.entry) {
			const name = await input(localize('ade.blueprint.typeName', "Type Name"), '', true); if (name === undefined) { return; } entry.name = name;
			const kind = await choose(localize('ade.blueprint.typeKind', "Type Kind"), [{ label: localize('ade.blueprint.primitive', "Primitive"), value: 'primitive' }, { label: localize('ade.blueprint.record', "Record"), value: 'record' }, { label: localize('ade.blueprint.enum', "Enumeration"), value: 'enum' }, { label: localize('ade.blueprint.collection', "Collection"), value: 'collection' }, { label: localize('ade.blueprint.reference', "Reference"), value: 'reference' }]); if (!kind) { return; } entry.kind = kind;
			if (kind === 'primitive') { const primitive = await input(localize('ade.blueprint.primitiveName', "Primitive Defined by the Selected Profile"), '', true); if (!primitive) { return; } entry.primitive = primitive; }
			if (kind === 'enum') { const values = await lines(localize('ade.blueprint.enumValues', "Values (Separated by Semicolons)"), [], true); if (!values?.length) { return; } entry.values = values; }
			if (kind === 'collection' || kind === 'reference') { const target = await typeId(); if (!target) { return; } if (kind === 'collection') { entry.itemTypeId = target; } else { entry.targetTypeId = target; } }
		} else {
			const record = !entry.kind || entry.kind === 'record';
			const action = await choose(localize('ade.blueprint.typeEdit', "Edit Type"), [
				{ label: localize('ade.blueprint.rename', "Rename"), value: 'name' },
				...(record ? [{ label: localize('ade.blueprint.fields', "Add or Edit Field"), value: 'field' as const }] : [{ label: localize('ade.blueprint.definition', "Edit Type Definition"), value: 'definition' as const }]),
				...(record && entry.fields.length ? [{ label: localize('ade.blueprint.removeField', "Remove Field"), value: 'removeField' as const }] : []),
				{ label: localize('ade.blueprint.constraints', "Add Type Constraint"), value: 'constraint' },
				...(entry.constraints?.length ? [{ label: localize('ade.blueprint.editConstraint', "Edit or Remove Type Constraint"), value: 'editConstraint' as const }] : [])
			]); if (!action) { return; }
			if (action === 'name') { const name = await input(localize('ade.blueprint.typeName', "Type Name"), entry.name, true); if (name === undefined) { return; } entry.name = name; }
			if (action === 'definition') {
				if (entry.kind === 'primitive') { const value = await input(localize('ade.blueprint.primitiveName', "Primitive Defined by the Selected Profile"), entry.primitive, true); if (!value) { return; } entry.primitive = value; }
				else if (entry.kind === 'enum') { const values = await lines(localize('ade.blueprint.enumValues', "Values (Separated by Semicolons)"), entry.values ?? [], true); if (!values?.length) { return; } entry.values = values; }
				else if (entry.kind === 'collection' || entry.kind === 'reference') { const target = await typeId(entry.kind === 'collection' ? entry.itemTypeId : entry.targetTypeId); if (!target) { return; } if (entry.kind === 'collection') { entry.itemTypeId = target; } else { entry.targetTypeId = target; } }
			}
			if (action === 'removeField') { const picked = await quick.pick(entry.fields.map(field => ({ label: field.name, field })), { title: localize('ade.blueprint.removeField', "Remove Field") }); if (!picked) { return; } entry.fields = entry.fields.filter(field => field.id !== picked.field.id); }
			if (action === 'field') { if (entry.kind && entry.kind !== 'record') { return; } const selected = await select(localize('ade.blueprint.fields', "Add or Edit Field"), entry.fields.filter((field): field is ModelField & { id: string } => !!field.id), field => field.name); if (!selected) { return; } const updated = await field(selected.entry); if (!updated) { return; } entry.fields = updateEntry(entry.fields, updated); }
			if (action === 'constraint' || action === 'editConstraint') {
				type Constraint = NonNullable<ModelType['constraints']>[number];
				const kinds: { label: string; value: Constraint['kind'] }[] = [
					{ label: localize('ade.blueprint.minimum', "Minimum"), value: 'minimum' },
					{ label: localize('ade.blueprint.maximum', "Maximum"), value: 'maximum' },
					{ label: localize('ade.blueprint.pattern', "Pattern"), value: 'pattern' },
					{ label: localize('ade.blueprint.minLength', "Minimum Length"), value: 'minLength' },
					{ label: localize('ade.blueprint.maxLength', "Maximum Length"), value: 'maxLength' }
				];
				let previous: Constraint | undefined;
				if (action === 'editConstraint') {
					previous = (await quick.pick((entry.constraints ?? []).map(constraint => ({ label: `${kinds.find(kind => kind.value === constraint.kind)!.label} · ${constraint.value}`, constraint })), { title: localize('ade.blueprint.editConstraint', "Edit or Remove Type Constraint") }))?.constraint;
					if (!previous) { return; }
					const change = await choose(localize('ade.blueprint.constraintKind', "Type Constraint"), [{ label: localize('ade.blueprint.constraintEditValue', "Edit Constraint Value"), value: 'edit' }, { label: localize('ade.blueprint.constraintRemove', "Remove Constraint"), value: 'remove' }]);
					if (!change) { return; }
					if (change === 'remove') { entry.constraints = entry.constraints?.filter(constraint => constraint.id !== previous!.id); return [{ kind: 'type', entry }]; }
				}
				const kind = previous?.kind ?? await choose(localize('ade.blueprint.constraintKind', "Type Constraint"), kinds); if (!kind) { return; }
				const value = await quick.input({
					title: localize('ade.blueprint.constraintValue', "Constraint Value"), value: previous === undefined ? '' : String(previous.value),
					prompt: kind === 'pattern' ? localize('ade.blueprint.patternHint', "{0} · Pattern. Use a regular expression without surrounding slash delimiters.", entry.name) : localize('ade.blueprint.constraintHint', "{0} · {1}", entry.name, kinds.find(option => option.value === kind)!.label),
					validateInput: async value => {
						if (!value.trim()) { return localize('ade.blueprint.required', "Enter a value."); }
						if (kind === 'pattern') { try { new RegExp(value); } catch { return localize('ade.blueprint.patternInvalid', "Enter a valid regular expression. Check brackets and escaping."); } }
						else if (!Number.isFinite(Number(value))) { return localize('ade.blueprint.number', "Enter a finite number."); }
						else if ((kind === 'minLength' || kind === 'maxLength') && (!Number.isInteger(Number(value)) || Number(value) < 0)) { return localize('ade.blueprint.lengthInvalid', "Enter a non-negative integer."); }
						return undefined;
					}
				});
				if (value === undefined) { return; }
				const constraint: Constraint = { id: previous?.id ?? generateUuid(), kind, value: kind === 'pattern' ? value : Number(value) };
				entry.constraints = previous ? entry.constraints?.map(current => current.id === previous!.id ? constraint : current) : [...(entry.constraints ?? []), constraint];
			}
		}
		return [{ kind: 'type', entry }];
	}
	if (category === 'operations') {
		const operationDetails = (operation: ModelOperation) => {
			if (b.operations.filter(other => other.name === operation.name).length < 2) { return {}; }
			const signature = (fields: ModelField[]) => fields.map(field => `${field.name}${field.required === false ? '?' : ''}: ${model.foundation.types.find(type => type.id === field.typeId)?.name ?? field.typeId ?? field.type}${field.nullable?.state === 'known' && field.nullable.value ? ' | null' : field.nullable?.state === 'unknown' ? ' | ?' : ''}`).join(', ');
			return { description: model.semantics.elements.find(element => element.id === operation.ownerId)?.name ?? operation.ownerId, detail: `(${signature(operation.inputs)}) → (${signature(operation.outputs)}) · ${localize('ade.blueprint.identity', "ID: {0}", operation.id)}` };
		};
		const focused = mode === 'operations' ? b.operations.find(entry => entry.id === selectedId) : undefined;
		const selectedElement = model.semantics.elements.find(element => element.id === selectedId);
		const contextual = mode === 'operations' && selectedElement && ['contract', 'interface', 'component', 'controller', 'class'].includes(selectedElement.kind);
		const contextualIds = contextual ? new Set(getContractProjection(model, selectedId).operations.map(operation => operation.id)) : undefined;
		const operations = contextualIds ? b.operations.filter(operation => contextualIds.has(operation.id)) : b.operations;
		const picked = focused ? { entry: focused } : await select(localize('ade.blueprint.operations', "Shared Operations"), operations, operation => operation.name, operationDetails); if (!picked) { return; }
		const entry: ModelOperation = picked.entry ?? { id: generateUuid(), ownerId: '', name: '', inputs: [], outputs: [], errors: [], effects: [], preconditions: [], postconditions: [], permissions: [], acceptanceCriteria: [] };
		if (!picked.entry) { const ownerId = contextual ? selectedId : await element(localize('ade.blueprint.operationOwner', "Operation Owner"), element => ['contract', 'interface', 'component', 'controller', 'class'].includes(element.kind)); if (!ownerId) { return; } entry.ownerId = ownerId; const name = await input(localize('ade.blueprint.operationName', "Operation Name"), '', true); if (name === undefined) { return; } entry.name = name; }
		else {
			const actions = [{ label: localize('ade.blueprint.rename', "Rename"), value: 'name' }, { label: localize('ade.blueprint.inputs', "Input Parameters"), value: 'inputs' }, { label: localize('ade.blueprint.outputs', "Results"), value: 'outputs' }, { label: localize('ade.blueprint.errors', "Typed Errors"), value: 'errors' }, { label: localize('ade.blueprint.effects', "Declared Effects"), value: 'effects' }, { label: localize('ade.blueprint.pre', "Preconditions (Descriptive)"), value: 'preconditions' }, { label: localize('ade.blueprint.post', "Postconditions (Descriptive)"), value: 'postconditions' }, { label: localize('ade.blueprint.permissions', "Permissions"), value: 'permissions' }, { label: localize('ade.blueprint.acceptance', "Acceptance Criteria"), value: 'acceptanceCriteria' }, ...(entry.inputs.length + entry.outputs.length + entry.errors.length + entry.permissions.length + entry.acceptanceCriteria.length ? [{ label: localize('ade.blueprint.removeContractMember', "Remove Contract Member"), value: 'remove' as const }] : [])] as const;
			const action = await pickAdeFormAction(quick, localize('ade.blueprint.operationContext', "Operation: {0}", entry.name), [
				{ label: localize('ade.blueprint.signature', "Signature"), actions: actions.filter(action => ['inputs', 'outputs', 'errors'].includes(action.value)) },
				{ label: localize('ade.blueprint.behaviorRules', "Behavior Rules"), actions: actions.filter(action => ['effects', 'preconditions', 'postconditions'].includes(action.value)) },
				{ label: localize('ade.blueprint.accessAcceptance', "Access and Acceptance"), actions: actions.filter(action => ['permissions', 'acceptanceCriteria'].includes(action.value)) }
			], actions.filter(action => ['name', 'remove'].includes(action.value))); if (!action) { return; }
			if (action === 'remove') {
				const entries = [...entry.inputs.map(field => ({ label: localize('ade.blueprint.inputField', "Input · {0}", field.name), kind: 'inputs' as const, id: field.id })), ...entry.outputs.map(field => ({ label: localize('ade.blueprint.outputField', "Result · {0}", field.name), kind: 'outputs' as const, id: field.id })), ...entry.errors.map(error => ({ label: error.code, kind: 'errors' as const, id: error.id })), ...entry.acceptanceCriteria.map(criterion => ({ label: criterion.then, kind: 'acceptanceCriteria' as const, id: criterion.id })), ...entry.permissions.map((permission, index) => ({ label: localize('ade.blueprint.permissionMember', "Permission · {0} · {1}", model.semantics.elements.find(element => element.id === permission.actorId)?.name ?? permission.actorId, permission.capability), kind: 'permissions' as const, index }))];
				const picked = await quick.pick(entries, { title: localize('ade.blueprint.removeContractMember', "Remove Contract Member") }); if (!picked) { return; }
				if (picked.kind === 'permissions') { entry.permissions = entry.permissions.filter((_, index) => index !== picked.index); }
				else { Object.assign(entry, { [picked.kind]: entry[picked.kind].filter(member => member.id !== picked.id) }); }
				return emit('operations', entry);
			}
			if (action === 'name') { const name = await input(localize('ade.blueprint.operationName', "Operation Name"), entry.name, true); if (name === undefined) { return; } entry.name = name; }
			else if (action === 'inputs' || action === 'outputs') { const selected = await select(localize('ade.blueprint.fieldName', "Field Name"), entry[action].filter((field): field is ModelField & { id: string } => !!field.id), field => field.name); if (!selected) { return; } const updated = await field(selected.entry); if (!updated) { return; } entry[action] = updateEntry(entry[action], updated); }
			else if (action === 'errors') { const selected = await select(localize('ade.blueprint.errors', "Typed Errors"), entry.errors, error => error.code); if (!selected) { return; } const code = await input(localize('ade.blueprint.errorCode', "Error Code"), selected.entry?.code, true); if (code === undefined) { return; } const description = await input(localize('ade.blueprint.errorDescription', "Error Description"), selected.entry?.description); if (description === undefined) { return; } const type = await typeId(selected.entry?.typeId); if (!type) { return; } const updated = { id: selected.entry?.id ?? generateUuid(), code, description, typeId: type }; entry.errors = updateEntry(entry.errors, updated); }
			else if (action === 'permissions') {
				const selected = await select(localize('ade.blueprint.permissions', "Permissions"), entry.permissions, permission => localize('ade.blueprint.actorCapability', "{0} · {1}", model.semantics.elements.find(element => element.id === permission.actorId)?.name ?? permission.actorId, permission.capability)); if (!selected) { return; }
				const index = selected.entry ? entry.permissions.indexOf(selected.entry) : -1;
				const actorId = await element(localize('ade.blueprint.actor', "Authorized Actor"), element => element.kind === 'actor', selected.entry?.actorId); if (!actorId) { return; }
				const capability = await input(localize('ade.blueprint.capability', "Required Capability"), selected.entry?.capability, true, value => entry.permissions.some((permission, position) => position !== index && permission.actorId === actorId && permission.capability === value.trim()) ? localize('ade.blueprint.permissionDuplicate', "This actor already requires that capability. Edit the existing permission instead.") : undefined); if (capability === undefined) { return; }
				const updated = { actorId, capability: capability.trim() };
				entry.permissions = index < 0 ? [...entry.permissions, updated] : entry.permissions.map((permission, position) => position === index ? updated : permission);
			}
			else if (action === 'acceptanceCriteria') {
				const selected = await select(localize('ade.blueprint.acceptance', "Acceptance Criteria"), entry.acceptanceCriteria, criterion => criterion.then); if (!selected) { return; }
				const given = await input(localize('ade.blueprint.given', "Given"), selected.entry?.given, true); if (given === undefined) { return; }
				const when = await input(localize('ade.blueprint.when', "When"), selected.entry?.when, true); if (when === undefined) { return; }
				const then = await input(localize('ade.blueprint.then', "Then"), selected.entry?.then, true); if (then === undefined) { return; }
				entry.acceptanceCriteria = updateEntry(entry.acceptanceCriteria, { id: selected.entry?.id ?? generateUuid(), given, when, then });
			}
			else { const result = await lines(localize('ade.blueprint.descriptive', "Declarations (Separated by Semicolons)"), entry[action]); if (!result) { return; } entry[action] = result; }
		}
		return emit('operations', entry);
	}
	if (category === 'interfaces') {
		const picked = await select(localize('ade.blueprint.interfaces', "Interfaces and Invariants"), b.interfaces, entry => model.semantics.elements.find(element => element.id === entry.elementId)?.name ?? entry.id); if (!picked) { return; }
		const elementId = picked.entry?.elementId ?? await element(localize('ade.blueprint.interfaceElement', "Contract or Interface Element"), element => ['contract', 'interface'].includes(element.kind)); if (!elementId) { return; }
		const version = await input(localize('ade.blueprint.contractVersion', "Contract Version"), picked.entry?.version, true); if (!version) { return; }
		const operations = await quick.pick(b.operations.filter(operation => operation.ownerId === elementId).map(operation => ({ label: operation.name, id: operation.id, picked: picked.entry?.operationIds.includes(operation.id) })), { title: localize('ade.blueprint.operations', "Shared Operations"), canPickMany: true }); if (!operations) { return; }
		const invariants = await lines(localize('ade.blueprint.invariants', "Invariants (Descriptive, Separated by Semicolons)"), picked.entry?.invariants ?? []); return invariants ? emit('interfaces', { id: picked.entry?.id ?? generateUuid(), elementId, version, operationIds: operations.map(operation => operation.id), invariants }) : undefined;
	}
	if (category === 'ports' && id) {
		const picked = await select(localize('ade.blueprint.ports', "Provided or Required Interface"), b.ports.filter(port => port.elementId === id), port => model.semantics.elements.find(element => element.id === b.interfaces.find(contract => contract.id === port.interfaceId)?.elementId)?.name ?? port.id); if (!picked) { return; }
		const contracts = b.interfaces.map(contract => ({ label: model.semantics.elements.find(element => element.id === contract.elementId)?.name ?? contract.id, contract }));
		const contract = await quick.pick(contracts, { title: localize('ade.blueprint.interfaces', "Interfaces and Invariants"), activeItem: contracts.find(contract => contract.contract.id === picked.entry?.interfaceId) }); if (!contract) { return; }
		const direction = await choose(localize('ade.blueprint.portDirection', "Interface Direction"), [{ label: localize('ade.blueprint.provided', "Provided"), value: 'provided' }, { label: localize('ade.blueprint.requiredPort', "Required"), value: 'required' }], picked.entry?.direction); return direction ? emit('ports', { id: picked.entry?.id ?? generateUuid(), elementId: id, interfaceId: contract.contract.id, direction }) : undefined;
	}
	if (category === 'connections') {
		const portLabel = (port: ModelBlueprint['ports'][number]) => [model.semantics.elements.find(element => element.id === port.elementId)?.name, model.semantics.elements.find(element => element.id === b.interfaces.find(contract => contract.id === port.interfaceId)?.elementId)?.name].filter(Boolean).join(' · ');
		const required = await quick.pick(b.ports.filter(port => port.direction === 'required').map(port => ({ label: portLabel(port), port })), { title: localize('ade.blueprint.consumer', "Required Interface Consumer") }); if (!required) { return; }
		const provided = await quick.pick(b.ports.filter(port => port.direction === 'provided').map(port => ({ label: portLabel(port), port })), { title: localize('ade.blueprint.provider', "Provided Interface") }); if (!provided) { return; }
		const operations: ModelBlueprint['connections'][number]['operations'] = [];
		for (const operationId of b.interfaces.find(contract => contract.id === required.port.interfaceId)?.operationIds ?? []) { const wanted = b.operations.find(operation => operation.id === operationId); const picked = await quick.pick(b.operations.filter(operation => b.interfaces.find(contract => contract.id === provided.port.interfaceId)?.operationIds.includes(operation.id)).map(operation => ({ label: operation.name, operation })), { title: localize('ade.blueprint.mapOperation', "Provider for {0}", wanted?.name ?? '') }); if (!picked) { return; } operations.push({ requiredOperationId: operationId, providedOperationId: picked.operation.id }); }
		return emit('connections', { id: b.connections.find(connection => connection.requiredPortId === required.port.id)?.id ?? generateUuid(), requiredPortId: required.port.id, providedPortId: provided.port.id, operations });
	}
	if (category === 'transports') {
		if (!model.semantics.relations.length) { throw new Error(localize('ade.blueprint.transportNeedsRelationship', "Create a relationship between model elements before defining its transport contract.")); }
		const relation = await quick.pick(model.semantics.relations.map(relation => ({ label: relation.name, relation })), { title: localize('ade.blueprint.relation', "Transport Relationship") }); if (!relation) { return; }
		const previous = b.transports.find(transport => transport.relationId === relation.relation.id);
		const protocol = await input(localize('ade.blueprint.protocol', "Protocol"), previous?.protocol, true); if (!protocol) { return; }
		const format = await input(localize('ade.blueprint.format', "Payload Format"), previous?.format, true); if (!format) { return; }
		const schemaTypeId = await typeId(previous?.schemaTypeId); if (!schemaTypeId) { return; }
		const schemaVersion = await input(localize('ade.blueprint.schemaVersion', "Payload Schema Version"), previous?.schemaVersion, true); return schemaVersion ? emit('transports', { id: previous?.id ?? generateUuid(), relationId: relation.relation.id, protocol, format, schemaTypeId, schemaVersion }) : undefined;
	}
	if (category === 'modules') {
		const elementId = await element(localize('ade.blueprint.module', "Nondeployable Package"), element => element.kind === 'package'); if (!elementId) { return; } const previous = b.modules.find(module => module.elementId === elementId);
		const consumerIds = await manyElements(localize('ade.blueprint.moduleConsumers', "Library Consumers"), previous?.consumerIds); if (!consumerIds) { return; }
		const library = await knowledge(localize('ade.blueprint.library', "Library"), previous?.library); if (!library) { return; } const version = await knowledge(localize('ade.blueprint.libraryVersion', "Library Version"), previous?.version); return version ? emit('modules', { id: previous?.id ?? generateUuid(), elementId, consumerIds, library, version }) : undefined;
	}
	if (category === 'mapping') {
		const domain = await quick.pick(model.foundation.types.flatMap(type => type.fields.map(field => ({ label: `${type.name} · ${field.name}`, field }))), { title: localize('ade.blueprint.domainField', "Domain Field") }); if (!domain?.field.id) { return; }
		const target = await quick.pick(model.semantics.elements.filter(element => ['table', 'class'].includes(element.kind)).flatMap(element => (element.details?.members ?? []).filter(member => member.kind === 'attribute').map(field => ({ label: `${element.name} · ${field.name}`, element, field }))), { title: localize('ade.blueprint.targetField', "Physical Column or Class Member") }); return target?.field.id ? emit('fieldMappings', { id: b.fieldMappings.find(mapping => mapping.domainFieldId === domain.field.id && mapping.targetFieldId === target.field.id)?.id ?? generateUuid(), domainFieldId: domain.field.id, targetFieldId: target.field.id, targetKind: target.element.kind === 'table' ? 'column' : 'member' }) : undefined;
	}
	if (category === 'assertion') {
		const objects = modelObjects(model);
		const picked = await select(localize('ade.blueprint.assertion', "Knowledge and Acceptance"), model.foundation.assertions, assertion => {
			const target = objects.get(`${assertion.subject.kind}:${assertion.subject.id}`);
			const name = (target as { name?: unknown } | undefined)?.name;
			return `${typeof name === 'string' ? name : assertion.subject.id} · ${assertion.field}`;
		}, assertion => ({ description: `${assertion.subject.kind} · ${assertion.acceptance.status}` })); if (!picked) { return; }
		const target = await subject(picked.entry?.subject, picked.entry?.field); if (!target) { return; } const value = await knowledge(localize('ade.blueprint.asserted', "Declared Value"), picked.entry?.value, target.value); if (!value) { return; }
		const status = await choose(localize('ade.blueprint.acceptanceStatus', "Acceptance (Independent of Verification)"), [{ label: localize('ade.blueprint.proposed', "Proposed"), value: 'proposed' }, { label: localize('ade.blueprint.accepted', "Accepted"), value: 'accepted' }, { label: localize('ade.blueprint.rejected', "Rejected"), value: 'rejected' }], picked.entry?.acceptance.status); if (!status) { return; }
		if (picked.entry && equals(picked.entry.subject, target.reference) && picked.entry.field === target.field && equals(picked.entry.value, value) && picked.entry.acceptance.status === status) { return; }
		return [{ kind: 'assertion', entry: { id: picked.entry?.id ?? generateUuid(), subject: target.reference, field: target.field, value, provenance: { kind: 'authored', producer: 'workbench', revision: generateUuid() }, acceptance: { status, revision: generateUuid() } } }];
	}
	if (category === 'decision') {
		const picked = await select(localize('ade.blueprint.decisions', "Project Architecture Decisions"), model.foundation.decisions, decision => `${decision.record?.number ?? ''} · ${decision.record?.title ?? decision.id}`); if (!picked) { return; }
		const previous = picked.entry; const entry: ModelDecision = structuredClone(previous ?? { id: generateUuid(), revision: generateUuid(), status: 'proposed', scopeIds: id ? [id] : [], constraints: [], record: { number: '', title: '', context: '', decision: '', consequences: [], history: [] } });
		if (!entry.record) { entry.record = { number: '', title: '', context: '', decision: '', consequences: [], history: [] }; }
		const action = previous ? await choose(localize('ade.blueprint.decisionEdit', "Edit Project Decision"), [{ label: localize('ade.blueprint.recordEdit', "Revise Record and Scope"), value: 'record' }, { label: localize('ade.blueprint.statusEdit', "Change Status"), value: 'status' }, { label: localize('ade.blueprint.constraintEdit', "Add or Edit Normative Constraint"), value: 'constraint' }]) : 'record'; if (!action) { return; }
		if (action === 'record') {
			for (const [key, title] of [['number', localize('ade.blueprint.adrNumber', "Decision Number")], ['title', localize('ade.blueprint.adrTitle', "Decision Title")], ['context', localize('ade.blueprint.adrContext', "Context")], ['decision', localize('ade.blueprint.adrDecision', "Decision")]] as const) { const value = await input(title, entry.record[key], true); if (value === undefined) { return; } entry.record[key] = value; }
			const consequences = await lines(localize('ade.blueprint.consequences', "Positive and Negative Consequences (Separated by Semicolons)"), entry.record.consequences); if (!consequences) { return; } entry.record.consequences = consequences;
			const scopeIds = await manyElements(localize('ade.blueprint.adrScope', "Applicable Scope"), entry.scopeIds); if (!scopeIds?.length) { return; } entry.scopeIds = scopeIds;
		} else if (action === 'status') {
			const status = await choose(localize('ade.blueprint.status', "Decision Status"), [{ label: localize('ade.blueprint.proposed', "Proposed"), value: 'proposed' }, { label: localize('ade.blueprint.accepted', "Accepted"), value: 'accepted' }, { label: localize('ade.blueprint.deprecated', "Deprecated"), value: 'deprecated' }, { label: localize('ade.blueprint.superseded', "Superseded"), value: 'superseded' }]); if (!status) { return; } entry.status = status; delete entry.record.supersededById;
			if (status === 'superseded') { const replacement = await quick.pick(model.foundation.decisions.filter(decision => decision.id !== entry.id && decision.status === 'accepted').map(decision => ({ label: decision.record?.title ?? decision.id, decision })), { title: localize('ade.blueprint.replacement', "Accepted Replacement Decision") }); if (!replacement) { return; } entry.record.supersededById = replacement.decision.id; }
		} else {
			const selected = await select(localize('ade.blueprint.constraintEdit', "Add or Edit Normative Constraint"), entry.constraints, constraint => `${constraint.category ?? ''} · ${constraint.field}`); if (!selected) { return; }
			const target = await subject(); if (!target) { return; }
			const category = await choose(localize('ade.blueprint.constraintCategory', "Normative Constraint Category"), [{ label: localize('ade.blueprint.technology', "Technology"), value: 'technology' }, { label: localize('ade.blueprint.library', "Library"), value: 'library' }, { label: localize('ade.blueprint.protocol', "Protocol"), value: 'protocol' }, { label: localize('ade.blueprint.dependency', "Dependency Boundary"), value: 'dependency' }, { label: localize('ade.blueprint.persistence', "Persistence"), value: 'persistence' }, { label: localize('ade.blueprint.concurrency', "Concurrency"), value: 'concurrency' }]); if (!category) { return; }
			const operator = await choose(localize('ade.blueprint.operator', "Constraint Rule"), [{ label: localize('ade.blueprint.equals', "Require This Value"), value: 'equals' }, { label: localize('ade.blueprint.notEquals', "Forbid This Value"), value: 'notEquals' }]); if (!operator) { return; }
			const value = await knowledge(localize('ade.blueprint.constraintValue', "Constraint Value"), selected.entry?.value, target.value); if (!value) { return; }
			const constraint: DecisionConstraint = { id: selected.entry?.id ?? generateUuid(), category, operator, subject: target.reference, field: target.field, value }; entry.constraints = [...entry.constraints.filter(item => item.id !== constraint.id), constraint];
		}
		entry.revision = generateUuid(); return [{ kind: 'decision', entry, ...(previous ? { expectedRevision: previous.revision } : {}) }];
	}
	return;
}
