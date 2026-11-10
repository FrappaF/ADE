/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../scripts/source-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
const { executeDiagramExploration, readExplorationSession } = await import('../diagramSession.ts');
const { createCodeEngine } = await import('../../runtime/nativeHost.ts');
const { active, managed, atomicJson } = await import('../../runtime/projectStore.ts');
const { readSnapshot } = await import('../../code-import/snapshot.ts');
const { migrateSemanticModelToV5 } = await import('../../../src/vs/workbench/contrib/ade/common/modelMigration.ts');
const { emptyFoundation, validateSemanticModel, scenarioLayers } = await import('../../../src/vs/workbench/contrib/ade/common/semanticModel.ts');
const { diagramModelRevision, proposeDiagramModel, applyDiagramProposal } = await import('../../../src/vs/workbench/contrib/ade/common/modelProposals.ts');
const { renderDiagramPreview, inspectDiagramQuality } = await import('../../../src/vs/workbench/contrib/ade/common/diagramPreview.ts');
const { contentHash } = await import('../../runtime/sourceChanges.ts');
const { createDiagramMcpServer } = await import('../diagram-mcp.mjs');
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const source = `export function uploadChartPackage(storage, chart, limits) {\n  return PutWithLimit(storage, chart, limits);\n}\nexport function PutWithLimit(storage, chart, limits) {\n  if (limits == null) { return storage.PutObject(chart); }\n  return storage.PutObjectWithRetention(chart, limits);\n}\nexport function indexHandler(storage) { return storage.GetIndex(); }\nexport function objectHandler(storage) { return storage.GetObject(); }\n`;
async function fixture(t, files = { 'src/server.mjs': source, 'README.md': '# Upload service\nStorage can use Redis optionally.\n' }, syntaxOnly = true) {
	const root = await mkdtemp(join(tmpdir(), 'ade-exploration-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	for (const [file, content] of Object.entries(files)) { await mkdir(join(root, file, '..'), { recursive: true }); await writeFile(join(root, file), content); }
	const engine = createCodeEngine(), context = JSON.parse(await engine.execute(JSON.stringify({ operation: 'import', root, syntaxOnly })));
	const opened = await executeDiagramExploration(context.snapshot, { action: 'open', model: 'test-no-inference' });
	const tool = (name, args, extra = {}) => executeDiagramExploration(context.snapshot, { action: 'tool', sessionId: opened.sessionId, tool: name, arguments: args, ...extra });
	return { root, engine, context, opened, tool };
}
async function readSource(f) {
	const inspected = await f.tool('ade_project_inspect', {}), file = inspected.data.files.items.find(file => file.path === 'src/server.mjs');
	const read = await f.tool('ade_source_read', { file: file.path, revision: file.revision });
	assert.deepEqual(read.diagnostics, []);
	return read;
}
const proposalRequest = (revision, evidenceId, proposalId = randomUUID()) => ({ proposalId, baseSemanticRevision: revision, readEvidenceIds: [evidenceId], readObjectIds: [], queryIds: [], commands: [
	{ kind: 'element', ref: '@api', element: { kind: 'component', name: 'Upload API' }, evidenceIds: [evidenceId] },
	{ kind: 'element', ref: '@store', element: { kind: 'resource', name: 'Storage' }, evidenceIds: [evidenceId] },
	{ kind: 'relation', ref: '@write', relation: { kind: 'write', from: '@api', to: '@store', name: 'Persist chart' }, evidenceIds: [evidenceId] },
	{ kind: 'view', ref: '@overview', name: 'Responsibilities', viewKind: 'structure', intent: 'Upload and storage', elementIds: ['@api', '@store'], relationIds: ['@write'] }
] });

test('source inventory is immediately usable, paginated and separated from understanding', async t => {
	const f = await fixture(t);
	const first = await f.tool('ade_project_inspect', { limit: 1 });
	const second = await f.tool('ade_project_inspect', { limit: 1, cursor: first.data.files.nextCursor });
	assert.deepEqual([first.data.files.complete, first.data.coverage.understanding.complete, first.data.views.items, first.data.files.items.length, second.data.files.items.length, first.capabilities.every(capability => !capability.calls)], [false, false, [], 1, 1, true]);
	const search = await f.tool('ade_source_search', { query: 'PutWithLimit', mode: 'symbol', limit: 1 });
	assert.equal(search.data.page.items[0].name, 'PutWithLimit');
	const body = await f.tool('ade_source_read', { symbolId: search.data.page.items[0].symbolId, revision: search.data.page.items[0].evidence.revision, maxChars: 40 });
	assert.deepEqual([body.data.truncated, typeof body.data.nextStart, body.data.evidence.encoding], [true, 'number', 'utf-16']);
	const continuation = await f.tool('ade_source_read', { file: body.data.evidence.file, revision: body.data.evidence.revision, start: body.data.nextStart, end: body.data.requestedEnd });
	assert.match(body.data.text + continuation.data.text, /limits == null.*PutObject/);
	assert.equal((await f.tool('ade_code_references', { symbolId: search.data.page.items[0].symbolId, direction: 'outgoing' })).data.availability, 'unsupported');
});

test('draft validation, preview and selective publication preserve IDs, manual edits and other drafts', async t => {
	const f = await fixture(t), read = await readSource(f), request = proposalRequest(read.semanticRevision, read.data.evidence.id);
	const proposal = await f.tool('ade_model_propose', request);
	assert.deepEqual(proposal.diagnostics, []);
	assert.deepEqual(proposal.data.diagnostics, []);
	assert.equal(await active(f.root), f.context.snapshot.split('/').at(-1));
	const replay = await f.tool('ade_model_propose', request);
	assert.deepEqual(replay.data.aliases, proposal.data.aliases);
	const conflict = await f.tool('ade_model_propose', { ...request, commands: request.commands.slice(0, 1) });
	assert.match(conflict.diagnostics[0].code, /proposalIdContentConflict/);
	const invalid = await f.tool('ade_model_propose', { ...proposalRequest(read.semanticRevision, read.data.evidence.id), commands: [...request.commands.slice(0, 1), { kind: 'view', ref: '@classes', name: 'Unrealizable classes', viewKind: 'class', intent: 'Members', elementIds: ['@api'], relationIds: [] }] });
	assert.equal(invalid.data.status, 'invalid');
	const preview = await f.tool('ade_view_preview', { proposalId: request.proposalId });
	assert.equal(preview.data.views[0].readiness.reviewable, true);
	assert.match(await readFile(preview.data.images[0].path, 'utf8'), /<svg/);
	const review = JSON.parse(await readFile(preview.data.reviewFile, 'utf8'));
	assert.equal(review.changes.find(change => change.collection === 'elements' && change.id === proposal.data.aliases['@api']).after.name, 'Upload API');
	assert.ok(preview.data.diff.items.some(change => change.collection === 'relations'));
	const applied = await executeDiagramExploration(f.context.snapshot, { action: 'publish', sessionId: f.opened.sessionId, proposalId: request.proposalId });
	const snapshot = await readSnapshot(applied.data.snapshot), ids = proposal.data.aliases;
	assert.deepEqual([snapshot.model.version, snapshot.model.views.length, snapshot.model.semantics.elements.map(element => element.id)], [5, 1, [ids['@api'], ids['@store']]]);
	const again = await executeDiagramExploration(f.context.snapshot, { action: 'publish', sessionId: f.opened.sessionId, proposalId: request.proposalId });
	assert.equal(again.data.snapshot, applied.data.snapshot);
	const journal = await readExplorationSession(f.root, f.opened.sessionId);
	assert.deepEqual(journal.proposals.map(proposal => proposal.status), ['applied', 'invalid']);
	// A targeted follow-up adds one view without replacing a hand-moved node or annotation.
	snapshot.model.views[0].nodes[0].x = 1234; snapshot.model.semantics.elements[0].description = 'Manual annotation';
	await writeFile(join(snapshot.directory, 'model.ade.json'), JSON.stringify(snapshot.model));
	const current = await f.tool('ade_project_inspect', {});
	const follow = await f.tool('ade_model_propose', { proposalId: randomUUID(), baseSemanticRevision: current.semanticRevision, readEvidenceIds: [], readObjectIds: [ids['@store']], queryIds: [], commands: [{ kind: 'view', ref: '@focused', name: 'Storage focus', viewKind: 'structure', intent: 'Only storage', elementIds: [ids['@store']], relationIds: [] }] });
	const update = await executeDiagramExploration(snapshot.directory, { action: 'publish', sessionId: f.opened.sessionId, proposalId: follow.data.proposalId });
	const updated = await readSnapshot(update.data.snapshot);
	assert.deepEqual([updated.model.views[0], updated.model.semantics.elements[0]], [snapshot.model.views[0], snapshot.model.semantics.elements[0]]);
	assert.equal(await readFile(join(f.root, 'src/server.mjs'), 'utf8'), source);
});

test('stale source evidence, negative queries, documentation changes and paths are guarded', async t => {
	const f = await fixture(t), read = await readSource(f);
	const empty = await f.tool('ade_source_search', { query: 'retentionNew', filePrefix: 'src/' });
	const request = proposalRequest(read.semanticRevision, read.data.evidence.id); request.queryIds = [empty.data.query.id];
	const proposed = await f.tool('ade_model_propose', request); assert.equal(proposed.data.status, 'ready');
	await writeFile(join(f.root, 'src/retention.mjs'), 'export const retentionNew = true;');
	await assert.rejects(executeDiagramExploration(f.context.snapshot, { action: 'publish', sessionId: f.opened.sessionId, proposalId: request.proposalId }), /staleQuery/);
	const badPath = await f.tool('ade_source_read', { file: '../outside.txt', revision: read.data.evidence.revision });
	assert.match(badPath.diagnostics[0].code, /sourceNotInventoried/);
	await writeFile(join(f.root, 'src/server.mjs'), source + '\n// changed');
	const stale = await f.tool('ade_source_read', { file: 'src/server.mjs', revision: read.data.evidence.revision });
	assert.match(stale.diagnostics[0].code, /staleEvidenceRevision/);
	const documentation = await f.tool('ade_source_search', { query: 'nonexistent', filePrefix: 'README' });
	await writeFile(join(f.root, 'README.md'), 'nonexistent now exists');
	const current = await f.tool('ade_project_inspect', {});
	const fresh = await readSource(f), docRequest = proposalRequest(current.semanticRevision, fresh.data.evidence.id); docRequest.queryIds = [documentation.data.query.id];
	assert.match((await f.tool('ade_model_propose', docRequest)).diagnostics[0].code, /staleQuery/);
	await symlink(join(f.root, 'README.md'), join(f.root, 'redirect.mjs'));
	assert.match((await f.tool('ade_source_read', { file: 'redirect.mjs', revision: contentHash('nonexistent now exists') })).diagnostics[0].code, /outsideDisclosureScope/);
});

test('session budget increases keep evidence and IDs; tool calls are not model inferences', async t => {
	const f = await fixture(t), read = await readSource(f), proposal = await f.tool('ade_model_propose', proposalRequest(read.semanticRevision, read.data.evidence.id));
	const before = await readExplorationSession(f.root, f.opened.sessionId);
	const resumed = await executeDiagramExploration(f.context.snapshot, { action: 'budget', sessionId: f.opened.sessionId, budget: { ...before.budget, maxToolCalls: 120 } });
	const after = await readExplorationSession(f.root, f.opened.sessionId);
	assert.deepEqual([after.evidence, after.proposals[0].aliases, after.usage.inputTokens, after.usage.modelTurns, resumed.data.budget.maxToolCalls], [before.evidence, proposal.data.aliases, null, [], 120]);
	await executeDiagramExploration(f.context.snapshot, { action: 'budget', sessionId: f.opened.sessionId, budget: { ...after.budget, maxToolCalls: after.usage.toolCalls } });
	assert.equal((await f.tool('ade_project_inspect', {})).diagnostics[0].code, 'sessionBudgetExhausted');
});

test('malformed union commands get actionable diagnostics and consume the persisted tool budget', async t => {
	const f = await fixture(t);
	await executeDiagramExploration(f.context.snapshot, { action: 'budget', sessionId: f.opened.sessionId, budget: { ...f.opened.data.budget, maxToolCalls: 3 } });
	const envelope = { proposalId: 'repair', baseSemanticRevision: f.opened.semanticRevision, readEvidenceIds: [], readObjectIds: [], queryIds: [] };
	const wrongShape = await f.tool('ade_model_propose', { ...envelope, commands: [{ op: 'addElement', kind: 'component', ref: '@api', name: 'API' }] });
	assert.equal(wrongShape.diagnostics[0].field, '/commands/0/kind');
	assert.ok(wrongShape.diagnostics[0].allowedValues.includes('element'));
	assert.equal(wrongShape.diagnostics[0].example.element.kind, 'component');
	const extraProperty = await f.tool('ade_model_propose', { ...envelope, commands: [{ kind: 'element', ref: '@api', evidenceIds: [], element: { kind: 'component', name: 'API' }, sourceId: 'wrong-shape' }] });
	assert.ok(extraProperty.diagnostics.some(issue => issue.field === '/commands/0' && issue.details.additionalProperty === 'sourceId'));
	assert.ok(extraProperty.diagnostics.every(issue => issue.expected.properties.kind.const === 'element'));
	const missing = await f.tool('ade_view_preview', { proposalId: 'never-saved' });
	assert.equal(missing.diagnostics[0].code, 'unknownProposal');
	const saved = await readExplorationSession(f.root, f.opened.sessionId);
	assert.equal(saved.usage.toolCalls, 3);
	assert.equal(saved.usage.readBytes, saved.calls.reduce((total, call) => total + call.outputBytes, 0));
	assert.ok(saved.calls.every(call => call.outputBytes > 0 && call.diagnostics.length > 0));
	assert.deepEqual(saved.proposals, []);
	assert.equal((await f.tool('ade_project_inspect', {})).diagnostics[0].code, 'sessionBudgetExhausted');
	await executeDiagramExploration(f.context.snapshot, { action: 'budget', sessionId: f.opened.sessionId, budget: { ...saved.budget, maxToolCalls: 12 } });
	const read = await readSource(f);
	const range = await f.tool('ade_source_read', { file: 'src/server.mjs', revision: read.data.evidence.revision, end: source.length + 1 });
	assert.deepEqual(range.diagnostics[0].range, { start: 0, end: source.length + 1, fileLength: source.length, maxChars: 8192, maxAllowedChars: 16384 });
	assert.match(range.diagnostics[0].action, /UTF-16/);
	assert.equal((await f.tool('ade_model_propose', proposalRequest(read.semanticRevision, read.data.evidence.id))).data.status, 'ready');
});

test('parallel MCP searches queue behind the project lock and preserve every receipt', async t => {
	const f = await fixture(t), { server, sessionId } = await createDiagramMcpServer(f.root, f.opened.sessionId);
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair(), client = new Client({ name: 'parallel-test', version: '1' });
	t.after(() => client.close()); t.after(() => server.close());
	await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
	const results = await Promise.all(['uploadChartPackage', 'PutWithLimit', 'PutObject', 'indexHandler', 'objectHandler'].map(query => client.callTool({ name: 'ade_source_search', arguments: { query, mode: 'text' } })));
	assert.ok(results.every(result => !result.isError && result.structuredContent.data.page.items.length > 0));
	const saved = await readExplorationSession(f.root, sessionId);
	assert.equal(saved.usage.toolCalls, 5);
	assert.ok(saved.calls.every(call => call.status === 'complete' && call.diagnostics.length === 0));
	assert.equal(saved.queries.length, 5);
});

test('local publication recovers an uncertain result without duplicating architectural IDs', async t => {
	const f = await fixture(t), read = await readSource(f), request = proposalRequest(read.semanticRevision, read.data.evidence.id);
	const proposed = await f.tool('ade_model_propose', request);
	const result = await executeDiagramExploration(f.context.snapshot, { action: 'publish', sessionId: f.opened.sessionId, proposalId: request.proposalId });
	const session = await readExplorationSession(f.root, f.opened.sessionId);
	session.publication.status = 'publishing'; session.proposals[0].status = 'ready';
	await atomicJson(join(await managed(f.root, 'exploration'), session.id + '.json'), session);
	await executeDiagramExploration(f.context.snapshot, { action: 'open', sessionId: session.id });
	const recovered = await readExplorationSession(f.root, session.id);
	assert.deepEqual([recovered.proposals[0].status, recovered.proposals[0].aliases, await active(f.root)], ['applied', proposed.data.aliases, result.data.snapshot.split('/').at(-1)]);
});

test('v4 migration and descriptive scenarios retain unknown order and refuse executable interpretation', async () => {
	const v4 = { version: 4, id: 'sample', name: 'Sample', semantics: { elements: [{ id: 'api', kind: 'component', name: 'API' }, { id: 'store', kind: 'resource', name: 'Store' }] , relations: [] }, views: [], codeMappings: [], verifications: [], foundation: emptyFoundation() };
	const model = migrateSemanticModelToV5(v4), evidence = { id: 'evidence:test', revision: contentHash(source), file: 'server.mjs', start: 0, end: source.length, encoding: 'utf-16', producer: 'fixture', producerVersion: '1', nature: 'syntax', factIds: [] };
	assert.deepEqual(migrateSemanticModelToV5(model, () => { throw new Error('Must not allocate again'); }), model);
	const request = { proposalId: 'scenario', baseSemanticRevision: await diagramModelRevision(model), readEvidenceIds: [evidence.id], readObjectIds: [], queryIds: [], commands: [
		{ kind: 'scenario', ref: '@upload', trigger: 'POST upload', scope: 'One upload request', participantIds: ['api', 'store'], evidenceIds: [evidence.id], occurrences: [
			{ ref: '@normal', from: 'api', to: 'store', name: 'PutObject', evidenceIds: [evidence.id] }, { ref: '@retention', from: 'api', to: 'store', name: 'PutObjectWithRetention', evidenceIds: [evidence.id] }
		], order: [], alternatives: [{ ref: '@limits', operator: 'alt', operands: [{ ref: '@without', condition: { state: 'known', value: 'limits == null' }, steps: ['@normal'], evidenceIds: [evidence.id] }, { ref: '@with', condition: { state: 'known', value: 'limits != null' }, steps: ['@retention'], evidenceIds: [evidence.id] }] }] },
		{ kind: 'view', ref: '@sequence', name: 'Upload', viewKind: 'sequence', intent: 'Alternatives are exclusive', elementIds: ['api', 'store'], relationIds: [], scenarioId: '@upload' }
	] };
	const proposal = await proposeDiagramModel(model, request, [evidence]), result = applyDiagramProposal(model, proposal);
	assert.deepEqual(validateSemanticModel(result), []);
	assert.deepEqual(scenarioLayers(result.foundation.interactions[0]), [[proposal.aliases['@normal'], proposal.aliases['@retention']]]);
	assert.match(renderDiagramPreview(result, result.views[0]), /limits == null/);
	const { validateModelInteraction } = await import('../../../src/vs/workbench/contrib/ade/common/modelInteractions.ts');
	assert.ok(validateModelInteraction(result, proposal.aliases['@upload']).includes('interactionContract'));
	assert.deepEqual(v4.foundation.interactions, []);
});

test('official MCP protocol uses the same services for a second source read, restart and cancellation', async t => {
	const f = await fixture(t), { server, sessionId } = await createDiagramMcpServer(f.root, f.opened.sessionId);
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair(), client = new Client({ name: 'ade-protocol-test', version: '1' });
	await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
	t.after(() => client.close()); t.after(() => server.close());
	assert.equal((await client.listTools()).tools.length, 9);
	const rejected = await client.callTool({ name: 'ade_model_propose', arguments: { commands: [] } });
	assert.equal(rejected.isError, true);
	assert.equal(rejected.structuredContent.diagnostics[0].code, 'invalidToolArguments');
	const searched = (await client.callTool({ name: 'ade_source_search', arguments: { query: 'PutWithLimit', mode: 'symbol' } })).structuredContent;
	const hit = searched.data.page.items[0];
	const first = (await client.callTool({ name: 'ade_source_read', arguments: { symbolId: hit.symbolId, revision: hit.evidence.revision, maxChars: 32 } })).structuredContent;
	const second = (await client.callTool({ name: 'ade_source_read', arguments: { file: hit.evidence.file, revision: hit.evidence.revision, start: first.data.nextStart, end: first.data.requestedEnd } })).structuredContent;
	assert.match(first.data.text + second.data.text, /PutObject/);
	const controller = new AbortController(); controller.abort();
	await assert.rejects(executeDiagramExploration(f.context.snapshot, { action: 'tool', sessionId, tool: 'ade_project_inspect', arguments: {} }, controller.signal));
	const reopened = await createDiagramMcpServer(f.root, sessionId); await reopened.server.close();
	assert.equal(reopened.sessionId, sessionId);
	const stdio = new StdioClientTransport({ command: process.execPath, args: [new URL('../diagram-mcp.mjs', import.meta.url).pathname, f.root, sessionId], stderr: 'pipe' }), external = new Client({ name: 'stdio-test', version: '1' });
	t.after(() => external.close()); await external.connect(stdio);
	assert.equal((await external.listTools()).tools[0].name, 'ade_project_inspect');
});

test('C4 preview keeps an external system outside the owned container boundary', async () => {
	const model = { version: 5, id: 'c4', name: 'C4', semantics: { elements: [], relations: [] }, views: [], codeMappings: [], verifications: [], foundation: { ...emptyFoundation(), evidence: [] } }, e = { id: 'e', revision: contentHash('source'), file: 'source.mjs', start: 0, end: 6, encoding: 'utf-16', producer: 'fixture', producerVersion: '1', nature: 'text', factIds: [] };
	const request = { proposalId: 'c4', baseSemanticRevision: await diagramModelRevision(model), readEvidenceIds: [e.id], readObjectIds: [], queryIds: [], commands: [
		...[[ '@system', 'system', 'Service', 'governed' ], [ '@web', 'container', 'Web' ], [ '@storage', 'container', 'Storage' ], [ '@external', 'system', 'External', 'external' ]].map(([ref, kind, name, scope]) => ({ kind: 'element', ref, evidenceIds: [e.id], element: { kind, name, ...(scope ? { scope } : {}) } })),
		{ kind: 'ownership', ref: '@ownWeb', elementId: '@web', ownerId: '@system', role: 'architecture' }, { kind: 'ownership', ref: '@ownStorage', elementId: '@storage', ownerId: '@system', role: 'architecture' },
		{ kind: 'view', ref: '@view', name: 'Containers', viewKind: 'c4Container', intent: 'Boundary', elementIds: ['@system', '@web', '@external', '@storage'], relationIds: [], subjectId: '@system', contextIds: ['@external'] }
	] };
	const proposal = await proposeDiagramModel(model, request, [e]);
	assert.deepEqual(proposal.diagnostics, []);
	const candidate = applyDiagramProposal(model, proposal);
	assert.deepEqual(inspectDiagramQuality(candidate, candidate.views[0]), []);
});


test('a layout edit made during review survives applying a changed view specification', async t => {
	const f = await fixture(t), read = await readSource(f), request = proposalRequest(read.semanticRevision, read.data.evidence.id);
	const proposal = await f.tool('ade_model_propose', request), ids = proposal.data.aliases;
	const published = await executeDiagramExploration(f.context.snapshot, { action: 'publish', sessionId: f.opened.sessionId, proposalId: request.proposalId });
	const current = await f.tool('ade_project_inspect', {});
	const change = await f.tool('ade_model_propose', { proposalId: randomUUID(), baseSemanticRevision: current.semanticRevision, readEvidenceIds: [], readObjectIds: [], queryIds: [], commands: [{ kind: 'view', ref: ids['@overview'], name: 'Revised overview', viewKind: 'structure', intent: 'Same participants, revised intent', elementIds: [ids['@api'], ids['@store']], relationIds: [ids['@write']] }] });
	const snapshot = await readSnapshot(published.data.snapshot);
	snapshot.model.views[0].nodes[0].x = 1777; snapshot.model.views[0].spec.layoutRevision = 'manual-after-review'; snapshot.model.views[0].spec.manualIds = [ids['@api']];
	await writeFile(join(snapshot.directory, 'model.ade.json'), JSON.stringify(snapshot.model));
	const applied = await executeDiagramExploration(snapshot.directory, { action: 'publish', sessionId: f.opened.sessionId, proposalId: change.data.proposalId });
	const result = await readSnapshot(applied.data.snapshot);
	assert.deepEqual([result.model.views[0].name, result.model.views[0].nodes[0].x, result.model.views[0].spec.layoutRevision], ['Revised overview', 1777, 'manual-after-review']);
});

test('a changed source drops only obsolete resolved references and does not block a fresh independent proposal', async t => {
	const f = await fixture(t, { 'src/caller.ts': "import { persist } from './store.js'; export function upload() { return persist(); }", 'src/store.ts': 'export function persist() { return 1; }' }, false);
	const initial = await f.tool('ade_source_search', { query: 'upload', mode: 'symbol' }), symbol = initial.data.page.items[0];
	const references = await f.tool('ade_code_references', { symbolId: symbol.symbolId, direction: 'outgoing' });
	assert.deepEqual([references.data.kind, references.data.calls, references.data.page.items[0].source.nature], ['references', 'unsupported', 'reference']);
	await writeFile(join(f.root, 'src/caller.ts'), "import { persist } from './store.js'; export function upload() { return persist() + 1; }");
	const unavailable = await f.tool('ade_code_references', { symbolId: symbol.symbolId, direction: 'outgoing' });
	assert.equal(unavailable.data.availability, 'unavailable');
	const store = await f.tool('ade_source_search', { query: 'persist', mode: 'symbol', filePrefix: 'src/store' });
	const read = await f.tool('ade_source_read', { symbolId: store.data.page.items[0].symbolId, revision: store.data.page.items[0].evidence.revision });
	const request = proposalRequest(read.semanticRevision, read.data.evidence.id), proposed = await f.tool('ade_model_propose', request);
	assert.equal(proposed.data.status, 'ready');
	const published = await executeDiagramExploration(f.context.snapshot, { action: 'publish', sessionId: f.opened.sessionId, proposalId: request.proposalId });
	const result = await readSnapshot(published.data.snapshot);
	assert.deepEqual([result.state.semantic.indexedFiles, result.state.analysis.syntaxOnly, result.model.views.length], [['src/store.ts'], false, 1]);
});

test('exclusive branches cannot acquire a false temporal order and endpoint scenarios can be split with stable occurrence IDs', async () => {
	const model = { version: 5, id: 'split', name: 'Split', semantics: { elements: [{ id: 'api', kind: 'component', name: 'API' }, { id: 'store', kind: 'resource', name: 'Store' }], relations: [] }, views: [], codeMappings: [], verifications: [], foundation: { ...emptyFoundation(), evidence: [] } };
	const evidence = { id: 'e', file: 'source.mjs', revision: contentHash(source), start: 0, end: source.length, encoding: 'utf-16', producer: 'fixture', producerVersion: '1', nature: 'syntax', factIds: [] };
	const scenario = { kind: 'scenario', ref: '@retrieval', trigger: 'Read endpoint', scope: 'Retrieval alternatives', participantIds: ['api', 'store'], evidenceIds: ['e'], occurrences: [{ ref: '@index', from: 'api', to: 'store', name: 'GetIndex', evidenceIds: ['e'] }, { ref: '@object', from: 'api', to: 'store', name: 'GetObject', evidenceIds: ['e'] }], order: [], alternatives: [{ ref: '@endpoints', operator: 'alt', operands: [{ ref: '@indexPath', condition: { state: 'known', value: 'GET /index.yaml' }, steps: ['@index'], evidenceIds: ['e'] }, { ref: '@objectPath', condition: { state: 'known', value: 'GET /charts/:name' }, steps: ['@object'], evidenceIds: ['e'] }] }] };
	const request = { proposalId: 'retrieval', baseSemanticRevision: await diagramModelRevision(model), readEvidenceIds: ['e'], readObjectIds: [], queryIds: [], commands: [scenario] };
	const invalid = await proposeDiagramModel(model, { ...request, proposalId: 'false-order', commands: [{ ...scenario, order: [{ before: '@index', after: '@object', evidenceIds: ['e'], basis: 'inferred' }] }] }, [evidence]);
	assert.ok(invalid.diagnostics.some(diagnostic => diagnostic.args.includes('exclusiveBranchesCannotBeOrdered')));
	const valid = await proposeDiagramModel(model, request, [evidence]), accepted = applyDiagramProposal(model, valid), ids = valid.aliases;
	const split = await proposeDiagramModel(accepted, { ...request, proposalId: 'split-endpoints', baseSemanticRevision: await diagramModelRevision(accepted), commands: [
		{ ...scenario, ref: ids['@retrieval'], trigger: 'GET /index.yaml', scope: 'Index retrieval', occurrences: [{ ...scenario.occurrences[0], ref: ids['@index'] }], alternatives: [] },
		{ ...scenario, ref: '@objectRequest', trigger: 'GET /charts/:name', scope: 'Object retrieval', occurrences: [{ ...scenario.occurrences[1], ref: ids['@object'] }], alternatives: [] }
	] }, [evidence]);
	assert.deepEqual(split.diagnostics, []);
	const result = applyDiagramProposal(accepted, split);
	assert.deepEqual(result.foundation.interactions.map(scenario => scenario.occurrenceIds), [[ids['@index']], [ids['@object']]]);
});

test('merging descriptive responsibilities redirects all consumers while retaining the target ID and annotations', async t => {
	const f = await fixture(t), read = await readSource(f), request = proposalRequest(read.semanticRevision, read.data.evidence.id);
	request.commands[1].element.kind = 'component'; request.commands[2].relation.kind = 'dependency';
	const draft = await f.tool('ade_model_propose', request), ids = draft.data.aliases;
	const first = await executeDiagramExploration(f.context.snapshot, { action: 'publish', sessionId: f.opened.sessionId, proposalId: request.proposalId });
	const initial = await readSnapshot(first.data.snapshot);
	initial.model.semantics.elements.find(entry => entry.id === ids['@store']).description = 'Manual source annotation';
	await writeFile(join(initial.directory, 'model.ade.json'), JSON.stringify(initial.model));
	const current = await f.tool('ade_project_inspect', {}), mergeId = randomUUID();
	const merge = await f.tool('ade_model_propose', { proposalId: mergeId, baseSemanticRevision: current.semanticRevision, readEvidenceIds: [read.data.evidence.id], readObjectIds: [], queryIds: [], commands: [{ kind: 'merge', ref: ids['@api'], sourceId: ids['@store'], evidenceIds: [read.data.evidence.id] }] });
	assert.deepEqual(merge.diagnostics, []); assert.equal(merge.data.status, 'ready');
	const result = await executeDiagramExploration(first.data.snapshot, { action: 'publish', sessionId: f.opened.sessionId, proposalId: mergeId });
	const merged = await readSnapshot(result.data.snapshot);
	assert.deepEqual([merged.model.semantics.elements.map(entry => ({ id: entry.id, description: entry.description })), merged.model.semantics.relations, merged.model.views[0].nodes.map(node => node.elementId)], [[{ id: ids['@api'], description: 'Manual source annotation' }], [], [ids['@api']]]);
	assert.ok(merged.model.foundation.assertions.every(assertion => assertion.subject.id === ids['@api']));
});

test('an invalid draft remains inspectable and a targeted correction preserves its reserved object IDs', async t => {
	const f = await fixture(t), read = await readSource(f), request = proposalRequest(read.semanticRevision, read.data.evidence.id);
	request.commands = [request.commands[0], { kind: 'view', ref: '@classes', name: 'Classes', viewKind: 'class', intent: 'Incorrect notation for a component', elementIds: ['@api'], relationIds: [] }];
	const invalid = await f.tool('ade_model_propose', request); assert.equal(invalid.data.status, 'invalid');
	const preview = await f.tool('ade_view_preview', { proposalId: request.proposalId });
	assert.ok(preview.data.diff.items.some(change => change.collection === 'elements' && change.after.name === 'Upload API'));
	const corrected = await f.tool('ade_model_propose', { ...request, proposalId: randomUUID(), supersedes: request.proposalId, commands: [request.commands[0], { ...request.commands[1], viewKind: 'structure', intent: 'A responsibility can be shown without an OO contract' }] });
	assert.deepEqual([corrected.data.status, corrected.data.aliases], ['ready', invalid.data.aliases]);
	const summary = await executeDiagramExploration(f.context.snapshot, { action: 'open', sessionId: f.opened.sessionId });
	assert.deepEqual(summary.data.proposals.map(proposal => proposal.id), [corrected.data.proposalId]);
	const applied = await executeDiagramExploration(f.context.snapshot, { action: 'publish', sessionId: f.opened.sessionId, proposalId: corrected.data.proposalId });
	const snapshot = await readSnapshot(applied.data.snapshot);
	assert.deepEqual([snapshot.model.views[0].id, snapshot.model.semantics.elements[0].id], [invalid.data.aliases['@classes'], invalid.data.aliases['@api']]);
});

test('activity is a projection of occurrences and declared partial order, with no inferred array chronology', async () => {
	const model = { version: 5, id: 'activity', name: 'Activity', semantics: { elements: [{ id: 'api', kind: 'component', name: 'API' }, { id: 'store', kind: 'resource', name: 'Store' }], relations: [] }, views: [], codeMappings: [], verifications: [], foundation: { ...emptyFoundation(), evidence: [] } };
	const evidence = { id: 'e', file: 'source.mjs', revision: contentHash(source), start: 0, end: source.length, encoding: 'utf-16', producer: 'fixture', producerVersion: '1', nature: 'syntax', factIds: [] };
	const request = { proposalId: 'activity', baseSemanticRevision: await diagramModelRevision(model), readEvidenceIds: ['e'], readObjectIds: [], queryIds: [], commands: [
		{ kind: 'scenario', ref: '@upload', trigger: 'Upload', scope: 'One request', participantIds: ['api', 'store'], evidenceIds: ['e'], occurrences: [{ ref: '@first', from: 'api', to: 'store', name: 'First write', evidenceIds: ['e'] }, { ref: '@second', from: 'api', to: 'store', name: 'Second write', evidenceIds: ['e'] }, { ref: '@alternative', from: 'api', to: 'store', name: 'Alternative write', evidenceIds: ['e'] }], order: [], alternatives: [{ ref: '@branches', operator: 'alt', operands: [{ ref: '@ordinary', condition: { state: 'known', value: 'no limits' }, steps: ['@first', '@second'], evidenceIds: ['e'] }, { ref: '@limited', condition: { state: 'known', value: 'with limits' }, steps: ['@alternative'], evidenceIds: ['e'] }] }] },
		{ kind: 'view', ref: '@activity', name: 'Upload activity', viewKind: 'activity', intent: 'Explicit branches without an invented order', elementIds: ['api', 'store'], relationIds: [], scenarioId: '@upload' }
	] };
	const proposed = await proposeDiagramModel(model, request, [evidence]);
	assert.equal(proposed.status, 'ready');
	const candidate = applyDiagramProposal(model, proposed), { projectDescriptiveActivity } = await import('../../../src/vs/workbench/contrib/ade/common/descriptiveActivity.ts');
	const projection = projectDescriptiveActivity(candidate, proposed.aliases['@upload']);
	assert.deepEqual([projection.edges, projection.nodes.length, projection.unordered, projection.groups[0].operator], [[], 3, true, 'alt']);
	assert.ok(projection.nodes.filter(node => node.occurrenceId !== proposed.aliases['@alternative']).every(node => node.y === projection.nodes[0].y));
	assert.match(renderDiagramPreview(candidate, candidate.views[0]), /no limits/);
	const ordered = structuredClone(candidate); ordered.foundation.interactions[0].description.order = [{ before: proposed.aliases['@first'], after: proposed.aliases['@second'], evidenceIds: ['e'], basis: 'inferred' }];
	assert.deepEqual(validateSemanticModel(ordered), []);
	const declared = projectDescriptiveActivity(ordered, proposed.aliases['@upload']);
	assert.equal(declared.edges.length, 1);
	assert.equal(declared.unordered, false);
	assert.ok(declared.nodes.find(node => node.occurrenceId === proposed.aliases['@first']).y < declared.nodes.find(node => node.occurrenceId === proposed.aliases['@second']).y);
	const bad = structuredClone(candidate); bad.foundation.interactions[0].description.order = [{ before: proposed.aliases['@first'], after: proposed.aliases['@alternative'], evidenceIds: ['e'], basis: 'inferred' }];
	assert.ok(validateSemanticModel(bad).some(diagnostic => diagnostic.args.includes('exclusiveBranchesCannotBeOrdered')));
	const { scenarioUnorderedOccurrences } = await import('../../../src/vs/workbench/contrib/ade/common/semanticModel.ts');
	const unframed = structuredClone(ordered); unframed.foundation.frames = []; unframed.foundation.interactions[0].frameIds = [];
	assert.ok(scenarioUnorderedOccurrences(unframed, proposed.aliases['@upload']).has(proposed.aliases['@second']), 'an incomparable event on another display layer must remain unknown');
	const interleaved = structuredClone(candidate), interaction = interleaved.foundation.interactions[0];
	interleaved.foundation.occurrences.push({ id: 'bridge', profile: 'descriptive', from: 'api', to: 'store', name: 'External event', evidenceIds: ['e'] });
	interaction.occurrenceIds.push('bridge');
	interaction.description.order = [{ before: proposed.aliases['@first'], after: 'bridge', evidenceIds: ['e'], basis: 'inferred' }, { before: 'bridge', after: proposed.aliases['@second'], evidenceIds: ['e'], basis: 'inferred' }];
	assert.deepEqual(validateSemanticModel(interleaved), []);
	const { describeModelInteraction } = await import('../../../src/vs/workbench/contrib/ade/common/modelInteractions.ts');
	assert.deepEqual(new Set(describeModelInteraction(interleaved, interaction.id).filter(row => row.kind === 'message').map(row => row.id)), new Set(interaction.occurrenceIds), 'collapsing a frame must never omit interleaved occurrences');
	interaction.description.order[1].after = proposed.aliases['@alternative'];
	assert.ok(validateSemanticModel(interleaved).some(diagnostic => diagnostic.args.includes('exclusiveBranchesCannotBeOrdered')), 'transitive order across exclusive branches must also be rejected');
});

test('feature membership and view grouping stay separate from architectural ownership during revision', async () => {
	const model = { version: 5, id: 'memberships', name: 'Memberships', semantics: { elements: [{ id: 'feature', kind: 'feature', name: 'Uploads' }, { id: 'api', kind: 'component', name: 'API' }], relations: [] }, views: [{ id: 'overview', featureId: 'feature', name: 'Original', kind: 'structure', nodes: [{ elementId: 'api', x: 55, y: 66 }], relationIds: [] }], codeMappings: [], verifications: [], foundation: { ...emptyFoundation(), evidence: [] } };
	const proposal = await proposeDiagramModel(model, { proposalId: 'membership', baseSemanticRevision: await diagramModelRevision(model), readEvidenceIds: [], readObjectIds: [], queryIds: [], commands: [{ kind: 'membership', ref: '@member', elementId: 'api', featureId: 'feature' }, { kind: 'view', ref: 'overview', name: 'Revised', viewKind: 'structure', intent: 'Same feature and manual position', elementIds: ['api'], relationIds: [] }] }, []);
	assert.deepEqual(proposal.diagnostics, []);
	const result = applyDiagramProposal(model, proposal);
	assert.deepEqual([result.views[0].featureId, result.views[0].nodes, result.foundation.ownership, result.foundation.memberships.map(entry => ({ elementId: entry.elementId, featureId: entry.featureId }))], ['feature', model.views[0].nodes, [], [{ elementId: 'api', featureId: 'feature' }]]);
});
