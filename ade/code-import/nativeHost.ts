/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, lstat, realpath, readdir, rename, rm, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import lockfile from 'proper-lockfile';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { CodeRequest, CodeContext, CodePreview, CodeResponse, CodeEngine } from '../../src/vs/workbench/contrib/ade/common/codeBridge.ts';
import { importCode, type CodeImport } from './importCode.ts';
import { readSnapshot, writeSnapshot, type ImportSnapshot } from './snapshot.ts';
import { prepareSync } from './syncCode.ts';
import { defaultScope, readSourceScope } from './sourceScope.ts';
import { readRenameHints } from './identity.ts';
import { createTypeScriptBundle } from './typescriptSemantic.ts';
import { applyScipBundles, readScipBundle } from './scip.ts';
import { isSourcePath } from './paths.ts';
import { executeCollaboration } from '../ai/engine.ts';

const nonempty = { type: 'string', minLength: 1 };
const valid = new Ajv2020().compile<Exclude<CodeRequest, { operation: 'collaboration' }>>({ oneOf: [
	{ type: 'object', additionalProperties: false, required: ['operation', 'root'], properties: { operation: { const: 'import' }, root: nonempty, scope: { type: 'object' }, syntaxOnly: { type: 'boolean' }, bundles: { type: 'array', items: nonempty, maxItems: 20 } } },
	{ type: 'object', additionalProperties: false, required: ['operation', 'snapshot'], properties: { operation: { enum: ['inspect', 'preview', 'history'] }, snapshot: nonempty, scope: { type: 'object' }, renames: { type: 'array' }, bundles: { type: 'array', items: nonempty, maxItems: 20 } } },
	{ type: 'object', additionalProperties: false, required: ['operation', 'token'], properties: { operation: { const: 'apply' }, token: nonempty } },
	{ type: 'object', additionalProperties: false, required: ['operation', 'snapshot', 'target'], properties: { operation: { const: 'restore' }, snapshot: nonempty, target: nonempty } },
	{ type: 'object', additionalProperties: false, required: ['operation', 'snapshot', 'file', 'revision', 'start', 'end'], properties: { operation: { const: 'source' }, snapshot: nonempty, file: nonempty, revision: nonempty, start: { type: 'integer', minimum: 0 }, end: { type: 'integer', minimum: 0 } } }
] });
const previews = new Map<string, { previous: ImportSnapshot; next: CodeImport; result: ReturnType<typeof prepareSync>; active?: string; created: number }>();
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
async function json(path: string): Promise<unknown> {
	if ((await stat(path)).size > 64 * 1024 * 1024) { throw new Error('Artifact exceeds 64 MiB'); }
	return JSON.parse(await readFile(path, 'utf8'));
}
async function managed(root: string): Promise<string> {
	for (const path of [join(root, '.ade'), join(root, '.ade', 'imports')]) {
		await mkdir(path, { recursive: true });
		if ((await lstat(path)).isSymbolicLink() || await realpath(path) !== path) { throw new Error('Managed snapshot directory cannot be a symlink'); }
	}
	return join(root, '.ade', 'imports');
}
async function active(root: string): Promise<string | undefined> {
	try {
		const value = await json(join(root, '.ade', 'code-project.json')) as { version?: number; active?: string };
		if (value.version !== 1 || !/^[a-f0-9-]{36}$/.test(value.active ?? '')) { throw new Error('Invalid code project pointer'); }
		return value.active;
	} catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') { return undefined; } throw error; }
}
async function activate(root: string, directory: string): Promise<void> {
	const path = join(root, '.ade', 'code-project.json');
	const temporary = `${path}.${randomUUID()}.tmp`;
	try { await writeFile(temporary, JSON.stringify({ version: 1, active: directory.split(/[\\/]/).pop() }), { flag: 'wx' }); await rename(temporary, path); }
	finally { await rm(temporary, { force: true }); }
}
async function lock<T>(root: string, task: () => Promise<T>): Promise<T> {
	await managed(root);
	const release = await lockfile.lock(join(root, '.ade', 'code-project.json'), { realpath: false, lockfilePath: join(root, '.ade', 'code-project.lock'), stale: 300_000, update: 10_000, retries: 0 });
	try { return await task(); } finally { await release(); }
}

function context(snapshot: string, state: CodeImport): CodeContext {
	return {
		snapshot, model: join(snapshot, 'model.ade.json'), sourceRoot: state.sourceRoot, revision: state.revision, scope: state.scope ?? structuredClone(defaultScope),
		files: state.files.map(file => ({ path: file.file, elementId: file.moduleId, language: file.language ?? '', status: file.status, diagnostics: file.diagnostics.map(item => `${item.code}${item.syntaxKind ? ': ' + item.syntaxKind : ''} (${item.count})`) })),
		declarations: state.files.flatMap(file => file.declarations.map(item => ({ id: item.id, sourceId: item.sourceId!, name: item.name, kind: item.kind, evidence: item.nameEvidence ?? item.evidence }))),
		providers: state.semantic?.providers.map(provider => `${provider.name} ${provider.version}`) ?? [],
		dependencies: state.semantic?.dependencies.map(edge => ({ ...edge, references: edge.references.map(ref => ({ source: ref.source, target: ref.target, provider: state.semantic!.providers[ref.provider].name })) })) ?? [],
		diagnostics: [...(state.semantic?.diagnostics.map(item => `${item.file}: ${item.code}`) ?? []), ...(state.analysis.compilerDiagnostics ?? [])]
	};
}
async function analyze(state: CodeImport, paths: string[], previous: CodeImport | undefined, syntaxOnly: boolean, signal?: AbortSignal): Promise<CodeImport> {
	syntaxOnly ||= previous?.analysis.syntaxOnly ?? false;
	state.analysis.syntaxOnly = syntaxOnly;
	if (state.semantic && !paths.length && state.semantic.providers.some(provider => provider.name !== 'ade-typescript-compiler')) { return state; }
	const bundles = await Promise.all(paths.map(async path => readScipBundle(await json(path))));
	const builtin = !syntaxOnly && (state.files.some(file => ['javascript', 'typescript', 'tsx'].includes(file.language ?? '')) || !!previous?.semantic?.providers.some(provider => provider.name === 'ade-typescript-compiler'));
	if (builtin) {
		const result = await createTypeScriptBundle(state, signal);
		bundles.unshift(result.bundle);
		state.analysis.semanticWork = { analyzed: result.analyzed, reused: result.reused };
		// Compiler diagnostics are review information; missing bindings remain explicit in SCIP coverage.
		state.analysis.compilerDiagnostics = result.diagnostics.map(item => `${item.file}:${item.line} TS${item.code}: ${item.message}`);
	}
	if (!bundles.length) { return state; }
	const required = previous?.semantic?.providers.map(provider => provider.name).filter(name => name !== 'ade-typescript-compiler') ?? [];
	if (state.analysis.semanticInvalidated && required.some(name => !bundles.some(bundle => bundle.index.metadata.tool_info.name === name))) { throw new Error('Refresh every previously attached SCIP provider before Sync'); }
	return applyScipBundles(state, bundles, signal, builtin);
}


/** Used both by the shipped utility process and by integration tests of the exact same boundary. */
export const engine: CodeEngine = {
	async execute(input, signal): Promise<string> {
		if (Buffer.byteLength(input) > 1024 * 1024) { throw new Error('Request exceeds 1 MiB'); }
		const request: unknown = JSON.parse(input);
		if (request && typeof request === 'object' && 'operation' in request && request.operation === 'collaboration' && 'request' in request && typeof request.request === 'string' && Object.keys(request).length === 2) {
			return executeCollaboration(request.request, signal);
		}
		if (!valid(request)) { throw new Error('Invalid code bridge request'); }
		signal?.throwIfAborted();
		if ('scope' in request && request.scope) { readSourceScope(request.scope); }
		let result: CodeResponse;
		if (request.operation === 'import') {
			const root = await realpath(request.root);
			result = await lock(root, async () => {
				if (await active(root)) { throw new Error('This codebase already has an import. Open it and use Sync.'); }
				const state = await analyze(await importCode(root, `code:${randomUUID()}`, { scope: request.scope, signal }), request.bundles ?? [], undefined, request.syntaxOnly ?? false, signal);
				const destination = join(await managed(root), randomUUID());
				await writeSnapshot(destination, state, state.model, undefined, undefined, signal, true);
				await activate(root, destination);
				return context(destination, state);
			});
		} else if (request.operation === 'apply') {
			const preview = previews.get(request.token); previews.delete(request.token);
			if (!preview?.result.model || Date.now() - preview.created > 30 * 60 * 1000) { throw new Error('Sync preview expired or has conflicts'); }
			result = await lock(preview.next.sourceRoot, async () => {
				if (await active(preview.next.sourceRoot) !== preview.active) { throw new Error('Active snapshot changed; review a new Sync preview'); }
				const destination = join(await managed(preview.next.sourceRoot), randomUUID());
				await writeSnapshot(destination, preview.next, preview.result.model!, preview.result.report, preview.previous, signal, true);
				await activate(preview.next.sourceRoot, destination);
				return context(destination, preview.next);
			});
		} else {
			const previous = await readSnapshot(request.snapshot);
			if (['preview', 'restore'].includes(request.operation)) {
				const pointer = await active(previous.state.sourceRoot);
				if (pointer && join(previous.state.sourceRoot, '.ade', 'imports', pointer) !== previous.directory) { throw new Error('Open the active snapshot before Sync or recovery'); }
			}
			if (request.operation === 'inspect') { result = context(previous.directory, previous.state); }
			else if (request.operation === 'preview') {
				let next = await importCode(previous.state.sourceRoot, previous.state.projectId, { previous: previous.state, scope: request.scope, renameHints: request.renames ? readRenameHints(request.renames) : undefined, signal });
				next = await analyze(next, request.bundles ?? [], previous.state, false, signal);
				const prepared = prepareSync(previous.state, previous.model, next);
				const token = randomUUID();
				while (previews.size >= 5) { previews.delete(previews.keys().next().value!); }
				previews.set(token, { previous, next, result: prepared, active: await active(next.sourceRoot), created: Date.now() });
				const value = context(previous.directory, next);
				result = { token, context: value, files: prepared.report.files, declarations: prepared.report.declarations, dependencies: prepared.report.dependencies, conflicts: prepared.report.conflicts, impact: prepared.report.impact, parsed: next.analysis.parsed, reused: next.analysis.reused, semanticAnalyzed: next.analysis.semanticWork?.analyzed ?? [], semanticReused: next.analysis.semanticWork?.reused ?? [] } satisfies CodePreview;
			} else if (request.operation === 'source') {
				if (!isSourcePath(request.file) || request.start > request.end) { throw new Error('Invalid evidence path or range'); }
				const root = previous.state.sourceRoot;
				const file = previous.state.files.find(item => item.file === request.file);
				if (!file || file.revision !== request.revision) { throw new Error('Unknown source evidence'); }
				const path = join(root, request.file);
				if (await realpath(path) !== path) { throw new Error('Source path was redirected'); }
				const text = await readFile(path, 'utf8');
				const position = (offset: number) => { const prefix = text.slice(0, offset); const lines = prefix.split('\n'); return { line: lines.length, column: lines.at(-1)!.length + 1 }; };
				const start = position(request.start); const end = position(request.end);
				result = { path, stale: hash(text) !== request.revision || request.end > text.length, startLine: start.line, startColumn: start.column, endLine: end.line, endColumn: end.column };
			} else if (request.operation === 'history') {
				const parent = await managed(previous.state.sourceRoot);
				const snapshots = [];
				for (const entry of await readdir(parent, { withFileTypes: true })) {
					if (!entry.isDirectory() || !/^[a-f0-9-]{36}$/.test(entry.name)) { continue; }
					const path = join(parent, entry.name);
					try { const snapshot = await readSnapshot(path); snapshots.push({ directory: path, revision: snapshot.state.revision }); } catch { /* Interrupted snapshots are never offered for recovery. */ }
				}
				result = { snapshots };
			} else if (request.operation === 'restore') {
				const target = await readSnapshot(request.target);
				if (dirname(target.directory) !== join(previous.state.sourceRoot, '.ade', 'imports') || target.state.sourceRoot !== previous.state.sourceRoot || target.state.projectId !== previous.state.projectId) { throw new Error('Recovery snapshot belongs to a different project'); }
				result = await lock(previous.state.sourceRoot, async () => { await activate(previous.state.sourceRoot, target.directory); return context(target.directory, target.state); });
			}
			else { throw new Error('Unknown operation'); }
		}
		return JSON.stringify(result);
	}
};
