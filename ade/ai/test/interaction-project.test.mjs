/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import '../../scripts/source-loader.mjs';
import { checkoutInteractions, interactionCriteria } from '../../test/fixtures/dai-interactions.mjs';
const { prepareStructuralProject, verifyStructuralProject, publishStructuralProject } = await import('../structuralProject.ts');
const { interactionRegion } = await import('../../../src/vs/workbench/contrib/ade/common/interactionRuntime.ts');
async function fixture(t) {
	const root = await mkdtemp(join(tmpdir(), 'ade-dai06-')); t.after(() => rm(root, { recursive: true, force: true }));
	await mkdir(join(root, '.ade')); await writeFile(join(root, '.ade/model.json'), JSON.stringify(checkoutInteractions, null, '\t') + '\n'); await writeFile(join(root, '.ade/criteria.json'), JSON.stringify(interactionCriteria)); return root;
}
async function publish(root) { const staged = await prepareStructuralProject(root); assert.equal(staged.status, 'staged'); const s = staged.session; const checked = await verifyStructuralProject(root, s.id, s.reviewId); assert.equal(checked.status, 'passed', checked.verification.output); await publishStructuralProject(root, s.id, s.reviewId); return checked; }

test('DAI06 P01 actual shared worktree runner publishes, no-ops and undoes typed interactions', async t => {
	const root = await fixture(t), checked = await publish(root);
	assert.deepEqual([checked.calls, checked.next.artifacts.length, checked.verification.generated, checked.verification.independent], [0, 2, 7, 7]);
	assert.match(checked.verification.output, /# pass 14/); assert.match(checked.verification.policy, /scripted-data/);
	assert.deepEqual(await prepareStructuralProject(root), { status: 'aligned', calls: 0 });
	await publishStructuralProject(root, checked.id, checked.reviewId, true);
	await assert.rejects(readFile(join(root, checked.next.artifacts[0].file)), { code: 'ENOENT' });
});
test('DAI06 P02 reviewed template reverse preserves source tail and IDs; independent wrong behavior blocks publication', async t => {
	const root = await fixture(t), first = await publish(root), artifact = first.next.artifacts.find(a => a.interactionId === 'interaction.checkout');
	const next = structuredClone(checkoutInteractions); next.foundation.frames[0].operands[0].guard.nodes[1].value = 'pending';
	await writeFile(join(root, artifact.file), '// custom preserved\n' + interactionRegion(next, artifact.interactionId) + '\n// custom tail\n');
	const staged = await prepareStructuralProject(root, 'reverse'), checked = await verifyStructuralProject(root, staged.session.id, staged.session.reviewId);
	assert.equal(checked.status, 'failed'); assert.match(checked.verification.output, /not ok.*checkout.approved/); assert.match(checked.verification.output, /ok.*derived.checkout.approved/);
	assert.match(staged.session.mutations.find(m => m.file === artifact.file)?.after.content ?? await readFile(join(root, artifact.file), 'utf8'), /custom tail/);
	await assert.rejects(publishStructuralProject(root, checked.id, checked.reviewId), /passing/);
});
test('DAI06 P01 criteria freshness and project code stay outside trusted execution', async t => {
	const root = await fixture(t), first = await publish(root), artifact = first.next.artifacts[0];
	await writeFile(join(root, artifact.file), (await readFile(join(root, artifact.file), 'utf8')) + '\nthrow new Error("CUSTOM CODE MUST NOT EXECUTE");\n');
	const changed = structuredClone(interactionCriteria); changed.revision = '2'; await writeFile(join(root, '.ade/criteria.json'), JSON.stringify(changed));
	const staged = await prepareStructuralProject(root), checked = await verifyStructuralProject(root, staged.session.id, staged.session.reviewId); assert.equal(checked.status, 'passed', checked.verification.output);
	changed.revision = '3'; await writeFile(join(root, '.ade/criteria.json'), JSON.stringify(changed)); await assert.rejects(publishStructuralProject(root, checked.id, checked.reviewId), /stale|changed/);
});

test('DAI06 P02 supported reverse timeout edit verifies and publishes while arbitrary body and concurrent intent are blocked', async t => {
	const root = await fixture(t), first = await publish(root), artifact = first.next.artifacts.find(a => a.interactionId === 'interaction.checkout'), path = join(root, artifact.file), source = await readFile(path, 'utf8');
	await writeFile(path, '// authored wrapper\n' + source.replace('"timeoutMs":50', '"timeoutMs":45') + '// authored tail\n');
	const staged = await prepareStructuralProject(root, 'reverse'), s = staged.session, checked = await verifyStructuralProject(root, s.id, s.reviewId); assert.equal(checked.status, 'passed', checked.verification.output);
	assert.equal(s.next.model.foundation.occurrences.find(call => call.id === 'message.charge').execution.timeoutMs, 45);
	await publishStructuralProject(root, s.id, s.reviewId); assert.match(await readFile(path, 'utf8'), /authored tail/);
	await publishStructuralProject(root, s.id, s.reviewId, true); assert.match(await readFile(path, 'utf8'), /"timeoutMs":45/); // undo restores the exact reviewed manual preimage
	await writeFile(path, source.replace('maxCalls:1000', 'maxCalls:1')); await assert.rejects(prepareStructuralProject(root, 'reverse'), /Partial/);
	const model = JSON.parse(await readFile(join(root, '.ade/model.json'))); model.foundation.frames[2].guard.nodes[0].fieldId = 'input.correlation'; await writeFile(join(root, '.ade/model.json'), JSON.stringify(model));
	await assert.rejects(prepareStructuralProject(root, 'reverse'), /Conflict/);
});
for (const phase of ['partial', 'committed']) {
	test('DAI06 P01 shared recovery restores interaction source/model pair after ' + phase + ' publication', async t => {
		const { recoverStructuralProject } = await import('../structuralProject.ts'); const { replacePhysicalImage } = await import('../../runtime/sourceChanges.ts');
		const root = await fixture(t), staged = await prepareStructuralProject(root), s = staged.session; await verifyStructuralProject(root, s.id, s.reviewId);
		if (phase === 'committed') { await publishStructuralProject(root, s.id, s.reviewId); }
		else { const edit = s.mutations.find(edit => edit.file.startsWith('src/')); await replacePhysicalImage(root, edit.file, edit.before, edit.after); }
		const journal = join(root, '.ade/structural/sessions', s.id + '.json'), value = JSON.parse(await readFile(journal)); value.status = 'publishing'; await writeFile(journal, JSON.stringify(value));
		const recovered = await recoverStructuralProject(root, s.id); assert.equal(recovered.status, phase === 'committed' ? 'applied' : 'rolledBack');
		if (phase === 'partial') { await assert.rejects(readFile(join(root, s.next.artifacts[0].file)), { code: 'ENOENT' }); }
		else { assert.equal(JSON.parse(await readFile(join(root, '.ade/model.json'))).foundation.interactions[0].id, 'interaction.checkout'); }
	});
}

test('DAI06 E01 pure project runner distinguishes independently authored arithmetic failures from input type errors', async t => {
	const { createPureProject } = await import('../../../src/vs/workbench/contrib/ade/common/modelProject.ts');
	const root = await mkdtemp(join(tmpdir(), 'ade-dai06-arithmetic-')); t.after(() => rm(root, { recursive: true, force: true }));
	let serial = 0; const { model, criteria } = createPureProject('Exact Reciprocal', () => 'reciprocal.' + ++serial), predicate = model.foundation.predicates[0], input = predicate.nodes[0].fieldId, typeId = predicate.nodes[1].typeId;
	predicate.nodes = [{ id: 'quantity', kind: 'reference', fieldId: input, path: [] }, { id: 'one', kind: 'literal', typeId, value: 1 }, { id: 'ratio', kind: 'arithmetic', operator: 'divide', left: 'one', right: 'quantity' }, { id: 'zero', kind: 'literal', typeId, value: 0 }, { id: 'positive', kind: 'compare', operator: 'gt', left: 'ratio', right: 'zero' }];
	criteria.cases.find(c => c.id === 'quantity.1').expected = 'arithmeticZero'; criteria.cases.find(c => c.id === 'quantity.3').expected = 'arithmeticPrecision';
	await mkdir(join(root, '.ade')); await writeFile(join(root, '.ade/model.json'), JSON.stringify(model, null, '\t') + '\n'); await writeFile(join(root, '.ade/criteria.json'), JSON.stringify(criteria));
	const checked = await publish(root); assert.deepEqual([checked.verification.generated, checked.verification.independent], [8, 8]); assert.match(checked.verification.output, /# pass 16/);
});
