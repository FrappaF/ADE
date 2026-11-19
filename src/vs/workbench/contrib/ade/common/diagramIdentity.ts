/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { canonicalJson } from './modelSerialization.js';
import { type ElementKind, type EvidenceRecord, type ModelDiagnostic, type SemanticModelV4, type SemanticRelation } from './modelTypes.js';

const declarationFactPrefix = 'source-declaration:';
const directlyDeclaredKinds = new Set<ElementKind>(['action', 'class', 'interface', 'contract']);

/** Identify complete, parser-indexed declarations in revisioned source evidence. */
export function sourceDeclarationFact(symbolId: string): string {
	return declarationFactPrefix + symbolId;
}

export interface DiagramElementLookup {
	id?: string;
	name?: string;
	kind?: ElementKind;
	ownerId?: string;
	evidenceIds?: string[];
}

type Match = 'id' | 'name-and-definition' | 'definition' | 'name-and-evidence' | 'name' | 'evidence';
const matchOrder: readonly Match[] = ['id', 'name-and-definition', 'definition', 'name-and-evidence', 'name', 'evidence'];

interface DiagramElementCandidate {
	id: string;
	name: string;
	kind: ElementKind;
	ownerIds: string[];
	match: Match;
	evidenceIds: string[];
}

interface Anchors {
	ids: string[];
	ranges: Set<string>;
	declarations: Set<string>;
}

function anchors(records: readonly EvidenceRecord[]): Anchors {
	const result: Anchors = { ids: [], ranges: new Set(), declarations: new Set() };
	for (const record of records) {
		if (record.start >= record.end) { continue; }
		result.ids.push(record.id);
		result.ranges.add(JSON.stringify([record.file, record.revision, record.start, record.end]));
		for (const fact of record.factIds) {
			if (record.nature === 'syntax' && fact.startsWith(declarationFactPrefix)) { result.declarations.add(JSON.stringify([record.file, record.revision, fact])); }
		}
	}
	return result;
}

function elementIdentities(model: SemanticModelV4) {
	const anchorIds = new Map<string, Set<string>>();
	for (const assertion of model.foundation.assertions) {
		if (assertion.subject.kind !== 'element' || assertion.acceptance.status === 'rejected' || !['/name', '/kind'].includes(assertion.field)) { continue; }
		const ids = anchorIds.get(assertion.subject.id) ?? new Set<string>();
		for (const id of assertion.evidenceIds ?? []) { ids.add(id); }
		anchorIds.set(assertion.subject.id, ids);
	}
	const evidence = new Map(model.foundation.evidence?.map(record => [record.id, record]));
	const owners = new Map(model.foundation.ownership.map(entry => [entry.elementId, entry.ownerId]));
	const features = new Set(model.semantics.elements.filter(element => element.kind === 'feature').map(element => element.id));
	return model.semantics.elements.map(element => {
		const legacyParent = element.parentId && !features.has(element.parentId) ? element.parentId : undefined;
		const owner = owners.get(element.id) ?? legacyParent;
		const records = [...(anchorIds.get(element.id) ?? [])].flatMap(id => evidence.get(id) ?? []);
		return { element, name: nameKey(element.name), ownerIds: owner ? [owner] : [], anchors: anchors(records) };
	});
}

function nameKey(name: string): string {
	return name.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase();
}

function overlaps(a: Set<string>, b: Set<string>): boolean {
	return [...a].some(value => b.has(value));
}

/** Return ranked candidates, with ties at the strongest evidence level left unresolved. */
export function lookupDiagramElements(model: SemanticModelV4, lookup: DiagramElementLookup, sessionEvidence: readonly EvidenceRecord[]): { status: 'matched' | 'ambiguous' | 'none'; candidates: DiagramElementCandidate[]; total: number } {
	const evidence = new Map([...(model.foundation.evidence ?? []), ...sessionEvidence].map(record => [record.id, record]));
	const sought = anchors((lookup.evidenceIds ?? []).map(id => {
		const record = evidence.get(id);
		if (!record) { throw new Error('unknownEvidence:' + id); }
		return record;
	}));
	const name = lookup.name ? nameKey(lookup.name) : '';
	const candidates: DiagramElementCandidate[] = [];
	for (const identity of elementIdentities(model)) {
		const { element, ownerIds } = identity;
		if (lookup.id && element.id !== lookup.id || lookup.kind && element.kind !== lookup.kind || lookup.ownerId && !ownerIds.includes(lookup.ownerId)) { continue; }
		const equalName = !!name && identity.name === name;
		const equalDefinition = overlaps(sought.declarations, identity.anchors.declarations);
		const equalRange = (!sought.declarations.size || !identity.anchors.declarations.size || equalDefinition) && overlaps(sought.ranges, identity.anchors.ranges);
		let match: Match | undefined;
		if (lookup.id) { match = 'id'; }
		else if (equalDefinition) { match = equalName ? 'name-and-definition' : 'definition'; }
		else if (equalName) { match = equalRange ? 'name-and-evidence' : 'name'; }
		else if (equalRange) { match = 'evidence'; }
		if (match) { candidates.push({ id: element.id, name: element.name, kind: element.kind, ownerIds, match, evidenceIds: identity.anchors.ids.slice(0, 8) }); }
	}
	candidates.sort((a, b) => matchOrder.indexOf(a.match) - matchOrder.indexOf(b.match) || (a.id < b.id ? -1 : a.id === b.id ? 0 : 1));
	const status = !candidates.length ? 'none' : candidates[0].match === candidates[1]?.match ? 'ambiguous' : 'matched';
	return { status, candidates: candidates.slice(0, 12), total: candidates.length };
}

type ElementIdentity = ReturnType<typeof elementIdentities>[number];

function compatibleElementScope(a: ElementIdentity, b: ElementIdentity): boolean {
	const differentSystemScope = a.element.scope && b.element.scope && a.element.scope !== b.element.scope;
	const differentRuntime = a.element.runtimeKind && b.element.runtimeKind && a.element.runtimeKind !== b.element.runtimeKind;
	const differentOwners = a.ownerIds[0] && b.ownerIds[0] && a.ownerIds[0] !== b.ownerIds[0];
	return a.element.kind === b.element.kind && !differentSystemScope && !differentRuntime && !differentOwners;
}

function sameElementIdentity(a: ElementIdentity, b: ElementIdentity): boolean {
	if (!compatibleElementScope(a, b)) { return false; }
	const aDeclarations = a.anchors.declarations, bDeclarations = b.anchors.declarations;
	const equalDeclarations = aDeclarations.size === bDeclarations.size && [...aDeclarations].every(anchor => bDeclarations.has(anchor));
	if (aDeclarations.size && bDeclarations.size && !equalDeclarations) { return false; }
	const sameDefinition = aDeclarations.size === 1 && equalDeclarations;
	if (sameDefinition && directlyDeclaredKinds.has(a.element.kind)) { return true; }
	if (a.name !== b.name) { return false; }
	if (sameDefinition) { return true; }
	return !!a.anchors.ranges.size && a.anchors.ranges.size === b.anchors.ranges.size && [...a.anchors.ranges].every(range => b.anchors.ranges.has(range));
}

function relationIdentity(relation: SemanticRelation): string {
	const { kind, from, to, name, condition, errorCode, details } = relation;
	const qualifiers = details && Object.values(details).some(value => value !== '') ? details : null;
	return canonicalJson([kind, from, to, nameKey(name), condition ?? null, errorCode ?? null, qualifiers]);
}

/** Guard proposals and replay against new identity collisions while tolerating pre-existing ones. */
export function diagramIdentityDiagnostics(before: SemanticModelV4, after: SemanticModelV4, options: { elements: Set<string>; relations: Set<string>; checkUnanchored: boolean }): ModelDiagnostic[] {
	const diagnostics: ModelDiagnostic[] = [];
	const report = (collection: 'elements' | 'relations', id: string, reason: string, other: string) => {
		diagnostics.push({ code: 'contract', severity: 'error', path: `/semantics/${collection}/${id}`, args: [reason, other] });
	};
	if (options.elements.size) {
		const previous = new Map(elementIdentities(before).map(identity => [identity.element.id, identity]));
		const identities = elementIdentities(after);
		const mapped = new Set(after.codeMappings.map(mapping => mapping.elementId));
		for (const identity of identities.filter(entry => options.elements.has(entry.element.id))) {
			const old = previous.get(identity.element.id);
			const initialCount = diagnostics.length;
			for (const existing of identities) {
				if (existing.element.id === identity.element.id || !sameElementIdentity(identity, existing)) { continue; }
				const oldExisting = previous.get(existing.element.id);
				if (!old || !oldExisting || !sameElementIdentity(old, oldExisting)) {
					report('elements', identity.element.id, 'duplicateElementIdentity', existing.element.id);
				}
			}
			if (!options.checkUnanchored || old || diagnostics.length !== initialCount) { continue; }
			const manualMatches = identities.filter(existing => previous.has(existing.element.id)
				&& !existing.anchors.ranges.size && !mapped.has(existing.element.id)
				&& identity.name === existing.name && identity.ownerIds[0] === existing.ownerIds[0]
				&& compatibleElementScope(identity, existing));
			if (manualMatches.length === 1) {
				report('elements', identity.element.id, 'unconfirmedElementIdentity', manualMatches[0].element.id);
			}
		}
	}
	if (options.relations.size) {
		const previous = new Map(before.semantics.relations.map(relation => [relation.id, relationIdentity(relation)]));
		const identities = new Map(after.semantics.relations.map(relation => [relation.id, relationIdentity(relation)]));
		for (const id of options.relations) {
			const key = identities.get(id);
			if (key === undefined) { continue; }
			for (const [other, otherKey] of identities) {
				if (other !== id && key === otherKey && (!previous.has(id) || previous.get(id) !== previous.get(other))) { report('relations', id, 'duplicateRelationIdentity', other); }
			}
		}
	}
	return diagnostics;
}
