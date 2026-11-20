import '../../scripts/source-loader.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rename, rm, truncate } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const { importCode } = await import('../importCode.ts');
const { prepareSync } = await import('../syncCode.ts');
const { readImportState, readSnapshot, writeSnapshot } = await import('../snapshot.ts');
const { validateSemanticModel } = await import('../../../src/vs/workbench/contrib/ordito/common/modelValidation.ts');
import { samples } from './samples.mjs';

const run = promisify(execFile);
const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));

async function workspace(t, files) {
	const directory = await mkdtemp(join(tmpdir(), 'ordito-sync-'));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const root = join(directory, 'source');
	await mkdir(root);
	for (const [path, source] of files) { await mkdir(join(root, path, '..'), { recursive: true }); await writeFile(join(root, path), source); }
	return { directory, root };
}

test('all language profiles reuse unmodified syntax and parse only the changed file', async t => {
	const { root } = await workspace(t, samples.map(([, file, source]) => [file, source]));
	const base = await importCode(root, 'languages');
	const unchanged = await importCode(root, 'languages', { previous: base });
	assert.deepEqual({ parsed: unchanged.analysis.parsed, reused: unchanged.analysis.reused.length, model: unchanged.model, revision: unchanged.revision }, { parsed: [], reused: samples.length, model: base.model, revision: base.revision });
	const annotated = structuredClone(base.model);
	annotated.semantics.elements[0].description = 'Manual annotation';
	assert.deepEqual(prepareSync(base, annotated, unchanged).model, annotated);
	await writeFile(join(root, 'checkout.py'), samples.find(([language]) => language === 'python')[2] + '\n');
	const changed = await importCode(root, 'languages', { previous: base });
	assert.deepEqual({ parsed: changed.analysis.parsed, reused: changed.analysis.reused.length, conflicts: prepareSync(base, base.model, changed).report.conflicts }, { parsed: ['checkout.py'], reused: samples.length - 1, conflicts: [] });
	assert.deepEqual(base.files.find(file => file.language === 'python').declarations.map(item => item.id), changed.files.find(file => file.language === 'python').declarations.map(item => item.id));
});

test('contract change, exact file move and deletion preserve identity, layout and manual annotations', async t => {
	const contract = 'export interface Payment { amount: number; }';
	const worker = 'def charge(amount: float) -> bool:\n    return amount > 0\n';
	const { root } = await workspace(t, [['contract.ts', contract], ['worker.py', worker], ['obsolete.java', 'class Obsolete {}']]);
	const base = await importCode(root, 'checkout');
	const current = structuredClone(base.model);
	const payment = current.semantics.elements.find(element => element.name === 'Payment');
	payment.description = 'Keep this annotation';
	current.views[0].nodes[0].x = 999;
	const workerFile = base.files.find(file => file.file === 'worker.py');
	const workerId = workerFile.declarations[0].id;
	current.semantics.elements.push({ id: 'manual-client', kind: 'component', name: 'Manual Client' });
	current.semantics.relations.push({ id: 'uses-payment', kind: 'dependency', from: 'manual-client', to: payment.id, name: 'Uses Payment' });
	await writeFile(join(root, 'contract.ts'), contract.replace('number', 'bigint'));
	await rename(join(root, 'worker.py'), join(root, 'payments.py'));
	await rm(join(root, 'obsolete.java'));
	const next = await importCode(root, 'checkout', { previous: base });
	const { report, model } = prepareSync(base, current, next);
	assert.deepEqual({ parsed: next.analysis.parsed, renamed: report.files.renamed, changed: report.files.changed, removed: report.files.removed, conflicts: report.conflicts, validation: validateSemanticModel(model) }, {
		parsed: ['contract.ts'], renamed: [{ from: 'worker.py', to: 'payments.py' }], changed: ['contract.ts'], removed: ['obsolete.java'], conflicts: [], validation: []
	});
	assert.deepEqual({ workerId: next.files.find(file => file.file === 'payments.py').declarations[0].id, description: model.semantics.elements.find(element => element.id === payment.id).description, position: model.views[0].nodes[0].x, relationships: model.semantics.relations, clientImpacted: report.impact.elementIds.includes('manual-client') }, {
		workerId, description: 'Keep this annotation', position: 999, relationships: current.semantics.relations, clientImpacted: true
	});
	assert.match(next.files.find(file => file.file === 'contract.ts').declarations[0].header, /amount: bigint/);
	assert.equal(next.files.find(file => file.file === 'payments.py').declarations[0].evidence.file, 'payments.py');
	// The next edit must match the new source keys while preserving the moved identity.
	await writeFile(join(root, 'payments.py'), worker.replace('float', 'int'));
	const afterMove = await importCode(root, 'checkout', { previous: next });
	assert.equal(afterMove.files.find(file => file.file === 'payments.py').declarations[0].id, workerId);
	// Reusing the original path must allocate a fresh identity, not alias the moved module.
	await writeFile(join(root, 'worker.py'), 'def retry():\n    pass\n');
	const restoredPath = await importCode(root, 'checkout', { previous: afterMove });
	assert.deepEqual(validateSemanticModel(restoredPath.model), []);
	assert.notEqual(restoredPath.files.find(file => file.file === 'worker.py').moduleId, workerFile.moduleId);
});

test('moves through directories and moves of previously moved files keep symbol lineage', async t => {
	const { root } = await workspace(t, [['a/checkout.ts', 'export class Checkout { pay() {} }']]);
	const first = await importCode(root, 'move');
	await mkdir(join(root, 'b'));
	await rename(join(root, 'a/checkout.ts'), join(root, 'b/renamed.ts'));
	const second = await importCode(root, 'move', { previous: first });
	await rename(join(root, 'b/renamed.ts'), join(root, 'b/final.ts'));
	const third = await importCode(root, 'move', { previous: second });
	assert.deepEqual(third.files.find(file => file.file.endsWith('final.ts')).declarations.map(item => item.id), first.files[0].declarations.map(item => item.id));
	assert.deepEqual(prepareSync(second, second.model, third).report.conflicts, []);
	assert.deepEqual(readImportState(JSON.parse(JSON.stringify(third))), third);
});

test('copies do not borrow identities and ambiguous content moves block Sync', async t => {
	const source = 'def pay():\n    pass\n';
	const { root } = await workspace(t, [['original.py', source]]);
	const base = await importCode(root, 'copies');
	await writeFile(join(root, 'copy.py'), source);
	const copy = await importCode(root, 'copies', { previous: base });
	assert.deepEqual({ renamed: copy.analysis.renamed, parsed: copy.analysis.parsed, reused: copy.analysis.reused }, { renamed: [], parsed: ['copy.py'], reused: ['original.py'] });
	assert.notEqual(copy.files[0].declarations[0].id, copy.files[1].declarations[0].id);
	await rm(join(root, 'original.py'));
	await writeFile(join(root, 'new.py'), source);
	const ambiguous = await importCode(root, 'copies', { previous: copy });
	assert.deepEqual(prepareSync(copy, copy.model, ambiguous).report.conflicts.map(item => item.code), ['identityAmbiguity']);
	assert.equal(prepareSync(copy, copy.model, ambiguous).model, undefined);
});

test('manual removals and local view layout survive source additions without overlap', async t => {
	const { root } = await workspace(t, [['work.py', 'def pay():\n    pass\n']]);
	const base = await importCode(root, 'views');
	const current = structuredClone(base.model);
	current.views[0].nodes[0].y = 180;
	current.views[0].nodes.pop();
	await writeFile(join(root, 'work.py'), 'def pay():\n    pass\ndef refund():\n    pass\n');
	const next = await importCode(root, 'views', { previous: base });
	const { model, report } = prepareSync(base, current, next);
	assert.deepEqual({ conflicts: report.conflicts, existingPosition: model.views[0].nodes[0], nodeNames: model.views[0].nodes.map(node => model.semantics.elements.find(item => item.id === node.elementId).name) }, { conflicts: [], existingPosition: current.views[0].nodes[0], nodeNames: ['work.py', 'refund'] });
	const collision = structuredClone(base.model);
	const added = next.model.semantics.elements.find(item => item.name === 'refund');
	collision.semantics.elements.push(structuredClone(added));
	assert.ok(prepareSync(base, collision, next).report.conflicts.some(item => item.path.includes(added.id)));
});

test('edited deletions and dangling manual references are conflicts, never silent loss', async t => {
	const { root } = await workspace(t, [['work.py', 'def pay():\n    pass\n']]);
	const base = await importCode(root, 'conflicts');
	const current = structuredClone(base.model);
	const action = current.semantics.elements.find(item => item.kind === 'action');
	action.description = 'Review before deleting';
	await writeFile(join(root, 'work.py'), '# removed\n');
	const next = await importCode(root, 'conflicts', { previous: base });
	assert.equal(prepareSync(base, current, next).model, undefined);
	assert.ok(prepareSync(base, current, next).report.conflicts.some(item => item.path.includes(action.id)));
	delete action.description;
	current.semantics.relations.push({ id: 'self', kind: 'invocation', from: action.id, to: action.id, name: 'Recursive' });
	assert.deepEqual(prepareSync(base, current, next).report.conflicts.map(item => item.code), ['invalidModel']);
});

test('partial source and changed overloads block updates while adapter changes invalidate cache', async t => {
	const { root } = await workspace(t, [['work.py', 'def pay():\n    pass\n']]);
	const base = await importCode(root, 'failures');
	const differentAdapter = { ...base, adapter: 'outdated-parser' };
	assert.deepEqual((await importCode(root, 'failures', { previous: differentAdapter })).analysis.parsed, ['work.py']);
	await writeFile(join(root, 'work.py'), 'def pay(\n');
	const broken = await importCode(root, 'failures', { previous: base });
	assert.deepEqual(prepareSync(base, base.model, broken).report.conflicts.map(item => item.code), ['incompleteSource']);
	await writeFile(join(root, 'overloads.java'), 'class Checkout { void pay(int n) {} void pay(double n) {} }');
	await rm(join(root, 'work.py'));
	const overloaded = await importCode(root, 'failures', { previous: base });
	assert.deepEqual(prepareSync(base, base.model, overloaded).report.conflicts.map(item => item.code), ['identityAmbiguity']);
	await assert.rejects(importCode(root, 'other', { previous: base }), /different source root or project/);
});

test('snapshots validate input, detect tampering and leave the previous version untouched', async t => {
	const { directory, root } = await workspace(t, [['work.py', 'def pay():\n    pass\n']]);
	const state = await importCode(root, 'snapshots');
	const output = join(directory, 'v1');
	await writeSnapshot(output, state, state.model);
	const snapshot = await readSnapshot(output);
	assert.deepEqual(snapshot.state, state);
	const badState = structuredClone(state);
	badState.files[0].declarations[0].evidence.end = -1;
	assert.throws(() => readImportState(badState), /Invalid import state/);
	const badManifest = structuredClone(state);
	badManifest.revision = '0'.repeat(64);
	assert.throws(() => readImportState(badManifest), /inconsistent source manifest/);
	const badIdentity = structuredClone(state);
	badIdentity.files[0].declarations[0].sourceId = 'unrelated';
	assert.throws(() => readImportState(badIdentity), /inconsistent source identities/);
	const edited = structuredClone(state.model);
	edited.name = 'Manual Project Title';
	await writeFile(join(output, 'model.ordito.json'), JSON.stringify(edited));
	assert.equal((await readSnapshot(output)).model.name, 'Manual Project Title');
	await assert.rejects(writeSnapshot(join(directory, 'stale'), state, state.model, undefined, snapshot), /changed during Sync/);
	assert.ok(!(await readdir(directory)).includes('stale'));
	await writeFile(join(output, 'import-state.json'), JSON.stringify({ ...state, adapter: 'corrupted' }));
	await assert.rejects(readSnapshot(output), /inconsistent import snapshot/);
});

test('compact machine indexes and legacy formatted indexes both reopen with intact seals', async t => {
	const { directory, root } = await workspace(t, [['work.rb', 'class Checkout; end\n']]);
	const state = await importCode(root, 'index-formats'), output = join(directory, 'snapshot');
	await writeSnapshot(output, state, state.model);
	const snapshot = await readSnapshot(output);
	assert.deepEqual(snapshot.state, state);
	const artifacts = await Promise.all(['snapshot.json', 'import-state.json', 'code-index.json', 'model.ordito.json', 'common-model.json', 'common-code.json'].map(name => readFile(join(output, name), 'utf8')));
	assert.equal(snapshot.inputHash, createHash('sha256').update(JSON.stringify(artifacts)).digest('hex'), 'streaming preserves the seal used by existing snapshots');
	const marker = JSON.parse(await readFile(join(output, 'snapshot.json'), 'utf8'));
	for (const [name, field] of [['import-state.json', 'state'], ['code-index.json', 'index']]) {
		const formatted = JSON.stringify(JSON.parse(await readFile(join(output, name), 'utf8')), null, '\t') + '\n';
		await writeFile(join(output, name), formatted);
		marker[field] = createHash('sha256').update(formatted).digest('hex');
	}
	await writeFile(join(output, 'snapshot.json'), JSON.stringify(marker));
	assert.deepEqual((await readSnapshot(output)).state, state);
	await writeFile(join(output, 'code-index.json'), '{}');
	await assert.rejects(readSnapshot(output), /inconsistent import snapshot/);
});

test('larger machine indexes retain bounded reads while editable model limits stay unchanged', async t => {
	const { directory, root } = await workspace(t, [['work.rb', 'class Checkout; end\n']]);
	const state = await importCode(root, 'index-bounds'), output = join(directory, 'snapshot');
	await writeSnapshot(output, state, state.model);
	for (const [name, limit] of [['import-state.json', 256], ['code-index.json', 256], ['model.ordito.json', 64]]) {
		const path = join(output, name), original = await readFile(path);
		await truncate(path, limit * 1024 * 1024 + 1);
		await assert.rejects(readSnapshot(output), { message: `Snapshot artifact exceeds ${limit} MiB: ${name}` });
		await writeFile(path, original);
	}
	assert.deepEqual((await readSnapshot(output)).state, state);
});

test('stale source, cancellation and incomplete snapshots never publish a successful version', async t => {
	const { directory, root } = await workspace(t, [['work.py', 'def pay():\n    pass\n']]);
	const state = await importCode(root, 'stale');
	await writeFile(join(root, 'work.py'), 'def refund():\n    pass\n');
	await assert.rejects(writeSnapshot(join(directory, 'stale-output'), state, state.model), /Source changed/);
	assert.deepEqual(await readdir(directory), ['source']);
	const controller = new AbortController();
	controller.abort();
	await assert.rejects(importCode(root, 'stale', { signal: controller.signal }), { name: 'AbortError' });
	await assert.rejects(writeSnapshot(join(directory, 'cancelled'), state, state.model, undefined, undefined, controller.signal), { name: 'AbortError' });
	await mkdir(join(directory, 'incomplete'));
	await writeFile(join(directory, 'incomplete', 'model.ordito.json'), JSON.stringify(state.model));
	await assert.rejects(readSnapshot(join(directory, 'incomplete')), /ENOENT/);
});

test('CLI Sync publishes a separate recoverable version with model edits and a report', async t => {
	const { directory, root } = await workspace(t, [['work.py', 'def pay():\n    pass\n']]);
	const first = join(directory, 'v1');
	const second = join(directory, 'v2');
	await run(process.execPath, [cli, root, first, 'cli-sync']);
	const currentPath = join(first, 'model.ordito.json');
	const current = JSON.parse(await readFile(currentPath, 'utf8'));
	current.semantics.elements.find(item => item.kind === 'action').description = 'Manual note';
	await writeFile(currentPath, JSON.stringify(current));
	const previousBytes = await readFile(currentPath, 'utf8');
	await writeFile(join(root, 'work.py'), 'def pay(amount: float):\n    return amount > 0\n');
	const directoriesBeforeStatus = await readdir(directory);
	const status = await run(process.execPath, [cli, 'status', first]);
	assert.deepEqual({ changed: JSON.parse(status.stdout).files.changed, directories: await readdir(directory) }, { changed: ['work.py'], directories: directoriesBeforeStatus });
	const { stdout } = await run(process.execPath, [cli, 'sync', first, second]);
	assert.deepEqual(JSON.parse(stdout).analysis.parsed, ['work.py']);
	assert.equal((await readSnapshot(second)).model.semantics.elements.find(item => item.kind === 'action').description, 'Manual note');
	assert.equal(await readFile(currentPath, 'utf8'), previousBytes);
	const report = JSON.parse(await readFile(join(second, 'sync-report.json'), 'utf8'));
	assert.deepEqual(report.files.changed, ['work.py']);
	await writeFile(join(root, 'work.py'), 'def pay(\n');
	await assert.rejects(run(process.execPath, [cli, 'sync', second, join(directory, 'v3')]), error => error.code === 2 && error.stderr.includes('incompleteSource'));
	assert.ok(!(await readdir(directory)).includes('v3'));
});
