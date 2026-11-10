/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../scripts/source-loader.mjs';
import { randomUUID } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
const { active } = await import('../runtime/projectStore.ts');
const { executeDiagramExploration } = await import('./diagramSession.ts');
const { diagramToolDefinitions, diagramSessionInstruction } = await import('../../src/vs/workbench/contrib/ade/common/diagramTools.ts');

/** One stdio process is pinned to one project; no project switching, model token or global config. */
export async function createDiagramMcpServer(root, sessionId, options = {}) {
	root = await realpath(root);
	const pointer = await active(root);
	if (!pointer) { throw new Error('Import this project in ADE before starting its MCP server.'); }
	const snapshot = join(root, '.ade', 'imports', pointer);
	const opened = await executeDiagramExploration(snapshot, { action: 'open', ...(sessionId ? { sessionId } : { workflow: 'project' }), ...options });
	sessionId = opened.sessionId;
	const instance = randomUUID();
	const server = new Server({ name: 'ade-diagrams', version: '2.0.0' }, { capabilities: { tools: {} }, instructions: diagramSessionInstruction });
	server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: diagramToolDefinitions.map(tool => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema, annotations: { readOnlyHint: tool.readOnly, destructiveHint: false, idempotentHint: tool.readOnly, openWorldHint: false } })) }));
	server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
		const result = await executeDiagramExploration(snapshot, { action: 'tool', sessionId, tool: request.params.name, arguments: request.params.arguments ?? {}, callId: `${instance}:${extra.requestId}` }, extra.signal);
		return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result, isError: result.diagnostics.length > 0 };
	});
	return { server, sessionId };
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
	const [root, sessionId] = process.argv.slice(2);
	if (!root) { throw new Error('Usage: node ade/ai/diagram-mcp.mjs PROJECT_ROOT [SESSION_ID]'); }
	const { server } = await createDiagramMcpServer(root, sessionId);
	const shutdown = () => { void server.close(); };
	process.once('SIGTERM', shutdown); process.once('SIGINT', shutdown);
	server.onclose = () => { process.removeListener('SIGTERM', shutdown); process.removeListener('SIGINT', shutdown); };
	await server.connect(new StdioServerTransport());
}
