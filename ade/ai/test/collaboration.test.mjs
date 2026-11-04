/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, access, symlink, chmod, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture, config, original } from './fixtures.mjs';
import { assertPreparedCurrent, prepareImplementation } from '../context.ts';
import { readImplementationPlan } from '../plan.ts';
import { proposeImplementation } from '../collaboration.ts';
import { stageImplementation, verifyImplementation, applyImplementation, planReviewId, readSession, readGeneratedImplementation } from '../implementation.ts';
import { readProviderConfig } from '../contracts.ts';
import { executeCollaboration } from '../engine.ts';

test('payment refusal: model → reviewed plan → isolated implementation → real tests → apply → undo after restart', async t => {
	const f = await fixture(t);
	const proposal = await proposeImplementation(f.prepared, f.prepared.reviewId, undefined, { propose: async () => ({ plan: f.plan, usage: { inputTokens: null, outputTokens: null } }) });
	const stage = await stageImplementation(f.prepared, proposal.plan, planReviewId(f.prepared, proposal.plan), undefined, f.provider);
	assert.equal(await readFile(join(f.root, 'checkout.mjs'), 'utf8'), original);
	const verified = await verifyImplementation(f.root, stage.id, stage.reviewId);
	assert.deepEqual({ status: verified.status, code: verified.verification.code, files: verified.verification.testFiles }, { status: 'passed', code: 0, files: ['checkout.test.mjs'] });
	await applyImplementation(f.root, stage.id, stage.reviewId);
	assert.equal(await readFile(join(f.root, 'checkout.mjs'), 'utf8'), f.generated.files[0].content);
	const restoredSession = JSON.parse(await executeCollaboration(JSON.stringify({ operation: 'session', root: f.root, id: stage.id })));
	await applyImplementation(f.root, restoredSession.id, restoredSession.reviewId, true);
	assert.equal(await readFile(join(f.root, 'checkout.mjs'), 'utf8'), original);
	await assert.rejects(access(join(f.root, 'checkout.test.mjs')));
});

test('failed tests remain failed and cannot be applied', async t => {
	const f = await fixture(t);
	f.generated.files[1].content = "import assert from 'node:assert/strict'; assert.fail('Acceptance failed');\n";
	const stage = await stageImplementation(f.prepared, f.plan, planReviewId(f.prepared, f.plan), undefined, f.provider);
	const verified = await verifyImplementation(f.root, stage.id, stage.reviewId);
	assert.deepEqual({ status: verified.status, code: verified.verification.code }, { status: 'failed', code: 1 });
	await assert.rejects(applyImplementation(f.root, stage.id, stage.reviewId), /passing/);
	assert.equal(await readFile(join(f.root, 'checkout.mjs'), 'utf8'), original);
});

test('every selected file and the undisclosed M4 manifest participate in freshness checks', async t => {
	const f = await fixture(t);
	await writeFile(join(f.root, 'other.mjs'), 'export const value = 1;');
	await assert.rejects(assertPreparedCurrent(f.prepared, f.prepared.reviewId), /manifest changed/);
});

test('review binds provider, model, complete payload, instruction and output schema', async t => {
	const f = await fixture(t);
	for (const change of [value => { value.config.model = 'other'; }, value => { value.context.intent = 'Changed'; }, value => { value.disclosure.instruction = 'Changed'; }]) {
		const edited = structuredClone(f.prepared); change(edited);
		await assert.rejects(assertPreparedCurrent(edited, f.prepared.reviewId), /Review does not match/);
	}
	assert.deepEqual(f.prepared.context.sources.map(source => source.file), ['checkout.mjs']);
	assert.equal(JSON.stringify(f.prepared.context).includes(f.root), false);
});

test('malformed plans, invented references, path traversal and out-of-scope modifications are rejected', async t => {
	const f = await fixture(t);
	for (const mutation of [value => { value.commands = ['echo unsafe']; }, value => { value.steps[0].elementIds = ['invented']; }, value => { value.changes[0].file = '../other.mjs'; }, value => { value.tests[0].criterionId = 'invented'; }]) {
		const edited = structuredClone(f.plan); mutation(edited);
		assert.throws(() => readImplementationPlan(edited, f.prepared.context));
	}
	const edited = structuredClone(f.generated); edited.files[0].baseRevision = '0'.repeat(64);
	assert.throws(() => readGeneratedImplementation(edited, f.prepared, f.plan), /base revision/);
});

test('missing criteria, unanswered questions, unapproved plans and changed worktrees block execution', async t => {
	const f = await fixture(t);
	await assert.rejects(stageImplementation(f.prepared, f.plan, 'wrong', undefined, f.provider), /review/);
	const questions = structuredClone(f.plan); questions.questions.push({ question: 'Which error?', reason: 'Ambiguous' });
	await assert.rejects(stageImplementation(f.prepared, questions, planReviewId(f.prepared, questions), undefined, f.provider), /questions/);
	const stage = await stageImplementation(f.prepared, f.plan, planReviewId(f.prepared, f.plan), undefined, f.provider);
	await writeFile(join(stage.worktree, 'checkout.mjs'), 'changed');
	await assert.rejects(verifyImplementation(f.root, stage.id, stage.reviewId), /changed after review/);
});

test('undo preserves later manual edits instead of overwriting them', async t => {
	const f = await fixture(t);
	const stage = await stageImplementation(f.prepared, f.plan, planReviewId(f.prepared, f.plan), undefined, f.provider);
	await verifyImplementation(f.root, stage.id, stage.reviewId);
	await applyImplementation(f.root, stage.id, stage.reviewId);
	await writeFile(join(f.root, 'checkout.mjs'), 'manual change');
	await assert.rejects(applyImplementation(f.root, stage.id, stage.reviewId, true), /manual edits/);
	assert.equal(await readFile(join(f.root, 'checkout.mjs'), 'utf8'), 'manual change');
});

test('symlinks, hidden sources, invalid credentials/config, byte budgets and cancellation fail before inference', async t => {
	const f = await fixture(t);
	assert.throws(() => readProviderConfig({ ...config, apiKey: 'fixture-secret' }), /configuration/);
	assert.throws(() => readProviderConfig({ ...config, connection: 'subscription-token' }), /configuration/);
	await assert.rejects(prepareImplementation(f.request, { ...config, maxContextBytes: 1024 }), /byte budget/);
	await assert.rejects(prepareImplementation({ ...f.request, sourceFiles: ['../secret.mjs'] }, config));
	const controller = new AbortController(); controller.abort();
	await assert.rejects(prepareImplementation(f.request, config, controller.signal));
	await symlink(join(f.root, 'checkout.mjs'), join(f.root, 'linked.mjs'));
	await assert.rejects(assertPreparedCurrent(f.prepared, f.prepared.reviewId), /manifest changed/);
});

test('provider completion after a source change cannot publish a successful plan', async t => {
	const f = await fixture(t);
	await assert.rejects(proposeImplementation(f.prepared, f.prepared.reviewId, undefined, { propose: async () => {
		await writeFile(join(f.root, 'checkout.mjs'), 'export const changed = true;');
		return { plan: f.plan, usage: { inputTokens: null, outputTokens: null } };
	} }), /Source changed/);
	await assert.rejects(readSession(f.root, '../outside'), /session ID/);
});

test('saved zero-call and plan-only budgets block inference or generation before invoking a provider', async t => {
	const f = await fixture(t);
	const none = await prepareImplementation(f.request, { ...config, maxCalls: 0 });
	await assert.rejects(proposeImplementation(none, none.reviewId, undefined, { propose: async () => { throw new Error('Must not call the provider'); } }), /budget allows no AI/);
	const planOnly = await prepareImplementation(f.request, { ...config, maxCalls: 1 });
	await assert.rejects(stageImplementation(planOnly, f.plan, planReviewId(planOnly, f.plan), undefined, { complete: async () => { throw new Error('Must not call the provider'); } }), /second explicit call/);
});

test('existing files outside disclosed sources block planned creation before another AI run is spent', async t => {
	const f = await fixture(t, 'checkout', { 'checkout.test.mjs': 'export const existing = true;\n' });
	await assert.rejects(stageImplementation(f.prepared, f.plan, planReviewId(f.prepared, f.plan), undefined, { complete: async () => { throw new Error('Must not call the provider'); } }), /Planned file creation/);
});

test('application and undo preserve the original source permissions rather than the checkout defaults', { skip: process.platform === 'win32' }, async t => {
	const f = await fixture(t);
	const path = join(f.root, 'checkout.mjs'); await chmod(path, 0o600);
	const session = await stageImplementation(f.prepared, f.plan, planReviewId(f.prepared, f.plan), undefined, f.provider);
	await verifyImplementation(f.root, session.id, session.reviewId);
	await applyImplementation(f.root, session.id, session.reviewId);
	assert.equal((await stat(path)).mode & 0o777, 0o600);
	await applyImplementation(f.root, session.id, session.reviewId, true);
	assert.deepEqual({ mode: (await stat(path)).mode & 0o777, content: await readFile(path, 'utf8') }, { mode: 0o600, content: original });
});

test('UTF-8 source BOM is retained in the approved source and revision instead of being silently stripped', async t => {
	const f = await fixture(t, 'checkout', { 'checkout.mjs': '\ufeff' + original });
	assert.equal(f.prepared.context.sources[0].content, '\ufeff' + original);
	await assertPreparedCurrent(f.prepared, f.prepared.reviewId);
});
