/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { basename, dirname, join, resolve, relative, isAbsolute, sep } from 'node:path';
import { importCode } from './importCode.ts';

const [source, destination, projectId, ...extra] = process.argv.slice(2);
if (!source || !destination || !projectId || extra.length) {
	console.error('Usage: node ade/code-import/cli.mjs SOURCE NEW_OUTPUT_DIRECTORY PROJECT_ID');
	process.exitCode = 1;
} else {
	let createdDirectory;
	try {
		const root = await realpath(source);
		// Resolve the parent too, so a symlink cannot put generated files inside the source.
		const output = join(await realpath(dirname(resolve(destination))), basename(resolve(destination)));
		const distance = relative(root, output);
		if (!distance || (!distance.startsWith('..' + sep) && distance !== '..' && !isAbsolute(distance))) { throw new Error('Output directory must be outside the source tree'); }
		const { model, ...index } = await importCode(root, projectId);
		await mkdir(output);
		createdDirectory = output;
		await writeFile(join(output, 'model.ade.json'), JSON.stringify(model, null, '\t') + '\n', { flag: 'wx' });
		await writeFile(join(output, 'code-index.json'), JSON.stringify(index, null, '\t') + '\n', { flag: 'wx' });
		console.log(JSON.stringify({ output, revision: index.revision, files: index.files.length, declarations: index.files.reduce((count, file) => count + file.declarations.length, 0), diagnostics: index.files.reduce((count, file) => count + file.diagnostics.length, 0) }));
	} catch (error) {
		if (createdDirectory) { await rm(createdDirectory, { recursive: true, force: true }); }
		console.error(error.message);
		process.exitCode = 1;
	}
}
