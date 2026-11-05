/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);

function setup() {
	const invalid = args.find(arg => !['--install-only', '--help'].includes(arg));
	if (invalid) { throw new Error(`Unknown option: ${invalid}. Use npm run ade:setup -- --help.`); }
	if (args.includes('--help')) {
		console.log(`Usage: npm run ade:setup [-- --install-only]

Prepares native headers, installs locked dependencies, builds the desktop and downloads Electron.
--install-only  Prepare headers and install dependencies without building the desktop.

Select the Node version in .nvmrc and install the platform's native build tools first.
The desktop is started separately with ade/scripts/dev.sh (scripts\\code.bat on Windows).`);
		return;
	}
	const required = readFileSync(new URL('../../.nvmrc', import.meta.url), 'utf8').trim();
	if (process.versions.node !== required) {
		throw new Error(`A.D.E requires Node ${required}; currently using ${process.versions.node}. Run nvm install and nvm use from the repository root, then retry.`);
	}
	const npmCli = process.env.npm_execpath;
	if (!npmCli) { throw new Error('Run this script with npm run ade:setup.'); }
	const env = { ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1', FOUNDRY_LOCAL_SKIP_INSTALL: '1' };
	const steps = [
		{ label: 'Prepare native headers', args: ['build/npm/preinstall.ts'] },
		{ label: 'Install dependencies', args: [npmCli, 'ci'] }
	];
	if (!args.includes('--install-only')) {
		steps.push(
			{ label: 'Build desktop client and ADE engine', args: [npmCli, 'run', 'build-fast', '--', '--client-only'] },
			{ label: 'Build bundled extensions and media', args: [npmCli, 'run', 'gulp', 'transpile-extensions', 'compile-extension-media'] },
			{ label: 'Build Copilot extension', args: [npmCli, 'run', 'compile-copilot'] },
			{ label: 'Prepare Electron', args: [npmCli, 'run', 'electron'] }
		);
	}
	for (const [index, step] of steps.entries()) {
		console.log(`\n[ade:setup ${index + 1}/${steps.length}] ${step.label}`);
		// Invoke npm through this Node executable, including when paths contain spaces on Windows.
		const result = spawnSync(process.execPath, step.args, { cwd: root, env, stdio: 'inherit' });
		if (result.error) { throw new Error(`${step.label}: ${result.error.message}`); }
		if (result.status !== 0) {
			console.error(`[ade:setup] ${step.label} failed${result.signal ? ` (${result.signal})` : ` (exit ${result.status})`}. Setup stopped.`);
			process.exit(result.status ?? 1);
		}
	}
	console.log(args.includes('--install-only')
		? '\n[ade:setup] Dependencies installed. Run npm run ade:setup to build the desktop.'
		: `\n[ade:setup] Desktop ready. Start it with ${process.platform === 'win32' ? 'scripts\\code.bat' : './ade/scripts/dev.sh'}.`);
}

try { setup(); }
catch (error) {
	console.error(`[ade:setup] ${error.message}`);
	process.exitCode = 1;
}
