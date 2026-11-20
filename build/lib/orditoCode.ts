import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

/** Inputs bundled into the native Ordito engine (tests, output and dependencies are excluded). */
export function isOrditoCodeInput(relativePath: string): boolean {
	const file = relativePath.replaceAll('\\', '/');
	return /^src\/vs\/workbench\/contrib\/ordito\/common\/.*\.ts$/.test(file)
		|| /^ordito\/scripts\/(build-code-import|source-loader)\.mjs$/.test(file)
		|| /^ordito\/(ai|code-import|runtime)\//.test(file) && !/(^|\/)(node_modules|test)(\/|$)/.test(file) && /\.(ts|mjs|json)$/.test(file);
}

export const orditoCodeWatchInputs = ['ordito/{ai,code-import,runtime}/**/*.{ts,mjs,json}', 'ordito/scripts/{build-code-import,source-loader}.mjs', '!ordito/**/node_modules/**', '!ordito/**/test/**'];

/** Ships the same self-contained deterministic engine in development and desktop distributions. */
export async function buildOrditoCode(out = 'out'): Promise<void> {
	const root = path.resolve(import.meta.dirname, '../..');
	await promisify(execFile)(process.execPath, [path.join(root, 'ordito/scripts/build-code-import.mjs'), out], { cwd: root });
}
