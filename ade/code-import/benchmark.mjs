import '../scripts/source-loader.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
const { importCode } = await import('./importCode.ts');
const { defaultScope } = await import('./sourceScope.ts');
const { createTypeScriptBundle } = await import('./typescriptSemantic.ts');
const { applyScipBundles } = await import('./scip.ts');

const [root, label, ...include] = process.argv.slice(2);
if (!root || !label) { throw new Error('Usage: node ade/code-import/benchmark.mjs ROOT LABEL [INCLUDE_GLOB ...]'); }
const scope = { ...structuredClone(defaultScope), include: include.length ? include : ['**'] };
async function timed(task) { const start = performance.now(); const result = await task(); return { result, ms: Math.round((performance.now() - start) * 100) / 100 }; }
const cold = await timed(() => importCode(root, `benchmark:${label}`, { scope }));
const state = cold.result;
let names = 0;
let matches = 0;
for (const file of state.files.filter(file => file.declarations.length)) {
	const source = await readFile(join(root, file.file), 'utf8');
	for (const declaration of file.declarations) {
		if (!declaration.nameEvidence) { continue; }
		names++; const range = declaration.nameEvidence;
		if (source.slice(range.start, range.end) === declaration.name) { matches++; }
	}
}
const warm = await timed(() => importCode(root, state.projectId, { previous: state }));
const selected = state.files.find(file => file.status === 'parsed' && file.declarations.length);
let changed;
if (selected) {
	const path = join(root, selected.file);
	const source = await readFile(path, 'utf8');
	try { await writeFile(path, '\n' + source); changed = await timed(() => importCode(root, state.projectId, { previous: state })); }
	finally { await writeFile(path, source); }
}
let semantic;
if (state.files.some(file => ['javascript', 'typescript', 'tsx'].includes(file.language))) {
	const first = await timed(() => createTypeScriptBundle(state));
	const graph = await applyScipBundles(state, [first.result.bundle]);
	const next = await timed(() => createTypeScriptBundle(state));
	semantic = { coldMs: first.ms, warmMs: next.ms, warmAnalyzed: next.result.analyzed.length, warmReused: next.result.reused.length, dependencies: graph.semantic.dependencies.length, diagnostics: first.result.diagnostics.length, coverageDiagnostics: graph.semantic.diagnostics.length };
}
console.log(JSON.stringify({ label, node: process.version, platform: process.platform, arch: process.arch, include: scope.include, sourceFiles: state.files.filter(file => ['parsed', 'partial'].includes(file.status)).length, partialFiles: state.files.filter(file => file.status === 'partial').map(file => file.file), declarations: state.files.reduce((sum, file) => sum + file.declarations.length, 0), nameEvidence: { inspected: names, exact: matches }, coverageDiagnostics: state.files.reduce((sum, file) => sum + file.diagnostics.length, 0), coldMs: cold.ms, warmMs: warm.ms, warmParsed: warm.result.analysis.parsed.length, warmReused: warm.result.analysis.reused.length, oneFileChange: changed && { ms: changed.ms, parsed: changed.result.analysis.parsed.length, reused: changed.result.analysis.reused.length }, semantic, maxRssMiB: Math.round(process.resourceUsage().maxRSS / 1024), heapMiB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) }, null, 2));
