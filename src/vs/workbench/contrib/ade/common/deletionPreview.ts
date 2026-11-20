import { type SemanticModel } from './modelTypes.js';
import { canonicalJson } from './modelSerialization.js';
import { applyVisualEdit, getDeletionImpact, upgradeVisualModel } from './visualEditing.js';
import { modelObjects } from './modelFoundation.js';
import { validateSemanticModel } from './modelValidation.js';

export const deletionCollections = ['elements', 'relations', 'views', 'codeMappings', 'verifications', 'ownership', 'memberships', 'integrations', 'occurrences', 'frames', 'interactions', 'assertions', 'stateMachines', 'bindings', 'migration'] as const;
export type DeletionCollection = typeof deletionCollections[number];

export interface DeletionChange {
	collection: DeletionCollection;
	id: string;
	before: { id: string };
	after: { id: string } | undefined;
}

/** Preview the actual edit, including changes to surviving records and foundation references. */
export function getDeletionPreview(model: SemanticModel, id: string) {
	const before = upgradeVisualModel(model);
	const after = applyVisualEdit(before, { kind: 'deleteElement', id });
	const changes: DeletionChange[] = [];
	const compare = (collection: DeletionCollection, previous: readonly { id: string }[], current: readonly { id: string }[]) => {
		const remaining = new Map(current.map(record => [record.id, record]));
		for (const record of previous) {
			const next = remaining.get(record.id);
			if (!next || canonicalJson(record) !== canonicalJson(next)) { changes.push({ collection, id: record.id, before: record, after: next }); }
		}
	};
	compare('elements', before.semantics.elements, after.semantics.elements);
	compare('relations', before.semantics.relations, after.semantics.relations);
	compare('views', before.views, after.views);
	compare('codeMappings', before.codeMappings, after.codeMappings);
	compare('verifications', before.verifications, after.verifications);
	if ((before.version === 4 || before.version === 5) && (after.version === 4 || after.version === 5)) {
		for (const key of ['ownership', 'memberships', 'integrations', 'occurrences', 'frames', 'interactions', 'assertions', 'stateMachines'] as const) {
			compare(key, before.foundation[key] ?? [], after.foundation[key] ?? []);
		}
		compare('bindings', before.foundation.platform.bindings, after.foundation.platform.bindings);
		if (before.foundation.migration && after.foundation.migration) { compare('migration', [{ id: 'migration', ...before.foundation.migration }], [{ id: 'migration', ...after.foundation.migration }]); }
	}
	const removed = new Set(changes.filter(change => !change.after).map(change => change.id));
	if ((before.version === 4 || before.version === 5) && (after.version === 4 || after.version === 5)) {
		const remaining = modelObjects(after);
		for (const key of modelObjects(before).keys()) { if (!remaining.has(key)) { removed.add(key.slice(key.indexOf(':') + 1)); } }
	}
	const referencesToReview = validateSemanticModel(after).filter(diagnostic => diagnostic.code === 'missingReference' && diagnostic.args.some(id => removed.has(id)));
	return { model: before, impact: getDeletionImpact(before, id), changes, referencesToReview };
}

export type DeletionPreview = ReturnType<typeof getDeletionPreview>;
