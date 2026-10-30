/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ModelView, SemanticElement, SemanticModel, SemanticRelation } from './semanticModel.js';

/** Authored transitions connect states of the same explicitly declared resource. */
export function isResourceTransition(model: SemanticModel, relation: SemanticRelation): boolean {
	if (relation.kind !== 'transition' || relation.classification) { return false; }
	const from = model.semantics.elements.find(element => element.id === relation.from);
	const to = model.semantics.elements.find(element => element.id === relation.to);
	return from?.kind === 'state' && to?.kind === 'state' && !!from.parentId && from.parentId === to.parentId
		&& model.semantics.elements.some(element => element.id === from.parentId && element.kind === 'resource');
}

/** Derive resource groups without adding ownership fields or rewriting historical state diagrams. */
export function getStateDiagram(model: SemanticModel, view: ModelView) {
	if (view.kind !== 'state') { throw new Error(`Not a state diagram: ${view.id}`); }
	const elements = new Map(model.semantics.elements.map(element => [element.id, element]));
	const visible = view.nodes.map(node => elements.get(node.elementId)!);
	const relations = new Map(model.semantics.relations.map(relation => [relation.id, relation]));
	const shown = view.relationIds.map(id => relations.get(id)!);
	const resources = new Map<string, SemanticElement>();
	for (const element of visible) {
		const resource = element.kind === 'resource' ? element : element.kind === 'state' && element.parentId ? elements.get(element.parentId) : undefined;
		if (resource?.kind === 'resource') { resources.set(resource.id, resource); }
	}
	const transitions = shown.filter(relation => isResourceTransition(model, relation));
	return {
		groups: [...resources.values()].map(resource => ({
			resource,
			states: visible.filter(element => element.kind === 'state' && element.parentId === resource.id),
			allStates: model.semantics.elements.filter(element => element.kind === 'state' && element.parentId === resource.id),
			transitions: transitions.filter(relation => elements.get(relation.from)!.parentId === resource.id)
		})),
		unscopedStates: visible.filter(element => element.kind === 'state' && (!element.parentId || elements.get(element.parentId)?.kind !== 'resource')),
		contextElements: visible.filter(element => element.kind !== 'state' && element.kind !== 'resource'),
		contextRelations: shown.filter(relation => !transitions.includes(relation))
	};
}
