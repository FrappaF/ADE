/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

/** Ships the same self-contained deterministic engine in development and desktop distributions. */
export async function buildAdeCode(out = 'out'): Promise<void> {
	const root = path.resolve(import.meta.dirname, '../..');
	await promisify(execFile)(process.execPath, [path.join(root, 'ade/scripts/build-code-import.mjs'), out], { cwd: root });
}
