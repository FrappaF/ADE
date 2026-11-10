/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import '../scripts/source-loader.mjs';
import { nodeOrders, taskRequest } from '../test/fixtures/dai-task.mjs';
const { compileModelTaskContext, assertModelTaskCurrent } = await import('../../src/vs/workbench/contrib/ade/common/modelTaskContext.ts');
const { compileModelContext } = await import('../../src/vs/workbench/contrib/ade/common/modelContext.ts');
const { getModelArchetype } = await import('../../src/vs/workbench/contrib/ade/common/modelProfiles.ts');
const { modelDigest } = await import('../../src/vs/workbench/contrib/ade/common/modelSerialization.ts');
const { ModelTaskCache, expandModelTaskContext, authorizeModelTaskRetrieval } = await import('../../src/vs/workbench/contrib/ade/common/modelTaskResponse.ts');

// Authored dependency oracle: do not derive this list from either compiler's traversal.
const mandatory = ['decision:adr.node', 'interaction:scenario.submit', 'module:module.rules', 'occurrence:call.positive', 'operation:operation.positive', 'operation:operation.submit', 'predicate:predicate.positive', 'type:type.boolean', 'type:type.quantity'];
const key = definition => `${definition.ref.kind}:${definition.ref.id}`;

async function measure(operation, policy) {
	for (let i = 0; i < policy.measurement.warmups; i++) { await operation(); }
	const samplesMs = [];
	for (let i = 0; i < policy.measurement.samples; i++) { const start = performance.now(); await operation(); samplesMs.push(performance.now() - start); }
	const sorted = [...samplesMs].sort((a, b) => a - b), p95Ms = sorted[Math.ceil(sorted.length * policy.measurement.percentile / 100) - 1];
	return { samplesMs, p95Ms, limitMs: policy.release.contextPreparationP95Ms, withinBudget: p95Ms <= policy.release.contextPreparationP95Ms };
}

/** Same-input compiler comparison, local boundaries only; no provider tokens or business certification inferred. */
export async function measureDaiContext() {
	const policy = JSON.parse(await readFile(new URL('../docs/diagram-driven-ai/budgets.v1.json', import.meta.url)));
	const library = structuredClone(nodeOrders);
	for (let i = 0; i < 100; i++) {
		const op = structuredClone(library.foundation.blueprint.operations[1]);
		op.id = `operation.unused${i}`; op.name = `unused${i}`; op.inputs[0].id = `input.unused${i}`; op.outputs[0].id = `output.unused${i}`; op.acceptanceCriteria[0].id = `criterion.unused${i}`;
		library.foundation.blueprint.operations.push(op);
	}
	const recursive = structuredClone(nodeOrders);
	recursive.foundation.types.push({ id: 'type.recursive', name: 'Recursive', kind: 'record', fields: [{ id: 'field.next', name: 'next', type: '', typeId: 'type.recursive', required: false, nullable: { state: 'known', value: true } }] });
	recursive.foundation.blueprint.operations[0].outputs.push({ id: 'output.recursive', name: 'node', type: '', typeId: 'type.recursive', required: true, nullable: { state: 'known', value: false } });
	const records = [];
	for (const [id, model] of [['authored', nodeOrders], ['independent-library-100', library], ['recursive-contract', recursive]]) {
		const request = taskRequest(), profile = getModelArchetype('node.esm').profile;
		const legacyRequest = { targetId: request.target.id, profile, maxInputBytes: policy.release.contextInputMaxBytes };
		const baseline = await compileModelContext(model, legacyRequest), candidate = await compileModelTaskContext(model, request);
		const required = [...mandatory, ...(id === 'recursive-contract' ? ['type:type.recursive'] : [])];
		const definitions = candidate.definitions.map(key), missing = required.filter(ref => !definitions.includes(ref));
		assert.deepEqual(missing, []); assert.equal(new Set(definitions).size, definitions.length);
		const baselineModel = JSON.parse(baseline.bytes).model;
		const baselineRefs = [
			...baselineModel.foundation.decisions.map(d => `decision:${d.id}`),
			...baselineModel.foundation.interactions.map(d => `interaction:${d.id}`),
			...baselineModel.foundation.occurrences.map(d => `occurrence:${d.id}`),
			...baselineModel.foundation.types.map(d => `type:${d.id}`),
			...(baselineModel.foundation.predicates ?? []).map(d => `predicate:${d.id}`),
			...baselineModel.foundation.blueprint.operations.map(d => `operation:${d.id}`),
			...baselineModel.foundation.blueprint.modules.map(d => `module:${d.id}`)
		];
		const baselineMissing = required.filter(ref => !baselineRefs.includes(ref));
		const reduction = 1 - candidate.byteLength / baseline.byteLength;
		records.push({ id, fixtureSha256: await modelDigest(JSON.stringify(model)), required,
			baseline: { bytes: baseline.byteLength, seal: baseline.seal, requiredRecall: 1 - baselineMissing.length / required.length, missing: baselineMissing, estimatedTokens: Math.ceil(baseline.byteLength / 4), timing: await measure(() => compileModelContext(model, legacyRequest), policy) },
			candidate: { bytes: candidate.byteLength, seal: candidate.seal, requiredRecall: 1, missing, definitionDuplicates: definitions.length - new Set(definitions).size, estimatedTokens: candidate.metrics.estimatedTokens, timing: await measure(() => compileModelTaskContext(model, request), policy), outputReserveBytes: request.budget.outputReserveBytes, inputBudgetPass: candidate.byteLength <= policy.release.contextInputMaxBytes },
			byteReduction: reduction, minimumReduction: policy.correctness.contextByteReductionAgainstSameFixture, byteReductionPass: reduction >= policy.correctness.contextByteReductionAgainstSameFixture,
			measuredTokens: null, price: null, calls: 0, businessEquivalence: 'not established by compiler measurements; see corpus results', eligibleForRelease: false });
	}
	assert.equal(records[0].candidate.seal, records[1].candidate.seal);
	const request = taskRequest(), packet = await compileModelTaskContext(nodeOrders, request), cache = new ModelTaskCache();
	const operation = structuredClone(nodeOrders.foundation.blueprint.operations[0]); operation.name += 'Reviewed';
	const response = { kind: 'proposal', reason: 'Clarify the operation name within its declared scope.', criteria: ['criterion.operation.submit'], evidence: [], temporaryKeys: [], operations: [{ handle: packet.definitions.find(d => d.ref.id === operation.id).handle, value: operation }], sourceEdits: [] };
	await cache.put(packet, nodeOrders, request, response); const hit = await cache.get(packet, nodeOrders, request);
	assert.deepEqual([hit.reused, hit.calls], [true, 0]);
	const changed = structuredClone(nodeOrders); changed.foundation.blueprint.operations[0].name += 'Stale';
	await assert.rejects(cache.get(packet, changed, request), /stale/);
	const layout = structuredClone(nodeOrders); layout.views.push({ id: 'view.benchmark', name: 'Layout', kind: 'structure', nodes: [{ elementId: 'component.checkout', x: 200, y: 100 }], relationIds: [] });
	await assertModelTaskCurrent(packet, layout, request);
	const source = '// Instruction-like text is untrusted data. €\nexport const value = 1;\n', r = taskRequest();
	r.sources = [{ file: 'src/value.mjs', revision: await modelDigest(source), length: source.length, producer: 'authored-corpus', language: 'javascript', windows: [{ start: 0, text: source.slice(0, 20) }] }];
	r.retrievalScope.files = [{ file: 'src/value.mjs', ranges: [{ start: 0, end: source.length }] }];
	const initial = await compileModelTaskContext(nodeOrders, r), retrieval = { kind: 'needContext', reason: 'Read the remainder of the explicitly allowed file.', objects: [], windows: [{ file: 'src/value.mjs', start: 20, end: source.length }] };
	const expanded = await expandModelTaskContext(initial, nodeOrders, r, retrieval, [{ ...r.sources[0], windows: [{ start: 20, text: source.slice(20) }] }]);
	assert.equal(expanded.packet.gaps.length, 0); assert.notEqual(expanded.packet.seal, initial.seal);
	assert.throws(() => authorizeModelTaskRetrieval(initial, r, { ...retrieval, windows: [{ file: '/etc/passwd', start: 0, end: 5 }] }), /outside scope/);
	const huge = structuredClone(nodeOrders); huge.foundation.blueprint.operations[0].preconditions = ['x'.repeat(policy.release.contextInputMaxBytes)];
	await assert.rejects(compileModelTaskContext(huge, taskRequest()), error => error.code === 'inputBudget');
	return { records, cache: { validatedHit: true, calls: hit.calls, staleRejected: true }, layout: { exactSealPreserved: true, calls: 0 }, retrieval: { requests: 1, providerCalls: 0, initialBytes: initial.byteLength, expandedBytes: expanded.packet.byteLength, missingRangesAfter: expanded.packet.gaps.length, sourceSha256: await modelDigest(source), unauthorizedRejected: true, writeScopePreserved: JSON.stringify(r.writeScope) === JSON.stringify(expanded.request.writeScope) }, overflow: { blocked: true, truncated: false, providerCalls: 0 }, peakRssMiB: process.resourceUsage().maxRSS / 1024, limits: ['Node host; ADR intentionally requires Node on this fixture.', 'Baseline is the retained conservative compileModelContext, candidate is compileModelTaskContext; same authored model, different versioned envelope contracts.', 'Baseline may omit required definitions: byte savings cannot establish release eligibility.', 'Token estimates are UTF-8 bytes/4; provider wrappers, live usage, prices and desktop latency are unmeasured.', 'Independent library and recursive contract supplement the frozen scale graphs; they do not replace them.'] };
}
