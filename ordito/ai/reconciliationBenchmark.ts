import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { importCode } from '../code-import/importCode.ts';
import { readSnapshot, writeSnapshot } from '../code-import/snapshot.ts';
import { bindReconciliationIdentities } from '../code-import/reconciliationIdentity.ts';
import { prepareAiReconciliation, proposeAiReconciliation } from './reconciliation.ts';
import { readProviderConfig, type StructuredProvider } from './contracts.ts';
import { createCliProvider } from './providers.ts';
import type { BenchmarkCandidate } from './benchmark.ts';

const corpus = [
	{ language: 'python', file: 'payment.py', source: 'def pay(amount):\n    # Preserve this custom implementation.\n    return amount > 0\n' },
	{ language: 'java', file: 'Payment.java', source: 'class Payment { boolean pay(double amount) { /* Preserve custom code. */ return amount > 0; } }\n' },
	{ language: 'go', file: 'payment.go', source: 'package payment\n// Preserve custom code.\nfunc pay(amount float64) bool { return amount > 0 }\n' }
];

export interface ReconciliationBenchmark {
	version: 1;
	kind: 'live-reconciliation-benchmark' | 'simulated-reconciliation-benchmark';
	recordedAt: string;
	thresholds: { cases: number; requiredPassRate: number; scope: string };
	models: { candidate: BenchmarkCandidate; eligible: boolean; estimatedConsumption: number | null; cases: { language: string; direction: string; attempted: boolean; passed: boolean; inputBytes: number; outputBytes: number; inputTokens: number | null; outputTokens: number | null; durationMs: number; error?: string }[] }[];
	defaultModel: string | null;
}

/** Independent oracles check both directions and refusal of ambiguity, rather than accepting self-reported model success. */
export async function benchmarkReconciliation(candidates: BenchmarkCandidate[], signal?: AbortSignal, suppliedProvider?: StructuredProvider): Promise<ReconciliationBenchmark> {
	if (candidates.length < 2 || candidates.length > 3 || new Set(candidates.map(item => `${item.config.provider}:${item.config.model}`)).size !== candidates.length) { throw new Error('Compare two or three distinct models'); }
	for (const candidate of candidates) {
		readProviderConfig(candidate.config);
		if (candidate.config.maxCalls < 1) { throw new Error('Reconciliation benchmark requires a one-call budget per case'); }
		if (candidate.rates && (![candidate.rates.input, candidate.rates.output].every(value => Number.isFinite(value) && value >= 0) || !candidate.rates.unit || !candidate.rates.source || !Number.isFinite(Date.parse(candidate.rates.asOf)))) { throw new Error('Comparable nonnegative rates need a unit, source and date'); }
	}
	const report: ReconciliationBenchmark = { version: 1, kind: suppliedProvider ? 'simulated-reconciliation-benchmark' : 'live-reconciliation-benchmark', recordedAt: new Date().toISOString(), thresholds: { cases: 9, requiredPassRate: 1, scope: 'Python/Java/Go: model-to-code rename, code-to-model rename, explicit concurrent-contract conflict; structural identity and exact custom-code preservation. No claim of runtime behavior or universal language certification.' }, models: [], defaultModel: null };
	const provider = suppliedProvider ?? createCliProvider();
	const unavailable = new Map<string, string>();
	for (const candidate of candidates) {
		const results: ReconciliationBenchmark['models'][number]['cases'] = [];
		for (const sample of corpus) {
			for (const direction of ['model', 'code', 'concurrent']) {
				signal?.throwIfAborted();
				const started = performance.now();
				const result: typeof results[number] = { language: sample.language, direction, attempted: false, passed: false, inputBytes: 0, outputBytes: 0, inputTokens: null, outputTokens: null, durationMs: 0 };
				const providerKey = `${candidate.config.provider}:${candidate.config.executable}`;
				if (unavailable.has(providerKey)) { result.error = unavailable.get(providerKey); results.push(result); continue; }
				const directory = await mkdtemp(join(tmpdir(), 'ordito-reconciliation-benchmark-'));
				try {
					const root = join(directory, 'source'); await mkdir(root); await writeFile(join(root, sample.file), sample.source);
					const initial = await importCode(root, 'reconciliation-benchmark', { signal });
					const action = initial.files.flatMap(file => file.declarations).find(item => item.kind === 'action')!;
					const snapshotPath = join(directory, 'baseline'); await writeSnapshot(snapshotPath, initial, initial.model, undefined, undefined, signal);
					const renamed = sample.source.slice(0, action.nameEvidence!.start) + 'reconciledPayment' + sample.source.slice(action.nameEvidence!.end);
					const model = structuredClone(initial.model);
					const element = model.semantics.elements.find(item => item.id === action.id)!;
					if (direction === 'model') { element.name = 'reconciledPayment'; }
					if (direction === 'concurrent') { element.behavior = { inputs: [], outputs: [], preconditions: ['Reject zero amounts'], postconditions: [], errors: [], permissions: [], acceptanceCriteria: [] }; }
					await writeFile(join(snapshotPath, 'model.ordito.json'), JSON.stringify(model));
					if (direction === 'code') { await writeFile(join(root, sample.file), renamed); }
					if (direction === 'concurrent') { await writeFile(join(root, sample.file), sample.source.replace('amount > 0', 'amount >= 0')); }
					const previous = await readSnapshot(snapshotPath);
					const next = await importCode(root, initial.projectId, { previous: initial, signal });
					const prepared = await prepareAiReconciliation(previous, next, candidate.config, [sample.file], [], signal);
					result.inputBytes = prepared.metrics.inputBytes + prepared.metrics.schemaBytes;
					const measured: StructuredProvider = { async complete(config, prompt, schema, signal) {
						result.attempted = true;
						const response = await provider.complete(config, prompt, schema, signal);
						Object.assign(result, response.usage); result.outputBytes = Buffer.byteLength(JSON.stringify(response.value));
						return response;
					} };
					const response = await proposeAiReconciliation(prepared, previous, next, signal, measured);
					if (direction === 'concurrent') { result.passed = response.proposal.questions.length > 0 && !response.reconciliation.model; }
					else if (!response.proposal.questions.length && response.reconciliation.model) {
						if (direction === 'model') {
							result.passed = response.reconciliation.mutations.length === 1 && response.reconciliation.mutations[0].after === renamed && response.reconciliation.model.semantics.elements.some(item => item.id === action.id && item.name === 'reconciledPayment');
							if (result.passed) {
								await writeFile(join(root, sample.file), response.reconciliation.mutations[0].after);
								const refreshed = bindReconciliationIdentities(await importCode(root, initial.projectId, { previous: next, signal }), response.reconciliation.model, response.bindings);
								result.passed = refreshed.files.every(file => file.status === 'parsed') && refreshed.files.flatMap(file => file.declarations).some(item => item.id === action.id && item.name === 'reconciledPayment');
							}
						} else { result.passed = response.reconciliation.mutations.length === 0 && response.reconciliation.model.semantics.elements.some(item => item.id === action.id && item.name === 'reconciledPayment'); }
					}
				} catch (error) {
					signal?.throwIfAborted(); result.error = error instanceof Error ? error.message : 'Benchmark failed';
					if (/Provider (authentication failed|quota or rate limit)/.test(result.error)) { unavailable.set(providerKey, result.error); }
				}
				finally { result.durationMs = Math.round(performance.now() - started); results.push(result); await rm(directory, { recursive: true, force: true }); }
			}
		}
		const knownUsage = results.every(item => item.inputTokens !== null && item.outputTokens !== null);
		const estimatedConsumption = candidate.rates && knownUsage ? results.reduce((sum, item) => sum + item.inputTokens! * candidate.rates!.input + item.outputTokens! * candidate.rates!.output, 0) : null;
		report.models.push({ candidate, cases: results, eligible: results.length === 9 && results.every(item => item.passed), estimatedConsumption });
	}
	const eligible = report.models.filter(item => item.eligible);
	const units = new Set(eligible.map(item => item.candidate.rates?.unit));
	if (!suppliedProvider && eligible.length && eligible.every(item => item.estimatedConsumption !== null && item.candidate.rates) && units.size === 1) { report.defaultModel = eligible.sort((a, b) => a.estimatedConsumption! - b.estimatedConsumption!)[0].candidate.config.model; }
	return report;
}
