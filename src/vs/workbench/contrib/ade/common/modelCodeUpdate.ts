/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type EvidenceRecord, type ModelView, type SemanticElement, type SemanticModel } from './modelTypes.js';
import { canonicalJson, type ModelJson } from './modelSerialization.js';

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

export interface ModelCodeUpdateItem {
	collection: string;
	id: string;
	label: string;
	kind: 'added' | 'modified' | 'removed';
	fields?: readonly string[];
	preview?: readonly { field: string; before: string; after: string }[];
}

export interface ModelCodeUpdateState {
	id: string;
	phase: 'ready' | 'running' | 'completed' | 'failed' | 'cancelled' | 'unavailable';
	changes: readonly ModelCodeUpdateItem[];
	status?: string;
	summary?: string;
	durationMs?: number;
	stopping?: boolean;
	canRefresh?: boolean;
}

export interface ModelCodeUpdateContext {
	version: 2;
	direction: 'model-to-code';
	project: { id: string; name: string };
	changes: ModelCodeChange[];
	affectedViews: (Pick<ModelView, 'id' | 'name' | 'kind'> & { intent?: string })[];
	referencedElements: Pick<SemanticElement, 'id' | 'name' | 'kind'>[];
	sourceHints: { mappings: SemanticModel['codeMappings']; evidence: EvidenceRecord[] };
}

/** Keep authored diagram membership and order, excluding canvas geometry and viewport state. */
function codeView({ nodes, spec, ...view }: ModelView) {
	return { ...view, ...(spec ? { intent: spec.intent } : {}), elementIds: nodes.map(node => node.elementId) };
}

/** The implementation-relevant model snapshot, independent of canvas layout. */
export function codeUpdateContent(model: SemanticModel): object {
	return { ...model, views: model.views.map(codeView) };
}

/** Compare identified declarations individually even when they belong to nested foundation sections. */
function codeRecords(model: SemanticModel): Record<string, readonly { id: string }[]> {
	const records: Record<string, readonly { id: string }[]> = {
		elements: model.semantics.elements,
		relations: model.semantics.relations,
		views: model.views.map(codeView),
		codeMappings: model.codeMappings,
		verifications: model.verifications
	};
	if (model.version === 4 || model.version === 5) {
		const { blueprint, platform, migration, ...collections } = model.foundation;
		for (const [key, entries] of Object.entries(collections)) { records[`foundation.${key}`] = entries; }
		for (const [key, entries] of Object.entries(blueprint ?? {})) { records[`foundation.blueprint.${key}`] = entries; }
		records['foundation.platform.bindings'] = platform.bindings;
		const migrationRecords = migration ? [{ id: model.id, ...migration }] : [];
		records['foundation.migration'] = migrationRecords;
	}
	return records;
}

/** Exact record deltas preserve removed definitions as well as their saved replacements. */
export function savedModelChanges(before: SemanticModel, after: SemanticModel): ModelCodeChange[] {
	const changes: ModelCodeChange[] = [];
	const previous = codeRecords(before), current = codeRecords(after);
	for (const collection of new Set([...Object.keys(previous), ...Object.keys(current)])) {
		const old = new Map((previous[collection] ?? []).map(entry => [entry.id, entry]));
		const next = new Map((current[collection] ?? []).map(entry => [entry.id, entry]));
		for (const id of new Set([...old.keys(), ...next.keys()])) {
			const before = old.get(id) ?? null, after = next.get(id) ?? null;
			if (canonicalJson(before) !== canonicalJson(after)) { changes.push({ collection, id, before, after }); }
		}
	}
	if (before.name !== after.name) { changes.push({ collection: 'name', id: after.id, before: { name: before.name }, after: { name: after.name } }); }
	return structuredClone(changes);
}

/** Keep the first preimage and latest postimage until an update succeeds. */
export function mergeModelCodeChanges(previous: readonly ModelCodeChange[], next: readonly ModelCodeChange[]): ModelCodeChange[] {
	const key = ({ collection, id }: ModelCodeChange) => JSON.stringify([collection, id]);
	const result = new Map(previous.map(change => [key(change), change]));
	for (const change of next) {
		const identity = key(change);
		const existing = result.get(identity);
		const merged = existing ? { ...change, before: existing.before } : change;
		if (canonicalJson(merged.before) === canonicalJson(merged.after)) { result.delete(identity); }
		else { result.set(identity, merged); }
	}
	return [...result.values()];
}

function changedFields(before: Record<string, unknown>, after: Record<string, unknown>, prefix = ''): string[] {
	const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
	return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap(key => {
		const previous = before[key], current = after[key];
		if (canonicalJson((previous ?? null) as ModelJson) === canonicalJson((current ?? null) as ModelJson) && Object.hasOwn(before, key) === Object.hasOwn(after, key)) { return []; }
		const path = prefix + key;
		return isRecord(previous) && isRecord(current) ? changedFields(previous, current, `${path}.`) : [path];
	});
}

export function describeModelCodeChanges(changes: readonly ModelCodeChange[]): ModelCodeUpdateItem[] {
	const scalar = (value: unknown) => value === null || typeof value !== 'object';
	const display = (value: unknown) => {
		const text = value === undefined ? '—' : String(value);
		return text.length > 160 ? text.slice(0, 159) + '…' : text;
	};
	return changes.map(({ collection, id, before, after }) => {
		const record = (after ?? before) as Record<string, unknown>;
		const label = [record.name, record.symbol, record.field, record.file].find((value): value is string => typeof value === 'string' && value.length > 0);
		if (!before || !after) { return { collection, id, label: label ?? id, kind: before ? 'removed' : 'added' }; }
		const previous = before as Record<string, unknown>, current = after as Record<string, unknown>;
		const fields = changedFields(previous, current);
		const preview = fields.filter(field => !field.includes('.') && scalar(previous[field]) && scalar(current[field])).slice(0, 3)
			.map(field => ({ field, before: display(previous[field]), after: display(current[field]) }));
		return { collection, id, label: label ?? id, kind: 'modified', fields, ...(preview.length ? { preview } : {}) };
	});
}

/** Keep the changed records and only identifiers and source hints that explain this delta. */
export function createModelCodeUpdateContext({ model, changes }: SavedModelChange): ModelCodeUpdateContext {
	const references = new Set<string>();
	const collect = (value: unknown, isReference = false): void => {
		if (typeof value === 'string' && isReference) { references.add(value); }
		else if (Array.isArray(value)) { for (const item of value) { collect(item, isReference); } }
		else if (value && typeof value === 'object') {
			for (const [key, child] of Object.entries(value)) { collect(child, key === 'id' || /(?:Id|Ids)$/.test(key) || ['from', 'to', 'before', 'after', 'steps'].includes(key)); }
		}
	};
	for (const change of changes) { references.add(change.id); collect(change.before); collect(change.after); }
	const direct = new Set(references);
	for (const relation of model.semantics.relations) {
		if (direct.has(relation.id) || direct.has(relation.from) || direct.has(relation.to)) {
			references.add(relation.id); references.add(relation.from); references.add(relation.to);
		}
	}
	const foundation = model.version === 4 || model.version === 5 ? model.foundation : undefined;
	const interactions = new Set(foundation?.interactions.filter(entry => direct.has(entry.id) || entry.occurrenceIds.some(id => direct.has(id)) || entry.frameIds.some(id => direct.has(id))).map(entry => entry.id));
	for (const assertion of foundation?.assertions ?? []) {
		if (references.has(assertion.subject.id)) { for (const id of assertion.evidenceIds ?? []) { references.add(id); } }
	}
	return {
		version: 2,
		direction: 'model-to-code',
		project: { id: model.id, name: model.name },
		changes,
		affectedViews: model.views.filter(view => direct.has(view.id) || (view.interactionId && interactions.has(view.interactionId)) || view.nodes.some(node => direct.has(node.elementId)) || view.relationIds.some(id => direct.has(id)))
			.map(({ id, name, kind, spec }) => ({ id, name, kind, ...(spec?.intent ? { intent: spec.intent } : {}) })),
		referencedElements: model.semantics.elements.filter(element => references.has(element.id)).map(({ id, name, kind }) => ({ id, name, kind })),
		sourceHints: {
			mappings: model.codeMappings.filter(mapping => references.has(mapping.elementId)),
			evidence: foundation?.evidence?.filter(record => references.has(record.id)) ?? []
		}
	};
}
