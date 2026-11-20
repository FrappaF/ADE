import { type ModelView, type SemanticModel, type SemanticRelation } from './modelTypes.js';

/** The first sequence subset orders declared interactions, without inferring calls or execution. */
export function isSequenceMessage(relation: Pick<SemanticRelation, 'kind' | 'classification'>): boolean {
	return !relation.classification && ['invocation', 'read', 'write'].includes(relation.kind);
}

/** Array order is local to this view; participants and messages retain their semantic identities. */
export function getSequenceDiagram(model: SemanticModel, view: ModelView) {
	if (view.kind !== 'sequence') { throw new Error(`Not a sequence diagram: ${view.id}`); }
	const elements = new Map(model.semantics.elements.map(element => [element.id, element]));
	const relations = new Map(model.semantics.relations.map(relation => [relation.id, relation]));
	const ordered = view.relationIds.map(id => relations.get(id)!);
	return {
		participants: view.nodes.map(node => elements.get(node.elementId)!),
		messages: ordered.filter(isSequenceMessage),
		unsupported: ordered.filter(relation => !isSequenceMessage(relation))
	};
}
