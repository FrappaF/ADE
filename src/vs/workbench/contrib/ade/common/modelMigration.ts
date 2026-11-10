/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { emptyFoundation } from './modelFoundation.js';
import { InvalidSemanticModelError, readSemanticDraft, readSemanticModel, validateSemanticModel } from './modelValidation.js';
import { type SemanticModelV4 } from './modelTypes.js';

/** Identity is allocated once by the tool, then persisted; never derived from labels, paths or positions. */
export type ModelIdFactory = () => string;

/** Explicit v2/v3 upgrade on a detached copy. Reading an existing v4 draft allocates no identities. */
export function migrateSemanticModelToV4(value: unknown, nextId: ModelIdFactory = () => globalThis.crypto.randomUUID()): SemanticModelV4 {
	const draft = readSemanticDraft(value);
	if ((draft.version === 4 || draft.version === 5)) { return draft as SemanticModelV4; }
	const source = readSemanticModel(draft);
	const sourceVersion = source.version as 2 | 3;
	const model = { ...source, version: 4 as const, foundation: emptyFoundation() };
	const f = model.foundation;
	const allocated = new Set([...source.semantics.elements, ...source.semantics.relations, ...source.views, ...source.codeMappings, ...source.verifications].map(item => item.id));
	const allocate = (): string => {
		const id = nextId();
		if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(id) || allocated.has(id)) { throw new Error('Migration requires a fresh valid identity for every new object'); }
		allocated.add(id); return id;
	};
	const byId = new Map(model.semantics.elements.map(element => [element.id, element]));
	const unresolvedOwnershipIds: string[] = [];
	for (const element of model.semantics.elements) {
		if (element.behavior) {
			element.behavior.id = allocate();
			for (const field of [...element.behavior.inputs, ...element.behavior.outputs]) { field.id = allocate(); }
		}
		for (const member of element.details?.members ?? []) { member.id = allocate(); }
		if (element.parentId) {
			const parent = byId.get(element.parentId)!;
			if (parent.kind === 'feature') { f.memberships.push({ id: allocate(), elementId: element.id, featureId: parent.id }); }
			else if (element.kind === 'state' && ['resource', 'entity', 'class'].includes(parent.kind)) { f.ownership.push({ id: allocate(), elementId: element.id, ownerId: parent.id, role: 'lifecycle' }); }
			else { unresolvedOwnershipIds.push(element.id); }
		}
	}
	for (const view of model.views.filter(view => view.kind === 'sequence')) {
		f.interactions.push({ id: allocate(), ...(view.featureId ? { ownerId: view.featureId } : {}), occurrenceIds: [], frameIds: [], legacyViewId: view.id, legacyRelationOrder: [...view.relationIds] });
	}
	f.migration = { sourceVersion, unresolvedOwnershipIds };
	const diagnostics = validateSemanticModel(model);
	if (diagnostics.some(item => item.severity === 'error')) { throw new InvalidSemanticModelError(diagnostics); }
	return model;
}

/** Explicit import normalization: region is an alias only; persisted executable frames use critical. */
export function normalizeInteractionAliases(value: unknown): SemanticModelV4 {
	const copy = structuredClone(value);
	if (copy && typeof copy === 'object' && 'foundation' in copy && copy.foundation && typeof copy.foundation === 'object' && 'frames' in copy.foundation && Array.isArray(copy.foundation.frames)) {
		for (const frame of copy.foundation.frames) { if (frame && typeof frame === 'object' && 'kind' in frame && frame.kind === 'region') { frame.kind = 'critical'; } }
	}
	const model = readSemanticDraft(copy); if ((model.version !== 4 && model.version !== 5)) { throw new Error('Executable frame normalization requires v4'); } return model;
}

/** Upgrade a detached copy without changing IDs, executable policies or unknown knowledge. */
export function migrateSemanticModelToV5(value: unknown, nextId?: ModelIdFactory): SemanticModelV4 {
	const draft = readSemanticDraft(value);
	if (draft.version === 5) { return draft; }
	const model = migrateSemanticModelToV4(draft, nextId);
	model.version = 5;
	model.foundation.evidence = [];
	return readSemanticModel(model) as SemanticModelV4;
}
