/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../scripts/source-loader.mjs';

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { open, rm } from 'node:fs/promises';
const { readSnapshot } = await import('./snapshot.ts');
const { importCode } = await import('./importCode.ts');
const { captureScip } = await import('./scip.ts');
const { outputOutsideSource } = await import('./paths.ts');

const input = process.argv.slice(2);
const separator = input.indexOf('--');
const [snapshotPath, destination, ...options] = input.slice(0, separator);
const [command, ...arguments_] = separator >= 0 ? input.slice(separator + 1) : [];
const encodings = new Map([['utf8', 1], ['utf16', 2], ['utf32', 3]]);
const encoding = options[0] === '--position-encoding' && options.length === 2 ? encodings.get(options[1]) : undefined;
if (!snapshotPath || !destination || !command || (options.length && !encoding)) {
	console.error('Usage: node ade/code-import/capture-scip.mjs SNAPSHOT NEW_BUNDLE_JSON [--position-encoding utf8|utf16|utf32] -- INDEX_COMMAND [ARG...]');
	process.exitCode = 1;
} else {
	const controller = new AbortController();
	const cancel = () => controller.abort(new Error('SCIP capture cancelled'));
	process.on('SIGINT', cancel);
	try {
		const previous = await readSnapshot(snapshotPath);
		const state = await importCode(previous.state.sourceRoot, previous.state.projectId, { previous: previous.state, signal: controller.signal });
		const output = await outputOutsideSource(destination, state.sourceRoot);
		const bundle = await captureScip(state, async () => {
			const { stdout, stderr } = await promisify(execFile)(command, arguments_, { cwd: state.sourceRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, signal: controller.signal });
			if (stderr) { process.stderr.write(stderr); }
			return JSON.parse(stdout);
		}, encoding, controller.signal);
		const content = JSON.stringify(bundle, null, '\t') + '\n';
		if (Buffer.byteLength(content) > 64 * 1024 * 1024) { throw new Error('SCIP bundle exceeds 64 MiB'); }
		controller.signal.throwIfAborted();
		const file = await open(output, 'wx');
		let complete = false;
		try {
			await file.writeFile(content);
			controller.signal.throwIfAborted();
			complete = true;
		} finally { await file.close(); if (!complete) { await rm(output, { force: true }); } }
		console.log(JSON.stringify({ output, sourceRevision: bundle.sourceRevision, producer: bundle.index.metadata.tool_info }));
	} catch (error) { console.error(error.message); process.exitCode = 1; }
	finally { process.off('SIGINT', cancel); }
}
