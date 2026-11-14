/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../scripts/source-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture, original } from './fixtures.mjs';
const { stageImplementation, verifyImplementation, planReviewId, recoverImplementation, readSession, applyImplementation } = await import('../implementation.ts');
const { interpretResiduals } = await import('../interpretation.ts');

test('interrupted application rolls back only exact applied preimages after restart', async t => {
	const f = await fixture(t);
	const session = await stageImplementation(f.prepared, f.plan, planReviewId(f.prepared, f.plan), undefined, f.provider);
	await verifyImplementation(f.root, session.id, session.reviewId);
	const mutations = session.generated.files.map(file => ({ file: file.file, expected: session.before.find(before => before.file === file.file).content, next: file.content, mode: session.before.find(before => before.file === file.file).mode ?? 0o644 }));
	await writeFile(join(f.root, '.ade', 'collaboration', session.id, 'transaction.json'), JSON.stringify({ undo: false, mutations }));
	await writeFile(join(f.root, 'checkout.mjs'), mutations[0].next);
	const recovered = await recoverImplementation(f.root, session.id);
	assert.equal(recovered.status, 'passed');
	assert.equal(await readFile(join(f.root, 'checkout.mjs'), 'utf8'), original);
	await assert.rejects(access(join(f.root, 'checkout.test.mjs')));
});

test('worktree side effects from tests are failed verification, and the main project remains untouched', async t => {
	const f = await fixture(t);
	f.generated.files[1].content = "import {writeFileSync} from 'node:fs';writeFileSync('unexpected.mjs','side effect');\n";
	const session = await stageImplementation(f.prepared, f.plan, planReviewId(f.prepared, f.plan), undefined, f.provider);
	const verified = await verifyImplementation(f.root, session.id, session.reviewId);
	assert.deepEqual({ status: verified.status, output: verified.verification.output }, { status: 'failed', output: 'Worktree contains changes outside the reviewed implementation' });
	await assert.rejects(access(join(f.root, 'unexpected.mjs')));
});

test('interpretation skips AI entirely when deterministic evidence has no residual diagnostics', async t => {
	const f = await fixture(t);
	const result = await interpretResiduals(f.prepared, f.prepared.reviewId, undefined, { complete: async () => { throw new Error('Must not call AI'); } });
	assert.deepEqual({ status: result.status, calls: result.calls, hypotheses: result.hypotheses }, { status: 'not-needed', calls: 0, hypotheses: [] });
});


test('verification invalidates a prior pass before execution and retains cancellation across restart', async t => {
	const f = await fixture(t);
	f.generated.files[1].content = "import test from 'node:test';test('delayed local verification',async()=>new Promise(resolve=>setTimeout(resolve,1000)));\n";
	const session = await stageImplementation(f.prepared, f.plan, planReviewId(f.prepared, f.plan), undefined, f.provider);
	assert.equal((await verifyImplementation(f.root, session.id, session.reviewId)).status, 'passed');
	const controller = new AbortController();
	const pending = verifyImplementation(f.root, session.id, session.reviewId, controller.signal);
	let checkpoint;
	for (let attempt = 0; attempt < 100; attempt++) {
		checkpoint = await readSession(f.root, session.id);
		if (checkpoint.verification?.outcome === 'incomplete') { break; }
		await new Promise(resolve => setTimeout(resolve, 10));
	}
	assert.equal(checkpoint.status, 'failed');
	assert.equal(checkpoint.verification.outcome, 'incomplete');
	assert.notEqual(checkpoint.verification.code, 0);
	controller.abort();
	const cancelled = await pending;
	assert.equal(cancelled.verification.outcome, 'cancelled');
	assert.equal((await readSession(f.root, session.id)).verification.outcome, 'cancelled');
	await assert.rejects(applyImplementation(f.root, session.id, session.reviewId), /passing/);
});
