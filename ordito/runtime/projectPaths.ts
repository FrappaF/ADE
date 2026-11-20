import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { errorCode } from './errors.ts';

const metadataName = '.ordito';
const legacyMetadataName = '.ade';

export function isProjectMetadataDirectory(name: string): boolean {
	return name === metadataName || name === legacyMetadataName;
}

/** Existing projects keep their namespace because journals and Git worktrees refer to it by path. */
export async function projectMetadataName(root: string): Promise<string> {
	for (const name of [metadataName, legacyMetadataName]) {
		try {
			const info = await lstat(join(root, name));
			if (info.isSymbolicLink()) { throw new Error('Managed project directory cannot be a symlink'); }
			if (!info.isDirectory()) { throw new Error('Managed project path is not a directory'); }
			return name;
		} catch (error) {
			if (errorCode(error) !== 'ENOENT') { throw error; }
		}
	}
	return metadataName;
}

export async function projectMetadataPath(root: string, ...parts: string[]): Promise<string> {
	return join(root, await projectMetadataName(root), ...parts);
}
