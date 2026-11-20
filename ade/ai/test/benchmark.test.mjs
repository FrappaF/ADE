import '../../scripts/source-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { selectBenchmarkDefault, benchmarkThresholds } = await import('../benchmark.ts');
import { config } from './fixtures.mjs';

const candidate = (model, cost) => ({ candidate: { config: { ...config, model }, rates: { input: cost, output: cost, unit: 'fixture-credits', source: 'fixture catalog', asOf: '2026-10-30' } }, eligible: true, estimatedConsumption: cost, cases: ['checkout', 'inventory', 'authorization'].map(repository => ({ repository, passed: true, traceability: 1, featureAttribution: 1, criterionCoverage: 1, durationMs: 1000, inputTokens: 20, outputTokens: 30, actualCost: null })) });
test('default uses the cheapest measured passing and available model, with comparable declared units', () => {
	const report = { version: 1, kind: 'live-provider-benchmark', thresholds: benchmarkThresholds, models: [candidate('capable', 10), candidate('economy', 1)] };
	assert.equal(selectBenchmarkDefault(report, ['capable', 'economy']), 'economy');
	assert.equal(selectBenchmarkDefault(report, ['capable']), 'capable');
	for (const alter of [value => { value.kind = 'simulated-benchmark'; }, value => { value.models.forEach(model => { model.estimatedConsumption = null; }); }, value => { value.models[0].candidate.rates.unit = 'other'; }]) {
		const changed = structuredClone(report); alter(changed);
		assert.equal(selectBenchmarkDefault(changed, ['capable', 'economy']), null);
	}
});
test('failed behavior, repeated repositories, incomplete tracing and excessive latency disqualify cheaper models', () => {
	const report = { version: 1, kind: 'live-provider-benchmark', models: [candidate('capable', 10), candidate('economy', 1)] };
	for (const alter of [value => { value.cases[0].passed = false; }, value => { value.cases[0].traceability = 0; }, value => { value.cases[0].criterionCoverage = 0; }, value => { value.cases[0].durationMs = 360001; }, value => { value.cases.forEach(result => { result.repository = 'same'; }); }]) {
		const changed = structuredClone(report); alter(changed.models[1]);
		assert.equal(selectBenchmarkDefault(changed, ['capable', 'economy']), 'capable');
	}
});
