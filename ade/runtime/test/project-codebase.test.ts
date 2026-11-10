/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../scripts/source-loader.mjs';
import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { type CodeContext, type CodeRequest } from '../../../src/vs/workbench/contrib/ade/common/codeBridge.ts';
import { type SemanticModel } from '../../../src/vs/workbench/contrib/ade/common/modelTypes.ts';

const { createCodeEngine } = await import('../nativeHost.ts');
const { readSnapshot } = await import('../../code-import/snapshot.ts');
const { checkoutModel } = await import('../../../src/vs/workbench/contrib/ade/common/checkoutModel.ts');
const { emptyFoundation } = await import('../../../src/vs/workbench/contrib/ade/common/modelFoundation.ts');

async function fixture(t: TestContext, model: SemanticModel = checkoutModel) {
	const root = await mkdtemp(join(tmpdir(), 'ade-project-codebase-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	await mkdir(join(root, '.ade'));
	await writeFile(join(root, 'app.rb'), 'class OrdersController\n  def index\n    Order.all\n  end\nend\n');
	const original = JSON.stringify(model, null, '\t') + '\n';
	await writeFile(join(root, '.ade', 'model.json'), original);
	const engine = createCodeEngine();
	const call = async (request: CodeRequest) => JSON.parse(await engine.execute(JSON.stringify(request))) as CodeContext;
	return { root, original, call };
}

test('linking the open project inventories its code and preserves its complete editable model', async t => {
	const f = await fixture(t);
	const context = await f.call({ operation: 'import', root: f.root, modelFile: '.ade/model.json', syntaxOnly: true });
	const snapshot = await readSnapshot(context.snapshot);
	assert.deepEqual({ root: context.sourceRoot, projectId: snapshot.state.projectId, model: snapshot.model, commonModel: snapshot.commonModel, source: context.files.some(file => file.path === 'app.rb'), original: await readFile(join(f.root, '.ade', 'model.json'), 'utf8') }, { root: f.root, projectId: checkoutModel.id, model: checkoutModel, commonModel: checkoutModel, source: true, original: f.original });
	const opened = JSON.parse(await createCodeEngine().execute(JSON.stringify({ operation: 'exploration', snapshot: context.snapshot, request: JSON.stringify({ action: 'open', workflow: 'project' }) })));
	assert.ok(opened.sessionId && opened.data.mcp, 'the linked project exposes the ADE diagram tools');
	const pointer = await readFile(join(f.root, '.ade', 'code-project.json'), 'utf8');
	await assert.rejects(f.call({ operation: 'import', root: f.root, modelFile: '.ade/model.json', syntaxOnly: true }), /already has an import/);
	assert.equal(await readFile(join(f.root, '.ade', 'code-project.json'), 'utf8'), pointer);
});

test('linking rejects models outside the project and redirected model files', async t => {
	const f = await fixture(t), other = await fixture(t);
	for (const modelFile of ['../model.json', '/model.json', '.ade/imports/model.json', 'nested/../model.json']) {
		await assert.rejects(f.call({ operation: 'import', root: f.root, modelFile }), /Invalid project model path/);
	}
	await rm(join(f.root, '.ade', 'model.json'));
	await symlink(join(other.root, '.ade', 'model.json'), join(f.root, '.ade', 'model.json'));
	await assert.rejects(f.call({ operation: 'import', root: f.root, modelFile: '.ade/model.json' }), /redirected/);
	await assert.rejects(access(join(f.root, '.ade', 'code-project.json')), /ENOENT/);
	assert.equal(await readFile(join(other.root, '.ade', 'model.json'), 'utf8'), other.original);
});

test('a newly created ADE project keeps its identity and foundation when its first source inventory is attached', async t => {
	const model: SemanticModel = { version: 4, id: 'rails-project', name: 'Rails Shop', foundation: emptyFoundation(), semantics: { elements: [], relations: [] }, views: [], codeMappings: [], verifications: [] };
	const f = await fixture(t, model);
	const context = await f.call({ operation: 'import', root: f.root, modelFile: '.ade/model.json' });
	assert.deepEqual((await readSnapshot(context.snapshot)).model, model);
});
