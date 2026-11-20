import '../../scripts/source-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsPromises, { readFile, writeFile, access, realpath, readdir } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { fixture, original } from './fixtures.mjs';
const { stageImplementation, verifyImplementation, planReviewId, recoverImplementation, readSession, applyImplementation } = await import('../implementation.ts');
const { interpretResiduals } = await import('../interpretation.ts');
const { assertNoInterruptedOperation } = await import('../../code-import/reconciliationJournal.ts');

async function interrupted(t) {
	const f = await fixture(t);
	const session = await stageImplementation(f.prepared, f.plan, planReviewId(f.prepared, f.plan), undefined, f.provider);
	await verifyImplementation(f.root, session.id, session.reviewId);
	const mutations = session.generated.files.map(file => ({ file: file.file, expected: session.before.find(before => before.file === file.file).content, next: file.content, mode: session.before.find(before => before.file === file.file).mode ?? 0o644 }));
	await writeFile(join(f.root, '.ordito', 'collaboration', session.id, 'transaction.json'), JSON.stringify({ undo: false, mutations }));
	await writeFile(join(f.root, 'checkout.mjs'), mutations[0].next);
	return { ...f, session };
}

test('unsupported hard links block recovery before claims or legacy journal upgrades', async t => {
	const f = await interrupted(t);
	const path = join(f.root, '.ordito', 'collaboration', f.session.id, 'transaction.json');
	const before = await readFile(path, 'utf8');
	const stub = t.mock.method(fsPromises, 'link', async () => { throw Object.assign(new Error('Hard links unavailable'), { code: 'EOPNOTSUPP' }); });
	syncBuiltinESMExports();
	try {
		await assert.rejects(recoverImplementation(f.root, f.session.id), /no source names were claimed/);
		assert.deepEqual({ source: await readFile(join(f.root, 'checkout.mjs'), 'utf8'), journal: await readFile(path, 'utf8') }, { source: f.generated.files[0].content, journal: before });
	} finally { stub.mock.restore(); syncBuiltinESMExports(); }
	await recoverImplementation(f.root, f.session.id);
	assert.equal(await readFile(join(f.root, 'checkout.mjs'), 'utf8'), original);
});

test('interrupted undo recovers its applied mode receipt across a process umask change', { skip: process.platform === 'win32' }, async t => {
	const f = await fixture(t);
	const session = await stageImplementation(f.prepared, f.plan, planReviewId(f.prepared, f.plan), undefined, f.provider);
	await verifyImplementation(f.root, session.id, session.reviewId);
	const previous = process.umask(0o022);
	try {
		await applyImplementation(f.root, session.id, session.reviewId);
		const modes = (await readSession(f.root, session.id)).appliedModes;
		const rename = fsPromises.rename, link = fsPromises.link;
		const claim = t.mock.method(fsPromises, 'rename', async (from, to) => {
			await rename(from, to);
			if (String(to).endsWith('/apply-0.before')) { throw new Error('Interrupted undo claim'); }
		});
		const restore = t.mock.method(fsPromises, 'link', async (from, to) => {
			if (String(from).endsWith('/apply-0.before')) { throw new Error('Undo recovery unavailable until restart'); }
			return link(from, to);
		});
		syncBuiltinESMExports();
		try { await assert.rejects(applyImplementation(f.root, session.id, session.reviewId, true), /Undo recovery unavailable/); }
		finally { claim.mock.restore(); restore.mock.restore(); syncBuiltinESMExports(); }
		process.umask(0o077);
		const recovered = await recoverImplementation(f.root, session.id);
		assert.deepEqual({ status: recovered.status, modes: recovered.appliedModes }, { status: 'applied', modes });
		await applyImplementation(f.root, session.id, session.reviewId, true);
		assert.equal(await readFile(join(f.root, 'checkout.mjs'), 'utf8'), original);
		await assert.rejects(access(join(f.root, 'checkout.test.mjs')));
	} finally { process.umask(previous); }
});

test('legacy recovery captures and preserves a concurrent write at its last mutation', async t => {
	const f = await interrupted(t), rename = fsPromises.rename;
	const stub = t.mock.method(fsPromises, 'rename', async (from, to) => {
		if (String(from).endsWith('/checkout.mjs') && String(to).endsWith('/restore-0.before')) { await writeFile(from, 'external recovery edit'); }
		return rename(from, to);
	});
	syncBuiltinESMExports();
	try {
		await assert.rejects(recoverImplementation(f.root, f.session.id));
		assert.equal(await readFile(join(f.root, 'checkout.mjs'), 'utf8'), 'external recovery edit');
		const directory = join(f.root, '.ordito', 'collaboration', f.session.id, 'transactions');
		const attempts = await readdir(directory);
		assert.equal(await readFile(join(directory, attempts[0], 'restore-0.before'), 'utf8'), 'external recovery edit');
		await access(join(f.root, '.ordito', 'collaboration', f.session.id, 'transaction.json'));
	} finally { stub.mock.restore(); syncBuiltinESMExports(); }
});

test('recovery never overwrites a creator immediately before restoring the source name', async t => {
	const f = await interrupted(t), link = fsPromises.link;
	const stub = t.mock.method(fsPromises, 'link', async (from, to) => {
		if (String(from).endsWith('/restore-0.next')) { await writeFile(to, 'external creator during recovery'); }
		return link(from, to);
	});
	syncBuiltinESMExports();
	try {
		await assert.rejects(recoverImplementation(f.root, f.session.id));
		assert.equal(await readFile(join(f.root, 'checkout.mjs'), 'utf8'), 'external creator during recovery');
		await access(join(f.root, '.ordito', 'collaboration', f.session.id, 'transaction.json'));
	} finally { stub.mock.restore(); syncBuiltinESMExports(); }
});

test('recovery resumes an interrupted rollback after its source was claimed', async t => {
	const f = await interrupted(t), link = fsPromises.link;
	const stub = t.mock.method(fsPromises, 'link', async (from, to) => {
		if (String(from).endsWith('/restore-0.next')) { throw new Error('Interrupted before restoring the source name'); }
		return link(from, to);
	});
	syncBuiltinESMExports();
	try { await assert.rejects(recoverImplementation(f.root, f.session.id), /Interrupted/); }
	finally { stub.mock.restore(); syncBuiltinESMExports(); }
	await assert.rejects(access(join(f.root, 'checkout.mjs')));
	assert.equal((await recoverImplementation(f.root, f.session.id)).status, 'passed');
	assert.equal(await readFile(join(f.root, 'checkout.mjs'), 'utf8'), original);
});

test('recovery restores the captured inode after an interrupted apply claim', async t => {
	const f = await fixture(t);
	const session = await stageImplementation(f.prepared, f.plan, planReviewId(f.prepared, f.plan), undefined, f.provider);
	await verifyImplementation(f.root, session.id, session.reviewId);
	const rename = fsPromises.rename, link = fsPromises.link;
	const claim = t.mock.method(fsPromises, 'rename', async (from, to) => {
		await rename(from, to);
		if (String(to).endsWith('/apply-0.before')) { throw new Error('Interrupted after source claim'); }
	});
	const restore = t.mock.method(fsPromises, 'link', async (from, to) => {
		if (String(from).endsWith('/apply-0.before')) { throw new Error('Recovery unavailable until restart'); }
		return link(from, to);
	});
	syncBuiltinESMExports();
	try { await assert.rejects(applyImplementation(f.root, session.id, session.reviewId), /Recovery unavailable/); }
	finally { claim.mock.restore(); restore.mock.restore(); syncBuiltinESMExports(); }
	await assert.rejects(access(join(f.root, 'checkout.mjs')));
	assert.equal((await recoverImplementation(f.root, session.id)).status, 'passed');
	assert.equal(await readFile(join(f.root, 'checkout.mjs'), 'utf8'), original);
});

test('interrupted application rolls back only exact applied preimages after restart', async t => {
	const f = await fixture(t);
	const session = await stageImplementation(f.prepared, f.plan, planReviewId(f.prepared, f.plan), undefined, f.provider);
	await verifyImplementation(f.root, session.id, session.reviewId);
	const mutations = session.generated.files.map(file => ({ file: file.file, expected: session.before.find(before => before.file === file.file).content, next: file.content, mode: session.before.find(before => before.file === file.file).mode ?? 0o644 }));
	await writeFile(join(f.root, '.ordito', 'collaboration', session.id, 'transaction.json'), JSON.stringify({ undo: false, mutations }));
	// Finder metadata is not a journal and must not prevent publication or recovery.
	await writeFile(join(f.root, '.ordito', 'collaboration', '.DS_Store'), 'unrelated metadata');
	await writeFile(join(f.root, 'checkout.mjs'), mutations[0].next);
	await assert.rejects(assertNoInterruptedOperation(await realpath(f.root)), /Interrupted implementation/);
	const recovered = await recoverImplementation(f.root, session.id);
	await assertNoInterruptedOperation(await realpath(f.root));
	assert.equal(recovered.status, 'passed');
	assert.equal(await readFile(join(f.root, 'checkout.mjs'), 'utf8'), original);
	await assert.rejects(access(join(f.root, 'checkout.test.mjs')));
});

test('worktree side effects from tests are failed verification, and the main project remains untouched', async t => {
	const f = await fixture(t);
	f.generated.files[1].content = `import {writeFileSync} from 'node:fs';writeFileSync('unexpected.mjs','side effect');\n`;
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
	f.generated.files[1].content = `import test from 'node:test';test('delayed local verification',async()=>new Promise(resolve=>setTimeout(resolve,1000)));\n`;
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
