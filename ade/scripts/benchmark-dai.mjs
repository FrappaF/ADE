/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { cpus, platform, arch, release, totalmem, availableParallelism } from 'node:os';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import './source-loader.mjs';
const { packDiagramEvidence } = await import('../ai/diagramEvidence.ts');
import { createDaiGraph, createDaiEvidence } from '../benchmarks/dai-fixtures.mjs';

// Load domain dependencies after the same source-resolution hook used by the standalone tests.
const { validateSemanticModel } = await import('../../src/vs/workbench/contrib/ade/common/semanticModel.ts');
const { applyVisualEdit } = await import('../../src/vs/workbench/contrib/ade/common/visualEditing.ts');
const { migrateSemanticModelToV4 } = await import('../../src/vs/workbench/contrib/ade/common/modelMigration.ts');
const { getModelImpact } = await import('../../src/vs/workbench/contrib/ade/common/modelImpact.ts');

const root = new URL('../../', import.meta.url);
const input = process.argv.slice(2);
const v4 = input[0] === '--v4';
const args = v4 ? input.slice(1) : input;
if (args.length !== 0 && !(args.length === 2 && args[0] === '--output')) {
	throw new Error('Usage: node ade/scripts/benchmark-dai.mjs [--v4] [--output NEW_FILE]');
}
const policyPath = new URL('../docs/diagram-driven-ai/budgets.v1.json', import.meta.url);
const policyBytes = await readFile(policyPath);
const policy = JSON.parse(policyBytes);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const optionalRead = async path => { try { return (await readFile(path, 'utf8')).trim(); } catch { return null; } };
const summarize = (operation, limitMs) => {
	const start = performance.now();
	operation();
	const firstCallMs = performance.now() - start;
	for (let index = 0; index < policy.measurement.warmups; index++) { operation(); }
	const samples = [];
	for (let index = 0; index < policy.measurement.samples; index++) {
		const start = performance.now();
		operation();
		samples.push(performance.now() - start);
	}
	samples.sort((a, b) => a - b);
	const p95Ms = samples[Math.ceil(samples.length * policy.measurement.percentile / 100) - 1];
	return { firstCallMs, medianMs: samples[Math.ceil(samples.length / 2) - 1], p95Ms, limitMs, withinBudget: p95Ms <= limitMs };
};

const fixtures = [];
for (const graph of policy.graphs) {
	const sourceGraph = createDaiGraph(graph.elements);
	let allocated = 0;
	const model = v4 ? migrateSemanticModelToV4(sourceGraph, () => `benchmark.identity.${++allocated}`) : sourceGraph;
	assert.deepEqual(validateSemanticModel(model), []);
	assert.deepEqual([model.semantics.relations.length, model.views.length, model.views[0].nodes.length], [graph.relations, graph.views, graph.visibleNodes]);
	const units = createDaiEvidence(graph.elements);
	const packed = packDiagramEvidence(units);
	// Check every disclosed range and identity independently of the merging algorithm.
	for (const [index, row] of packed.units.entries()) {
		const unit = units[index];
		const file = packed.files[row[1]];
		const fragment = file.fragments.find(fragment => fragment.start <= unit.start && fragment.start + fragment.text.length >= unit.end);
		assert.deepEqual([row[0], file.path, row[2], row[3] ?? file.path, row[4], row[5], fragment?.text.slice(unit.start - fragment.start, unit.end - fragment.start)], [unit.ref, unit.file, unit.id ? 1 : 0, unit.name, unit.start, unit.end, unit.text]);
	}
	const bytes = Buffer.byteLength(JSON.stringify(packed));
	const unpackedBytes = Buffer.byteLength(JSON.stringify(units));
	const edited = applyVisualEdit(model, { kind: 'rename', id: 'component.1', target: 'element', name: 'Confirm Order' });
	assert.deepEqual([edited.views, edited.semantics.relations], [model.views, model.semantics.relations]);
	assert.equal(model.semantics.elements[1].name, 'Responsibility 1');
	assert.equal(getModelImpact(model, 'feature.checkout').scope.length, graph.elements);
	fixtures.push({
		id: graph.id, sourceGraphSha256: sha256(JSON.stringify(sourceGraph)), graphSha256: sha256(JSON.stringify(model)), evidenceSha256: sha256(JSON.stringify(units)),
		elements: graph.elements, relations: graph.relations, views: graph.views, visibleNodes: graph.visibleNodes,
		validation: summarize(() => validateSemanticModel(model), graph.validationP95Ms),
		edit: summarize(() => applyVisualEdit(model, { kind: 'rename', id: 'component.1', target: 'element', name: 'Confirm Order' }), graph.editP95Ms),
		impact: summarize(() => getModelImpact(model, 'feature.checkout'), graph.impactP95Ms),
		evidencePacking: summarize(() => packDiagramEvidence(units), graph.evidencePackingP95Ms),
		context: {
			kind: 'source-evidence-pack-only', unpackedBytes, packedBytes: bytes, reduction: 1 - bytes / unpackedBytes,
			maxInputBytes: policy.release.contextInputMaxBytes, withinInputBudget: bytes <= policy.release.contextInputMaxBytes,
			estimatedTokens: Math.ceil(bytes / 4), measuredInputTokens: null, measuredOutputTokens: null, price: null,
			allSourceRangesPreserved: true, semanticDependencyRecall: null,
			limit: 'Excludes instructions, output schema, semantic graph and provider overhead; not a sealed S11 context or a sufficiency result.'
		}
	});
}

const domainDirectory = 'src/vs/workbench/contrib/ade/common/';
const trackedSources = [
	'ade/scripts/benchmark-dai.mjs', 'ade/scripts/source-loader.mjs', 'ade/benchmarks/dai-fixtures.mjs', 'ade/ai/diagramEvidence.ts',
	...(await readdir(new URL(domainDirectory, root))).filter(file => file.endsWith('.ts')).sort().map(file => domainDirectory + file)
];
const peakRssMiB = process.resourceUsage().maxRSS / 1024;
const report = {
	version: 1, kind: 'local-deterministic-baseline', modelVersion: v4 ? 4 : 3, recordedAt: new Date().toISOString(), timezone: 'Europe/Rome',
	revision: git('rev-parse', 'HEAD'), workingTreeDirty: git('status', '--porcelain').length > 0,
	policy: { id: policy.id, sha256: sha256(policyBytes) },
	corpusSha256: sha256(await readFile(new URL('../docs/diagram-driven-ai/corpus.v1.json', import.meta.url))),
	sourceHashes: Object.fromEntries(await Promise.all(trackedSources.map(async path => [path, sha256(await readFile(new URL(path, root)))]))),
	hardware: { platform: platform(), arch: arch(), kernel: release(), node: process.version, cpu: cpus()[0]?.model, availableParallelism: availableParallelism(), hostMemoryMiB: totalmem() / 1024 / 1024, cgroupCpuMax: await optionalRead('/sys/fs/cgroup/cpu.max'), cgroupMemoryMax: await optionalRead('/sys/fs/cgroup/memory.max') },
	measurement: policy.measurement, fixtures,
	memory: { peakRssMiB, limitMiB: policy.release.processPeakRssMiB, withinBudget: peakRssMiB <= policy.release.processPeakRssMiB },
	provider: { calls: 0, model: null, measuredTokens: null, price: null },
	notMeasured: ['desktop input-to-paint', 'full context preparation', 'semantic dependency recall', 'business execution', 'live inference', 'continuous mode', 'archetype equivalence'],
	claim: 'Measures current domain operations and compact evidence packing on fixed synthetic graphs. No DAI release capability is certified by this report.'
};
const output = JSON.stringify(report, null, '\t') + '\n';
if (args.length === 0) { process.stdout.write(output); }
else {
	await writeFile(args[1], output, { flag: 'wx' });
	process.stdout.write(`Baseline saved to ${resolve(args[1])}\n`);
}
