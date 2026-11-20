import '../scripts/source-loader.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { checkoutInteractions, interactionCriteria, literal, reference, compare, argument, message } from './fixtures/dai-interactions.mjs';
const { validateSemanticModel } = await import('../../src/vs/workbench/contrib/ordito/common/semanticModel.ts');
const { validateModelInteraction, interpretModelInteraction } = await import('../../src/vs/workbench/contrib/ordito/common/modelInteractions.ts');
const { emitModelInteraction, interactionRegion, reverseModelInteraction } = await import('../../src/vs/workbench/contrib/ordito/common/interactionRuntime.ts');
const { checkModelExpression, evaluateModelExpression, emitModelExpression } = await import('../../src/vs/workbench/contrib/ordito/common/modelValues.ts');
const observe = r => ({ outcome: r.outcome, calls: r.trace.filter(t => t.kind === 'call').map(t => t.id), outputs: r.outputs, ...(r.error ? { error: r.error.code } : {}) });
const loadEmitted = async (model, id) => (await import('data:text/javascript,' + encodeURIComponent(emitModelInteraction(model, id)))).default;
const runEmitted = async (model, id, input, replies) => (await loadEmitted(model, id))(input, replies);

test('I01 typed checkout fixture is valid; runtime artifact is reproducible from its canonical typed source', () => {
	assert.deepEqual(validateSemanticModel(checkoutInteractions), []);
	assert.deepEqual(validateModelInteraction(checkoutInteractions, 'interaction.checkout'), []);
	execFileSync(process.execPath, ['ordito/scripts/build-interaction-runtime.mjs', '--check'], { cwd: new URL('../../', import.meta.url), stdio: 'pipe' });
});
for (const c of interactionCriteria.interactions) {
	test('I01/I04/I05/I08 independent ' + c.id, async () => {
		assert.deepEqual(observe(await interpretModelInteraction(checkoutInteractions, c.interactionId, c.input, c.replies)), c.expected);
		assert.deepEqual(observe(await runEmitted(checkoutInteractions, c.interactionId, c.input, c.replies)), c.expected);
	});
}

test('E01 exact nominal arithmetic and independent expression oracle agree with emitted ESM', async () => {
	const model = structuredClone(checkoutInteractions), graph = { version: 1, nodes: [{ id: 'x', kind: 'reference', fieldId: 'quantity', path: [] }, { id: 'y', kind: 'literal', typeId: 'Quantity', value: 2 }, { id: 'z', kind: 'arithmetic', operator: 'multiply', left: 'x', right: 'y' }], rootId: 'z' }, scope = { quantity: { typeId: 'Quantity', nullable: false, optional: false } };
	const emitted = (await import('data:text/javascript,' + encodeURIComponent(emitModelExpression(model, graph, scope)))).default;
	for (const [quantity, expected] of [[0, 0], [3, 6], [-2, -4]]) { assert.equal(evaluateModelExpression(model, graph, scope, { quantity }), expected); assert.equal(emitted({ quantity }), expected); }
	graph.nodes[1].typeId = 'Money'; assert.ok(checkModelExpression(model, graph, scope).errors.includes('arithmeticType'));
	graph.nodes[1].typeId = 'Quantity'; graph.nodes[2].operator = 'divide'; assert.throws(() => evaluateModelExpression(model, graph, scope, { quantity: 3 }), /arithmeticPrecision/);
	graph.nodes[1].value = 0; assert.throws(() => evaluateModelExpression(model, graph, scope, { quantity: 2 }), /arithmeticZero/);
	graph.nodes[1].value = 2; graph.nodes[2].operator = 'multiply'; assert.throws(() => evaluateModelExpression(model, graph, scope, { quantity: Number.MAX_SAFE_INTEGER }), /arithmeticPrecision/);
});
test('E02 collection empty, missing, null, malformed items and nominal mismatch', async () => {
	const scope = { items: { typeId: 'Quantities', nullable: true, optional: true } }, graph = { version: 1, nodes: [{ id: 'items', kind: 'reference', fieldId: 'items', path: [] }, { id: 'zero', kind: 'literal', typeId: 'Quantity', value: 0 }, { id: 'all', kind: 'collection', operator: 'every', operand: 'items', value: 'zero', comparison: 'gt' }], rootId: 'all' };
	for (const [input, expected] of [[{ items: [] }, true], [{ items: [1, 2] }, true], [{ items: [0, 2] }, false], [{}, null], [{ items: null }, null]]) {
		assert.equal(evaluateModelExpression(checkoutInteractions, graph, scope, input), expected);
		assert.equal((await import('data:text/javascript,' + encodeURIComponent(emitModelExpression(checkoutInteractions, graph, scope)))).default(input), expected);
	}
	assert.throws(() => evaluateModelExpression(checkoutInteractions, graph, scope, { items: ['1'] }), /type mismatch/);
	graph.nodes[1].typeId = 'Money'; assert.ok(checkModelExpression(checkoutInteractions, graph, scope).errors.includes('collectionComparisonType'));
});

test('I02 repeated operation has distinct occurrence/result/correlation and ordered calls', async () => {
	const model = structuredClone(checkoutInteractions), root = model.foundation.interactions[0];
	model.foundation.occurrences.push(message('message.chargeAgain', 'charge', [argument('charge.amount', reference('input.total'))])); root.occurrenceIds.push('message.chargeAgain'); root.execution.steps.splice(1, 0, 'message.chargeAgain');
	const c = interactionCriteria.interactions[0], replies = { ...c.replies, 'message.chargeAgain': [{ delayMs: 0, outputs: { 'payment.status': 'pending' } }] };
	assert.deepEqual(validateModelInteraction(model, root.id), []);
	for (const result of [await interpretModelInteraction(model, root.id, c.input, replies), await runEmitted(model, root.id, c.input, replies)]) { assert.deepEqual(observe(result), { outcome: 'completed', calls: ['message.charge', 'message.chargeAgain', 'message.persist'], outputs: {} }); }
});

test('I03 alt within bounded loop, local counter and explicit exhaustion', async () => {
	const model = structuredClone(checkoutInteractions), root = model.foundation.interactions[0];
	model.foundation.frames.push({ id: 'frame.loop', kind: 'loop', occurrenceIds: ['message.charge', 'message.other'], iterationId: 'iteration', iterationTypeId: 'Quantity', maxIterations: 2, limit: 'error', guard: compare(reference('iteration'), literal('Quantity', 2), 'lt'), steps: ['message.charge', 'frame.outcome'] });
	root.frameIds.push('frame.loop'); root.execution.steps = ['frame.loop', 'frame.notify'];
	const c = interactionCriteria.interactions[0], replies = { ...c.replies, 'message.charge': [{ delayMs: 0, outputs: { 'payment.status': 'approved' } }, { delayMs: 0, outputs: { 'payment.status': 'pending' } }] };
	assert.deepEqual(validateModelInteraction(model, root.id), []);
	for (const result of [await interpretModelInteraction(model, root.id, c.input, replies), await runEmitted(model, root.id, c.input, replies)]) { assert.deepEqual(observe(result), { outcome: 'completed', calls: ['message.charge', 'message.persist', 'message.charge', 'message.other'], outputs: {} }); }
	model.foundation.frames.at(-1).guard = literal('Flag', true);
	assert.equal((await interpretModelInteraction(model, root.id, c.input, replies)).error.code, 'loopLimit');
});

function parallel(critical = false) {
	const model = structuredClone(checkoutInteractions), root = model.foundation.interactions[1];
	const second = structuredClone(model.foundation.occurrences[1]); second.id = 'message.persist2'; second.execution.resultId += '2'; second.execution.mode = 'async'; model.foundation.occurrences.push(second);
	root.occurrenceIds.push(second.id); root.frameIds = ['frame.par'];
	const branches = ['message.persist', second.id];
	if (critical) { for (const [index, step] of branches.entries()) { const id = 'critical.' + index; model.foundation.frames.push({ id, kind: 'critical', occurrenceIds: [step], resource: 'orders', scope: 'interaction', steps: [step] }); root.frameIds.push(id); branches[index] = id; } }
	model.foundation.frames.push({ id: 'frame.par', kind: 'par', occurrenceIds: ['message.persist', second.id], operands: branches.map((step, index) => ({ id: 'parallel.' + index, steps: [step] })), join: 'all', failure: 'cancel', resultOrder: 'declared', resultId: 'parallel.results' }); root.execution.steps = ['frame.par']; return model;
}
test('I06/I07 parallel shared effect requires critical; exclusion serializes real timers', async () => {
	assert.ok(validateModelInteraction(parallel(), 'interaction.persist').includes('sharedEffectRace'));
	const model = parallel(true), c = interactionCriteria.interactions.at(-1), replies = { ...c.replies, 'message.persist': [{ delayMs: 10, outputs: {} }], 'message.persist2': [{ delayMs: 0, outputs: {} }] };
	assert.deepEqual(validateModelInteraction(model, 'interaction.persist'), []);
	for (const result of [await interpretModelInteraction(model, c.interactionId, c.input, replies), await runEmitted(model, c.interactionId, c.input, replies)]) {
		assert.equal(result.outcome, 'completed'); assert.deepEqual(result.trace.map(t => [t.kind, t.id]), [['enter', 'critical.0'], ['call', 'message.persist'], ['reply', 'message.persist'], ['exit', 'critical.0'], ['enter', 'critical.1'], ['call', 'message.persist2'], ['reply', 'message.persist2'], ['exit', 'critical.1'], ['join', 'frame.par']]); assert.deepEqual(result.joins, [{ id: 'frame.par', outcomes: ['completed', 'completed'] }]);
	}
});
test('I06 parallel failure cancels and drains; collect waits and preserves declared outcome order', async () => {
	const model = parallel(), c = interactionCriteria.interactions.at(-1); model.foundation.blueprint.operations.find(o => o.id === 'persist').effects = [];
	model.foundation.blueprint.operations.find(o => o.id === 'persist').errors = [{ id: 'error.persist', code: 'writeRejected', typeId: 'Text', description: 'Authored rejection' }];
	const replies = { 'message.persist': [{ delayMs: 5, error: { code: 'writeRejected', details: 'rejected' } }], 'message.persist2': [{ delayMs: 40, outputs: {} }] };
	for (const result of [await interpretModelInteraction(model, c.interactionId, c.input, replies), await runEmitted(model, c.interactionId, c.input, replies)]) { assert.equal(result.error.code, 'writeRejected'); assert.deepEqual(result.joins, [{ id: 'frame.par', outcomes: ['writeRejected', 'cancelled'] }]); assert.ok(!result.trace.some(t => t.kind === 'reply' && t.id === 'message.persist2')); }
	model.foundation.frames.find(f => f.id === 'frame.par').failure = 'collect';
	assert.deepEqual((await interpretModelInteraction(model, c.interactionId, c.input, replies)).joins, [{ id: 'frame.par', outcomes: ['writeRejected', 'completed'] }]);
});
for (const [name, edit, reason] of [
	['scope leak', m => { m.foundation.frames[2].guard = reference('result.persist', ['payment.status']); }, 'referenceScopeOrType'],
	['ref revision', m => { m.foundation.frames[1].revision = '2'; }, 'refContractRevision'],
	['ref argument', m => { m.foundation.frames[1].arguments[0].expression = literal('Quantity', 1); }, 'argumentType'],
	['ref cycle', m => { m.foundation.frames[1].interactionId = 'interaction.checkout'; }, 'refCycle'],
	['recursive frame', m => { m.foundation.frames[2].steps = ['frame.notify']; }, 'stepMultipleParents'],
	['no bound', m => { delete m.foundation.frames[2].guard; }, 'interactionShape']
]) { test('I09 rejects ' + name, () => { const m = structuredClone(checkoutInteractions); edit(m); assert.ok(validateModelInteraction(m, 'interaction.checkout').includes(reason), validateModelInteraction(m, 'interaction.checkout').join(',')); }); }

test('I09 ambiguous and indeterminate guards fail; else remains all other outcomes', async () => {
	const model = structuredClone(checkoutInteractions), frame = model.foundation.frames[0], c = interactionCriteria.interactions[0];
	frame.operands.splice(1, 0, { id: 'branch.duplicate', guard: literal('Flag', true), steps: [] });
	assert.equal((await interpretModelInteraction(model, c.interactionId, c.input, c.replies)).error.code, 'ambiguousGuard');
	frame.operands.splice(1, 1); frame.operands[0].guard = literal('Flag', null);
	assert.equal((await interpretModelInteraction(model, c.interactionId, c.input, c.replies)).error.code, 'indeterminateGuard');
});

test('P02 template reverse validates exact body, existing IDs, contracts and authored prose', () => {
	const model = structuredClone(checkoutInteractions), source = interactionRegion(model, 'interaction.checkout');
	assert.deepEqual(reverseModelInteraction(model, 'interaction.checkout', source), model);
	assert.throws(() => reverseModelInteraction(model, 'interaction.checkout', source.replace('maxCalls:1000', 'maxCalls:1')), /Partial/);
	assert.throws(() => reverseModelInteraction(model, 'interaction.checkout', source.replace('"timeoutMs":50', '"timeoutMs":0')), /Partial/);
});

test('C01 interaction packet includes ref signature and version, retrieves body explicitly and ignores layout', async () => {
	const { compileModelTaskContext } = await import('../../src/vs/workbench/contrib/ordito/common/modelTaskContext.ts');
	const request = { version: 1, target: { kind: 'interaction', id: 'interaction.checkout' }, mode: 'generation', intent: { revision: '1', text: 'Implement checkout frames', clarifications: [] }, profileId: 'node.esm', provider: { id: 'deterministic', model: 'frames-v1', configurationRevision: '3' }, baselineRevision: 'authored-common-1', delta: [{ kind: 'interaction', id: 'interaction.checkout' }], writeScope: { objects: [{ kind: 'operation', id: 'checkout' }], files: [], createOperationsUnder: [] }, retrievalScope: { objects: [{ kind: 'interaction', id: 'interaction.persist' }], files: [] }, sources: [], budget: { maxInputBytes: 196608, maxContextBytes: 262144, outputReserveBytes: 65536, overheadReserveBytes: 4096 } };
	const packet = await compileModelTaskContext(checkoutInteractions, request);
	assert.ok(packet.definitions.some(d => d.ref.kind === 'operation' && d.ref.id === 'persistContract'));
	assert.ok(packet.boundaries.some(d => d.ref.kind === 'interaction' && d.value.revision === '1' && d.value.body));
	assert.ok(!packet.definitions.some(d => d.ref.id === 'message.persist'));
	const layout = structuredClone(checkoutInteractions); layout.views = [{ id: 'differentLayout', name: 'Another geometry', kind: 'sequence', nodes: [], relationIds: [] }];
	assert.equal((await compileModelTaskContext(layout, request)).seal, packet.seal);
	const expanded = await compileModelTaskContext(checkoutInteractions, { ...request, additionalContext: [{ kind: 'interaction', id: 'interaction.persist' }] });
	assert.ok(expanded.definitions.some(d => d.ref.id === 'message.persist'));
	assert.notEqual(expanded.seal, packet.seal);
	const changed = await compileModelTaskContext(checkoutInteractions, { ...request, delta: [{ kind: 'type', id: 'Status' }] });
	assert.ok(changed.definitions.some(d => d.ref.id === 'frame.outcome'));
	await assert.rejects(compileModelTaskContext(checkoutInteractions, { ...request, budget: { ...request.budget, maxInputBytes: 100 } }), /inputBudget/);
});

test('I06 parallel outputs are typed and bound by declared branch identity, irrespective of completion order', async t => {
	const model = parallel(), root = model.foundation.interactions[1], c = interactionCriteria.interactions.at(-1), nullable = { state: 'known', value: false };
	model.foundation.blueprint.operations.find(o => o.id === 'persist').effects = [];
	model.foundation.blueprint.operations.find(o => o.id === 'persist').outputs = [{ id: 'persist.receipt', name: 'Receipt', type: '', typeId: 'Text', required: true, nullable }];
	model.foundation.blueprint.operations.find(o => o.id === 'persistContract').outputs = [{ id: 'contract.receipt', name: 'First Branch Receipt', type: '', typeId: 'Text', required: true, nullable }];
	root.execution.outputs = [argument('contract.receipt', reference('parallel.results', ['parallel.0', 'result.message.persist', 'persist.receipt']))];
	const replies = { 'message.persist': [{ delayMs: 15, outputs: { 'persist.receipt': 'first-declared' } }], 'message.persist2': [{ delayMs: 0, outputs: { 'persist.receipt': 'second-declared' } }] };
	assert.deepEqual(validateModelInteraction(model, root.id), []);
	const emitted = await loadEmitted(model, root.id);
	t.mock.timers.enable({ apis: ['setTimeout'] });
	for (const execute of [() => interpretModelInteraction(model, root.id, c.input, replies), () => emitted(c.input, replies)]) {
		const pending = execute();
		t.mock.timers.tick(1);
		await new Promise(resolve => setImmediate(resolve));
		t.mock.timers.tick(14);
		const result = await pending;
		assert.deepEqual(result.outputs, { 'contract.receipt': 'first-declared' });
		assert.deepEqual(result.trace.filter(entry => entry.kind === 'reply').map(entry => entry.id), ['message.persist2', 'message.persist']);
	}
});
test('I07 critical lock ordering is enforced across ref boundaries before a possible deadlock', () => {
	const model = structuredClone(checkoutInteractions), root = model.foundation.interactions[0], sub = model.foundation.interactions[1];
	model.foundation.frames.push({ id: 'critical.outer', kind: 'critical', occurrenceIds: [], resource: 'orders', scope: 'interaction', steps: ['frame.persist'] }, { id: 'critical.inner', kind: 'critical', occurrenceIds: ['message.persist'], resource: 'orders', scope: 'interaction', steps: ['message.persist'] });
	root.frameIds.push('critical.outer'); model.foundation.frames[0].operands[0].steps = ['critical.outer']; sub.frameIds.push('critical.inner'); sub.execution.steps = ['critical.inner'];
	assert.ok(validateModelInteraction(model, root.id).includes('criticalLockOrder'));
});
test('E02 any/count empty collections and absence preserve explicit unknown results', async () => {
	const scope = { items: { typeId: 'Quantities', nullable: false, optional: true } }, graph = { version: 1, nodes: [{ id: 'items', kind: 'reference', fieldId: 'items', path: [] }, { id: 'zero', kind: 'literal', typeId: 'Quantity', value: 0 }, { id: 'any', kind: 'collection', operator: 'any', operand: 'items', value: 'zero', comparison: 'gt' }], rootId: 'any' };
	assert.equal(evaluateModelExpression(checkoutInteractions, graph, scope, { items: [] }), false);
	graph.nodes[2] = { id: 'any', kind: 'collection', operator: 'count', operand: 'items', typeId: 'Quantity' };
	for (const [input, expected] of [[{ items: [] }, 0], [{ items: [2, 3] }, 2], [{}, null]]) { assert.equal(evaluateModelExpression(checkoutInteractions, graph, scope, input), expected); assert.equal((await import('data:text/javascript,' + encodeURIComponent(emitModelExpression(checkoutInteractions, graph, scope)))).default(input), expected); }
});
test('S06 region normalization is explicit, idempotent and preserves IDs and authored content', async () => {
	const { normalizeInteractionAliases } = await import('../../src/vs/workbench/contrib/ordito/common/modelMigration.ts');
	const canonical = parallel(true), alias = structuredClone(canonical); alias.foundation.frames.find(f => f.kind === 'critical').kind = 'region';
	assert.deepEqual(normalizeInteractionAliases(alias), canonical); assert.deepEqual(normalizeInteractionAliases(canonical), canonical); assert.equal(alias.foundation.frames.find(f => f.kind === 'region').kind, 'region');
});

test('I07 failed critical branch cancels a queued branch without claiming an acquired lock', async () => {
	const model = parallel(true), c = interactionCriteria.interactions.at(-1); model.foundation.blueprint.operations.find(o => o.id === 'persist').errors = [{ id: 'error.rejected', code: 'rejected', typeId: 'Text', description: 'Authored failure' }];
	const replies = { 'message.persist': [{ delayMs: 0, error: { code: 'rejected', details: 'rejected' } }], 'message.persist2': [{ delayMs: 0, outputs: {} }] };
	for (const result of [await interpretModelInteraction(model, c.interactionId, c.input, replies), await runEmitted(model, c.interactionId, c.input, replies)]) { assert.equal(result.error.code, 'rejected'); assert.ok(result.trace.some(t => t.id === 'critical.1' && t.kind === 'cancel')); assert.ok(!result.trace.some(t => t.id === 'critical.1' && ['enter', 'exit'].includes(t.kind))); }
});

test('E01 extended predicate emitter preserves absent boolean root as indeterminate', async () => {
	const { emitModelPredicate, evaluateModelPredicate } = await import('../../src/vs/workbench/contrib/ordito/common/modelExpressions.ts');
	const model = structuredClone(checkoutInteractions), operation = model.foundation.blueprint.operations.find(o => o.id === 'checkout'); operation.inputs.find(f => f.id === 'input.notify').required = false;
	const predicate = { id: 'predicate.optional', version: 1, operationId: 'checkout', phase: 'pre', nodes: [{ id: 'a', kind: 'literal', typeId: 'Quantity', value: 1 }, { id: 'sum', kind: 'arithmetic', operator: 'add', left: 'a', right: 'a' }, { id: 'flag', kind: 'reference', fieldId: 'input.notify', path: [] }], rootId: 'flag' };
	assert.equal(evaluateModelPredicate(model, predicate, {}), null); assert.equal((await import('data:text/javascript,' + encodeURIComponent(emitModelPredicate(model, predicate)))).default({}), null);
	predicate.phase = 'invented'; assert.throws(() => evaluateModelPredicate(model, predicate, {}), /predicateShape/);
});

test('I09 execution freezes the model, input and scripted responses before the first asynchronous reply', async () => {
	const model = structuredClone(checkoutInteractions), c = structuredClone(interactionCriteria.interactions[0]); c.replies['message.charge'][0].delayMs = 5;
	const pending = interpretModelInteraction(model, c.interactionId, c.input, c.replies);
	model.foundation.frames[0].operands[0].guard.nodes[1].value = 'pending'; c.replies['message.charge'][0].outputs['payment.status'] = 'declined'; c.input['input.notify'] = true;
	assert.deepEqual(observe(await pending), { outcome: 'completed', calls: ['message.charge', 'message.persist'], outputs: {} });
});
