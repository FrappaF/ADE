/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { readSemanticModel, type ElementKind, type ModelView, type RelationKind, type SemanticModel } from './semanticModel.js';
import { getDiagramGroups } from './visualNavigation.js';

export type VisualEdit =
	| { kind: 'feature'; id: string; name: string }
	| { kind: 'diagram'; id: string; name: string; featureId?: string; viewKind: 'structure' | 'activity' }
	| { kind: 'element'; id: string; name: string; elementKind: ElementKind; viewId: string; parentId?: string }
	| { kind: 'include'; id: string; viewId: string }
	| { kind: 'relation'; id: string; viewId: string; from: string; to: string; relationKind: RelationKind; name: string; condition?: string }
	| { kind: 'rename'; id: string; name: string; target: 'element' | 'diagram' }
	| { kind: 'description'; id: string; description: string }
	| { kind: 'condition'; id: string; condition: string }
	| { kind: 'position'; viewId: string; id: string; x: number; y: number }
	| { kind: 'layout'; viewId: string }
	| { kind: 'deleteElement'; id: string }
	| { kind: 'deleteDiagram'; id: string }
	| { kind: 'deleteRelation'; id: string };

/** Conservative upgrade: ownership becomes explicit, while semantic identities and layout stay intact. */
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
	return readSemanticModel(candidate);
}

/** All identities affected by a semantic deletion, including descendants and shared-view references. */
export function getDeletionImpact(model: SemanticModel, id: string) {
	const elements = new Set([id]);
	let changed = true;
	while (changed) {
		changed = false;
		for (const element of model.semantics.elements) {
			if (element.parentId && elements.has(element.parentId) && !elements.has(element.id)) {
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

/** Apply one atomic, validated edit to a detached snapshot; no filesystem or UI dependencies. */
export function applyVisualEdit(model: SemanticModel, edit: VisualEdit): SemanticModel {
	const candidate = upgradeVisualModel(model);
	const view = (id: string): ModelView => {
		const result = candidate.views.find(view => view.id === id);
		if (!result) { throw new Error(`Unknown diagram: ${id}`); }
		return result;
	};
	switch (edit.kind) {
		case 'feature':
			candidate.semantics.elements.push({ id: edit.id, kind: 'feature', name: edit.name });
			break;
		case 'diagram':
			candidate.views.push({ id: edit.id, name: edit.name, kind: edit.viewKind, featureId: edit.featureId, nodes: [], relationIds: [] });
			if (!edit.featureId) { delete candidate.views.at(-1)!.featureId; }
			break;
		case 'element': {
			const diagram = view(edit.viewId);
			const parentId = edit.parentId ?? diagram.featureId;
			candidate.semantics.elements.push({ id: edit.id, kind: edit.elementKind, name: edit.name, ...(parentId ? { parentId } : {}) });
			diagram.nodes.push({ elementId: edit.id, x: (diagram.nodes.length % 3) * 260, y: Math.floor(diagram.nodes.length / 3) * 180 });
			break;
		}
		case 'include': {
			const diagram = view(edit.viewId);
			if (!diagram.nodes.some(node => node.elementId === edit.id)) {
				diagram.nodes.push({ elementId: edit.id, x: (diagram.nodes.length % 3) * 260, y: Math.floor(diagram.nodes.length / 3) * 180 });
			}
			break;
		}
		case 'relation': {
			const diagram = view(edit.viewId);
			candidate.semantics.relations.push({ id: edit.id, kind: edit.relationKind, from: edit.from, to: edit.to, name: edit.name,
				...(edit.condition?.trim() ? { condition: edit.condition } : {}) });
			diagram.relationIds.push(edit.id);
			break;
		}
		case 'rename': {
			const target = edit.target === 'diagram' ? view(edit.id) : candidate.semantics.elements.find(element => element.id === edit.id);
			if (!target) { throw new Error(`Unknown element: ${edit.id}`); }
			target.name = edit.name;
			break;
		}
		case 'description': {
			const element = candidate.semantics.elements.find(element => element.id === edit.id);
			if (!element) { throw new Error(`Unknown element: ${edit.id}`); }
			element.description = edit.description;
			break;
		}
		case 'condition': {
			const relation = candidate.semantics.relations.find(relation => relation.id === edit.id);
			if (!relation) { throw new Error(`Unknown relation: ${edit.id}`); }
			if (edit.condition.trim()) { relation.condition = edit.condition; } else { delete relation.condition; }
			break;
		}
		case 'position': {
			const node = view(edit.viewId).nodes.find(node => node.elementId === edit.id);
			if (!node) { throw new Error(`Unknown node: ${edit.id}`); }
			node.x = edit.x;
			node.y = edit.y;
			break;
		}
		case 'layout':
			view(edit.viewId).nodes.forEach((node, index) => { node.x = (index % 3) * 260; node.y = Math.floor(index / 3) * 180; });
			break;
		case 'deleteDiagram':
			candidate.views = candidate.views.filter(view => view.id !== edit.id);
			break;
		case 'deleteRelation':
			candidate.semantics.relations = candidate.semantics.relations.filter(relation => relation.id !== edit.id);
			for (const diagram of candidate.views) { diagram.relationIds = diagram.relationIds.filter(id => id !== edit.id); }
			break;
		case 'deleteElement': {
			const impact = getDeletionImpact(candidate, edit.id);
			candidate.semantics.elements = candidate.semantics.elements.filter(element => !impact.elements.includes(element.id));
			candidate.semantics.relations = candidate.semantics.relations.filter(relation => !impact.relations.includes(relation.id));
			candidate.views = candidate.views.filter(view => !view.featureId || !impact.elements.includes(view.featureId));
			for (const diagram of candidate.views) {
				diagram.nodes = diagram.nodes.filter(node => !impact.elements.includes(node.elementId));
				diagram.relationIds = diagram.relationIds.filter(id => !impact.relations.includes(id));
			}
			for (const element of candidate.semantics.elements) {
				if (element.behavior) { element.behavior.permissions = element.behavior.permissions.filter(permission => !impact.elements.includes(permission.actorId)); }
			}
			candidate.codeMappings = candidate.codeMappings.filter(mapping => !impact.elements.includes(mapping.elementId));
			candidate.verifications = candidate.verifications.filter(verification => !impact.elements.includes(verification.elementId));
			break;
		}
	}
	return readSemanticModel(candidate);
}
