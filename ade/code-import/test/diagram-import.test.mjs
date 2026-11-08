/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createCodeEngine } from '../nativeHost.ts';
import { readSnapshot } from '../snapshot.ts';
import { samples } from './samples.mjs';
import { expandDiagramContext, compactDiagramReply, plannedDiagramReply } from './compact-diagram-fixture.mjs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { todoFile, todoSource, todoFiles, interpretTodo } from './todo-semantic-fixture.mjs';

const config = { version: 1, provider: 'codex', connection: 'cli', model: 'economical-test-model', executable: 'codex', timeoutMs: 10000, maxContextBytes: 262144, maxCalls: 1 };
const feature = { key: 'checkout', name: 'Checkout', description: 'Coordinate purchase processing.' };
function interpretation(context) {
	const overview = context.step === 'overview';
	const result = {
		summary: 'Purchasing responsibilities and flows', questions: [], omissions: [], features: [feature],
		elements: context.required.filter(item => item.indexed).map(item => ({ symbol: item.ref, kind: 'action', name: 'Process ' + item.ref, description: 'Responsibility inferred from source', feature: feature.key, parent: null })),
		concepts: context.required.filter(item => !item.indexed).map(item => ({ key: 'purchase-' + item.ref, kind: 'resource', name: 'Purchase Record', description: 'Domain concept extracted from source', feature: feature.key, parent: null, source: item.ref })),
		relations: [], diagrams: [{ key: overview || context.step === 'project' ? 'overview' : 'processing-' + context.batch, name: overview || context.step === 'project' ? 'System Overview' : 'Purchase Processing ' + context.batch, kind: 'activity', feature: overview ? null : feature.key, nodes: overview ? context.responsibilities.map(item => item.ref) : context.required.map(item => item.indexed ? item.ref : 'c:purchase-' + item.ref), relations: [], intent: 'Inferred responsibilities; not observed runtime behavior' }]
	};
	const diagram = result.diagrams[0];
	result.diagrams = Array.from({ length: Math.ceil(diagram.nodes.length / 24) || 1 }, (_, i) => ({ ...diagram, key: i ? diagram.key + '-' + i : diagram.key, nodes: diagram.nodes.slice(i * 24, (i + 1) * 24) }));
	return result;
}
async function fixture(t, file = 'purchase.py', source = 'def purchase(amount):\n    return amount > 0\n', extras = {}) {
	const root = await mkdtemp(join(tmpdir(), 'ade-diagrams-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	await mkdir(dirname(join(root, file)), { recursive: true });
	await writeFile(join(root, file), source);
	for (const [name, content] of Object.entries(extras)) { await mkdir(dirname(join(root, name)), { recursive: true }); await writeFile(join(root, name), content); }
	let reply = interpretation;
	const prompts = [];
	const schemas = [];
	const provider = { async complete(selected, prompt, schema) {
		assert.equal(selected.model, config.model); assert.ok(schema.properties.diagrams || schema.properties.nodes || schema.properties.sourceEdits);
		const raw = JSON.parse(prompt.slice(prompt.indexOf('\n') + 1));
		if (raw.step === 'diagram') { return { value: plannedDiagramReply(raw), usage: { inputTokens: 100, outputTokens: 50 }, cost: null }; }
		schemas.push(schema);
		const context = expandDiagramContext(JSON.parse(prompt.slice(prompt.indexOf('\n') + 1))); prompts.push(context);
		return { value: compactDiagramReply(context, await reply(context)), usage: { inputTokens: 200, outputTokens: 100 }, cost: null };
	} };
	let engine = createCodeEngine(provider);
	const call = async request => JSON.parse(await engine.execute(JSON.stringify(request)));
	const initial = await call({ operation: 'import', root, syntaxOnly: true });
	const prepare = (snapshot = initial.snapshot, extra = {}) => call({ operation: 'diagramPrepare', snapshot, config: JSON.stringify(config), ...extra });
	const step = job => call({ operation: job.status === 'plan' ? 'diagramApprovePlan' : 'diagramStep', snapshot: initial.snapshot, id: job.id, reviewId: job.reviewId });
	const finish = async job => { while (job.status !== 'complete') { job = await step(job); } return job; };
	return { root, initial, prepare, step, finish, call, prompts, schemas, source, file, setReply: fn => { reply = fn; }, restart: () => { engine = createCodeEngine(provider); } };
}

test('compact coverage accepts indexed symbols represented entirely by inferred domain concepts', async t => {
	const f = await fixture(t);
	f.setReply(context => {
		const source = context.required[0].ref;
		return { summary: 'Domain model', questions: [], features: [feature], elements: [], concepts: [{ key: 'purchasing', kind: 'action', name: 'Process Purchase', description: 'Evaluate the purchase', feature: 'checkout', parent: null, source }], relations: [], diagrams: [{ key: 'overview', name: 'Purchase Processing', kind: 'activity', feature: null, nodes: ['c:purchasing'], relations: [], intent: 'One evidenced responsibility' }], coverage: { targets: Object.fromEntries(context.required.map(row => [row.ref, 'c:purchasing'])) } };
	});
	const done = await f.finish(await f.prepare());
	const model = (await readSnapshot(done.context.snapshot)).model;
	assert.equal(model.semantics.elements.filter(item => item.kind !== 'feature').length, 1);
	const context = f.prompts[0].compact;
	assert.equal(context.required, undefined); assert.equal(context.symbols, undefined);
	assert.deepEqual(f.schemas[0].properties.coverage.properties.targets.required, context.units.map(row => row[0]));
	const data = JSON.parse(await readFile(join(f.root, '.ade', 'diagram-imports', done.id + '.json'), 'utf8'));
	assert.ok(data.usage[0].inputBytes <= config.maxContextBytes * 0.75);
});

test('coverage vectors reject skipped rows, unknown targets and unexplained exclusions before publication', async t => {
	const f = await fixture(t);
	for (const failure of ['length', 'target', 'reason']) {
		f.setReply(context => {
			const value = compactDiagramReply(context, interpretation(context));
			if (failure === 'length') { delete value.coverage.targets[context.required.at(-1).ref]; }
			if (failure === 'target') { value.coverage.targets[context.required[0].ref] = 'c:unknown'; value.elements = []; }
			if (failure === 'reason') { value.elements = []; value.coverage.targets[context.required[0].ref] = 'x:missing'; }
			return value;
		});
		const job = await f.prepare();
		await assert.rejects(f.step(job), /coverage|exclusion|source evidence/);
		assert.equal((await f.call({ operation: 'inspect', snapshot: f.initial.snapshot })).diagramState, 'index');
		assert.equal(f.prompts.length, ['length', 'target', 'reason'].indexOf(failure) + 1, 'no automatic repair invocation');
	}
});

test('a coverage target is preserved when multiple concepts cite the same source anchor', async t => {
	const f = await fixture(t);
	f.setReply(context => {
		const source = context.required[0].ref;
		return { summary: 'Purchase and input', questions: [], features: [feature], elements: [], concepts: ['purchase', 'input'].map((key, index) => ({ key, kind: index ? 'contract' : 'action', name: index ? 'Purchase Amount' : 'Process Purchase', description: 'Evidenced responsibility', feature: 'checkout', parent: null, source })), relations: [{ key: 'input', from: 'c:purchase', to: 'c:input', kind: 'dependency', name: 'Checks amount', condition: null, evidence: [source], classification: 'inferred' }], diagrams: [{ key: 'overview', name: 'Purchase Processing', kind: 'structure', feature: null, nodes: ['c:purchase', 'c:input'], relations: ['input'], intent: 'Purchase and input' }], coverage: { targets: Object.fromEntries(context.required.map(row => [row.ref, 'c:input'])) } };
	});
	const done = await f.finish(await f.prepare());
	const data = JSON.parse(await readFile(join(f.root, '.ade', 'diagram-imports', done.id + '.json'), 'utf8'));
	assert.equal(data.results[0].omissions[0].representedBy, 'c:input');
});

test('u50 remains visible when its evidence primarily supports another declared object', async t => {
	const f = await fixture(t, 'tasks.py', Array.from({ length: 51 }, (_, i) => `def task_${i}():\n    return ${i}\n`).join('\n'));
	f.setReply(context => ({ summary: 'Task processing', questions: [], features: [feature],
		elements: [{ symbol: 'u50', kind: 'action', name: 'Process Task', description: 'Process a task', feature: 'checkout', parent: null }],
		concepts: [{ key: 'task', kind: 'resource', name: 'Task', description: 'Task data', feature: 'checkout', parent: null, source: 'u50' }],
		relations: [{ key: 'updates', kind: 'write', from: 'u50', to: 'task', name: 'Updates', condition: null, evidence: ['u50'], classification: 'inferred' }],
		diagrams: [{ key: 'overview', name: 'Task Processing', kind: 'structure', feature: null, nodes: ['u50', 'task'], relations: ['updates'], intent: 'Task processing and storage' }],
		coverage: { targets: Object.fromEntries(context.required.map((row, index) => [row.ref, index === 0 ? 'f:checkout' : 'task'])) }
	}));
	const done = await f.finish(await f.prepare());
	const model = (await readSnapshot(done.context.snapshot)).model;
	assert.deepEqual(model.semantics.elements.filter(item => item.kind !== 'feature').map(item => item.name).sort(), ['Process Task', 'Task']);
	assert.equal(model.views[0].nodes.length, 2);
	assert.equal(model.semantics.relations[0].kind, 'write');
	const checkpoint = JSON.parse(await readFile(join(f.root, '.ade', 'diagram-imports', done.id + '.json'), 'utf8'));
	assert.equal(checkpoint.results[0].omissions.find(item => item.symbol === 'u50').representedBy, 'c:task');
});

test('wire schema prevents invented source symbols and malformed parent references', async t => {
	const f = await fixture(t);
	await f.finish(await f.prepare());
	const validate = new Ajv2020().compile(f.schemas[0]);
	for (const issue of ['invented', 'parent', 'exclusion', 'static']) {
		const value = compactDiagramReply(f.prompts[0], interpretation(f.prompts[0]));
		if (issue === 'invented') { value.elements[0].symbol = 's:completed'; }
		if (issue === 'parent') { value.elements[0].parent = 'u0 u1'; }
		if (issue === 'exclusion') { value.coverage.targets.u0 = 'x:invented-reason'; }
		if (issue === 'static') { value.relations = [{ key: 'r', kind: 'dependency', from: 'u0', to: 'u0', name: 'Uses', condition: null, evidence: ['u0'], classification: 'static' }]; }
		assert.equal(validate(value), false, issue);
	}
});

test('nonadjacent exclusions including row 49 reference a shared reason without index lists', async t => {
	const f = await fixture(t, 'helpers.py', Array.from({ length: 60 }, (_, index) => `def helper_${index}():\n    return ${index}\n`).join('\n'));
	f.setReply(context => {
		const value = interpretation(context), first = value.elements[0];
		value.elements = [first]; value.concepts = []; value.diagrams = [{ ...value.diagrams[0], nodes: [first.symbol] }];
		delete value.omissions;
		return { ...value, coverage: { targets: Object.fromEntries(context.required.map((row, index) => [row.ref, index === 2 || index === 49 ? 'x:framework' : first.symbol])) } };
	});
	const done = await f.finish(await f.prepare());
	const saved = JSON.parse(await readFile(join(f.root, '.ade', 'diagram-imports', done.id + '.json'), 'utf8'));
	assert.deepEqual(saved.results[0].omissions.filter(item => item.representedBy === null).map(item => item.symbol), ['u2', 'u49']);
});

test('explicit resume supplies bounded validation feedback without replaying a failed response', async t => {
	const f = await fixture(t);
	f.setReply(context => { const value = compactDiagramReply(context, interpretation(context)); value.elements = []; value.coverage.targets[context.required[0].ref] = 'x:missing'; return value; });
	const job = await f.prepare();
	await assert.rejects(f.step(job), /coverage|schema|compact diagram/);
	f.setReply(interpretation);
	const done = await f.finish(await f.prepare(f.initial.snapshot, { resume: job.id }));
	assert.equal(done.calls, 2);
	assert.match(f.prompts[1].compact.previousValidation, /coverage/);
	assert.equal(f.prompts[1].compact.previousValidation.length < 1200, true);
	assert.equal(f.prompts[1].compact.failedResponse, undefined);
});

test('an incomplete legacy coverage job requests Start Again before making any CLI call', async t => {
	const f = await fixture(t), job = await f.prepare();
	const path = join(f.root, '.ade', 'diagram-imports', job.id + '.json');
	const checkpoint = JSON.parse(await readFile(path, 'utf8'));
	checkpoint.strategy = 'responsibilities'; checkpoint.status = 'failed';
	await writeFile(path, JSON.stringify(checkpoint));
	await assert.rejects(f.prepare(f.initial.snapshot, { resume: job.id }), /older evidence contract.*Start Again/);
	assert.equal(f.prompts.length, 0);
	const done = await f.finish(await f.prepare());
	assert.equal(done.status, 'complete');
});

test('the CLI schema structurally requires one coverage decision per disclosed unit', async t => {
	const f = await fixture(t);
	await f.finish(await f.prepare());
	const schema = f.schemas[0];
	const validate = new Ajv2020().compile(schema);
	const value = compactDiagramReply(f.prompts[0], interpretation(f.prompts[0]));
	assert.equal(validate(value), true);
	value.coverage.targets.u999 = 'u999';
	assert.equal(validate(value), false);
});

test('an input exceeding the reserved context budget stops before any provider invocation', async t => {
	const f = await fixture(t);
	const job = await f.prepare(f.initial.snapshot, { config: JSON.stringify({ ...config, maxContextBytes: 1024 }) });
	await assert.rejects(f.step(job), /Semantic context exceeds the configured budget/);
	assert.equal(f.prompts.length, 0);
	const checkpoint = JSON.parse(await readFile(join(f.root, '.ade', 'diagram-imports', job.id + '.json'), 'utf8'));
	assert.equal(checkpoint.calls, 0);
});

test('a small project is interpreted in one call with many source symbols supporting few responsibilities', async t => {
	const source = Array.from({ length: 43 }, (_, i) => `def purchase_${i}(amount):\n    return amount > ${i}\n`).join('\n');
	const f = await fixture(t, 'purchase.py', source);
	f.setReply(context => {
		const first = context.required[0].ref;
		return { summary: 'Evaluate purchase amounts', questions: [], features: [feature],
			elements: [{ symbol: first, kind: 'action', name: 'Evaluate Purchase Amount', description: 'Evaluate the amount against the configured thresholds', feature: 'checkout', parent: null }],
			omissions: context.required.slice(1).map(item => ({ symbol: item.ref, representedBy: first, reason: 'Another implementation of the same amount validation responsibility' })),
			concepts: [{ key: 'amount', kind: 'contract', name: 'Purchase Amount', description: 'The input amount used by the predicates', feature: 'checkout', parent: null, source: first }],
			relations: [{ key: 'input', kind: 'dependency', from: first, to: 'c:amount', name: 'Evaluates amount', condition: null, evidence: [first], classification: 'inferred' }],
			diagrams: [{ key: 'overview', name: 'Purchase Amount Validation', kind: 'structure', feature: 'checkout', nodes: [first, 'c:amount'], relations: ['input'], intent: 'Group related predicates into one responsibility and its input contract' }]
		};
	});
	const job = await f.prepare();
	assert.equal(job.symbols, 43); assert.equal(job.total, 1); assert.equal(f.prompts.length, 0);
	const done = await f.finish(job);
	assert.equal(done.status, 'complete'); assert.equal(f.prompts.length, 1); assert.equal(done.context.diagramState, 'diagrams');
	const current = await readSnapshot(done.context.snapshot), before = await readSnapshot(f.initial.snapshot);
	assert.equal(current.model.views.length, 1); assert.equal(current.model.views[0].nodes.length, 2);
	assert.equal(current.model.semantics.elements.length, 3);
	for (const declaration of before.state.files.flatMap(file => file.declarations)) {
		assert.ok(current.model.codeMappings.some(mapping => mapping.symbol === 'evidence:support:' + declaration.name || mapping.elementId === declaration.id), 'Every source symbol remains traceable');
	}
	assert.equal(await readFile(join(f.root, f.file), 'utf8'), source);
	assert.deepEqual((await readSnapshot(f.initial.snapshot)).model, before.model);
});

test('semantic import handles all deterministic language profiles and extracts an unindexed language', async t => {
	for (const [language, file, source] of [...samples, ['sql', 'purchase.sql', 'CREATE TABLE purchase (id INT PRIMARY KEY, amount DECIMAL);']]) {
		await t.test(language, async t => {
			const f = await fixture(t, file, source), done = await f.finish(await f.prepare());
			const current = await readSnapshot(done.context.snapshot);
			assert.ok(current.model.semantics.elements.some(item => item.kind === 'feature'));
			assert.ok(current.model.views.length >= 1);
			if (language === 'sql') { assert.ok(current.model.codeMappings.some(item => item.symbol.startsWith('evidence:concept:'))); assert.equal(f.prompts[0].symbols[0].content, source); }
			assert.equal(await readFile(join(f.root, file), 'utf8'), source);
		});
	}
});

test('resume after provider failure reuses completed batches across process restarts', async t => {
	const f = await fixture(t, 'purchase.py', Array.from({ length: 201 }, (_, i) => `def buy_${i}():\n    return ${i}\n`).join('\n'));
	let job = await f.step(await f.prepare()); assert.equal(job.completed, 1);
	assert.equal(f.schemas[0].properties.plan.minItems, 0, 'partial evidence batches need not invent a diagram proposal');
	f.setReply(() => { throw new Error('Provider unavailable'); });
	await assert.rejects(f.step(job), /Provider unavailable/);
	f.restart(); f.setReply(context => {
		if (context.step !== 'overview') { return interpretation(context); }
		return { summary: 'Shared processing capability', questions: [], features: [feature], elements: [], concepts: [{ key: 'processing', kind: 'component', name: 'Processing', description: 'Aggregate related predicates', feature: 'checkout', parent: null, source: context.sourceCatalog[0].ref }], omissions: context.sourceCatalog.map(item => ({ symbol: item.ref, representedBy: 'c:processing', reason: 'Implementation of the shared processing capability' })), relations: [], diagrams: [{ key: 'overview', name: 'Processing Capability', kind: 'structure', feature: null, nodes: ['c:processing'], relations: [], intent: 'Shared capability synthesized across all batches' }] };
	});
	job = await f.prepare(f.initial.snapshot, { resume: job.id });
	assert.equal(job.completed, 1); assert.equal(job.calls, 2);
	const done = await f.finish(job); assert.equal(done.calls, 8);
	assert.deepEqual(f.prompts.map(item => item.batch), [0, 1, 1, 2, 3, 4, 5, 6]);
});

test('missing symbol coverage and invalid references never replace the active model', async t => {
	const f = await fixture(t);
	for (const invalid of ['coverage', 'reference', 'file-list']) {
		f.setReply(context => { const value = interpretation(context); if (invalid === 'coverage') { value.elements = []; } else if (invalid === 'reference') { value.relations = [{ key: 'bad', kind: 'dependency', from: value.elements[0].symbol, to: 'u999', name: 'Unknown', condition: null, evidence: [value.elements[0].symbol], classification: 'inferred' }]; } else { value.diagrams[0].name = f.file; } return value; });
		const job = await f.prepare(); await assert.rejects(f.step(job), /skipped|Unknown|file listing|Selected responsibility|Invalid compact diagram/);
		assert.equal((await f.call({ operation: 'inspect', snapshot: f.initial.snapshot })).diagramState, 'index');
	}
});

test('zero budget, source changes and concurrent model edits block publication', async t => {
	const f = await fixture(t);
	const zero = await f.prepare(f.initial.snapshot, { config: JSON.stringify({ ...config, maxCalls: 0 }) });
	await assert.rejects(f.step(zero), /not enabled/); assert.equal(f.prompts.length, 0);
	const stale = await f.prepare(); await writeFile(join(f.root, f.file), f.source + '\n# changed\n');
	await assert.rejects(f.step(stale), /changed/); assert.equal(f.prompts.length, 0);
	await writeFile(join(f.root, f.file), f.source);
	const job = await f.prepare();
	f.setReply(async context => { const value = interpretation(context); const model = JSON.parse(await readFile(f.initial.model, 'utf8')); model.name = 'Concurrent Edit'; await writeFile(f.initial.model, JSON.stringify(model)); return value; });
	await assert.rejects(f.step(job), /changed/);
	assert.equal((await readSnapshot(f.initial.snapshot)).model.name, 'Concurrent Edit');
});

test('rebuilding retains manually edited semantic names and diagram positions', async t => {
	const f = await fixture(t), done = await f.finish(await f.prepare());
	const model = JSON.parse(await readFile(done.context.model, 'utf8'));
	const element = model.semantics.elements.find(item => item.kind === 'action'); element.name = 'My Purchase'; element.description = 'My Intent';
	const view = model.views[0]; view.nodes[0].x = 777; view.name = 'My Diagram';
	await writeFile(done.context.model, JSON.stringify(model));
	f.setReply(context => { assert.ok(context.features.some(item => item.key === 'checkout')); assert.ok(context.priorComposition.diagrams.some(item => item.key === 'overview')); const result = interpretation(context); result.features = []; return result; });
	let job = await f.prepare(done.context.snapshot);
	while (job.status !== 'complete') { job = await f.call({ operation: job.status === 'plan' ? 'diagramApprovePlan' : 'diagramStep', snapshot: done.context.snapshot, id: job.id, reviewId: job.reviewId }); }
	const current = await readSnapshot(job.context.snapshot);
	assert.equal(current.model.semantics.elements.find(item => item.id === element.id).name, 'My Purchase');
	assert.equal(current.model.views.find(item => item.id === view.id).nodes[0].x, 777);
	assert.equal(current.model.views.find(item => item.id === view.id).name, 'My Diagram');
	f.restart();
	const snapshot = job.context.snapshot; job = await f.prepare(snapshot);
	while (job.status !== 'complete') { job = await f.call({ operation: job.status === 'plan' ? 'diagramApprovePlan' : 'diagramStep', snapshot, id: job.id, reviewId: job.reviewId }); }
	assert.equal((await readSnapshot(job.context.snapshot)).model.views.find(item => item.id === view.id).nodes[0].x, 777);
});

test('deterministic interactions must be visible in a diagram, not just classified symbols', async t => {
	const f = await fixture(t, 'purchase.ts', 'export function charge(amount: number) { return amount > 0; }\nexport function purchase(amount: number) { return charge(amount); }');
	// The same boundary normally selects compiler evidence unless structure-only was chosen.
	const { createTypeScriptBundle } = await import('../typescriptSemantic.ts');
	const { applyScipBundles } = await import('../scip.ts');
	const { advanceDiagramImport, prepareDiagramImport, diagramProgress } = await import('../../ai/diagramImport.ts');
	const { importCode } = await import('../importCode.ts');
	const before = await readSnapshot(f.initial.snapshot);
	let state = await importCode(f.root, before.state.projectId, { previous: before.state });
	const compiled = await createTypeScriptBundle(state); state = await applyScipBundles(state, [compiled.bundle], undefined, true);
	assert.ok(state.semantic.dependencies.length);
	const job = await prepareDiagramImport(before, state, config);
	await assert.rejects(advanceDiagramImport(job, before, state, diagramProgress(job).reviewId, undefined, { async complete(_config, prompt) { const context = expandDiagramContext(JSON.parse(prompt.slice(prompt.indexOf('\n') + 1))); return { value: compactDiagramReply(context, interpretation(context)), usage: { inputTokens: 100, outputTokens: 100 }, cost: null }; } }), /omitted an evidenced interaction/);
});


test('incomplete parser coverage is disclosed and supplemented by AI text extraction', async t => {
	const f = await fixture(t, 'purchase.py', 'def purchase(amount):\n    return amount > 0\n\ndef incomplete(\n');
	assert.equal((await readSnapshot(f.initial.snapshot)).state.files[0].status, 'partial');
	const done = await f.finish(await f.prepare());
	assert.ok(f.prompts[0].required.some(item => !item.indexed));
	assert.deepEqual(f.prompts[0].coverage.partialFiles, ['purchase.py']);
	assert.ok((await readSnapshot(done.context.snapshot)).model.views.length > 0);
});


test('renaming a manually annotated source symbol asks for identity resolution before spending another call', async t => {
	const f = await fixture(t), done = await f.finish(await f.prepare());
	const model = JSON.parse(await readFile(done.context.model, 'utf8'));
	model.semantics.elements.find(item => item.kind === 'action').description = 'Keep my design intent';
	await writeFile(done.context.model, JSON.stringify(model));
	await writeFile(join(f.root, f.file), f.source.replace('purchase(', 'renamed_purchase('));
	const calls = f.prompts.length;
	await assert.rejects(f.prepare(done.context.snapshot), /confirm its identity/);
	assert.equal(f.prompts.length, calls);
});


test('a tiny Ruby TODO app becomes connected domain diagrams, not files, scaffolding and one-node views', async t => {
	const f = await fixture(t, todoFile, todoSource, todoFiles);
	f.setReply(interpretTodo);
	const before = await readSnapshot(f.initial.snapshot), done = await f.finish(await f.prepare());
	const current = await readSnapshot(done.context.snapshot);
	assert.equal(f.prompts.length, 1, 'the whole small application is interpreted together');
	assert.equal(current.model.views.length, 2);
	assert.equal(current.model.semantics.elements.length, 8);
	assert.ok(before.model.semantics.elements.length > current.model.semantics.elements.length);
	assert.ok(current.model.views.every(view => view.nodes.length >= 2 && view.relationIds.length >= 1));
	assert.ok(!current.model.semantics.elements.some(item => /\.(rb|erb)$|^config$|^test$/.test(item.name)));
	assert.ok(current.model.codeMappings.some(item => item.symbol.startsWith('evidence:support:')));
	assert.equal(current.state.files.length, before.state.files.length, 'the source index remains complete and sealed');
	let rebuilt = await f.prepare(done.context.snapshot);
	while (rebuilt.status !== 'complete') { rebuilt = await f.call({ operation: rebuilt.status === 'plan' ? 'diagramApprovePlan' : 'diagramStep', snapshot: done.context.snapshot, id: rebuilt.id, reviewId: rebuilt.reviewId }); }
	assert.equal((await readSnapshot(rebuilt.context.snapshot)).model.codeMappings.length, current.model.codeMappings.length);
	for (const [name, source] of Object.entries({ [f.file]: todoSource, ...todoFiles })) { assert.equal(await readFile(join(f.root, name), 'utf8'), source); }
});

test('redundant one-node drafts are compacted and missing aggregation targets still fail', async t => {
	for (const failure of ['one-node', 'missing-target']) {
		const f = await fixture(t, 'tasks.py', 'def create_task():\n    return 1\n\ndef complete_task():\n    return 2\n');
		f.setReply(context => {
			const result = interpretation(context);
			if (failure === 'one-node') { result.diagrams = result.elements.map((element, i) => ({ ...result.diagrams[0], key: 'single-' + i, nodes: [element.symbol] })); }
			else { const removed = result.elements.pop(); result.omissions = [{ symbol: removed.symbol, representedBy: 'c:missing', reason: 'Attempted aggregation' }]; result.diagrams[0].nodes = [result.elements[0].symbol]; }
			return result;
		});
		if (failure === 'one-node') {
			const done = await f.finish(await f.prepare());
			assert.ok((await readSnapshot(done.context.snapshot)).model.views.every(view => view.nodes.length >= 2));
			continue;
		}
		await assert.rejects(f.step(await f.prepare()), /one-element|missing responsibility|Unknown coverage responsibility/);
		assert.equal((await f.call({ operation: 'inspect', snapshot: f.initial.snapshot })).diagramState, 'index');
	}
});

test('code reconciliation preserves aggregated support instead of demanding every raw symbol back', async t => {
	const f = await fixture(t, 'pay.py', 'def buy(amount):\n    return amount > 0\n\ndef helper():\n    return True\n');
	f.setReply(context => {
		const first = context.symbols.find(item => item.name === 'buy').ref;
		return { summary: 'Payment validation', questions: [], features: [feature],
			elements: [{ symbol: first, kind: 'action', name: 'Process Payment', description: 'Check the payment amount', feature: 'checkout', parent: null }],
			omissions: context.required.filter(item => item.ref !== first).map(item => ({ symbol: item.ref, representedBy: first, reason: 'Supporting implementation of payment processing' })),
			concepts: [{ key: 'amount', kind: 'contract', name: 'Amount', description: 'Input amount', feature: 'checkout', parent: null, source: first }],
			relations: [{ key: 'input', kind: 'dependency', from: first, to: 'c:amount', name: 'Checks', condition: null, evidence: [first], classification: 'inferred' }],
			diagrams: [{ key: 'payment', name: 'Payment Validation', kind: 'activity', feature: 'checkout', nodes: [first, 'c:amount'], relations: ['input'], intent: 'Validation and its input' }]
		};
	});
	const done = await f.finish(await f.prepare());
	const model = JSON.parse(await readFile(done.context.model, 'utf8'));
	model.semantics.elements.find(item => item.kind === 'action').name = 'Purchase Request';
	await writeFile(done.context.model, JSON.stringify(model));
	f.setReply(context => {
		const item = context.changes.elements.find(item => item.model?.name === 'Purchase Request');
		const source = context.sources.find(item => item.file === f.file);
		const fact = context.facts.flatMap(file => file.declarations).find(item => item.name === 'buy');
		return { summary: 'Rename the reviewed implementation', questions: [], modelEdits: [], sourceEdits: [{ file: f.file, revision: source.revision, search: 'def buy(', replacement: 'def purchase(' }], bindings: [{ elementId: item.id, file: f.file, name: 'purchase', syntaxKind: fact.syntaxKind }] };
	});
	const preview = await f.call({ operation: 'preview', snapshot: done.context.snapshot });
	const review = await f.call({ operation: 'reconciliationPrepare', token: preview.token, config: JSON.stringify(config), sourceFiles: [f.file] });
	const proposed = await f.call({ operation: 'reconciliationPropose', token: preview.token, reviewId: review.reviewId });
	assert.equal(proposed.reconciliation.status, 'pending', JSON.stringify(proposed.reconciliation));
	const applied = await f.call({ operation: 'apply', token: preview.token });
	const current = await readSnapshot(applied.snapshot);
	assert.ok((await readFile(join(f.root, f.file), 'utf8')).includes('def purchase('));
	assert.equal(current.model.semantics.elements.length, 3);
	assert.ok(!current.model.semantics.elements.some(item => item.name === 'helper' || item.name === 'pay.py'));
	assert.ok(current.model.codeMappings.some(item => item.symbol.startsWith('evidence:support:')));
});

test('a symbol dump exceeding the small-project presentation budget cannot replace the index', async t => {
	const f = await fixture(t, 'tasks.py', Array.from({ length: 30 }, (_, i) => `def helper_${i}():\n    return ${i}\n`).join('\n'));
	await assert.rejects(f.step(await f.prepare()), /mirrors the source inventory|purposeful diagrams/);
	assert.equal((await f.call({ operation: 'inspect', snapshot: f.initial.snapshot })).diagramState, 'index');
});
