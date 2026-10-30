/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { readSourceScope } from './sourceScope.ts';
import { readRenameHints } from './identity.ts';
import { createTypeScriptBundle } from './typescriptSemantic.ts';
import { importCode } from './importCode.ts';
import { readSnapshot, writeSnapshot } from './snapshot.ts';
import { prepareSync } from './syncCode.ts';
import { applyScipBundles, readScipBundle } from './scip.ts';
import { readFile, stat } from 'node:fs/promises';

const input = process.argv.slice(2);
const args = [];
const bundlePaths = [];
const flags = {};
for (let index = 0; index < input.length; index++) {
	if (input[index] === '--scip' && input[index + 1]) { bundlePaths.push(input[++index]); }
	else if (['--scope', '--renames'].includes(input[index]) && input[index + 1]) { flags[input[index]] = input[++index]; }
	else if (input[index] === '--typescript') { flags.typescript = true; }
	else { args.push(input[index]); }
}
const [source, destination, projectId] = args;
if (!source || !destination || (source === 'status' ? args.length !== 2 : args.length !== 3)) {
	console.error('Usage: node ade/code-import/cli.mjs SOURCE NEW_OUTPUT_DIRECTORY PROJECT_ID');
	console.error('   or: node ade/code-import/cli.mjs sync PREVIOUS_OUTPUT_DIRECTORY NEW_OUTPUT_DIRECTORY');
	console.error('   or: node ade/code-import/cli.mjs status PREVIOUS_OUTPUT_DIRECTORY');
	console.error('Optional: --scip BUNDLE (repeat), --typescript, --scope SCOPE.json, --renames RENAMES.json');
	process.exitCode = 1;
} else {
	const controller = new AbortController();
	const cancel = () => controller.abort(new Error('Import cancelled'));
	process.on('SIGINT', cancel);
	try {
		const bundles = await Promise.all(bundlePaths.map(async path => {
			if ((await stat(path)).size > 64 * 1024 * 1024) { throw new Error('SCIP bundle exceeds 64 MiB'); }
			return readScipBundle(JSON.parse(await readFile(path, 'utf8')));
		}));
		const boundedJson = async path => { if ((await stat(path)).size > 1024 * 1024) { throw new Error('Configuration exceeds 1 MiB'); } return JSON.parse(await readFile(path, 'utf8')); };
		const scope = flags['--scope'] ? readSourceScope(await boundedJson(flags['--scope'])) : undefined;
		const renameHints = flags['--renames'] ? readRenameHints(await boundedJson(flags['--renames'])) : undefined;
		const enrich = async state => {
			const selected = [...bundles];
			if (flags.typescript) {
				const result = await createTypeScriptBundle(state, controller.signal);
				selected.unshift(result.bundle);
				state.analysis.semanticWork = { analyzed: result.analyzed, reused: result.reused };
				state.analysis.compilerDiagnostics = result.diagnostics.map(item => `${item.file}:${item.line} TS${item.code}: ${item.message}`);
			}
			return selected.length ? applyScipBundles(state, selected, controller.signal, !!flags.typescript) : state;
		};
		if (source === 'sync' || source === 'status') {
			const previous = await readSnapshot(destination);
			const next = await enrich(await importCode(previous.state.sourceRoot, previous.state.projectId, { previous: previous.state, scope, renameHints, signal: controller.signal }));
			const { model, report } = prepareSync(previous.state, previous.model, next);
			if (source === 'status') { console.log(JSON.stringify(report, null, '\t')); process.exitCode = report.conflicts.length ? 2 : 0; }
			else if (!model) { console.error(JSON.stringify(report, null, '\t')); process.exitCode = 2; }
			else {
				const output = await writeSnapshot(projectId, next, model, report, previous, controller.signal);
				console.log(JSON.stringify({ output, ...report }));
			}
		} else {
			const state = await enrich(await importCode(source, projectId, { scope, renameHints, signal: controller.signal }));
			const output = await writeSnapshot(destination, state, state.model, undefined, undefined, controller.signal);
			console.log(JSON.stringify({ output, revision: state.revision, files: state.files.length, declarations: state.files.reduce((count, file) => count + file.declarations.length, 0), diagnostics: state.files.reduce((count, file) => count + file.diagnostics.length, 0) }));
		}
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	} finally { process.off('SIGINT', cancel); }
}
