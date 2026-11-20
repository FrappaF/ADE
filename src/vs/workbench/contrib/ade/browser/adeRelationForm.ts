import * as dom from '../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { type ModelView, type RelationKind, type SemanticModel, type SemanticRelation } from '../common/modelTypes.js';
import { acceptsNotationRelation } from '../common/modelNotation.js';
import { isCompatibleRelation } from '../common/modelValidation.js';
import { isSequenceMessage } from '../common/sequenceDiagram.js';
import { isResourceTransition } from '../common/stateDiagram.js';
import { getElementPath } from '../common/visualNavigation.js';
import { AdeFormDialog } from './adeFormDialog.js';
import { relationLabels } from './adeLabels.js';

interface RelationFormValue {
	from: string;
	to: string;
	relationKind: RelationKind;
	name: string;
	condition: string;
	errorCode?: string;
}

/** Connection gestures and full relationship editing share the same textual fields. */
export function addAdeRelationFields(dialog: AdeFormDialog, relation?: Pick<SemanticRelation, 'name' | 'condition'>): () => { name: string; condition: string } {
	const name = dialog.text(dialog.body, localize('ade.relationName', "Relationship Name"), relation?.name ?? '');
	const condition = dialog.text(dialog.body, localize('ade.conditionInput', "Condition (Optional)"), relation?.condition ?? '', { multiline: true });
	return () => ({ name: name.value, condition: condition.value });
}

/** Keeps dependent endpoints, kind and declared errors together in one detached form. */
export async function editAdeRelationForm(parent: HTMLElement, model: SemanticModel, options: { relation?: SemanticRelation; sourceId?: string; view?: ModelView }): Promise<RelationFormValue | undefined> {
	const relation = options.relation;
	const affected = relation ? model.views.filter(view => view.relationIds.includes(relation.id)) : options.view ? [options.view] : [];
	const candidates = model.semantics.elements.filter(element => affected.every(view => view.nodes.some(node => node.elementId === element.id)));
	const dialog = new AdeFormDialog(parent, {
		title: relation ? localize('ade.relation.edit', "Edit Relationship") : localize('ade.relation.create', "Create Relationship"),
		description: relation ? localize('ade.relation.sharedHelp', "Changes apply to every diagram containing this relationship.") : options.view?.name
	});
	const listeners = new DisposableStore();
	try {
		const elementChoice = (id: string) => {
			const element = candidates.find(element => element.id === id)!;
			const path = getElementPath(model, id).slice(0, -1).map(parent => parent.name).join(' / ');
			return { value: id, label: path ? localize('ade.relation.elementPath', "{0} · {1}", element.name, path) : element.name };
		};
		const sources = options.sourceId ? candidates.filter(element => element.id === options.sourceId) : candidates;
		const source = dialog.select(dialog.body, localize('ade.relation.source', "Relationship Source"), relation?.from ?? options.sourceId ?? '', sources.map(element => elementChoice(element.id)), { required: true });
		const kind = dialog.select(dialog.body, localize('ade.relationType', "Relationship Type"), relation?.kind ?? '', [], { required: true });
		const target = dialog.select(dialog.body, localize('ade.target', "Target Element"), relation?.to ?? '', [], { required: true });
		const readFields = addAdeRelationFields(dialog, relation);
		const error = dialog.select(dialog.body, localize('ade.relationError', "Relationship Error"), relation?.errorCode ?? '', []);
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
			replaceChoices(error, [{ value: '', label: localize('ade.noRelationError', "No Error") }, ...errors.map(error => ({ value: error.code, label: error.code }))], initial ? relation?.errorCode ?? '' : undefined);
		};
		refreshSource(true);
		listeners.add(dom.addDisposableListener(source, 'change', () => refreshSource()));
		listeners.add(dom.addDisposableListener(kind, 'change', () => refreshTargets()));
		return await dialog.open(() => ({ from: source.value, to: target.value, relationKind: kind.value as RelationKind, ...readFields(), errorCode: error.value || undefined }), value => supported(value.relationKind, value.to) ? undefined : localize('ade.relation.noCompatible', "Choose a compatible source, relationship type and target."));
	} finally { listeners.dispose(); dialog.dispose(); }
}

/** A compact grouped form for the final step of a connection gesture. */
export async function editAdeConnectionDetails(parent: HTMLElement, description: string): Promise<{ name: string; condition: string } | undefined> {
	const dialog = new AdeFormDialog(parent, { title: localize('ade.relation.create', "Create Relationship"), description });
	try { return await dialog.open(addAdeRelationFields(dialog)); }
	finally { dialog.dispose(); }
}
