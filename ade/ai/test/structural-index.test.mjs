/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import '../../scripts/source-loader.mjs';
const { lock } = await import('../../code-import/projectStore.ts');
const { refreshStructuralSourceIndex } = await import('../structuralSourceIndex.ts');

test('DAI09 I01 oversized derived parser index leaves the previous cache and every source intact', async t => {
	const root = await mkdtemp(join(tmpdir(), 'ade-dai09-index-')); t.after(() => rm(root, { recursive: true, force: true })); await mkdir(join(root, 'src'));
	await lock(root, () => refreshStructuralSourceIndex(root));
	const path = join(root, '.ade/structural/source-index.json'), before = await readFile(path, 'utf8');
	const source = 'import "' + 'x'.repeat(1536 * 1024) + '";\n';
	for (const name of ['a', 'b', 'c']) { await writeFile(join(root, 'src', name + '.mjs'), source); }
	await assert.rejects(lock(root, () => refreshStructuralSourceIndex(root)), /index exceeds 4 MiB/);
	assert.equal(await readFile(path, 'utf8'), before); assert.equal(await readFile(join(root, 'src/a.mjs'), 'utf8'), source);
});
