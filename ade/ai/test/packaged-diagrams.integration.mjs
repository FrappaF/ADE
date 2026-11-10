/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('packaged engine starts its advertised MCP server and produces a reviewable diagram draft', { timeout: 30000 }, async t => {
	const { engine } = await import('../../../out/vs/workbench/contrib/ade/node/adeCodeEngine.js');
	const root = await mkdtemp(join(tmpdir(), 'ade packaged diagrams '));
	const client = new Client({ name: 'ade-packaged-test', version: '1' });
	t.after(async () => { await client.close(); await rm(root, { recursive: true, force: true }); });
	const source = 'export function checkout(total) { return total > 0; }\n';
	await writeFile(join(root, 'checkout.mjs'), source);
	const call = async request => JSON.parse(await engine.execute(JSON.stringify(request)));
	const context = await call({ operation: 'import', root, syntaxOnly: true });
	const publishedModel = await readFile(context.model, 'utf8');
	const opened = await call({ operation: 'exploration', snapshot: context.snapshot, request: JSON.stringify({ action: 'open', workflow: 'project' }) });
	const { mcp } = opened.data;
	await access(mcp.args[0]);
	const transport = new StdioClientTransport({ command: mcp.command, args: mcp.args, stderr: 'pipe' });
	let stderr = '';
	transport.stderr?.on('data', chunk => { stderr += chunk; });
	try { await client.connect(transport); } catch (error) { throw new Error(`Packaged MCP startup failed: ${stderr}`, { cause: error }); }
	assert.equal((await client.listTools()).tools.length, 9);
	const tool = async (name, args) => {
		const response = await client.callTool({ name, arguments: args });
		assert.deepEqual(response.structuredContent.diagnostics, []);
		return response.structuredContent;
	};
	const inventory = await tool('ade_project_inspect', {});
	const file = inventory.data.files.items.find(file => file.path === 'checkout.mjs');
	const read = await tool('ade_source_read', { file: file.path, revision: file.revision });
	assert.equal(read.data.text, source);
	await tool('ade_diagram_plan', { items: [{ id: 'overview', name: 'Checkout Overview', viewKind: 'structure', intent: 'Checkout responsibility', rationale: 'Understand the checkout entrypoint', dependsOn: [] }] });
	await tool('ade_task_update', { id: 'overview', intent: 'Checkout responsibility', status: 'running', gaps: [] });
	const proposalId = randomUUID(), evidenceId = read.data.evidence.id;
	const proposal = await tool('ade_model_propose', {
		proposalId, baseSemanticRevision: read.semanticRevision, readEvidenceIds: [evidenceId], readObjectIds: [], queryIds: [], commands: [
			{ kind: 'element', ref: '@checkout', element: { kind: 'component', name: 'Checkout' }, evidenceIds: [evidenceId] },
			{ kind: 'view', ref: '@overview', name: 'Checkout Overview', viewKind: 'structure', intent: 'Checkout responsibility', elementIds: ['@checkout'], relationIds: [] }
		]
	});
	assert.equal(proposal.data.status, 'ready');
	await tool('ade_task_update', { id: 'overview', intent: 'Checkout responsibility', status: 'ready', gaps: [], proposalId });
	const preview = await tool('ade_view_preview', { proposalId });
	assert.equal(preview.data.views[0].readiness.reviewable, true);
	assert.match(await readFile(preview.data.images[0].path, 'utf8'), /<svg/);
	assert.equal(await readFile(join(root, 'checkout.mjs'), 'utf8'), source);
	assert.equal(await readFile(context.model, 'utf8'), publishedModel);
	const review = await call({ operation: 'exploration', snapshot: context.snapshot, request: JSON.stringify({ action: 'review', sessionId: opened.sessionId }) });
	assert.deepEqual([review.data.proposal.status, review.data.images.length, review.data.plan.items.length], ['ready', 1, 1]);
});
