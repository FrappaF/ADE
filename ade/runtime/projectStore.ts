/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomUUID } from 'node:crypto';
import { mkdir, lstat, realpath, readdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { join, basename } from 'node:path';
import lockfile from 'proper-lockfile';

export const snapshotId = (value: string): boolean => /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);

/** All source-changing services share the same project lock and canonical metadata namespace. */
export async function managed(root: string, name = 'imports'): Promise<string> {
	if (!['imports', 'reconciliation', 'diagram-imports', 'exploration', 'structural', 'worktrees'].includes(name) || await realpath(root) !== root) { throw new Error('Invalid managed project root'); }
	for (const path of [join(root, '.ade'), join(root, '.ade', name)]) {
		await mkdir(path, { recursive: true });
		if ((await lstat(path)).isSymbolicLink() || await realpath(path) !== path) { throw new Error('Managed snapshot directory cannot be a symlink'); }
	}
	return join(root, '.ade', name);
}

export async function active(root: string): Promise<string | undefined> {
	try {
		const path = join(root, '.ade', 'code-project.json');
		const info = await lstat(path);
		if (!info.isFile() || info.size > 4096) { throw new Error('Invalid code project pointer'); }
		const value = JSON.parse(await readFile(path, 'utf8')) as { version?: number; active?: string };
		if (value.version !== 1 || !snapshotId(value.active ?? '')) { throw new Error('Invalid code project pointer'); }
		return value.active;
	} catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') { return undefined; } throw error; }
}

export async function atomicJson(path: string, value: object): Promise<void> {
	const temporary = `${path}.${randomUUID()}.tmp`;
	try { await writeFile(temporary, JSON.stringify(value, null, '\t') + '\n', { flag: 'wx', mode: 0o600 }); await rename(temporary, path); }
	finally { await rm(temporary, { force: true }); }
}

export async function activate(root: string, directory: string): Promise<void> {
	if (!snapshotId(basename(directory)) || directory !== join(root, '.ade', 'imports', basename(directory))) { throw new Error('Invalid snapshot activation'); }
	await atomicJson(join(root, '.ade', 'code-project.json'), { version: 1, active: basename(directory) });
}

export async function lock<T>(root: string, task: () => Promise<T>): Promise<T> {
	await managed(root);
	const release = await lockfile.lock(join(root, '.ade', 'code-project.json'), { realpath: false, lockfilePath: join(root, '.ade', 'code-project.lock'), stale: 300_000, update: 10_000, retries: 0 });
	try { return await task(); } finally { await release(); }
}

/** M5/M6 and the structural adapter share the lock and block each other's interrupted publications. */
export async function assertNoInterruptedStructuralPublication(root: string): Promise<void> {
	const directory = join(await managed(root, 'structural'), 'sessions');
	let entries: string[];
	try { if (await realpath(directory) !== directory) { throw new Error('Redirected structural journals'); } entries = await readdir(directory); }
	catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') { return; } throw error; }
	for (const file of entries.filter(file => file.endsWith('.json'))) {
		if (!snapshotId(file.slice(0, -5))) { throw new Error('Invalid structural journal identity'); }
		const path = join(directory, file), info = await lstat(path);
		if (!info.isFile() || info.isSymbolicLink() || info.size > 16 * 1024 * 1024) { throw new Error('Invalid structural publication journal'); }
		const value = JSON.parse(await readFile(path, 'utf8')) as { version?: number; root?: string; id?: string; status?: string };
		if (value.version !== 1 || value.root !== root || value.id !== file.slice(0, -5)) { throw new Error('Inconsistent structural journal identity'); }
		if (value.status === 'publishing' || value.status === 'undoing') { throw new Error('Interrupted structural publication requires recovery before Sync or implementation'); }
	}
}
