import * as dom from '../../../../base/browser/dom.js';
import { equals } from '../../../../base/common/objects.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { getContractImpact, getContractProjection } from '../common/modelBlueprint.js';
import { blueprintRules, type Knowledge, type ModelBlueprint, type ModelField, type ModelOperation, type ModelType, type SemanticElement, type SemanticModelV4 } from '../common/modelTypes.js';
import { getElementPath } from '../common/visualNavigation.js';
import { type BlueprintEditMode } from './orditoBlueprintEditing.js';
import { type BlueprintActivity, type BlueprintActivityContext, type BlueprintForm, type BlueprintOption } from './orditoBlueprintForm.js';
import { elementLabels } from './orditoLabels.js';

type TypeKind = NonNullable<ModelType['kind']>;
type TypeConstraint = NonNullable<ModelType['constraints']>[number];
type InterfaceRecord = ModelBlueprint['interfaces'][number];

const typeKinds: Record<TypeKind, string> = {
	record: localize('ordito.blueprint.data.record', "Record"),
	primitive: localize('ordito.blueprint.data.primitive', "Primitive"),
	enum: localize('ordito.blueprint.data.enum', "Enumeration"),
	collection: localize('ordito.blueprint.data.collection', "Collection"),
	reference: localize('ordito.blueprint.data.reference', "Reference"),
};

const constraintKinds: Record<TypeConstraint['kind'], string> = {
	minimum: localize('ordito.blueprint.data.minimum', "Minimum"),
	maximum: localize('ordito.blueprint.data.maximum', "Maximum"),
	pattern: localize('ordito.blueprint.data.pattern', "Pattern"),
	minLength: localize('ordito.blueprint.data.minLength', "Minimum Length"),
	maxLength: localize('ordito.blueprint.data.maxLength', "Maximum Length"),
};

function typeOptions(model: SemanticModelV4): BlueprintOption[] {
	const types = model.foundation.types;
	return types.map(type => ({
		id: type.id,
		label: type.name,
		description: [typeKinds[type.kind ?? 'record'], type.primitive, types.some(other => other.id !== type.id && other.name === type.name) ? type.id : undefined].filter(Boolean).join(' · '),
	}));
}

function typeSelect(form: BlueprintForm, parent: HTMLElement, label: string, selected?: string, fallback?: BlueprintOption, exclude?: string): HTMLSelectElement {
	const options = (current?: string) => {
		const choices = typeOptions(form.context.model).filter(option => option.id !== exclude);
		if (fallback && !choices.some(option => option.id === fallback.id)) { choices.unshift(fallback); }
		if (current && !choices.some(option => option.id === current)) { choices.unshift({ id: current, label: current }); }
		return choices;
	};
	let previous = options(selected);
	const control = form.select(parent, label, previous, selected, { required: true });
	form.onShow(() => {
		if (!parent.contains(control) || !form.element.contains(control)) { return; }
		const current = control.value;
		const choices = options(current);
		if (equals(choices, previous)) { return; }
		previous = choices;
		const placeholder = Array.from(control.options).find(option => !option.value);
		const next = choices.map(choice => {
			const option = control.ownerDocument.createElement('option');
			option.value = choice.id;
			option.textContent = [choice.label, choice.description].filter(Boolean).join(' · ');
			return option;
		});
		control.replaceChildren(...(placeholder ? [placeholder, ...next] : next));
		control.value = current;
	});
	return control;
}

function elementOption(model: SemanticModelV4, element: SemanticElement): BlueprintOption {
	return {
		id: element.id,
		label: element.name,
		description: [elementLabels[element.kind], ...getElementPath(model, element.id).slice(0, -1).map(parent => parent.name), model.semantics.elements.some(other => other.id !== element.id && other.name === element.name) ? element.id : undefined].filter(Boolean).join(' · '),
	};
}

function operationOption(model: SemanticModelV4, operation: ModelOperation): BlueprintOption {
	const signature = (fields: ModelField[]) => fields.map(field => {
		const type = model.foundation.types.find(type => type.id === field.typeId)?.name ?? field.typeId ?? field.type;
		const nullable = field.nullable?.state === 'known' && field.nullable.value ? ' | null' : field.nullable?.state === 'unknown' ? ' | ?' : '';
		return `${field.name}${field.required ? '' : '?'}: ${type}${nullable}`;
	}).join(', ');
	const owner = model.semantics.elements.find(element => element.id === operation.ownerId)?.name ?? operation.ownerId;
	const overloaded = model.foundation.blueprint?.operations.some(other => other.id !== operation.id && other.name === operation.name);
	return { id: operation.id, label: operation.name, description: [owner, `(${signature(operation.inputs)}) → (${signature(operation.outputs)})`, overloaded ? operation.id : undefined].filter(Boolean).join(' · ') };
}

/** Keep authored order and retain the reader and identity of each row across edits. */
function repeat<T, R = T>(form: BlueprintForm, parent: HTMLElement, initial: readonly T[], addLabel: string, build: (row: HTMLElement, previous?: T) => { read: () => R; focus: HTMLElement }, options: { minRows?: number; onRowsChange?: () => void } = {}): () => R[] {
	const minRows = options.minRows ?? 0;
	const rows: { read: () => R; remove: HTMLButtonElement }[] = [];
	const list = dom.append(parent, dom.$('div.ordito-blueprint-form-rows'));
	const updateRemoval = () => {
		rows.forEach((row, index) => {
			row.remove.disabled = rows.length <= minRows;
			row.remove.setAttribute('aria-label', localize('ordito.blueprint.data.removeRowNumber', "Remove Row {0}", index + 1));
		});
	};
	const append = (previous?: T) => {
		const wrapper = dom.append(list, dom.$('div.ordito-blueprint-form-row'));
		const { read, focus } = build(wrapper, previous);
		const entry = { read, remove: form.action(wrapper, localize('ordito.blueprint.data.removeRow', "Remove"), () => {
			const index = rows.indexOf(entry);
			rows.splice(index, 1);
			wrapper.remove();
			updateRemoval();
			const adjacent = rows[index]?.remove ?? rows[index - 1]?.remove;
			(adjacent && !adjacent.disabled ? adjacent : add).focus();
			options.onRowsChange?.();
			form.changed();
		}) };
		rows.push(entry);
		updateRemoval();
		return focus;
	};
	for (const previous of initial) { append(previous); }
	while (rows.length < minRows) { append(); }
	const add = form.action(parent, addLabel, () => {
		append().focus();
		options.onRowsChange?.();
		form.changed();
	});
	return () => rows.map(row => row.read());
}

function readNullable(value: string, previous?: Knowledge): Knowledge | undefined {
	switch (value) {
		case 'yes': return { state: 'known', value: true };
		case 'no': return { state: 'known', value: false };
		case 'omitted': return { state: 'omitted' };
		case 'unknown': return previous?.state === 'unknown' ? previous : { state: 'unknown', reason: localize('ordito.blueprint.data.nullPending', "Nullability requires a design decision.") };
		default: return previous;
	}
}

function fieldList(form: BlueprintForm, parent: HTMLElement, fields: ModelField[], addLabel: string): () => ModelField[] {
	return repeat(form, parent, fields, addLabel, (row, previous) => {
		const name = form.text(row, localize('ordito.blueprint.data.fieldName', "Name"), previous?.name, { required: true });
		const legacyId = previous && !previous.typeId ? generateUuid() : undefined;
		const fallbackId = previous?.typeId ?? legacyId;
		const fallback = fallbackId ? { id: fallbackId, label: previous?.type || previous?.typeId || localize('ordito.blueprint.data.legacyType', "Legacy Type") } : undefined;
		const type = typeSelect(form, row, localize('ordito.blueprint.data.fieldKind', "Type"), fallbackId, fallback);
		const required = form.check(row, localize('ordito.blueprint.data.fieldRequired', "Required"), previous?.required ?? true);
		const nullableChoices: BlueprintOption[] = [
			{ id: 'no', label: localize('ordito.blueprint.data.notNull', "Non-null Value") },
			{ id: 'yes', label: localize('ordito.blueprint.data.null', "Null Allowed") },
			{ id: 'unknown', label: localize('ordito.blueprint.data.nullUnknown', "Unknown") },
		];
		const knowledge = previous?.nullable;
		if (previous && (!knowledge || knowledge.state === 'omitted')) {
			nullableChoices.push({ id: knowledge?.state ?? 'legacy', label: knowledge ? localize('ordito.blueprint.data.nullOmitted', "Omitted") : localize('ordito.blueprint.data.nullLegacy', "Unspecified") });
		}
		const selectedNullable = knowledge?.state === 'known' ? knowledge.value ? 'yes' : 'no' : knowledge?.state ?? (previous ? 'legacy' : 'no');
		const nullable = form.select(row, localize('ordito.blueprint.data.nullability', "Nullability"), nullableChoices, selectedNullable);
		const id = previous ? previous.id : generateUuid();
		return { focus: name, read: () => {
			const field: ModelField = { ...previous, name: name.value, required: required.checked, type: previous?.type ?? '' };
			const nullability = nullable.value === selectedNullable && previous ? previous.nullable : readNullable(nullable.value, knowledge);
			if (id) { field.id = id; }
			if (type.value !== legacyId && type.value !== previous?.typeId) { field.type = ''; field.typeId = type.value; }
			if (nullability) { field.nullable = nullability; }
			return field;
		} };
	});
}

function lineList(form: BlueprintForm, parent: HTMLElement, lines: string[], label: string, addLabel: string, minRows = 0): () => string[] {
	return repeat(form, parent, lines, addLabel, (row, previous) => {
		const input = form.text(row, label, previous, { required: true });
		return { focus: input, read: () => input.value };
	}, { minRows });
}

function constraintList(form: BlueprintForm, parent: HTMLElement, constraints: TypeConstraint[]): () => TypeConstraint[] {
	return repeat(form, parent, constraints, localize('ordito.blueprint.data.addConstraint', "Add Constraint"), (row, previous) => {
		const kind = form.select(row, localize('ordito.blueprint.data.constraintKind', "Constraint"), Object.entries(constraintKinds).map(([id, label]) => ({ id, label })), previous?.kind ?? 'minimum');
		const value = form.text(row, localize('ordito.blueprint.data.constraintValue', "Value"), previous ? String(previous.value) : undefined, { required: true });
		const unchanged = () => previous?.kind === kind.value && String(previous.value) === value.value;
		const validate = () => {
			let message = '';
			value.required = !unchanged();
			if (!value.required || !value.value.trim()) { value.setCustomValidity(''); return; }
			if (kind.value === 'pattern') {
				try { new RegExp(value.value); } catch { message = localize('ordito.blueprint.data.patternInvalid', "Enter a valid regular expression."); }
			} else {
				const number = Number(value.value);
				if (!Number.isFinite(number)) { message = localize('ordito.blueprint.data.numberInvalid', "Enter a finite number."); }
				else if ((kind.value === 'minLength' || kind.value === 'maxLength') && (!Number.isInteger(number) || number < 0)) { message = localize('ordito.blueprint.data.lengthInvalid', "Enter a non-negative integer."); }
			}
			value.setCustomValidity(message);
		};
		kind.addEventListener('change', validate);
		value.addEventListener('input', validate);
		validate();
		const id = previous?.id ?? generateUuid();
		return { focus: kind, read: () => previous && unchanged() ? previous : { id, kind: kind.value as TypeConstraint['kind'], value: kind.value === 'pattern' ? value.value : Number(value.value) } };
	});
}

function renderType(form: BlueprintForm, previous?: ModelType): void {
	const definitions = form.group(localize('ordito.blueprint.data.typeDefinition', "Type Definition"));
	const name = form.text(definitions, localize('ordito.blueprint.data.typeName', "Type Name"), previous?.name, { required: true });
	const previousKind = previous?.kind ?? 'record';
	const kind = previous ? undefined : form.select(definitions, localize('ordito.blueprint.data.typeKind', "Type Kind"), Object.entries(typeKinds).map(([id, label]) => ({ id, label })), 'record', { required: true });
	if (!kind) { form.note(definitions, typeKinds[previousKind]); }
	const activeKind = () => (kind?.value ?? previousKind) as TypeKind;
	const definitionsByKind = new Map<TypeKind, { group: HTMLElement; fields: HTMLFieldSetElement; read: () => Partial<ModelType> }>();
	const definition = (type: TypeKind, title: string, build: (group: HTMLElement) => () => Partial<ModelType>, description?: string) => {
		if (!kind && previousKind !== type) { return; }
		const group = form.group(title, description);
		const fields = dom.append(group, dom.$<HTMLFieldSetElement>('fieldset.ordito-blueprint-form-fieldset'));
		definitionsByKind.set(type, { group, fields, read: build(fields) });
	};
	definition('record', localize('ordito.blueprint.data.fields', "Fields"), group => {
		const fields = fieldList(form, group, previous?.fields ?? [], localize('ordito.blueprint.data.addField', "Add Field"));
		return () => ({ fields: fields() });
	}, localize('ordito.blueprint.data.fieldHelp', "Presence controls whether the field is supplied. Nullability controls whether its value can be null."));
	definition('primitive', localize('ordito.blueprint.data.primitive', "Primitive"), group => {
		const primitive = form.text(group, localize('ordito.blueprint.data.profilePrimitive', "Primitive Defined by the Profile"), previous?.primitive, { required: true });
		return () => ({ primitive: primitive.value });
	});
	definition('enum', localize('ordito.blueprint.data.enumValues', "Enumeration Values"), group => {
		const values = lineList(form, group, previous?.values ?? [], localize('ordito.blueprint.data.enumValue', "Value"), localize('ordito.blueprint.data.addEnumValue', "Add Value"), 1);
		return () => ({ values: values() });
	});
	for (const key of ['collection', 'reference'] as const) {
		definition(key, typeKinds[key], group => {
			const item = key === 'collection';
			const existing = item ? previous?.itemTypeId : previous?.targetTypeId;
			const target = typeSelect(form, group, item ? localize('ordito.blueprint.data.itemType', "Item Type") : localize('ordito.blueprint.data.targetType', "Referenced Type"), existing, undefined, previous?.id ?? form.newId);
			return () => item ? { itemTypeId: target.value } : { targetTypeId: target.value };
		});
	}
	const constraints = constraintList(form, form.group(localize('ordito.blueprint.data.constraints', "Type Constraints")), previous?.constraints ?? []);
	const showDefinition = () => {
		for (const [type, { group, fields }] of definitionsByKind) {
			group.hidden = fields.disabled = type !== activeKind();
		}
	};
	if (kind) { kind.addEventListener('change', showDefinition); showDefinition(); }
	form.onEdit(() => {
		const entry: ModelType = {
			...(previous ?? { id: form.newId, fields: [], kind: activeKind() }),
			name: name.value,
			...definitionsByKind.get(activeKind())?.read(),
		};
		const rules = constraints();
		if (rules.length || previous?.constraints) { entry.constraints = rules; }
		return equals(entry, previous) ? undefined : { kind: 'type', entry };
	});
}

function renderOperation(form: BlueprintForm, previous: ModelOperation | undefined, contextualOwner?: string): void {
	const { model } = form.context;
	const definitions = form.group(localize('ordito.blueprint.data.operationDefinition', "Operation"));
	const name = form.text(definitions, localize('ordito.blueprint.data.operationName', "Operation Name"), previous?.name, { required: true });
	const ownerChoices = model.semantics.elements.filter(element => blueprintRules.operationOwners.some(kind => kind === element.kind)).map(element => elementOption(model, element));
	const owner = previous ? undefined : form.select(definitions, localize('ordito.blueprint.data.operationOwner', "Operation Owner"), ownerChoices, contextualOwner, { required: true });
	if (previous) {
		form.note(definitions, localize('ordito.blueprint.data.ownerName', "Owner · {0}", model.semantics.elements.find(element => element.id === previous.ownerId)?.name ?? previous.ownerId));
	}
	const inputGroup = form.group(localize('ordito.blueprint.data.inputs', "Input Parameters"));
	const resultGroup = form.group(localize('ordito.blueprint.data.outputs', "Results"));
	const errorGroup = form.group(localize('ordito.blueprint.data.errors', "Typed Errors"));
	const signatureGroups = [definitions, inputGroup, resultGroup, errorGroup];
	const inputs = fieldList(form, inputGroup, previous?.inputs ?? [], localize('ordito.blueprint.data.addInput', "Add Input"));
	const outputs = fieldList(form, resultGroup, previous?.outputs ?? [], localize('ordito.blueprint.data.addResult', "Add Result"));
	const errors = repeat(form, errorGroup, previous?.errors ?? [], localize('ordito.blueprint.data.addError', "Add Error"), (row, error) => {
		const code = form.text(row, localize('ordito.blueprint.data.errorCode', "Error Code"), error?.code, { required: true });
		const description = form.text(row, localize('ordito.blueprint.data.errorDescription', "Description"), error?.description);
		const type = typeSelect(form, row, localize('ordito.blueprint.data.errorType', "Declared Type"), error?.typeId);
		const id = error?.id ?? generateUuid();
		return { focus: code, read: () => ({ id, code: code.value, description: description.value, typeId: type.value }) };
	});
	const behavior = form.group(localize('ordito.blueprint.data.descriptiveRules', "Descriptive Rules"), localize('ordito.blueprint.data.behaviorHelp', "These declarations describe the expected behavior of this operation."));
	const preconditions = lineList(form, behavior, previous?.preconditions ?? [], localize('ordito.blueprint.data.precondition', "Precondition"), localize('ordito.blueprint.data.addPrecondition', "Add Precondition"));
	const postconditions = lineList(form, behavior, previous?.postconditions ?? [], localize('ordito.blueprint.data.postcondition', "Postcondition"), localize('ordito.blueprint.data.addPostcondition', "Add Postcondition"));
	const effects = lineList(form, behavior, previous?.effects ?? [], localize('ordito.blueprint.data.effect', "Declared Effect"), localize('ordito.blueprint.data.addEffect', "Add Declared Effect"));
	const permissionGroup = form.group(localize('ordito.blueprint.data.permissions', "Permissions"));
	const actors = model.semantics.elements.filter(element => element.kind === 'actor').map(element => elementOption(model, element));
	const permissions = repeat(form, permissionGroup, previous?.permissions ?? [], localize('ordito.blueprint.data.addPermission', "Add Permission"), (row, permission) => {
		const available = permission && !actors.some(actor => actor.id === permission.actorId) ? [...actors, { id: permission.actorId, label: permission.actorId }] : actors;
		const actor = form.select(row, localize('ordito.blueprint.data.authorizedActor', "Authorized Actor"), available, permission?.actorId, { required: true });
		const capability = form.text(row, localize('ordito.blueprint.data.capability', "Required Capability"), permission?.capability, { required: true });
		return { focus: actor, read: () => ({ control: capability, entry: { actorId: actor.value, capability: capability.value === permission?.capability ? permission.capability : capability.value.trim() } }) };
	}, { onRowsChange: validatePermissions });
	function validatePermissions(): void {
		const rows = permissions();
		rows.forEach(({ control, entry }, index) => {
			const duplicate = entry.actorId && entry.capability && rows.some(({ entry: other }, position) => position !== index && other.actorId === entry.actorId && other.capability === entry.capability);
			control.setCustomValidity(duplicate ? localize('ordito.blueprint.data.permissionDuplicate', "This actor already requires that capability.") : '');
		});
	}
	permissionGroup.addEventListener('input', validatePermissions);
	permissionGroup.addEventListener('change', validatePermissions);
	const acceptanceGroup = form.group(localize('ordito.blueprint.data.acceptance', "Acceptance Criteria"));
	const acceptance = repeat(form, acceptanceGroup, previous?.acceptanceCriteria ?? [], localize('ordito.blueprint.data.addCriterion', "Add Criterion"), (row, criterion) => {
		const options = { required: true, multiline: true };
		const given = form.text(row, localize('ordito.blueprint.data.given', "Given"), criterion?.given, options);
		const when = form.text(row, localize('ordito.blueprint.data.when', "When"), criterion?.when, options);
		const then = form.text(row, localize('ordito.blueprint.data.then', "Then"), criterion?.then, options);
		const id = criterion?.id ?? generateUuid();
		return { focus: given, read: () => ({ id, given: given.value, when: when.value, then: then.value }) };
	});
	if (previous) {
		const impact = getContractImpact(model, previous.id);
		if (impact.interfaceIds.length || impact.occurrenceIds.length) {
			const usage = form.group(localize('ordito.blueprint.data.operationUsage', "Used In"));
			signatureGroups.push(usage);
			for (const record of model.foundation.blueprint?.interfaces.filter(record => impact.interfaceIds.includes(record.id)) ?? []) {
				const contractName = model.semantics.elements.find(element => element.id === record.elementId)?.name ?? record.elementId;
				form.action(usage, localize('ordito.blueprint.data.openContract', "{0} · Version {1}", contractName, record.version), () => form.context.open('interfaces', record.id));
			}
			if (impact.occurrenceIds.length) { form.note(usage, localize('ordito.blueprint.data.callCount', "Call occurrences · {0}", impact.occurrenceIds.length)); }
		}
	}
	form.tabs([
		{ id: 'signature', label: localize('ordito.blueprint.data.signatureTab', "Signature"), groups: signatureGroups },
		{ id: 'behavior', label: localize('ordito.blueprint.data.behaviorTab', "Behavior Rules"), groups: [behavior] },
		{ id: 'accessAcceptance', label: localize('ordito.blueprint.data.accessAcceptanceTab', "Access and Acceptance"), groups: [permissionGroup, acceptanceGroup] },
	]);
	form.onEdit(() => {
		validatePermissions();
		const entry: ModelOperation = {
			id: previous?.id ?? form.newId,
			ownerId: previous?.ownerId ?? owner?.value ?? '',
			name: name.value,
			inputs: inputs(), outputs: outputs(), errors: errors(),
			effects: effects(), preconditions: preconditions(), postconditions: postconditions(),
			permissions: permissions().map(row => row.entry), acceptanceCriteria: acceptance(),
		};
		return equals(entry, previous) ? undefined : { kind: 'blueprint', section: 'operations', entry };
	});
}

function renderInterface(form: BlueprintForm, previous?: InterfaceRecord): void {
	const { model, targetId } = form.context;
	const definitions = form.group(localize('ordito.blueprint.data.interfaceDefinition', "Contract Definition"), localize('ordito.blueprint.data.interfaceHelp', "A contract definition versions an existing contract or interface element and declares which operations it exposes."));
	const owners = model.semantics.elements.filter(element => blueprintRules.interfaceElements.some(kind => kind === element.kind)).map(element => elementOption(model, element));
	const selected = owners.find(owner => owner.id === targetId)?.id;
	const contract = previous ? undefined : form.select(definitions, localize('ordito.blueprint.data.interfaceElement', "Contract or Interface Element"), owners, selected, { required: true });
	if (previous) { form.note(definitions, model.semantics.elements.find(element => element.id === previous.elementId)?.name ?? previous.elementId); }
	const version = form.text(definitions, localize('ordito.blueprint.data.version', "Contract Version"), previous?.version, { required: true });
	const group = form.group(localize('ordito.blueprint.data.declaredOperations', "Declared Operations"), localize('ordito.blueprint.data.declaredOperationsHelp', "Choose from operations owned by the selected element."));
	const list = dom.append(group, dom.$('div'));
	const selectedByOwner = new Map<string, Set<string>>();
	if (previous) { selectedByOwner.set(previous.elementId, new Set(previous.operationIds)); }
	const elementId = () => previous?.elementId ?? contract?.value ?? '';
	let renderedOwner: string | undefined;
	let renderedOperations: BlueprintOption[] = [];
	const renderOperations = () => {
		const id = elementId();
		const currentModel = form.context.model;
		const owned = currentModel.foundation.blueprint?.operations.filter(operation => operation.ownerId === id).map(operation => operationOption(currentModel, operation)) ?? [];
		if (renderedOwner === id && equals(renderedOperations, owned)) { return; }
		renderedOwner = id;
		renderedOperations = owned;
		dom.clearNode(list);
		let checked = selectedByOwner.get(id);
		if (!checked) { checked = new Set(); selectedByOwner.set(id, checked); }
		const current = checked;
		if (!owned.length) {
			form.note(list, id ? localize('ordito.blueprint.data.noOwnedOperation', "This element has no shared operations.") : localize('ordito.blueprint.data.selectContract', "Select a contract or interface element."));
			if (id) { form.action(list, localize('ordito.blueprint.data.openOperations', "Open Shared Operations"), () => form.context.open('operations', id)); }
		}
		for (const operation of owned) {
			const label = [operation.label, operation.description].filter(Boolean).join(' · ');
			const input = form.check(list, label, current.has(operation.id));
			const update = () => { if (input.checked) { current.add(operation.id); } else { current.delete(operation.id); } };
			input.addEventListener('input', update);
			input.addEventListener('change', update);
			form.action(list, localize('ordito.blueprint.data.openOperation', "Open {0}", operation.label), () => form.context.open('operations', operation.id));
		}
	};
	contract?.addEventListener('change', renderOperations);
	renderOperations();
	form.onShow(renderOperations);
	const invariants = lineList(form, form.group(localize('ordito.blueprint.data.invariants', "Descriptive Invariants")), previous?.invariants ?? [], localize('ordito.blueprint.data.invariant', "Invariant"), localize('ordito.blueprint.data.addInvariant', "Add Invariant"));
	const linkedPorts = model.foundation.blueprint?.ports.filter(port => port.interfaceId === previous?.id) ?? [];
	if (linkedPorts.length) {
		const connections = form.group(localize('ordito.blueprint.data.interfaceBindings', "Interface Bindings"));
		for (const port of linkedPorts) {
			const owner = model.semantics.elements.find(element => element.id === port.elementId)?.name ?? port.elementId;
			const label = port.direction === 'provided' ? localize('ordito.blueprint.data.providedBy', "Provided by {0}", owner) : localize('ordito.blueprint.data.requiredBy', "Required by {0}", owner);
			form.action(connections, label, () => form.context.open('ports', port.id));
		}
	}
	form.onEdit(() => {
		const entry: InterfaceRecord = { id: previous?.id ?? form.newId, elementId: elementId(), version: version.value, operationIds: [...(selectedByOwner.get(elementId()) ?? [])], invariants: invariants() };
		return equals(entry, previous) ? undefined : { kind: 'blueprint', section: 'interfaces', entry };
	});
}

/** Resolve contextual data and operation targets while keeping each form available from the Blueprint index. */
export function blueprintDataActivity(mode: BlueprintEditMode, context: BlueprintActivityContext): BlueprintActivity | undefined {
	const { model, targetId } = context;
	if (mode === 'types') {
		return {
			records: typeOptions(model),
			initialId: model.foundation.types.find(type => type.id === targetId || !!targetId && type.fields.some(field => field.id === targetId))?.id,
			createLabel: localize('ordito.blueprint.data.newType', "New Shared Type"),
			render: (form, id) => renderType(form, model.foundation.types.find(type => type.id === id)),
		};
	}
	if (mode === 'operations') {
		const operations = model.foundation.blueprint?.operations ?? [];
		const initialId = operations.find(operation => operation.id === targetId || !!targetId && [...operation.inputs, ...operation.outputs, ...operation.errors, ...operation.acceptanceCriteria].some(member => member.id === targetId))?.id;
		const owner = model.semantics.elements.find(element => element.id === targetId && blueprintRules.operationOwners.some(kind => kind === element.kind));
		const related = owner ? getContractProjection(model, owner.id).operations : [];
		return {
			records: [...related, ...operations.filter(operation => !related.includes(operation))].map(operation => operationOption(model, operation)),
			initialId: initialId ?? related[0]?.id,
			createLabel: localize('ordito.blueprint.data.newOperation', "New Shared Operation"),
			render: (form, id) => renderOperation(form, operations.find(operation => operation.id === id), owner?.id),
		};
	}
	if (mode === 'interfaces') {
		const interfaces = model.foundation.blueprint?.interfaces ?? [];
		const related = targetId ? getContractProjection(model, targetId).contracts : [];
		return {
			records: [...related, ...interfaces.filter(record => !related.includes(record))].map(record => ({
				id: record.id,
				label: model.semantics.elements.find(element => element.id === record.elementId)?.name ?? record.elementId,
				description: localize('ordito.blueprint.data.versionLabel', "Version {0}", record.version),
			})),
			initialId: interfaces.find(record => record.id === targetId)?.id ?? related[0]?.id,
			createLabel: localize('ordito.blueprint.data.newContractDefinition', "Add Contract Definition"),
			render: (form, id) => renderInterface(form, interfaces.find(record => record.id === id)),
		};
	}
	return undefined;
}
