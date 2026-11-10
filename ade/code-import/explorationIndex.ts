/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { contentHash, sourceFile } from './sourceChanges.ts';
import { isDisclosableSource } from './paths.ts';
import type { CodeImport, IndexedFile } from './importCode.ts';
import type { EvidenceRecord } from '../../src/vs/workbench/contrib/ade/common/semanticModel.ts';
import { canonicalJson } from '../../src/vs/workbench/contrib/ade/common/modelSerialization.ts';

export interface ExplorationCapabilities { language: string; syntax: boolean; definitions: boolean; references: boolean; calls: false; controlFlow: false; runtimeObservations: false; indexedFiles: number; totalFiles: number }
export interface IndexQuery { id: string; revision: string; filePrefix: string; fingerprint: string }
export interface ExplorationPage<T> { items: T[]; total: number; omitted: number; nextCursor: string | null; complete: boolean }
export interface SourceHit { evidence: EvidenceRecord; text: string; symbolId?: string; name?: string; role: string }
export function sourceRole(file: string): 'verification' | 'documentation' | 'configuration' | 'runtime' {
	if (/(^|\/)(test[s]?|fixtures?|__tests__|spec[s]?)(\/|\.)|[._-](test|spec)\./i.test(file)) { return 'verification'; }
	if (/\.(md|rst|txt)$/i.test(file)) { return 'documentation'; }
	if (/(^|\/)(package\.json|go\.mod|pyproject\.toml|.*config[^/]*|Makefile)|\.(ya?ml|toml)$/i.test(file)) { return 'configuration'; }
	return 'runtime';
}
export function indexScopeRevision(state: CodeImport, prefix = ''): string {
	return contentHash(canonicalJson(state.files.filter(file => file.file.startsWith(prefix)).map(file => ({ file: file.file, revision: file.revision ?? null, status: file.status }))));
}
export function explorationCapabilities(state: CodeImport): ExplorationCapabilities[] {
	return [...new Set(state.files.map(file => file.language ?? 'text'))].sort().map(language => {
		const files = state.files.filter(file => (file.language ?? 'text') === language), indexed = files.filter(file => state.semantic?.indexedFiles.includes(file.file));
		return { language, syntax: files.some(file => ['parsed', 'partial'].includes(file.status)), definitions: !!indexed.length, references: !!indexed.length, calls: false, controlFlow: false, runtimeObservations: false, indexedFiles: indexed.length, totalFiles: files.length };
	});
}
/** Cursor binds both query and revision; a new file invalidates even an empty result. */
export function explorationPage<T>(items: T[], revision: string, query: object, cursor?: string, limit = 30): ExplorationPage<T> {
	if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) { throw new Error('pageLimit:1..100'); }
	const key = contentHash(canonicalJson({ revision, query })); let offset = 0;
	if (cursor) { const parsed = /^([a-f0-9]{64}):(\d+)$/.exec(cursor); if (!parsed || parsed[1] !== key || !Number.isSafeInteger(Number(parsed[2]))) { throw new Error('staleCursor'); } offset = Number(parsed[2]); }
	if (offset > items.length) { throw new Error('invalidCursor'); }
	const page = items.slice(offset, offset + limit), end = offset + page.length;
	return { items: page, total: items.length, omitted: items.length - page.length, nextCursor: end < items.length ? `${key}:${end}` : null, complete: offset === 0 && end === items.length };
}
function sourceRecord(file: IndexedFile, revision: string, start: number, end: number, nature: EvidenceRecord['nature']): EvidenceRecord {
	return { id: 'evidence:' + contentHash(canonicalJson({ file: file.file, revision, start, end, nature })), revision, file: file.file, start, end, encoding: 'utf-16', nature, producer: 'ade-source-index', producerVersion: '2', factIds: [] };
}
async function contents(state: CodeImport, file: IndexedFile): Promise<{ content: string; revision: string }> {
	if (file.status === 'excluded' || !isDisclosableSource(file.file)) { throw new Error('outsideDisclosureScope'); }
	const { content } = await sourceFile(state.sourceRoot, file.file), revision = contentHash(content);
	if (content.includes('\0')) { throw new Error('binarySource'); }
	if (file.revision && file.revision !== revision) { throw new Error('staleSourceRevision'); }
	return { content, revision };
}
/** Search is local, bounded per file, and never classifies every declaration with a model. */
export async function searchExplorationSource(state: CodeImport, input: { query: string; mode?: 'text' | 'symbol'; filePrefix?: string; role?: string; cursor?: string; limit?: number }, signal?: AbortSignal): Promise<{ page: ExplorationPage<SourceHit>; query: IndexQuery; diagnostics: { file: string; code: string }[]; coverage: { complete: boolean; scannedBytes: number; maxScannedBytes: number; maxMatches: number } }> {
	if (!input.query || input.query.length > 200 || (input.filePrefix?.length ?? 0) > 500) { throw new Error('searchQueryLimit'); }
	let scannedBytes = 0;
	const maxScannedBytes = 16 * 1024 * 1024, maxMatches = 10000;
	const hits: SourceHit[] = [], diagnostics: { file: string; code: string }[] = [], prefix = input.filePrefix ?? '', query = input.query.toLowerCase();
	const pattern = new RegExp(input.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
	for (const file of state.files) {
		signal?.throwIfAborted();
		if (hits.length >= maxMatches || scannedBytes >= maxScannedBytes) { diagnostics.push({ file: file.file, code: 'searchLimitReached:remainingFilesUnexplored' }); break; }
		if (!file.file.startsWith(prefix) || file.status === 'excluded' || !isDisclosableSource(file.file) || input.role && sourceRole(file.file) !== input.role) { continue; }
		try {
			if (input.mode === 'symbol') {
				for (const declaration of file.declarations.filter(entry => entry.name.toLowerCase().includes(query))) {
					hits.push({ evidence: sourceRecord(file, declaration.evidence.revision, declaration.evidence.start, declaration.evidence.end, 'syntax'), symbolId: declaration.id, name: declaration.name, text: declaration.header.slice(0, 300), role: sourceRole(file.file) });
				}
			} else {
				const { content, revision } = await contents(state, file); scannedBytes += Buffer.byteLength(content); pattern.lastIndex = 0;
				let match: RegExpExecArray | null;
				while (hits.length < maxMatches && (match = pattern.exec(content))) {
					const offset = match.index;
					const start = Math.max(0, content.lastIndexOf('\n', offset) + 1), lineEnd = content.indexOf('\n', offset), end = Math.min(lineEnd < 0 ? content.length : lineEnd, start + 500);
					hits.push({ evidence: sourceRecord(file, revision, offset, offset + match[0].length, sourceRole(file.file) === 'documentation' ? 'documentation' : 'text'), text: content.slice(start, end), role: sourceRole(file.file) });
				}
			}
		} catch (error) { diagnostics.push({ file: file.file, code: error instanceof Error ? error.message : 'unavailable' }); }
	}
	const revision = indexScopeRevision(state, prefix), fingerprint = contentHash(canonicalJson({ query: input.query, mode: input.mode ?? 'text', prefix, role: input.role ?? null }));
	const page = explorationPage(hits, revision, { fingerprint }, input.cursor, input.limit), complete = !diagnostics.length && hits.length < maxMatches; page.complete &&= complete;
	return { coverage: { complete, scannedBytes, maxScannedBytes, maxMatches }, page, query: { id: 'query:' + contentHash(revision + fingerprint), revision, filePrefix: prefix, fingerprint }, diagnostics };
}
/** Exact ranges stay strict; expose bounds so a caller can repair an out-of-range read. */
export class ExplorationSourceRangeError extends Error {
	readonly range: { start: number; end: number; fileLength: number; maxChars: number; maxAllowedChars: number };
	constructor(range: ExplorationSourceRangeError['range']) { super('invalidSourceRange'); this.range = range; }
}

/** Exact revision and explicit continuation prevent a truncated symbol from pretending to be complete. */
export async function readExplorationSource(state: CodeImport, input: { file?: string; symbolId?: string; revision: string; start?: number; end?: number; maxChars?: number }): Promise<{ evidence: EvidenceRecord; text: string; requestedEnd: number; nextStart: number | null; truncated: boolean; role: string }> {
	const file = input.symbolId ? state.files.find(file => file.declarations.some(entry => entry.id === input.symbolId)) : state.files.find(file => file.file === input.file);
	if (!file) { throw new Error('sourceNotInventoried'); }
	const declaration = file.declarations.find(entry => entry.id === input.symbolId), { content, revision } = await contents(state, file);
	if (revision !== input.revision) { throw new Error('staleEvidenceRevision'); }
	const start = input.start ?? declaration?.evidence.start ?? 0, end = input.end ?? declaration?.evidence.end ?? content.length, maxChars = input.maxChars ?? 8192;
	if (![start, end, maxChars].every(Number.isSafeInteger) || start < 0 || end < start || end > content.length || maxChars < 1 || maxChars > 16384) { throw new ExplorationSourceRangeError({ start, end, fileLength: content.length, maxChars, maxAllowedChars: 16384 }); }
	const stop = Math.min(end, start + maxChars);
	return { evidence: sourceRecord(file, revision, start, stop, sourceRole(file.file) === 'documentation' ? 'documentation' : declaration ? 'syntax' : 'text'), text: content.slice(start, stop), requestedEnd: end, nextStart: stop < end ? stop : null, truncated: stop < end, role: sourceRole(file.file) };
}

/** Retain only still-valid resolved facts when an external index cannot be rerun locally. */
export async function refreshExplorationAnalysis(state: CodeImport, previous: CodeImport, signal?: AbortSignal): Promise<CodeImport> {
	if (!state.analysis.semanticInvalidated || !previous.semantic) { return state; }
	const { projectModel } = await import('./importCode.ts');
	const { validateSemanticGraph } = await import('./semanticGraph.ts');
	const graph = structuredClone(previous.semantic), revisions = new Map(state.files.map(file => [file.file, file.revision]));
	const current = (evidence: { file: string; revision: string }): boolean => revisions.get(evidence.file) === evidence.revision;
	graph.sourceRevision = state.revision;
	graph.bindings = graph.bindings.filter(binding => current(binding.evidence));
	graph.dependencies = graph.dependencies.flatMap(edge => { const references = edge.references.filter(reference => current(reference.source) && current(reference.target)); return references.length ? [{ ...edge, references }] : []; });
	const stale = new Set(previous.files.filter(file => file.revision !== revisions.get(file.file)).map(file => file.file));
	graph.indexedFiles = graph.indexedFiles.filter(file => !stale.has(file) && revisions.has(file));
	graph.diagnostics = graph.diagnostics.filter(diagnostic => !diagnostic.evidence || current(diagnostic.evidence));
	for (const file of stale) { if (!graph.providers.length) { break; } graph.diagnostics.push({ code: 'missingDocument', file, symbol: '', provider: 0 }); }
	validateSemanticGraph(graph, state.files, state.revision, state.projectId);
	state.semantic = graph; state.analysis.semanticInvalidated = false;
	state.model = projectModel(state.projectId, state.model.name, state.files, graph);
	signal?.throwIfAborted(); return state;
}
