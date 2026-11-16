/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { readSemanticDraft, readSemanticModel } from './modelValidation.js';
import { type ModelView, type SemanticModel } from './modelTypes.js';
import { acceptsNotationRelation } from './modelNotation.js';
import { notationNodeSize } from './diagramLayout.js';
import { getDiagramGroups } from './visualNavigation.js';

export function upgradeVisualModel(model: SemanticModel): SemanticModel {
	const candidate = structuredClone(model);
	if (candidate.version === 2) {
		candidate.version = 3;
		for (const group of getDiagramGroups(candidate)) {
			if (group.featureId) {
				for (const view of group.views) { view.featureId = group.featureId; }
			}
		}
	}

	return (candidate.version === 4 || candidate.version === 5) ? readSemanticDraft(candidate) : readSemanticModel(candidate);
}

export function getDeletionImpact(model: SemanticModel, id: string) {
	const elements = new Set([id]);
	let changed = true;
	while (changed) {
		changed = false;
		for (const element of model.semantics.elements) {
			const parentId = (model.version === 4 || model.version === 5) ? model.foundation.ownership.find(entry => entry.elementId === element.id)?.ownerId : element.parentId;
			if (parentId && elements.has(parentId) && !elements.has(element.id)) {
				elements.add(element.id);
				changed = true;
			}
		}
	}
	const relations = model.semantics.relations.filter(relation => elements.has(relation.from) || elements.has(relation.to)).map(relation => relation.id);
	const relationIds = new Set(relations);
	return {
		elements: [...elements],
		relations,
		views: model.views.filter(view => view.nodes.some(node => elements.has(node.elementId)) || view.relationIds.some(id => relationIds.has(id)) || (view.featureId && elements.has(view.featureId))).map(view => view.id),
		mappings: model.codeMappings.filter(mapping => elements.has(mapping.elementId)).length,
		verifications: model.verifications.filter(verification => elements.has(verification.elementId)).length,
		permissions: model.semantics.elements.flatMap(element => (element.behavior?.permissions ?? []).filter(permission => elements.has(element.id) || elements.has(permission.actorId))).length
	};
}

/** Inclusion in a scoped perspective preserves ownership and declares outside elements as context. */
export function isDiagramContextElement(model: SemanticModel, view: ModelView, id: string): boolean {
	if ((model.version !== 4 && model.version !== 5) || !view.subjectId || id === view.subjectId || !['c4Context', 'c4Container', 'c4Component', 'class'].includes(view.kind)) { return false; }
	return view.kind === 'class' || !!view.contextIds?.includes(id) || model.foundation.ownership.find(entry => entry.elementId === id && entry.role === 'architecture')?.ownerId !== view.subjectId;
}

/** Ordinary views reuse shared relationships only when both endpoints are already visible. */
export function getAvailableDiagramRelations(model: SemanticModel, view: ModelView) {
	if (view.kind === 'state' || view.kind === 'sequence' || view.interactionId) { return []; }
	const visible = new Set(view.nodes.map(node => node.elementId));
	return model.semantics.relations.filter(relation => !view.relationIds.includes(relation.id)
		&& visible.has(relation.from) && visible.has(relation.to) && acceptsNotationRelation(view.kind, relation));
}

export function includeElement(view: ModelView, id: string, model?: SemanticModel): void {
	if (!view.nodes.some(node => node.elementId === id)) {
		const index = view.nodes.length;
		const point = { x: view.kind === 'sequence' ? index * 260 : (index % 3) * 260, y: view.kind === 'sequence' ? 0 : Math.floor(index / 3) * 180 };
		const element = model?.semantics.elements.find(element => element.id === id);
		if (model && element && view.kind !== 'sequence') {
			const size = notationNodeSize(element);
			const boxes = view.nodes.flatMap(node => { const element = model.semantics.elements.find(element => element.id === node.elementId); return element ? [{ ...node, ...notationNodeSize(element) }] : []; });
			// Move only the new card past collisions; authored positions stay unchanged.
			while (true) {
				const collision = boxes.find(box => point.x < box.x + box.width + 24 && point.x + size.width + 24 > box.x && point.y < box.y + box.height + 24 && point.y + size.height + 24 > box.y);
				if (!collision) { break; }
				point.x = collision.x + collision.width + 48;
			}
		}
		view.nodes.push({ elementId: id, ...point });
	}
}

export function excludeFromView(model: SemanticModel, view: ModelView, id: string, target: 'element' | 'relation'): void {
	if (target === 'element') {
		view.nodes = view.nodes.filter(node => node.elementId !== id);
		const attached = new Set(model.semantics.relations.filter(relation => relation.from === id || relation.to === id).map(relation => relation.id));
		view.relationIds = view.relationIds.filter(id => !attached.has(id));
	} else { view.relationIds = view.relationIds.filter(relationId => relationId !== id); }
}
