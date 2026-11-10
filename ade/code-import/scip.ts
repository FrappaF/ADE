/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { importCode, projectModel, validateProjection, type CodeImport, type SourceEvidence, type IndexedFile, type CodeDeclaration } from './importCode.ts';
import { semanticDependencyId, validateSemanticGraph, type SemanticGraph } from './semanticGraph.ts';
import { array, object, text, digest } from '../runtime/schemas.ts';
import { isSourcePath } from './paths.ts';

interface SingleLineRange { line?: number; start_character?: number; end_character?: number }
interface MultiLineRange { start_line?: number; start_character?: number; end_line?: number; end_character?: number }
interface ScipOccurrence {
	range?: number[];
	single_line_range?: SingleLineRange;
	multi_line_range?: MultiLineRange;
	/** Go's encoding/json serializes protobuf oneof wrappers with these exported names. */
	TypedRange?: { SingleLineRange?: SingleLineRange; MultiLineRange?: MultiLineRange } | null;
	symbol?: string;
	symbol_roles?: number;
}
interface ScipDocument {
	relative_path: string;
	position_encoding?: number;
	text?: string;
	occurrences?: ScipOccurrence[];
	symbols?: { symbol: string; relationships?: { symbol?: string }[] }[];
}
interface ScipIndex {
	metadata: { project_root: string; tool_info: { name: string; version?: string }; text_document_encoding?: number };
	documents?: ScipDocument[];
}

export interface ScipBundle {
	version: 1;
	sourceRoot: string;
	sourceRevision: string;
	/** Explicit fallback for older indexers that omit position_encoding. */
	positionEncoding?: 1 | 2 | 3;
	index: ScipIndex;
}

const integer = { type: 'integer', minimum: 0, maximum: 2147483647 };
const range = { type: 'array', items: integer, minItems: 3, maxItems: 4 };
const single = { type: 'object', properties: { line: integer, start_character: integer, end_character: integer }, additionalProperties: false };
const multi = { type: 'object', properties: { start_line: integer, start_character: integer, end_line: integer, end_character: integer }, additionalProperties: false };
const openObject = (properties: Record<string, object>, optional: string[] = []): object => ({ ...object(properties, optional), additionalProperties: true });
const indexSchema = openObject({
	metadata: openObject({ project_root: text, tool_info: openObject({ name: text, version: { type: 'string' } }, ['version']), text_document_encoding: { enum: [0, 1] } }, ['text_document_encoding']),
	documents: array(openObject({
		relative_path: text, position_encoding: { enum: [0, 1, 2, 3] }, text: { type: 'string' },
		occurrences: array(openObject({ range, single_line_range: single, multi_line_range: multi, TypedRange: { anyOf: [{ type: 'null' }, { type: 'object', properties: { SingleLineRange: single, MultiLineRange: multi }, minProperties: 1, maxProperties: 1, additionalProperties: false }] }, symbol: { type: 'string', pattern: '^[^\u0000]*$' }, symbol_roles: integer }, ['range', 'single_line_range', 'multi_line_range', 'TypedRange', 'symbol', 'symbol_roles'])),
		symbols: array(openObject({ symbol: text, relationships: array(openObject({ symbol: text }, ['symbol'])) }, ['relationships']))
	}, ['position_encoding', 'text', 'occurrences', 'symbols']))
}, ['documents']);
const ajv = new Ajv2020({ allErrors: true });
const validateIndex = ajv.compile<ScipIndex>(indexSchema);
const validateBundle = ajv.compile<ScipBundle>(object({ version: { const: 1 }, sourceRoot: text, sourceRevision: digest, positionEncoding: { enum: [1, 2, 3] }, index: indexSchema }, ['positionEncoding']));
const hash = (value: string): string => createHash('sha256').update(value).digest('hex');

/** The input schema is a subset of SCIP JSON; unknown protocol metadata is retained, not executed. */
export function readScipBundle(value: unknown): ScipBundle {
	if (!validateBundle(value)) { throw new Error(`Invalid SCIP bundle: ${ajv.errorsText(validateBundle.errors)}`); }
	return structuredClone(value);
}

/** Requires the indexer's declared root and document paths to match the selected source scope. */
async function checkIndexRoot(index: ScipIndex, root: string): Promise<void> {
	const uri = new URL(index.metadata.project_root);
	if (uri.protocol !== 'file:' || await realpath(fileURLToPath(uri)) !== root) { throw new Error('SCIP project root differs from the source root'); }
	const paths = new Set<string>();
	for (const document of index.documents ?? []) {
		if (!isSourcePath(document.relative_path) || paths.has(document.relative_path)) { throw new Error('Invalid or duplicate SCIP document path'); }
		paths.add(document.relative_path);
	}
}

/** Runs a caller-selected index producer between source-manifest checks. No indexer is chosen implicitly. */
export async function captureScip(state: CodeImport, produce: () => Promise<unknown>, positionEncoding?: 1 | 2 | 3, signal?: AbortSignal): Promise<ScipBundle> {
	validateProjection(state);
	const before = await importCode(state.sourceRoot, state.projectId, { previous: state, signal });
	if (before.revision !== state.revision) { throw new Error('Source changed before SCIP capture'); }
	const index = await produce();
	if (!validateIndex(index)) { throw new Error(`Invalid SCIP index: ${ajv.errorsText(validateIndex.errors)}`); }
	await checkIndexRoot(index, state.sourceRoot);
	const after = await importCode(state.sourceRoot, state.projectId, { previous: state, signal });
	if (after.revision !== state.revision) { throw new Error('Source changed during SCIP capture'); }
	signal?.throwIfAborted();
	return { version: 1, sourceRoot: state.sourceRoot, sourceRevision: state.revision, ...(positionEncoding ? { positionEncoding } : {}), index: structuredClone(index) };
}

/** Converts explicit SCIP position units to the UTF-16 offsets used by the semantic domain. */
function sourceRange(source: string, file: IndexedFile, encoding: number): (occurrence: ScipOccurrence) => SourceEvidence {
	const offsets = [0];
	for (let index = 0; index < source.length; index++) { if (source[index] === '\n') { offsets.push(index + 1); } }
	const columns = new Map<number, Map<number, number>>();
	const offset = (line: number, column: number): number => {
		if (offsets[line] === undefined) { throw new Error(`SCIP range is outside the source: ${file.file}`); }
		const end = line + 1 < offsets.length ? offsets[line + 1] - 1 : source.length;
		const content = source.slice(offsets[line], end);
		if (encoding === 2) {
			if (column > content.length || (column > 0 && /[\uD800-\uDBFF]/.test(content[column - 1]) && /[\uDC00-\uDFFF]/.test(content[column] ?? ''))) { throw new Error('SCIP range splits a UTF-16 character or exceeds a line'); }
			return offsets[line] + column;
		}
		let positions = columns.get(line);
		if (!positions) {
			positions = new Map([[0, 0]]);
			let units = 0;
			let utf16 = 0;
			for (const character of content) { units += encoding === 1 ? Buffer.byteLength(character) : 1; utf16 += character.length; positions.set(units, utf16); }
			columns.set(line, positions);
		}
		const position = positions.get(column);
		if (position === undefined) { throw new Error('SCIP range splits a character or exceeds a line'); }
		return offsets[line] + position;
	};
	return occurrence => {
		const singles = [occurrence.single_line_range, occurrence.TypedRange?.SingleLineRange].filter(item => !!item);
		const multis = [occurrence.multi_line_range, occurrence.TypedRange?.MultiLineRange].filter(item => !!item);
		if (singles.length + multis.length > 1) { throw new Error('SCIP occurrence has multiple typed ranges'); }
		const single = singles[0];
		const multi = multis[0];
		const values = single ? [single.line ?? 0, single.start_character ?? 0, single.line ?? 0, single.end_character ?? 0] : multi ? [multi.start_line ?? 0, multi.start_character ?? 0, multi.end_line ?? 0, multi.end_character ?? 0] : occurrence.range?.length === 3 ? [occurrence.range[0], occurrence.range[1], occurrence.range[0], occurrence.range[2]] : occurrence.range;
		if (!values || values.length !== 4) { throw new Error('SCIP symbol occurrence has no source range'); }
		const [startLine, startColumn, endLine, endColumn] = values;
		const start = offset(startLine, startColumn);
		const end = offset(endLine, endColumn);
		if (end < start) { throw new Error('SCIP occurrence has an inverted source range'); }
		return { file: file.file, revision: file.revision!, start, end, line: startLine + 1, endLine: endLine + 1 };
	};
}

/** A centered interval tree avoids scanning every declaration for every reference. */
function ownerResolver(declarations: CodeDeclaration[]): (source: SourceEvidence) => CodeDeclaration[] {
	interface IntervalTree { center: number; byStart: CodeDeclaration[]; byEnd: CodeDeclaration[]; left?: IntervalTree; right?: IntervalTree }
	const build = (items: CodeDeclaration[]): IntervalTree | undefined => {
		if (!items.length) { return undefined; }
		const sorted = [...items].sort((a, b) => a.evidence.start - b.evidence.start);
		const center = sorted[Math.floor(sorted.length / 2)].evidence.start;
		const crossing = sorted.filter(item => item.evidence.start <= center && item.evidence.end >= center);
		return { center, byStart: crossing, byEnd: [...crossing].sort((a, b) => b.evidence.end - a.evidence.end), left: build(sorted.filter(item => item.evidence.end < center)), right: build(sorted.filter(item => item.evidence.start > center)) };
	};
	const tree = build(declarations);
	return source => {
		const matches: CodeDeclaration[] = [];
		let current = tree;
		while (current) {
			if (source.end <= current.center) {
				for (const item of current.byStart) { if (item.evidence.start > source.start) { break; } matches.push(item); }
				current = current.left;
			} else if (source.start >= current.center) {
				for (const item of current.byEnd) { if (item.evidence.end < source.end) { break; } matches.push(item); }
				current = current.right;
			} else {
				for (const item of current.byStart) { if (item.evidence.start > source.start) { break; } if (item.evidence.end >= source.end) { matches.push(item); } }
				break;
			}
		}
		return matches.sort((a, b) => (a.evidence.end - a.evidence.start) - (b.evidence.end - b.evidence.start));
	};
}

/** Binds exact definition-name spans and projects static references as dependencies, never runtime calls. */
export async function applyScipBundles(state: CodeImport, inputs: ScipBundle[], signal?: AbortSignal, allowEmpty = false): Promise<CodeImport> {
	validateProjection(state);
	const bundles = inputs.map(input => readScipBundle(input));
	const graph: SemanticGraph = { version: 1, sourceRevision: state.revision, providers: [], indexedFiles: [], bindings: [], dependencies: [], diagnostics: [] };
	const files = new Map(state.files.map(file => [file.file, file]));
	const occurrences: { symbol: string; roles: number; provider: number; source: SourceEvidence; file: IndexedFile }[] = [];
	const definitions = new Map<string, Map<string, SemanticGraph['bindings'][number]>>();
	const symbolKey = (provider: number, file: string, symbol: string): string => `${provider}\0${symbol.startsWith('local ') ? file + '\0' : ''}${symbol}`;
	const indexed = new Set<string>();
	for (const [provider, bundle] of bundles.entries()) {
		if (bundle.sourceRoot !== state.sourceRoot || bundle.sourceRevision !== state.revision) { throw new Error('SCIP bundle belongs to a different source root or revision'); }
		await checkIndexRoot(bundle.index, state.sourceRoot);
		const tool = bundle.index.metadata.tool_info;
		graph.providers.push({ name: tool.name, version: tool.version ?? '', digest: hash(JSON.stringify(bundle)) });
		for (const document of bundle.index.documents ?? []) {
			signal?.throwIfAborted();
			const file = files.get(document.relative_path);
			if (!file || file.status !== 'parsed' || !file.moduleId) { graph.diagnostics.push({ code: 'outsideScope', file: document.relative_path, symbol: '', provider }); continue; }
			const encoding = document.position_encoding || bundle.positionEncoding;
			if (!encoding) { throw new Error(`SCIP position encoding is unspecified: ${file.file}`); }
			const source = await readFile(join(state.sourceRoot, file.file), 'utf8');
			// Proto3 uses an empty string when the optional document text was not emitted.
			if (hash(source) !== file.revision || (document.text && document.text !== source)) { throw new Error(`SCIP document is stale: ${file.file}`); }
			indexed.add(file.file);
			const range = sourceRange(source, file, encoding);
			const names = new Map<string, typeof file.declarations>();
			for (const declaration of file.declarations) {
				if (!declaration.nameEvidence) { throw new Error('Re-import the source with M4.3 before attaching SCIP'); }
				const key = `${declaration.nameEvidence.start}:${declaration.nameEvidence.end}`;
				names.set(key, [...(names.get(key) ?? []), declaration]);
			}
			for (const occurrence of document.occurrences ?? []) {
				if (!occurrence.symbol) { continue; }
				const evidence = range(occurrence);
				const roles = occurrence.symbol_roles ?? 0;
				if (roles & 1) {
					const candidates = names.get(`${evidence.start}:${evidence.end}`);
					if (candidates?.length !== 1) { graph.diagnostics.push({ code: 'unboundDefinition', file: file.file, symbol: occurrence.symbol, provider, evidence }); continue; }
					const binding = { symbol: occurrence.symbol, elementId: candidates[0].id, provider, evidence };
					graph.bindings.push(binding);
					const key = symbolKey(provider, file.file, occurrence.symbol);
					const targets = definitions.get(key) ?? new Map();
					targets.set(binding.elementId, binding);
					definitions.set(key, targets);
				} else { occurrences.push({ symbol: occurrence.symbol, roles, provider, source: evidence, file }); }
			}
			for (const symbol of document.symbols ?? []) {
				if (symbol.relationships?.length) { graph.diagnostics.push({ code: 'unresolvedRelationship', file: file.file, symbol: symbol.symbol, provider }); }
			}
		}
	}
	const edges = new Map<string, SemanticGraph['dependencies'][number]>();
	const ownersByFile = new Map(state.files.map(file => [file.file, ownerResolver(file.declarations)]));
	for (const occurrence of occurrences) {
		const targets = definitions.get(symbolKey(occurrence.provider, occurrence.file.file, occurrence.symbol));
		if (targets?.size !== 1) { graph.diagnostics.push({ code: targets?.size ? 'ambiguousSymbol' : 'unboundReference', file: occurrence.file.file, symbol: occurrence.symbol, provider: occurrence.provider, evidence: occurrence.source }); continue; }
		const target = [...targets.values()][0];
		const owners = ownersByFile.get(occurrence.file.file)!(occurrence.source);
		if (owners.length > 1 && owners[0].evidence.start === owners[1].evidence.start && owners[0].evidence.end === owners[1].evidence.end) { graph.diagnostics.push({ code: 'ambiguousSymbol', file: occurrence.file.file, symbol: occurrence.symbol, provider: occurrence.provider, evidence: occurrence.source }); continue; }
		const from = owners[0]?.id ?? occurrence.file.moduleId!;
		const id = semanticDependencyId(state.projectId, from, target.elementId);
		const edge = edges.get(id) ?? { id, from, to: target.elementId, references: [] };
		edge.references.push({ symbol: occurrence.symbol, roles: occurrence.roles, provider: occurrence.provider, source: occurrence.source, target: target.evidence });
		edges.set(id, edge);
	}
	graph.indexedFiles = [...indexed].sort();
	for (const file of state.files.filter(file => file.status === 'parsed' && !indexed.has(file.file))) { graph.diagnostics.push({ code: 'missingDocument', file: file.file, symbol: '', provider: 0 }); }
	const boundIds = new Set(graph.bindings.map(binding => binding.elementId));
	for (const file of state.files.filter(file => indexed.has(file.file))) {
		for (const declaration of file.declarations.filter(item => !boundIds.has(item.id))) { graph.diagnostics.push({ code: 'missingDefinition', file: file.file, symbol: declaration.name, provider: 0, evidence: declaration.nameEvidence }); }
	}
	graph.dependencies = [...edges.values()].sort((a, b) => a.id.localeCompare(b.id));
	if (!allowEmpty && !graph.bindings.length) { throw new Error('SCIP index has no matching declarations in the selected scope'); }
	validateSemanticGraph(graph, state.files, state.revision, state.projectId);
	signal?.throwIfAborted();
	const result = structuredClone(state);
	result.semantic = graph;
	delete result.analysis.semanticInvalidated;
	result.model = projectModel(result.projectId, result.model.name, result.files, graph);
	validateProjection(result);
	return result;
}
