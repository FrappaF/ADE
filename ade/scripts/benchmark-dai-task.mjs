/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { cpus, arch, platform } from 'node:os';
import '../test/source-loader.mjs';
import { nodeOrders, taskRequest } from '../test/fixtures/dai-task.mjs';
const { compileModelTaskContext } = await import('../../src/vs/workbench/contrib/ade/common/modelTaskContext.ts');
const { compileModelContext } = await import('../../src/vs/workbench/contrib/ade/common/modelContext.ts');
const { getModelArchetype } = await import('../../src/vs/workbench/contrib/ade/common/modelProfiles.ts');
const { modelDigest } = await import('../../src/vs/workbench/contrib/ade/common/modelSerialization.ts');
const root = new URL('../../', import.meta.url);
const [output, ...extra] = process.argv.slice(2); if (!output || extra.length) { throw new Error('Usage: node ade/scripts/benchmark-dai-task.mjs NEW_REPORT'); }
const budgets = JSON.parse(await readFile(new URL('../docs/diagram-driven-ai/budgets.v1.json', import.meta.url)));
const profile = getModelArchetype('node.esm').profile;
const large = structuredClone(nodeOrders), template = large.foundation.blueprint.operations[1];
for (let index = 0; index < 100; index++) { const operation = structuredClone(template); operation.id = `operation.unused${index}`; operation.name = `unused${index}`; operation.inputs[0].id = `input.unused${index}`; operation.outputs[0].id = `output.unused${index}`; operation.acceptanceCriteria[0].id = `criterion.unused${index}`; large.foundation.blueprint.operations.push(operation); }
const records = [];
for (const [id, model] of [['small-structural', nodeOrders], ['large-library', large]]) {
	const request = taskRequest(); const legacyRequest = { targetId: request.target.id, profile, maxInputBytes: budgets.release.contextInputMaxBytes };
	const baseline = await compileModelContext(model, legacyRequest), candidate = await compileModelTaskContext(model, request);
	assert.equal(candidate.definitions.filter(item => item.ref.kind === 'operation').length, 2);
	assert.equal(candidate.definitions.filter(item => item.ref.kind === 'type').length, 2);
	const samples = [];
	for (let index = -budgets.measurement.warmups; index < budgets.measurement.samples; index++) { const start = performance.now(); const current = await compileModelTaskContext(model, request); assert.equal(current.seal, candidate.seal); if (index >= 0) { samples.push(performance.now() - start); } }
	samples.sort((a, b) => a - b); const p95 = samples[Math.ceil(samples.length * .95) - 1];
	records.push({ id, inputSha256: await modelDigest(JSON.stringify(model)), operationsInModel: model.foundation.blueprint.operations.length, baselineBytes: baseline.byteLength, candidateBytes: candidate.byteLength, byteReduction: 1 - candidate.byteLength / baseline.byteLength, definitionOperations: 2, requiredDefinitionOracle: 'Two declared operations, two primitive types; full oracle is independently asserted by dai-task.test.mjs.', sameBytesRepeated: true, contextPreparationP95Ms: p95, latencyBudgetPass: p95 <= budgets.release.contextPreparationP95Ms, seal: candidate.seal, samplesMs: samples });
}
assert.equal(records[0].seal, records[1].seal);
const oversized = structuredClone(nodeOrders); oversized.foundation.blueprint.operations[0].preconditions = ['x'.repeat(196608)]; let blocked = false;
try { await compileModelTaskContext(oversized, taskRequest()); } catch (error) { assert.equal(error.code, 'inputBudget'); blocked = true; }
assert.equal(blocked, true);
const sourcePaths = ['ade/scripts/benchmark-dai-task.mjs', 'ade/ai/context.ts', 'ade/ai/diagramEvidence.ts', 'ade/ai/structuralContext.ts', 'ade/ai/diagramDriven.ts', 'ade/ai/diagramImport.ts', 'ade/ai/reconciliation.ts', ...['semanticModel', 'modelContext', 'modelReadiness', 'modelExpressions', 'modelProfiles', 'modelTaskContext', 'modelTaskResponse', 'contextTransport', 'modelSerialization', 'visualEditing'].map(name => `src/vs/workbench/contrib/ade/common/${name}.ts`)];
const sourceHashes = Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path, await modelDigest(await readFile(new URL(path, root), 'utf8'))])));
await writeFile(output, JSON.stringify({ version: 1, kind: 'dai-04-structural-context', recordedAt: new Date().toISOString(), timezone: 'Europe/Rome', runtime: process.version, platform: `${platform()}-${arch()}`, cpu: cpus()[0].model, policySha256: await modelDigest(await readFile(new URL('../docs/diagram-driven-ai/budgets.v1.json', import.meta.url), 'utf8')), corpusSha256: await modelDigest(await readFile(new URL('../docs/diagram-driven-ai/corpus.v1.json', import.meta.url), 'utf8')), sourceHashes, records, mandatoryOverBudgetBlocked: blocked, calls: 0, measuredTokens: null, monetaryCost: null, peakRssMiB: process.resourceUsage().maxRSS / 1024, limits: ['Identical authored fixtures and frozen policy; not a repository-wide dependency recall measurement.', 'No live provider, private wrapper, desktop timing, project forward/reverse or runtime/broker validation.', 'Byte reduction is fixture evidence, not release acceptance.'] }, null, '\t') + '\n', { flag: 'wx' });
console.log(JSON.stringify(records.map(({ id, baselineBytes, candidateBytes, contextPreparationP95Ms }) => ({ id, baselineBytes, candidateBytes, contextPreparationP95Ms }))));
