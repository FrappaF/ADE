/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

function fixture(t, overrides = {}) {
	const root = mkdtempSync(join(tmpdir(), 'ade setup '));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	mkdirSync(join(root, 'ade/scripts'), { recursive: true });
	mkdirSync(join(root, 'build/npm'), { recursive: true });
	copyFileSync(new URL('../setup.mjs', import.meta.url), join(root, 'ade/scripts/setup.mjs'));
	writeFileSync(join(root, '.nvmrc'), overrides.version ?? process.versions.node);
	const record = `
import { appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(process.env.ADE_SETUP_TEST_TRACE, JSON.stringify({
	args, cwd: process.cwd(), node: process.execPath,
	playwright: process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD,
	foundry: process.env.FOUNDRY_LOCAL_SKIP_INSTALL,
	inherited: process.env.ADE_SETUP_TEST_INHERITED
}) + '\\n');
if (args.includes(process.env.ADE_SETUP_TEST_FAIL)) { process.exit(23); }
`;
	writeFileSync(join(root, 'build/npm/preinstall.ts'), overrides.preinstallFailure ? 'process.exit(17);' : record);
	const npmCli = join(root, 'npm cli.mjs');
	writeFileSync(npmCli, record);
	const trace = join(root, 'trace.jsonl');
	return {
		root,
		run: (...args) => spawnSync(process.execPath, [join(root, 'ade/scripts/setup.mjs'), ...args], {
			cwd: tmpdir(), encoding: 'utf8', timeout: 30000,
			env: { ...process.env, npm_execpath: npmCli, ADE_SETUP_TEST_TRACE: trace, ADE_SETUP_TEST_FAIL: overrides.fail ?? '',
				ADE_SETUP_TEST_INHERITED: 'preserved', PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '0', FOUNDRY_LOCAL_SKIP_INSTALL: '0' }
		}),
		events: () => existsSync(trace) ? readFileSync(trace, 'utf8').trim().split('\n').map(line => JSON.parse(line)) : []
	};
}

test('setup works outside the checkout with spaces in paths and preserves the child environment', t => {
	const f = fixture(t);
	const result = f.run('--install-only');
	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(f.events(), [[], ['ci']].map(args => ({
		args, cwd: f.root, node: process.execPath, playwright: '1', foundry: '1', inherited: 'preserved'
	})));
});

test('default setup completes the desktop preparation before reporting it ready', t => {
	const f = fixture(t);
	const result = f.run();
	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(f.events().map(event => event.args), [
		[], ['ci'], ['run', 'build-fast', '--', '--client-only'],
		['run', 'gulp', 'transpile-extensions', 'compile-extension-media'], ['run', 'compile-copilot'], ['run', 'electron']
	]);
	assert.match(result.stdout, /Desktop ready/);
});

test('a preinstall failure prevents npm from running', t => {
	const f = fixture(t, { preinstallFailure: true });
	const result = f.run();
	assert.deepEqual({ status: result.status, events: f.events() }, { status: 17, events: [] });
	assert.match(result.stderr, /Prepare native headers failed/);
});

for (const fail of ['ci', 'build-fast']) {
	test(`a ${fail} failure prevents subsequent steps and preserves the exit code`, t => {
		const f = fixture(t, { fail });
		const result = f.run();
		assert.deepEqual({ status: result.status, events: f.events().map(event => event.args) }, {
			status: 23, events: fail === 'ci' ? [[], ['ci']] : [[], ['ci'], ['run', 'build-fast', '--', '--client-only']]
		});
		assert.doesNotMatch(result.stdout, /Desktop ready/);
	});
}

test('a Node version mismatch fails before executing any installation step', t => {
	const f = fixture(t, { version: '0.0.0' });
	const result = f.run();
	assert.deepEqual({ status: result.status, events: f.events() }, { status: 1, events: [] });
	assert.match(result.stderr, /Run nvm install and nvm use/);
});

test('help works without selecting the required Node version or running any steps', t => {
	const f = fixture(t, { version: '0.0.0' });
	const result = f.run('--help');
	assert.deepEqual({ status: result.status, events: f.events() }, { status: 0, events: [] });
	assert.match(result.stdout, /--install-only/);
});

test('unknown options fail before executing any installation step', t => {
	const f = fixture(t);
	const result = f.run('--unknown');
	assert.deepEqual({ status: result.status, events: f.events() }, { status: 1, events: [] });
	assert.match(result.stderr, /Unknown option/);
});
