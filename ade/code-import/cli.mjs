/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { importCode } from './importCode.ts';
import { readSnapshot, writeSnapshot } from './snapshot.ts';
import { prepareSync } from './syncCode.ts';
import { applyScipBundles, readScipBundle } from './scip.ts';
import { readFile, stat } from 'node:fs/promises';

const input = process.argv.slice(2);
const args = [];
const bundlePaths = [];
for (let index = 0; index < input.length; index++) {
	if (input[index] === '--scip' && input[index + 1]) { bundlePaths.push(input[++index]); }
	else { args.push(input[index]); }
}
const [source, destination, projectId] = args;
if (!source || !destination || (source === 'status' ? args.length !== 2 : args.length !== 3)) {
	console.error('Usage: node ade/code-import/cli.mjs SOURCE NEW_OUTPUT_DIRECTORY PROJECT_ID');
	console.error('   or: node ade/code-import/cli.mjs sync PREVIOUS_OUTPUT_DIRECTORY NEW_OUTPUT_DIRECTORY');
	console.error('   or: node ade/code-import/cli.mjs status PREVIOUS_OUTPUT_DIRECTORY');
	console.error('Optional: --scip SOURCE_BOUND_BUNDLE_JSON (repeat for multiple indexers)');
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
		const enrich = state => bundles.length ? applyScipBundles(state, bundles, controller.signal) : state;
		if (source === 'sync' || source === 'status') {
			const previous = await readSnapshot(destination);
			const next = await enrich(await importCode(previous.state.sourceRoot, previous.state.projectId, { previous: previous.state, signal: controller.signal }));
			const { model, report } = prepareSync(previous.state, previous.model, next);
			if (source === 'status') { console.log(JSON.stringify(report, null, '\t')); process.exitCode = report.conflicts.length ? 2 : 0; }
			else if (!model) { console.error(JSON.stringify(report, null, '\t')); process.exitCode = 2; }
			else {
				const output = await writeSnapshot(projectId, next, model, report, previous, controller.signal);
				console.log(JSON.stringify({ output, ...report }));
			}
		} else {
			const state = await enrich(await importCode(source, projectId, { signal: controller.signal }));
			const output = await writeSnapshot(destination, state, state.model, undefined, undefined, controller.signal);
			console.log(JSON.stringify({ output, revision: state.revision, files: state.files.length, declarations: state.files.reduce((count, file) => count + file.declarations.length, 0), diagnostics: state.files.reduce((count, file) => count + file.diagnostics.length, 0) }));
		}
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	} finally { process.off('SIGINT', cancel); }
}
