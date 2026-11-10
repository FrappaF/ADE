/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { randomUUID, createHash } from 'node:crypto';
import { readFile, realpath, readdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type CodeContext, type CodePreview, type CodeResponse, type CodeEngine } from '../../src/vs/workbench/contrib/ade/common/codeBridge.ts';
import { importCode, type CodeImport } from '../code-import/importCode.ts';
import { bindReconciliationIdentities, verifyReconciliationStructure } from '../code-import/reconciliationIdentity.ts';
import { readSnapshot, writeSnapshot, type ImportSnapshot } from '../code-import/snapshot.ts';
import { managed, active, activate, lock } from './projectStore.ts';
import { prepareReconciliation, type Reconciliation } from '../code-import/reconciliation.ts';
import { contentHash, sourceFile } from './sourceChanges.ts';
import { prepareAiReconciliation, proposeAiReconciliation, reconciliationSchema, type PreparedReconciliation, type ReconciliationProposal } from '../ai/reconciliation.ts';
import { applyReconciliation, undoReconciliation, recoverReconciliation, operationHistory, assertNoInterruptedOperation } from '../code-import/reconciliationJournal.ts';
import { defaultScope, readSourceScope } from '../code-import/sourceScope.ts';
import { readRenameHints } from '../code-import/identity.ts';
import { createTypeScriptBundle } from '../code-import/typescriptSemantic.ts';
import { applyScipBundles, readScipBundle } from '../code-import/scip.ts';
import { isSourcePath } from '../code-import/paths.ts';
import { executeCollaboration } from '../ai/engine.ts';
import { needsExternalStructuralNode, verifyWithExternalNode } from '../ai/trustedNode.ts';
import { readSemanticModel } from '../../src/vs/workbench/contrib/ade/common/modelValidation.ts';
import { type StructuredProvider } from '../ai/contracts.ts';
import { prepareDiagramImport, advanceDiagramImport, readDiagramJob, approveDiagramPlan, diagramProgress, finishDiagramImport } from '../ai/diagramImport.ts';
import { validateCodeRequest } from './codeProtocol.ts';
export { codeBridgeProtocol } from './codeProtocol.ts';

interface Preview { previous: ImportSnapshot; next: CodeImport; result: Reconciliation; prepared?: PreparedReconciliation; calls?: number; active?: string; created: number; bindings?: ReconciliationProposal['bindings']; ai?: CodePreview['ai'] }
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
async function json(path: string): Promise<unknown> {
	if ((await stat(path)).size > 64 * 1024 * 1024) { throw new Error('Artifact exceeds 64 MiB'); }
	return JSON.parse(await readFile(path, 'utf8'));
}

function context(snapshot: string, state: CodeImport, model = state.model): CodeContext {
	return {
		snapshot, model: join(snapshot, 'model.ade.json'), sourceRoot: state.sourceRoot, revision: state.revision, scope: state.scope ?? structuredClone(defaultScope),
		files: state.files.map(file => ({ path: file.file, elementId: file.moduleId, language: file.language ?? '', status: file.status, diagnostics: file.diagnostics.map(item => `${item.code}${item.syntaxKind ? ': ' + item.syntaxKind : ''} (${item.count})`) })),
		declarations: state.files.flatMap(file => file.declarations.map(item => ({ id: item.id, sourceId: item.sourceId!, name: item.name, kind: item.kind, evidence: item.nameEvidence ?? item.evidence }))),
		providers: state.semantic?.providers.map(provider => `${provider.name} ${provider.version}`) ?? [],
		diagramState: model.version === 5 ? model.views.some(view => view.nodes.length > 0) ? 'diagrams' : 'index' : model.semantics.elements.some(element => element.kind === 'feature') ? 'diagrams' : 'index',
		dependencies: state.semantic?.dependencies.map(edge => ({ ...edge, references: edge.references.map(ref => ({ source: ref.source, target: ref.target, provider: state.semantic!.providers[ref.provider].name })) })) ?? [],
		diagnostics: [...(state.semantic?.diagnostics.map(item => `${item.file}: ${item.code}`) ?? []), ...(state.analysis.compilerDiagnostics ?? [])]
	};
}
function previewResponse(token: string, preview: Preview): CodePreview {
	const { next, previous, result: prepared } = preview;
	return { token, context: context(previous.directory, next), files: prepared.report.files, declarations: prepared.report.declarations, dependencies: prepared.report.dependencies, conflicts: prepared.report.conflicts, impact: prepared.report.impact, parsed: next.analysis.parsed, reused: next.analysis.reused, semanticAnalyzed: next.analysis.semanticWork?.analyzed ?? [], semanticReused: next.analysis.semanticWork?.reused ?? [], reconciliation: { status: prepared.status, origin: prepared.origin, commonRevision: previous.state.revision, sourceEdits: prepared.mutations.map(edit => ({ file: edit.file, beforeRevision: contentHash(edit.before), afterRevision: contentHash(edit.after) })), diagnostics: prepared.diagnostics }, ai: preview.ai };
}
async function assertPreviewCurrent(preview: Preview, signal?: AbortSignal): Promise<void> {
	if (Date.now() - preview.created > 30 * 60 * 1000 || await active(preview.next.sourceRoot) !== preview.active || (await readSnapshot(preview.previous.directory)).inputHash !== preview.previous.inputHash) { throw new Error('Reconciliation preview is stale'); }
	if ((await importCode(preview.next.sourceRoot, preview.next.projectId, { previous: preview.next, signal })).revision !== preview.next.revision) { throw new Error('Source changed since reconciliation review'); }
	for (const source of preview.prepared?.sources ?? []) {
		const current = await sourceFile(preview.next.sourceRoot, source.file);
		if (contentHash(current.content) !== source.revision || current.mode !== source.mode) { throw new Error('Selected source changed since AI context review'); }
	}
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
export function createCodeEngine(provider?: StructuredProvider, runtime: { electron?: string } = { electron: process.versions.electron }): CodeEngine {
	const previews = new Map<string, Preview>();
	const proposalCache = new Map<string, Awaited<ReturnType<typeof proposeAiReconciliation>>>();
	return {
		async execute(input, signal): Promise<string> {
			if (Buffer.byteLength(input) > 1024 * 1024) { throw new Error('Request exceeds 1 MiB'); }
			const request: unknown = JSON.parse(input);
			if (request && typeof request === 'object' && 'operation' in request && request.operation === 'collaboration' && 'request' in request && typeof request.request === 'string' && Object.keys(request).length === 2) {
				if (needsExternalStructuralNode(request.request, runtime.electron)) { return verifyWithExternalNode(request.request, import.meta.url, signal); }
				return executeCollaboration(request.request, signal);
			}
			validateCodeRequest(request);
			signal?.throwIfAborted();
			if (request.operation === 'exploration') {
				if (import.meta.url.endsWith('/nativeHost.ts')) { await import('../scripts/source-loader.mjs'); }
				const { executeDiagramExploration } = await import('../ai/diagramSession.ts');
				const explorationRequest = JSON.parse(request.request);
				const result = await executeDiagramExploration(request.snapshot, explorationRequest, signal);
				if (explorationRequest.action === 'open' || explorationRequest.action === 'budget') {
					const snapshot = await readSnapshot(request.snapshot);
					const bundled = import.meta.url.endsWith('/adeCodeEngine.js');
					const mcpPath = fileURLToPath(new URL(bundled ? './adeDiagramMcp.js' : '../ai/diagram-mcp.mjs', import.meta.url));
					if (!(await stat(mcpPath).catch(() => undefined))?.isFile()) { throw new Error(`Diagram tools are missing at ${mcpPath}. Rebuild ADE and restart before continuing exploration.`); }
					Object.assign(result.data, { mcp: { command: process.env.ADE_NODE_EXECUTABLE || 'node', args: [mcpPath, snapshot.state.sourceRoot, result.sessionId] } });
				}
				return JSON.stringify(result);
			}
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
					return context(destination, state, (await readSnapshot(destination)).model);
				});
			} else if (request.operation === 'reconciliationPrepare' || request.operation === 'reconciliationPropose') {
				const preview = previews.get(request.token);
				if (!preview) { throw new Error('Reconciliation preview expired'); }
				await assertPreviewCurrent(preview, signal);
				if (request.operation === 'reconciliationPrepare') {
					if (preview.calls) { throw new Error('This review already used its AI request; prepare a fresh Sync to retry'); }
					preview.prepared = await prepareAiReconciliation(preview.previous, preview.next, JSON.parse(request.config), request.sourceFiles, request.resolutions, signal, request.clarification);
					result = { reviewId: preview.prepared.reviewId, contents: JSON.stringify({ prompt: preview.prepared.prompt, schema: reconciliationSchema, metrics: preview.prepared.metrics }, null, '\t'), metrics: preview.prepared.metrics };
				} else {
					if (!preview.prepared || preview.prepared.reviewId !== request.reviewId || preview.calls) { throw new Error('Review the exact reconciliation context before calling the model'); }
					preview.calls = 1;
					try {
						const cached = proposalCache.get(preview.prepared.reviewId);
						const response = cached ?? await proposeAiReconciliation(preview.prepared, preview.previous, preview.next, signal, provider);
						if (!cached) { while (proposalCache.size >= 5) { proposalCache.delete(proposalCache.keys().next().value!); } proposalCache.set(preview.prepared.reviewId, structuredClone(response)); }
						await assertPreviewCurrent(preview, signal);
						preview.result = response.reconciliation; preview.bindings = response.bindings;
						preview.result.report.conflicts = [];
						preview.ai = { ...response.proposal, usage: cached ? { inputTokens: 0, outputTokens: 0 } : response.usage, cost: cached ? 0 : response.cost, cached: !!cached };
					} catch (error) { preview.result.status = 'verificationFailed'; preview.result.model = undefined; preview.result.diagnostics = [error instanceof Error ? error.message : 'AI reconciliation failed']; }
					result = previewResponse(request.token, preview);
				}
			} else if (request.operation === 'apply') {
				const preview = previews.get(request.token); previews.delete(request.token);
				if (!preview?.result.aiReviewed || !preview.result.model || Date.now() - preview.created > 30 * 60 * 1000) { throw new Error('Sync preview expired or has conflicts'); }
				result = await lock(preview.next.sourceRoot, async () => {
					await assertPreviewCurrent(preview, signal);
					const destination = join(await managed(preview.next.sourceRoot), randomUUID());
					let state = preview.next;
					await applyReconciliation(preview.previous, destination, preview.result.origin, preview.result.mutations, async () => {
						let model = preview.result.model!;
						if (preview.result.mutations.length) {
							state = await importCode(state.sourceRoot, state.projectId, { previous: preview.next, signal });
							state = bindReconciliationIdentities(state, model, preview.bindings?.filter(item => item.syntaxKind !== 'ai') ?? []);
							state = await analyze(state, [], preview.next, false, signal);
							if (state.files.some(file => file.status === 'partial') || state.analysis.semanticInvalidated) { throw new Error('AI source edits failed deterministic verification'); }
							const oldErrors = new Set(preview.next.analysis.compilerDiagnostics ?? []);
							if (state.analysis.compilerDiagnostics?.some(item => !oldErrors.has(item))) { throw new Error('AI source edits introduced compiler diagnostics'); }
							verifyReconciliationStructure(state, model, preview.previous, preview.bindings?.filter(item => item.syntaxKind !== 'ai') ?? []);
							model.codeMappings = [...state.model.codeMappings.filter(mapping => model.semantics.elements.some(item => item.id === mapping.elementId)), ...model.codeMappings.filter(mapping => !preview.next.model.codeMappings.some(item => item.id === mapping.id))];
							model = readSemanticModel(model);
						}
						if (!preview.result.mutations.length) { state = bindReconciliationIdentities(state, model, preview.bindings?.filter(item => item.syntaxKind !== 'ai') ?? []); }
						await writeSnapshot(destination, state, model, preview.result.report, preview.previous, signal, true);
					}, signal, preview.prepared && preview.ai ? { id: preview.prepared.reviewId, provider: preview.prepared.config.provider, model: preview.prepared.config.model, promptRevision: contentHash(preview.prepared.prompt), outputRevision: contentHash(JSON.stringify(preview.ai)), inputBytes: preview.prepared.metrics.inputBytes + preview.prepared.metrics.schemaBytes, outputBytes: Buffer.byteLength(JSON.stringify(preview.ai)), cached: preview.ai.cached ?? false } : undefined);
					return context(destination, state, (await readSnapshot(destination)).model);
				});
			} else {
				const previous = await readSnapshot(request.snapshot);
				if (['preview', 'restore', 'undoSync'].includes(request.operation)) {
					const pointer = await active(previous.state.sourceRoot);
					if (pointer && join(previous.state.sourceRoot, '.ade', 'imports', pointer) !== previous.directory) { throw new Error('Open the active snapshot before Sync or recovery'); }
				}
				if (request.operation === 'inspect') { result = context(previous.directory, previous.state, previous.model); }
				else if (request.operation === 'diagramPrepare' || request.operation === 'diagramStep' || request.operation === 'diagramApprovePlan') {
					result = await lock(previous.state.sourceRoot, async () => {
						await assertNoInterruptedOperation(previous.state.sourceRoot);
						if (await active(previous.state.sourceRoot) !== previous.directory.split(/[\\/]/).pop()) { throw new Error('Open the active project before building diagrams'); }
						let next = await importCode(previous.state.sourceRoot, previous.state.projectId, { previous: previous.state, signal });
						next = await analyze(next, [], previous.state, false, signal);
						if (request.operation === 'diagramPrepare') { return diagramProgress(await prepareDiagramImport(previous, next, JSON.parse(request.config), request.resume, request.clarification, signal)); }
						let job = await readDiagramJob(previous.state.sourceRoot, request.id);
						if (request.operation === 'diagramApprovePlan') { await approveDiagramPlan(job, previous, next, request.reviewId, signal); return diagramProgress(job); }
						const advanced = await advanceDiagramImport(job, previous, next, request.reviewId, signal, provider);
						job = advanced.job;
						if (!advanced.model) {
							if ((await readSnapshot(previous.directory)).inputHash !== previous.inputHash || (await importCode(next.sourceRoot, next.projectId, { previous: next, signal })).revision !== next.revision) { throw new Error('Project changed during diagram generation'); }
							return diagramProgress(advanced.job);
						}
						try {
							const current = await readSnapshot(previous.directory);
							const observed = await importCode(next.sourceRoot, next.projectId, { previous: next, signal });
							if (current.inputHash !== previous.inputHash || observed.revision !== next.revision) { throw new Error('Project changed during diagram generation'); }
							// Revalidate the complete textual inventory, including languages without a parser.
							await prepareDiagramImport(previous, observed, job.config, job.id, job.clarification, signal);
							const destination = join(await managed(next.sourceRoot), randomUUID());
							await writeSnapshot(destination, next, advanced.model, undefined, previous, signal, true);
							await activate(next.sourceRoot, destination);
							await finishDiagramImport(job);
							return { ...diagramProgress(job), context: context(destination, next, advanced.model) };
						} catch (error) { await finishDiagramImport(job, error instanceof Error ? error.message : 'Diagram publication failed'); throw error; }
					});
				}
				else if (request.operation === 'preview') {
					await assertNoInterruptedOperation(previous.state.sourceRoot);
					let next = await importCode(previous.state.sourceRoot, previous.state.projectId, { previous: previous.state, scope: request.scope, renameHints: request.renames ? readRenameHints(request.renames) : undefined, signal });
					next = await analyze(next, request.bundles ?? [], previous.state, false, signal);
					const prepared = prepareReconciliation(previous, next, request.resolutions);
					for (const [file, source] of Object.entries(previous.commonSources)) {
						if (previous.state.files.find(item => item.file === file)?.status === 'parsed') { continue; }
						let changed = false;
						try { changed = contentHash((await sourceFile(next.sourceRoot, file)).content) !== source.revision; }
						catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) { throw error; } changed = true; }
						if (changed) { prepared.origin = prepared.origin === 'model' || prepared.origin === 'both' ? 'both' : 'code'; prepared.status = prepared.report.conflicts.length ? 'conflict' : 'pending'; if (!prepared.report.files.changed.includes(file)) { prepared.report.files.changed.push(file); } }
					}
					const token = randomUUID();
					while (previews.size >= 5) { previews.delete(previews.keys().next().value!); }
					previews.set(token, { previous, next, result: prepared, active: await active(next.sourceRoot), created: Date.now() });
					result = previewResponse(token, previews.get(token)!);
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
					const operations = (await operationHistory(previous.state.sourceRoot)).map(({ id, created, status, origin, fromRevision, toRevision, from, to }) => ({ id, created, status, origin, fromRevision, toRevision, from, to }));
					result = { snapshots, operations };
				} else if (request.operation === 'undoSync' || request.operation === 'recoverSync') {
					result = await lock(previous.state.sourceRoot, async () => {
						const restored = request.operation === 'undoSync' ? await undoReconciliation(previous.state.sourceRoot, request.id) : await recoverReconciliation(previous.state.sourceRoot, request.id);
						return context(restored.directory, restored.state, restored.model);
					});
				} else if (request.operation === 'restore') {
					const target = await readSnapshot(request.target);
					if (dirname(target.directory) !== join(previous.state.sourceRoot, '.ade', 'imports') || target.state.sourceRoot !== previous.state.sourceRoot || target.state.projectId !== previous.state.projectId) { throw new Error('Recovery snapshot belongs to a different project'); }
					result = await lock(previous.state.sourceRoot, async () => { await assertNoInterruptedOperation(previous.state.sourceRoot); await activate(previous.state.sourceRoot, target.directory); return context(target.directory, target.state, target.model); });
				}
				else { throw new Error('Unknown operation'); }
			}
			return JSON.stringify(result);
		}
	};
}
export const engine: CodeEngine = createCodeEngine();
