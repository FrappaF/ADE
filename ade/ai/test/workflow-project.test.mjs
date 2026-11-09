/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import '../../scripts/source-loader.mjs';
import { checkoutMessaging, messagingCriteria } from '../../test/fixtures/dai-messaging.mjs';
const { createPureProject } = await import('../../../src/vs/workbench/contrib/ade/common/modelProject.ts');
const { applyVisualEdit } = await import('../../../src/vs/workbench/contrib/ade/common/visualEditing.ts');
const { executeCollaboration } = await import('../engine.ts');
const call = async (operation, root, fields = {}, signal) => JSON.parse(await executeCollaboration(JSON.stringify({ operation, root, ...fields }), signal));
async function fixture(t, asyncCase = false) {
	const root = await mkdtemp(join(tmpdir(), 'ade-dai10-project-')); t.after(() => rm(root, { recursive: true, force: true })); let next = 0;
	const { model, criteria } = asyncCase ? { model: structuredClone(checkoutMessaging), criteria: messagingCriteria } : createPureProject('Strict Quantity', () => 'id.' + ++next);
	await mkdir(join(root, '.ade')); await writeFile(join(root, '.ade/criteria.json'), JSON.stringify(criteria)); return { root, model, save: async model => writeFile(join(root, '.ade/model.json'), JSON.stringify(model, null, '\t') + '\n') };
}
for (const asyncCase of [false, true]) {
	test(`DAI10 ${asyncCase ? 'async messaging' : 'checkout'}: authored clarification enters sealed context; real checks/publication/undo use the shared protocol`, async t => {
		const f = await fixture(t, asyncCase), target = asyncCase ? { kind: 'messaging', id: f.model.foundation.messaging[0].id } : { kind: 'operation', id: f.model.foundation.blueprint.operations[0].id };
		let model = applyVisualEdit(f.model, { kind: 'taskIntent', entry: { id: 'task.business', target, revision: '1', text: 'Preserve the independently authored business outcome', clarifications: [], history: [] } });
		model = applyVisualEdit(model, { kind: 'taskIntent', expectedRevision: '1', entry: { ...model.foundation.tasks[0], revision: '2', clarifications: [{ question: asyncCase ? 'Acknowledge before persistence?' : 'Accept zero quantity?', answer: 'No' }] } });
		await f.save(model); const first = await call('structuralPrepare', f.root); assert.equal(first.session.calls, 0);
		const packet = first.session.packets.find(p => p.request.target.kind === target.kind && p.request.target.id === target.id); assert.deepEqual(JSON.parse(packet.packet.bytes).intent, { revision: '2', text: model.foundation.tasks[0].text, clarifications: model.foundation.tasks[0].clarifications }); assert.ok(packet.packet.byteLength <= 196608);
		const checked = await call('structuralVerify', f.root, { id: first.session.id, reviewId: first.session.reviewId }); assert.equal(checked.status, 'passed', checked.verification.output);
		await call('structuralApply', f.root, { id: checked.id, reviewId: checked.reviewId });
		assert.deepEqual(await call('structuralPrepare', f.root), { status: 'aligned', calls: 0 });
		await call('structuralUndo', f.root, { id: checked.id, reviewId: checked.reviewId }); assert.deepEqual(JSON.parse(await readFile(join(f.root, '.ade/model.json'))).foundation.tasks, model.foundation.tasks);
	});
}
test('DAI10 a smaller preventive input budget blocks before worktree creation without truncation', async t => {
	const f = await fixture(t); await f.save(f.model);
	await assert.rejects(call('structuralPrepare', f.root, { maxInputBytes: 1000 }), /budget|Budget|exceed/);
	assert.deepEqual(await readdir(join(f.root, '.ade/worktrees')).catch(() => []), []); await assert.rejects(readFile(join(f.root, 'package.json')), { code: 'ENOENT' });
	for (const maxInputBytes of [0, 196609, 1.5]) { await assert.rejects(call('structuralPrepare', f.root, { maxInputBytes }), /Invalid collaboration request/); }
});
test('DAI10 cancelled preparation exits before any adapter files or worktree are written', async t => {
	const f = await fixture(t); await f.save(f.model); const controller = new AbortController(); controller.abort();
	await assert.rejects(call('structuralPrepare', f.root, {}, controller.signal), { name: 'AbortError' }); assert.deepEqual((await readdir(join(f.root, '.ade'))).sort(), ['criteria.json', 'model.json']);
});
test('DAI10 changed clarification after real checks invalidates publication and preserves physical source', async t => {
	const f = await fixture(t); await f.save(f.model); const { session } = await call('structuralPrepare', f.root); await call('structuralVerify', f.root, { id: session.id, reviewId: session.reviewId });
	const model = applyVisualEdit(f.model, { kind: 'taskIntent', entry: { id: 'task.late', target: { kind: 'operation', id: f.model.foundation.blueprint.operations[0].id }, revision: 'new', text: 'New semantic decision after verification', clarifications: [], history: [] } }); await f.save(model);
	await assert.rejects(call('structuralApply', f.root, { id: session.id, reviewId: session.reviewId }), /changed|stale/i); await assert.rejects(readFile(join(f.root, session.next.artifacts[0].file)), { code: 'ENOENT' });
});
