import * as dom from '../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { type ModelView, type RelationKind, type SemanticModel, type SemanticRelation } from '../common/modelTypes.js';
import { acceptsNotationRelation } from '../common/modelNotation.js';
import { isCompatibleRelation } from '../common/modelValidation.js';
import { isSequenceMessage } from '../common/sequenceDiagram.js';
import { isResourceTransition } from '../common/stateDiagram.js';
import { getElementPath } from '../common/visualNavigation.js';
import { OrditoFormDialog } from './orditoFormDialog.js';
import { relationLabels } from './orditoLabels.js';

interface RelationFormValue {
	from: string;
	to: string;
	relationKind: RelationKind;
	name: string;
	condition: string;
	errorCode?: string;
}

/** Connection gestures and full relationship editing share the same textual fields. */
export function addOrditoRelationFields(dialog: OrditoFormDialog, relation?: Pick<SemanticRelation, 'name' | 'condition'>): () => { name: string; condition: string } {
	const name = dialog.text(dialog.body, localize('ordito.relationName', "Relationship Name"), relation?.name ?? '');
	const condition = dialog.text(dialog.body, localize('ordito.conditionInput', "Condition (Optional)"), relation?.condition ?? '', { multiline: true });
	return () => ({ name: name.value, condition: condition.value });
}

/** Keeps dependent endpoints, kind and declared errors together in one detached form. */
export async function editOrditoRelationForm(parent: HTMLElement, model: SemanticModel, options: { relation?: SemanticRelation; sourceId?: string; view?: ModelView }): Promise<RelationFormValue | undefined> {
	const relation = options.relation;
	const affected = relation ? model.views.filter(view => view.relationIds.includes(relation.id)) : options.view ? [options.view] : [];
	const candidates = model.semantics.elements.filter(element => affected.every(view => view.nodes.some(node => node.elementId === element.id)));
	const dialog = new OrditoFormDialog(parent, {
		title: relation ? localize('ordito.relation.edit', "Edit Relationship") : localize('ordito.relation.create', "Create Relationship"),
		description: relation ? localize('ordito.relation.sharedHelp', "Changes apply to every diagram containing this relationship.") : options.view?.name
	});
	const listeners = new DisposableStore();
	try {
		const elementChoice = (id: string) => {
			const element = candidates.find(element => element.id === id)!;
			const path = getElementPath(model, id).slice(0, -1).map(parent => parent.name).join(' / ');
			return { value: id, label: path ? localize('ordito.relation.elementPath', "{0} · {1}", element.name, path) : element.name };
		};
		const sources = options.sourceId ? candidates.filter(element => element.id === options.sourceId) : candidates;
		const source = dialog.select(dialog.body, localize('ordito.relation.source', "Relationship Source"), relation?.from ?? options.sourceId ?? '', sources.map(element => elementChoice(element.id)), { required: true });
		const kind = dialog.select(dialog.body, localize('ordito.relationType', "Relationship Type"), relation?.kind ?? '', [], { required: true });
		const target = dialog.select(dialog.body, localize('ordito.target', "Target Element"), relation?.to ?? '', [], { required: true });
		const readFields = addOrditoRelationFields(dialog, relation);
		const error = dialog.select(dialog.body, localize('ordito.relationError', "Relationship Error"), relation?.errorCode ?? '', []);
		const replaceChoices = (select: HTMLSelectElement, choices: { value: string; label: string }[], preferred = select.value) => {
			dom.clearNode(select);
			for (const choice of choices) {
				const option = dom.append(select, dom.$<HTMLOptionElement>('option', { value: choice.value })); option.textContent = choice.label;
			}
			select.value = choices.some(choice => choice.value === preferred) ? preferred : choices[0]?.value ?? '';
		};
		const supported = (relationKind: RelationKind, targetId: string): boolean => {
			const from = candidates.find(element => element.id === source.value), to = candidates.find(element => element.id === targetId);
			if (!from || !to) { return false; }
			return isCompatibleRelation(relationKind, from.kind, to.kind)
				&& (relationKind !== 'transition' || from.parentId === to.parentId)
				&& affected.every(view => acceptsNotationRelation(view.kind, { kind: relationKind })
					&& (view.kind !== 'sequence' || isSequenceMessage({ kind: relationKind }))
					&& (view.kind !== 'state' || isResourceTransition(model, { id: relation?.id ?? '', kind: relationKind, from: from.id, to: to.id, name: '' })))
				&& (!!relation || from.id !== to.id || affected.some(view => view.kind === 'sequence' || view.kind === 'state'));
		};
		const refreshTargets = (preferred?: string) => replaceChoices(target, candidates.filter(element => supported(kind.value as RelationKind, element.id)).map(element => elementChoice(element.id)), preferred);
		const refreshSource = (initial = false) => {
			replaceChoices(kind, (Object.keys(relationLabels) as RelationKind[]).filter(value => candidates.some(element => supported(value, element.id))).map(value => ({ value, label: relationLabels[value] })), initial ? relation?.kind : undefined);
			refreshTargets(initial ? relation?.to : undefined);
			const errors = candidates.find(element => element.id === source.value)?.behavior?.errors ?? [];
			replaceChoices(error, [{ value: '', label: localize('ordito.noRelationError', "No Error") }, ...errors.map(error => ({ value: error.code, label: error.code }))], initial ? relation?.errorCode ?? '' : undefined);
		};
		refreshSource(true);
		listeners.add(dom.addDisposableListener(source, 'change', () => refreshSource()));
		listeners.add(dom.addDisposableListener(kind, 'change', () => refreshTargets()));
		return await dialog.open(() => ({ from: source.value, to: target.value, relationKind: kind.value as RelationKind, ...readFields(), errorCode: error.value || undefined }), value => supported(value.relationKind, value.to) ? undefined : localize('ordito.relation.noCompatible', "Choose a compatible source, relationship type and target."));
	} finally { listeners.dispose(); dialog.dispose(); }
}

/** A compact grouped form for the final step of a connection gesture. */
export async function editOrditoConnectionDetails(parent: HTMLElement, description: string): Promise<{ name: string; condition: string } | undefined> {
	const dialog = new OrditoFormDialog(parent, { title: localize('ordito.relation.create', "Create Relationship"), description });
	try { return await dialog.open(addOrditoRelationFields(dialog)); }
	finally { dialog.dispose(); }
}
