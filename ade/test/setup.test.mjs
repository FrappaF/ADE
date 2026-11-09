/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

test('desktop setup installs native header dependencies on a clean clone when invoked from npm run', async t => {
	const root = await mkdtemp(join(tmpdir(), 'ade-setup-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	await mkdir(join(root, 'ade/scripts'), { recursive: true }); await mkdir(join(root, 'build/npm'), { recursive: true });
	await copyFile(new URL('../scripts/setup.mjs', import.meta.url), join(root, 'ade/scripts/setup.mjs'));
	await writeFile(join(root, '.nvmrc'), process.versions.node);
	// The real header preinstaller uses npm_command to install its own node-gyp package.
	// npm run sets it to run-script; without the setup boundary override a clean clone installs nothing.
	await writeFile(join(root, 'build/npm/preinstall.ts'), `import {writeFileSync} from 'node:fs'; if(process.env.npm_command!=='ci')throw Error('Header dependencies were not installed');writeFileSync('headers-ready','yes');`);
	const npm = join(root, 'npm.mjs');
	await writeFile(npm, `import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';assert.deepEqual(process.argv.slice(2),['ci']);assert.equal(readFileSync('headers-ready','utf8'),'yes');writeFileSync('dependencies-ready','yes');`);
	execFileSync(process.execPath, [join(root, 'ade/scripts/setup.mjs'), '--install-only'], { cwd: root, env: { ...process.env, npm_execpath: npm, npm_command: 'run-script' }, stdio: 'pipe' });
	assert.equal(await readFile(join(root, 'dependencies-ready'), 'utf8'), 'yes');
});
