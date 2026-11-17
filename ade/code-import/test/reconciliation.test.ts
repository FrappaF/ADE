/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../scripts/source-loader.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, chmod, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { createCodeEngine } = await import('../../runtime/nativeHost.ts');
import { samples } from './samples.mjs';
const { readSnapshot } = await import('../snapshot.ts');
const { prepareAiReconciliation, proposeAiReconciliation, reconciliationSchema } = await import('../../ai/reconciliation.ts');
import { Ajv2020 } from 'ajv/dist/2020.js';
const { importCode } = await import('../importCode.ts');
const { runProcess } = await import('../../ai/process.ts');

const config = { version: 1, provider: 'codex', connection: 'cli', model: 'economical-test-model', executable: 'codex', timeoutMs: 10000, maxContextBytes: 262144, maxCalls: 1 };
const empty = () => ({ summary: 'Reviewed reconciliation', questions: [], modelEdits: [], sourceEdits: [], bindings: [] });

test('snapshot copies keep private sources private regardless of the process umask', async t => {
	if (process.platform === 'win32') { t.skip('POSIX permissions'); return; }
	const root = await mkdtemp(join(tmpdir(), 'ade-private-snapshot-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	await writeFile(join(root, 'private.py'), 'def private():\n    return 42\n', { mode: 0o600 });
	const engine = createCodeEngine();
	const result = JSON.parse(await engine.execute(JSON.stringify({ operation: 'import', root, syntaxOnly: true })));
	for (const directory of [join(root, '.ade'), join(root, '.ade', 'imports'), result.snapshot]) { assert.equal((await stat(directory)).mode & 0o077, 0, directory); }
	for (const file of ['common-code.json', 'import-state.json', 'model.ade.json', 'snapshot.json']) { assert.equal((await stat(join(result.snapshot, file))).mode & 0o077, 0, file); }
});

test('identity handles never translate names, source names or prototype properties', async t => {
	const f = await fixture(t, 'i0.py', 'def i0(amount):\n    return amount > 0\n');
	const snapshot = await readSnapshot(f.initial.snapshot);
	const action = snapshot.model.semantics.elements.find(element => element.kind === 'action');
	action.description = 'constructor';
	await writeFile(f.initial.model, JSON.stringify(snapshot.model));
	f.setReply(context => {
		const changed = context.changes.elements.find(entry => entry.model?.description === 'constructor');
		assert.ok(changed);
		return { ...empty(), modelEdits: [{ collection: 'elements', id: changed.id, value: { ...changed.model, name: 'i0', description: 'toString' } }], bindings: [{ elementId: changed.id, file: 'i0.py', name: 'i0', syntaxKind: 'function_definition' }] };
	});
	const preview = await f.call({ operation: 'preview', snapshot: f.initial.snapshot });
	const { prepared, result } = await f.propose(preview, ['i0.py']);
	assert.equal(JSON.parse(prepared.designContents).changes.elements.find(entry => entry.model?.description === 'constructor').model.description, 'constructor');
	assert.notEqual(result.reconciliation.status, 'verificationFailed', JSON.stringify(result.reconciliation.diagnostics));
	assert.equal(result.ai.modelEdits[0].value.name, 'i0');
	assert.equal(result.ai.modelEdits[0].value.description, 'toString');
	assert.equal(result.ai.bindings[0].name, 'i0');
});

test('reconciliation transport uses strict structured output objects and nullable optional fields', () => {
	const inspect = schema => {
		assert.equal(schema.oneOf, undefined);
		assert.equal(schema.const, undefined);
		if (schema.properties) {
			assert.equal(schema.additionalProperties, false);
			assert.deepEqual(schema.required.slice().sort(), Object.keys(schema.properties).sort());
			Object.values(schema.properties).forEach(inspect);
		}
		if (schema.items) { inspect(schema.items); }
		schema.anyOf?.forEach(inspect);
	};
	inspect(reconciliationSchema);
	const validate = new Ajv2020().compile(reconciliationSchema);
	const value = { ...empty(), modelEdits: [{ collection: 'elements', id: 'i0', value: { id: 'i0', kind: 'action', name: 'Pay', description: null, parentId: null, behavior: null, legacyKind: null, details: null } }, { collection: 'relations', id: 'i1', value: null }] };
	assert.equal(validate(value), true, JSON.stringify(validate.errors));
	delete value.modelEdits[0].value.description;
	assert.equal(validate(value), false);
});
async function fixture(t, file = 'pay.py', source = 'def pay(amount):\n    return amount > 0\n') {
	const root = await mkdtemp(join(tmpdir(), 'ade-reconcile-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	await writeFile(join(root, file), source);
	let reply = () => empty(), calls = 0;
	const engine = createCodeEngine({ async complete(selected, prompt) {
		calls++; assert.equal(selected.model, config.model);
		return { value: reply(JSON.parse(prompt.slice(prompt.indexOf('\n') + 1))), usage: { inputTokens: 120, outputTokens: 60 }, cost: null };
	} });
	const call = async request => JSON.parse(await engine.execute(JSON.stringify(request)));
	const initial = await call({ operation: 'import', root, syntaxOnly: true });
	const propose = async (preview, files = [file], chosenConfig = config) => {
		const prepared = await call({ operation: 'reconciliationPrepare', token: preview.token, config: JSON.stringify(chosenConfig), sourceFiles: files });
		return { prepared, result: await call({ operation: 'reconciliationPropose', token: preview.token, reviewId: prepared.reviewId }) };
	};
	return { root, initial, call, propose, setReply: value => { reply = value; }, get calls() { return calls; } };
}

test('strict nullable output publishes a model edit without persisting transport nulls', async t => {
	const f = await fixture(t);
	const snapshot = await readSnapshot(f.initial.snapshot);
	snapshot.model.semantics.elements.find(element => element.kind === 'action').description = 'Reviewed note';
	await writeFile(f.initial.model, JSON.stringify(snapshot.model));
	f.setReply(context => {
		const changed = context.changes.elements.find(item => item.model?.description === 'Reviewed note');
		assert.ok(changed);
		return { ...empty(), modelEdits: [{ collection: 'elements', id: changed.id, value: { description: null, parentId: null, behavior: null, legacyKind: null, details: null, ...changed.model } }] };
	});
	const preview = await f.call({ operation: 'preview', snapshot: f.initial.snapshot });
	const { prepared, result } = await f.propose(preview);
	assert.deepEqual(JSON.parse(prepared.contents).schema, reconciliationSchema);
	assert.notEqual(result.reconciliation.status, 'verificationFailed', JSON.stringify(result.reconciliation.diagnostics));
	const applied = await f.call({ operation: 'apply', token: result.token });
	const model = (await readSnapshot(applied.snapshot)).model;
	assert.ok(model.semantics.elements.every(element => Object.values(element).every(value => value !== null)));
});

test('AI proposes model-to-code and code-to-model changes with stable identities in all 16 language profiles', async t => {
	for (const [language, file, source] of samples) {
		await t.test(language, async t => {
			const f = await fixture(t, file, source);
			const snapshot = await readSnapshot(f.initial.snapshot);
			const declaration = snapshot.state.files[0].declarations.find(item => item.kind === 'action');
			assert.ok(declaration);
			const model = snapshot.model;
			const element = model.semantics.elements.find(item => item.id === declaration.id);
			element.name = 'Renamed'; element.description = 'Custom explanation';
			const node = model.views.flatMap(view => view.nodes).find(item => item.elementId === element.id);
			node.x = 777; node.y = 333;
			await writeFile(f.initial.model, JSON.stringify(model));
			const transformed = source.slice(0, declaration.nameEvidence.start) + 'Renamed' + source.slice(declaration.nameEvidence.end);
			f.setReply(context => {
				const delta = context.changes.elements.find(item => item.model?.name === 'Renamed');
				return { ...empty(), sourceEdits: [{ file, revision: context.sources[0].revision, search: source, replacement: transformed }], bindings: [{ elementId: delta.id, file, name: 'Renamed', syntaxKind: declaration.syntaxKind }] };
			});
			const preview = await f.call({ operation: 'preview', snapshot: f.initial.snapshot });
			assert.equal(preview.reconciliation.origin, 'model');
			await assert.rejects(f.call({ operation: 'apply', token: preview.token }), /review|expired|conflicts/);
			// A rejected application consumes the token. Prepare an explicit fresh review.
			const nextPreview = await f.call({ operation: 'preview', snapshot: f.initial.snapshot });
			const { result } = await f.propose(nextPreview);
			assert.deepEqual(result.reconciliation.diagnostics, []);
			const applied = await f.call({ operation: 'apply', token: result.token });
			const current = await readSnapshot(applied.snapshot);
			assert.deepEqual({ source: await readFile(join(f.root, file), 'utf8'), name: current.model.semantics.elements.find(item => item.id === element.id).name, note: current.model.semantics.elements.find(item => item.id === element.id).description, position: current.model.views.flatMap(view => view.nodes).find(item => item.elementId === element.id) }, { source: transformed, name: 'Renamed', note: 'Custom explanation', position: { elementId: element.id, x: 777, y: 333 } });
			assert.equal((await f.call({ operation: 'preview', snapshot: applied.snapshot })).reconciliation.status, 'aligned');
			const observed = current.state.files[0].declarations.find(item => item.id === element.id);
			const external = transformed.slice(0, observed.nameEvidence.start) + 'FromCode' + transformed.slice(observed.nameEvidence.end);
			await writeFile(join(f.root, file), external);
			f.setReply(context => {
				const removed = context.changes.elements.find(item => item.model?.name === 'Renamed');
				return { ...empty(), modelEdits: [{ collection: 'elements', id: removed.id, value: { ...removed.model, name: 'FromCode' } }], bindings: [{ elementId: removed.id, file, name: 'FromCode', syntaxKind: declaration.syntaxKind }] };
			});
			const codePreview = await f.call({ operation: 'preview', snapshot: applied.snapshot });
			const codeProposal = (await f.propose(codePreview)).result;
			assert.deepEqual(codeProposal.reconciliation.diagnostics, []);
			const reconciled = await f.call({ operation: 'apply', token: codeProposal.token });
			assert.equal((await readSnapshot(reconciled.snapshot)).model.semantics.elements.find(item => item.id === element.id).name, 'FromCode');
			assert.equal(await readFile(join(f.root, file), 'utf8'), external);
			assert.equal(f.calls, 2);
		});
	}
});

test('concurrent contracts stay unresolved when AI asks for clarification; zero budget sends no data', async t => {
	const f = await fixture(t);
	const model = JSON.parse(await readFile(f.initial.model, 'utf8'));
	model.semantics.elements.find(item => item.kind === 'action').behavior = { inputs: [], outputs: [], preconditions: ['amount must be positive'], postconditions: [], errors: [], permissions: [], acceptanceCriteria: [] };
	await writeFile(f.initial.model, JSON.stringify(model));
	await writeFile(join(f.root, 'pay.py'), 'def pay(amount, currency):\n    return amount >= 0\n');
	f.setReply(() => ({ ...empty(), questions: ['Should zero amounts be accepted?'] }));
	const preview = await f.call({ operation: 'preview', snapshot: f.initial.snapshot });
	assert.equal(preview.reconciliation.origin, 'both');
	const zero = await f.call({ operation: 'reconciliationPrepare', token: preview.token, config: JSON.stringify({ ...config, maxCalls: 0 }), sourceFiles: ['pay.py'] });
	const blocked = await f.call({ operation: 'reconciliationPropose', token: preview.token, reviewId: zero.reviewId });
	assert.equal(blocked.reconciliation.status, 'verificationFailed'); assert.equal(f.calls, 0);
	const fresh = await f.call({ operation: 'preview', snapshot: f.initial.snapshot });
	const proposal = (await f.propose(fresh)).result;
	assert.deepEqual({ status: proposal.reconciliation.status, questions: proposal.ai.questions }, { status: 'conflict', questions: ['Should zero amounts be accepted?'] });
	await assert.rejects(f.call({ operation: 'apply', token: proposal.token }), /conflicts/);
	assert.equal(JSON.parse(await readFile(join(f.root, '.ade/code-project.json'), 'utf8')).active, f.initial.snapshot.split('/').pop());
});

test('source anchors, malformed output, stale models and later permissions never bypass deterministic checks', async t => {
	const f = await fixture(t);
	f.setReply(context => ({ ...empty(), sourceEdits: [{ file: '../outside.py', revision: context.sources[0].revision, search: 'pay', replacement: 'bad' }] }));
	let preview = await f.call({ operation: 'preview', snapshot: f.initial.snapshot });
	assert.equal((await f.propose(preview)).result.reconciliation.status, 'verificationFailed');
	f.setReply(() => ({ ...empty(), shell: 'forbidden' }));
	preview = await f.call({ operation: 'preview', snapshot: f.initial.snapshot });
	assert.equal((await f.propose(preview)).result.reconciliation.status, 'verificationFailed');
	f.setReply(() => empty());
	preview = await f.call({ operation: 'preview', snapshot: f.initial.snapshot });
	const approved = (await f.propose(preview)).result;
	const model = JSON.parse(await readFile(f.initial.model, 'utf8')); model.name = 'Edited later'; await writeFile(f.initial.model, JSON.stringify(model));
	await assert.rejects(f.call({ operation: 'apply', token: approved.token }), /stale|changed/);
	assert.match(await readFile(join(f.root, 'pay.py'), 'utf8'), /def pay/);
});

test('compact prompts bound context, exclude unrelated secrets and distinguish token estimates from usage', async t => {
	const f = await fixture(t);
	await writeFile(join(f.root, 'credentials.env'), 'DO_NOT_DISCLOSE');
	await writeFile(join(f.root, 'pay.py'), 'def pay(amount):\n    return amount > 0\n' + '# unrelated\n'.repeat(3000));
	const previous = await readSnapshot(f.initial.snapshot);
	const next = await importCode(f.root, previous.state.projectId, { previous: previous.state });
	const prepared = await prepareAiReconciliation(previous, next, config, ['pay.py']);
	assert.ok(prepared.metrics.disclosedBytes < prepared.metrics.sourceBytes / 4);
	assert.ok(prepared.metrics.inputBytes + prepared.metrics.schemaBytes <= config.maxContextBytes);
	assert.equal(prepared.prompt.includes('DO_NOT_DISCLOSE'), false);
	assert.equal(prepared.prompt.includes(previous.state.projectId), false);
	await assert.rejects(prepareAiReconciliation(previous, next, config, ['credentials.env']), /disclosure/);
	await assert.rejects(proposeAiReconciliation({ ...prepared, reviewId: 'changed' }, previous, next, undefined, { complete() { throw new Error('must not run'); } }), /stale/);
});

test('undo and restart recovery restore exact images and preserve unrecognized manual edits', async t => {
	const f = await fixture(t);
	const source = await readFile(join(f.root, 'pay.py'), 'utf8');
	const current = JSON.parse(await readFile(f.initial.model, 'utf8'));
	current.semantics.elements.find(item => item.kind === 'action').name = 'renamed';
	await writeFile(f.initial.model, JSON.stringify(current));
	f.setReply(context => {
		const item = context.changes.elements.find(item => item.model?.name === 'renamed');
		return { ...empty(), sourceEdits: [{ file: 'pay.py', revision: context.sources[0].revision, search: source, replacement: source.replace('pay(', 'renamed(') }], bindings: [{ elementId: item.id, file: 'pay.py', name: 'renamed', syntaxKind: 'function_definition' }] };
	});
	const preview = await f.call({ operation: 'preview', snapshot: f.initial.snapshot });
	const proposal = (await f.propose(preview)).result;
	const applied = await f.call({ operation: 'apply', token: proposal.token });
	const history = await f.call({ operation: 'history', snapshot: applied.snapshot });
	const operation = history.operations[0];
	const originalMode = (await stat(join(f.root, 'pay.py'))).mode & 0o777;
	await chmod(join(f.root, 'pay.py'), originalMode ^ 0o100);
	await assert.rejects(f.call({ operation: 'undoSync', snapshot: applied.snapshot, id: operation.id }), /edits/);
	await chmod(join(f.root, 'pay.py'), originalMode);
	await f.call({ operation: 'undoSync', snapshot: applied.snapshot, id: operation.id });
	assert.equal(await readFile(join(f.root, 'pay.py'), 'utf8'), source);
	// Reproduce a crash after one source write but before shared-baseline publication.
	const path = join(f.root, '.ade/reconciliation', operation.id + '.json');
	const journal = JSON.parse(await readFile(path, 'utf8')); journal.status = 'reconciling'; delete journal.toHash;
	await writeFile(path, JSON.stringify(journal));
	await writeFile(join(f.root, 'pay.py'), source.replace('pay(', 'renamed('));
	await assert.rejects(f.call({ operation: 'preview', snapshot: f.initial.snapshot }), /recovery/);
	const restarted = createCodeEngine();
	await restarted.execute(JSON.stringify({ operation: 'recoverSync', snapshot: f.initial.snapshot, id: operation.id }));
	assert.equal(await readFile(join(f.root, 'pay.py'), 'utf8'), source);
	assert.equal(JSON.parse(await readFile(path, 'utf8')).status, 'rolledBack');
});

test('AI handles a language without a parser and labels textual interpretation separately from compiler evidence', async t => {
	const source = 'CREATE TABLE orders (id INTEGER PRIMARY KEY);\n';
	const f = await fixture(t, 'schema.sql', source);
	f.setReply(() => ({ ...empty(), modelEdits: [{ collection: 'elements', id: 'orders-table', value: { id: 'orders-table', kind: 'resource', name: 'Orders' } }], bindings: [{ elementId: 'orders-table', file: 'schema.sql', name: 'orders', syntaxKind: 'ai' }] }));
	let preview = await f.call({ operation: 'preview', snapshot: f.initial.snapshot });
	let proposal = (await f.propose(preview, ['schema.sql'])).result;
	assert.deepEqual(proposal.reconciliation.diagnostics, []);
	const applied = await f.call({ operation: 'apply', token: proposal.token });
	const current = await readSnapshot(applied.snapshot);
	assert.deepEqual(current.model.codeMappings.map(item => [item.elementId, item.file, item.symbol]), [['orders-table', 'schema.sql', 'ai:orders']]);
	assert.equal(current.model.views[0].nodes[0].elementId, 'orders-table');
	assert.equal((await f.call({ operation: 'preview', snapshot: applied.snapshot })).reconciliation.status, 'aligned');
	await writeFile(join(f.root, 'schema.sql'), source.replace('id INTEGER', 'id BIGINT'));
	preview = await f.call({ operation: 'preview', snapshot: applied.snapshot });
	assert.deepEqual({ origin: preview.reconciliation.origin, status: preview.reconciliation.status }, { origin: 'code', status: 'pending' });
	f.setReply(context => {
		const element = context.neighbors.find(item => item.name === 'Orders');
		return { ...empty(), modelEdits: [{ collection: 'elements', id: element.id, value: { ...element, description: 'id BIGINT' } }], bindings: [{ elementId: element.id, file: 'schema.sql', name: 'orders', syntaxKind: 'ai' }] };
	});
	proposal = (await f.propose(preview, ['schema.sql'])).result;
	const fromCode = await f.call({ operation: 'apply', token: proposal.token });
	const updated = await readSnapshot(fromCode.snapshot);
	assert.equal(updated.model.semantics.elements[0].description, 'id BIGINT');
	updated.model.semantics.elements[0].name = 'Purchases';
	await writeFile(fromCode.model, JSON.stringify(updated.model));
	f.setReply(context => {
		const element = context.changes.elements.find(item => item.model?.name === 'Purchases');
		return { ...empty(), sourceEdits: [{ file: 'schema.sql', revision: context.sources[0].revision, search: 'orders', replacement: 'purchases' }], bindings: [{ elementId: element.id, file: 'schema.sql', name: 'purchases', syntaxKind: 'ai' }] };
	});
	preview = await f.call({ operation: 'preview', snapshot: fromCode.snapshot });
	proposal = (await f.propose(preview, ['schema.sql'])).result;
	assert.deepEqual(proposal.reconciliation.diagnostics, []);
	const fromModel = await f.call({ operation: 'apply', token: proposal.token });
	assert.equal(await readFile(join(f.root, 'schema.sql'), 'utf8'), source.replace('orders', 'purchases').replace('id INTEGER', 'id BIGINT'));
	assert.equal((await f.call({ operation: 'preview', snapshot: fromModel.snapshot })).reconciliation.status, 'aligned');
});

test('a Python behavioral change applies and undoes with independent runtime checks', async t => {
	const f = await fixture(t);
	const model = JSON.parse(await readFile(f.initial.model, 'utf8'));
	model.semantics.elements.find(item => item.kind === 'action').behavior = { inputs: [{ name: 'amount', type: 'number', required: true }], outputs: [{ name: 'accepted', type: 'boolean', required: true }], preconditions: [], postconditions: ['Accept zero and positive amounts; reject negative amounts'], errors: [], permissions: [], acceptanceCriteria: [] };
	await writeFile(f.initial.model, JSON.stringify(model));
	f.setReply(context => ({ ...empty(), sourceEdits: [{ file: 'pay.py', revision: context.sources[0].revision, search: 'return amount > 0', replacement: 'return amount >= 0' }] }));
	const preview = await f.call({ operation: 'preview', snapshot: f.initial.snapshot });
	const proposal = (await f.propose(preview)).result;
	const applied = await f.call({ operation: 'apply', token: proposal.token });
	const verify = async expected => {
		const result = await runProcess('python3', ['-B', '-c', `from pay import pay; assert [pay(-1),pay(0),pay(1)] == ${expected}`], f.root, { timeoutMs: 10000 });
		assert.equal(result.code, 0, result.stderr);
	};
	await verify('[False, True, True]');
	const history = await f.call({ operation: 'history', snapshot: applied.snapshot });
	await f.call({ operation: 'undoSync', snapshot: applied.snapshot, id: history.operations[0].id });
	await verify('[False, False, True]');
});

test('layout and JSON formatting alone stay aligned without inference or source writes', async t => {
	const f = await fixture(t);
	const source = await readFile(join(f.root, 'pay.py'), 'utf8');
	const model = JSON.parse(await readFile(f.initial.model, 'utf8'));
	model.views[0].nodes[0].x += 123;
	await writeFile(f.initial.model, JSON.stringify(model, null, 4));
	const preview = await f.call({ operation: 'preview', snapshot: f.initial.snapshot });
	assert.deepEqual({ status: preview.reconciliation.status, calls: f.calls, source: await readFile(join(f.root, 'pay.py'), 'utf8') }, { status: 'aligned', calls: 0, source });
});

test('identical reviewed payloads reuse a proposal without another model call', async t => {
	const f = await fixture(t);
	const first = await f.call({ operation: 'preview', snapshot: f.initial.snapshot });
	await f.propose(first);
	const second = await f.call({ operation: 'preview', snapshot: f.initial.snapshot });
	const reused = (await f.propose(second)).result;
	assert.deepEqual({ calls: f.calls, cached: reused.ai.cached, usage: reused.ai.usage }, { calls: 1, cached: true, usage: { inputTokens: 0, outputTokens: 0 } });
});

test('failed source verification rolls back before advancing the common revision', async t => {
	const f = await fixture(t);
	const original = await readFile(join(f.root, 'pay.py'), 'utf8');
	const model = JSON.parse(await readFile(f.initial.model, 'utf8'));
	model.semantics.elements.find(item => item.kind === 'action').name = 'renamed';
	await writeFile(f.initial.model, JSON.stringify(model));
	f.setReply(context => ({ ...empty(), sourceEdits: [{ file: 'pay.py', revision: context.sources[0].revision, search: original, replacement: 'def renamed(:\n    return True\n' }] }));
	const preview = await f.call({ operation: 'preview', snapshot: f.initial.snapshot });
	const proposal = (await f.propose(preview)).result;
	await assert.rejects(f.call({ operation: 'apply', token: proposal.token }), /verification/);
	const history = await f.call({ operation: 'history', snapshot: f.initial.snapshot });
	assert.deepEqual({ source: await readFile(join(f.root, 'pay.py'), 'utf8'), journal: history.operations[0].status, active: JSON.parse(await readFile(join(f.root, '.ade/code-project.json'), 'utf8')).active }, { source: original, journal: 'rolledBack', active: f.initial.snapshot.split('/').pop() });
});

test('AI chooses semantic roles and human diagram labels independently of syntax and code identifiers', async t => {
	const f = await fixture(t);
	const model = JSON.parse(await readFile(f.initial.model, 'utf8'));
	const action = model.semantics.elements.find(item => item.kind === 'action');
	action.kind = 'controller'; action.name = 'Conferma acquisto';
	await writeFile(f.initial.model, JSON.stringify(model));
	f.setReply(context => {
		const element = context.changes.elements.find(item => item.model?.name === 'Conferma acquisto');
		return { ...empty(), sourceEdits: [{ file: 'pay.py', revision: context.sources[0].revision, search: 'def pay(', replacement: 'def confirm_purchase(' }], bindings: [{ elementId: element.id, file: 'pay.py', name: 'confirm_purchase', syntaxKind: 'function_definition' }] };
	});
	const preview = await f.call({ operation: 'preview', snapshot: f.initial.snapshot });
	const proposal = (await f.propose(preview)).result;
	const applied = await f.call({ operation: 'apply', token: proposal.token });
	const snapshot = await readSnapshot(applied.snapshot);
	assert.deepEqual({ name: snapshot.model.semantics.elements.find(item => item.id === action.id).name, kind: snapshot.model.semantics.elements.find(item => item.id === action.id).kind, symbol: snapshot.model.codeMappings.find(item => item.elementId === action.id).symbol }, { name: 'Conferma acquisto', kind: 'controller', symbol: 'function_definition:confirm_purchase' });
	assert.equal((await f.call({ operation: 'preview', snapshot: applied.snapshot })).reconciliation.status, 'aligned');
});

test('class-diagram member edits reconcile in both directions while preserving the view', async t => {
	const file = 'Task.java', source = 'public class Task { public int priority; }\n';
	const f = await fixture(t, file, source);
	const snapshot = await readSnapshot(f.initial.snapshot);
	const declaration = snapshot.state.files[0].declarations.find(item => item.name === 'Task');
	const element = snapshot.model.semantics.elements.find(item => item.id === declaration.id);
	element.kind = 'class';
	snapshot.model.version = 3;
	snapshot.model.views.push({ id: 'task-design', name: 'Task Class', kind: 'class', nodes: [{ elementId: element.id, x: 120, y: 80 }], relationIds: [] });
	element.details = { technology: 'Java', environment: '', members: [{ name: 'priority', type: 'long', kind: 'attribute', key: 'none', required: true }] };
	await writeFile(f.initial.model, JSON.stringify(snapshot.model));
	f.setReply(context => {
		const delta = context.changes.elements.find(item => item.model?.details?.members.some(member => member.name === 'priority'));
		assert.equal(delta.model.details.members[0].type, 'long');
		return { ...empty(), sourceEdits: [{ file, revision: context.sources[0].revision, search: 'int priority', replacement: 'long priority' }], bindings: [{ elementId: delta.id, file, name: 'Task', syntaxKind: declaration.syntaxKind }] };
	});
	const preview = await f.call({ operation: 'preview', snapshot: f.initial.snapshot });
	assert.equal(preview.reconciliation.origin, 'model');
	const { result } = await f.propose(preview);
	assert.deepEqual(result.reconciliation.diagnostics, []);
	const applied = await f.call({ operation: 'apply', token: result.token });
	const current = await readSnapshot(applied.snapshot);
	assert.equal(await readFile(join(f.root, file), 'utf8'), source.replace('int priority', 'long priority'));
	assert.deepEqual(current.model.semantics.elements.find(item => item.id === element.id).details, element.details);
	assert.equal((await f.call({ operation: 'preview', snapshot: applied.snapshot })).reconciliation.status, 'aligned');
	await writeFile(join(f.root, file), source.replace('int priority', 'double priority'));
	f.setReply(context => {
		const delta = context.changes.elements.find(item => item.model?.details?.members.some(member => member.name === 'priority'));
		return { ...empty(), modelEdits: [{ collection: 'elements', id: delta.id, value: { ...delta.model, details: { ...delta.model.details, members: [{ ...delta.model.details.members[0], type: 'double' }] } } }], bindings: [{ elementId: delta.id, file, name: 'Task', syntaxKind: declaration.syntaxKind }] };
	});
	const codePreview = await f.call({ operation: 'preview', snapshot: applied.snapshot });
	assert.equal(codePreview.reconciliation.origin, 'code');
	const codeProposal = (await f.propose(codePreview)).result;
	assert.deepEqual(codeProposal.reconciliation.diagnostics, []);
	const updated = await f.call({ operation: 'apply', token: codeProposal.token });
	const design = (await readSnapshot(updated.snapshot)).model;
	assert.equal(design.semantics.elements.find(item => item.id === element.id).details.members[0].type, 'double');
	assert.deepEqual(design.views.find(view => view.id === 'task-design'), snapshot.model.views.find(view => view.id === 'task-design'));
	assert.equal(await readFile(join(f.root, file), 'utf8'), source.replace('int priority', 'double priority'));
});
