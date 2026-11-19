/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../scripts/source-loader.mjs';
import assert from 'node:assert/strict';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import type { StdioClientTransport as McpTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { CodeAiProgress, CodeDiagramCheckpointResult } from '../../../src/vs/workbench/contrib/ade/common/codeBridge.ts';
import type { DiagramExplorationResult, ExplorationRequest } from '../diagramSession.ts';

const { createCodeEngine } = await import('../../runtime/nativeHost.ts');
const { executeDiagramExploration, readExplorationSession } = await import('../diagramSession.ts');

interface FakeTask {
	id: string;
	intent: string;
	proposalId: string;
	commands?: object[];
	evidenceIds?: string[];
	readObjectIds?: string[];
	resume?: boolean;
	stall?: boolean;
}

type ToolResult<Data> = Omit<DiagramExplorationResult, 'data'> & { data: Data };

/** Body of the temporary CLI. Its only project interaction goes through the production MCP child. */
async function fakeProvider(Client: typeof McpClient, StdioClientTransport: typeof McpTransport) {
	let input = '';
	for await (const chunk of process.stdin) { input += chunk; }
	const requestMarker = '\nTask request:\n';
	const task: FakeTask = JSON.parse(JSON.parse(input.slice(input.lastIndexOf(requestMarker) + requestMarker.length))[0].text);
	const setting = (key: string) => JSON.parse(process.argv.find(arg => arg.startsWith(`mcp_servers.ade.${key}=`))!.split('=').slice(1).join('='));
	const output = process.argv[process.argv.indexOf('--output-last-message') + 1];
	const emit = (event: object) => process.stdout.write(JSON.stringify(event) + '\n');
	emit({ type: 'turn.started' });
	const client = new Client({ name: 'mercato-timeout-fixture', version: '1' });
	await client.connect(new StdioClientTransport({ command: setting('command'), args: setting('args') }));
	try {
		const call = async <Data>(name: string, arguments_ = {}) => {
			const result = (await client.callTool({ name, arguments: arguments_ })).structuredContent as ToolResult<Data>;
			assert.deepEqual(result.diagnostics, [], name);
			emit({ type: 'item.completed', item: { type: 'mcp_tool_call', tool: name } });
			return result;
		};
		const inspected = await call<{ exploration: { nextTaskId: string; task: { proposalId?: string; previewedProposalId?: string } } }>('ade_project_inspect');
		assert.equal(inspected.data.exploration.nextTaskId, task.id);
		const update = (status: 'running' | 'ready') => call<{ checkpointComplete?: boolean }>('ade_task_update', { id: task.id, intent: task.intent, status, gaps: [], ...(status === 'ready' ? { proposalId: task.proposalId } : {}) });
		if (task.resume) {
			assert.deepEqual([inspected.data.exploration.task.proposalId, inspected.data.exploration.task.previewedProposalId], [task.proposalId, task.proposalId]);
		} else {
			const running = await update('running');
			const candidate = await call<{ status: string }>('ade_model_propose', {
				taskId: task.id, proposalId: task.proposalId, baseSemanticRevision: running.semanticRevision,
				commands: task.commands, readEvidenceIds: task.evidenceIds, readObjectIds: task.readObjectIds, queryIds: [],
			});
			assert.equal(candidate.data.status, 'ready');
			await call('ade_view_preview', { proposalId: task.proposalId });
		}
		if (task.stall) {
			// Leave a preview and its proposal checkpoint on disk, then stop emitting output.
			await new Promise(resolve => setTimeout(resolve, 15_000));
			throw new Error('Expected the provider process deadline to be enforced');
		}
		assert.equal((await update('ready')).data.checkpointComplete, true);
		await writeFile(output, 'Checkpoint completed.');
		emit({ type: 'turn.completed' });
	} finally { await client.close(); }
}

test('Mercato overview resumes its saved preview after a provider deadline', { timeout: 30_000, skip: process.platform === 'win32' }, async t => {
	const directory = await mkdtemp(join(tmpdir(), 'ade-mercato-timeout-'));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const root = join(directory, 'mercato'), executable = join(directory, 'fake-codex.mjs');
	await cp(new URL('../../examples/guida/08-mercato-codebase/', import.meta.url), root, { recursive: true });
	await writeFile(executable, [
		'#!/usr/bin/env node',
		`import assert from 'node:assert/strict';`,
		`import { writeFile } from 'node:fs/promises';`,
		`import { Client } from ${JSON.stringify(import.meta.resolve('@modelcontextprotocol/sdk/client/index.js'))};`,
		`import { StdioClientTransport } from ${JSON.stringify(import.meta.resolve('@modelcontextprotocol/sdk/client/stdio.js'))};`,
		`await (${fakeProvider.toString()})(Client, StdioClientTransport);\n`,
	].join('\n'), { mode: 0o700 });
	const engine = createCodeEngine();
	const { snapshot } = JSON.parse(await engine.execute(JSON.stringify({ operation: 'import', root })));
	const { sessionId } = await executeDiagramExploration(snapshot, { action: 'open', workflow: 'project', featureWorkflow: true });
	const call = <Data>(action: ExplorationRequest['action'], arguments_: Partial<ExplorationRequest> = {}) => executeDiagramExploration(snapshot, { action, sessionId, ...arguments_ }) as Promise<ToolResult<Data>>;
	const tool = async <Data>(name: string, arguments_: object) => {
		const result = await call<Data>('tool', { tool: name, arguments: arguments_ });
		assert.deepEqual(result.diagnostics, [], name);
		return result.data;
	};
	const anchor = async (name: string, filePrefix: string) => {
		const { page } = await tool<{ page: { items: { name: string; evidence: { id: string } }[] } }>('ade_source_search', { mode: 'symbol', query: name, filePrefix, role: 'runtime' });
		return page.items.find(item => item.name === name)!.evidence.id;
	};
	const server = await anchor('createMercatoServer', 'src/server.mjs');
	const orders = await anchor('createOrderStore', 'src/orders.mjs');
	const purchase = { id: 'acquisto', name: 'Acquisto', description: 'Conferma un ordine approvato', evidenceIds: [await anchor('checkout', 'src/checkout.mjs')], dependsOn: [] };
	const returns = { id: 'resi', name: 'Resi', description: 'Registra il reso di un ordine esistente', evidenceIds: [await anchor('returnOrder', 'src/returns.mjs')], dependsOn: [purchase.id] };
	await tool('ade_feature_catalog', { features: [purchase, returns] });
	const overview = { id: 'system-overview', name: 'Mercato · Panoramica', viewKind: 'structure', intent: 'Mostrare il server e l’archivio ordini condiviso', rationale: 'Rendere esplicita la composizione del sistema locale', dependsOn: [] };
	await tool('ade_diagram_plan', { items: [overview] });
	const show = (plan: Pick<typeof overview, 'name' | 'intent' | 'viewKind'>, elementIds: string[], relationIds: string[], featureId?: string) => ({ kind: 'view', ref: '@view', name: plan.name, viewKind: plan.viewKind, intent: plan.intent, elementIds, relationIds, ...(featureId ? { featureId } : {}) });
	const element = (ref: string, kind: string, name: string, evidence: string) => ({ kind: 'element', ref, element: { kind, name }, evidenceIds: [evidence] });
	const relation = (ref: string, kind: string, from: string, to: string, name: string, evidence: string) => ({ kind: 'relation', ref, relation: { kind, from, to, name }, evidenceIds: [evidence] });
	const overviewTask = {
		id: overview.id, intent: overview.intent, proposalId: 'mercato-overview', evidenceIds: [server, orders], readObjectIds: [],
		commands: [element('@server', 'component', 'Server HTTP', server), element('@orders', 'resource', 'Archivio ordini', orders),
			relation('@storage', 'dependency', '@server', '@orders', 'Condivide l’archivio', server), show(overview, ['@server', '@orders'], ['@storage'])],
	};
	const progress: CodeAiProgress[] = [];
	const checkpointLimitMs = 300_000;
	const run = async (requestId: string, task: FakeTask, onProgress?: (event: CodeAiProgress) => void, signal?: AbortSignal): Promise<CodeDiagramCheckpointResult> => JSON.parse(await engine.execute(JSON.stringify({
		operation: 'diagramChat', checkpoint: true, root, snapshot, sessionId, requestId,
		config: JSON.stringify({ version: 1, provider: 'codex', connection: 'cli', executable, model: 'fixture-local', timeoutMs: checkpointLimitMs, maxContextBytes: 262144, maxCalls: 1 }),
		messages: [{ role: 'user', text: JSON.stringify(task) }],
	}), signal, event => { progress.push(event); onProgress?.(event); }));
	const previewed = Promise.withResolvers<void>();
	const safetyDeadline = AbortSignal.timeout(15_000);
	let interrupted: CodeDiagramCheckpointResult;
	t.mock.timers.enable({ apis: ['setTimeout'] });
	try {
		const stalled = run('system-stalled', { ...overviewTask, stall: true }, event => {
			// Give the last tool output a later idle deadline while keeping the fixed total deadline.
			if (event.kind === 'thinking') { t.mock.timers.tick(1); }
			if (event.kind === 'tool' && event.tool === 'ade_view_preview') { previewed.resolve(); }
		}, safetyDeadline);
		await Promise.race([previewed.promise, stalled.then(() => assert.fail('Expected an overview preview before the provider deadline'))]);
		t.mock.timers.tick(checkpointLimitMs - 1);
		interrupted = await stalled;
	} finally { t.mock.timers.reset(); }
	const saved = await readExplorationSession(root, sessionId);
	const orderId = saved.proposals[0]?.aliases['@orders'];
	assert.ok(orderId);
	assert.deepEqual([
		interrupted.timeout,
		progress.filter(event => event.requestId === 'system-stalled' && event.kind === 'tool').map(event => event.tool),
		saved.tasks.map(task => [task.id, task.status, task.proposalId, task.previewedProposalId]),
	], [
		'deadline',
		['ade_project_inspect', 'ade_task_update', 'ade_model_propose', 'ade_view_preview'],
		[[overview.id, 'running', overviewTask.proposalId, overviewTask.proposalId]],
	]);
	const resumed = await run('system-resumed', { id: overview.id, intent: overview.intent, proposalId: overviewTask.proposalId, resume: true });
	const resumedState = await call<{ phase: string; nextFeatureId: string }>('status');
	assert.deepEqual([
		resumed.text, resumedState.data.phase, resumedState.data.nextFeatureId,
		progress.filter(event => event.requestId === 'system-resumed' && event.kind === 'tool').map(event => event.tool),
	], ['Checkpoint completed.', 'planning', purchase.id, ['ade_project_inspect', 'ade_task_update']]);
	for (const [feature, kind, accessName] of [[purchase, 'write', 'Salva ordine'], [returns, 'read', 'Legge ordine']] as const) {
		const plan = { id: `${feature.id}-structure`, name: `Struttura ${feature.name}`, viewKind: 'structure', intent: feature.description, rationale: 'Mostrare l’accesso all’archivio condiviso', dependsOn: [overview.id] };
		await tool('ade_diagram_plan', { featureId: feature.id, items: [plan] });
		const [evidence] = feature.evidenceIds;
		const { candidates } = await tool<{ candidates: { id: string }[] }>('ade_model_query', { collection: 'elements', match: { kind: 'resource', name: 'Archivio ordini', evidenceIds: [orders] } });
		assert.deepEqual(candidates.map(candidate => candidate.id), [orderId]);
		const completed = await run(`${feature.id}-ready`, {
			id: plan.id, intent: plan.intent, proposalId: `${feature.id}-proposal`, evidenceIds: [evidence, orders], readObjectIds: [orderId], commands: [
				element('@feature', 'feature', feature.name, evidence), element('@action', 'action', feature.description, evidence),
				relation('@access', kind, '@action', orderId, accessName, evidence), show(plan, ['@action', orderId], ['@access'], '@feature'),
			],
		});
		assert.equal(completed.text, 'Checkpoint completed.');
	}
	const review = await call<{ proposal: { status: string; views: { name: string; nodes: { elementId: string }[] }[] } }>('review');
	assert.deepEqual([
		review.data.proposal.status,
		review.data.proposal.views.map(view => [view.name, view.nodes.filter(node => node.elementId === orderId).length]),
		(await readExplorationSession(root, sessionId)).proposals.map(proposal => proposal.id),
	], ['ready', [[overview.name, 1], ['Struttura Acquisto', 1], ['Struttura Resi', 1]], [overviewTask.proposalId, 'acquisto-proposal', 'resi-proposal']]);
});
