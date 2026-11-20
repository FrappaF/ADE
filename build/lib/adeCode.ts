import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

/** Inputs bundled into the native ADE engine (tests, output and dependencies are excluded). */
export function isAdeCodeInput(relativePath: string): boolean {
	const file = relativePath.replaceAll('\\', '/');
	return /^src\/vs\/workbench\/contrib\/ade\/common\/.*\.ts$/.test(file)
		|| /^ade\/scripts\/(build-code-import|source-loader)\.mjs$/.test(file)
		|| /^ade\/(ai|code-import|runtime)\//.test(file) && !/(^|\/)(node_modules|test)(\/|$)/.test(file) && /\.(ts|mjs|json)$/.test(file);
}

export const adeCodeWatchInputs = ['ade/{ai,code-import,runtime}/**/*.{ts,mjs,json}', 'ade/scripts/{build-code-import,source-loader}.mjs', '!ade/**/node_modules/**', '!ade/**/test/**'];

/** Ships the same self-contained deterministic engine in development and desktop distributions. */
export async function buildAdeCode(out = 'out'): Promise<void> {
	const root = path.resolve(import.meta.dirname, '../..');
	await promisify(execFile)(process.execPath, [path.join(root, 'ade/scripts/build-code-import.mjs'), out], { cwd: root });
}
