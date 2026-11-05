/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'node:crypto';
import { open, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';

export interface SourceMutation { file: string; before: string; after: string; mode: number }
export const contentHash = (value: string): string => createHash('sha256').update(value).digest('hex');

/** Check every path component and preserve source permissions. Never follow redirected sources. */
export async function sourceFile(root: string, file: string): Promise<{ path: string; content: string; mode: number }> {
	if (!file || file.split('/').some(part => !part || ['.', '..', '.ade', '.git'].includes(part)) || /[\\:\0]/.test(file)) { throw new Error('Invalid reconciliation source path'); }
	const path = join(root, file);
	if (await realpath(path) !== path) { throw new Error('Reconciliation source was redirected'); }
	const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
	try {
		const info = await handle.stat();
		if (!info.isFile() || info.nlink !== 1 || info.size > 2 * 1024 * 1024) { throw new Error('Reconciliation source is not a bounded regular file'); }
		const buffer = Buffer.alloc(info.size + 1);
		let length = 0;
		while (length < buffer.length) { const result = await handle.read(buffer, length, buffer.length - length, null); if (!result.bytesRead) { break; } length += result.bytesRead; }
		if (length > info.size) { throw new Error('Source grew during reconciliation read'); }
		return { path, content: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer.subarray(0, length)), mode: info.mode & 0o777 };
	} finally { await handle.close(); }
}
