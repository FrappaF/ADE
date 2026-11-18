/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { equals } from '../../../../base/common/objects.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { modelObjects } from '../common/modelFoundation.js';
import { type DecisionConstraint, type DecisionStatus, type Knowledge, type ModelAssertion, type ModelDecision, type ModelReference, type SemanticModelV4 } from '../common/modelTypes.js';
import { type BlueprintEditMode } from './adeBlueprintEditing.js';
import { type BlueprintActivity, type BlueprintActivityContext, type BlueprintForm, type BlueprintOption } from './adeBlueprintForm.js';
import { elementLabels } from './adeLabels.js';

type Scalar = string | number | boolean | null;
interface Property extends BlueprintOption { value: Scalar }
interface SubjectChoice extends BlueprintOption { reference: ModelReference; object: object }
interface Address { subject: ModelReference; field: string }

const statusLabels: Record<DecisionStatus, string> = {
	proposed: localize('ade.blueprint.proposed', "Proposed"),
	accepted: localize('ade.blueprint.accepted', "Accepted"),
	rejected: localize('ade.blueprint.rejected', "Rejected"),
	deprecated: localize('ade.blueprint.deprecated', "Deprecated"),
	superseded: localize('ade.blueprint.superseded', "Superseded")
};
const knowledgeChoices: readonly BlueprintOption[] = [
	{ id: 'known', label: localize('ade.blueprint.known', "Known Value") },
	{ id: 'unknown', label: localize('ade.blueprint.unknown', "Unknown — Requires Clarification") },
	{ id: 'omitted', label: localize('ade.blueprint.omitted', "Explicitly Omitted") }
];
const categories: readonly { id: NonNullable<DecisionConstraint['category']>; label: string }[] = [
	{ id: 'technology', label: localize('ade.blueprint.technology', "Technology") },
	{ id: 'library', label: localize('ade.blueprint.library', "Library") },
	{ id: 'protocol', label: localize('ade.blueprint.protocol', "Protocol") },
	{ id: 'dependency', label: localize('ade.blueprint.dependency', "Dependency Boundary") },
	{ id: 'persistence', label: localize('ade.blueprint.persistence', "Persistence") },
	{ id: 'concurrency', label: localize('ade.blueprint.concurrency', "Concurrency") }
];

function decisionLabel(decision: ModelDecision): string {
	return decision.record ? localize('ade.blueprint.editor.decisionLabel', "{0} · {1}", decision.record.number, decision.record.title) : decision.id;
}

function subjectKey(reference: ModelReference): string {
	return `${reference.kind}:${reference.id}`;
}

function subjectChoices(model: SemanticModelV4): SubjectChoice[] {
	const elements = new Map(model.semantics.elements.map(element => [element.id, element]));
	const decisions = new Map(model.foundation.decisions.map(decision => [decision.id, decision]));
	return [...modelObjects(model)].flatMap(([id, object]) => {
		if (Object.hasOwn(object, 'history')) { return []; }
		const separator = id.indexOf(':');
		const reference = { kind: id.slice(0, separator) as ModelReference['kind'], id: id.slice(separator + 1) };
		const { name, title, elementId } = object as { name?: string; title?: string; elementId?: string };
		const decision = reference.kind === 'decision' ? decisions.get(reference.id) : undefined;
		const owner = elementId ? elements.get(elementId) : undefined;
		const label = decision ? decisionLabel(decision) : name || title || owner?.name || reference.id;
		return [{ id, label, description: localize('ade.blueprint.editor.subjectIdentity', "{0} · ID: {1}", reference.kind, reference.id), reference, object }];
	});
}

function currentSubjects(form: BlueprintForm): () => readonly SubjectChoice[] {
	let model: SemanticModelV4 | undefined;
	let choices: readonly SubjectChoice[] = [];
	return () => {
		if (model !== form.context.model) {
			model = form.context.model;
			choices = subjectChoices(model);
		}
		return choices;
	};
}

function refreshChoices(select: HTMLSelectElement, choices: readonly BlueprintOption[]): void {
	const current = select.value;
	const placeholder = select.options[0];
	select.replaceChildren(placeholder, ...choices.map(choice => {
		const option = dom.$<HTMLOptionElement>('option', { value: choice.id });
		option.textContent = choice.description ? localize('ade.blueprint.optionDetail', "{0} · {1}", choice.label, choice.description) : choice.label;
		return option;
	}));
	select.value = current;
}

function scalarProperties(object: object, path = ''): Property[] {
	const properties: Property[] = [];
	for (const [key, child] of Object.entries(object)) {
		const pointer = `${path}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`;
		if (child === null || typeof child === 'string' || typeof child === 'number' || typeof child === 'boolean') {
			properties.push({ id: pointer, label: pointer, value: child });
		} else if (child && typeof child === 'object') {
			properties.push(...scalarProperties(child, pointer));
		}
	}
	return properties;
}

function scalarLabel(value: Scalar): string {
	switch (value) {
		case null: return localize('ade.blueprint.editor.nullValue', "Null");
		case true: return localize('ade.blueprint.editor.trueValue', "True");
		case false: return localize('ade.blueprint.editor.falseValue', "False");
		case '': return localize('ade.blueprint.editor.emptyValue', "Empty String");
		default: return String(value);
	}
}

function validateText(input: HTMLInputElement | HTMLTextAreaElement, validate: (value: string) => string): void {
	const update = () => input.setCustomValidity(validate(input.value));
	input.addEventListener('input', update);
	update();
}

function readText(input: HTMLInputElement | HTMLTextAreaElement, original?: string): () => string {
	const initial = input.value;
	return () => input.value === initial && original !== undefined ? original : input.value;
}

function renderKnowledge(form: BlueprintForm, parent: HTMLElement, label: string, scalar: Scalar, previous?: Knowledge): () => Knowledge {
	const state = form.select(parent, label, knowledgeChoices, previous?.state ?? 'known', { required: true });
	const known = dom.append(parent, dom.$('div.ade-blueprint-fields'));
	const unknown = dom.append(parent, dom.$('div.ade-blueprint-fields'));
	const originalReason = previous?.state === 'unknown' ? previous.reason : undefined;
	const reason = form.text(unknown, localize('ade.blueprint.reason', "Reason"), originalReason, { required: originalReason === undefined || !!originalReason.trim(), multiline: true });
	const readReason = readText(reason, originalReason);
	validateText(reason, value => value.trim() || readReason() === originalReason ? '' : localize('ade.blueprint.editor.requiredReason', "Explain what remains to be clarified."));
	const initial = previous?.state === 'known' ? previous.value : scalar;
	const valueLabel = localize('ade.blueprint.editor.value', "Value");
	let value: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | undefined;
	if (typeof scalar === 'boolean') {
		value = form.select(known, valueLabel, [{ id: 'true', label: scalarLabel(true) }, { id: 'false', label: scalarLabel(false) }], String(typeof initial === 'boolean' ? initial : scalar), { required: true });
	} else if (scalar !== null) {
		const text = String(initial ?? '');
		value = form.text(known, valueLabel, text, { multiline: typeof scalar === 'string' && text.includes('\n'), required: typeof scalar === 'number' && (previous?.state !== 'known' || !!text.trim()) });
		if (typeof scalar === 'number') {
			validateText(value, input => previous?.state === 'known' && input === text || input.trim() && Number.isFinite(Number(input)) ? '' : localize('ade.blueprint.numberValue', "Enter a finite number."));
		}
	} else {
		form.note(known, localize('ade.blueprint.editor.propertyNull', "This property has a null value."));
	}
	const initialInput = value?.value;
	const update = () => {
		known.hidden = state.value !== 'known';
		unknown.hidden = state.value !== 'unknown';
		if (value) { value.disabled = known.hidden; }
		reason.disabled = unknown.hidden;
	};
	state.addEventListener('change', update);
	update();
	return () => {
		if (state.value === 'omitted') { return { state: 'omitted' }; }
		if (state.value === 'unknown') { return { state: 'unknown', reason: readReason() }; }
		if (previous?.state === 'known' && value?.value === initialInput) { return previous; }
		return { state: 'known', value: scalar === null ? null : typeof scalar === 'boolean' ? value?.value === 'true' : typeof scalar === 'number' ? Number(value?.value) : value?.value ?? '' };
	};
}

/** Render a declared property and its explicit knowledge together, so shape changes are visible inline. */
function renderClaim(form: BlueprintForm, parent: HTMLElement, getSubjects: () => readonly SubjectChoice[], label: string, previous?: { subject: ModelReference; field: string; value: Knowledge }): () => { subject: ModelReference; field: string; value: Knowledge } | undefined {
	const subjects = getSubjects();
	const initial = previous ? subjectKey(previous.subject) : subjects.find(choice => choice.reference.kind === 'element' && choice.reference.id === form.context.targetId)?.id ?? subjects.find(choice => choice.reference.id === form.context.targetId)?.id;
	const missing = previous ? {
		id: subjectKey(previous.subject), label: localize('ade.blueprint.editor.missingSubject', "Unavailable Object · {0}", previous.subject.id), reference: previous.subject, object: {}
	} : undefined;
	let choices = missing && !subjects.some(choice => choice.id === initial) ? [...subjects, missing] : subjects;
	const subject = form.select(parent, localize('ade.blueprint.editor.subject', "Model Object"), choices, initial, { required: true });
	form.onShow(() => {
		if (!form.element.contains(subject)) { return; }
		const next = getSubjects();
		const selected = choices.find(choice => choice.id === subject.value);
		choices = selected && !next.some(choice => choice.id === selected.id) ? [...next, selected] : next;
		refreshChoices(subject, choices);
	});
	const dependent = dom.append(parent, dom.$('div.ade-blueprint-fields'));
	let address: Address | undefined;
	let readKnowledge: (() => Knowledge) | undefined;
	const update = () => {
		dom.clearNode(dependent);
		address = undefined;
		readKnowledge = undefined;
		const choice = choices.find(choice => choice.id === subject.value);
		if (!choice) { return; }
		const properties = scalarProperties(choice.object);
		const sameSubject = choice.id === initial && previous !== undefined;
		const missingProperty = sameSubject && !properties.some(property => property.id === previous.field) ? previous.field : undefined;
		if (missingProperty) {
			properties.push({ id: missingProperty, label: localize('ade.blueprint.editor.missingProperty', "Unavailable Property · {0}", missingProperty), value: previous?.value.state === 'known' ? previous.value.value : null });
		}
		const property = form.select(dependent, localize('ade.blueprint.property', "Declared Property"), properties, sameSubject ? previous.field : undefined, { required: true });
		const valueControls = dom.append(dependent, dom.$('div.ade-blueprint-fields'));
		const updateValue = () => {
			dom.clearNode(valueControls);
			const selected = properties.find(item => item.id === property.value);
			address = selected ? { subject: choice.reference, field: selected.id } : undefined;
			readKnowledge = undefined;
			if (!selected) { return; }
			form.note(valueControls, selected.id === missingProperty ? localize('ade.blueprint.editor.chooseAvailableProperty', "Choose an available property to repair this reference.") : localize('ade.blueprint.editor.currentProperty', "Current property value: {0}", scalarLabel(selected.value)));
			readKnowledge = renderKnowledge(form, valueControls, label, selected.value, sameSubject && previous.field === selected.id ? previous.value : undefined);
		};
		property.addEventListener('change', updateValue);
		updateValue();
	};
	subject.addEventListener('change', update);
	update();
	return () => address && readKnowledge ? { subject: address.subject, field: address.field, value: readKnowledge() } : undefined;
}

function renderAssertion(form: BlueprintForm, previous?: ModelAssertion): void {
	const subjects = currentSubjects(form);
	const claim = form.group(localize('ade.blueprint.editor.declaration', "Declaration"));
	const readClaim = renderClaim(form, claim, subjects, localize('ade.blueprint.editor.knowledge', "Knowledge State"), previous);
	if (!subjects().length) { form.note(claim, localize('ade.blueprint.editor.noSubjects', "Add a model object before creating a declaration.")); }
	const acceptance = form.group(localize('ade.blueprint.editor.acceptance', "Acceptance"), localize('ade.blueprint.editor.acceptanceHelp', "Acceptance records the design decision independently of verification."));
	const status = form.select(acceptance, localize('ade.blueprint.editor.acceptanceStatus', "Acceptance Status"), (['proposed', 'accepted', 'rejected'] as const).map(id => ({ id, label: statusLabels[id] })), previous?.acceptance.status ?? 'proposed', { required: true });
	if (previous?.verification) {
		const outcome = { passed: localize('ade.blueprint.editor.verificationPassed', "Passed"), failed: localize('ade.blueprint.editor.verificationFailed', "Failed"), unknown: localize('ade.blueprint.editor.verificationUnknown', "Unknown") }[previous.verification.outcome];
		form.note(acceptance, localize('ade.blueprint.editor.verificationStatus', "Verification: {0}", outcome));
	}
	const provenanceRevision = generateUuid();
	const acceptanceRevision = generateUuid();
	form.onEdit(() => {
		const next = readClaim();
		if (!next) { return; }
		const acceptanceStatus = status.value as ModelAssertion['acceptance']['status'];
		const unchanged = previous && equals({ subject: previous.subject, field: previous.field, value: previous.value }, next);
		if (unchanged && previous.acceptance.status === acceptanceStatus) { return; }
		const entry: ModelAssertion = {
			...(unchanged ? previous : { id: previous?.id ?? form.newId, provenance: { kind: 'authored', producer: 'workbench', revision: provenanceRevision } }),
			...next,
			acceptance: { status: acceptanceStatus, revision: acceptanceRevision }
		};
		return { kind: 'assertion', entry };
	});
}

function renderConsequences(form: BlueprintForm, parent: HTMLElement, previous: readonly string[]): () => string[] {
	const list = dom.append(parent, dom.$('div.ade-blueprint-fields'));
	const readers = new Map<() => string, boolean>();
	const add = (value?: string) => {
		const row = dom.append(list, dom.$('div.ade-blueprint-fields'));
		const input = form.text(row, localize('ade.blueprint.editor.consequence', "Consequence"), value, { multiline: true });
		const read = readText(input, value);
		readers.set(read, value !== undefined && !value.trim());
		form.action(row, localize('ade.blueprint.editor.removeConsequence', "Remove Consequence"), () => {
			readers.delete(read);
			row.remove();
			addButton.focus();
			form.changed();
		});
		return input;
	};
	const addButton = form.action(parent, localize('ade.blueprint.editor.addConsequence', "Add Consequence"), () => {
		add().focus();
		form.changed();
	});
	for (const consequence of previous) { add(consequence); }
	return () => [...readers].flatMap(([read, keepEmpty]) => {
		const value = read();
		return value.trim() || keepEmpty ? [value] : [];
	});
}

function renderConstraints(form: BlueprintForm, parent: HTMLElement, getSubjects: () => readonly SubjectChoice[], previous: readonly DecisionConstraint[]): () => DecisionConstraint[] | undefined {
	const list = dom.append(parent, dom.$('div.ade-blueprint-fields'));
	const readers = new Set<() => DecisionConstraint | undefined>();
	const add = (constraint?: DecisionConstraint) => {
		const id = constraint?.id ?? generateUuid();
		const details = dom.append(list, dom.$<HTMLDetailsElement>('details'));
		const summary = dom.append(details, dom.$('summary'));
		summary.textContent = constraint ? localize('ade.blueprint.editor.constraintLabel', "Constraint · {0}", constraint.field) : localize('ade.blueprint.editor.newConstraint', "New Constraint");
		details.open = !constraint;
		const group = dom.append(details, dom.$('div.ade-blueprint-fields'));
		const category = form.select(group, localize('ade.blueprint.constraintCategory', "Normative Constraint Category"), constraint?.category === undefined && constraint ? [{ id: 'unspecified', label: localize('ade.blueprint.editor.unspecifiedCategory', "Unspecified") }, ...categories] : categories, constraint?.category ?? (constraint ? 'unspecified' : 'technology'), { required: true });
		const operators = [{ id: 'equals', label: localize('ade.blueprint.equals', "Require This Value") }, { id: 'notEquals', label: localize('ade.blueprint.notEquals', "Forbid This Value") }];
		const rule = form.select(group, localize('ade.blueprint.operator', "Constraint Rule"), constraint?.operator === undefined && constraint ? [{ id: 'default', label: localize('ade.blueprint.editor.defaultRule', "Require This Value (Default)") }, ...operators] : operators, constraint?.operator ?? (constraint ? 'default' : 'equals'), { required: true });
		const readClaim = renderClaim(form, group, getSubjects, localize('ade.blueprint.constraintValue', "Constraint Value"), constraint);
		const read = (): DecisionConstraint | undefined => {
			const claim = readClaim();
			if (!claim) { return; }
			return { id, ...claim, ...(category.value === 'unspecified' ? {} : { category: category.value as DecisionConstraint['category'] }), ...(rule.value === 'default' ? {} : { operator: rule.value as DecisionConstraint['operator'] }) };
		};
		readers.add(read);
		form.action(group, localize('ade.blueprint.editor.removeConstraint', "Remove Constraint"), () => {
			readers.delete(read);
			details.remove();
			addButton.focus();
			form.changed();
		});
		return summary;
	};
	const addButton = form.action(parent, localize('ade.blueprint.editor.addConstraint', "Add Constraint"), () => {
		add().focus();
		form.changed();
	});
	for (const constraint of previous) { add(constraint); }
	return () => {
		const constraints: DecisionConstraint[] = [];
		for (const read of readers) {
			const constraint = read();
			if (!constraint) { return; }
			constraints.push(constraint);
		}
		return constraints;
	};
}

function renderDecision(form: BlueprintForm, previous?: ModelDecision): void {
	const model = form.context.model;
	const record = previous?.record;
	const id = previous?.id ?? form.newId;
	const revision = generateUuid();
	const recordGroup = form.group(localize('ade.blueprint.editor.decisionRecord', "Decision Record"));
	const number = form.text(recordGroup, localize('ade.blueprint.adrNumber', "Decision Number"), record?.number, { required: true });
	const title = form.text(recordGroup, localize('ade.blueprint.adrTitle', "Decision Title"), record?.title, { required: true });
	const context = form.text(recordGroup, localize('ade.blueprint.adrContext', "Context"), record?.context, { multiline: true, required: !record || !!record.context.trim() });
	const decision = form.text(recordGroup, localize('ade.blueprint.adrDecision', "Decision"), record?.decision, { multiline: true, required: !record || !!record.decision.trim() });
	const readContext = readText(context, record?.context);
	const readDecision = readText(decision, record?.decision);
	for (const input of [number, title, context, decision]) {
		if (input.required) { validateText(input, value => value.trim() ? '' : localize('ade.blueprint.required', "Enter a value.")); }
	}
	const status = form.select(recordGroup, localize('ade.blueprint.status', "Decision Status"), Object.entries(statusLabels).map(([id, label]) => ({ id, label })), previous?.status ?? 'proposed', { required: true });
	status.disabled = !previous;
	const replacementGroup = dom.append(recordGroup, dom.$('div.ade-blueprint-fields'));
	const availableReplacements = (current?: string) => form.context.model.foundation.decisions.filter(entry => entry.id !== id && (entry.status === 'accepted' || entry.id === current)).map(entry => ({ id: entry.id, label: decisionLabel(entry) }));
	const replacements = availableReplacements(record?.supersededById);
	const replacement = form.select(replacementGroup, localize('ade.blueprint.replacement', "Accepted Replacement Decision"), replacements, record?.supersededById, { required: true });
	const openReplacement = form.action(replacementGroup, localize('ade.blueprint.editor.openReplacement', "Open Replacement Decision"), () => form.context.open('decision', replacement.value));
	const noReplacement = dom.append(replacementGroup, dom.$('p.ade-blueprint-note'));
	noReplacement.textContent = localize('ade.blueprint.editor.noReplacement', "Accept a replacement decision before superseding this one.");
	const updateReplacement = () => {
		replacementGroup.hidden = status.value !== 'superseded';
		replacement.disabled = replacementGroup.hidden;
		openReplacement.disabled = replacement.disabled || !replacement.value;
		noReplacement.hidden = replacement.options.length > 1;
	};
	form.onShow(() => {
		refreshChoices(replacement, availableReplacements(replacement.value));
		updateReplacement();
	});
	status.addEventListener('change', updateReplacement);
	replacement.addEventListener('change', updateReplacement);
	updateReplacement();
	const consequences = form.group(localize('ade.blueprint.editor.consequences', "Consequences"));
	const readConsequences = renderConsequences(form, consequences, record?.consequences ?? []);
	const scopeGroup = form.group(localize('ade.blueprint.adrScope', "Applicable Scope"), localize('ade.blueprint.editor.scopeHelp', "Choose the model elements to which this decision applies."));
	const initialScope = previous?.scopeIds ?? (form.context.targetId && model.semantics.elements.some(element => element.id === form.context.targetId) ? [form.context.targetId] : []);
	const scope = model.semantics.elements.map(element => ({ id: element.id, input: form.check(scopeGroup, localize('ade.blueprint.editor.scopeElement', "{0} · {1}", element.name, elementLabels[element.kind]), initialScope.includes(element.id)) }));
	for (const id of new Set(initialScope)) {
		if (!scope.some(item => item.id === id)) {
			scope.push({ id, input: form.check(scopeGroup, localize('ade.blueprint.editor.missingSubject', "Unavailable Object · {0}", id), true) });
		}
	}
	if (!scope.length) { form.note(scopeGroup, localize('ade.blueprint.editor.noDecisionScope', "Add a model element before creating a decision.")); }
	const updateScope = () => scope[0]?.input.setCustomValidity(scope.some(item => item.input.checked) ? '' : localize('ade.blueprint.editor.requiredScope', "Choose at least one scope element."));
	for (const item of scope) { item.input.addEventListener('change', updateScope); }
	updateScope();
	const constraints = form.group(localize('ade.blueprint.editor.normativeConstraints', "Normative Constraints"), localize('ade.blueprint.proseReview', "Structured constraints are checked automatically. Prose requires review."));
	const readConstraints = renderConstraints(form, constraints, currentSubjects(form), previous?.constraints ?? []);
	const tabs = [
		{ id: 'record', label: localize('ade.blueprint.editor.recordTab', "Record"), groups: [recordGroup, consequences, scopeGroup] },
		{ id: 'constraints', label: localize('ade.blueprint.editor.constraintsTab', "Constraints"), groups: [constraints] }
	];
	if (record?.history.length) {
		const history = form.group(localize('ade.blueprint.editor.revisionHistory', "Revision History"));
		tabs.push({ id: 'history', label: localize('ade.blueprint.editor.revisionHistory', "Revision History"), groups: [history] });
		for (const revision of [...record.history].reverse()) {
			const details = dom.append(history, dom.$('details'));
			dom.append(details, dom.$('summary')).textContent = localize('ade.blueprint.previousRevision', "Previous Revision: {0} · {1}", revision.revision, statusLabels[revision.status]);
			for (const line of [revision.title, revision.context, revision.decision, ...(revision.consequences ?? [])]) {
				if (line) { form.note(details, line); }
			}
			const names = revision.scopeIds.map(id => model.semantics.elements.find(element => element.id === id)?.name ?? id);
			form.note(details, localize('ade.blueprint.editor.historyScope', "Scope: {0}", names.join(', ')));
			for (const constraint of revision.constraints) {
				form.note(details, localize('ade.blueprint.editor.constraintLabel', "Constraint · {0}", constraint.field));
			}
		}
	}
	form.tabs(tabs);
	form.onEdit(() => {
		const scopeIds = scope.filter(item => item.input.checked).map(item => item.id);
		const constraints = readConstraints();
		if (!scopeIds.length || !constraints) { return; }
		const next: ModelDecision = {
			id,
			revision: previous?.revision ?? revision,
			status: status.value as DecisionStatus,
			scopeIds: [...initialScope.filter(id => scopeIds.includes(id)), ...scopeIds.filter(id => !initialScope.includes(id))],
			constraints,
			record: {
				number: number.value,
				title: title.value,
			context: readContext(),
			decision: readDecision(),
				consequences: readConsequences(),
				...(status.value === 'superseded' && replacement.value ? { supersededById: replacement.value } : {}),
				history: record?.history ?? []
			}
		};
		if (equals(next, previous)) { return; }
		return { kind: 'decision', entry: { ...next, revision }, expectedRevision: previous?.revision };
	});
}

export function blueprintDecisionActivity(mode: BlueprintEditMode, context: BlueprintActivityContext): BlueprintActivity | undefined {
	if (mode === 'assertion') {
		const assertions = context.model.foundation.assertions;
		const subjects = subjectChoices(context.model);
		const labels = new Map(subjects.map(subject => [subject.id, subject.label]));
		return {
			records: assertions.map(assertion => ({ id: assertion.id, label: localize('ade.blueprint.editor.assertionLabel', "{0} · {1}", labels.get(subjectKey(assertion.subject)) ?? assertion.subject.id, assertion.field), description: statusLabels[assertion.acceptance.status] })),
			initialId: assertions.find(assertion => assertion.id === context.targetId)?.id ?? assertions.find(assertion => assertion.subject.id === context.targetId)?.id,
			createLabel: localize('ade.blueprint.editor.newAssertion', "New Declaration"),
			render: (form, recordId) => renderAssertion(form, assertions.find(assertion => assertion.id === recordId))
		};
	}
	if (mode === 'decision') {
		const decisions = context.model.foundation.decisions;
		return {
			records: decisions.map(decision => ({ id: decision.id, label: decisionLabel(decision), description: statusLabels[decision.status] })),
			initialId: decisions.find(decision => decision.id === context.targetId)?.id ?? decisions.find(decision => decision.scopeIds.includes(context.targetId ?? ''))?.id,
			createLabel: localize('ade.blueprint.editor.newDecision', "New Architecture Decision"),
			render: (form, recordId) => renderDecision(form, decisions.find(decision => decision.id === recordId))
		};
	}
	return undefined;
}
