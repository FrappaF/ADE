/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../scripts/source-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const { defaultScope } = await import('../sourceScope.ts');
const { readSnapshot } = await import('../snapshot.ts');
const { importCode } = await import('../importCode.ts');
const run = promisify(execFile);
const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));

test('CLI scope, built-in compiler and confirmed rename share the native snapshot contract', async t => {
	const directory = await mkdtemp(join(tmpdir(), 'ade-cli-options-'));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const root = join(directory, 'source'); await mkdir(root);
	await writeFile(join(root, 'a.ts'), 'export function before(v: number): boolean { return v > 0; }');
	await writeFile(join(root, 'skip.py'), 'def skip(): pass\n');
	const scope = { ...structuredClone(defaultScope), include: ['a.ts'] };
	const scopeFile = join(directory, 'scope.json'); await writeFile(scopeFile, JSON.stringify(scope));
	const initial = join(directory, 'initial');
	await run(process.execPath, [cli, root, initial, 'cli-flags', '--scope', scopeFile, '--typescript']);
	const previous = await readSnapshot(initial);
	assert.deepEqual(previous.state.analysis.parsed, ['a.ts']);
	assert.equal(previous.state.semantic.providers[0].name, 'ade-typescript-compiler');
	const old = previous.state.files.flatMap(file => file.declarations)[0];
	await writeFile(join(root, 'a.ts'), 'export function after(v: string): boolean { return v.length > 0; }');
	const draft = await importCode(root, 'cli-flags', { previous: previous.state });
	const next = draft.files.flatMap(file => file.declarations)[0];
	const hints = join(directory, 'renames.json'); await writeFile(hints, JSON.stringify([{ fromId: old.id, toSourceId: next.sourceId }]));
	const current = join(directory, 'updated');
	await run(process.execPath, [cli, 'sync', initial, current, '--scope', scopeFile, '--renames', hints, '--typescript']);
	const updated = await readSnapshot(current);
	assert.ok(updated.state.files.flatMap(file => file.declarations).some(item => item.id === old.id && item.name === 'after'));
	assert.deepEqual(updated.state.analysis.compilerDiagnostics, []);
	assert.equal(updated.state.analysis.symbolRenames.length, 1);
	assert.deepEqual((await readSnapshot(initial)).state, previous.state);
});
