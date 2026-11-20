import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import '../scripts/source-loader.mjs';
const { validateSemanticModel, validateSemanticShape, semanticModelV4Schema, areModelOperationsCompatible } = await import('../../src/vs/workbench/contrib/ade/common/semanticModel.ts');
const { getModelReadiness, assertModelProposalAllowed } = await import('../../src/vs/workbench/contrib/ade/common/modelReadiness.ts');
const { compileModelContext, assertModelContextCurrent } = await import('../../src/vs/workbench/contrib/ade/common/modelContext.ts');
const { hashSemanticModel, modelDigest } = await import('../../src/vs/workbench/contrib/ade/common/modelSerialization.ts');
const { getModelImpact } = await import('../../src/vs/workbench/contrib/ade/common/modelImpact.ts');
const { getC4DrillDown, getContractProjection, getContractImpact, reviseModelDecision } = await import('../../src/vs/workbench/contrib/ade/common/modelBlueprint.ts');
const { getElementPath } = await import('../../src/vs/workbench/contrib/ade/common/visualNavigation.ts');
const { applyVisualEdit } = await import('../../src/vs/workbench/contrib/ade/common/visualEditing.ts');
import { fixtureProfile } from './fixtures/dai-profile.mjs';
const base = JSON.parse(await readFile(new URL('../examples/dai-blueprint.ade.json', import.meta.url)));
const profile = { ...fixtureProfile, elementKinds: [...fixtureProfile.elementKinds, 'interface', 'package'] };
const request = { targetId: 'operation.confirm', profile, maxInputBytes: 196608 };
const copy = () => structuredClone(base);
const op = (model, id = 'operation.reserve') => model.foundation.blueprint.operations.find(operation => operation.id === id);
const codes = model => getModelReadiness(model, request.targetId, profile).diagnostics.map(item => item.code);

test('B01 checkout has two containers, one shared library and an identity-preserving C4 path to a shared contract', () => {
	assert.deepEqual(validateSemanticModel(base), []);
	assert.equal(getModelReadiness(base, request.targetId, profile).state, 'generationReady');
	assert.deepEqual(['system.shop', 'container.api', 'contract.checkout'].map(id => getC4DrillDown(base, id).map(view => view.id)), [['c4.l2'], ['c4.l3'], ['c4.l4']]);
	assert.deepEqual(getElementPath(base, 'contract.checkout').map(element => element.id), ['system.shop', 'container.api', 'component.checkout', 'contract.checkout']);
	assert.equal(base.foundation.blueprint.modules.length, 1);
	assert.deepEqual(getModelImpact(base, 'package.money').dependents.map(entry => entry.element.id).sort(), ['component.audit', 'component.checkout']);
	assert.equal(getC4DrillDown(base, 'system.payments').length, 0);
});

test('B02 foreign components require explicit context and external implementations cannot acquire owned children', () => {
	const model = copy(); model.views[2].contextIds = model.views[2].contextIds.filter(id => id !== 'component.stock');
	assert.ok(validateSemanticModel(model).some(item => item.code === 'c4Scope' && item.args.includes('component.stock')));
	model.views[2].contextIds.push('component.stock');
	model.foundation.ownership.find(entry => entry.elementId === 'component.stock').ownerId = 'system.payments';
	assert.ok(validateSemanticModel(model).some(item => item.code === 'ownership' && item.args.includes('c4Owner')));
});

for (const [name, mutate, reason] of [
	['B03 undeclared external', model => { model.foundation.integrations = []; }, 'undeclaredExternal'],
	['B04 unfulfilled required port', model => { model.foundation.blueprint.connections = []; }, 'contract'],
	['B04 provider direction', model => { model.foundation.blueprint.ports.find(port => port.id === 'port.stock').direction = 'required'; }, 'contract'],
	['B05 incompatible parameter', model => { op(model).inputs[0].typeId = 'type.count'; }, 'contract'],
	['B05 incompatible nullable result', model => { op(model).outputs[0].nullable.value = true; }, 'contract'],
	['B05 extra required parameter', model => { op(model).inputs.push({ id: 'input.extra', name: 'extra', type: '', typeId: 'type.text', required: true, nullable: { state: 'known', value: false } }); }, 'contract'],
	['B06 missing type', model => { op(model).inputs[0].typeId = 'type.absent'; }, 'missingReference'],
	['B06 undeclared error', model => { model.foundation.occurrences[0].errorId = 'error.operation.confirm'; }, 'contract'],
	['B06 missing operation', model => { model.foundation.blueprint.interfaces[0].operationIds.push('operation.absent'); }, 'missingReference'],
	['B06 unknown nullability', model => { op(model, 'operation.confirm').inputs[0].nullable = { state: 'unknown', reason: 'Pending' }; }, 'incompleteContract']
]) {
	test(`${name} blocks the target without changing the recoverable draft`, async () => {
		const model = copy(); mutate(model); const before = structuredClone(model);
		assert.equal(validateSemanticShape(model).length, 0);
		assert.ok(codes(model).includes(reason), JSON.stringify(getModelReadiness(model, request.targetId, profile)));
		await assert.rejects(compileModelContext(model, request));
		assert.deepEqual(model, before);
	});
}

test('B05 presence and nullability are distinct, with contravariant inputs and covariant results/errors', () => {
	const model = copy(); const required = op(model, 'operation.reserveRequired'); const provided = op(model);
	provided.inputs[0].required = false; provided.inputs[0].nullable.value = true;
	assert.equal(areModelOperationsCompatible(model, required, provided), true);
	provided.outputs[0].required = false;
	assert.equal(areModelOperationsCompatible(model, required, provided), false);
	provided.outputs[0].required = true; provided.errors.push({ id: 'error.extra', code: 'NEW_FAILURE', description: '', typeId: 'type.failure' });
	assert.equal(areModelOperationsCompatible(model, required, provided), false);
});

test('B07 overloads keep distinct IDs; duplicate input signatures are rejected', () => {
	const model = copy(); const operation = structuredClone(op(model, 'operation.confirm'));
	operation.id = 'operation.overload'; operation.inputs[0].id = 'input.overload'; operation.outputs[0].id = 'output.overload'; operation.errors[0].id = 'error.overload'; operation.inputs[0].typeId = 'type.text';
	model.foundation.blueprint.operations.push(operation); model.foundation.blueprint.interfaces[0].operationIds.push(operation.id);
	assert.deepEqual(validateSemanticModel(model), []);
	operation.inputs[0].typeId = 'type.order';
	assert.ok(validateSemanticModel(model).some(item => item.args.includes('duplicateSignature')));
});

test('B08 renaming definitions changes every projection without allocating or copying identities', () => {
	let model = copy(); const operation = structuredClone(op(model, 'operation.confirm')); operation.name = 'submitOrder';
	model = applyVisualEdit(model, { kind: 'blueprint', section: 'operations', entry: operation });
	const type = structuredClone(model.foundation.types.find(type => type.id === 'type.order')); type.name = 'Purchase'; model = applyVisualEdit(model, { kind: 'type', entry: type });
	assert.equal(getContractProjection(model, 'component.checkout').operations.find(operation => operation.id === 'operation.confirm').name, 'submitOrder');
	assert.equal(getContractProjection(model, 'contract.checkout').types.find(type => type.id === 'type.order').name, 'Purchase');
	assert.deepEqual(getContractImpact(model, 'operation.reserve'), { operationId: 'operation.reserve', interfaceIds: ['interface.stock'], consumerIds: ['component.checkout', 'component.stock'], occurrenceIds: ['call.reserve.1', 'call.reserve.2'] });
	assert.deepEqual(model.foundation.blueprint.operations.map(operation => operation.id), base.foundation.blueprint.operations.map(operation => operation.id));
});

test('B09 normative constraints reject violating proposals and contradictory decisions without precedence', () => {
	const model = copy(); model.foundation.blueprint.transports[1].protocol = 'other';
	assert.throws(() => assertModelProposalAllowed(base, model, request.targetId, profile), /decisionUnsatisfied/);
	const conflicting = structuredClone(base.foundation.decisions[0]); conflicting.id = 'adr.conflict'; conflicting.record.number = '3'; conflicting.constraints[0].value.value = 'other';
	model.foundation.decisions.push(conflicting);
	assert.ok(codes(model).includes('contradictoryDecisions'));
	model.foundation.decisions[0].constraints[0].operator = 'notEquals';
	assert.equal(codes(model).includes('contradictoryDecisions'), false);
});

test('B10 inactive and unrelated decisions remain inspectable and occupy no target payload', async () => {
	for (const status of ['proposed', 'deprecated', 'rejected']) {
		const model = copy(); model.foundation.decisions[0].status = status;
		const packet = await compileModelContext(model, request); const payload = JSON.parse(packet.bytes);
		assert.equal(payload.model.foundation.decisions.length, 0);
	}
	const model = copy(); model.semantics.elements.push({ id: 'feature.independent', name: 'Independent', kind: 'feature' });
	model.foundation.decisions[1].status = 'accepted'; model.foundation.decisions[1].scopeIds = ['feature.independent'];
	const packet = await compileModelContext(model, request);
	assert.deepEqual(JSON.parse(packet.bytes).model.foundation.decisions.map(decision => decision.id), ['adr.transport']);
});

test('B11 revisions preserve reasons, prevent stale overwrites and invalidate sealed context', async () => {
	const packet = await compileModelContext(base, request); const next = structuredClone(base.foundation.decisions[0]); next.revision = 'adr.2'; next.record.decision = 'Same constraint, clearer reasons';
	const updated = reviseModelDecision(base, next, 'adr.1');
	assert.deepEqual(updated.foundation.decisions.find(decision => decision.id === next.id).record.history[0], { revision: 'adr.1', status: 'accepted', scopeIds: next.scopeIds, constraints: next.constraints, number: '1', title: 'Declared stock protocol', context: 'Checkout calls the stock provider', decision: 'Use the declared protocol for stock requests', consequences: ['Requests have a versioned payload'] });
	assert.throws(() => reviseModelDecision(updated, next, 'adr.1'), /stale/);
	await assert.rejects(assertModelContextCurrent(packet, updated, request), /stale/);
});

test('B11 supersession keeps old reasons and applies only its accepted replacement', async () => {
	const model = copy(); const next = structuredClone(model.foundation.decisions[0]); next.id = 'adr.replacement'; next.record.number = '3'; next.revision = 'replacement.1'; model.foundation.decisions.push(next);
	const superseded = structuredClone(model.foundation.decisions[0]); superseded.revision = 'adr.2'; superseded.status = 'superseded'; superseded.record.supersededById = next.id;
	const updated = reviseModelDecision(model, superseded, 'adr.1');
	assert.deepEqual(JSON.parse((await compileModelContext(updated, request)).bytes).model.foundation.decisions.map(decision => decision.id), ['adr.replacement']);
});

test('B12 shared types, recursive type references, errors and applicable ADRs are complete in a budgeted packet', async () => {
	const model = copy(); model.foundation.types.find(type => type.id === 'type.order').fields.push({ id: 'field.parent', name: 'parent', type: '', typeId: 'type.orderRef', required: false, nullable: { state: 'known', value: true } });
	const packet = await compileModelContext(model, request); const payload = JSON.parse(packet.bytes);
	assert.deepEqual(payload.model.foundation.types.map(type => type.id).sort(), ['type.failure', 'type.order', 'type.orderRef', 'type.status', 'type.text']);
	assert.equal(payload.model.foundation.blueprint.operations.length, 3);
	assert.equal(packet.byteLength, Buffer.byteLength(packet.bytes)); assert.equal(packet.seal, await modelDigest(packet.bytes));
	assert.deepEqual(payload.grammar.schema, semanticModelV4Schema);
	await assert.rejects(compileModelContext(model, { ...request, maxInputBytes: packet.byteLength - 1 }), error => error.reason === 'inputBudget');
	const moved = copy(); moved.views[2].nodes[0].x += 300;
	assert.equal(await hashSemanticModel(moved), await hashSemanticModel(base));
	moved.views[2].contextIds.push('system.payments');
	assert.notEqual(await hashSemanticModel(moved), await hashSemanticModel(base));
});


test('a proposal cannot erase or alter the normative decisions it is meant to satisfy', () => {
	const model = copy(); model.foundation.decisions = []; model.foundation.blueprint.transports[1].protocol = 'other';
	assert.throws(() => assertModelProposalAllowed(base, model, request.targetId, profile), /normativeDecisionMutation/);
});

test('B03 an external provider omitted from L1 requires a context amendment', () => {
	const model = copy(); model.views[0].contextIds = []; model.views[0].nodes = model.views[0].nodes.filter(node => node.elementId !== 'system.payments');
	assert.ok(codes(model).includes('undeclaredExternal'));
	assert.ok(getModelReadiness(base, 'system.payments', profile).diagnostics.some(item => item.code === 'externalTarget'));
});


test('reference-only type cycles and contradictory type definitions block a contract without inventing a primitive', () => {
	const model = copy(); model.foundation.types.find(type => type.id === 'type.orderRef').targetTypeId = 'type.orderRef';
	op(model, 'operation.confirm').inputs[0].typeId = 'type.orderRef';
	assert.ok(codes(model).includes('contract'));
	model.foundation.types.find(type => type.id === 'type.text').values = ['ambiguous'];
	assert.ok(validateSemanticModel(model).some(item => item.args.includes('ambiguousTypeDefinition')));
});


test('the DAI-03 historical seal remains intact while current packets include the extended grammar', async () => {
	const historical = JSON.parse(await readFile(new URL('./fixtures/dai/dai-03-sealed-context.json', import.meta.url), 'utf8'));
	assert.equal(historical.byteLength, Buffer.byteLength(historical.bytes)); assert.equal(historical.seal, await modelDigest(historical.bytes));
	assert.equal(JSON.parse(historical.bytes).grammar.schema.properties.version.const, 4);
	assert.deepEqual(JSON.parse((await compileModelContext(base, request)).bytes).grammar.schema, semanticModelV4Schema);
});


test('required ports cannot choose between implicit providers or bypass external declarations through a connection', () => {
	const model = copy(); const b = model.foundation.blueprint;
	b.connections.push({ ...structuredClone(b.connections[0]), id: 'connection.duplicate' });
	assert.ok(validateSemanticModel(model).some(item => item.args.includes('multipleProviders')));
	b.connections.pop(); b.ports.find(port => port.id === 'port.stock').elementId = 'system.payments';
	model.foundation.occurrences = []; model.foundation.integrations = [];
	model.semantics.relations = model.semantics.relations.filter(relation => relation.id !== 'relation.payments');
	b.transports = b.transports.filter(transport => transport.relationId !== 'relation.payments');
	assert.ok(codes(model).includes('undeclaredExternal'));
});
