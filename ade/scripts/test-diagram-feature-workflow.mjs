/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { diagramFeatureChecks, mercatoClaimRubric, mercatoDiagramChecks } from './diagram-feature-rubric.mjs';

const { createCodeEngine } = await import('../runtime/nativeHost.ts');
const { executeDiagramExploration, readExplorationSession } = await import('../ai/diagramSession.ts');
const { active } = await import('../runtime/projectStore.ts');
const { importCode } = await import('../code-import/importCode.ts');
const { readSnapshot } = await import('../code-import/snapshot.ts');

const implementationFiles = [
	'./test-diagram-exploration-live.mjs', './test-diagram-feature-workflow.mjs', './diagram-feature-rubric.mjs',
	'../runtime/nativeHost.ts', '../ai/diagramSession.ts', '../ai/diagramProject.ts', '../ai/diagramAudit.ts', '../ai/diagramCheckpoint.ts', '../ai/diagramChat.ts', '../ai/diagram-mcp.mjs', '../code-import/explorationIndex.ts',
	'../../src/vs/workbench/contrib/ade/common/diagramTools.ts', '../../src/vs/workbench/contrib/ade/common/diagramIdentity.ts',
	'../../src/vs/workbench/contrib/ade/common/modelProposals.ts', '../../src/vs/workbench/contrib/ade/common/diagramPreview.ts'
];
const sha256 = value => createHash('sha256').update(value).digest('hex');
const json = async (file, value) => writeFile(file, JSON.stringify(value, null, '\t') + '\n', { mode: 0o600 });
const checkpointOf = state => ({ phase: state.phase ?? null, featureId: state.nextFeatureId ?? null, taskId: state.nextTaskId ?? null, findingId: state.nextFindingId ?? null });

async function checkWorkspace(root, context, baseline, originalModel) {
	const id = 'workspace-preserved';
	try {
		const current = await importCode(root, baseline.projectId, { previous: baseline });
		const fileState = state => new Map(state.files.map(file => [file.file, `${file.status}:${file.revision ?? ''}`]));
		const beforeFiles = fileState(baseline), afterFiles = fileState(current);
		const changedFiles = [...new Set([...beforeFiles.keys(), ...afterFiles.keys()])].filter(file => beforeFiles.get(file) !== afterFiles.get(file));
		const unchangedModel = await active(root) === basename(context.snapshot) && sha256(await readFile(context.model)) === originalModel;
		return { id, passed: unchangedModel && !changedFiles.length, observed: { indexedFiles: baseline.files.length, changedFiles, unchangedModel } };
	} catch (error) {
		return { id, passed: false, observed: { error: error instanceof Error ? error.message : String(error) } };
	}
}

/** Drive the same independent provider checkpoints used by the desktop workflow. */
export async function runDiagramFeatureTrial(arguments_) {
	const [rootArgument, model, outputArgument, rubric] = arguments_;
	if (!rootArgument || !model || !outputArgument || rubric && rubric !== 'mercato' || arguments_.length > 4) { throw new Error('Usage: node ade/scripts/test-diagram-exploration-live.mjs --features ROOT EXPLICIT_MODEL OUTPUT_DIRECTORY [mercato]'); }
	const root = await realpath(rootArgument), output = resolve(outputArgument);
	const engine = createCodeEngine();
	const execute = async (request, progress, signal) => JSON.parse(await engine.execute(JSON.stringify(request), signal, progress));
	const pointer = await active(root);
	const context = pointer ? await execute({ operation: 'inspect', snapshot: join(root, '.ade', 'imports', pointer) }) : await execute({ operation: 'import', root });
	const baseline = (await readSnapshot(context.snapshot)).state;
	const originalModel = sha256(await readFile(context.model));
	const allowance = { maxToolCalls: 180, maxReadBytes: 2 * 1024 * 1024, maxModelTurns: 18, maxDurationMs: 900000 };
	const resumeSessionId = process.env.ADE_EXPLORATION_SESSION_ID;
	let opened = await executeDiagramExploration(context.snapshot, { action: 'open', workflow: 'project', featureWorkflow: true, model, budget: allowance, ...(resumeSessionId ? { sessionId: resumeSessionId } : {}) });
	const call = (action, signal, extra) => executeDiagramExploration(context.snapshot, { action, sessionId: opened.sessionId, ...extra }, signal);
	const initial = await readExplorationSession(root, opened.sessionId);
	if (!initial.featureWorkflow) { throw new Error('Use a new session or resume an existing feature-workflow session.'); }
	if (resumeSessionId) {
		opened = await call('budget', undefined, { budget: { ...allowance, maxToolCalls: initial.usage.toolCalls + allowance.maxToolCalls, maxReadBytes: initial.usage.readBytes + allowance.maxReadBytes, maxModelTurns: initial.usage.modelTurns.length + allowance.maxModelTurns } });
	}
	const config = { version: 1, provider: 'codex', connection: 'cli', executable: process.env.ADE_AI_EXECUTABLE || 'codex', model, timeoutMs: 120000, maxContextBytes: 128 * 1024, maxCalls: 1 };
	process.env.ADE_NODE_EXECUTABLE ??= process.execPath;
	const instruction = process.env.ADE_EXPLORATION_QUESTION || 'Discover the main user-visible capabilities implemented in this codebase and prepare the relevant source-grounded diagrams for each. Name real shared resources consistently. Make known gaps visible. Prepare the local project for review.';
	const kind = 'real-codex-feature-checkpoints';
	const implementation = Object.fromEntries(await Promise.all(implementationFiles.map(async file => [file, sha256(await readFile(new URL(file, import.meta.url)))])));
	await mkdir(output, { recursive: true, mode: 0o700 });
	await json(join(output, 'input.json'), { kind, model, root, sessionId: opened.sessionId, sourceRevision: opened.sourceRevision, rubric: rubric ?? null, instruction, implementation, allowance });
	const turns = [], started = Date.now(), deadline = AbortSignal.timeout(allowance.maxDurationMs);
	let error;
	try {
		for (let index = 0; index < allowance.maxModelTurns; index++) {
			const state = (await call('status', deadline)).data;
			if (state.phase === 'review') { break; }
			if (!state.phase || state.budgetStatus?.exhausted.length) { throw new Error('The feature checkpoint is unavailable or its saved budget is exhausted.'); }
			const checkpoint = checkpointOf(state), requestId = randomUUID(), before = await readExplorationSession(root, opened.sessionId), turnStarted = Date.now();
			console.log(JSON.stringify({ kind, sessionId: opened.sessionId, turn: index + 1, checkpoint }));
			let result, failure;
			try {
				result = await execute({ operation: 'diagramChat', checkpoint: true, root, snapshot: context.snapshot, sessionId: opened.sessionId, requestId, config: JSON.stringify(config), messages: [{ role: 'user', text: instruction }] }, undefined, deadline);
			} catch (caught) { failure = caught instanceof Error ? caught.message : String(caught); }
			const after = await readExplorationSession(root, opened.sessionId);
			const outputCheckpoint = checkpointOf((await call('status')).data);
			const calls = after.calls.slice(before.calls.length).map(({ tool, status, inputBytes, outputBytes, durationMs, diagnostics }) => ({ tool, status, inputBytes, outputBytes, durationMs, diagnostics: diagnostics ?? [] }));
			const turn = { index: index + 1, requestId, checkpoint, outputCheckpoint, durationMs: Date.now() - turnStarted, completed: !failure, calls, usage: result?.usage ?? null, error: failure ?? null };
			turns.push(turn);
			await json(join(output, `checkpoint-${String(index + 1).padStart(2, '0')}.json`), { ...turn, response: result?.text ?? null });
			if (failure) { throw new Error(failure); }
			if (JSON.stringify(checkpoint) === JSON.stringify(outputCheckpoint)) { throw new Error('The provider did not advance this checkpoint; drafts remain saved for an explicit retry.'); }
		}
	} catch (caught) { error = caught instanceof Error ? caught.message : String(caught); }
	let review, artifact, reviewError;
	try {
		review = await call('review');
		if (review.data.reviewFile) {
			artifact = JSON.parse(await readFile(review.data.reviewFile, 'utf8'));
			await json(join(output, 'review.json'), artifact);
			for (const [index, image] of artifact.images.entries()) { await writeFile(join(output, `preview-${index + 1}.svg`), await readFile(image.path), { mode: 0o600 }); }
		}
	} catch (caught) { reviewError = caught instanceof Error ? caught.message : String(caught); }
	const final = await readExplorationSession(root, opened.sessionId);
	const checks = [
		...diagramFeatureChecks(final, review),
		await checkWorkspace(root, context, baseline, originalModel),
		...(rubric === 'mercato' ? mercatoDiagramChecks(final, review, artifact) : [])
	];
	const passed = !error && !reviewError && checks.every(check => check.passed);
	const completedCheckpoints = turns.filter(turn => turn.completed).length;
	const report = {
		kind, model, sessionId: final.id, sourceRevision: opened.sourceRevision, durationMs: Date.now() - started, passed, status: passed ? 'passed' : error && !completedCheckpoints ? 'blocked' : 'failed', error: error ?? reviewError ?? null,
		attemptedCheckpoints: turns.length, completedCheckpoints, providerInferenceCount: null,
		usageSemantics: 'Checkpoint calls are product-level provider invocations. Local tool calls, retrieved bytes and any CLI usage are measured separately. Provider-internal inference count is unavailable.',
		localToolCalls: final.usage.toolCalls - initial.usage.toolCalls, retrievedBytes: final.usage.readBytes - initial.usage.readBytes,
		checks, ...(rubric === 'mercato' ? { humanClaimAudit: { status: 'pending', minimumSupportedFraction: 0.95, allowableCriticalErrors: 0, criteria: mercatoClaimRubric } } : {}),
		turns
	};
	await json(join(output, 'report.json'), report);
	console.log(JSON.stringify(report));
	if (!passed) { process.exitCode = 1; }
}
