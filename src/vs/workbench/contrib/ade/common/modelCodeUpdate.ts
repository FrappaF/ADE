/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ModelView, type SemanticModel } from './modelTypes.js';
import { canonicalJson } from './modelSerialization.js';

export interface ModelCodeChange {
	collection: string;
	id: string;
	before: object | null;
	after: object | null;
}

export interface SavedModelChange {
	modelUri: string;
	model: SemanticModel;
	changes: ModelCodeChange[];
}

/** Keep authored diagram membership and order, excluding canvas geometry and viewport state. */
function codeView({ nodes, spec, ...view }: ModelView) {
	return { ...view, ...(spec ? { intent: spec.intent } : {}), elementIds: nodes.map(node => node.elementId) };
}

/** The implementation-relevant model snapshot, independent of canvas layout. */
export function codeUpdateContent(model: SemanticModel): object {
	return { ...model, views: model.views.map(codeView) };
}

/** Exact record deltas preserve removed definitions as well as their saved replacements. */
export function savedModelChanges(before: SemanticModel, after: SemanticModel): ModelCodeChange[] {
	const changes: ModelCodeChange[] = [];
	const compare = (collection: string, previous: readonly { id: string }[], current: readonly { id: string }[]) => {
		const old = new Map(previous.map(entry => [entry.id, entry])), next = new Map(current.map(entry => [entry.id, entry]));
		for (const id of new Set([...old.keys(), ...next.keys()])) {
			const before = old.get(id) ?? null, after = next.get(id) ?? null;
			if (canonicalJson(before) !== canonicalJson(after)) { changes.push({ collection, id, before, after }); }
		}
	};
	compare('elements', before.semantics.elements, after.semantics.elements);
	compare('relations', before.semantics.relations, after.semantics.relations);
	const views = (model: SemanticModel) => model.views.map(codeView);
	compare('views', views(before), views(after));
	for (const key of ['codeMappings', 'verifications', 'foundation', 'name'] as const) {
		const previous = key === 'foundation' ? (before.version === 4 || before.version === 5 ? before.foundation : null) : before[key];
		const current = key === 'foundation' ? (after.version === 4 || after.version === 5 ? after.foundation : null) : after[key];
		if (canonicalJson(previous) !== canonicalJson(current)) { changes.push({ collection: key, id: after.id, before: { value: previous }, after: { value: current } }); }
	}
	return structuredClone(changes);
}
