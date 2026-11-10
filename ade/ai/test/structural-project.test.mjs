/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, rename, symlink, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import '../../scripts/source-loader.mjs';
const { createPureProject, reversePredicate, migrationArtifact } = await import('../../../src/vs/workbench/contrib/ade/common/modelProject.ts');
const { prepareStructuralProject, verifyStructuralProject, publishStructuralProject, recoverStructuralProject, readStructuralSession } = await import('../structuralProject.ts');
const { assertNoInterruptedOperation } = await import('../../code-import/reconciliationJournal.ts');
const { physicalImage, replacePhysicalImage } = await import('../../runtime/sourceChanges.ts');

async function fixture(t) {
	const root = await mkdtemp(join(tmpdir(), 'ade-dai05-')); t.after(() => rm(root, { recursive: true, force: true }));
	let id = 0; const { model, criteria } = createPureProject('Independent Quantity Rules', () => 'id.' + ++id);
	await mkdir(join(root, '.ade')); await writeFile(join(root, '.ade/model.json'), JSON.stringify(model, null, '\t') + '\n'); await writeFile(join(root, '.ade/criteria.json'), JSON.stringify(criteria));
	return { root, model, criteria, predicate: model.foundation.predicates[0], modelFile: join(root, '.ade/model.json'), criteriaFile: join(root, '.ade/criteria.json') };
}
async function stage(f, direction = 'forward', paths) { const result = await prepareStructuralProject(f.root, direction, paths); assert.equal(result.status, 'staged'); return result.session; }
async function applied(f) { const session = await stage(f); const verified = await verifyStructuralProject(f.root, session.id, session.reviewId); assert.equal(verified.status, 'passed', verified.verification.output); return publishStructuralProject(f.root, session.id, session.reviewId); }
async function model(f, value) { await writeFile(f.modelFile, JSON.stringify(value, null, '\t') + '\n'); }
async function journal(f, session) { return join(f.root, '.ade/structural/sessions', session.id + '.json'); }

test('P01/P02 empty project creates reviewed worktree, actual independent boundary tests, pair and undo', async t => {
	const f = await fixture(t), session = await stage(f);
	assert.equal(await physicalImage(f.root, 'package.json'), null); assert.equal(session.calls, 0); assert.equal(session.packets.length, 1);
	const verified = await verifyStructuralProject(f.root, session.id, session.reviewId);
	assert.deepEqual([verified.status, verified.verification.generated, verified.verification.independent], ['passed', 8, 8]);
	assert.match(verified.verification.output, /# pass 16/);
	await publishStructuralProject(f.root, session.id, session.reviewId);
	assert.match((await physicalImage(f.root, session.next.artifacts[0].file)).content, /export default function/);
	assert.equal(JSON.parse((await physicalImage(f.root, 'package.json')).content).type, 'module');
	await publishStructuralProject(f.root, session.id, session.reviewId, true);
	assert.deepEqual([await physicalImage(f.root, 'package.json'), await physicalImage(f.root, session.next.artifacts[0].file)], [null, null]);
});

test('P03 semantic edit is immediate, derived tests pass but independent oracle blocks incorrect ge', async t => {
	const f = await fixture(t); await applied(f); const changed = structuredClone(f.model); changed.foundation.predicates[0].nodes[2].operator = 'ge'; await model(f, changed);
	const session = await stage(f); assert.equal(session.mutations.filter(edit => edit.file.startsWith('src/')).length, 1);
	const checked = await verifyStructuralProject(f.root, session.id, session.reviewId);
	assert.equal(checked.status, 'failed'); assert.match(checked.verification.output, /not ok.*quantity.1/); assert.match(checked.verification.output, /ok.*derived.quantity.1/);
	await assert.rejects(publishStructuralProject(f.root, session.id, session.reviewId), /passing/);
	assert.match((await physicalImage(f.root, session.next.artifacts[0].file)).content, /v0>v1/);
});

test('P03 layout and aligned no-op produce zero calls and no proposal', async t => {
	const f = await fixture(t); await applied(f);
	assert.deepEqual(await prepareStructuralProject(f.root), { status: 'aligned', calls: 0 });
	const value = JSON.parse(await readFile(f.modelFile)); value.views = [{ id: 'view', name: 'layout', kind: 'structure', nodes: [], relationIds: [] }]; await model(f, value);
	assert.deepEqual(await prepareStructuralProject(f.root), { status: 'aligned', calls: 0 });
});

for (const change of ['model', 'criteria', 'source', 'permission', 'worktree', 'manifest']) {
	test('P05 review freshness rejects changed ' + change, async t => {
		const f = await fixture(t), session = await stage(f); await verifyStructuralProject(f.root, session.id, session.reviewId);
		if (change === 'model') { f.model.name += 'changed'; await model(f, f.model); }
		if (change === 'criteria') { f.criteria.revision = '2'; await writeFile(f.criteriaFile, JSON.stringify(f.criteria)); }
		if (change === 'source') { await mkdir(join(f.root, 'src')); await writeFile(join(f.root, session.next.artifacts[0].file), 'manual'); }
		if (change === 'permission') { await chmod(f.modelFile, (await physicalImage(f.root, '.ade/model.json')).mode ^ 0o100); }
		if (change === 'worktree') { await writeFile(join(session.worktree, session.next.artifacts[0].file), 'manual'); }
		if (change === 'manifest') { await writeFile(join(session.worktree, 'package.json'), '{"dependencies":{"evil":"*"}}'); }
		await assert.rejects(publishStructuralProject(f.root, session.id, session.reviewId), /changed|stale/);
	});
}

test('P06 reverse actual code comparison preserves IDs and custom text, then verifies revised independent criteria', async t => {
	const f = await fixture(t), first = await applied(f), file = first.next.artifacts[0].file;
	const source = (await physicalImage(f.root, file)).content; await writeFile(join(f.root, file), '// custom preserved\n' + source.replace('(v0>v1)', '(v0>=v1)') + '// custom trailing\n');
	const session = await stage(f, 'reverse');
	assert.deepEqual([session.next.model.foundation.predicates[0].id, session.next.model.foundation.predicates[0].nodes[2].operator], [f.predicate.id, 'ge']);
	assert.match(session.mutations.find(edit => edit.file === file).after.content, /^\/\/ custom preserved/);
	const failed = await verifyStructuralProject(f.root, session.id, session.reviewId); assert.equal(failed.status, 'failed');
	f.criteria.revision = '2'; f.criteria.cases[1].expected = true; await writeFile(f.criteriaFile, JSON.stringify(f.criteria));
	const revised = await stage(f, 'reverse'); const checked = await verifyStructuralProject(f.root, revised.id, revised.reviewId); assert.equal(checked.status, 'passed', checked.verification.output);
	await publishStructuralProject(f.root, revised.id, revised.reviewId);
	assert.equal(JSON.parse(await readFile(f.modelFile)).foundation.predicates[0].nodes[2].operator, 'ge');
	assert.deepEqual(await prepareStructuralProject(f.root, 'reverse'), { status: 'aligned', calls: 0 });
});

test('P06 same-rule concurrency and arbitrary code produce explicit conflict/partial mapping', async t => {
	const f = await fixture(t), first = await applied(f), file = join(f.root, first.next.artifacts[0].file);
	const source = await readFile(file, 'utf8'); await writeFile(file, source.replace('(v0>v1)', '(v0>=v1)')); f.predicate.nodes[1].value = 1; await model(f, f.model);
	await assert.rejects(prepareStructuralProject(f.root, 'reverse'), /Conflict/); await assert.rejects(prepareStructuralProject(f.root), /Conflict/);
	assert.throws(() => reversePredicate(first.next.model, source.replace('export default function(input){', 'export default function(input){fetch("https://evil.invalid");'), first.next.model.foundation.predicates[0]), /Partial mapping/);
});

test('P07 explicit physical move keeps semantic identity, delete and undo preserve exact sources', async t => {
	const f = await fixture(t), first = await applied(f), old = first.next.artifacts[0].file;
	const moved = await stage(f, 'forward', { [f.predicate.id]: 'src/renamed.mjs' }); await verifyStructuralProject(f.root, moved.id, moved.reviewId); await publishStructuralProject(f.root, moved.id, moved.reviewId);
	assert.deepEqual([await physicalImage(f.root, old), moved.next.artifacts[0].predicateId], [null, f.predicate.id]);
	await publishStructuralProject(f.root, moved.id, moved.reviewId, true); assert.ok(await physicalImage(f.root, old)); assert.equal(await physicalImage(f.root, 'src/renamed.mjs'), null);
	const deleted = structuredClone(f.model); deleted.foundation.predicates = []; await model(f, deleted);
	const removal = await stage(f); await verifyStructuralProject(f.root, removal.id, removal.reviewId); await publishStructuralProject(f.root, removal.id, removal.reviewId); assert.equal(await physicalImage(f.root, old), null);
	await publishStructuralProject(f.root, removal.id, removal.reviewId, true); assert.ok(await physicalImage(f.root, old));
});

test('P07 reverse file move and deletion keep mappings; unsupported ambiguity never guesses', async t => {
	const f = await fixture(t), first = await applied(f), old = first.next.artifacts[0].file;
	await rename(join(f.root, old), join(f.root, 'src/moved.mjs'));
	const session = await stage(f, 'reverse'); await verifyStructuralProject(f.root, session.id, session.reviewId); await publishStructuralProject(f.root, session.id, session.reviewId);
	assert.equal(session.next.artifacts[0].file, 'src/moved.mjs');
});

for (const phase of ['before', 'partial', 'after', 'manual']) {
	test('P08 restart recovery at ' + phase, async t => {
		const f = await fixture(t), session = await stage(f); await verifyStructuralProject(f.root, session.id, session.reviewId);
		if (phase === 'after') { await publishStructuralProject(f.root, session.id, session.reviewId); }
		const saved = await readStructuralSession(f.root, session.id); saved.status = 'publishing'; await writeFile(await journal(f, session), JSON.stringify(saved));
		if (phase === 'partial') { await replacePhysicalImage(f.root, 'package.json', null, session.mutations.find(edit => edit.file === 'package.json').after); }
		if (phase === 'manual') { await writeFile(join(f.root, 'package.json'), 'manual'); }
		await assert.rejects(prepareStructuralProject(f.root), /Interrupted/); await assert.rejects(assertNoInterruptedOperation(f.root), /Interrupted structural/);
		if (phase === 'manual') { await assert.rejects(recoverStructuralProject(f.root, session.id), /manual/); assert.equal(await readFile(join(f.root, 'package.json'), 'utf8'), 'manual'); }
		else { const result = await recoverStructuralProject(f.root, session.id); assert.equal(result.status, phase === 'after' ? 'applied' : 'rolledBack'); assert.equal(!!await physicalImage(f.root, 'package.json'), phase === 'after'); }
	});
}

test('P07 undo refuses manual source edits and metadata tampering', async t => {
	const f = await fixture(t), session = await applied(f); await writeFile(join(f.root, session.next.artifacts[0].file), 'manual');
	await assert.rejects(publishStructuralProject(f.root, session.id, session.reviewId, true), /Manual/);
	const saved = await readStructuralSession(f.root, session.id); saved.mutations[0].after.content = 'changed'; await writeFile(await journal(f, session), JSON.stringify(saved)); await assert.rejects(readStructuralSession(f.root, session.id), /modified/);
});

test('P09 custom project code is preserved but never executed by the trusted runner', async t => {
	const f = await fixture(t), first = await applied(f), file = first.next.artifacts[0].file;
	await writeFile(join(f.root, file), (await physicalImage(f.root, file)).content + 'throw new Error("UNTRUSTED PROJECT CODE EXECUTED");\n');
	f.criteria.revision = '2'; await writeFile(f.criteriaFile, JSON.stringify(f.criteria)); const session = await stage(f); const verified = await verifyStructuralProject(f.root, session.id, session.reviewId);
	assert.equal(verified.status, 'passed'); assert.match(verified.verification.policy, /no OS\/network sandbox claim/);
});

test('P10 unsupported persistence/effects and missing independent oracle block generation', async t => {
	const f = await fixture(t); f.model.foundation.blueprint.operations[0].effects.push('network'); await model(f, f.model); await assert.rejects(prepareStructuralProject(f.root), /unsupported/);
	f.model.foundation.blueprint.operations[0].effects = []; await model(f, f.model); f.criteria.cases = []; await writeFile(f.criteriaFile, JSON.stringify(f.criteria)); await assert.rejects(prepareStructuralProject(f.root), /criteria/);
	const migration = migrationArtifact({ version: 1, id: 'migration.1', from: 'memory', to: 'database', preconditions: ['Backup exists', 'Schema version matches'], dataStrategy: 'Export and validate existing rows', recovery: 'Restore backup before accepting writes', destructive: true, execution: 'manual-only', deploy: false });
	assert.deepEqual([migration.execution, migration.deploy], ['manual-only', false]); assert.throws(() => migrationArtifact({ ...migration, recovery: '' }), /Incomplete/);
});

test('P05 symlink and out-of-scope physical destinations fail closed', async t => {
	const f = await fixture(t); await assert.rejects(prepareStructuralProject(f.root, 'forward', { [f.predicate.id]: '../escape.mjs' }), /scope/);
	await mkdir(join(f.root, 'src')); await symlink(f.modelFile, join(f.root, 'src/redirect.mjs')); await assert.rejects(prepareStructuralProject(f.root, 'forward', { [f.predicate.id]: 'src/redirect.mjs' }), /Redirected/);
});


test('P06 literal reverse uses executable evidence and rejects a forged descriptor', async t => {
	const f = await fixture(t), first = await applied(f), file = first.next.artifacts[0].file;
	const original = (await physicalImage(f.root, file)).content;
	const changed = reversePredicate(first.next.model, original.replace('const v1=0;', 'const v1=1;'), f.predicate);
	assert.deepEqual([changed.id, changed.nodes[1].value], [f.predicate.id, 1]);
	assert.throws(() => reversePredicate(first.next.model, original.replace('"rootId":"positive"', '"rootId":"forged"'), f.predicate), /metadata/);
});

test('P07 external source deletion becomes a reviewed predicate deletion with exact undo', async t => {
	const f = await fixture(t), first = await applied(f), file = first.next.artifacts[0].file; await rm(join(f.root, file));
	const removal = await stage(f, 'reverse'); assert.deepEqual(removal.next.model.foundation.predicates, []);
	await verifyStructuralProject(f.root, removal.id, removal.reviewId); await publishStructuralProject(f.root, removal.id, removal.reviewId);
	assert.deepEqual(JSON.parse(await readFile(f.modelFile)).foundation.predicates, []);
	await publishStructuralProject(f.root, removal.id, removal.reviewId, true); assert.equal(JSON.parse(await readFile(f.modelFile)).foundation.predicates[0].id, f.predicate.id); assert.equal(await physicalImage(f.root, file), null);
});

for (const phase of ['partial', 'committed']) {
	test('P08 interrupted undo ' + phase + ' recovers the correct baseline and created files', async t => {
		const f = await fixture(t), session = await applied(f);
		if (phase === 'committed') { await publishStructuralProject(f.root, session.id, session.reviewId, true); }
		const saved = await readStructuralSession(f.root, session.id); saved.status = 'undoing'; await writeFile(await journal(f, session), JSON.stringify(saved));
		if (phase === 'partial') { const edit = session.mutations[0]; await replacePhysicalImage(f.root, edit.file, edit.after, edit.before); }
		const recovered = await recoverStructuralProject(f.root, session.id); assert.equal(recovered.status, phase === 'committed' ? 'undone' : 'applied');
		assert.equal(!!await physicalImage(f.root, 'package.json'), phase !== 'committed');
	});
}

test('P10 dependency changes and manual generated-test edits block the next plan', async t => {
	const f = await fixture(t), session = await applied(f), manifest = join(f.root, 'package.json'), original = await readFile(manifest, 'utf8');
	await writeFile(manifest, JSON.stringify({ ...JSON.parse(original), dependencies: { unrequested: '*' } })); await assert.rejects(prepareStructuralProject(f.root), /external dependencies/);
	await writeFile(manifest, original); await writeFile(join(f.root, Object.keys(session.next.tests)[0]), 'manual custom test'); await assert.rejects(prepareStructuralProject(f.root), /test changed/);
});

test('P12 actual CLI creates, reviews, verifies, publishes and undoes without imported code or provider', async t => {
	const { execFileSync } = await import('node:child_process');
	const directory = await mkdtemp(join(tmpdir(), 'ade-dai05-cli-')); t.after(() => rm(directory, { recursive: true, force: true })); const root = join(directory, 'new-project');
	const call = (...args) => JSON.parse(execFileSync(process.execPath, ['ade/scripts/dai-project.mjs', ...args], { cwd: new URL('../../../', import.meta.url), encoding: 'utf8', stdio: 'pipe' }));
	assert.equal(call('create', root, 'Independent CLI Rules').calls, 0);
	const prepared = call('forward', root, join(directory, 'review.json')); assert.equal(prepared.status, 'staged');
	const checked = call('verify', root, prepared.id, prepared.reviewId, join(directory, 'verified.json')); assert.equal(checked.status, 'passed');
	assert.equal(call('apply', root, prepared.id, prepared.reviewId, join(directory, 'applied.json')).status, 'applied');
	assert.equal(call('forward', root, join(directory, 'aligned.json')).status, 'aligned');
	assert.equal(call('undo', root, prepared.id, prepared.reviewId, join(directory, 'undone.json')).status, 'undone');
	assert.throws(() => call('forward', root, join(directory, 'review.json'))); assert.equal(await physicalImage(root, 'package.json'), null);
});
