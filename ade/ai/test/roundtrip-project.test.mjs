/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, rename, chmod, stat, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import '../../scripts/source-loader.mjs';
import { checkoutStates, stateCriteria } from '../../test/fixtures/dai-states.mjs';
import { checkoutMessaging, messagingCriteria } from '../../test/fixtures/dai-messaging.mjs';
const { prepareStructuralProject: prepare, verifyStructuralProject: verify, publishStructuralProject: apply, recoverStructuralProject: recover } = await import('../structuralProject.ts');
const { switchModelStack } = await import('../../../src/vs/workbench/contrib/ade/common/modelStack.ts');
const { physicalImage, replacePhysicalImage } = await import('../../runtime/sourceChanges.ts');
const { stateMachineRegion } = await import('../../../src/vs/workbench/contrib/ade/common/stateRuntime.ts');
const { messagingRegion } = await import('../../../src/vs/workbench/contrib/ade/common/modelMessaging.ts');
const { interactionRegion } = await import('../../../src/vs/workbench/contrib/ade/common/interactionRuntime.ts');
async function fixture(t, kind = 'messaging') {
	const root = await mkdtemp(join(tmpdir(), 'ade-dai09-')); t.after(() => rm(root, { recursive: true, force: true }));
	const authored = structuredClone(['state', 'interaction'].includes(kind) ? checkoutStates : checkoutMessaging);
	const model = process.env.ADE_ROUNDTRIP_PROFILE ? switchModelStack(authored, process.env.ADE_ROUNDTRIP_PROFILE) : authored;
	const criteria = structuredClone(['state', 'interaction'].includes(kind) ? stateCriteria : messagingCriteria);
	if (kind === 'interaction') { model.foundation.stateMachines = []; model.views = []; }
	await mkdir(join(root, '.ade')); await writeFile(join(root, '.ade/model.json'), JSON.stringify(model, null, '\t') + '\n'); await writeFile(join(root, '.ade/criteria.json'), JSON.stringify(criteria));
	return { root, model, criteria };
}
async function publish(root, direction = 'forward', paths = {}) {
	const p = await prepare(root, direction, paths); assert.equal(p.status, 'staged'); const s = p.session;
	const c = await verify(root, s.id, s.reviewId); assert.equal(c.status, 'passed', c.verification.output); await apply(root, c.id, c.reviewId); return c;
}
const select = (s, kind) => s.next.artifacts.find(a => kind === 'predicate' ? !a.interactionId && !a.stateMachineId && !a.messagingId : a[kind === 'state' ? 'stateMachineId' : kind + 'Id']);
const modelFile = root => join(root, '.ade/model.json');
const cache = root => join(root, '.ade/structural/source-index.json');

for (const kind of ['predicate', 'interaction', 'state', 'messaging']) {
	test(`DAI09 F01 ${kind}: create, nested move, external rename, delete, exact undo, index loss and zero echo`, async t => {
		const f = await fixture(t, kind), first = await publish(f.root), a = select(first, kind);
		const original = '// custom head\n' + await readFile(join(f.root, a.file), 'utf8') + '// custom tail\n';
		await writeFile(join(f.root, a.file), original); await chmod(join(f.root, a.file), 0o640);
		const moved = await publish(f.root, 'forward', { [a.predicateId]: 'src/domain/orders/renamed.mjs' });
		assert.deepEqual(await physicalImage(f.root, 'src/domain/orders/renamed.mjs'), { content: original, mode: 0o640 }); assert.equal(await physicalImage(f.root, a.file), null);
		// Execute the actual mirrored test file: relative imports must work below test/domain/orders.
		execFileSync(process.env.ADE_ROUNDTRIP_PROFILE === 'bun.esm' ? process.env.ADE_BUN_EXECUTABLE : process.execPath, [process.env.ADE_ROUNDTRIP_PROFILE === 'bun.esm' ? 'test' : '--test', './test/domain/orders/renamed.test.mjs'], { cwd: f.root, stdio: 'pipe' });
		await mkdir(join(f.root, 'src/application'), { recursive: true }); await rename(join(f.root, 'src/domain/orders/renamed.mjs'), join(f.root, 'src/application/renamed.mjs'));
		await rm(cache(f.root)); const reversed = await publish(f.root, 'reverse');
		assert.equal(select(reversed, kind).predicateId, a.predicateId); assert.equal(select(reversed, kind).file, 'src/application/renamed.mjs');
		const sourceMtime = (await stat(join(f.root, 'src/application/renamed.mjs'))).mtimeMs; const before = await stat(cache(f.root)); assert.deepEqual(await prepare(f.root, 'reverse'), { status: 'aligned', calls: 0 }); assert.equal((await stat(cache(f.root))).mtimeMs, before.mtimeMs); assert.equal((await stat(join(f.root, 'src/application/renamed.mjs'))).mtimeMs, sourceMtime);
		assert.ok(reversed.packets.find(p => p.request.target.id === (a.messagingId ?? a.stateMachineId ?? a.interactionId ?? a.operationId)).request.sources.some(s => s.file === 'src/application/renamed.mjs'));
		await writeFile(cache(f.root), '{corrupt'); assert.deepEqual(await prepare(f.root), { status: 'aligned', calls: 0 }); assert.equal(JSON.parse(await readFile(cache(f.root))).producer, 'typescript-6.0.2');
		const model = JSON.parse(await readFile(modelFile(f.root)));
		if (kind === 'predicate') { model.foundation.predicates = model.foundation.predicates.filter(p => p.id !== a.predicateId); }
		if (kind === 'interaction') { model.foundation.interactions = model.foundation.interactions.filter(p => p.id !== a.predicateId); }
		if (kind === 'state') { model.foundation.stateMachines = []; for (const view of model.views) { delete view.stateMachineId; } }
		if (kind === 'messaging') { model.foundation.messaging = []; for (const view of model.views) { delete view.messagingId; } model.foundation.occurrences = model.foundation.occurrences.filter(o => !o.messagingBindingId); model.foundation.decisions = model.foundation.decisions.filter(d => d.id !== 'adr.messaging'); model.semantics.elements = model.semantics.elements.filter(e => e.id !== 'broker'); model.foundation.ownership = model.foundation.ownership.filter(o => o.elementId !== 'broker'); model.foundation.platform.bindings = model.foundation.platform.bindings.filter(b => b.elementId !== 'broker'); for (const view of model.views) { view.nodes = view.nodes.filter(n => n.elementId !== 'broker'); } }
		await writeFile(modelFile(f.root), JSON.stringify(model, null, '\t') + '\n');
		const removed = await publish(f.root); assert.equal(await readFile(join(f.root, 'src/application/renamed.mjs'), 'utf8'), '// custom head\n// custom tail\n');
		await apply(f.root, removed.id, removed.reviewId, true); assert.deepEqual(await physicalImage(f.root, 'src/application/renamed.mjs'), { content: original, mode: 0o640 });
		assert.ok(moved.mutations.some(e => e.before === null && e.after?.mode === 0o640));
	});
}

test('DAI09 F02 test-destination collision, duplicate identity, and post-review new source are blocked', async t => {
	const f = await fixture(t), first = await publish(f.root), a = select(first, 'messaging');
	await mkdir(join(f.root, 'test/custom'), { recursive: true }); await writeFile(join(f.root, 'test/custom/destination.test.mjs'), 'user tests');
	await assert.rejects(prepare(f.root, 'forward', { [a.predicateId]: 'src/custom/destination.mjs' }), /destination already exists/);
	await copyFile(join(f.root, a.file), join(f.root, 'src/duplicate.mjs')); await assert.rejects(prepare(f.root), /Ambiguous physical identity/); await rm(join(f.root, 'src/duplicate.mjs'));
	const p = await prepare(f.root, 'forward', { [a.predicateId]: 'src/new.mjs' }); await verify(f.root, p.session.id, p.session.reviewId);
	await copyFile(join(f.root, a.file), join(f.root, 'src/duplicate.mjs')); await assert.rejects(apply(f.root, p.session.id, p.session.reviewId), /inventory changed/);
	assert.equal(await readFile(join(f.root, 'test/custom/destination.test.mjs'), 'utf8'), 'user tests');
});

for (const field of ['contract', 'decision', 'platform', 'policy']) {
	test('DAI09 C01 concurrent ' + field + ' and same-signature policy body produce an explicit conflict', async t => {
		const f = await fixture(t), first = await publish(f.root), a = select(first, 'messaging'), sourceModel = structuredClone(f.model);
		sourceModel.foundation.messaging[0].subscriptions[0].ackWaitMs = 1000;
		await writeFile(join(f.root, a.file), messagingRegion(sourceModel, a.predicateId));
		if (field === 'contract') { f.model.foundation.blueprint.operations[0].name += 'Changed'; }
		if (field === 'decision') { f.model.foundation.decisions[0].record.decision += ' Changed'; }
		if (field === 'platform') { f.model.foundation.platform.bindings[0].technology.value = 'unsupported'; }
		if (field === 'policy') { f.model.foundation.messaging[0].subscriptions[0].ackWaitMs = 1500; }
		await writeFile(modelFile(f.root), JSON.stringify(f.model)); await assert.rejects(prepare(f.root, 'reverse'), /Conflict/);
		assert.equal(JSON.parse(await readFile(modelFile(f.root))).foundation.messaging[0].subscriptions[0].ackWaitMs, field === 'policy' ? 1500 : 500);
	});
}

for (const kind of ['interaction', 'state', 'messaging']) {
	test('DAI09 R01 ' + kind + ': same-signature plan reverse preserves layout; absent resource stays partial', async t => {
		const f = await fixture(t, kind), first = await publish(f.root), a = select(first, kind), model = structuredClone(f.model);
		let source;
		if (kind === 'state') { model.foundation.stateMachines[0].transitions[0].priority = 2; source = stateMachineRegion(model, a.predicateId); }
		if (kind === 'messaging') { model.foundation.messaging[0].subscriptions[0].ackWaitMs = 1000; source = messagingRegion(model, a.predicateId); }
		if (kind === 'interaction') { model.foundation.occurrences.find(o => o.id === model.foundation.interactions[0].occurrenceIds[0]).execution.timeoutMs = 1500; source = interactionRegion(model, a.predicateId); }
		const layout = JSON.parse(await readFile(modelFile(f.root))); if (layout.views[0]?.nodes[0]) { layout.views[0].nodes[0].x = 987; } layout.name += ' annotated';
		await writeFile(modelFile(f.root), JSON.stringify(layout)); await writeFile(join(f.root, a.file), '// manual\n' + source);
		const reversed = await publish(f.root, 'reverse'); assert.deepEqual(reversed.next.model.views, layout.views); assert.equal(reversed.next.model.name, layout.name); assert.deepEqual(reversed.next.model.foundation.blueprint, layout.foundation.blueprint);
		await rm(join(f.root, a.file)); const before = await readFile(modelFile(f.root), 'utf8'); await assert.rejects(prepare(f.root, 'reverse'), /Partial/); assert.equal(await readFile(modelFile(f.root), 'utf8'), before);
	});
}

for (const phase of ['before', 'partial', 'committed']) {
	test('DAI09 J01 nested move recovery and missing cache: ' + phase, async t => {
		const f = await fixture(t), first = await publish(f.root), a = select(first, 'messaging'), p = await prepare(f.root, 'forward', { [a.predicateId]: 'src/moved/channel.mjs' }), s = p.session;
		await verify(f.root, s.id, s.reviewId);
		await writeFile(join(f.root, '.ade/structural/sessions', s.id + '.json'), JSON.stringify({ ...s, status: 'publishing' }));
		for (const e of phase === 'before' ? [] : phase === 'partial' ? s.mutations.slice(0, 2) : s.mutations) { await replacePhysicalImage(f.root, e.file, e.before, e.after); }
		if (phase === 'committed') { await writeFile(join(f.root, '.ade/structural/snapshots', s.id + '.json'), JSON.stringify(s.next)); await writeFile(join(f.root, '.ade/structural/active.json'), JSON.stringify({ id: s.id })); }
		await rm(cache(f.root)); const recovered = await recover(f.root, s.id);
		assert.equal(recovered.status, phase === 'committed' ? 'applied' : 'rolledBack'); const index = JSON.parse(await readFile(cache(f.root))); assert.equal(index.entries.find(e => e.identity?.id === a.predicateId).file, phase === 'committed' ? 'src/moved/channel.mjs' : a.file);
	});
}

test('DAI09 J02 undo refuses a manual permission change; parser facts do not certify custom intent', async t => {
	const f = await fixture(t), first = await publish(f.root), a = select(first, 'messaging'); await chmod(join(f.root, a.file), 0o600);
	await assert.rejects(apply(f.root, first.id, first.reviewId, true), /Manual/);
	await writeFile(join(f.root, 'src/custom.mjs'), 'export default function custom(){ return "not a model"; }'); await prepare(f.root);
	const index = JSON.parse(await readFile(cache(f.root))), custom = index.entries.find(e => e.file === 'src/custom.mjs');
	assert.deepEqual([custom.mapping, custom.identity, custom.parser.exports, custom.parser.diagnostics], ['unowned', undefined, ['default'], []]);
});

test('DAI09 J03 loss of authoritative baseline blocks bootstrap; source cache cannot recreate intent', async t => {
	const f = await fixture(t), s = await publish(f.root); await rm(join(f.root, '.ade/structural/snapshots', s.id + '.json'));
	await assert.rejects(prepare(f.root), /Missing common structural baseline/);
	assert.ok(await physicalImage(f.root, s.next.artifacts[0].file));
});

test('DAI09 R02 resource or executable-runtime edits remain partial and do not rewrite a normative ADR', async t => {
	const f = await fixture(t), s = await publish(f.root), a = select(s, 'messaging'), before = await readFile(modelFile(f.root), 'utf8');
	const m = structuredClone(f.model); m.foundation.messaging[0].channels[0].subject = 'different.queue';
	await writeFile(join(f.root, a.file), messagingRegion(m, a.predicateId)); await assert.rejects(prepare(f.root, 'reverse'), /Partial messaging/);
	assert.equal(await readFile(modelFile(f.root), 'utf8'), before);
	const source = messagingRegion(f.model, a.predicateId); await writeFile(join(f.root, a.file), source.replace('export default', 'throw new Error("arbitrary");\nexport default'));
	await assert.rejects(prepare(f.root, 'reverse'), /Partial messaging/); assert.equal(await readFile(modelFile(f.root), 'utf8'), before);
});

test('DAI09 F03 nested symlink and path traversal fail before any project mutation', async t => {
	const { symlink } = await import('node:fs/promises'); const f = await fixture(t), s = await publish(f.root), a = select(s, 'messaging');
	await assert.rejects(prepare(f.root, 'forward', { [a.predicateId]: 'src/deep/../escape.mjs' }), /physical source path|scope/);
	await symlink(join(f.root, '.ade'), join(f.root, 'src/redirect'));
	await assert.rejects(prepare(f.root), /Redirected/); assert.ok(await physicalImage(f.root, a.file));
});
