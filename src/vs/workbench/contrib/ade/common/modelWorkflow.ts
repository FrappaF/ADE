import { modelObjects } from './modelFoundation.js';
import { type ModelTaskIntent, type SemanticModelV4 } from './modelTypes.js';
import { canonicalJson } from './modelSerialization.js';

/** Compare-and-swap task edits on the same native document/undo stack as the specification. */
export function reviseModelTask(model: SemanticModelV4, entry: ModelTaskIntent, expectedRevision?: string): void {
	const previous = model.foundation.tasks?.find(task => task.id === entry.id);
	if (previous?.revision !== expectedRevision || previous && (previous.revision === entry.revision || previous.history.some(revision => revision.revision === entry.revision) || canonicalJson(previous.target) !== canonicalJson(entry.target))) { throw new Error('Task intent changed; review the current revision'); }
	if (!modelObjects(model).has(`${entry.target.kind}:${entry.target.id}`) || !entry.text.trim() || !entry.revision.trim() || entry.clarifications.some(item => !item.question.trim() || !item.answer.trim())) { throw new Error('Incomplete task intent'); }
	const next = structuredClone(entry);
	next.history = previous ? [...structuredClone(previous.history), { revision: previous.revision, text: previous.text, clarifications: structuredClone(previous.clarifications) }] : [];
	model.foundation.tasks = [...model.foundation.tasks?.filter(task => task.id !== entry.id) ?? [], next];
}

/** The latest authored intent is scoped to this definition, never selected from an unrelated task. */
export function modelTaskIntent(model: SemanticModelV4, kind: string, id: string, fallback: string) {
	const task = model.foundation.tasks?.findLast(task => task.target.kind === kind && task.target.id === id);
	return task ? { revision: task.revision, text: task.text, clarifications: structuredClone(task.clarifications) } : { revision: '1', text: fallback, clarifications: [] };
}
