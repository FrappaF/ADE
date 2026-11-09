/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { writeFile, readFile, open } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import './source-loader.mjs';
const { createPureProject } = await import('../../src/vs/workbench/contrib/ade/common/modelProject.ts');
const { switchModelStack } = await import('../../src/vs/workbench/contrib/ade/common/modelStack.ts');
const { modelDigest } = await import('../../src/vs/workbench/contrib/ade/common/modelSerialization.ts');
const { compileModelTaskContext, modelTaskOutputSchema } = await import('../../src/vs/workbench/contrib/ade/common/modelTaskContext.ts');
const { validateModelTaskProposal } = await import('../../src/vs/workbench/contrib/ade/common/modelTaskResponse.ts');
const { createCliProvider } = await import('../ai/providers.ts');

const [destination, executable, model, ...extra] = process.argv.slice(2);
if (!destination || !executable || !isAbsolute(executable) || !model || extra.length) { throw new Error('Usage: node ade/scripts/benchmark-dai-live.mjs NEW_REPORT ABSOLUTE_CODEX_EXECUTABLE EXACT_MODEL_ID'); }
const handle = await open(destination, 'wx', 0o600);
const controller = new AbortController(), cancel = () => controller.abort();
process.on('SIGINT', cancel); process.on('SIGTERM', cancel);
const samples = [];
try {
	const policyBytes = await readFile(new URL('../docs/diagram-driven-ai/budgets.v1.json', import.meta.url)), policy = JSON.parse(policyBytes);
	const config = { version: 1, provider: 'codex', connection: 'cli', model, executable, timeoutMs: policy.release.liveCallTimeoutMs, maxContextBytes: 262144, maxCalls: 1 };
	const provider = createCliProvider();
	for (const profileId of ['node.esm', 'bun.esm']) {
		let serial = 0;
		const authored = createPureProject('Live quantity contract', () => 'live.' + ++serial);
		const source = switchModelStack(authored.model, profileId), op = source.foundation.blueprint.operations[0];
		const request = { version: 1, target: { kind: 'operation', id: op.id }, mode: 'analysis', intent: { revision: 'dai12-live-1', text: 'Rename only the target operation to validatePositiveQuantity. Preserve all identities, ownership, parameters, contracts, criteria and predicate. Propose one operation edit and no source edits.', clarifications: [] }, profileId, provider: { id: 'codex', model, configurationRevision: 'dai12-live-1' }, baselineRevision: 'authored-1', delta: [], writeScope: { objects: [{ kind: 'operation', id: op.id }], files: [], createOperationsUnder: [] }, retrievalScope: { objects: [], files: [] }, sources: [], budget: { maxInputBytes: policy.release.contextInputMaxBytes, maxContextBytes: 262144, outputReserveBytes: policy.release.responseReserveBytes, overheadReserveBytes: 0 } };
		const packet = await compileModelTaskContext(source, request);
		for (let run = 1; run <= policy.release.liveRunsPerCasePerCandidate; run++) {
			controller.signal.throwIfAborted();
			const sample = { profileId, run, task: 'bounded-operation-rename', evidenceClass: 'live-inference', request, inputBytes: packet.byteLength, seal: packet.seal, schemaSha256: await modelDigest(JSON.stringify(modelTaskOutputSchema)), calls: 1, status: 'attempted', usage: null, monetaryCost: null };
			samples.push(sample); const start = performance.now();
			try {
				const result = await provider.complete(config, packet.bytes, modelTaskOutputSchema, controller.signal);
				sample.usage = result.usage; sample.response = result.value;
				const validated = await validateModelTaskProposal(packet, source, request, result.value);
				const expected = structuredClone(source); expected.foundation.blueprint.operations[0].name = 'validatePositiveQuantity';
				assert.deepEqual(validated.candidate, expected);
				assert.deepEqual(result.value.sourceEdits, []);
				sample.status = 'passed';
			} catch (error) {
				sample.status = 'failed'; sample.error = error.message;
				// No retry or model escalation after an error. A completed response may still fail the oracle.
				process.exitCode = 1;
			} finally { sample.durationMs = performance.now() - start; }
			if (sample.status === 'failed') { break; }
		}
		if (samples.at(-1).status === 'failed') { break; }
	}
	const sources = ['ade/scripts/benchmark-dai-live.mjs', 'ade/ai/providers.ts', 'ade/ai/contracts.ts', 'src/vs/workbench/contrib/ade/common/modelTaskContext.ts', 'src/vs/workbench/contrib/ade/common/modelTaskResponse.ts'];
	const report = { version: 1, sprint: 'DAI-12', recordedAt: new Date().toISOString(), kind: 'live-inference', provider: 'codex-cli', cliVersion: execFileSync(executable, ['--version'], { encoding: 'utf8', timeout: 5000 }).trim(), config, policySha256: await modelDigest(policyBytes.toString()), corpusSha256: await modelDigest((await readFile(new URL('../docs/diagram-driven-ai/corpus.v1.json', import.meta.url))).toString()),
		sourceHashes: Object.fromEntries(await Promise.all(sources.map(async path => [path, await modelDigest((await readFile(new URL('../../' + path, import.meta.url))).toString())]))), samples,
		observedSuccessRate: samples.filter(s => s.status === 'passed').length / samples.length, requestedSamples: 2 * policy.release.liveRunsPerCasePerCandidate, complete: samples.length === 2 * policy.release.liveRunsPerCasePerCandidate && samples.every(s => s.status === 'passed'), calls: samples.length, automaticRetries: 0, providerInternalRetries: 'owned by CLI; not observed', monetaryCost: null, published: false,
		limits: ['Authored synthetic quantity fixture only; no frozen checkout/business case is certified.', 'A validated proposal is never published. Runtime business tests are separate deterministic evidence.', 'CLI reported tokens may include private overhead. No comparable tariff or second candidate: no price ranking.', 'Only the trusted provider adapter executes the CLI; tools, apps, MCP, hooks, web search and multi-agent feature disabled.'] };
	await handle.writeFile(JSON.stringify(report, null, '\t') + '\n');
	console.log(JSON.stringify({ report: destination, calls: report.calls, observedSuccessRate: report.observedSuccessRate, complete: report.complete }));
} finally { await handle.close(); process.off('SIGINT', cancel); process.off('SIGTERM', cancel); }
