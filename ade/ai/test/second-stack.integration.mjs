/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, rename, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import '../../scripts/source-loader.mjs';
import { checkoutStates, stateCriteria, replies } from '../../test/fixtures/dai-states.mjs';
import { checkoutMessaging, messagingCriteria } from '../../test/fixtures/dai-messaging.mjs';
import { checkoutInteractions, interactionCriteria } from '../../test/fixtures/dai-interactions.mjs';
const { createPureProject } = await import('../../../src/vs/workbench/contrib/ade/common/modelProject.ts');
const { switchModelStack, transferModelCheckpoint } = await import('../../../src/vs/workbench/contrib/ade/common/modelStack.ts');
const { compileModelStateMachine, executeStateProgram, emitModelStateMachine } = await import('../../../src/vs/workbench/contrib/ade/common/modelStates.ts');
const { ModelContinuity } = await import('../../../src/vs/workbench/contrib/ade/common/modelContinuity.ts');
const { prepareStructuralProject: prepare, verifyStructuralProject: verify, publishStructuralProject: publish, recoverStructuralProject: recover } = await import('../structuralProject.ts');
const { physicalImage, replacePhysicalImage } = await import('../../code-import/sourceChanges.ts');
const { runProcess } = await import('../process.ts');
if (!process.env.ADE_BUN_EXECUTABLE) { throw new Error('DAI11 requires the actual pinned Bun runtime; tests never silently skip'); }
async function fixture(t, kind = 'pure', profileId = 'bun.esm') {
	let serial = 0; const pure = createPureProject('Same Quantity Business', () => 'stack.' + ++serial);
	const selected = kind === 'state' ? { model: checkoutStates, criteria: stateCriteria } : kind === 'messaging' ? { model: checkoutMessaging, criteria: messagingCriteria } : kind === 'interaction' ? { model: checkoutInteractions, criteria: interactionCriteria } : pure;
	const model = profileId === 'node.esm' ? structuredClone(selected.model) : switchModelStack(selected.model, profileId), root = await mkdtemp(join(tmpdir(), 'ade-dai11-'));
	t.after(() => rm(root, { recursive: true, force: true })); await mkdir(join(root, '.ade'));
	const save = async value => writeFile(join(root, '.ade/model.json'), JSON.stringify(value, null, '\t') + '\n');
	await save(model); await writeFile(join(root, '.ade/criteria.json'), JSON.stringify(selected.criteria)); return { root, model, criteria: selected.criteria, save };
}
async function checked(root, direction = 'forward', paths = {}) {
	const result = await prepare(root, direction, paths); assert.equal(result.status, 'staged'); const s = result.session;
	const v = await verify(root, s.id, s.reviewId); assert.equal(v.status, 'passed', v.verification.output); await publish(root, v.id, v.reviewId); return v;
}
for (const kind of ['pure', 'interaction', 'state', 'messaging']) {
	for (const profileId of ['node.esm', 'bun.esm']) {
		test(`DAI11 ${profileId} ${kind}: same authored business criteria, actual runtime, bootstrap, aligned and undo`, async t => {
			const f = await fixture(t, kind, profileId), s = await checked(f.root);
			assert.match(s.verification.policy, new RegExp(profileId)); assert.equal(s.verification.generated, s.verification.independent); assert.ok(s.verification.independent > 0);
			assert.equal(JSON.parse(await readFile(join(f.root, 'package.json'))).engines[profileId === 'bun.esm' ? 'bun' : 'node'], profileId === 'bun.esm' ? '1.3.2' : '24.22.1');
			assert.ok(s.packets.every(p => p.request.profileId === profileId && p.packet.byteLength <= 196608));
			assert.deepEqual(await prepare(f.root), { status: 'aligned', calls: 0 }); await publish(f.root, s.id, s.reviewId, true); assert.equal(await physicalImage(f.root, 'package.json'), null);
		});
	}
}
test('DAI11 Node to Bun switch seals the complete plan, preserves PIM/IDs/criteria and reruns the new runtime', async t => {
	const f = await fixture(t, 'state', 'node.esm'), first = await checked(f.root), target = switchModelStack(f.model, 'bun.esm');
	assert.deepEqual(switchModelStack(target, 'node.esm'), f.model); await f.save(target);
	await assert.rejects(publish(f.root, first.id, first.reviewId), /passing|requires/i);
	const p = await prepare(f.root); assert.match(p.session.stackPlan.storage, /Stop\/drain/); assert.notEqual(p.session.profileHash, first.profileHash); assert.equal(p.session.mutations.filter(m => m.file.startsWith('src/')).length, 0);
	const v = await verify(f.root, p.session.id, p.session.reviewId); assert.equal(v.status, 'passed', v.verification.output); await publish(f.root, v.id, v.reviewId);
	assert.deepEqual(await prepare(f.root), { status: 'aligned', calls: 0 }); await publish(f.root, v.id, v.reviewId, true); assert.equal(JSON.parse(await readFile(join(f.root, 'package.json'))).engines.node, '24.22.1');
});
test('DAI11 Bun wrong business rule passes derived checks but fails independent zero criterion', async t => {
	const f = await fixture(t), first = await checked(f.root); f.model.foundation.predicates[0].nodes[2].operator = 'ge'; await f.save(f.model);
	const { session: s } = await prepare(f.root), v = await verify(f.root, s.id, s.reviewId); assert.equal(v.status, 'failed'); assert.match(v.verification.output, /quantity.1/); await assert.rejects(publish(f.root, s.id, s.reviewId), /passing/);
	assert.match((await physicalImage(f.root, first.next.artifacts[0].file)).content, /v0>v1/);
});
test('DAI11 missing or wrong Bun executable cannot produce a Node success', async t => {
	const f = await fixture(t), { session: s } = await prepare(f.root), configured = process.env.ADE_BUN_EXECUTABLE;
	try {
		for (const value of ['', 'bun', process.execPath]) { process.env.ADE_BUN_EXECUTABLE = value; const v = await verify(f.root, s.id, s.reviewId); assert.equal(v.status, 'failed'); assert.match(v.verification.output, /Bun|ADE_BUN/); }
	} finally { process.env.ADE_BUN_EXECUTABLE = configured; }
});
test('DAI11 Bun nested move, external rename, index loss, delete and exact mode/custom text undo', async t => {
	const f = await fixture(t), first = await checked(f.root), a = first.next.artifacts[0];
	const custom = '// custom\n' + (await physicalImage(f.root, a.file)).content + '// retained\n'; await writeFile(join(f.root, a.file), custom); await chmod(join(f.root, a.file), 0o640);
	const moved = await checked(f.root, 'forward', { [a.predicateId]: 'src/domain/orders/quantity.mjs' });
	const realTest = await runProcess(process.env.ADE_BUN_EXECUTABLE, ['test', './test/domain/orders/quantity.test.mjs'], f.root, { env: {} }); assert.equal(realTest.code, 0, realTest.stderr);
	await mkdir(join(f.root, 'src/application')); await rename(join(f.root, 'src/domain/orders/quantity.mjs'), join(f.root, 'src/application/quantity.mjs')); await rm(join(f.root, '.ade/structural/source-index.json'));
	const reversed = await checked(f.root, 'reverse'); assert.equal(reversed.next.artifacts[0].file, 'src/application/quantity.mjs'); assert.deepEqual(await prepare(f.root), { status: 'aligned', calls: 0 });
	const changed = structuredClone(reversed.next.model); changed.foundation.predicates = []; await f.save(changed); const deleted = await checked(f.root);
	assert.equal((await physicalImage(f.root, 'src/application/quantity.mjs')).content, '// custom\n// retained\n'); await publish(f.root, deleted.id, deleted.reviewId, true);
	assert.deepEqual(await physicalImage(f.root, 'src/application/quantity.mjs'), { content: custom, mode: 0o640 }); assert.ok(moved.mutations.some(m => m.after?.mode === 0o640));
});
test('DAI11 Bun visual rule edit and external code edit conflict; post-review inventory invalidates publication', async t => {
	const f = await fixture(t), first = await checked(f.root), a = first.next.artifacts[0], original = await physicalImage(f.root, a.file);
	await writeFile(join(f.root, a.file), original.content.replace('(v0>v1)', '(v0>=v1)')); f.model.foundation.predicates[0].nodes[1].value = 1; await f.save(f.model); await assert.rejects(prepare(f.root, 'reverse'), /Conflict/);
	f.model = first.next.model; await f.save(f.model); await writeFile(join(f.root, a.file), original.content);
	const { session: s } = await prepare(f.root, 'forward', { [a.predicateId]: 'src/new.mjs' }); await verify(f.root, s.id, s.reviewId); await writeFile(join(f.root, 'src/extra.mjs'), 'export const extra = 1;'); await assert.rejects(publish(f.root, s.id, s.reviewId), /inventory/);
});
for (const boundary of ['before', 'during', 'after']) {
	test(`DAI11 Bun interrupted publication ${boundary} commit recovers with the shared journal`, async t => {
		const f = await fixture(t), { session: s } = await prepare(f.root); await verify(f.root, s.id, s.reviewId);
		const path = join(f.root, '.ade/structural/sessions', s.id + '.json'), saved = JSON.parse(await readFile(path)); saved.status = 'publishing'; await writeFile(path, JSON.stringify(saved));
		if (boundary !== 'before') { const mutations = boundary === 'during' ? s.mutations.slice(0, 1) : s.mutations; for (const m of mutations) { await replacePhysicalImage(f.root, m.file, m.before, m.after); } }
		if (boundary === 'after') { await writeFile(join(f.root, '.ade/structural/snapshots', s.id + '.json'), JSON.stringify(s.next)); await writeFile(join(f.root, '.ade/structural/active.json'), JSON.stringify({ id: s.id })); }
		const value = await recover(f.root, s.id); assert.equal(value.status, boundary === 'after' ? 'applied' : 'rolledBack'); for (const m of s.mutations) { assert.deepEqual(await physicalImage(f.root, m.file), boundary === 'after' ? m.after : m.before); }
	});
}
test('DAI11 Bun continuous preparation coalesces, reserves budget and never publishes; profile change invalidates old packet', async t => {
	const f = await fixture(t), accepted = [], q = new ModelContinuity(v => accepted.push(v), () => {}, 60000); t.after(() => q.dispose());
	q.configure({ version: 1, revision: '1', root: f.root, maxPreparations: 2, attempted: 0, maxInputBytes: 196608, outputReserveBytes: 65536, review: 'manual', providerCalls: 0 });
	q.update('one', true, () => prepare(f.root)); q.update('two', true, () => prepare(f.root)); await q.flush(); assert.equal(accepted.length, 1); assert.equal(q.budget.attempted, 1); assert.equal(await physicalImage(f.root, 'package.json'), null);
	const s = accepted[0].session; await f.save(switchModelStack(f.model, 'node.esm')); await assert.rejects(verify(f.root, s.id, s.reviewId), /stale/);
});
test('DAI11 offline checkpoint copies Node to Bun to Node, with no replay and exact data; corrupt/incompatible data rejected', async t => {
	const f = await fixture(t, 'state', 'node.esm'), target = switchModelStack(f.model, 'bun.esm'), instance = await executeStateProgram(compileModelStateMachine(f.model, 'checkout.lifecycle'), { 'order.id': '42' }, 'order-42', replies());
	t.after(() => instance.dispose()); await instance.send({ id: 'pay-1', eventId: 'event.pay', input: { 'pay.amount': 10 } }, replies()); await instance.settle();
	const snapshot = instance.checkpoint(), transferred = await transferModelCheckpoint(f.model, target, snapshot); assert.deepEqual(transferred.checkpoint, snapshot); assert.equal(transferred.sourceHash, transferred.targetHash);
	await writeFile(join(f.root, 'machine.mjs'), emitModelStateMachine(target, 'checkout.lifecycle')); await writeFile(join(f.root, 'checkpoint.json'), JSON.stringify(snapshot));
	const script = `import {readFileSync,writeFileSync} from 'node:fs';import {createInstance} from './machine.mjs';const s=JSON.parse(readFileSync('checkpoint.json'));const i=await createInstance(s.input,s.instanceId,{},s);await i.settle();if(i.inspect().trace.length)throw Error('replayed');writeFileSync('returned.json',JSON.stringify(i.checkpoint()));await i.dispose();`;
	await writeFile(join(f.root, 'transfer.mjs'), script); const actual = await runProcess(process.env.ADE_BUN_EXECUTABLE, ['run', './transfer.mjs'], f.root, { env: {} }); assert.equal(actual.code, 0, actual.stderr);
	const returned = JSON.parse(await readFile(join(f.root, 'returned.json'))), restored = await transferModelCheckpoint(target, f.model, returned); assert.deepEqual(restored.checkpoint, snapshot);
	for (const change of [{ programRevision: 'stale' }, { sequence: 20 }, { stateId: 'absent' }, { extra: true }]) { await assert.rejects(transferModelCheckpoint(f.model, target, { ...snapshot, ...change }), /stateCheckpoint/); }
	const incompatible = structuredClone(target); incompatible.foundation.stateMachines[0].revision = '2'; await assert.rejects(transferModelCheckpoint(f.model, incompatible, snapshot), /PIM/);
});

test('DAI11 manual manifest runtime drift blocks aligned review and preserves the user file', async t => {
	const f = await fixture(t), s = await checked(f.root), manifest = join(f.root, 'package.json'), changed = JSON.stringify({ private: true, type: 'module', engines: { node: '24.22.1' } });
	await writeFile(manifest, changed); await assert.rejects(prepare(f.root), /Manifest runtime/); assert.equal(await readFile(manifest, 'utf8'), changed); assert.equal(s.status, 'passed');
});
test('DAI11 Bun preventive input overflow fails before a worktree, without truncation', async t => {
	const f = await fixture(t); await assert.rejects(prepare(f.root, 'forward', {}, 1000), /budget|Budget|exceed/); assert.equal(await physicalImage(f.root, 'package.json'), null);
});
