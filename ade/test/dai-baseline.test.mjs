/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import './source-loader.mjs';
import { validateSemanticModel } from '../../src/vs/workbench/contrib/ade/common/semanticModel.ts';
import { createDaiGraph, createDaiEvidence } from '../benchmarks/dai-fixtures.mjs';

const root = new URL('../../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const readJson = async path => JSON.parse(await read(path));
const coverage = await readJson('ade/docs/diagram-driven-ai/coverage.json');
const corpus = await readJson('ade/docs/diagram-driven-ai/corpus.v1.json');
const budgets = await readJson('ade/docs/diagram-driven-ai/budgets.v1.json');
const hash = value => createHash('sha256').update(value).digest('hex');

test('DAI coverage assigns every requirement and step without certifying future capabilities', () => {
	assert.deepEqual(coverage.requirements.map(item => item.id), Array.from({ length: 16 }, (_, index) => `R${String(index + 1).padStart(2, '0')}`));
	assert.deepEqual(coverage.steps.map(item => item.id), Array.from({ length: 16 }, (_, index) => `S${String(index).padStart(2, '0')}`));
	for (const item of coverage.requirements) {
		assert.ok(item.owner && item.gap && item.exit && item.steps.length && item.sprints.length && item.cases.length, item.id);
		assert.equal(item.acceptanceStatus, 'open', item.id);
		assert.ok(['partial', 'missing'].includes(item.baselineStatus), item.id);
		if (item.baselineStatus === 'partial') { assert.ok(item.proof.length, item.id); }
		for (const step of item.steps) { assert.ok(coverage.steps.some(item => item.id === step), step); }
		for (const id of item.cases) { assert.ok(corpus.cases.some(item => item.id === id), id); }
	}
	assert.deepEqual(coverage.steps.map(item => item.status), ['delivered', 'delivered', 'delivered', 'delivered', 'delivered', 'delivered', 'delivered', 'delivered', 'delivered', 'delivered', 'delivered', 'started', 'started', 'delivered', 'delivered', 'started']);
});

test('baseline evidence links resolve to files and declared symbols rather than invented APIs', async () => {
	const references = new Set([
		...coverage.requirements.flatMap(item => [...item.schema, ...item.service, ...item.ui, ...item.proof]),
		...coverage.steps.flatMap(item => item.evidence),
		...coverage.requirements.flatMap(item => (item.increments ?? []).flatMap(increment => increment.evidence))
	]);
	for (const reference of references) {
		const [path, symbol] = reference.split('#');
		const content = await read(path);
		assert.ok(content.length && (!symbol || content.includes(symbol)), reference);
	}
});

test('authored corpus covers business, async, recovery and negative inputs with explicit independent observations', () => {
	assert.equal(corpus.executionStatus, 'pending-adapters');
	assert.equal(new Set(corpus.cases.map(item => item.id)).size, corpus.cases.length);
	const categories = new Set(corpus.cases.map(item => item.category));
	for (const category of ['checkout', 'stock', 'permissions', 'timeout', 'concurrency', 'states', 'queue', 'topic', 'migration', 'reconciliation', 'recovery', 'negative', 'incrementality', 'schema', 'frames']) {
		assert.ok(categories.has(category), category);
	}
	for (const item of corpus.cases) {
		assert.ok(item.mandatory && item.operation && Object.keys(item.input).length && Object.keys(item.expected).length, item.id);
		assert.match(item.sprint, /^DAI-(?:0[2-9]|1[0-2])$/);
		for (const id of item.requirements) { assert.ok(coverage.requirements.some(item => item.id === id), id); }
		for (const id of item.steps) { assert.ok(coverage.steps.some(item => item.id === id), id); }
		if (item.expected.outcome === 'blocked') {
			assert.equal(item.expected.calls, 0, item.id);
			assert.ok(item.expected.reason, item.id);
		}
	}
	assert.deepEqual(new Set(corpus.cases.flatMap(item => item.requirements)), new Set(coverage.requirements.map(item => item.id)));
});

test('fixed benchmark graphs are valid at every declared scale and contain no existing business verification', () => {
	for (const graph of budgets.graphs) {
		const model = createDaiGraph(graph.elements);
		assert.deepEqual(validateSemanticModel(model), [], graph.id);
		assert.deepEqual({ elements: model.semantics.elements.length, relations: model.semantics.relations.length, views: model.views.length, nodes: model.views[0].nodes.length, verifications: model.verifications }, { elements: graph.elements, relations: graph.relations, views: graph.views, nodes: graph.visibleNodes, verifications: [] });
		assert.deepEqual(createDaiGraph(graph.elements), model);
	}
});

test('frozen report binds budget, corpus and exact benchmark fixtures while retaining unmeasured results', async () => {
	const report = await readJson('ade/docs/benchmarks/dai-01-2026-11-08.json');
	assert.equal(report.policy.sha256, hash(await read('ade/docs/diagram-driven-ai/budgets.v1.json')));
	assert.equal(report.corpusSha256, hash(await read('ade/docs/diagram-driven-ai/corpus.v1.json')));
	assert.deepEqual(report.provider, { calls: 0, model: null, measuredTokens: null, price: null });
	assert.equal(budgets.frozenBeforeMeasurement, true);
	assert.equal(report.fixtures.length, budgets.graphs.length);
	for (const [index, fixture] of report.fixtures.entries()) {
		assert.equal(fixture.id, budgets.graphs[index].id);
		assert.equal(fixture.graphSha256, hash(JSON.stringify(createDaiGraph(fixture.elements))));
		assert.equal(fixture.evidenceSha256, hash(JSON.stringify(createDaiEvidence(fixture.elements))));
		assert.equal(fixture.context.semanticDependencyRecall, null);
		assert.equal(fixture.context.measuredInputTokens, null);
		assert.equal(fixture.context.price, null);
	}
});
