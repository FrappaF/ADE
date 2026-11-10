/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomUUID } from 'node:crypto';
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { ErrorObject } from 'ajv';
import { active, atomicJson, lock, managed, snapshotId } from '../runtime/projectStore.ts';
import { readSnapshot, writeSnapshot, type ImportSnapshot } from '../code-import/snapshot.ts';
import { importCode, type CodeImport } from '../code-import/importCode.ts';
import { contentHash, sourceFile } from '../runtime/sourceChanges.ts';
import { applyReconciliation, assertNoInterruptedOperation, operationHistory, recoverReconciliation } from '../code-import/reconciliationJournal.ts';
import { ExplorationSourceRangeError, explorationCapabilities, explorationPage, refreshExplorationAnalysis, indexScopeRevision, readExplorationSource, searchExplorationSource, sourceRole, type ExplorationCapabilities, type IndexQuery } from '../code-import/explorationIndex.ts';
import { diagramProposalExample, diagramSessionInstruction, diagramToolDefinitions, diagramViewCatalog } from '../../src/vs/workbench/contrib/ade/common/diagramTools.ts';
import { applyDiagramProposal, diagramModelRevision, proposeDiagramModel, type DiagramProposal, type DiagramProposalRequest } from '../../src/vs/workbench/contrib/ade/common/modelProposals.ts';
import { migrateSemanticModelToV5 } from '../../src/vs/workbench/contrib/ade/common/modelMigration.ts';
import { canonicalJson } from '../../src/vs/workbench/contrib/ade/common/modelSerialization.ts';
import { emptyFoundation, isSourceEvidenceModel } from '../../src/vs/workbench/contrib/ade/common/modelFoundation.ts';
import { type EvidenceRecord, type ModelAssertion, type SemanticModelV4 } from '../../src/vs/workbench/contrib/ade/common/modelTypes.ts';
import { projectDescriptiveActivity } from '../../src/vs/workbench/contrib/ade/common/descriptiveActivity.ts';
import { explorationReadiness } from '../../src/vs/workbench/contrib/ade/common/modelExploration.ts';
import { inspectDiagramQuality, renderDiagramPreview } from '../../src/vs/workbench/contrib/ade/common/diagramPreview.ts';
import { isDisclosableSource } from '../code-import/paths.ts';
import { diagramProjectBlockers, diagramProjectProposal, projectDrafts, stageDiagramProject, validateDiagramPlan, type DiagramPlan, type DiagramPlanItem } from './diagramProject.ts';
import { notationNodeSize } from '../../src/vs/workbench/contrib/ade/common/diagramLayout.ts';

export interface ExplorationBudget { maxToolCalls: number; maxReadBytes: number; maxDurationMs: number; maxModelTurns: number }
const defaultProjectBudget: ExplorationBudget = { maxToolCalls: 400, maxReadBytes: 8388608, maxDurationMs: 5400000, maxModelTurns: 32 };
const defaultExplorationBudget: ExplorationBudget = { maxToolCalls: 80, maxReadBytes: 1024 * 1024, maxDurationMs: 30 * 60 * 1000, maxModelTurns: 8 };
type TaskState = 'queued' | 'running' | 'waitingContext' | 'waitingUser' | 'blocked' | 'ready' | 'applied' | 'cancelled';
interface ExplorationTask { id: string; intent: string; status: TaskState; gaps: string[]; proposalId?: string }
interface ToolReceipt { id: string; fingerprint: string; tool: string; status: 'running' | 'complete' | 'interrupted'; inputBytes: number; outputBytes: number; durationMs?: number; diagnostics?: string[] }
export interface DiagramExplorationSession {
	version: 2; id: string; root: string; projectId: string; created: number; model: string; workflow?: 'project'; plan?: DiagramPlan; runs?: { id: string; model: string; started: number }[];
	budget: ExplorationBudget; usage: { toolCalls: number; readBytes: number; modelTurns: string[]; inputTokens: null; outputTokens: null; turnsObservable: boolean };
	evidence: EvidenceRecord[]; queries: IndexQuery[]; proposals: DiagramProposal[]; tasks: ExplorationTask[]; calls: ToolReceipt[];
	publication?: { proposalIds?: string[]; proposalId: string; destination: string; status: 'publishing' | 'applied' | 'rolledBack' };
}
export interface ExplorationRequest {
	action: 'open' | 'tool' | 'publish' | 'budget' | 'review' | 'publishAll'; sessionId?: string; model?: string; budget?: ExplorationBudget; workflow?: 'project'; reviewId?: string;
	tool?: string; arguments?: object; callId?: string; turnId?: string; proposalId?: string;
}
export interface DiagramExplorationResult {
	version: 2; sessionId: string; sourceRevision: string; indexRevision: string; semanticRevision: string;
	capabilities: ExplorationCapabilities[]; data: object; diagnostics: object[];
}
const requestValidator = new Ajv2020().compile({ type: 'object', additionalProperties: false, required: ['action'], properties: {
	workflow: { const: 'project' }, reviewId: { type: 'string', maxLength: 100 }, action: { enum: ['open', 'tool', 'publish', 'budget', 'review', 'publishAll'] }, sessionId: { type: 'string', maxLength: 100 }, model: { type: 'string', minLength: 1, maxLength: 200 }, budget: { type: 'object' }, tool: { type: 'string', maxLength: 120 }, arguments: { type: 'object' }, callId: { type: 'string', maxLength: 300 }, turnId: { type: 'string', maxLength: 300 }, proposalId: { type: 'string', maxLength: 100 }
} });
const toolValidator = new Ajv2020({ strict: false, allErrors: true });
const validators = new Map(diagramToolDefinitions.map(tool => [tool.name, toolValidator.compile(tool.inputSchema)]));
const commandValidators = new Map(diagramToolDefinitions.find(tool => tool.name === 'ade_model_propose')!.inputSchema.properties!.commands.items!.oneOf!.map(schema => [String(schema.properties!.kind.const), { schema, validate: toolValidator.compile(schema) }]));
const projectQueues = new Map<string, Promise<void>>();

/** Models can search in parallel; serialize this process before taking the shared publication lock. */
async function explorationLock<T>(root: string, task: () => Promise<T>): Promise<T> {
	const previous = projectQueues.get(root) ?? Promise.resolve();
	let release!: () => void;
	const current = new Promise<void>(resolve => { release = resolve; });
	projectQueues.set(root, current);
	await previous;
	try { return await lock(root, task); }
	finally { release(); if (projectQueues.get(root) === current) { projectQueues.delete(root); } }
}

/** Select the command's actual union branch instead of reporting an unrelated merge schema. */
function argumentDiagnostics(tool: string, args: object): object[] {
	const validate = validators.get(tool);
	if (!validate) { return [{ code: 'unsupportedTool', recoverable: true }]; }
	if (validate(args)) { return []; }
	const diagnostic = (error: ErrorObject, prefix = '') => ({ code: 'invalidToolArguments', field: prefix + error.instancePath, requirement: error.message ?? '', keyword: error.keyword, details: error.params, recoverable: true });
	if (tool !== 'ade_model_propose' || !Array.isArray((args as { commands?: unknown }).commands)) { return (validate.errors ?? []).slice(0, 8).map(error => diagnostic(error)); }
	const result: object[] = (validate.errors ?? []).filter(error => !/^\/commands\/\d+(\/|$)/.test(error.instancePath)).map(error => diagnostic(error));
	for (const [index, command] of ((args as { commands: unknown[] }).commands).entries()) {
		const kind = command && typeof command === 'object' && Object.hasOwn(command, 'kind') ? (command as { kind: unknown }).kind : undefined;
		const branch = typeof kind === 'string' ? commandValidators.get(kind) : undefined;
		if (!branch) { result.push({ code: 'invalidToolArguments', field: `/commands/${index}/kind`, requirement: 'Choose a command kind and use its nested shape.', allowedValues: [...commandValidators.keys()], example: diagramProposalExample.commands[0], recoverable: true }); }
		else if (!branch.validate(command)) { result.push(...(branch.validate.errors ?? []).slice(0, 4).map((error, indexInCommand) => ({ ...diagnostic(error, `/commands/${index}`), ...(indexInCommand === 0 ? { expected: branch.schema } : {}) }))); }
	}
	return result.slice(0, 8);
}
function budget(value: ExplorationBudget): ExplorationBudget {
	if (!value || !Number.isSafeInteger(value.maxToolCalls) || value.maxToolCalls < 1 || value.maxToolCalls > 1000 || !Number.isSafeInteger(value.maxReadBytes) || value.maxReadBytes < 1024 || value.maxReadBytes > 32 * 1024 * 1024 || !Number.isSafeInteger(value.maxDurationMs) || value.maxDurationMs < 1000 || value.maxDurationMs > 24 * 60 * 60 * 1000 || !Number.isSafeInteger(value.maxModelTurns) || value.maxModelTurns < 1 || value.maxModelTurns > 100) { throw new Error('invalidSessionBudget'); }
	return structuredClone(value);
}
async function sessionPath(root: string, id: string): Promise<string> {
	if (!snapshotId(id)) { throw new Error('invalidSessionId'); }
	return join(await managed(root, 'exploration'), id + '.json');
}
async function save(session: DiagramExplorationSession): Promise<void> {
	if (Buffer.byteLength(JSON.stringify(session)) > 16 * 1024 * 1024) { throw new Error('sessionStorageLimit'); }
	await atomicJson(await sessionPath(session.root, session.id), session);
}
export async function readExplorationSession(root: string, id: string): Promise<DiagramExplorationSession> {
	const path = await sessionPath(root, id), info = await lstat(path);
	if (!info.isFile() || info.isSymbolicLink() || info.size > 16 * 1024 * 1024 || await realpath(path) !== path) { throw new Error('invalidSessionArtifact'); }
	const value = JSON.parse(await readFile(path, 'utf8')) as DiagramExplorationSession;
	if (value.version !== 2 || value.id !== id || value.root !== root || !Array.isArray(value.proposals) || !Array.isArray(value.evidence) || !Array.isArray(value.calls)) { throw new Error('invalidSessionArtifact'); }
	budget(value.budget); return value;
}
function architecture(snapshot: ImportSnapshot): SemanticModelV4 {
	// The untouched syntax projection remains in the index. It is not the architecture model.
	if (isSourceEvidenceModel(snapshot.model) && canonicalJson(snapshot.model) === canonicalJson(snapshot.state.model)) { return { version: 5, id: snapshot.model.id, name: snapshot.model.name, semantics: { elements: [], relations: [] }, views: [], codeMappings: [], verifications: [], foundation: { ...emptyFoundation(), evidence: [] } }; }
	return migrateSemanticModelToV5(snapshot.model);
}
async function verifyEvidence(state: CodeImport, records: EvidenceRecord[]): Promise<void> {
	for (const entry of records) {
		if (!isDisclosableSource(entry.file) || !state.files.some(file => file.file === entry.file && file.status !== 'excluded')) { throw new Error('evidenceOutsideScope:' + entry.id); }
		const source = await sourceFile(state.sourceRoot, entry.file);
		if (contentHash(source.content) !== entry.revision || entry.end > source.content.length) { throw new Error('staleEvidence:' + entry.id); }
	}
}
async function verifyProposal(state: CodeImport, session: DiagramExplorationSession, proposal: DiagramProposal): Promise<void> {
	const records = proposal.readEvidenceIds.map(id => session.evidence.find(entry => entry.id === id));
	if (records.some(record => !record)) { throw new Error('missingEvidence'); }
	await verifyEvidence(state, records as EvidenceRecord[]);
	for (const id of proposal.queryIds) { const query = session.queries.find(entry => entry.id === id); if (!query || query.revision !== indexScopeRevision(state, query.filePrefix)) { throw new Error('staleQuery:' + id); } }
}
const transitions: Record<TaskState, TaskState[]> = {
	queued: ['running', 'cancelled'], running: ['waitingContext', 'waitingUser', 'blocked', 'ready', 'cancelled'], waitingContext: ['running', 'blocked', 'cancelled'], waitingUser: ['running', 'cancelled'], blocked: ['running', 'cancelled'], ready: ['running', 'applied', 'cancelled'], applied: ['running'], cancelled: ['queued']
};
function updateTask(session: DiagramExplorationSession, task: ExplorationTask): void {
	const old = session.tasks.find(entry => entry.id === task.id);
	if (old && old.status !== task.status && !transitions[old.status].includes(task.status)) { throw new Error('invalidTaskTransition:' + old.status + ':' + task.status); }
	if (task.proposalId && !session.proposals.some(entry => entry.id === task.proposalId)) { throw new Error('unknownProposal'); }
	if (session.workflow === 'project') {
		const proposal = session.proposals.find(proposal => proposal.id === (task.proposalId ?? old?.proposalId));
		if (proposal) { if (task.status === 'cancelled') { proposal.excludedByPlan = task.id; } else { delete proposal.excludedByPlan; } }
	}
	if (old) { Object.assign(old, task); } else { if (session.tasks.length >= 100) { throw new Error('taskLimit'); } session.tasks.push(task); }
}

/** One project-scoped domain service serves both workbench tools and the official MCP adapter. */
export async function executeDiagramExploration(snapshotDirectory: string, request: ExplorationRequest, signal?: AbortSignal): Promise<DiagramExplorationResult> {
	if (Buffer.byteLength(JSON.stringify(request)) > 1024 * 1024) { throw new Error('explorationRequestLimit'); }
	if (!requestValidator(request)) { throw new Error('invalidExplorationRequest'); }
	const initial = await readSnapshot(snapshotDirectory), root = initial.state.sourceRoot;
	if (snapshotDirectory !== initial.directory || initial.directory !== join(root, '.ade', 'imports', basename(initial.directory))) { throw new Error('snapshotOutsideProjectScope'); }
	return explorationLock(root, async () => {
		signal?.throwIfAborted();
		const pointer = await active(root);
		if (!pointer) { throw new Error('projectNotImported'); }
		const snapshot = await readSnapshot(join(root, '.ade', 'imports', pointer));
		let session: DiagramExplorationSession;
		if (request.action === 'open' && !request.sessionId) {
			session = { version: 2, id: randomUUID(), root, projectId: snapshot.state.projectId, model: request.model ?? 'user-selected', created: Date.now(), budget: budget(request.budget ?? defaultExplorationBudget), usage: { toolCalls: 0, readBytes: 0, modelTurns: [], inputTokens: null, outputTokens: null, turnsObservable: false }, evidence: [], queries: [], proposals: [], tasks: [{ id: 'overview', intent: 'Discover the main runtime responsibilities and integrations', status: 'queued', gaps: [] }], calls: [] };
		} else { if (!request.sessionId) { throw new Error('sessionRequired'); } session = await readExplorationSession(root, request.sessionId); }
		if (request.workflow === 'project' && session.workflow !== 'project') { session.workflow = 'project'; session.budget = budget(request.budget ?? defaultProjectBudget); session.created = Date.now(); }
		if (session.projectId !== snapshot.state.projectId) { throw new Error('sessionProjectMismatch'); }
		// Recover local publications through the existing shared journal, never re-invoke inference.
		if (session.publication?.status === 'publishing') {
			for (const operation of await operationHistory(root)) { if (operation.to === session.publication.destination && operation.status === 'reconciling') { await recoverReconciliation(root, operation.id); } }
			const applied = await active(root) === basename(session.publication.destination);
			session.publication.status = applied ? 'applied' : 'rolledBack';
			if (applied) { for (const task of session.tasks.filter(task => (session.publication!.proposalIds ?? [session.publication!.proposalId]).includes(task.proposalId ?? ''))) { task.status = 'applied'; } for (const proposal of session.proposals.filter(entry => (session.publication!.proposalIds ?? [session.publication!.proposalId]).includes(entry.id))) { proposal.status = 'applied'; } }
		}
		for (const call of session.calls.filter(call => call.status === 'running')) { call.status = 'interrupted'; }
		if (request.model && request.model !== session.model) { session.runs ??= []; session.runs.push({ id: randomUUID(), model: request.model, started: Date.now() }); session.model = request.model; }
		const publishedModel = architecture(snapshot);
		const staged = session.workflow === 'project' ? stageDiagramProject(publishedModel, session.proposals) : { model: publishedModel, blockers: [] };
		const model = staged.model, semanticRevision = await diagramModelRevision(model);
		for (const evidence of model.foundation.evidence ?? []) { if (!session.evidence.some(entry => entry.id === evidence.id)) { session.evidence.push(evidence); } }
		const state = await refreshExplorationAnalysis(await importCode(root, snapshot.state.projectId, { previous: snapshot.state, signal }), snapshot.state, signal);
		// A partial semantic index is declared, not upgraded into fabricated calls after a source change.
		state.analysis.syntaxOnly = snapshot.state.analysis.syntaxOnly ?? false;
		const queryState = structuredClone(state);
		for (const file of queryState.files.filter(file => !file.revision && file.status !== 'excluded' && isDisclosableSource(file.file))) {
			try { const source = await sourceFile(root, file.file); if (!source.content.includes('\0')) { file.revision = contentHash(source.content); } } catch { /* Unavailable files remain explicitly unversioned. */ }
		}
		queryState.revision = contentHash(state.revision + indexScopeRevision(queryState));
		const capabilities = explorationCapabilities(state);
		const envelope = (data: object, diagnostics: object[] = []): DiagramExplorationResult => ({ version: 2, sessionId: session.id, sourceRevision: state.revision, indexRevision: queryState.revision, semanticRevision, capabilities, data, diagnostics });
		const staleEvidence = new Set((model.foundation.evidence ?? []).filter(evidence => queryState.files.find(file => file.file === evidence.file)?.revision !== evidence.revision).map(evidence => evidence.id));
		const affected = new Set(model.foundation.assertions.filter(assertion => assertion.evidenceIds?.some(id => staleEvidence.has(id))).map(assertion => assertion.subject.id));
		for (const occurrence of model.foundation.occurrences) { if (occurrence.evidenceIds?.some(id => staleEvidence.has(id))) { affected.add(occurrence.id); } }
		for (const scenario of model.foundation.interactions) { if (scenario.description?.evidenceIds.some(id => staleEvidence.has(id)) || scenario.occurrenceIds.some(id => affected.has(id))) { affected.add(scenario.id); } }
		const invalidation = { evidenceIds: [...staleEvidence], objectIds: [...affected], viewIds: model.views.filter(view => view.nodes.some(node => affected.has(node.elementId)) || view.relationIds.some(id => affected.has(id)) || affected.has(view.interactionId ?? '')).map(view => view.id), queryIds: session.queries.filter(query => query.revision !== indexScopeRevision(queryState, query.filePrefix)).map(query => query.id) };
		const summary = () => ({ sessionId: session.id, model: session.model, workflow: session.workflow, plan: session.plan, batch: session.workflow === 'project' ? { blockers: [...staged.blockers, ...diagramProjectBlockers(session.plan, session.tasks, session.proposals)] } : undefined, budget: session.budget, usage: session.usage, invalidation, tasks: session.tasks, proposals: session.proposals.filter(proposal => !proposal.supersededBy && !proposal.excludedByPlan).map(proposal => ({ id: proposal.id, status: proposal.status, diagnostics: proposal.diagnostics, views: proposal.patch.filter(patch => patch.collection === 'views').map(patch => patch.value) })), instruction: diagramSessionInstruction, sourceChanged: state.revision !== snapshot.state.revision });
		if (request.action === 'budget') {
			if (!request.budget) { throw new Error('budgetRequired'); }
			session.budget = budget(request.budget); session.created = Date.now(); await save(session); return envelope(summary());
		}
		if (request.action === 'open') { await save(session); return envelope(summary()); }
		if (request.action === 'review' || request.action === 'publishAll') {
			if (session.workflow !== 'project') { throw new Error('projectWorkflowRequired'); }
			if (request.action === 'publishAll' && session.publication?.status === 'applied' && session.publication.proposalId === request.reviewId) { return envelope({ applied: true, snapshot: snapshot.directory }); }
			const drafts = projectDrafts(session.proposals);
			const blockers = [...staged.blockers, ...diagramProjectBlockers(session.plan, session.tasks, session.proposals)];
			if (!drafts.length) { blockers.push('noDiagramDrafts'); }
			for (const draft of drafts) { try { await verifyProposal(queryState, session, draft); } catch (error) { blockers.push(error instanceof Error ? error.message : String(error)); } }
			if (state.analysis.semanticInvalidated) { blockers.push('semanticIndexRefreshRequired'); }
			for (const view of model.views.filter(view => drafts.some(draft => draft.patch.some(patch => patch.collection === 'views' && patch.id === view.id)))) { if (inspectDiagramQuality(model, view).some(diagnostic => diagnostic.severity === 'error')) { blockers.push('diagramGeometryInvalid:' + view.id); } }
			const proposal = diagramProjectProposal(await diagramModelRevision(publishedModel), session.plan, session.tasks, session.proposals, blockers);
			if (request.action === 'review') {
				const preview = await previewDiagramProposal(queryState, model, session, proposal, {});
				return envelope({ ...preview, reviewId: proposal.id, plan: session.plan, tasks: session.tasks, proposal: { id: proposal.id, status: proposal.status, diagnostics: proposal.diagnostics, views: model.views.filter(view => proposal.patch.some(patch => patch.collection === 'views' && patch.id === view.id)) } });
			}
			if (!request.reviewId || request.reviewId !== proposal.id) { throw new Error('projectReviewChanged'); }
			if (blockers.length) { throw new Error('projectNotReady:' + blockers.join(' · ')); }
			await assertNoInterruptedOperation(root);
			const destination = join(await managed(root), randomUUID());
			session.publication = { proposalId: proposal.id, proposalIds: drafts.map(draft => draft.id), destination, status: 'publishing' }; await save(session);
			await applyReconciliation(snapshot, destination, 'model', [], async () => {
				for (const draft of drafts) { await verifyProposal(queryState, session, draft); }
				await writeSnapshot(destination, state, model, undefined, snapshot, signal, true);
			}, signal);
			for (const draft of drafts) { draft.status = 'applied'; }
			for (const task of session.tasks.filter(task => task.status === 'ready')) { task.status = 'applied'; }
			session.publication.status = 'applied'; await save(session);
			return envelope({ applied: true, snapshot: destination });
		}
		if (request.action === 'publish') {
			if (session.workflow === 'project') { throw new Error('projectReviewRequired'); }
			const proposal = session.proposals.find(entry => entry.id === request.proposalId);
			if (!proposal) { throw new Error('unknownProposal'); }
			if (proposal.supersededBy) { throw new Error('proposalSuperseded:' + proposal.supersededBy); }
			if (proposal.status === 'applied') { await save(session); return envelope({ applied: true, snapshot: snapshot.directory, proposalId: proposal.id }); }
			await assertNoInterruptedOperation(root); await verifyProposal(queryState, session, proposal);
			if (state.analysis.semanticInvalidated) { throw new Error('semanticIndexRefreshRequired'); }
			const candidate = applyDiagramProposal(model, proposal);
			if (candidate.views.filter(view => proposal.patch.some(patch => patch.collection === 'views' && patch.id === view.id)).some(view => inspectDiagramQuality(candidate, view).some(diagnostic => diagnostic.severity === 'error'))) { throw new Error('diagramGeometryInvalid'); }
			const destination = join(await managed(root), randomUUID());
			session.publication = { proposalId: proposal.id, destination, status: 'publishing' }; await save(session);
			await applyReconciliation(snapshot, destination, 'model', [], async () => {
				await verifyProposal(queryState, session, proposal);
				await writeSnapshot(destination, state, candidate, undefined, snapshot, signal, true);
			}, signal);
			proposal.status = 'applied'; session.publication.status = 'applied';
			for (const task of session.tasks.filter(task => task.proposalId === proposal.id)) { task.status = 'applied'; }
			await save(session); return envelope({ applied: true, snapshot: destination, proposalId: proposal.id });
		}
		const tool = request.tool ?? '', args = request.arguments ?? {};
		const callId = request.callId ?? randomUUID(), fingerprint = contentHash(canonicalJson({ tool, args }));
		const previousCall = session.calls.find(call => call.id === callId);
		if (previousCall) { return envelope({}, [{ code: previousCall.fingerprint === fingerprint ? 'callAlreadyRecorded' : 'callIdConflict', recoverable: false, action: 'Inspect the saved local receipt and proposal before retrying this operation.' }]); }
		if (request.turnId && !session.usage.modelTurns.includes(request.turnId)) {
			if (session.usage.modelTurns.length >= session.budget.maxModelTurns) { return envelope({}, [{ code: 'modelTurnBudgetExhausted', recoverable: true }]); }
			session.usage.modelTurns.push(request.turnId); session.usage.turnsObservable = true;
		}
		if (session.usage.toolCalls >= session.budget.maxToolCalls || session.usage.readBytes >= session.budget.maxReadBytes || Date.now() - session.created > session.budget.maxDurationMs) { return envelope({}, [{ code: 'sessionBudgetExhausted', recoverable: true }]); }
		const checkpoint = { evidence: [...session.evidence], queries: [...session.queries], proposals: session.proposals.map(proposal => ({ ...proposal })), tasks: structuredClone(session.tasks), plan: session.plan };
		const call: ToolReceipt = { id: callId, fingerprint, tool, status: 'running', inputBytes: Buffer.byteLength(JSON.stringify(args)), outputBytes: 0 }, started = Date.now();
		session.calls.push(call); session.usage.toolCalls++; await save(session);
		let result: DiagramExplorationResult;
		try {
			const diagnostics = argumentDiagnostics(tool, args);
			const beforeId = session.workflow === 'project' ? tool === 'ade_model_propose' ? (args as DiagramProposalRequest).supersedes : tool === 'ade_view_preview' ? (args as { proposalId: string }).proposalId : undefined : undefined;
			const toolModel = beforeId ? stageDiagramProject(publishedModel, session.proposals, beforeId).model : model;
			if (beforeId && tool === 'ade_model_propose' && (args as DiagramProposalRequest).baseSemanticRevision !== semanticRevision) { throw new Error('staleSemanticRevision'); }
			const data = diagnostics.length ? {} : await dispatchTool(tool, args, queryState, toolModel, session, signal);
			signal?.throwIfAborted();
			result = structuredClone(envelope(data, diagnostics));
			if (session.workflow === 'project') { result.semanticRevision = await diagramModelRevision(stageDiagramProject(publishedModel, session.proposals).model); }
			const bytes = Buffer.byteLength(JSON.stringify(result));
			if (bytes > 128 * 1024 || session.usage.readBytes + bytes > session.budget.maxReadBytes) { throw new Error('responseByteBudgetExhausted'); }
			call.status = 'complete';
		} catch (error) {
			Object.assign(session, checkpoint);
			call.status = signal?.aborted ? 'interrupted' : 'complete';
			result = envelope({}, [{ code: error instanceof Error ? error.message : 'toolFailure', recoverable: true, ...(error instanceof ExplorationSourceRangeError ? { range: error.range, action: 'Use these UTF-16 bounds, or omit start/end for an initial bounded read; then follow nextStart and requestedEnd.' } : { action: 'Correct this request or refresh evidence; accepted proposals are preserved.' }) }]);
		}
		// Rejected requests consume calls and returned bytes too. Only the bounded exhaustion response may exceed the remaining data allowance.
		call.outputBytes = Buffer.byteLength(JSON.stringify(result)); session.usage.readBytes += call.outputBytes;
		call.diagnostics = result.diagnostics.map(diagnostic => String((diagnostic as { code?: unknown }).code ?? 'toolFailure'));
		call.durationMs = Date.now() - started; await save(session); return result;
	});
}

async function dispatchTool(tool: string, value: object, state: CodeImport, model: SemanticModelV4, session: DiagramExplorationSession, signal?: AbortSignal): Promise<object> {
	if (tool === 'ade_project_inspect') {
		const input = value as { cursor?: string; limit?: number }, files = state.files.map(file => ({ path: file.file, revision: file.revision ?? null, language: file.language ?? 'text', role: sourceRole(file.file), status: file.status, symbols: file.declarations.length, exclusions: file.diagnostics.map(item => item.code) }));
		const entrypoints = state.files.filter(file => sourceRole(file.file) === 'runtime' && /(^|\/)(main|index|app|server|cli|__main__)([.\/]|$)/i.test(file.file)).slice(0, 20).map(file => ({ file: file.file, revision: file.revision ?? null, classification: 'candidate' }));
		const map = [...new Set(state.files.filter(file => file.status !== 'excluded').map(file => file.file.includes('/') ? file.file.split('/')[0] : '.'))].map(directory => ({ directory, files: state.files.filter(file => directory === '.' ? !file.file.includes('/') : file.file.startsWith(directory + '/')).length })).sort((a, b) => b.files - a.files).slice(0, 20);
		return { projectId: state.projectId, proposalGuide: { example: diagramProposalExample, commandKinds: [...commandValidators.keys()] }, viewCapabilities: { catalog: diagramViewCatalog, behavior: ['sequence', 'activity'], descriptiveStates: 'unsupported', viewsPerProposal: 1 }, entrypoints, map, files: explorationPage(files, state.revision, {}, input.cursor, input.limit), coverage: { inventory: { total: files.length, excluded: files.filter(file => file.status === 'excluded').length }, analyzer: explorationCapabilities(state), understanding: { exploredEvidence: session.evidence.length, unexploredFiles: files.filter(file => !session.evidence.some(entry => entry.file === file.path)).length, complete: false } }, views: explorationPage(model.views.map(view => ({ id: view.id, name: view.name, kind: view.kind })), contentHash(canonicalJson(model.views)), { collection: 'views', id: null, relatedTo: null }, undefined, 20), budget: session.budget, usage: session.usage };
	}
	if (tool === 'ade_source_search') {
		const result = await searchExplorationSource(state, value as Parameters<typeof searchExplorationSource>[1], signal);
		for (const hit of result.page.items) { if (!session.evidence.some(entry => entry.id === hit.evidence.id)) { session.evidence.push(hit.evidence); } }
		if (!session.queries.some(entry => entry.id === result.query.id)) { session.queries.push(result.query); }
		return result;
	}
	if (tool === 'ade_source_read') {
		const result = await readExplorationSource(state, value as Parameters<typeof readExplorationSource>[1]);
		if (!session.evidence.some(entry => entry.id === result.evidence.id)) { session.evidence.push(result.evidence); } return result;
	}
	if (tool === 'ade_code_references') {
		const input = value as { symbolId: string; direction: 'incoming' | 'outgoing'; cursor?: string; limit?: number };
		if (!state.semantic || state.analysis.semanticInvalidated) { return { availability: 'unsupported', reason: 'resolvedReferencesUnavailable', calls: 'unsupported' }; }
		if (!state.files.some(file => state.semantic!.indexedFiles.includes(file.file) && (file.moduleId === input.symbolId || file.declarations.some(declaration => declaration.id === input.symbolId)))) { return { availability: 'unavailable', reason: 'symbolNotIndexed', calls: 'unsupported' }; }
		const record = (source: { file: string; revision: string; start: number; end: number }, provider: number, factId: string): EvidenceRecord => ({ id: 'evidence:' + contentHash(canonicalJson({ source, provider, factId })), file: source.file, revision: source.revision, start: source.start, end: source.end, encoding: 'utf-16', producer: state.semantic!.providers[provider].name, producerVersion: state.semantic!.providers[provider].version, nature: 'reference', factIds: [factId] });
		const edges = state.semantic.dependencies.filter(edge => input.direction === 'incoming' ? edge.to === input.symbolId : edge.from === input.symbolId).flatMap(edge => edge.references.map(reference => ({ id: edge.id, from: edge.from, to: edge.to, source: record(reference.source, reference.provider, edge.id), target: record(reference.target, reference.provider, edge.id) })));
		const page = explorationPage(edges, state.revision, { symbolId: input.symbolId, direction: input.direction }, input.cursor, input.limit);
		for (const edge of page.items) { for (const evidence of [edge.source, edge.target]) { if (!session.evidence.some(entry => entry.id === evidence.id)) { session.evidence.push(evidence); } } }
		const query: IndexQuery = { id: 'query:' + contentHash(state.revision + input.symbolId + input.direction), revision: indexScopeRevision(state), filePrefix: '', fingerprint: contentHash(input.symbolId + input.direction) };
		if (!session.queries.some(entry => entry.id === query.id)) { session.queries.push(query); }
		return { availability: 'partial', kind: 'references', calls: 'unsupported', query, coverage: { indexedFiles: state.semantic.indexedFiles.length, totalFiles: state.files.length }, page };
	}
	if (tool === 'ade_model_query') {
		const input = value as { collection: string; id?: string; relatedTo?: string; cursor?: string; limit?: number };
		const all: { id: string }[] = input.collection === 'elements' ? model.semantics.elements : input.collection === 'relations' ? model.semantics.relations : input.collection === 'views' ? model.views : input.collection === 'scenarios' ? model.foundation.interactions : input.collection === 'ownership' ? model.foundation.ownership : input.collection === 'memberships' ? model.foundation.memberships : input.collection === 'assertions' ? model.foundation.assertions : input.collection === 'evidence' ? session.evidence : input.collection === 'tasks' ? session.tasks : session.proposals.map(entry => ({ id: entry.id, status: entry.status, aliases: entry.aliases, supersededBy: entry.supersededBy ?? null, excludedByPlan: entry.excludedByPlan ?? null, diagnostics: entry.diagnostics }));
		const items = all.filter(entry => (!input.id || entry.id === input.id) && (!input.relatedTo || JSON.stringify(entry).includes(JSON.stringify(input.relatedTo))));
		return explorationPage(items, contentHash(canonicalJson(all)), { collection: input.collection, id: input.id ?? null, relatedTo: input.relatedTo ?? null }, input.cursor, input.limit);
	}
	if (tool === 'ade_model_propose') {
		if (session.workflow === 'project' && !session.plan) { throw new Error('diagramPlanRequired'); }
		const input = value as DiagramProposalRequest, fingerprint = contentHash(canonicalJson(input)), old = session.proposals.find(entry => entry.id === input.proposalId);
		if (old) { if (old.fingerprint !== fingerprint) { throw new Error('proposalIdContentConflict'); } return { proposalId: old.id, status: old.status, aliases: old.aliases, diagnostics: old.diagnostics }; }
		if (session.proposals.length >= 100) { throw new Error('proposalLimit'); }
		const probe: DiagramProposal = { version: 2, id: input.proposalId, fingerprint, baseSemanticRevision: input.baseSemanticRevision, aliases: {}, readSet: [], readEvidenceIds: input.readEvidenceIds, queryIds: input.queryIds, patch: [], status: 'ready', diagnostics: [] };
		await verifyProposal(state, session, probe);
		const reserved = input.supersedes ? session.proposals.find(entry => entry.id === input.supersedes) : undefined;
		if (input.supersedes && (!reserved || reserved.status === 'applied')) { throw new Error('supersededProposalUnavailable'); }
		const proposal = await proposeDiagramModel(model, session.workflow === 'project' && input.supersedes ? { ...input, baseSemanticRevision: await diagramModelRevision(model) } : input, session.evidence, undefined, reserved);
		proposal.fingerprint = fingerprint;
		for (const patch of proposal.patch.filter(entry => entry.collection === 'assertions')) { if (patch.value) { (patch.value as ModelAssertion).provenance.producer = session.model; } }
		await verifyProposal(state, session, proposal); session.proposals.push(proposal);
		if (reserved) { reserved.supersededBy = proposal.id; }
		return { proposalId: proposal.id, status: proposal.status, aliases: proposal.aliases, diagnostics: proposal.diagnostics, diff: proposal.patch.map(patch => ({ collection: patch.collection, id: patch.id, change: patch.value === null ? 'remove' : patch.before === null ? 'add' : 'update', value: patch.value })) };
	}
	if (tool === 'ade_view_preview') {
		const input = value as { proposalId: string; cursor?: string; limit?: number }, proposal = session.proposals.find(entry => entry.id === input.proposalId);
		if (!proposal) { throw new Error('unknownProposal'); }
		if (proposal.status === 'invalid') { return { proposalId: proposal.id, status: 'invalid', aliases: proposal.aliases, diagnostics: proposal.diagnostics, diff: explorationPage(proposal.patch.map(patch => ({ collection: patch.collection, id: patch.id, before: patch.before === null ? null : JSON.parse(patch.before), after: patch.value })), proposal.fingerprint, { proposalId: proposal.id }, input.cursor, input.limit ?? 12) }; }
		await verifyProposal(state, session, proposal);
		const candidate = proposal.status === 'applied' ? model : applyDiagramProposal(model, proposal);
		return previewDiagramProposal(state, candidate, session, proposal, input);
	}
	if (tool === 'ade_diagram_plan') {
		const plan = validateDiagramPlan((value as { items: DiagramPlanItem[] }).items);
		session.plan = plan;
		session.tasks = plan.items.map(item => ({ id: item.id, intent: item.intent, status: 'queued' as const, gaps: [], ...session.tasks.find(task => task.id === item.id) }));
		return { plan, tasks: session.tasks };
	}
	if (tool === 'ade_task_update') {
		const task = value as ExplorationTask;
		if (session.workflow === 'project') {
			if (!session.plan?.items.some(item => item.id === task.id)) { throw new Error('unknownPlannedDiagram'); }
			const item = session.plan.items.find(item => item.id === task.id)!;
			if (['running', 'ready'].includes(task.status) && [...item.dependsOn, ...(item.parentId ? [item.parentId] : [])].some(id => !session.tasks.some(task => task.id === id && ['ready', 'applied'].includes(task.status)))) { throw new Error('plannedDependencyNotReady'); }
			if (task.status === 'cancelled' && !task.gaps.length) { throw new Error('diagramExclusionReasonRequired'); }
		}
		updateTask(session, task); return { tasks: session.tasks }; }
	throw new Error('unsupportedTool');
}

/** Produce complete local review artifacts independently of publication. */
async function previewDiagramProposal(state: CodeImport, candidate: SemanticModelV4, session: DiagramExplorationSession, proposal: DiagramProposal, input: { cursor?: string; limit?: number }): Promise<object> {
		const selectedViews = candidate.views.filter(view => proposal.patch.some(patch => patch.collection === 'views' && patch.id === view.id));
		const images = [];
		for (const view of selectedViews) {
			const svg = renderDiagramPreview(candidate, view);
			if (Buffer.byteLength(svg) > 512 * 1024) { throw new Error('previewArtifactLimit'); }
			const path = join(await managed(state.sourceRoot, 'exploration'), 'preview-' + contentHash(svg) + '.svg');
			try { await writeFile(path, svg, { flag: 'wx', mode: 0o600 }); }
			catch (error) {
				if (!(error instanceof Error && (error as NodeJS.ErrnoException).code === 'EEXIST')) { throw error; }
				const info = await lstat(path);
				if (!info.isFile() || info.isSymbolicLink() || info.size > 512 * 1024 || await realpath(path) !== path || contentHash(await readFile(path, 'utf8')) !== contentHash(svg)) { throw new Error('invalidPreviewArtifact'); }
			}
			images.push({ path, viewId: view.id });
		}
		const changes = proposal.patch.map(patch => ({ collection: patch.collection, id: patch.id, before: patch.before === null ? null : JSON.parse(patch.before), after: patch.collection === 'views' ? candidate.views.find(view => view.id === patch.id) ?? null : patch.value }));
		const review = { ...(session.workflow === 'project' ? { plan: session.plan ?? null, tasks: session.tasks, proposalIds: projectDrafts(session.proposals).map(proposal => proposal.id) } : {}), proposalId: proposal.id, baseSemanticRevision: proposal.baseSemanticRevision, readSet: proposal.readSet, queryIds: proposal.queryIds, changes, sourceAnchors: proposal.readEvidenceIds.map(id => session.evidence.find(entry => entry.id === id)), diagnostics: proposal.diagnostics, views: selectedViews.map(view => ({ view, quality: inspectDiagramQuality(candidate, view) })), images };
		if (Buffer.byteLength(JSON.stringify(review)) > (session.workflow === 'project' ? 8 : 1) * 1024 * 1024) { throw new Error('reviewArtifactLimit'); }
		const reviewFile = join(await managed(state.sourceRoot, 'exploration'), 'review-' + contentHash(canonicalJson(review)) + '.json');
		await atomicJson(reviewFile, review);
		return { proposalId: proposal.id, reviewFile, diff: explorationPage(changes, proposal.fingerprint, { proposalId: proposal.id }, input.cursor, input.limit ?? 12), images, views: candidate.views.filter(view => proposal.patch.some(patch => patch.collection === 'views' && patch.id === view.id)).map(view => ({ view, readiness: explorationReadiness(candidate, view.id), quality: inspectDiagramQuality(candidate, view), ...(view.kind === 'activity' && view.interactionId ? { projection: projectDescriptiveActivity(candidate, view.interactionId) } : {}), geometry: view.nodes.map(node => ({ ...node, ...notationNodeSize(candidate.semantics.elements.find(entry => entry.id === node.elementId)!) })) })), evidence: proposal.readEvidenceIds.map(id => session.evidence.find(entry => entry.id === id)), diagnostics: proposal.diagnostics };
}
