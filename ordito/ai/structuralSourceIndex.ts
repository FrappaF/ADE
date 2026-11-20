import { readdir, lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import ts from '../code-import/typescriptRuntime.ts';
import { managed, atomicJson } from '../runtime/projectStore.ts';
import { physicalImage, contentHash } from '../runtime/sourceChanges.ts';
import { readPredicateRegion } from '../../src/vs/workbench/contrib/ordito/common/modelProject.ts';
import { readInteractionRegion } from '../../src/vs/workbench/contrib/ordito/common/interactionRuntime.ts';
import { readStateMachineRegion } from '../../src/vs/workbench/contrib/ordito/common/stateRuntime.ts';
import { readMessagingRegion } from '../../src/vs/workbench/contrib/ordito/common/modelMessaging.ts';

export interface StructuralSourceIndex {
	version: 1;
	producer: string;
	entries: {
		file: string; hash: string; mode: number;
		identity?: { kind: 'predicate' | 'interaction' | 'state' | 'messaging'; id: string };
		mapping: 'owned-descriptor' | 'partial' | 'unowned';
		parser: { exports: string[]; imports: string[]; diagnostics: number[] };
	}[];
}

/** Derived cache only. Always parse current physical files; never use a cached identity as evidence. Caller owns the project lock. */
export async function refreshStructuralSourceIndex(root: string): Promise<StructuralSourceIndex> {
	const files: string[] = []; let visited = 0, bytes = 0;
	async function walk(directory: string, depth: number): Promise<void> {
		const entries = await readdir(join(root, directory), { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') { return []; } throw error; });
		for (const entry of entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
			if (++visited > 1000) { throw new Error('Source identity scan exceeds 1000 entries'); }
			const file = directory + '/' + entry.name;
			if (entry.isSymbolicLink()) { throw new Error('Redirected physical source index'); }
			if (entry.isDirectory()) { if (depth >= 7) { throw new Error('Source identity scan exceeds directory depth'); } await walk(file, depth + 1); }
			else if (entry.name.endsWith('.mjs')) { files.push(file); }
		}
	}
	// Check the root before readdir, including the src directory itself.
	try { const info = await lstat(join(root, 'src')); if (info.isSymbolicLink() || !info.isDirectory()) { throw new Error('Redirected physical source directory'); } } catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) { throw error; } }
	await walk('src', 0);
	const index: StructuralSourceIndex = { version: 1, producer: 'typescript-' + ts.version, entries: [] };
	for (const file of files.sort()) {
		const source = await physicalImage(root, file); if (!source) { throw new Error('Source changed during identity scan'); }
		bytes += Buffer.byteLength(source.content); if (bytes > 8 * 1024 * 1024) { throw new Error('Source identity scan exceeds 8 MiB'); }
		const parsed = ts.createSourceFile(file, source.content, ts.ScriptTarget.ES2024, true, ts.ScriptKind.JS);
		const parser: StructuralSourceIndex['entries'][number]['parser'] = { exports: [], imports: [], diagnostics: [] };
		for (const statement of parsed.statements) {
			if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) { parser.imports.push(statement.moduleSpecifier.text); }
			if (ts.isExportAssignment(statement)) { parser.exports.push('default'); }
			if (ts.canHaveModifiers(statement) && ts.getModifiers(statement)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) { parser.exports.push(ts.getModifiers(statement)?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword) ? 'default' : statement.getText(parsed).slice(0, 128)); }
		}
		parser.diagnostics = (ts.transpileModule(source.content, { fileName: file, reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.ESNext, allowJs: true, checkJs: false } }).diagnostics ?? []).map(diagnostic => diagnostic.code);
		let identity: StructuralSourceIndex['entries'][number]['identity'], mapping: StructuralSourceIndex['entries'][number]['mapping'] = 'unowned';
		const markers = ['pure', 'interaction', 'state', 'messaging'].filter(kind => source.content.includes('// <ordito:' + kind + '-v1>'));
		if (markers.length) {
			mapping = 'partial';
			try {
				if (markers.length !== 1) { throw new Error('Ambiguous region kinds'); }
				const kind = markers[0] === 'pure' ? 'predicate' : markers[0] as 'interaction' | 'state' | 'messaging';
				const id = kind === 'predicate' ? readPredicateRegion(source.content).predicate.id : JSON.parse((kind === 'interaction' ? readInteractionRegion(source.content) : kind === 'state' ? readStateMachineRegion(source.content) : readMessagingRegion(source.content)).programText).targetId;
				if (typeof id !== 'string' || !id) { throw new Error('Missing source identity'); }
				identity = { kind, id }; mapping = 'owned-descriptor';
			} catch { /* A descriptor is a mapping claim, not a parser fact or inferred intent. */ }
		}
		index.entries.push({ file, hash: contentHash(source.content), mode: source.mode, ...(identity ? { identity } : {}), mapping, parser });
	}
	const path = join(await managed(root, 'structural'), 'source-index.json'), content = JSON.stringify(index, null, '\t');
	if (Buffer.byteLength(content) + 1 > 4 * 1024 * 1024) { throw new Error('Structural source index exceeds 4 MiB; narrow the job'); }
	let current: string | undefined;
	try { const info = await lstat(path); if (!info.isFile() || info.isSymbolicLink() || info.size > 4 * 1024 * 1024) { throw new Error('Invalid structural source index'); } current = await readFile(path, 'utf8'); } catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) { throw error; } }
	// Avoid cache rewrites on an aligned sync. Corrupt/stale caches are safely reconstructed.
	if (current !== content + '\n') { await atomicJson(path, index); }
	return index;
}
