import * as dom from '../../../../base/browser/dom.js';
import { equals } from '../../../../base/common/objects.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { arrangeDiagram } from '../common/diagramLayout.js';
import { acceptsNotationRelation } from '../common/modelNotation.js';
import { type ModelView, type SemanticElement, type SemanticModelV4 } from '../common/modelTypes.js';
import { isValidModelOwnership } from '../common/modelValidation.js';
import { includeElement } from '../common/visualEditSupport.js';
import { type VisualEdit } from '../common/visualEditing.js';
import { getElementPath } from '../common/visualNavigation.js';
import { type BlueprintEditMode } from './orditoBlueprintEditing.js';
import { type BlueprintActivity, type BlueprintActivityContext, type BlueprintForm, type BlueprintOption } from './orditoBlueprintForm.js';
import { elementLabels } from './orditoLabels.js';

const c4Levels = [
	{ id: 'c4Context', label: localize('ordito.blueprint.l1', "L1 · System Context") },
	{ id: 'c4Container', label: localize('ordito.blueprint.l2', "L2 · Containers") },
	{ id: 'c4Component', label: localize('ordito.blueprint.l3', "L3 · Components") },
	{ id: 'class', label: localize('ordito.blueprint.l4', "L4 · Contract") }
] as const;

const systemScopes = [
	{ id: 'governed', label: localize('ordito.blueprint.governed', "Governed System") },
	{ id: 'external', label: localize('ordito.blueprint.external', "External System") }
] as const;

const containerRoles = [
	{ id: 'application', label: localize('ordito.blueprint.application', "Application") },
	{ id: 'service', label: localize('ordito.blueprint.service', "Service") },
	{ id: 'spa', label: localize('ordito.blueprint.spa', "Web Client") },
	{ id: 'mobile', label: localize('ordito.blueprint.mobile', "Mobile Client") },
	{ id: 'store', label: localize('ordito.blueprint.store', "Data Store") },
	{ id: 'messaging', label: localize('ordito.blueprint.messaging', "Messaging") }
] as const;

function describeElement(model: SemanticModelV4, element: SemanticElement): BlueprintOption {
	const path = getElementPath(model, element.id).slice(0, -1).map(owner => owner.name).join(' / ');
	return {
		id: element.id,
		label: element.name,
		description: [elementLabels[element.kind], path, model.semantics.elements.some(other => other.id !== element.id && other.name === element.name) ? element.id : undefined].filter(Boolean).join(' · ')
	};
}

function elementActivity(context: BlueprintActivityContext, render: (form: BlueprintForm, item: SemanticElement) => void, filter: (item: SemanticElement) => boolean = () => true): BlueprintActivity {
	const elements = context.model.semantics.elements.filter(filter);
	return {
		records: elements.map(item => describeElement(context.model, item)),
		initialId: context.targetId,
		render: (form, id) => {
			const element = elements.find(item => item.id === id);
			if (element) {
				render(form, element);
			}
		}
	};
}

function renderScope(form: BlueprintForm, element: SemanticElement): void {
	if (element.kind === 'system') {
		const group = form.group(localize('ordito.blueprint.structure.systemScope', "System Boundary"), localize('ordito.blueprint.structure.systemScopeHelp', "Governed systems belong to this project. External systems can be declared as dependencies."));
		const scope = form.select(group, localize('ordito.blueprint.structure.scope', "Scope"), systemScopes, element.scope, { required: true });
		form.onEdit(() => {
			const selected = systemScopes.find(item => item.id === scope.value);
			return selected && selected.id !== element.scope ? { kind: 'elementScope', id: element.id, scope: selected.id } : undefined;
		});
		return;
	}
	const group = form.group(localize('ordito.blueprint.responsibility', "Responsibility"));
	const description = form.text(group, localize('ordito.blueprint.structure.description', "Description"), element.description, { multiline: true, required: true });
	const runtime = element.kind === 'container' ? form.select(group, localize('ordito.blueprint.runtimeRole', "Container Role"), containerRoles, element.runtimeKind, { required: true }) : undefined;
	form.onEdit(() => {
		const edits: VisualEdit[] = [];
		const text = description.value.trim();
		if (text && text !== element.description) {
			edits.push({ kind: 'description', id: element.id, description: text });
		}
		const role = containerRoles.find(item => item.id === runtime?.value);
		if (role && role.id !== element.runtimeKind) {
			edits.push({ kind: 'elementScope', id: element.id, runtimeKind: role.id });
		}
		return edits;
	});
}

function createsOwnershipCycle(owners: ReadonlyMap<string, string>, targetId: string, candidateOwnerId = owners.get(targetId)): boolean {
	const chain = new Set([targetId]);
	let id = candidateOwnerId;
	while (id) {
		if (chain.has(id)) {
			return true;
		}
		chain.add(id);
		id = owners.get(id);
	}
	return false;
}

function renderOwnership(form: BlueprintForm, element: SemanticElement): void {
	const { model } = form.context;
	const group = form.group(localize('ordito.blueprint.structure.owner', "Owner"), element.kind === 'state'
		? localize('ordito.blueprint.structure.lifecycleOwnerHelp', "A state belongs to the lifecycle of a resource, entity or class.")
		: localize('ordito.blueprint.structure.architecturalOwnerHelp', "The architectural owner defines where this responsibility belongs in the model."));
	const role = element.kind === 'state' ? 'lifecycle' : 'architecture';
	const initial = new Map(model.foundation.ownership.map(entry => [entry.elementId, entry.ownerId]));
	const elements = model.semantics.elements;
	const targetOptions = new Map(elements.map(candidate => [candidate.id, describeElement(model, candidate)]));
	const canAssign = (target: SemanticElement, owner: SemanticElement) => isValidModelOwnership(target, owner, role) && !createsOwnershipCycle(initial, target.id, owner.id);
	const owners = elements.filter(item => canAssign(element, item)).map(item => targetOptions.get(item.id)!);
	if (!owners.length) {
		form.note(group, localize('ordito.blueprint.structure.ownerUnavailable', "Add a compatible owner to the project before assigning this element."));
		return;
	}
	const owner = form.select(group, role === 'architecture' ? localize('ordito.blueprint.structure.architecturalOwner', "Architectural Owner") : localize('ordito.blueprint.structure.lifecycleOwner', "Lifecycle Owner"), owners, initial.get(element.id), { required: true });
	const additional = dom.append(group, dom.$('details.ordito-blueprint-owner-batch'));
	dom.append(additional, dom.$('summary')).textContent = localize('ordito.blueprint.structure.ownerBatch', "Assign the Same Owner to More Elements");
	const list = dom.append(additional, dom.$('div.ordito-blueprint-checklist'));
	const selected = new Set<string>();
	const updateList = () => {
		dom.clearNode(list);
		const chosen = elements.find(item => item.id === owner.value);
		const others = chosen ? elements.filter(item => item.id !== element.id && canAssign(item, chosen)) : [];
		for (const id of selected) {
			if (!others.some(item => item.id === id)) {
				selected.delete(id);
			}
		}
		additional.hidden = !others.length;
		for (const other of others) {
			const option = targetOptions.get(other.id)!;
			const control = form.check(list, localize('ordito.blueprint.structure.batchElement', "{0} · {1}", option.label, option.description), selected.has(other.id));
			control.addEventListener('change', () => {
				if (control.checked) {
					selected.add(other.id);
				} else {
					selected.delete(other.id);
				}
			});
		}
	};
	owner.addEventListener('change', updateList);
	updateList();
	const identifiers = new Map<string, string>();
	form.onEdit(current => {
		const chosen = current.semantics.elements.find(item => item.id === owner.value);
		if (!chosen) {
			return;
		}
		const ownership = new Map(current.foundation.ownership.map(entry => [entry.elementId, entry]));
		const parents = new Map(current.foundation.ownership.map(entry => [entry.elementId, entry.ownerId]));
		const desired = [element.id, ...selected].filter(id => initial.get(id) !== chosen.id);
		for (const id of desired) {
			parents.set(id, chosen.id);
		}
		const edits: VisualEdit[] = [];
		for (const id of desired) {
			const target = current.semantics.elements.find(item => item.id === id);
			if (!target || !isValidModelOwnership(target, chosen, role) || createsOwnershipCycle(parents, id)) {
				throw new Error(localize('ordito.blueprint.structure.incompatibleOwner', "Choose a compatible owner without creating an ownership cycle."));
			}
			const previous = ownership.get(id);
			if (previous?.ownerId === chosen.id && previous.role === role) {
				continue;
			}
			const entryId = previous?.id ?? identifiers.get(id) ?? generateUuid();
			identifiers.set(id, entryId);
			edits.push({ kind: 'ownership', entry: { id: entryId, elementId: id, ownerId: chosen.id, role } });
		}
		return edits;
	});
}

function renderMembership(form: BlueprintForm, element: SemanticElement): void {
	const { model } = form.context;
	const group = form.group(localize('ordito.blueprint.membership', "Feature Memberships"), localize('ordito.blueprint.structure.membershipsHelp', "An element can contribute to more than one feature."));
	const features = model.semantics.elements.filter(item => item.kind === 'feature');
	if (!features.length) {
		form.note(group, localize('ordito.blueprint.structure.membershipsEmpty', "Add a feature to the project before assigning memberships."));
		return;
	}
	const list = dom.append(group, dom.$('div.ordito-blueprint-checklist'));
	const memberships = new Map(model.foundation.memberships.filter(entry => entry.elementId === element.id).map(entry => [entry.featureId, entry]));
	const choices = features.map(feature => {
		const entry = memberships.get(feature.id) ?? { id: generateUuid(), elementId: element.id, featureId: feature.id };
		const option = describeElement(model, feature);
		return { entry, control: form.check(list, localize('ordito.blueprint.structure.membershipOption', "{0} · {1}", option.label, option.description), memberships.has(feature.id)) };
	});
	form.onEdit(current => {
		const existing = new Map(current.foundation.memberships.filter(entry => entry.elementId === element.id).map(entry => [entry.featureId, entry]));
		return choices.flatMap<VisualEdit>(({ entry, control }) => {
			if (memberships.has(entry.featureId) === control.checked) {
				return [];
			}
			return [{ kind: 'membership', entry: existing.get(entry.featureId) ?? entry, included: control.checked }];
		});
	});
}

type C4Mode = 'c4' | 'c4Visibility' | 'c4Dependencies';

function c4Activity(mode: C4Mode, context: BlueprintActivityContext): BlueprintActivity {
	const views = context.model.views.filter(view => c4Levels.some(level => level.id === view.kind) && (mode === 'c4' || view.kind !== 'class' || view.subjectId));
	const options = views.map(view => ({
		id: view.id,
		label: view.name,
		description: c4Levels.find(level => level.id === view.kind)?.label
	}));
	return {
		records: options,
		initialId: options.some(option => option.id === context.targetId) ? context.targetId : context.activeView?.id,
		createLabel: mode === 'c4' ? localize('ordito.blueprint.structure.newC4', "New C4 View") : undefined,
		render: (form, id) => renderC4(form, mode, views.find(view => view.id === id))
	};
}

function isSubjectFor(kind: ModelView['kind'], item: SemanticElement): boolean {
	if (kind === 'c4Context' || kind === 'c4Container') {
		return item.kind === 'system' && item.scope === 'governed';
	}
	return kind === 'c4Component' ? item.kind === 'container' : kind === 'class' && ['interface', 'contract', 'class'].includes(item.kind);
}

function applySelections(initial: Iterable<string>, edits: ReadonlyMap<string, boolean>): Set<string> {
	const selection = new Set(initial);
	for (const [id, included] of edits) {
		if (included) {
			selection.add(id);
		} else {
			selection.delete(id);
		}
	}
	return selection;
}

function renderC4(form: BlueprintForm, mode: C4Mode, existing?: ModelView): void {
	const { model, targetId } = form.context;
	const editScope = mode === 'c4';
	if (!editScope && !existing?.subjectId) {
		if (existing) {
			const group = form.group(localize('ordito.blueprint.structure.c4NeedsSubject', "This View Needs a Subject"));
			form.action(group, localize('ordito.blueprint.structure.c4OpenSettings', "Open View Settings"), () => form.context.open('c4', existing.id));
		}
		return;
	}
	form.element.classList.add('ordito-blueprint-c4-form');
	const identity = form.group(localize('ordito.blueprint.structure.c4Identity', "View Identity"));
	identity.classList.add('ordito-blueprint-c4-identity');
	const name = editScope ? form.text(identity, localize('ordito.blueprint.viewName', "View Name"), existing?.name, { required: true }) : undefined;
	const level = editScope ? form.select(identity, localize('ordito.blueprint.level', "C4 Level"), c4Levels, existing?.kind ?? 'c4Context', { required: true }) : undefined;
	const currentLevel = () => c4Levels.find(item => item.id === level?.value)?.id ?? existing?.kind ?? 'c4Context';
	const editContext = mode !== 'c4Visibility';
	const editVisibility = mode !== 'c4Dependencies';
	const visibleChanges = new Map<string, boolean>();
	const contextChanges = new Map<string, boolean>();
	const initialVisible = new Set(existing?.nodes.map(node => node.elementId));
	const initialContext = new Set(existing?.contextIds);
	const elementOptions = model.semantics.elements.map(item => describeElement(model, item));
	const byId = new Map(elementOptions.map(item => [item.id, item]));
	const subjectOptions = () => form.context.model.semantics.elements.filter(item => isSubjectFor(currentLevel(), item)).map(item => byId.get(item.id)!);
	const subjects = subjectOptions();
	const suggestedSubject = (choices: readonly BlueprintOption[], previous?: string) => choices.find(item => item.id === previous)?.id
		?? choices.find(item => item.id === targetId)?.id ?? (!existing && choices.length === 1 ? choices[0].id : undefined);
	const subject = editScope ? form.select(identity, localize('ordito.blueprint.viewSubject', "View Subject"), subjects, suggestedSubject(subjects, existing?.subjectId), { required: true }) : undefined;
	const currentSubject = () => editScope ? subject?.value : existing?.subjectId;
	const noSubjects = dom.append(identity, dom.$('p.ordito-blueprint-note'));
	noSubjects.textContent = localize('ordito.blueprint.structure.c4NoSubjects', "Add a compatible subject or choose another C4 level.");
	noSubjects.hidden = !editScope || subjects.length > 0;
	if (!editScope && existing) {
		form.note(identity, localize('ordito.blueprint.structure.c4ReadSubject', "Subject: {0}", byId.get(existing.subjectId ?? '')?.label ?? localize('ordito.blueprint.structure.c4UnknownSubject', "Unknown")));
		form.action(identity, localize('ordito.blueprint.structure.c4OpenSettings', "Open View Settings"), () => form.context.open('c4', existing.id));
	}

	const selection = form.group(localize('ordito.blueprint.structure.c4Contents', "View Contents"), localize('ordito.blueprint.structure.c4ContentsHelp', "Context declares outside dependencies. Visibility determines what appears in this diagram."));
	selection.classList.add('ordito-blueprint-c4-contents');
	const search = dom.append(selection, dom.$('label.ordito-blueprint-field'));
	dom.append(search, dom.$('span')).textContent = localize('ordito.blueprint.structure.filterElements', "Filter Elements");
	const filter = dom.append(search, dom.$<HTMLInputElement>('input', { type: 'search', placeholder: localize('ordito.blueprint.searchElements', "Search by name, type, or owner.") }));
	const table = dom.append(selection, dom.$<HTMLTableElement>('table.ordito-blueprint-c4-grid'));
	const headings = table.createTHead().insertRow();
	for (const label of [localize('ordito.blueprint.element', "Element"), ...(editContext ? [localize('ordito.blueprint.structure.contextColumn', "Context")] : []), ...(editVisibility ? [localize('ordito.blueprint.structure.visibleColumn', "Visible")] : [])]) {
		const heading = dom.append(headings, dom.$<HTMLTableCellElement>('th'));
		heading.scope = 'col';
		heading.textContent = label;
	}
	const body = table.createTBody();
	const preview = form.group(localize('ordito.blueprint.structure.c4Preview', "View Preview"));
	preview.classList.add('ordito-blueprint-c4-summary');
	const previewItems = dom.append(preview, dom.$('ul.ordito-blueprint-c4-preview'));
	const previewSummary = dom.append(preview, dom.$('p'));
	const refreshPreview = () => {
		const subjectId = currentSubject();
		const visible = applySelections(initialVisible, visibleChanges);
		if (subjectId && editVisibility) {
			visible.add(subjectId);
		}
		const context = applySelections(initialContext, contextChanges);
		if (subjectId) {
			context.delete(subjectId);
		}
		dom.clearNode(previewItems);
		for (const id of visible) {
			const option = byId.get(id);
			if (!option) {
				continue;
			}
			const label = id === subjectId ? localize('ordito.blueprint.structure.previewSubject', "{0} · Subject", option.label)
				: context.has(id) ? localize('ordito.blueprint.structure.previewContext', "{0} · Context", option.label)
				: option.label;
			dom.append(previewItems, dom.$('li')).textContent = label;
		}
		previewSummary.textContent = localize('ordito.blueprint.structure.previewSummary', "{0} visible elements · {1} context dependencies", visible.size, context.size);
	};
	const rows = elementOptions.map(option => {
		const row = body.insertRow();
		const label = dom.append(row, dom.$<HTMLTableCellElement>('th.ordito-blueprint-c4-name'));
		label.scope = 'row';
		label.textContent = option.label;
		dom.append(label, dom.$('small')).textContent = option.description ?? '';
		const addChoice = (heading: string, initial: Set<string>, changes: Map<string, boolean>) => {
			const text = localize('ordito.blueprint.structure.c4Toggle', "{0} · {1}", option.label, heading);
			const control = form.check(row.insertCell(), text, initial.has(option.id));
			control.setAttribute('aria-label', text);
			control.addEventListener('change', () => {
				if (control.checked === initial.has(option.id)) {
					changes.delete(option.id);
				} else {
					changes.set(option.id, control.checked);
				}
				refreshPreview();
			});
			return control;
		};
		const context = editContext ? addChoice(localize('ordito.blueprint.structure.contextColumn', "Context"), initialContext, contextChanges) : undefined;
		const visible = editVisibility ? addChoice(localize('ordito.blueprint.structure.visibleColumn', "Visible"), initialVisible, visibleChanges) : undefined;
		return { option, row, context, visible };
	});
	const refreshSubjects = () => {
		const subjectId = currentSubject();
		for (const { option, context, visible } of rows) {
			const isSubject = option.id === subjectId;
			if (context) {
				context.checked = isSubject ? false : contextChanges.get(option.id) ?? initialContext.has(option.id);
				context.disabled = isSubject;
			}
			if (visible) {
				visible.checked = isSubject || (visibleChanges.get(option.id) ?? initialVisible.has(option.id));
				visible.disabled = isSubject;
			}
		}
		refreshPreview();
	};
	const refreshSubjectChoices = () => {
		if (subject) {
			const previous = subject.value;
			const compatible = subjectOptions();
			if (!equals(Array.from(subject.options).slice(1).map(option => option.value), compatible.map(option => option.id))) {
				subject.options.length = 1;
				for (const option of compatible) {
					const item = dom.append(subject, dom.$<HTMLOptionElement>('option', { value: option.id }));
					item.textContent = localize('ordito.blueprint.optionDetail', "{0} · {1}", option.label, option.description);
				}
				subject.value = suggestedSubject(compatible, previous) ?? '';
			}
			noSubjects.hidden = compatible.length > 0;
		}
		refreshSubjects();
	};
	level?.addEventListener('change', refreshSubjectChoices);
	form.onShow(refreshSubjectChoices);
	subject?.addEventListener('change', refreshSubjects);
	filter.addEventListener('input', event => {
		event.stopPropagation();
		const query = filter.value.toLocaleLowerCase().trim();
		for (const { option, row } of rows) {
			row.style.display = query && !`${option.label} ${option.description}`.toLocaleLowerCase().includes(query) ? 'none' : '';
		}
	});
	filter.addEventListener('change', event => event.stopPropagation());
	refreshSubjects();

	form.onEdit(current => {
		const previous = existing && current.views.find(view => view.id === existing.id);
		const inputName = name?.value.trim();
		const kind = level ? currentLevel() : previous?.kind;
		const selected = currentSubject();
		if (!kind || editScope && (!inputName || !selected) || !editScope && !previous) {
			return;
		}
		const subjectId = editScope && selected !== existing?.subjectId ? selected : previous?.subjectId ?? selected;
		const contextIds = editContext && (contextChanges.size || editScope) ? applySelections(previous?.contextIds ?? [], contextChanges) : undefined;
		if (subjectId && (contextChanges.size || subjectId !== previous?.subjectId)) {
			contextIds?.delete(subjectId);
		}
		const view: ModelView = {
			...previous,
			id: existing?.id ?? form.newId,
			name: editScope && inputName !== existing?.name ? inputName! : previous?.name ?? inputName!,
			kind: editScope && kind === existing?.kind ? previous?.kind ?? kind : kind,
			subjectId,
			contextIds: contextIds ? [...contextIds] : previous?.contextIds,
			nodes: [...(previous?.nodes ?? [])],
			relationIds: [...(previous?.relationIds ?? [])]
		};
		if (editVisibility && subjectId) {
			const visible = applySelections(view.nodes.map(node => node.elementId), visibleChanges);
			visible.add(subjectId);
			const previousIds = new Set(view.nodes.map(node => node.elementId));
			view.nodes = view.nodes.filter(node => visible.has(node.elementId));
			for (const id of visible) {
				includeElement(view, id, current);
			}
			if (!previous || view.kind !== previous.kind || visible.size !== previousIds.size || [...visible].some(id => !previousIds.has(id))) {
				const relationIds = new Set(view.relationIds);
				view.relationIds = current.semantics.relations.filter(relation =>
					visible.has(relation.from) && visible.has(relation.to)
					&& (acceptsNotationRelation(view.kind, relation) || ['invocation', 'dependency', 'communication'].includes(relation.kind))
					&& (relationIds.has(relation.id) || !previousIds.has(relation.from) || !previousIds.has(relation.to))
				).map(relation => relation.id);
			}
			if (!previous) {
				view.nodes = arrangeDiagram(current, view, 'balanced');
			}
		}
		return equals(view, previous) ? undefined : { kind: 'c4View', view };
	});
}

/** Contextual configuration of existing elements and scoped view definitions. */
export function blueprintStructureActivity(mode: BlueprintEditMode, context: BlueprintActivityContext): BlueprintActivity | undefined {
	switch (mode) {
		case 'c4':
		case 'c4Visibility':
		case 'c4Dependencies':
			return c4Activity(mode, context);
		case 'scope':
			return elementActivity(context, renderScope);
		case 'owner':
			return elementActivity(context, renderOwnership, item => item.kind !== 'actor' && item.kind !== 'feature');
		case 'membership':
			return elementActivity(context, renderMembership);
		default:
			return undefined;
	}
}
