/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../scripts/source-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { benchmarkModels } = await import('../benchmark.ts');
import { config } from './fixtures.mjs';

test('three independent hidden oracles reject an incorrect economy model even when its generated tests pass', async () => {
	const implementations = {
		checkout: "export async function purchase(cart,gateway){const p=await gateway.charge(cart.total);return p.approved?{status:'confirmed',paymentId:p.id}:{status:'declined',reason:p.code};}",
		inventory: "export function reserve(stock,q){if(!Number.isInteger(q)||q<=0)return {ok:false,reason:'invalid_quantity'};if(q>stock.available)return {ok:false,reason:'out_of_stock'};stock.available-=q;return {ok:true,remaining:stock.available};}",
		authorization: "export function authorize(role,op){return ['read','delete'].includes(op)&&(role==='admin'||role==='user'&&op==='read');}"
	};
	const provider = { complete: async (selected, prompt, schema) => {
		const payload = JSON.parse(prompt.slice(prompt.indexOf('\n') + 1));
		const context = payload.context ?? payload;
		const source = context.sources[0]; const name = source.file.slice(0, -4); const testFile = name + '.test.mjs';
		const value = schema.properties.steps ? {
			summary: name, steps: [{ id: 'step', description: 'Implement and test', elementIds: ['benchmark-feature'], sourceFiles: [source.file, testFile] }], questions: [],
			changes: [{ file: source.file, kind: 'modify', reason: 'Implementation', elementIds: ['benchmark-feature'] }, { file: testFile, kind: 'create', reason: 'Acceptance', elementIds: ['benchmark-feature'] }],
			tests: [{ description: 'Acceptance', elementId: 'benchmark-feature', criterionId: 'acceptance' }], limitations: []
		} : { summary: name, files: [
			{ file: source.file, kind: 'modify', baseRevision: source.revision, content: selected.model === 'economy-fixture' ? source.content : implementations[name] },
			{ file: testFile, kind: 'create', baseRevision: null, content: "import 'node:test';\n" }
		], tests: [{ file: testFile, elementId: 'benchmark-feature', criterionId: 'acceptance' }] };
		return { value, usage: { inputTokens: 10, outputTokens: 20 }, cost: null };
	} };
	const report = await benchmarkModels(['economy-fixture', 'capable-fixture'].map(model => ({ config: { ...config, model } })), undefined, provider);
	assert.deepEqual({ kind: report.kind, results: report.models.map(model => ({ model: model.candidate.config.model, passed: model.cases.map(result => result.passed), eligible: model.eligible })), selected: report.defaultModel },
		{ kind: 'simulated-benchmark', results: [{ model: 'economy-fixture', passed: [false, false, false], eligible: false }, { model: 'capable-fixture', passed: [true, true, true], eligible: true }], selected: null });
});

test('rejected plan references retain measured usage and never turn missing token counts into zero', async () => {
	const provider = { complete: async (selected, prompt) => {
		const context = JSON.parse(prompt.slice(prompt.indexOf('\n') + 1));
		return { value: {
			summary: 'Invalid reference', steps: [{ id: 'step', description: 'Plan only', elementIds: [context.featureId], sourceFiles: [context.sources[0].file] }],
			questions: [], changes: [], tests: [{ description: 'Invented criterion', elementId: context.featureId, criterionId: 'not-in-the-contract' }], limitations: []
		}, usage: { inputTokens: selected.model === 'reported-fixture' ? 7 : null, outputTokens: 9 }, cost: null };
	} };
	const report = await benchmarkModels(['reported-fixture', 'partial-fixture'].map(model => ({ config: { ...config, model } })), undefined, provider);
	assert.deepEqual(report.models.map(model => model.cases.map(result => ({ passed: result.passed, failure: result.failure, calls: result.cliInvocations, input: result.inputTokens, output: result.outputTokens, usage: result.usage }))),
		[7, null].map(input => Array.from({ length: 3 }, () => ({ passed: false, failure: 'Plan test references an unknown acceptance criterion', calls: 1, input, output: 9, usage: [{ phase: 'plan', inputTokens: input, outputTokens: 9 }] }))));
});
