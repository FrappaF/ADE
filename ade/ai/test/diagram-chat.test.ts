/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../scripts/source-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, stat } from 'node:fs/promises';
const { runDiagramChat } = await import('../diagramChat.ts');

const config = { version: 1, provider: 'codex', connection: 'cli', executable: 'codex', model: 'test-model', timeoutMs: 300000, maxContextBytes: 262144, maxCalls: 1 };

test('headless conversations are ephemeral, tool-scoped, cancellable and clean up their response artifact', async () => {
	const controller = new AbortController();
	let responsePath = '';
	const messages = [{ role: 'user' as const, text: 'Generate the diagrams' }];
	const result = await runDiagramChat('/project', config, messages, { command: 'node', args: ['/ADE/adeDiagramMcp.js', '/project', 'session'] }, controller.signal, async (executable, args, cwd, options) => {
		responsePath = args[args.indexOf('--output-last-message') + 1];
		assert.deepEqual([executable, cwd, options?.signal, args.includes('--ephemeral'), args.includes('mcp_servers={}'), args.includes('shell_tool'), args.includes('read-only'), args.includes('mcp_servers.ade.command="node"')], ['codex', '/project', controller.signal, true, true, true, true, true]);
		assert.match(options!.input!, /Generate the diagrams/);
		await writeFile(responsePath, 'Drafts prepared');
		return { code: 0, stdout: '{"type":"turn.completed"}\n', stderr: '' };
	});
	assert.deepEqual(result, { text: 'Drafts prepared' });
	await assert.rejects(stat(responsePath), { code: 'ENOENT' });
});

test('a failed or unfinished CLI turn never looks successful or exposes raw provider stderr', async () => {
	for (const result of [{ code: 1, stdout: '', stderr: 'private-provider-data' }, { code: 0, stdout: '{"type":"turn.failed"}', stderr: 'private-provider-data' }]) {
		await assert.rejects(runDiagramChat('/project', config, [{ role: 'user', text: 'Generate diagrams' }], undefined, undefined, async () => result), error => error instanceof Error && /assistant/i.test(error.message) && !error.message.includes('private-provider-data'));
	}
});

test('Claude conversations disable persistence and expose only the ADE server', async () => {
	const result = await runDiagramChat('/project', { ...config, provider: 'claude', executable: 'claude' }, [{ role: 'user', text: 'Explain the architecture' }], { command: 'node', args: ['adapter', '/project'] }, undefined, async (_executable, args) => {
		assert.deepEqual([args.includes('--no-session-persistence'), args.includes('--strict-mcp-config'), args.includes('mcp__ade__*'), JSON.parse(args[args.indexOf('--mcp-config') + 1])], [true, true, true, { mcpServers: { ade: { type: 'stdio', command: 'node', args: ['adapter', '/project'] } } }]);
		return { code: 0, stdout: '{"subtype":"success","result":"Ready"}', stderr: '' };
	});
	assert.deepEqual(result, { text: 'Ready' });
});

test('disabled requests or oversized conversations do not start a provider process', async () => {
	const runner = async () => { assert.fail('provider must not start'); };
	await assert.rejects(runDiagramChat('/project', { ...config, maxCalls: 0 }, [{ role: 'user', text: 'Generate' }], undefined, undefined, runner), /disabled/);
	await assert.rejects(runDiagramChat('/project', config, [{ role: 'user', text: 'x'.repeat(262144) }], undefined, undefined, runner), /context budget/);
});
