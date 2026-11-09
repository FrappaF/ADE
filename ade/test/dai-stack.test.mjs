/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import test from 'node:test';
import assert from 'node:assert/strict';
import './source-loader.mjs';
import { checkoutMessaging } from './fixtures/dai-messaging.mjs';
const { createPureProject, assertPureProject } = await import('../../src/vs/workbench/contrib/ade/common/modelProject.ts');
const { getModelArchetype, modelProjectProfile, modelArchetypeRevision, resolveModelPlatform, assertArchetypeCapability } = await import('../../src/vs/workbench/contrib/ade/common/modelProfiles.ts');
const { switchModelStack, modelStackPlan } = await import('../../src/vs/workbench/contrib/ade/common/modelStack.ts');
const { compileModelTaskContext, assertModelTaskCurrent } = await import('../../src/vs/workbench/contrib/ade/common/modelTaskContext.ts');
const { validateSemanticModel } = await import('../../src/vs/workbench/contrib/ade/common/semanticModel.ts');
function fixture() { let id = 0; return createPureProject('Same Rules', () => 'identity.' + ++id).model; }
function request(model, profileId) { return { version: 1, target: { kind: 'operation', id: model.foundation.blueprint.operations[0].id }, mode: 'analysis', profileId, intent: { text: 'Keep the same business criteria', revision: '1', clarifications: [] }, provider: { id: 'local', model: 'none', configurationRevision: '1' }, baselineRevision: '1', delta: [], writeScope: { objects: [], files: [], createOperationsUnder: [] }, retrievalScope: { objects: [], files: [] }, sources: [], budget: { maxInputBytes: 196608, maxContextBytes: 262144, outputReserveBytes: 65536, overheadReserveBytes: 0 } }; }
test('DAI11 distinct trusted Bun descriptor is detached; Node profile remains revision 5', async () => {
	const node = getModelArchetype('node.esm'), bun = getModelArchetype('bun.esm'); assert.deepEqual([node.profile.revision, bun.profile.revision, bun.toolchain.runtime, bun.toolchain.version, bun.runner.executable], ['5', '1', 'bun', '1.3.2', 'bun']);
	assert.equal(await modelArchetypeRevision(node), '2558425ea86e106e58ab78240c93ac69f5a2efafa9c8d27482005ca05c1be838');
	assert.notEqual(await modelArchetypeRevision(node), await modelArchetypeRevision(bun)); bun.profile.revision = '2'; await assert.rejects(modelArchetypeRevision(bun), /Untrusted/); assert.equal(getModelArchetype('bun.esm').profile.revision, '1');
	assert.throws(() => getModelArchetype('invented'), /Unknown/); assert.throws(() => assertArchetypeCapability('bun.esm', 'migrations'), /Unsupported/); assert.throws(() => assertArchetypeCapability('bun.esm', 'test', '1.3.1'), /version/);
});
test('DAI11 runtime switch preserves the complete PIM, binding IDs, geometry, criteria and intent', async () => {
	const model = fixture(), before = structuredClone(model), next = switchModelStack(model, 'bun.esm'); assert.deepEqual(model, before); assert.deepEqual(switchModelStack(next, 'node.esm'), model); assert.deepEqual(validateSemanticModel(next), []); assert.doesNotThrow(() => assertPureProject(next));
	const plan = await modelStackPlan(model, next); assert.deepEqual([plan.from, plan.to], ['node.esm@5', 'bun.esm@1']); for (const field of ['implementation', 'dependencies', 'storage', 'tests', 'deployment', 'recovery']) { assert.ok(plan[field]); }
});
test('DAI11 explicit Bun application and unchanged broker technologies resolve from trusted profiles', () => {
	const model = switchModelStack(checkoutMessaging, 'bun.esm'), container = model.semantics.elements.find(e => e.kind === 'container' && e.runtimeKind === 'application');
	assert.deepEqual(resolveModelPlatform(model, container.id, 'bun.esm'), { technology: 'bun-esm', runtime: 'bun', version: '1.3.2', framework: 'none' }); assert.equal(resolveModelPlatform(model, 'broker', 'bun.esm').runtime, 'nats-server'); assert.doesNotThrow(() => assertPureProject(model));
});
test('DAI11 absent, unknown, duplicate, mixed or contradictory bindings never select a default runtime', () => {
	for (const kind of ['absent', 'unknown', 'duplicate', 'mixed', 'technology']) {
		const model = fixture(), binding = model.foundation.platform.bindings[0];
		if (kind === 'absent') { model.foundation.platform.bindings = []; }
		if (kind === 'unknown') { binding.profileId = 'unknown'; }
		if (kind === 'duplicate') { model.foundation.platform.bindings.push({ ...binding, id: 'duplicate' }); }
		if (kind === 'technology') { binding.technology.value = 'bun-esm'; }
		if (kind === 'mixed') { model.semantics.elements.push({ id: 'other', name: 'Other', kind: 'container', runtimeKind: 'application' }); model.foundation.platform.bindings.push({ ...binding, id: 'other.binding', elementId: 'other', profileId: 'bun.esm', technology: { state: 'known', value: 'bun-esm' } }); }
		assert.throws(() => modelProjectProfile(model)); assert.throws(() => switchModelStack(model, 'bun.esm'));
	}
});
test('DAI11 stack plan rejects changes to business rules, IDs and custom binding metadata', async () => {
	for (const kind of ['rule', 'identity', 'binding']) { const model = fixture(), next = switchModelStack(model, 'bun.esm'); if (kind === 'rule') { next.foundation.predicates[0].nodes[2].operator = 'ge'; } if (kind === 'identity') { next.id += 'different'; } if (kind === 'binding') { next.foundation.platform.bindings[0].id += 'different'; } await assert.rejects(modelStackPlan(model, next), /PIM/); }
});
test('DAI11 runtime selection and profile revision enter packet seal; stale old profile tasks cannot be reused', async () => {
	const node = fixture(), bun = switchModelStack(node, 'bun.esm'), nodeRequest = request(node, 'node.esm'), bunRequest = request(bun, 'bun.esm'), packet = await compileModelTaskContext(node, nodeRequest), changed = await compileModelTaskContext(bun, bunRequest);
	assert.notEqual(changed.seal, packet.seal); assert.notEqual(changed.profileRevision, packet.profileRevision); await assert.rejects(assertModelTaskCurrent(packet, bun, bunRequest), /stale/); assert.ok(changed.byteLength <= 196608); assert.equal(changed.metrics.cost, null);
});
