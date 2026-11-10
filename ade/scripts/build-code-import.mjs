/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createRequire } from 'node:module';
import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { languageAdapters } from '../code-import/languages.ts';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const requireBuild = createRequire(join(root, 'build/package.json'));
const requireTool = createRequire(join(root, 'ade/code-import/package.json'));
const { build } = requireBuild('esbuild');
const output = resolve(root, process.argv[2] ?? 'out', 'vs/workbench/contrib/ade/node');
await rm(join(output, 'grammars'), { recursive: true, force: true });
await rm(join(output, 'typescript'), { recursive: true, force: true });
await mkdir(join(output, 'grammars'), { recursive: true });
await mkdir(join(output, 'typescript'), { recursive: true });
for (const [entry, name] of [['ade/code-import/nativeHost.ts', 'adeCodeEngine.js'], ['ade/ai/diagram-mcp.mjs', 'adeDiagramMcp.js']]) { await build({
	entryPoints: [join(root, entry)], outfile: join(output, name),
	bundle: true, platform: 'node', format: 'esm', target: 'node24', sourcemap: true,
	banner: { js: "import { createRequire as adeCreateRequire } from 'node:module'; import { fileURLToPath as adeFileURLToPath } from 'node:url'; import { dirname as adeDirname } from 'node:path'; const require = adeCreateRequire(import.meta.url); const __filename = adeFileURLToPath(import.meta.url); const __dirname = adeDirname(__filename);" }
});
}

const copy = (source, name) => cp(source, join(output, name));
await copy(requireTool.resolve('web-tree-sitter/web-tree-sitter.wasm'), 'web-tree-sitter.wasm');
const old = dirname(requireTool.resolve('legacy-tree-sitter'));
await copy(join(old, 'tree-sitter.js'), 'legacy-runtime.cjs');
await copy(join(old, 'tree-sitter.wasm'), 'tree-sitter.wasm');
await copy(join(old, 'LICENSE'), 'legacy-tree-sitter.LICENSE');
for (const pkg of ['@repomix/tree-sitter-wasms', 'tree-sitter-wasms']) {
	const base = dirname(requireTool.resolve(`${pkg}/package.json`));
	for (const adapter of languageAdapters.filter(adapter => (adapter.grammarPackage ?? '@repomix/tree-sitter-wasms') === pkg)) {
		const name = `tree-sitter-${adapter.grammar}.wasm`;
		await copy(join(base, 'out', name), join('grammars', name));
	}
	await copy(join(base, 'LICENSE'), `${pkg.includes('repomix') ? 'repomix' : 'legacy'}-grammars.LICENSE`);
}
const ts = dirname(requireTool.resolve('typescript'));
for (const name of await readdir(ts)) { if (/^lib.*\.d\.ts$/.test(name)) { await copy(join(ts, name), join('typescript', name)); } }
await copy(join(ts, '../LICENSE.txt'), 'typescript.LICENSE.txt');
// Preserve direct and transitive runtime notices alongside the bundled code.
await mkdir(join(output, 'licenses'), { recursive: true });
for (const packageRoot of ['ade/code-import', 'ade/ai']) {
	const requirePackage = createRequire(join(root, packageRoot, 'package.json'));
	const dependencies = requirePackage('./package-lock.json').packages;
	for (const [path, dependency] of Object.entries(dependencies)) {
		if (!path || dependency.dev) { continue; }
		const base = join(root, packageRoot, path);
		for (const name of await readdir(base)) {
			if (!/^(licen[cs]e|copying|copyrightnotice)([.-]|$)/i.test(name)) { continue; }
			await copy(join(base, name), join('licenses', `${packageRoot.replaceAll('/', '_')}_${path.replaceAll('/', '_')}.${name}`));
		}
	}
}
console.log('[ade-code] Built local code engine, MCP adapter, compiler libraries and parser grammars.');
