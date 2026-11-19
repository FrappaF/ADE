/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProcessTimeoutError, runProcess } from './process.ts';
import { readProviderConfig } from './contracts.ts';
import { readBoundedText } from './io.ts';
import { diagramSessionInstruction } from '../../src/vs/workbench/contrib/ade/common/diagramTools.ts';
import { type CodeAiProgress } from '../../src/vs/workbench/contrib/ade/common/codeBridge.ts';
import { diagramCheckpointInstruction } from './diagramCheckpoint.ts';

/** Each call is ephemeral; the modal supplies its in-memory transcript and ADE supplies project tools. */
export async function runDiagramChat(root: string, configValue: object, messages: { role: 'user' | 'assistant'; text: string }[], mcp?: { command: string; args: string[] }, signal?: AbortSignal, runner = runProcess, durationMs?: number, progress?: (event: Omit<CodeAiProgress, 'requestId'>) => void, context?: object, checkpoint = false): Promise<{ text: string }> {
	const config = readProviderConfig(configValue);
	if (!config.maxCalls) { throw new Error('AI requests are disabled. Enable requests in AI Settings.'); }
	if (!messages.length || messages.length > 60 || messages.some(message => !['user', 'assistant'].includes(message.role) || typeof message.text !== 'string')) { throw new Error('Invalid assistant conversation'); }
	if (checkpoint && (!mcp || messages.length !== 1 || messages[0].role !== 'user')) { throw new Error('A diagram checkpoint requires one task request and ADE tools.'); }
	const prompt = (mcp ? diagramSessionInstruction : 'Help the user with this project and its ADE model. Read the current model before changing it. Preserve semantic IDs and valid model references. Only change files when the user asks for a change. For diagram-only requests, inspect relevant source and validate the ADE diagrams; do not run application test suites, linters or builds unless requested.') + (checkpoint ? '\n\n' + diagramCheckpointInstruction : '') + (context ? '\nSaved project state (resume this plan; repair its blockers):\n' + JSON.stringify(context) : '') + (checkpoint ? '\nTask request:\n' : '\nConversation:\n') + JSON.stringify(messages);
	if (Buffer.byteLength(prompt) > config.maxContextBytes) { throw new Error('This conversation exceeds the context budget. Close the assistant and open a new conversation; prepared diagrams are retained.'); }
	const directory = await mkdtemp(join(tmpdir(), 'ade-chat-'));
	try {
		progress?.({ kind: 'connecting' });
		let pending = '';
		const onOutput = (text: string, stream: 'stdout' | 'stderr') => {
			if (stream !== 'stdout' || !progress) { return; }
			pending += text;
			let end: number;
			while ((end = pending.indexOf('\n')) >= 0) {
				const line = pending.slice(0, end); pending = pending.slice(end + 1);
				let event: { type?: string; item?: { id?: string; type?: string; text?: string; tool?: string; name?: string }; message?: { id?: string; content?: { type: string; text?: string }[] } };
				try { event = JSON.parse(line); } catch { continue; }
				if (event?.type === 'error') { progress({ kind: 'waiting' }); }
				if (['thread.started', 'turn.started'].includes(event?.type ?? '')) { progress({ kind: 'thinking' }); }
				if (event?.item?.type === 'mcp_tool_call') { progress({ kind: 'tool', tool: event.item.tool ?? event.item.name }); }
				if (event?.item?.type === 'agent_message' && typeof event.item.text === 'string') { progress({ kind: 'message', itemId: event.item.id ?? 'response', text: event.item.text.slice(0, checkpoint ? 4096 : 65536) }); }
				if (event?.type === 'assistant' && event.message?.content) {
					const content = event.message.content.filter(item => item.type === 'text').map(item => item.text ?? '').join('\n');
					if (content) { progress({ kind: 'message', itemId: event.message.id ?? 'response', text: content.slice(0, checkpoint ? 4096 : 65536) }); }
				}
			}
		};
		const env = { ...process.env };
		delete env.NODE_OPTIONS; delete env.VSCODE_INSPECTOR_OPTIONS; delete env.ELECTRON_RUN_AS_NODE;
		const output = join(directory, 'response.txt');
		const args = config.provider === 'codex' ? ['exec', '--model', config.model, '--sandbox', mcp ? 'read-only' : 'workspace-write', '--skip-git-repo-check', '--ephemeral', ...[...(mcp ? ['shell_tool', 'unified_exec'] : []), 'apps', 'plugins', 'remote_plugin', 'multi_agent', 'hooks', 'skill_search', 'skill_mcp_dependency_install'].flatMap(feature => ['--disable', feature]), '-c', 'web_search="disabled"', '-c', 'approval_policy="never"', '-c', 'mcp_servers={}', ...(mcp ? ['-c', `mcp_servers.ade.command=${JSON.stringify(mcp.command)}`, '-c', `mcp_servers.ade.args=${JSON.stringify(mcp.args)}`, '-c', 'mcp_servers.ade.required=true', '-c', 'mcp_servers.ade.startup_timeout_sec=60'] : []), '--json', '--output-last-message', output, '-']
			: ['-p', '--model', config.model, '--permission-mode', 'dontAsk', '--tools', mcp ? '' : 'Read,Edit,Write,Bash,Glob,Grep', '--strict-mcp-config', '--mcp-config', JSON.stringify({ mcpServers: mcp ? { ade: { type: 'stdio', ...mcp } } : {} }), '--allowedTools', mcp ? 'mcp__ade__*' : 'Read,Edit,Write,Bash,Glob,Grep', '--setting-sources', '', '--no-session-persistence', '--output-format', 'json'];
		// Chat can involve many tool calls. The provider timeout bounds silence, not the entire active turn.
		let result: Awaited<ReturnType<typeof runProcess>>;
		try {
			result = await runner(config.executable, args, root, { input: prompt, signal, env, onOutput, startupTimeoutMs: 45000, idleTimeoutMs: config.timeoutMs, timeoutMs: Math.min(durationMs ?? 1800000, 5400000), maxBytes: 32 * 1024 * 1024, gracefulShutdownMs: 2000 });
		} catch (error) {
			if (!checkpoint && error instanceof ProcessTimeoutError && error.reason === 'deadline') { throw new Error('The assistant reached the time limit for this request. Completed drafts are retained. Send a follow-up to continue.'); }
			throw error;
		}
		if (result.code !== 0) {
			const failure = result.stderr + '\n' + result.stdout;
			if (/unauthorized|unauthenticated|not logged in|authentication.*(required|failed)|\b401\b/i.test(failure)) { throw new Error('The provider did not authorize this request. Refresh the CLI account in AI Settings and resume from the saved checkpoint.'); }
			if (/mcp.{0,100}(fail|error|timed out)|(fail|error).{0,100}mcp|registerHooks|ERR_MODULE_NOT_FOUND/is.test(failure)) { throw new Error('The ADE project tools could not start. Rebuild ADE and start it with Node 24.22.1, then retry. Prepared drafts are retained.'); }
			if (/rate.?limit|quota|\b429\b/i.test(failure)) { throw new Error('The assistant reached the provider quota or rate limit. Check the account limits and retry later. Prepared drafts are retained.'); }
			throw new Error(`The assistant stopped (exit ${result.code}). Check the account and selected model in AI Settings. Prepared drafts are retained.`);
		}
		if (config.provider === 'codex') {
			const events: { type?: string }[] = result.stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
			if (events.some(event => event.type === 'turn.failed') || !events.some(event => event.type === 'turn.completed')) { throw new Error('The assistant did not complete its response. Prepared drafts are retained.'); }
			const text = await readBoundedText(output, 2 * 1024 * 1024);
			return { text: checkpoint ? text.slice(0, 4096) : text };
		}
		const response: { result?: string; is_error?: boolean; subtype?: string } = JSON.parse(result.stdout);
		if (response.is_error || response.subtype !== 'success' || typeof response.result !== 'string') { throw new Error('The assistant did not complete its response. Prepared drafts are retained.'); }
		return { text: checkpoint ? response.result.slice(0, 4096) : response.result };
	} finally { await rm(directory, { recursive: true, force: true }); }
}
