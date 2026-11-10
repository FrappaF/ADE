/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { readSemanticDraft, readSemanticModel } from './modelValidation.js';
import { type ModelView, type SemanticModel } from './modelTypes.js';
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
	return {
		elements: [...elements],
		relations: model.semantics.relations.filter(relation => elements.has(relation.from) || elements.has(relation.to)).map(relation => relation.id),
		views: model.views.filter(view => view.nodes.some(node => elements.has(node.elementId)) || (view.featureId && elements.has(view.featureId))).map(view => view.id),
		mappings: model.codeMappings.filter(mapping => elements.has(mapping.elementId)).length,
		verifications: model.verifications.filter(verification => elements.has(verification.elementId)).length,
		permissions: model.semantics.elements.flatMap(element => element.behavior?.permissions ?? []).filter(permission => elements.has(permission.actorId)).length
	};
}

export function includeElement(view: ModelView, id: string): void {
	if (!view.nodes.some(node => node.elementId === id)) {
		const index = view.nodes.length;
		view.nodes.push({ elementId: id, x: view.kind === 'sequence' ? index * 260 : (index % 3) * 260, y: view.kind === 'sequence' ? 0 : Math.floor(index / 3) * 180 });
	}
}

export function excludeFromView(model: SemanticModel, view: ModelView, id: string, target: 'element' | 'relation'): void {
	if (target === 'element') {
		view.nodes = view.nodes.filter(node => node.elementId !== id);
		const attached = new Set(model.semantics.relations.filter(relation => relation.from === id || relation.to === id).map(relation => relation.id));
		view.relationIds = view.relationIds.filter(id => !attached.has(id));
	} else { view.relationIds = view.relationIds.filter(relationId => relationId !== id); }
}
