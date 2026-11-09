/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { emptyBlueprint, modelObjects, type DecisionConstraint, type Knowledge, type ModelBlueprint, type ModelDecision, type ModelField, type ModelOperation, type ModelReference, type ModelType, type ModelView, type SemanticElement, type SemanticModelV4 } from '../common/semanticModel.js';
import type { VisualEdit } from '../common/visualEditing.js';

export type BlueprintEditMode = 'c4' | 'scope' | 'owner' | 'membership' | 'integration' | 'binding' | 'types' | 'operations' | 'interfaces' | 'ports' | 'connections' | 'transports' | 'modules' | 'mapping' | 'assertion' | 'decision';

/** Native guided dialogs return detached edits. Cancellation never changes the document. */
export async function editAdeBlueprint(quick: Pick<IQuickInputService, 'pick' | 'input'>, model: SemanticModelV4, selectedId: string, activeView?: ModelView, mode?: BlueprintEditMode): Promise<VisualEdit[] | undefined> {
	const b = structuredClone(model.foundation.blueprint ?? emptyBlueprint());
	const input = async (title: string, value = '', required = false) => quick.input({ title, value, validateInput: async value => required && !value.trim() ? localize('ade.blueprint.required', "Enter a value.") : undefined });
	const choose = async <T extends string>(title: string, options: { label: string; value: T }[]) => (await quick.pick(options, { title }))?.value;
	const element = async (title: string, filter: (element: SemanticElement) => boolean = () => true) => (await quick.pick(model.semantics.elements.filter(filter).map(element => ({ label: element.name, description: element.description, value: element.id })), { title }))?.value;
	const manyElements = async (title: string, initial: readonly string[] = []) => (await quick.pick(model.semantics.elements.map(element => ({ label: element.name, value: element.id, picked: initial.includes(element.id) })), { title, canPickMany: true }))?.map(item => item.value);
	const select = async <T extends { id: string }>(title: string, records: T[], label: (record: T) => string): Promise<{ entry?: T } | undefined> => {
		const result = await quick.pick([...records.map(entry => ({ label: label(entry), entry: entry as T | undefined })), { label: localize('ade.blueprint.new', "Create New"), entry: undefined as T | undefined }], { title });
		return result ? { entry: result.entry } : undefined;
	};
	const knowledge = async (title: string, current?: Knowledge, scalar?: string | number | boolean | null): Promise<Knowledge | undefined> => {
		const state = await choose(title, [{ label: localize('ade.blueprint.known', "Known Value"), value: 'known' }, { label: localize('ade.blueprint.unknown', "Unknown — Requires Clarification"), value: 'unknown' }, { label: localize('ade.blueprint.omitted', "Explicitly Omitted"), value: 'omitted' }]);
		if (!state) { return; } if (state === 'omitted') { return { state }; }
		if (state === 'unknown') { const reason = await input(localize('ade.blueprint.reason', "Reason"), current?.state === 'unknown' ? current.reason : '', true); return reason === undefined ? undefined : { state, reason }; }
		const value = await input(title, String(current?.state === 'known' ? current.value ?? '' : scalar ?? ''), typeof scalar === 'string'); if (value === undefined) { return; }
		if (typeof scalar === 'boolean' && !['true', 'false'].includes(value) || typeof scalar === 'number' && (!value.trim() || !Number.isFinite(Number(value)))) { throw new Error(localize('ade.blueprint.scalar', "Enter a value with the declared scalar type.")); }
		return { state, value: scalar === null ? null : typeof scalar === 'boolean' ? value === 'true' : typeof scalar === 'number' ? Number(value) : value };
	};
	const typeId = async () => (await quick.pick(model.foundation.types.map(type => ({ label: type.name, value: type.id })), { title: localize('ade.blueprint.type', "Declared Type") }))?.value;
	const field = async (previous?: ModelField): Promise<ModelField | undefined> => {
		const name = await input(localize('ade.blueprint.fieldName', "Field Name"), previous?.name, true); if (name === undefined) { return; }
		const type = await typeId(); if (!type) { return; }
		const presence = await choose(localize('ade.blueprint.presence', "Field Presence"), [{ label: localize('ade.blueprint.requiredField', "Required"), value: 'required' }, { label: localize('ade.blueprint.optionalField', "Optional"), value: 'optional' }]); if (!presence) { return; }
		const nullable = await choose(localize('ade.blueprint.nullable', "Nullability (Independent of Presence)"), [{ label: localize('ade.blueprint.notNull', "Non-null Value"), value: 'no' }, { label: localize('ade.blueprint.null', "Null Allowed"), value: 'yes' }, { label: localize('ade.blueprint.nullUnknown', "Unknown"), value: 'unknown' }]); if (!nullable) { return; }
		return { id: previous?.id ?? generateUuid(), name, type: '', typeId: type, required: presence === 'required', nullable: nullable === 'unknown' ? { state: 'unknown', reason: localize('ade.blueprint.nullPending', "Nullability requires a design decision.") } : { state: 'known', value: nullable === 'yes' } };
	};
	const lines = async (title: string, current: string[]) => { const result = await input(title, current.join('; ')); return result === undefined ? undefined : result.split(';').map(value => value.trim()).filter(Boolean); };
	const subject = async (): Promise<{ reference: ModelReference; field: string; value: string | number | boolean | null } | undefined> => {
		const all = modelObjects(model); const choices = [...all.entries()].filter(([, value]) => !('history' in value));
		const chosen = await quick.pick(choices.map(([key, value]) => ({ label: 'name' in value && typeof value.name === 'string' ? value.name : 'title' in value && typeof value.title === 'string' ? value.title : model.semantics.elements.find(element => 'elementId' in value && element.id === value.elementId)?.name ?? key, key, value })), { title: localize('ade.blueprint.subject', "Constraint or Assertion Subject") }); if (!chosen) { return; }
		const scalars: { label: string; path: string; value: string | number | boolean | null }[] = [];
		const collect = (value: object, path = '') => { for (const [key, child] of Object.entries(value)) { const next = `${path}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`; if (child === null || ['string', 'number', 'boolean'].includes(typeof child)) { scalars.push({ label: next, path: next, value: child }); } else if (child && typeof child === 'object' && !Array.isArray(child)) { collect(child, next); } } };
		collect(chosen.value); const picked = await quick.pick(scalars, { title: localize('ade.blueprint.property', "Declared Property") }); if (!picked) { return; }
		const split = chosen.key.indexOf(':'); return { reference: { kind: chosen.key.slice(0, split) as ModelReference['kind'], id: chosen.key.slice(split + 1) }, field: picked.path, value: picked.value };
	};
	const categories = [
		{ label: localize('ade.blueprint.c4', "C4 View Subject and Context"), value: 'c4' },
		{ label: localize('ade.blueprint.scope', "System Scope or Container Responsibility"), value: 'scope' },
		{ label: localize('ade.blueprint.owner', "Architectural or Lifecycle Owner"), value: 'owner' },
		{ label: localize('ade.blueprint.membership', "Feature Memberships"), value: 'membership' },
		{ label: localize('ade.blueprint.integration', "External Integration"), value: 'integration' },
		{ label: localize('ade.blueprint.binding', "Platform Binding"), value: 'binding' },
		{ label: localize('ade.blueprint.types', "Shared Types"), value: 'types' },
		{ label: localize('ade.blueprint.operations', "Shared Operations"), value: 'operations' },
		{ label: localize('ade.blueprint.interfaces', "Interfaces and Invariants"), value: 'interfaces' },
		{ label: localize('ade.blueprint.ports', "Provided or Required Interface"), value: 'ports' },
		{ label: localize('ade.blueprint.connections', "Interface Connection"), value: 'connections' },
		{ label: localize('ade.blueprint.transports', "Transport Contract"), value: 'transports' },
		{ label: localize('ade.blueprint.modules', "Shared Library Binding"), value: 'modules' },
		{ label: localize('ade.blueprint.mapping', "Domain Field Mapping"), value: 'mapping' },
		{ label: localize('ade.blueprint.assertion', "Knowledge and Acceptance"), value: 'assertion' },
		{ label: localize('ade.blueprint.decisions', "Project Architecture Decisions"), value: 'decision' }
	];
	const category = mode ?? await choose(localize('ade.blueprint.edit', "Edit Blueprint"), categories); if (!category) { return; }
	const id = selectedId || (['scope', 'owner', 'membership', 'integration', 'binding', 'ports'].includes(category) ? await element(localize('ade.blueprint.element', "Element")) : undefined);
	const emit = <K extends keyof ModelBlueprint>(section: K, entry: ModelBlueprint[K][number]): VisualEdit[] => [{ kind: 'blueprint', section, entry }];
	if (category === 'c4') {
		const picked = await select(localize('ade.blueprint.c4', "C4 View Subject and Context"), model.views.filter(view => ['c4Context', 'c4Container', 'c4Component', 'class'].includes(view.kind)), view => view.name); if (!picked) { return; }
		const existing = picked.entry ?? activeView;
		const kind = await choose(localize('ade.blueprint.level', "C4 Level"), [{ label: localize('ade.blueprint.l1', "L1 · System Context"), value: 'c4Context' }, { label: localize('ade.blueprint.l2', "L2 · Containers"), value: 'c4Container' }, { label: localize('ade.blueprint.l3', "L3 · Components"), value: 'c4Component' }, { label: localize('ade.blueprint.l4', "L4 · Contract"), value: 'class' }]); if (!kind) { return; }
		const subjectId = await element(localize('ade.blueprint.viewSubject', "View Subject"), element => kind === 'c4Context' || kind === 'c4Container' ? element.kind === 'system' && element.scope === 'governed' : kind === 'c4Component' ? element.kind === 'container' : ['interface', 'contract', 'class'].includes(element.kind)); if (!subjectId) { return; }
		const name = await input(localize('ade.blueprint.viewName', "View Name"), picked.entry?.name, true); if (name === undefined) { return; }
		const contextIds = await manyElements(localize('ade.blueprint.context', "Context Dependencies (Outside the Subject)"), existing?.contextIds); if (!contextIds) { return; }
		const nodeIds = await manyElements(localize('ade.blueprint.viewElements', "Visible Elements"), existing?.nodes.map(node => node.elementId) ?? [subjectId]); if (!nodeIds) { return; }
		const visible = new Set(nodeIds); const previous = picked.entry;
		return [{ kind: 'c4View', view: { id: previous?.id ?? generateUuid(), name, kind, subjectId, contextIds, nodes: nodeIds.map((elementId, index) => previous?.nodes.find(node => node.elementId === elementId) ?? { elementId, x: index % 3 * 260, y: Math.floor(index / 3) * 180 }), relationIds: model.semantics.relations.filter(relation => visible.has(relation.from) && visible.has(relation.to)).map(relation => relation.id) } }];
	}
	if (category === 'scope' && id) {
		const target = model.semantics.elements.find(element => element.id === id);
		if (target?.kind === 'system') { const scope = await choose(localize('ade.blueprint.scope', "System Scope or Container Responsibility"), [{ label: localize('ade.blueprint.governed', "Governed System"), value: 'governed' }, { label: localize('ade.blueprint.external', "External System"), value: 'external' }]); return scope ? [{ kind: 'elementScope', id, scope }] : undefined; }
		const description = await input(localize('ade.blueprint.responsibility', "Responsibility"), target?.description, true); if (description === undefined) { return; }
		if (target?.kind !== 'container') { return [{ kind: 'description', id, description }]; }
		const runtimeKind = await choose(localize('ade.blueprint.runtimeRole', "Container Role"), [{ label: localize('ade.blueprint.application', "Application"), value: 'application' }, { label: localize('ade.blueprint.service', "Service"), value: 'service' }, { label: localize('ade.blueprint.spa', "Web Client"), value: 'spa' }, { label: localize('ade.blueprint.mobile', "Mobile Client"), value: 'mobile' }, { label: localize('ade.blueprint.store', "Data Store"), value: 'store' }, { label: localize('ade.blueprint.messaging', "Messaging"), value: 'messaging' }]); return runtimeKind ? [{ kind: 'description', id, description }, { kind: 'elementScope', id, runtimeKind }] : undefined;
	}
	if (category === 'owner' && id) {
		const ownerId = await element(localize('ade.blueprint.owner', "Architectural or Lifecycle Owner"), element => element.id !== id); if (!ownerId) { return; }
		const role = await choose(localize('ade.blueprint.ownershipRole', "Ownership Role"), [{ label: localize('ade.blueprint.architecture', "Architecture"), value: 'architecture' }, { label: localize('ade.blueprint.lifecycle', "Lifecycle"), value: 'lifecycle' }]);
		return role ? [{ kind: 'ownership', entry: { id: model.foundation.ownership.find(entry => entry.elementId === id)?.id ?? generateUuid(), elementId: id, ownerId, role } }] : undefined;
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
		const picked = focused ? { entry: focused } : await select(localize('ade.blueprint.types', "Shared Types"), model.foundation.types, entry => entry.name); if (!picked) { return; }
		const entry: ModelType = structuredClone(picked.entry ?? { id: generateUuid(), name: '', kind: 'record', fields: [] });
		if (!picked.entry) {
			const name = await input(localize('ade.blueprint.typeName', "Type Name"), '', true); if (name === undefined) { return; } entry.name = name;
			const kind = await choose(localize('ade.blueprint.typeKind', "Type Kind"), [{ label: localize('ade.blueprint.primitive', "Primitive"), value: 'primitive' }, { label: localize('ade.blueprint.record', "Record"), value: 'record' }, { label: localize('ade.blueprint.enum', "Enumeration"), value: 'enum' }, { label: localize('ade.blueprint.collection', "Collection"), value: 'collection' }, { label: localize('ade.blueprint.reference', "Reference"), value: 'reference' }]); if (!kind) { return; } entry.kind = kind;
			if (kind === 'primitive') { const primitive = await input(localize('ade.blueprint.primitiveName', "Primitive Defined by the Selected Profile"), '', true); if (!primitive) { return; } entry.primitive = primitive; }
			if (kind === 'enum') { const values = await lines(localize('ade.blueprint.enumValues', "Values (Separated by Semicolons)"), []); if (!values?.length) { return; } entry.values = values; }
			if (kind === 'collection' || kind === 'reference') { const target = await typeId(); if (!target) { return; } if (kind === 'collection') { entry.itemTypeId = target; } else { entry.targetTypeId = target; } }
		} else {
			const action = await choose(localize('ade.blueprint.typeEdit', "Edit Type"), [{ label: localize('ade.blueprint.rename', "Rename"), value: 'name' }, { label: localize('ade.blueprint.fields', "Add or Edit Field"), value: 'field' }, { label: localize('ade.blueprint.definition', "Edit Type Definition"), value: 'definition' }, { label: localize('ade.blueprint.removeField', "Remove Field"), value: 'removeField' }, { label: localize('ade.blueprint.constraints', "Add Type Constraint"), value: 'constraint' }]); if (!action) { return; }
			if (action === 'name') { const name = await input(localize('ade.blueprint.typeName', "Type Name"), entry.name, true); if (name === undefined) { return; } entry.name = name; }
			if (action === 'definition') {
				if (entry.kind === 'primitive') { const value = await input(localize('ade.blueprint.primitiveName', "Primitive Defined by the Selected Profile"), entry.primitive, true); if (!value) { return; } entry.primitive = value; }
				else if (entry.kind === 'enum') { const values = await lines(localize('ade.blueprint.enumValues', "Values (Separated by Semicolons)"), entry.values ?? []); if (!values?.length) { return; } entry.values = values; }
				else if (entry.kind === 'collection' || entry.kind === 'reference') { const target = await typeId(); if (!target) { return; } if (entry.kind === 'collection') { entry.itemTypeId = target; } else { entry.targetTypeId = target; } }
			}
			if (action === 'removeField') { const picked = await quick.pick(entry.fields.map(field => ({ label: field.name, field })), { title: localize('ade.blueprint.removeField', "Remove Field") }); if (!picked) { return; } entry.fields = entry.fields.filter(field => field.id !== picked.field.id); }
			if (action === 'field') { if (entry.kind && entry.kind !== 'record') { return; } const selected = await select(localize('ade.blueprint.fields', "Add or Edit Field"), entry.fields.filter((field): field is ModelField & { id: string } => !!field.id), field => field.name); if (!selected) { return; } const updated = await field(selected.entry); if (!updated) { return; } entry.fields = [...entry.fields.filter(field => field.id !== updated.id), updated]; }
			if (action === 'constraint') { const kind = await choose(localize('ade.blueprint.constraintKind', "Type Constraint"), [{ label: localize('ade.blueprint.minimum', "Minimum"), value: 'minimum' }, { label: localize('ade.blueprint.maximum', "Maximum"), value: 'maximum' }, { label: localize('ade.blueprint.pattern', "Pattern"), value: 'pattern' }, { label: localize('ade.blueprint.minLength', "Minimum Length"), value: 'minLength' }, { label: localize('ade.blueprint.maxLength', "Maximum Length"), value: 'maxLength' }]); if (!kind) { return; } const value = await input(localize('ade.blueprint.constraintValue', "Constraint Value"), '', true); if (value === undefined) { return; } if (kind !== 'pattern' && !Number.isFinite(Number(value))) { throw new Error(localize('ade.blueprint.number', "Enter a finite number.")); } entry.constraints = [...(entry.constraints ?? []), { id: generateUuid(), kind, value: kind === 'pattern' ? value : Number(value) }]; }
		}
		return [{ kind: 'type', entry }];
	}
	if (category === 'operations') {
		const focused = mode === 'operations' ? b.operations.find(entry => entry.id === selectedId) : undefined;
		const picked = focused ? { entry: focused } : await select(localize('ade.blueprint.operations', "Shared Operations"), b.operations, operation => operation.name); if (!picked) { return; }
		const entry: ModelOperation = picked.entry ?? { id: generateUuid(), ownerId: '', name: '', inputs: [], outputs: [], errors: [], effects: [], preconditions: [], postconditions: [], permissions: [], acceptanceCriteria: [] };
		if (!picked.entry) { const ownerId = await element(localize('ade.blueprint.operationOwner', "Operation Owner"), element => ['contract', 'interface', 'component', 'controller', 'class'].includes(element.kind)); if (!ownerId) { return; } entry.ownerId = ownerId; const name = await input(localize('ade.blueprint.operationName', "Operation Name"), '', true); if (name === undefined) { return; } entry.name = name; }
		else {
			const action = await choose(localize('ade.blueprint.operationEdit', "Edit Operation"), [{ label: localize('ade.blueprint.rename', "Rename"), value: 'name' }, { label: localize('ade.blueprint.inputs', "Input Parameters"), value: 'inputs' }, { label: localize('ade.blueprint.outputs', "Results"), value: 'outputs' }, { label: localize('ade.blueprint.errors', "Typed Errors"), value: 'errors' }, { label: localize('ade.blueprint.effects', "Declared Effects"), value: 'effects' }, { label: localize('ade.blueprint.pre', "Preconditions (Descriptive)"), value: 'preconditions' }, { label: localize('ade.blueprint.post', "Postconditions (Descriptive)"), value: 'postconditions' }, { label: localize('ade.blueprint.permissions', "Permissions"), value: 'permissions' }, { label: localize('ade.blueprint.acceptance', "Acceptance Criteria"), value: 'acceptanceCriteria' }, { label: localize('ade.blueprint.removeContractMember', "Remove Contract Member"), value: 'remove' }]); if (!action) { return; }
			if (action === 'remove') {
				const entries = [...entry.inputs.map(field => ({ label: localize('ade.blueprint.inputField', "Input · {0}", field.name), kind: 'inputs' as const, id: field.id })), ...entry.outputs.map(field => ({ label: localize('ade.blueprint.outputField', "Result · {0}", field.name), kind: 'outputs' as const, id: field.id })), ...entry.errors.map(error => ({ label: error.code, kind: 'errors' as const, id: error.id })), ...entry.acceptanceCriteria.map(criterion => ({ label: criterion.then, kind: 'acceptanceCriteria' as const, id: criterion.id }))];
				const picked = await quick.pick(entries, { title: localize('ade.blueprint.removeContractMember', "Remove Contract Member") }); if (!picked) { return; }
				Object.assign(entry, { [picked.kind]: entry[picked.kind].filter(member => member.id !== picked.id) }); return emit('operations', entry);
			}
			if (action === 'name') { const name = await input(localize('ade.blueprint.operationName', "Operation Name"), entry.name, true); if (name === undefined) { return; } entry.name = name; }
			else if (action === 'inputs' || action === 'outputs') { const selected = await select(localize('ade.blueprint.fieldName', "Field Name"), entry[action].filter((field): field is ModelField & { id: string } => !!field.id), field => field.name); if (!selected) { return; } const updated = await field(selected.entry); if (!updated) { return; } entry[action] = [...entry[action].filter(field => field.id !== updated.id), updated]; }
			else if (action === 'errors') { const selected = await select(localize('ade.blueprint.errors', "Typed Errors"), entry.errors, error => error.code); if (!selected) { return; } const code = await input(localize('ade.blueprint.errorCode', "Error Code"), selected.entry?.code, true); if (code === undefined) { return; } const description = await input(localize('ade.blueprint.errorDescription', "Error Description"), selected.entry?.description); if (description === undefined) { return; } const type = await typeId(); if (!type) { return; } const updated = { id: selected.entry?.id ?? generateUuid(), code, description, typeId: type }; entry.errors = [...entry.errors.filter(error => error.id !== updated.id), updated]; }
			else if (action === 'permissions') { const actorId = await element(localize('ade.blueprint.actor', "Authorized Actor"), element => element.kind === 'actor'); if (!actorId) { return; } const capability = await input(localize('ade.blueprint.capability', "Required Capability"), '', true); if (!capability) { return; } entry.permissions.push({ actorId, capability }); }
			else if (action === 'acceptanceCriteria') { const given = await input(localize('ade.blueprint.given', "Given"), '', true); if (given === undefined) { return; } const when = await input(localize('ade.blueprint.when', "When"), '', true); if (when === undefined) { return; } const then = await input(localize('ade.blueprint.then', "Then"), '', true); if (then === undefined) { return; } entry.acceptanceCriteria.push({ id: generateUuid(), given, when, then }); }
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
		const contract = await quick.pick(b.interfaces.map(contract => ({ label: model.semantics.elements.find(element => element.id === contract.elementId)?.name ?? contract.id, contract })), { title: localize('ade.blueprint.interfaces', "Interfaces and Invariants") }); if (!contract) { return; }
		const direction = await choose(localize('ade.blueprint.portDirection', "Interface Direction"), [{ label: localize('ade.blueprint.provided', "Provided"), value: 'provided' }, { label: localize('ade.blueprint.requiredPort', "Required"), value: 'required' }]); return direction ? emit('ports', { id: picked.entry?.id ?? generateUuid(), elementId: id, interfaceId: contract.contract.id, direction }) : undefined;
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
		const relation = await quick.pick(model.semantics.relations.map(relation => ({ label: relation.name, relation })), { title: localize('ade.blueprint.relation', "Transport Relationship") }); if (!relation) { return; }
		const previous = b.transports.find(transport => transport.relationId === relation.relation.id);
		const protocol = await input(localize('ade.blueprint.protocol', "Protocol"), previous?.protocol, true); if (!protocol) { return; }
		const format = await input(localize('ade.blueprint.format', "Payload Format"), previous?.format, true); if (!format) { return; }
		const schemaTypeId = await typeId(); if (!schemaTypeId) { return; }
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
		const picked = await select(localize('ade.blueprint.assertion', "Knowledge and Acceptance"), model.foundation.assertions, assertion => `${assertion.subject.kind} · ${assertion.field}`); if (!picked) { return; }
		const target = await subject(); if (!target) { return; } const value = await knowledge(localize('ade.blueprint.asserted', "Declared Value"), picked.entry?.value, target.value); if (!value) { return; }
		const status = await choose(localize('ade.blueprint.acceptanceStatus', "Acceptance (Independent of Verification)"), [{ label: localize('ade.blueprint.proposed', "Proposed"), value: 'proposed' }, { label: localize('ade.blueprint.accepted', "Accepted"), value: 'accepted' }, { label: localize('ade.blueprint.rejected', "Rejected"), value: 'rejected' }]); if (!status) { return; }
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
