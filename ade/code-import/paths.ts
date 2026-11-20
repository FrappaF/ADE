import { basename, dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path';
import { realpath } from 'node:fs/promises';

/** SCIP paths are canonical relative POSIX paths, including on Windows. */
export function isSourcePath(path: string): boolean {
	return !!path && posix.normalize(path) === path && path !== '.' && !path.startsWith('../') && !path.startsWith('/') && !path.includes('\\') && !path.includes('\0') && !/^[A-Za-z]:/.test(path);
}

/** Shared eligibility for locally retained baselines and explicitly reviewed AI source disclosure. */
export function isDisclosableSource(file: string): boolean {
	return isSourcePath(file) && !file.split('/').some(part => part.startsWith('.') || /^(?:node_modules|vendor|credentials|secrets)$/i.test(part)) &&
		!/(?:^|\/)(?:id_rsa|id_ed25519|credentials)(?:\.|$)/i.test(file) && !/\.(?:pem|key|p12|pfx|env)$/i.test(file);
}

/** Resolves the parent too, so a symlink cannot redirect output into the source. */
export async function outputOutsideSource(destination: string, sourceRoot: string): Promise<string> {
	const output = join(await realpath(dirname(resolve(destination))), basename(resolve(destination)));
	const distance = relative(sourceRoot, output);
	if (!distance || (!distance.startsWith('..' + sep) && distance !== '..' && !isAbsolute(distance))) { throw new Error('Output directory must be outside the source tree'); }
	return output;
}
