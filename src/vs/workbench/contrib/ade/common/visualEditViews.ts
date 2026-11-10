/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type SemanticModel } from './modelTypes.js';
import { getStateDiagram } from './stateDiagram.js';
import { arrangeDiagram } from './diagramLayout.js';
import { type VisualEditContext, type VisualEditOf } from './visualEditTypes.js';
import { includeElement, excludeFromView } from './visualEditSupport.js';

/** Views edits share the caller's transaction and validation boundary. */
export function applyViewsVisualEdit(context: VisualEditContext, edit: VisualEditOf<'c4View' | 'diagram' | 'include' | 'exclude' | 'position' | 'layout' | 'deleteDiagram'>): SemanticModel | undefined {
	const { candidate, view } = context;
	switch (edit.kind) {
		case 'c4View': candidate.views = candidate.views.some(view => view.id === edit.view.id) ? candidate.views.map(view => view.id === edit.view.id ? structuredClone(edit.view) : view) : [...candidate.views, structuredClone(edit.view)]; break;
		case 'diagram':
			candidate.views.push({ id: edit.id, name: edit.name, kind: edit.viewKind, featureId: edit.featureId, nodes: [], relationIds: [] });
			if (!edit.featureId) { delete candidate.views.at(-1)!.featureId; }
			break;
		case 'include': {
			const diagram = view(edit.viewId);
			const element = candidate.semantics.elements.find(element => element.id === edit.id);
			if (diagram.kind === 'state' && element?.kind === 'state' && !getStateDiagram(candidate, diagram).groups.some(group => group.resource.id === element.parentId)) { throw new Error(`Resource is outside this state diagram: ${element.parentId}`); }
			includeElement(diagram, edit.id);
			break;
		}
		case 'exclude':
			excludeFromView(candidate, view(edit.viewId), edit.id, edit.target);
			break;
		case 'position': {
			const node = view(edit.viewId).nodes.find(node => node.elementId === edit.id);
			if (!node) { throw new Error(`Unknown node: ${edit.id}`); }
			node.x = edit.x;
			node.y = edit.y;
			break;
		}
		case 'layout':
			view(edit.viewId).nodes = arrangeDiagram(candidate, view(edit.viewId), edit.density);
			break;
		case 'deleteDiagram':
			candidate.views = candidate.views.filter(view => view.id !== edit.id);
			break;
	}
	return undefined;
}
