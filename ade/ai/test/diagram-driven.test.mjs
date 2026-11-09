/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { semanticModelV4Schema, validateSemanticShape } from '../../../src/vs/workbench/contrib/ade/common/semanticModel.ts';
import '../../scripts/source-loader.mjs';
import { fixture, config } from './fixtures.mjs';
import { readSnapshot, writeSnapshot } from '../../code-import/snapshot.ts';
import { prepareSync } from '../../code-import/syncCode.ts';
import { prepareImplementation } from '../context.ts';
import { prepareAiReconciliation } from '../reconciliation.ts';
import { prepareDiagramImport, advanceDiagramImport } from '../diagramImport.ts';
const { migrateSemanticModelToV4 } = await import('../../../src/vs/workbench/contrib/ade/common/modelMigration.ts');

test('legacy planning, Sync and reconciliation reject v4 without rewriting snapshots or source', async t => {
	const f = await fixture(t); const previous = await readSnapshot(f.snapshot);
	const model = migrateSemanticModelToV4(previous.model);
	const upgradedDirectory = join(f.directory, 'v4-snapshot');
	await writeSnapshot(upgradedDirectory, previous.state, model);
	const upgraded = await readSnapshot(upgradedDirectory);
	const source = await readFile(join(f.root, 'checkout.mjs'), 'utf8');
	await assert.rejects(prepareImplementation({ ...f.request, snapshot: upgradedDirectory }, config), /generation profile is required/);
	assert.throws(() => prepareSync(previous.state, model, previous.state), /v4 synchronization adapter/);
	await assert.rejects(prepareAiReconciliation(upgraded, previous.state, config, ['checkout.mjs']), /v4 reconciliation adapter/);
	assert.deepEqual((await readSnapshot(upgradedDirectory)).model, model);
	assert.equal(await readFile(join(f.root, 'checkout.mjs'), 'utf8'), source);
});

test('rebuilding or resuming legacy diagram interpretation on an upgraded model makes zero provider calls', async t => {
	const f = await fixture(t); const previous = await readSnapshot(f.snapshot);
	const job = await prepareDiagramImport(previous, previous.state, config);
	const upgraded = { ...previous, model: migrateSemanticModelToV4(previous.model) };
	const before = structuredClone(job); let calls = 0;
	const provider = { complete: async () => { calls++; throw new Error('Unexpected provider invocation'); } };
	await assert.rejects(prepareDiagramImport(upgraded, previous.state, config), /v4 diagram adapter/);
	await assert.rejects(advanceDiagramImport(job, upgraded, previous.state, job.reviewId, undefined, provider), /v4 diagram adapter/);
	assert.deepEqual({ calls, job }, { calls: 0, job: before });
});


test('the distributed v4 grammar passes an independent JSON Schema meta-validator and agrees with domain syntax checks', async () => {
	const ajv = new Ajv2020({ strict: true });
	assert.equal(ajv.validateSchema(semanticModelV4Schema), true, JSON.stringify(ajv.errors));
	const validate = ajv.compile(semanticModelV4Schema);
	const model = JSON.parse(await readFile(new URL('../../examples/dai-foundation.ade.json', import.meta.url), 'utf8'));
	const missingId = structuredClone(model); delete missingId.semantics.elements[3].behavior.inputs[0].id;
	const extra = { ...model, unexpected: true };
	const ambiguous = structuredClone(model); ambiguous.foundation.platform.bindings[0].technology = { state: 'omitted', value: null };
	for (const candidate of [model, missingId, extra, ambiguous, null, { ...model, version: 99 }]) {
		assert.equal(validate(candidate), validateSemanticShape(candidate).length === 0);
	}
});


test('the shared blueprint grammar validates independently and the adapter rejects normative bypasses before writes', async () => {
	const { createDiagramDrivenAdapter } = await import('../diagramDriven.ts');
	const { fixtureProfile } = await import('../../test/fixtures/dai-profile.mjs');
	const model = JSON.parse(await readFile(new URL('../../examples/dai-blueprint.ade.json', import.meta.url), 'utf8'));
	const profile = { ...fixtureProfile, elementKinds: [...fixtureProfile.elementKinds, 'interface', 'package'] };
	const ajv = new Ajv2020({ strict: true }); const validate = ajv.compile(semanticModelV4Schema);
	assert.equal(validate(model), true, JSON.stringify(validate.errors));
	const adapter = createDiagramDrivenAdapter([profile]);
	const packet = await adapter.prepare(model, 'operation.confirm', profile.id, 196608);
	const candidate = structuredClone(model); candidate.foundation.decisions = []; candidate.foundation.blueprint.transports[1].protocol = 'other';
	await assert.rejects(adapter.assertProposal(packet, model, candidate, profile.id, 196608), /normativeDecisionMutation/);
	const malformed = structuredClone(model); delete malformed.foundation.blueprint.operations[0].errors[0].typeId;
	assert.equal(validate(malformed), false);
	assert.notEqual(validateSemanticShape(malformed).length, 0);
});
