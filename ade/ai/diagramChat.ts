/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runProcess } from './process.ts';
import { readProviderConfig } from './contracts.ts';
import { readBoundedText } from './io.ts';
import { diagramSessionInstruction } from '../../src/vs/workbench/contrib/ade/common/diagramTools.ts';

/** Each call is ephemeral; the modal supplies its in-memory transcript and ADE supplies project tools. */
export async function runDiagramChat(root: string, configValue: object, messages: { role: 'user' | 'assistant'; text: string }[], mcp?: { command: string; args: string[] }, signal?: AbortSignal, runner = runProcess, durationMs?: number): Promise<{ text: string }> {
	const config = readProviderConfig(configValue);
	if (!config.maxCalls) { throw new Error('AI requests are disabled. Enable requests in AI Settings.'); }
	if (!messages.length || messages.length > 60 || messages.some(message => !['user', 'assistant'].includes(message.role) || typeof message.text !== 'string')) { throw new Error('Invalid assistant conversation'); }
	const prompt = (mcp ? diagramSessionInstruction : 'Help the user with this project and its ADE model. Read the current model before changing it. Preserve semantic IDs and valid model references. Only change files when the user asks for a change.') + '\nConversation:\n' + JSON.stringify(messages);
	if (Buffer.byteLength(prompt) > config.maxContextBytes) { throw new Error('This conversation exceeds the context budget. Close the assistant and open a new conversation; prepared diagrams are retained.'); }
	const directory = await mkdtemp(join(tmpdir(), 'ade-chat-'));
	try {
		const output = join(directory, 'response.txt');
		const args = config.provider === 'codex' ? ['exec', '--model', config.model, '--sandbox', mcp ? 'read-only' : 'workspace-write', '--skip-git-repo-check', '--ephemeral', ...[...(mcp ? ['shell_tool', 'unified_exec'] : []), 'apps', 'plugins', 'remote_plugin', 'multi_agent', 'hooks', 'skill_search', 'skill_mcp_dependency_install'].flatMap(feature => ['--disable', feature]), '-c', 'web_search="disabled"', '-c', 'approval_policy="never"', '-c', 'mcp_servers={}', ...(mcp ? ['-c', `mcp_servers.ade.command=${JSON.stringify(mcp.command)}`, '-c', `mcp_servers.ade.args=${JSON.stringify(mcp.args)}`] : []), '--json', '--output-last-message', output, '-']
			: ['-p', '--model', config.model, '--permission-mode', 'dontAsk', '--tools', mcp ? '' : 'Read,Edit,Write,Bash,Glob,Grep', '--strict-mcp-config', '--mcp-config', JSON.stringify({ mcpServers: mcp ? { ade: { type: 'stdio', ...mcp } } : {} }), '--allowedTools', mcp ? 'mcp__ade__*' : 'Read,Edit,Write,Bash,Glob,Grep', '--setting-sources', '', '--no-session-persistence', '--output-format', 'json'];
		const result = await runner(config.executable, args, root, { input: prompt, signal, timeoutMs: Math.min(durationMs ?? config.timeoutMs, 5400000), maxBytes: 32 * 1024 * 1024, gracefulShutdownMs: 2000 });
		if (result.code !== 0) { throw new Error(`The assistant stopped (exit ${result.code}). Check the account and selected model in AI Settings. Prepared drafts are retained.`); }
		if (config.provider === 'codex') {
			const events: { type?: string }[] = result.stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
			if (events.some(event => event.type === 'turn.failed' || event.type === 'error') || !events.some(event => event.type === 'turn.completed')) { throw new Error('The assistant did not complete its response. Prepared drafts are retained.'); }
			return { text: await readBoundedText(output, 2 * 1024 * 1024) };
		}
		const response: { result?: string; is_error?: boolean; subtype?: string } = JSON.parse(result.stdout);
		if (response.is_error || response.subtype !== 'success' || typeof response.result !== 'string') { throw new Error('The assistant did not complete its response. Prepared drafts are retained.'); }
		return { text: response.result };
	} finally { await rm(directory, { recursive: true, force: true }); }
}
