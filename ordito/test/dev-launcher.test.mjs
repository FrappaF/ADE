import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

test('desktop launcher selects the standalone Node and preserves existing development profiles', { skip: process.platform === 'win32' }, async t => {
	const root = await mkdtemp(join(tmpdir(), 'ordito-launcher-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	await mkdir(join(root, 'ordito/scripts'), { recursive: true }); await mkdir(join(root, 'scripts'));
	await copyFile(new URL('../scripts/dev.sh', import.meta.url), join(root, 'ordito/scripts/dev.sh'));
	await writeFile(join(root, '.nvmrc'), process.versions.node);
	await writeFile(join(root, 'scripts/code.sh'), '#!/usr/bin/env bash\nprintf "%s\\n" "$ORDITO_NODE_EXECUTABLE" "$VSCODE_PORTABLE" "$@"', { mode: 0o755 });
	const env = { ...process.env }; delete env.ORDITO_NODE_EXECUTABLE;
	const launch = env => execFileSync('bash', [join(root, 'ordito/scripts/dev.sh')], { env, encoding: 'utf8' }).trimEnd().split('\n');
	assert.deepEqual(launch(env), [
		process.execPath,
		join(root, '.build/ordito-portable'),
		'--user-data-dir=' + join(root, '.build/ordito-profile'),
		'--extensions-dir=' + join(root, '.build/ordito-extensions'),
		'--shared-data-dir=' + join(root, '.build/ordito-shared')
	]);
	await Promise.all(['profile', 'extensions', 'shared', 'portable'].map(suffix => mkdir(join(root, '.build', 'ade-' + suffix))));
	assert.deepEqual(launch({ ...env, ORDITO_NODE_EXECUTABLE: '/explicit/node' }), [
		'/explicit/node',
		join(root, '.build/ordito-portable'),
		'--user-data-dir=' + join(root, '.build/ade-profile'),
		'--extensions-dir=' + join(root, '.build/ade-extensions'),
		'--shared-data-dir=' + join(root, '.build/ade-shared')
	]);
});
