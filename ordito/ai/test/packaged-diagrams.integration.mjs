import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('packaged MCP generates feature diagrams in order and reuses staged identities', { timeout: 30000 }, async t => {
	const { engine } = await import('../../../out/vs/workbench/contrib/ordito/node/orditoCodeEngine.js');
	const root = await mkdtemp(join(tmpdir(), 'ordito packaged diagrams '));
	const client = new Client({ name: 'ordito-packaged-test', version: '1' });
	t.after(async () => { await client.close(); await rm(root, { recursive: true, force: true }); });
	const source = 'export function checkout(total) { return total > 0; }\nexport function refund(total) { return total > 0; }\n';
	await writeFile(join(root, 'checkout.mjs'), source);
	const call = async request => JSON.parse(await engine.execute(JSON.stringify(request)));
	const context = await call({ operation: 'import', root, syntaxOnly: true });
	const publishedModel = await readFile(context.model, 'utf8');
	const opened = await call({ operation: 'exploration', snapshot: context.snapshot, request: JSON.stringify({ action: 'open', workflow: 'project', featureWorkflow: true }) });
	const { mcp } = opened.data;
	await access(mcp.args[0]);
	const transport = new StdioClientTransport({ command: mcp.command, args: mcp.args, stderr: 'pipe' });
	let stderr = '';
	transport.stderr?.on('data', chunk => { stderr += chunk; });
	try { await client.connect(transport); } catch (error) { throw new Error(`Packaged MCP startup failed: ${stderr}`, { cause: error }); }
	assert.ok((await client.listTools()).tools.some(tool => tool.name === 'ordito_feature_catalog'));
	const tool = async (name, args) => {
		const response = await client.callTool({ name, arguments: args });
		assert.deepEqual(response.structuredContent.diagnostics, []);
		return response.structuredContent;
	};
	const inventory = await tool('ordito_project_inspect', {});
	const file = inventory.data.files.items.find(file => file.path === 'checkout.mjs');
	const read = await tool('ordito_source_read', { file: file.path, revision: file.revision });
	assert.equal(read.data.text, source);
	const evidenceId = read.data.evidence.id;
	await tool('ordito_feature_catalog', { features: [
		{ id: 'checkout', name: 'Checkout', description: 'Place an order', evidenceIds: [evidenceId], dependsOn: [] },
		{ id: 'refund', name: 'Refund', description: 'Refund an order', evidenceIds: [evidenceId], dependsOn: ['checkout'] }
	] });
	await tool('ordito_diagram_plan', { items: [], gaps: ['The feature views cover this small codebase.'] });
	const planFor = (featureId, name) => ({ featureId, items: [{ id: `${featureId}-structure`, featureId, name: `${name} Structure`, viewKind: 'structure', intent: `${name} responsibility`, rationale: `Understand the ${featureId} entrypoint`, dependsOn: [] }] });
	const outOfOrder = await client.callTool({ name: 'ordito_diagram_plan', arguments: planFor('refund', 'Refund') });
	assert.equal(outOfOrder.isError, true);
	let storeId;
	for (const [featureId, name] of [['checkout', 'Checkout'], ['refund', 'Refund']]) {
		const plan = planFor(featureId, name), { id: taskId, intent } = plan.items[0];
		await tool('ordito_diagram_plan', plan);
		await tool('ordito_task_update', { id: taskId, intent, status: 'running', gaps: [] });
		const lookup = await tool('ordito_model_query', { collection: 'elements', match: { name: 'Orders', kind: 'resource' } });
		assert.equal(lookup.data.status, storeId ? 'matched' : 'none');
		if (storeId) { assert.equal(lookup.data.candidates[0].id, storeId); }
		const proposalId = randomUUID();
		const proposal = await tool('ordito_model_propose', {
			proposalId, taskId, baseSemanticRevision: lookup.semanticRevision, readEvidenceIds: [evidenceId], readObjectIds: storeId ? [storeId] : [], queryIds: [], commands: [
				{ kind: 'element', ref: '@feature', element: { kind: 'feature', name }, evidenceIds: [evidenceId] },
				...(storeId ? [] : [{ kind: 'element', ref: '@orders', element: { kind: 'resource', name: 'Orders' }, evidenceIds: [evidenceId] }]),
				{ kind: 'view', ref: '@view', name: `${name} Structure`, viewKind: 'structure', intent, featureId: '@feature', elementIds: [storeId ?? '@orders'], relationIds: [] }
			]
		});
		assert.equal(proposal.data.status, 'ready');
		storeId ??= proposal.data.aliases['@orders'];
		const preview = await tool('ordito_view_preview', { proposalId });
		assert.equal(preview.data.views[0].readiness.reviewable, true);
		assert.match(await readFile(preview.data.images[0].path, 'utf8'), /<svg/);
		await tool('ordito_task_update', { id: taskId, intent, status: 'ready', gaps: [], proposalId });
	}
	assert.equal(await readFile(join(root, 'checkout.mjs'), 'utf8'), source);
	assert.equal(await readFile(context.model, 'utf8'), publishedModel);
	const id = { sessionId: opened.sessionId };
	const { data: { phase, usage: { toolCalls, readBytes } } } = await call({ operation: 'exploration', snapshot: context.snapshot, request: JSON.stringify({ action: 'status', ...id }) });
	assert.equal(phase, 'audit');
	const auditor = new Client({ name: 'ordito-packaged-auditor', version: '1' });
	t.after(() => auditor.close());
	const invocation = { checkpoint: { phase, toolCalls, readBytes }, turnId: 'packaged-audit' };
	await auditor.connect(new StdioClientTransport({ command: mcp.command, args: [...mcp.args, JSON.stringify(invocation)] }));
	assert.ok((await auditor.listTools()).tools.some(tool => tool.name === 'ordito_audit_submit'));
	const audit = async (name, args = {}) => {
		const response = await auditor.callTool({ name, arguments: args });
		assert.deepEqual(response.structuredContent.diagnostics, [], name);
		return response.structuredContent.data;
	};
	const inspect = async (name, args = {}) => {
		let cursor;
		do {
			({ objects: { nextCursor: cursor } } = await audit(name, { ...args, ...(cursor ? { cursor } : {}) }));
		} while (cursor);
	};
	const audited = await audit('ordito_audit_inventory');
	for (const { id: viewId } of audited.views) { await inspect('ordito_audit_diagram', { viewId }); }
	await audit('ordito_source_read', { file: file.path, revision: file.revision });
	await inspect('ordito_audit_reuse');
	await audit('ordito_audit_submit', { summary: 'Verified the shared orders store in the checkout and refund views.', findings: [] });
	const review = await call({ operation: 'exploration', snapshot: context.snapshot, request: JSON.stringify({ action: 'review', sessionId: opened.sessionId }) });
	assert.deepEqual([review.data.proposal.status, review.data.images.length, review.data.plan.items.length], ['ready', 2, 2]);
	assert.ok(review.data.proposal.views.every(view => view.nodes.some(node => node.elementId === storeId)));
});
