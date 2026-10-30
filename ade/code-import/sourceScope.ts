/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import ignore, { type Ignore } from 'ignore';
import { minimatch } from 'minimatch';
import { readFile, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { languageAdapters } from './languages.ts';

export interface SourceScope {
	include: string[];
	exclude: string[];
	excludedDirectories: string[];
	respectGitignore: boolean;
	languageOverrides: Record<string, string>;
}
export const defaultScope: SourceScope = {
	include: ['**'], exclude: [], respectGitignore: true, languageOverrides: {},
	excludedDirectories: ['.git', '.ade', 'node_modules', 'vendor', 'dist', 'build', 'out', 'target', 'bin', 'obj', '__pycache__', '.venv', 'venv', '.next', '.build']
};
const stringList = { type: 'array', items: { type: 'string', minLength: 1 }, maxItems: 100 };
const ajv = new Ajv2020();
const valid = ajv.compile<SourceScope>({ type: 'object', additionalProperties: false, required: Object.keys(defaultScope), properties: {
	include: stringList, exclude: stringList, excludedDirectories: { ...stringList, items: { type: 'string', pattern: '^[^/\\\\]+$' } }, respectGitignore: { type: 'boolean' },
	languageOverrides: { type: 'object', propertyNames: { pattern: '^\\.[a-z0-9]+$' }, additionalProperties: { enum: languageAdapters.map(adapter => adapter.id) } }
} });
/** Validates glob and dialect configuration without executing project code. */
export function readSourceScope(value: unknown): SourceScope {
	if (!valid(value)) { throw new Error(`Invalid source scope: ${ajv.errorsText(valid.errors)}`); }
	return structuredClone(value);
}
export interface IgnoreContext { directory: string; matcher: Ignore }
/** Standard nested .gitignore semantics; ignored parent directories remain pruned. */
export async function directoryIgnores(directory: string, relative: string, scope: SourceScope, inherited: IgnoreContext[]): Promise<IgnoreContext[]> {
	const result = [...inherited];
	for (const name of [...(scope.respectGitignore ? ['.gitignore'] : []), ...(relative ? [] : ['.adeignore'])]) {
		try {
			const path = join(directory, name);
			const info = await lstat(path);
			if (info.isSymbolicLink()) { continue; }
			if (info.size > 2 * 1024 * 1024) { throw new Error(`Ignore configuration exceeds 2 MiB: ${name}`); }
			result.push({ directory: relative, matcher: ignore().add(await readFile(path, 'utf8')) });
		} catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') { throw error; } }
	}
	return result;
}
/** Globs select files; ignore patterns also prune directories. */
export function excludedPath(path: string, directory: boolean, scope: SourceScope, contexts: IgnoreContext[]): boolean {
	const value = path + (directory ? '/' : '');
	if (ignore().add(scope.exclude).ignores(value)) { return true; }
	let ignored = false;
	for (const context of contexts) {
		const relative = context.directory ? value.slice(context.directory.length + 1) : value;
		const result = context.matcher.test(relative);
		if (result.ignored) { ignored = true; }
		if (result.unignored) { ignored = false; }
	}
	return ignored || (!directory && !scope.include.some(pattern => minimatch(path, pattern, { dot: true })));
}
