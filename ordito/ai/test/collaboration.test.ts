import '../../scripts/source-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsPromises, { readFile, writeFile, access, symlink, chmod, stat, readdir, open, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import { fixture, config, original } from './fixtures.mjs';
const { assertPreparedCurrent, prepareImplementation } = await import('../context.ts');
const { readImplementationPlan } = await import('../plan.ts');
const { proposeImplementation } = await import('../collaboration.ts');
const { stageImplementation, verifyImplementation, applyImplementation, planReviewId, readSession, readGeneratedImplementation } = await import('../implementation.ts');
const { readProviderConfig } = await import('../contracts.ts');
const { executeCollaboration } = await import('../engine.ts');
const { assertNoInterruptedOperation } = await import('../../code-import/reconciliationJournal.ts');

for (const undo of [false, true]) {
	test(`unsupported hard links reject ${undo ? 'undo' : 'apply'} before claiming any source`, async t => {
		const f = await fixture(t);
		const session = await stageImplementation(f.prepared, f.plan, planReviewId(f.prepared, f.plan), undefined, f.provider);
		await verifyImplementation(f.root, session.id, session.reviewId);
		if (undo) { await applyImplementation(f.root, session.id, session.reviewId); }
		const unsupported = Object.assign(new Error('Hard links unavailable'), { code: 'EOPNOTSUPP' });
		const stub = t.mock.method(fsPromises, 'link', async () => { throw unsupported; });
		syncBuiltinESMExports();
		try {
			await assert.rejects(applyImplementation(f.root, session.id, session.reviewId, undo), error => error.cause === unsupported && /no source names were claimed/.test(error.message));
			assert.equal(await readFile(join(f.root, 'checkout.mjs'), 'utf8'), undo ? f.generated.files[0].content : original);
			await assertNoInterruptedOperation(await realpath(f.root));
			assert.equal((await readSession(f.root, session.id)).status, undo ? 'applied' : 'passed');
		} finally { stub.mock.restore(); syncBuiltinESMExports(); }
	});
}

test('all source parents are probed before the first source is claimed', async t => {
	const f = await fixture(t);
	const testFile = 'tests/checkout.test.mjs';
	f.plan.steps[0].sourceFiles[1] = testFile; f.plan.changes[1].file = testFile;
	f.generated.files[1].file = testFile; f.generated.files[1].content = f.generated.files[1].content.replace('from \'./checkout.mjs\'', 'from \'../checkout.mjs\'');
	f.generated.tests[0].file = testFile;
	const session = await stageImplementation(f.prepared, f.plan, planReviewId(f.prepared, f.plan), undefined, f.provider);
	await verifyImplementation(f.root, session.id, session.reviewId);
	const link = fsPromises.link;
	const stub = t.mock.method(fsPromises, 'link', async (from, to) => {
		if (String(to).includes('/tests/.ordito-capability-')) { throw Object.assign(new Error('Volume cannot link'), { code: 'EXDEV' }); }
		return link(from, to);
	});
	syncBuiltinESMExports();
	try {
		await assert.rejects(applyImplementation(f.root, session.id, session.reviewId), /no source names were claimed/);
		assert.deepEqual({ content: await readFile(join(f.root, 'checkout.mjs'), 'utf8'), backup: await archivedContents(f.root, session.id, 'apply-0.before') }, { content: original, backup: [] });
		await assertNoInterruptedOperation(await realpath(f.root));
	} finally { stub.mock.restore(); syncBuiltinESMExports(); }
});

for (const [applying, undoing] of [[0o022, 0o077], [0o077, 0o022]]) {
	test(`undo after restart keeps applied creation modes across umask ${applying.toString(8)} to ${undoing.toString(8)}`, { skip: process.platform === 'win32' }, async t => {
		const f = await fixture(t);
		const session = await stageImplementation(f.prepared, f.plan, planReviewId(f.prepared, f.plan), undefined, f.provider);
		await verifyImplementation(f.root, session.id, session.reviewId);
		const previous = process.umask(applying);
		try {
			await applyImplementation(f.root, session.id, session.reviewId);
			const restored = await readSession(f.root, session.id);
			assert.equal(restored.appliedModes.find(entry => entry.file === 'checkout.test.mjs').mode, 0o644 & ~applying);
			process.umask(undoing);
			await applyImplementation(f.root, restored.id, restored.reviewId, true);
			assert.equal(await readFile(join(f.root, 'checkout.mjs'), 'utf8'), original);
			await assert.rejects(access(join(f.root, 'checkout.test.mjs')));
		} finally { process.umask(previous); }
	});
}

for (const legacyReceipt of [false, true]) {
	test(`undo preserves manual creation-mode edits even if the new umask matches them (legacy receipt=${legacyReceipt})`, { skip: process.platform === 'win32' }, async t => {
		const f = await fixture(t);
		const session = await stageImplementation(f.prepared, f.plan, planReviewId(f.prepared, f.plan), undefined, f.provider);
		await verifyImplementation(f.root, session.id, session.reviewId);
		const previous = process.umask(0o022);
		try {
			await applyImplementation(f.root, session.id, session.reviewId);
			if (legacyReceipt) {
				const path = join(f.root, '.ordito', 'collaboration', session.id, 'session.json');
				const stored = JSON.parse(await readFile(path, 'utf8')); delete stored.appliedModes;
				await writeFile(path, JSON.stringify(stored));
			}
			await chmod(join(f.root, 'checkout.test.mjs'), 0o600);
			process.umask(0o077);
			const inode = (await stat(join(f.root, 'checkout.mjs'))).ino;
			await assert.rejects(applyImplementation(f.root, session.id, session.reviewId, true), /Source permissions changed since review/);
			assert.deepEqual({ source: await readFile(join(f.root, 'checkout.mjs'), 'utf8'), mode: (await stat(join(f.root, 'checkout.test.mjs'))).mode & 0o777 }, { source: f.generated.files[0].content, mode: 0o600 });
			assert.equal((await stat(join(f.root, 'checkout.mjs'))).ino, inode, 'reject before any source claim');
		} finally { process.umask(previous); }
	});
}

test('legacy applied sessions recover creation modes from retained transaction inodes', { skip: process.platform === 'win32' }, async t => {
	const f = await fixture(t);
	const session = await stageImplementation(f.prepared, f.plan, planReviewId(f.prepared, f.plan), undefined, f.provider);
	await verifyImplementation(f.root, session.id, session.reviewId);
	const previous = process.umask(0o022);
	try {
		await applyImplementation(f.root, session.id, session.reviewId);
		const path = join(f.root, '.ordito', 'collaboration', session.id, 'session.json');
		const stored = JSON.parse(await readFile(path, 'utf8')); delete stored.appliedModes;
		await writeFile(path, JSON.stringify(stored)); process.umask(0o077);
		await applyImplementation(f.root, session.id, session.reviewId, true);
		assert.equal(await readFile(join(f.root, 'checkout.mjs'), 'utf8'), original);
		await assert.rejects(access(join(f.root, 'checkout.test.mjs')));
	} finally { process.umask(previous); }
});

test('pre-archive applied sessions retain their content-based undo compatibility', async t => {
	const f = await fixture(t);
	const session = await stageImplementation(f.prepared, f.plan, planReviewId(f.prepared, f.plan), undefined, f.provider);
	await verifyImplementation(f.root, session.id, session.reviewId);
	for (const file of f.generated.files) { await writeFile(join(f.root, file.file), file.content, { mode: 0o600 }); }
	const stored = await readSession(f.root, session.id); stored.status = 'applied';
	await writeFile(join(f.root, '.ordito', 'collaboration', session.id, 'session.json'), JSON.stringify(stored));
	await applyImplementation(f.root, session.id, session.reviewId, true);
	assert.equal(await readFile(join(f.root, 'checkout.mjs'), 'utf8'), original);
	await assert.rejects(access(join(f.root, 'checkout.test.mjs')));
});

test('creation receipts retain the filesystem effective mode rather than the requested mode', { skip: process.platform === 'win32' }, async t => {
	const f = await fixture(t);
	const session = await stageImplementation(f.prepared, f.plan, planReviewId(f.prepared, f.plan), undefined, f.provider);
	await verifyImplementation(f.root, session.id, session.reviewId);
	const lstat = fsPromises.lstat, previous = process.umask(0o022);
	const stub = t.mock.method(fsPromises, 'lstat', async (path, ...args) => {
		const info = await lstat(path, ...args);
		if (/\/capability-[^/]+\/mode-\d+$/.test(String(path))) { info.mode = info.mode & ~0o004; }
		return info;
	});
	syncBuiltinESMExports();
	try {
		await applyImplementation(f.root, session.id, session.reviewId);
		const restored = await readSession(f.root, session.id);
		assert.deepEqual({ receipt: restored.appliedModes.find(entry => entry.file === 'checkout.test.mjs').mode, mode: (await stat(join(f.root, 'checkout.test.mjs'))).mode & 0o777 }, { receipt: 0o640, mode: 0o640 });
		await applyImplementation(f.root, session.id, session.reviewId, true);
	} finally { stub.mock.restore(); syncBuiltinESMExports(); process.umask(previous); }
});

test('invalid creation mode receipts are rejected before undo changes source names', async t => {
	const f = await fixture(t);
	const session = await stageImplementation(f.prepared, f.plan, planReviewId(f.prepared, f.plan), undefined, f.provider);
	await verifyImplementation(f.root, session.id, session.reviewId); await applyImplementation(f.root, session.id, session.reviewId);
	const path = join(f.root, '.ordito', 'collaboration', session.id, 'session.json');
	const stored = JSON.parse(await readFile(path, 'utf8'));
	for (const mode of [0o777, 2 ** 32 + 0o644]) {
		stored.appliedModes[1].mode = mode;
		await writeFile(path, JSON.stringify(stored));
		await assert.rejects(applyImplementation(f.root, session.id, session.reviewId, true), /Invalid applied source permissions/);
	}
	assert.equal(await readFile(join(f.root, 'checkout.mjs'), 'utf8'), f.generated.files[0].content);
});

test('apply rechecks preimages after journaling and preserves an external edit', async t => {
	const f = await fixture(t);
	const stage = await stageImplementation(f.prepared, f.plan, planReviewId(f.prepared, f.plan), undefined, f.provider);
	await verifyImplementation(f.root, stage.id, stage.reviewId);
	const write = fsPromises.writeFile;
	const stub = t.mock.method(fsPromises, 'writeFile', async (path, ...args) => {
		const result = await write(path, ...args);
		if (String(path).endsWith('/transaction.json')) { await write(join(f.root, 'checkout.mjs'), 'external edit'); }
		return result;
	});
	syncBuiltinESMExports();
	try {
		await assert.rejects(applyImplementation(f.root, stage.id, stage.reviewId), /Source changed during/);
		assert.equal(await readFile(join(f.root, 'checkout.mjs'), 'utf8'), 'external edit');
	} finally { stub.mock.restore(); syncBuiltinESMExports(); }
});

test('rollback never overwrites a post-apply external edit and retains its recovery transaction', async t => {
	const f = await fixture(t);
	const stage = await stageImplementation(f.prepared, f.plan, planReviewId(f.prepared, f.plan), undefined, f.provider);
	await verifyImplementation(f.root, stage.id, stage.reviewId);
	const write = fsPromises.writeFile;
	const stub = t.mock.method(fsPromises, 'writeFile', async (path, ...args) => {
		if (String(path).endsWith('apply-1.next') && args[0] === f.generated.files[1].content) { await write(join(f.root, 'checkout.mjs'), 'external after apply'); throw new Error('Injected second write failure'); }
		return write(path, ...args);
	});
	syncBuiltinESMExports();
	try {
		await assert.rejects(applyImplementation(f.root, stage.id, stage.reviewId), /Manual edits prevent recovery/);
		assert.equal(await readFile(join(f.root, 'checkout.mjs'), 'utf8'), 'external after apply');
		await access(join(f.root, '.ordito', 'collaboration', stage.id, 'transaction.json'));
	} finally { stub.mock.restore(); syncBuiltinESMExports(); }
});

async function archivedContents(root, id, file) {
	const directory = join(root, '.ordito', 'collaboration', id, 'transactions');
	const contents = [];
	for (const attempt of await readdir(directory)) {
		try { contents.push(await readFile(join(directory, attempt, file), 'utf8')); }
		catch (error) { if (error.code !== 'ENOENT') { throw error; } }
	}
	return contents;
}

for (const timing of ['before claim', 'after claim']) {
	test(`a writer ${timing} cannot be overwritten by apply`, async t => {
		const f = await fixture(t);
		const stage = await stageImplementation(f.prepared, f.plan, planReviewId(f.prepared, f.plan), undefined, f.provider);
		await verifyImplementation(f.root, stage.id, stage.reviewId);
		const rename = fsPromises.rename;
		const stub = t.mock.method(fsPromises, 'rename', async (from, to) => {
			const claim = String(from).endsWith('/checkout.mjs') && String(to).endsWith('/apply-0.before');
			if (claim && timing === 'before claim') { await writeFile(from, 'external at last mutation'); }
			await rename(from, to);
			if (claim && timing === 'after claim') { await writeFile(from, 'external at last mutation'); }
		});
		syncBuiltinESMExports();
		try {
			await assert.rejects(applyImplementation(f.root, stage.id, stage.reviewId));
			assert.equal(await readFile(join(f.root, 'checkout.mjs'), 'utf8'), 'external at last mutation');
			assert.ok((await archivedContents(f.root, stage.id, 'apply-0.before')).includes(timing === 'before claim' ? 'external at last mutation' : original));
			if (timing === 'before claim') { await assertNoInterruptedOperation(await realpath(f.root)); }
		} finally { stub.mock.restore(); syncBuiltinESMExports(); }
	});
}

for (const undo of [false, true]) {
	test(`a creator immediately before exclusive ${undo ? 'undo' : 'apply'} publication keeps its file`, async t => {
		const f = await fixture(t);
		const stage = await stageImplementation(f.prepared, f.plan, planReviewId(f.prepared, f.plan), undefined, f.provider);
		await verifyImplementation(f.root, stage.id, stage.reviewId);
		if (undo) { await applyImplementation(f.root, stage.id, stage.reviewId); }
		const link = fsPromises.link;
		const stub = t.mock.method(fsPromises, 'link', async (from, to) => {
			if (String(from).endsWith('/apply-0.next')) { await writeFile(to, 'concurrent exclusive creator'); }
			return link(from, to);
		});
		syncBuiltinESMExports();
		try {
			await assert.rejects(applyImplementation(f.root, stage.id, stage.reviewId, undo));
			assert.equal(await readFile(join(f.root, 'checkout.mjs'), 'utf8'), 'concurrent exclusive creator');
			assert.ok((await archivedContents(f.root, stage.id, 'apply-0.before')).includes(undo ? f.generated.files[0].content : original));
		} finally { stub.mock.restore(); syncBuiltinESMExports(); }
	});
}

test('descriptors opened before apply keep their inode in the retained archive after apply and undo', async t => {
	const f = await fixture(t);
	const stage = await stageImplementation(f.prepared, f.plan, planReviewId(f.prepared, f.plan), undefined, f.provider);
	await verifyImplementation(f.root, stage.id, stage.reviewId);
	const descriptor = await open(join(f.root, 'checkout.mjs'), 'r+');
	try {
		await applyImplementation(f.root, stage.id, stage.reviewId);
		await descriptor.truncate(0); await descriptor.write('late descriptor edit', 0, 'utf8'); await descriptor.sync();
		assert.equal(await readFile(join(f.root, 'checkout.mjs'), 'utf8'), f.generated.files[0].content);
		await applyImplementation(f.root, stage.id, stage.reviewId, true);
		assert.equal(await readFile(join(f.root, 'checkout.mjs'), 'utf8'), original);
		assert.ok((await archivedContents(f.root, stage.id, 'apply-0.before')).includes('late descriptor edit'));
	} finally { await descriptor.close(); }
});

for (const file of ['checkout.mjs', 'checkout.test.mjs']) {
	test(`undo retains an edit at the last claim of ${file}`, async t => {
		const f = await fixture(t);
		const stage = await stageImplementation(f.prepared, f.plan, planReviewId(f.prepared, f.plan), undefined, f.provider);
		await verifyImplementation(f.root, stage.id, stage.reviewId); await applyImplementation(f.root, stage.id, stage.reviewId);
		const rename = fsPromises.rename;
		const stub = t.mock.method(fsPromises, 'rename', async (from, to) => {
			if (String(from).endsWith('/' + file) && /\/apply-\d+\.before$/.test(String(to))) { await writeFile(from, 'external during undo'); }
			return rename(from, to);
		});
		syncBuiltinESMExports();
		try {
			await assert.rejects(applyImplementation(f.root, stage.id, stage.reviewId, true));
			assert.equal(await readFile(join(f.root, file), 'utf8'), 'external during undo');
			assert.ok((await archivedContents(f.root, stage.id, file === 'checkout.mjs' ? 'apply-0.before' : 'apply-1.before')).includes('external during undo'));
		} finally { stub.mock.restore(); syncBuiltinESMExports(); }
	});
}

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
	f.generated.files[1].content = `import assert from 'node:assert/strict'; assert.fail('Acceptance failed');\n`;
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
	const invalid = await verifyImplementation(f.root, stage.id, stage.reviewId);
	assert.equal(invalid.status, 'failed');
	assert.match(invalid.verification.output, /changed after review/);
	await assert.rejects(applyImplementation(f.root, stage.id, stage.reviewId), /passing/);
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
