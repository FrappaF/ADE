/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

function bootstrap(source, env = process.env) {
	// Substitute only the Electron launcher; importing the real scenario graph must
	// not execute the code importer through an erased TypeScript type dependency.
	const preload = `
import { registerHooks } from 'node:module';
registerHooks({
	resolve(specifier, context, next) {
		return specifier === 'playwright-core'
			? { url: 'data:text/javascript,export const _electron = { launch() { throw new Error("Unexpected Electron launch"); } };', shortCircuit: true }
			: next(specifier, context);
	}
});`;
	return spawnSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(preload)}`, '--input-type=module', '-e', source], {
		encoding: 'utf8', timeout: 30000, env
	});
}

test('desktop smoke bootstrap loads the model and import scenarios before launching Electron', () => {
	const result = bootstrap(`
import assert from 'node:assert/strict';
import { createSmokeHarness } from ${JSON.stringify(new URL('../scripts/smoke/harness.ts', import.meta.url).href)};
import { createImportScenarios } from ${JSON.stringify(new URL('../scripts/smoke/import.ts', import.meta.url).href)};
const harness = await createSmokeHarness();
try {
	assert.deepEqual(harness.validateSemanticModel(harness.checkoutModel), []);
	assert.equal(typeof createImportScenarios(harness).checkCodeBridge, 'function');
} finally {
	await harness.dispose();
}`);
	assert.equal(result.status, 0, result.stderr);
});

test('macOS smoke profiles can bind their IPC socket even when TMPDIR exceeds its path limit', { skip: process.platform === 'win32' }, async t => {
	const directory = await mkdtemp(join(tmpdir(), 'ade-long-temp-'));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const longTemporaryRoot = join(directory, 'long-macos-temporary-directory-'.repeat(4));
	await mkdir(longTemporaryRoot);
	const result = bootstrap(`
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { createSmokeHarness } from ${JSON.stringify(new URL('../scripts/smoke/harness.ts', import.meta.url).href)};
const harness = await createSmokeHarness('darwin');
const server = createServer();
try {
	const socket = join(harness.userData, '1.14-main.sock');
	assert.ok(Buffer.byteLength(socket) <= 103, socket);
	await new Promise((resolve, reject) => server.once('error', reject).listen(socket, resolve));
} finally {
	if (server.listening) { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
	await harness.dispose();
}`, { ...process.env, TMPDIR: longTemporaryRoot, TMP: longTemporaryRoot, TEMP: longTemporaryRoot });
	assert.equal(result.status, 0, result.stderr);
});
