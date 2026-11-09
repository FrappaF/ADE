/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

test('desktop launcher captures the selected standalone Node path before starting Electron', { skip: process.platform === 'win32' }, async t => {
	const root = await mkdtemp(join(tmpdir(), 'ade-launcher-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	await mkdir(join(root, 'ade/scripts'), { recursive: true }); await mkdir(join(root, 'scripts'));
	await copyFile(new URL('../scripts/dev.sh', import.meta.url), join(root, 'ade/scripts/dev.sh'));
	await writeFile(join(root, '.nvmrc'), process.versions.node);
	await writeFile(join(root, 'scripts/code.sh'), '#!/usr/bin/env bash\nprintf "%s" "$ADE_NODE_EXECUTABLE"', { mode: 0o755 });
	const env = { ...process.env }; delete env.ADE_NODE_EXECUTABLE;
	assert.equal(execFileSync('bash', [join(root, 'ade/scripts/dev.sh')], { env, encoding: 'utf8' }), process.execPath);
	assert.equal(execFileSync('bash', [join(root, 'ade/scripts/dev.sh')], { env: { ...env, ADE_NODE_EXECUTABLE: '/explicit/node' }, encoding: 'utf8' }), '/explicit/node');
});
