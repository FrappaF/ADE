/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../scripts/source-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture, config } from './fixtures.mjs';
const { runProcess } = await import('../process.ts');

test('CLI prepares offline, refuses source destinations and overwrites, and removes failed reserved artifacts', async t => {
	const f = await fixture(t);
	const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));
	const request = join(f.directory, 'request.json'), settings = join(f.directory, 'config.json');
	const review = join(f.directory, 'review.json'), result = join(f.directory, 'result.json');
	await writeFile(request, JSON.stringify(f.request));
	await writeFile(settings, JSON.stringify({ ...config, maxCalls: 0 }));
	const prepare = await runProcess(process.execPath, [cli, 'prepare', request, settings, review], f.directory);
	assert.equal(prepare.code, 0);
	const prepared = JSON.parse(await readFile(review, 'utf8'));
	assert.deepEqual({ maxCalls: prepared.config.maxCalls, files: prepared.context.sources.map(source => source.file) }, { maxCalls: 0, files: ['checkout.mjs'] });
	assert.equal((await runProcess(process.execPath, [cli, 'propose', review, prepared.reviewId, result], f.directory)).code, 1);
	await assert.rejects(access(result));
	assert.equal((await runProcess(process.execPath, [cli, 'prepare', request, settings, join(f.root, 'forbidden.json')], f.directory)).code, 1);
	await assert.rejects(access(join(f.root, 'forbidden.json')));
	await writeFile(result, 'Existing user artifact');
	assert.equal((await runProcess(process.execPath, [cli, 'prepare', request, settings, result], f.directory)).code, 1);
	assert.equal(await readFile(result, 'utf8'), 'Existing user artifact');
});
