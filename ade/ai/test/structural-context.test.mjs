/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import '../../scripts/source-loader.mjs';
import { nodeOrders, taskRequest } from '../../test/fixtures/dai-task.mjs';
const { semanticModelV4Schema, predicateSchema } = await import('../../../src/vs/workbench/contrib/ade/common/semanticModel.ts');
const { modelTaskOutputSchema, compileModelTaskContext } = await import('../diagramDriven.ts');
const { modelDigest } = await import('../../../src/vs/workbench/contrib/ade/common/modelSerialization.ts');
const { prepareStructuralSourceContext, validateStructuralSourceProposal } = await import('../structuralContext.ts');

test('C02 independent strict Ajv2020 validates the model, AST and discriminated task outcomes', () => {
	const ajv = new Ajv2020({ strict: true });
	for (const [schema, value] of [[semanticModelV4Schema, nodeOrders], [predicateSchema, nodeOrders.foundation.predicates[0]], [modelTaskOutputSchema, { kind: 'needsClarification', questions: ['Choose the explicit policy.'] }]]) { const validate = ajv.compile(schema); assert.equal(validate(value), true, JSON.stringify(validate.errors)); }
	const validate = ajv.compile(modelTaskOutputSchema); assert.equal(validate({ kind: 'unsupported', capability: 'frames', reason: 'Adapter absent', tests: 'passed' }), false);
});

test('C08 source adapter seals actual revisions and rejects symlink or stale evidence', async t => {
	const dir = await mkdtemp(join(tmpdir(), 'ade-structural-source-')); t.after(() => rm(dir, { recursive: true, force: true }));
	const content = 'export const value = 1;\n'; await writeFile(join(dir, 'value.mjs'), content);
	const request = taskRequest(); request.sources = [{ file: 'value.mjs', revision: await modelDigest(content), length: content.length, producer: 'test-index', language: 'javascript', windows: [{ start: 0, text: content }] }];
	const packet = await prepareStructuralSourceContext(dir, nodeOrders, request); assert.equal(packet.seal, (await compileModelTaskContext(nodeOrders, request)).seal);
	await writeFile(join(dir, 'value.mjs'), content.replace('1', '2')); await assert.rejects(validateStructuralSourceProposal(dir, packet, nodeOrders, request, {}), /stale/); await assert.rejects(prepareStructuralSourceContext(dir, nodeOrders, request), /stale/);
	await symlink(join(dir, 'value.mjs'), join(dir, 'alias.mjs')); request.sources[0].file = 'alias.mjs'; await assert.rejects(prepareStructuralSourceContext(dir, nodeOrders, request), /symlink/);
});
