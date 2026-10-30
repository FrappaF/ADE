/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'node:crypto';
import type { IndexedFile, SourceEvidence } from './importCode.ts';

export interface SemanticReference {
	symbol: string;
	roles: number;
	provider: number;
	source: SourceEvidence;
	target: SourceEvidence;
}

export interface SemanticGraph {
	version: 1;
	sourceRevision: string;
	providers: { name: string; version: string; digest: string }[];
	indexedFiles: string[];
	bindings: { symbol: string; elementId: string; provider: number; evidence: SourceEvidence }[];
	dependencies: { id: string; from: string; to: string; references: SemanticReference[] }[];
	diagnostics: { code: 'outsideScope' | 'missingDocument' | 'missingDefinition' | 'unboundDefinition' | 'unboundReference' | 'ambiguousSymbol' | 'unresolvedRelationship'; file: string; symbol: string; provider: number; evidence?: SourceEvidence }[];
}

/** Endpoint identities, rather than occurrence ordering, determine a dependency identity. */
export function semanticDependencyId(projectId: string, from: string, to: string): string {
	return `semantic:${createHash('sha256').update(JSON.stringify([projectId, from, to])).digest('hex')}`;
}

/** Checks normalized evidence in addition to JSON shape and the M1 graph contract. */
export function validateSemanticGraph(graph: SemanticGraph, files: IndexedFile[], revision: string, projectId: string): void {
	if (graph.sourceRevision !== revision) { throw new Error('Semantic index belongs to a different source revision'); }
	const sources = new Map(files.map(file => [file.file, file]));
	const declarations = new Map(files.flatMap(file => file.declarations).map(item => [item.id, item]));
	const modules = new Map(files.filter(file => file.moduleId).map(file => [file.moduleId!, file]));
	const bindings = new Set<string>();
	const bindingKey = (elementId: string, symbol: string, provider: number, evidence: SourceEvidence): string => JSON.stringify([elementId, symbol, provider, evidence.file, evidence.start, evidence.end]);
	const check = (evidence: SourceEvidence, provider: number): void => {
		if (!graph.providers[provider] || sources.get(evidence.file)?.revision !== evidence.revision || evidence.start > evidence.end || evidence.line > evidence.endLine) { throw new Error('Inconsistent semantic source evidence'); }
	};
	for (const binding of graph.bindings) {
		check(binding.evidence, binding.provider);
		const name = declarations.get(binding.elementId)?.nameEvidence;
		if (!name || name.file !== binding.evidence.file || name.start !== binding.evidence.start || name.end !== binding.evidence.end) { throw new Error('Semantic definition does not match a declaration name'); }
		bindings.add(bindingKey(binding.elementId, binding.symbol, binding.provider, binding.evidence));
	}
	const ids = new Set<string>();
	for (const edge of graph.dependencies) {
		if (ids.has(edge.id) || edge.id !== semanticDependencyId(projectId, edge.from, edge.to) || (!declarations.has(edge.from) && !modules.has(edge.from)) || !declarations.has(edge.to) || !edge.references.length) { throw new Error('Invalid semantic dependency'); }
		ids.add(edge.id);
		for (const reference of edge.references) {
			check(reference.source, reference.provider);
			check(reference.target, reference.provider);
			const owner = declarations.get(edge.from)?.evidence;
			const module = modules.get(edge.from);
			if (owner ? reference.source.file !== owner.file || reference.source.start < owner.start || reference.source.end > owner.end : reference.source.file !== module?.file) { throw new Error('Semantic reference is outside its owner'); }
			if (!bindings.has(bindingKey(edge.to, reference.symbol, reference.provider, reference.target))) { throw new Error('Semantic target has no matching definition'); }
		}
	}
	for (const file of graph.indexedFiles) { if (!sources.get(file)?.revision) { throw new Error('Semantic index names an unindexed source file'); } }
	for (const diagnostic of graph.diagnostics) {
		if (!graph.providers[diagnostic.provider]) { throw new Error('Unknown semantic diagnostic provider'); }
		if (diagnostic.evidence) { check(diagnostic.evidence, diagnostic.provider); }
	}
}
