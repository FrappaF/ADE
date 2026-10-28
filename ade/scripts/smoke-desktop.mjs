/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, copyFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const root = fileURLToPath(new URL('../../', import.meta.url));
const product = JSON.parse(await (await import('node:fs/promises')).readFile(path.join(root, 'product.json'), 'utf8'));
const executablePath = process.env.ADE_ELECTRON_PATH || path.join(root, '.build/electron', process.platform === 'darwin'
	? `${product.nameLong}.app/Contents/MacOS/${product.nameShort}`
	: process.platform === 'win32' ? `${product.nameShort}.exe` : product.applicationName);
const directory = await mkdtemp(path.join(tmpdir(), 'ade-smoke-'));
const userData = path.join(directory, 'profile');
const workspace = path.join(directory, 'project');
const evidence = path.join(root, '.build/ade-smoke');
const portable = path.join(directory, 'portable');
await mkdir(portable);
const launchEnv = { ...process.env, VSCODE_DEV: '1', NODE_ENV: 'development', VSCODE_PORTABLE: portable };
await mkdir(path.join(userData, 'User'), { recursive: true });
await mkdir(workspace);
await mkdir(evidence, { recursive: true });
await writeFile(path.join(userData, 'User/settings.json'), JSON.stringify({
	'window.dialogStyle': 'custom',
	'workbench.startupEditor': 'adeHome',
	'workbench.secondarySideBar.defaultVisibility': 'hidden',
	'window.restoreWindows': 'all',
	'telemetry.telemetryLevel': 'off',
	'update.mode': 'none'
}));
const args = [root, workspace, `--user-data-dir=${userData}`, `--extensions-dir=${directory}/extensions`,
	`--shared-data-dir=${directory}/shared-data`,
	'--disable-workspace-trust', '--disable-telemetry', '--disable-updates', '--disable-experiments',
	'--disable-dev-shm-usage', '--no-sandbox', '--password-store=basic', '--use-inmemory-secretstorage',
	'--disable-extension=vscode.vscode-api-tests'];
let app;
async function launch() {
	app = await electron.launch({ executablePath, args, cwd: root, env: launchEnv, timeout: 90000 });
	const window = await app.firstWindow({ timeout: 90000 });
	await window.locator('.ade-shell').waitFor({ timeout: 90000 });
	return window;
}
try {
	if (!process.argv.includes('--extension-only')) {
		let window = await launch();
		const shell = window.locator('.ade-shell');
		await shell.getByRole('button', { name: 'Open Checkout Demo', exact: true }).click();
		await shell.locator('.ade-flow').getByRole('button', { name: 'Payment', exact: true }).click();
		await shell.getByRole('heading', { name: 'Payment', exact: true }).waitFor();
		await window.screenshot({ path: path.join(evidence, 'properties.png') });
		await shell.getByRole('button', { name: 'AI Collaboration', exact: true }).click();
		await shell.getByText('Not available yet.', { exact: false }).waitFor();
		await shell.getByRole('button', { name: 'Properties', exact: true }).click();
		await shell.getByRole('heading', { name: 'Payment', exact: true }).waitFor();
		await app.close();
		app = undefined;
		window = await launch();
		await window.locator('.ade-shell').getByRole('heading', { name: 'Payment', exact: true }).waitFor();
		await window.locator('.ade-shell').getByRole('button', { name: 'Project', exact: true }).click();
		assert.equal(await window.locator('.ade-shell').getByRole('button', { name: 'Create Project', exact: false }).isEnabled(), false);
		assert.equal(await window.locator('.ade-shell').getByRole('button', { name: 'Import Codebase', exact: false }).isEnabled(), false);
		await window.screenshot({ path: path.join(evidence, 'home.png') });
		const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
		await window.keyboard.press(`${modifier}+Shift+P`);
		await window.locator('.quick-input-widget input').fill('>A.D.E: Open Home');
		await window.keyboard.press('Enter');
		await window.locator('.ade-shell').getByRole('heading', { name: 'Your Project', exact: true }).waitFor();
		console.log('PASS: desktop startup, native home, demo, properties, unavailable actions, command and persisted context after restart.');
		await app.close();
		app = undefined;
	}
	await copyFile(path.join(root, 'ade/prototype/examples/checkout.diagram.json'), path.join(workspace, 'checkout.diagram.json'));
	await new Promise((resolve, reject) => {
		const child = spawn(executablePath, [...args, '--skip-welcome',
			`--extensionDevelopmentPath=${root}/ade/prototype`, `--extensionTestsPath=${root}/ade/prototype/host-test/index.cjs`],
		{ cwd: root, env: launchEnv, stdio: 'inherit' });
		const timer = setTimeout(() => { child.kill(); reject(new Error('Extension Host smoke timed out')); }, 120000);
		child.on('error', error => { clearTimeout(timer); reject(error); });
		child.on('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Extension Host exited with ${code}`)); });
	});
} catch (error) {
	if (app) {
		for (const [index, window] of app.windows().entries()) {
			await window.screenshot({ path: path.join(evidence, `failure-${index}.png`) }).catch(() => {});
		}
	}
	throw error;
} finally {
	await app?.close();
	await rm(directory, { recursive: true, force: true });
}
