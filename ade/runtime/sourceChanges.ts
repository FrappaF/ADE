/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash, randomUUID } from 'node:crypto';
import { open, realpath, lstat, mkdir, writeFile, rename, rm, chmod } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, dirname } from 'node:path';

export interface SourceMutation { file: string; before: string; after: string; mode: number }
export const contentHash = (value: string): string => createHash('sha256').update(value).digest('hex');

/** Check every path component and preserve source permissions. Never follow redirected sources. */
export async function sourceFile(root: string, file: string, ownedMetadata = false): Promise<{ path: string; content: string; mode: number }> {
	if (!file || file.split('/').some(part => !part || ['.', '..', '.git'].includes(part) || part === '.ade' && !(ownedMetadata && ['.ade/model.json', '.ade/criteria.json'].includes(file))) || /[\\:\0]/.test(file)) { throw new Error('Invalid reconciliation source path'); }
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

/** Absence is a first-class preimage for creation, deletion, rename and recovery. */
export interface PhysicalImage { content: string; mode: number }
export interface PhysicalMutation { file: string; before: PhysicalImage | null; after: PhysicalImage | null }

function physicalPath(root: string, file: string): string {
	const metadata = ['.ade/model.json', '.ade/criteria.json'].includes(file);
	if (!file || /[\\:\0]/.test(file) || file.split('/').some(part => !part || ['.', '..', '.git'].includes(part) || part === '.ade' && !metadata)) { throw new Error('Invalid physical source path'); }
	return join(root, file);
}

export async function physicalImage(root: string, file: string): Promise<PhysicalImage | null> {
	physicalPath(root, file);
	if (await realpath(root) !== root) { throw new Error('Noncanonical project root'); }
	let current = root;
	for (const part of file.split('/')) {
		current = join(current, part);
		try { const info = await lstat(current); if (info.isSymbolicLink() || await realpath(current) !== current) { throw new Error('Redirected physical source'); } }
		catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') { return null; } throw error; }
	}
	const { content, mode } = await sourceFile(root, file, true);
	if (content.includes('\0')) { throw new Error('Invalid physical source content'); }
	return { content, mode };
}

export function samePhysicalImage(a: PhysicalImage | null, b: PhysicalImage | null): boolean { return a?.content === b?.content && a?.mode === b?.mode; }

/** Exact preimage checked twice. The caller owns the shared project lock and durable journal. */
export async function replacePhysicalImage(root: string, file: string, expected: PhysicalImage | null, next: PhysicalImage | null): Promise<void> {
	const path = physicalPath(root, file);
	if (!samePhysicalImage(await physicalImage(root, file), expected)) { throw new Error('Physical source changed; manual edits preserved'); }
	if (samePhysicalImage(expected, next)) { return; }
	let current = root;
	for (const part of file.split('/').slice(0, -1)) {
		current = join(current, part); await mkdir(current, { recursive: true });
		if (await realpath(current) !== current) { throw new Error('Redirected physical directory'); }
	}
	if (next === null) { if (!samePhysicalImage(await physicalImage(root, file), expected)) { throw new Error('Physical source changed during deletion'); } await rm(path); return; }
	const temporary = join(dirname(path), `.ade-${randomUUID()}.tmp`);
	try {
		await writeFile(temporary, next.content, { flag: 'wx', mode: next.mode }); await chmod(temporary, next.mode);
		if (!samePhysicalImage(await physicalImage(root, file), expected)) { throw new Error('Physical source changed during replacement'); }
		await rename(temporary, path);
	} finally { await rm(temporary, { force: true }); }
}
