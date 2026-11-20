import '../../scripts/source-loader.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
const { benchmarkReconciliation } = await import('../reconciliationBenchmark.ts');

const config = { version: 1, provider: 'codex', connection: 'cli', model: 'economical', executable: 'codex', maxCalls: 1, timeoutMs: 10000, maxContextBytes: 262144 };
const empty = () => ({ summary: 'Reconciliation', questions: [], modelEdits: [], sourceEdits: [], bindings: [] });
test('multilingual cost/quality benchmark uses independent preservation oracles and never adopts simulated results', async () => {
	let calls = 0;
	const provider = { async complete(config, prompt) {
		calls++;
		const context = JSON.parse(prompt.slice(prompt.indexOf('\n') + 1));
		let value = empty();
		if (context.direction === 'both') { value.questions = ['Should zero be accepted or rejected?']; }
		else if (context.direction === 'model') {
			const action = context.changes.elements.find(item => item.model?.name === 'reconciledPayment');
			const fact = context.facts.flatMap(file => file.declarations).find(item => item.id === action.id);
			const source = context.sources[0];
			value.sourceEdits = [{ file: source.file, revision: source.revision, search: 'pay(', replacement: 'reconciledPayment(' }];
			value.bindings = [{ elementId: action.id, file: source.file, name: 'reconciledPayment', syntaxKind: fact.syntaxKind }];
			if (config.model === 'careless') { value.sourceEdits.push({ file: source.file, revision: source.revision, search: 'amount > 0', replacement: 'amount >= 0' }); }
		} else {
			const action = context.changes.elements.find(item => item.model?.name === 'pay');
			const fact = context.facts.flatMap(file => file.declarations).find(item => item.name === 'reconciledPayment');
			value.modelEdits = [{ collection: 'elements', id: action.id, value: { ...action.model, name: 'reconciledPayment' } }];
			value.bindings = [{ elementId: action.id, file: context.sources[0].file, name: 'reconciledPayment', syntaxKind: fact.syntaxKind }];
		}
		return { value, usage: { inputTokens: 100, outputTokens: 30 }, cost: null };
	} };
	const rates = { input: 0.000001, output: 0.000002, unit: 'USD', source: 'test quotation', asOf: '2026-11-05' };
	const report = await benchmarkReconciliation([{ config, rates }, { config: { ...config, model: 'careless' }, rates }], undefined, provider);
	assert.deepEqual({ calls, kind: report.kind, eligible: report.models.map(item => item.eligible), passed: report.models.map(item => item.cases.filter(result => result.passed).length), defaultModel: report.defaultModel }, { calls: 18, kind: 'simulated-reconciliation-benchmark', eligible: [true, false], passed: [9, 6], defaultModel: null });
	assert.ok(report.models.every(model => model.cases.every(result => result.inputBytes > 0 && result.outputBytes > 0 && result.inputTokens === 100)));
});

test('benchmark rejects zero budgets, invalid rates and duplicate candidates before any provider request', async () => {
	const provider = { async complete() { throw new Error('Must not invoke the provider'); } };
	await assert.rejects(benchmarkReconciliation([{ config }, { config }], undefined, provider), /distinct/);
	await assert.rejects(benchmarkReconciliation([{ config }, { config: { ...config, model: 'other', maxCalls: 0 } }], undefined, provider), /budget/);
	await assert.rejects(benchmarkReconciliation([{ config, rates: { input: -1 } }, { config: { ...config, model: 'other' } }], undefined, provider), /rates/);
});

test('authentication failure stops repeated calls and leaves quality/consumption unmeasured', async () => {
	let calls = 0;
	const report = await benchmarkReconciliation([{ config }, { config: { ...config, model: 'other' } }], undefined, { async complete() { calls++; throw new Error('Provider authentication failed. Refresh the CLI account.'); } });
	assert.deepEqual({ calls, attempted: report.models.flatMap(item => item.cases).filter(item => item.attempted).length, defaults: report.defaultModel, consumption: report.models.map(item => item.estimatedConsumption) }, { calls: 1, attempted: 1, defaults: null, consumption: [null, null] });
});
