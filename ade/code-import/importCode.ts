/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { basename, extname, join, relative, sep, posix } from 'node:path';
import { Language, Parser } from 'web-tree-sitter';
import { parseLegacy, type SyntaxNode as Node } from './legacyParser.ts';
import { languageAdapters, type LanguageAdapter } from './languages.ts';
import { validateSemanticGraph, type SemanticGraph } from './semanticGraph.ts';
import { defaultScope, readSourceScope, directoryIgnores, excludedPath, type SourceScope, type IgnoreContext } from './sourceScope.ts';
import { applyRenameHints, type RenameHint } from './identity.ts';
import { validateSemanticModel } from '../../src/vs/workbench/contrib/ade/common/modelValidation.ts';
import { type SemanticElement, type SemanticModel } from '../../src/vs/workbench/contrib/ade/common/modelTypes.ts';

export interface SourceEvidence {
	file: string;
	revision: string;
	/** JavaScript string offsets (UTF-16), end exclusive; lines are one-based. */
	start: number;
	end: number;
	line: number;
	endLine: number;
}

export interface CodeDeclaration {
	id: string;
	/** Deterministic ID at the current source location, before identity preservation. */
	sourceId?: string;
	parentId: string;
	name: string;
	kind: 'component' | 'contract' | 'action';
	syntaxKind: string;
	/** Verbatim header (or full type contract), not an inferred behavioral contract. */
	header: string;
	evidence: SourceEvidence;
	nameEvidence?: SourceEvidence;
}

export interface ImportDiagnostic {
	code: 'syntaxError' | 'unresolvedConstruct' | 'unnamedDeclaration' | 'duplicateName' | 'unsupportedLanguage' | 'fileTooLarge' | 'symlink';
	file: string;
	syntaxKind?: string;
	count: number;
	evidence?: SourceEvidence;
}

export interface IndexedFile {
	file: string;
	moduleId?: string;
	status: 'parsed' | 'partial' | 'unsupported' | 'unclassified' | 'excluded' | 'configuration';
	language?: string;
	revision?: string;
	declarations: CodeDeclaration[];
	/** Counts for every visited named syntax kind, including kinds not projected into M1. */
	syntaxKinds: Record<string, number>;
	/** Syntactic imports only. Targets are deliberately unresolved. */
	imports: { text: string; evidence: SourceEvidence }[];
	diagnostics: ImportDiagnostic[];
}

export interface CodeImport {
	version: 1;
	adapter: string;
	projectId: string;
	sourceRoot: string;
	/** Content manifest; neither a Git commit nor a runtime verification. */
	revision: string;
	excludedDirectories: string[];
	scope?: SourceScope;
	files: IndexedFile[];
	model: SemanticModel;
	semantic?: SemanticGraph;
	analysis: { parsed: string[]; reused: string[]; renamed: { from: string; to: string }[]; ambiguousRenames: { from: string[]; to: string[] }[]; semanticInvalidated?: boolean; symbolRenames?: { fromId: string; toSourceId: string; fromName: string; toName: string; fromFile: string; toFile: string }[]; semanticWork?: { analyzed: string[]; reused: string[] }; compilerDiagnostics?: string[]; syntaxOnly?: boolean };
}

export interface ImportOptions {
	previous?: CodeImport;
	signal?: AbortSignal;
	scope?: SourceScope;
	renameHints?: RenameHint[];
}

const require = createRequire(import.meta.url);
const adapterVersion = 'tree-sitter-syntax-v4:web-tree-sitter@0.27.1:grammars@0.1.17';
const loadedLanguages = new Map<string, Promise<Language>>();
let parserInitialization: Promise<void> | undefined;
const knownSourceExtensions = new Set(['.kt', '.kts', '.scala', '.sc', '.vb', '.sql', '.sh', '.bash', '.ps1', '.r', '.lua', '.ex', '.exs', '.vue', '.svelte', '.html', '.css', '.m', '.mm']);
const maxFileBytes = 2 * 1024 * 1024;
const maxEntries = 100000;

/** Configuration consumed by common indexers participates in semantic invalidation. */
function isConfiguration(name: string): boolean {
	return name === '.gitignore' || name === '.adeignore' || /^(?:package(?:-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|(?:tsconfig|jsconfig)(?:\.[^.]+)*\.json|pyrightconfig\.json|pyproject\.toml|Pipfile(?:\.lock)?|requirements(?:[-.][^.]+)?\.txt|poetry\.lock|uv\.lock|go\.(?:mod|sum)|Cargo\.(?:toml|lock)|pom\.xml|build\.gradle(?:\.kts)?|settings\.gradle(?:\.kts)?|gradle\.properties|Gemfile(?:\.lock)?|composer\.(?:json|lock)|Package\.(?:swift|resolved)|pubspec\.(?:yaml|lock)|CMakeLists\.txt|compile_commands\.json|.*\.(?:csproj|fsproj|sln|props|targets))$/.test(name);
}

/** Namespaced hashes avoid unstable offsets and platform-specific absolute paths. */
function hash(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function id(projectId: string, value: string): string { return `code:${hash(`${projectId}:${value}`)}`; }

/** Builds source evidence before disposing the native tree. */
function evidence(file: string, revision: string, node: Node): SourceEvidence {
	return { file, revision, start: node.startIndex, end: node.endIndex, line: node.startPosition.row + 1, endLine: node.endPosition.row + 1 };
}

/** Declarator wrappers are language-specific; never use an arbitrary descendant identifier. */
function declarationName(node: Node, adapter: LanguageAdapter): Node | null {
	let current: Node | null = node;
	if (adapter.id === 'kotlin') { return node.namedChildren.find(child => ['type_identifier', 'simple_identifier'].includes(child.type)) ?? null; }
	if (adapter.id === 'dart' && node.type === 'method_signature') {
		current = node.namedChildren.find(child => child.type === 'function_signature') ?? null;
	}
	if (adapter.id === 'rust' && node.type === 'impl_item') {
		return node.childForFieldName('type');
	}
	if ((adapter.id === 'c' || adapter.id === 'cpp') && node.type === 'function_definition') {
		current = node.childForFieldName('declarator');
		while (current?.childForFieldName('declarator')) { current = current.childForFieldName('declarator'); }
		return current;
	}
	return current?.childForFieldName('name') ?? null;
}

/** Extracts declarations and unresolved syntax, without resolving calls by textual name. */
async function parseFile(file: string, source: string, adapter: LanguageAdapter, projectId: string): Promise<IndexedFile> {
	const revision = hash(source);
	const result: IndexedFile = { file, status: 'parsed', language: adapter.id, revision, declarations: [], syntaxKinds: {}, imports: [], diagnostics: [] };
	const parser = new Parser();
	try {
		const bundled = fileURLToPath(new URL(`./grammars/tree-sitter-${adapter.grammar}.wasm`, import.meta.url));
		const grammar = existsSync(bundled) ? bundled : require.resolve(`${adapter.grammarPackage ?? '@repomix/tree-sitter-wasms'}/out/tree-sitter-${adapter.grammar}.wasm`);
		let tree: { rootNode: Node; delete(): void } | null;
		if (adapter.grammarPackage === 'tree-sitter-wasms') { tree = await parseLegacy(grammar, source); }
		else {
			let language = loadedLanguages.get(grammar);
			if (!language) { language = Language.load(grammar); loadedLanguages.set(grammar, language); }
			parser.setLanguage(await language);
			tree = parser.parse(source);
		}
		if (!tree) { throw new Error(`Parser did not produce a tree: ${file}`); }
		try {
			if (tree.rootNode.hasError) { result.status = 'partial'; }
			const counts = new Map<string, ImportDiagnostic>();
			const syntaxKinds = new Map<string, number>();
			const report = (code: ImportDiagnostic['code'], node: Node) => {
				const key = `${code}:${node.type}`;
				const previous = counts.get(key);
				if (previous) { previous.count++; }
				else { counts.set(key, { code, file, syntaxKind: node.type, count: 1, evidence: evidence(file, revision, node) }); }
			};
			const names = new Map<string, number>();
			const pending = [{ node: tree.rootNode, parentId: id(projectId, `file:${file}`), project: true }];
			while (pending.length) {
				const { node, parentId, project } = pending.pop()!;
				syntaxKinds.set(node.type, (syntaxKinds.get(node.type) ?? 0) + 1);
				if (node.isError || node.isMissing) { report('syntaxError', node); continue; }
				if (adapter.unsupported.includes(node.type)) { report('unresolvedConstruct', node); }
				if (adapter.imports.includes(node.type) && !(node.type === 'export_statement' && !node.childForFieldName('source'))) {
					result.imports.push({ text: node.text, evidence: evidence(file, revision, node) });
				}
				let kind: CodeDeclaration['kind'] | undefined = !project ? undefined : adapter.containers.includes(node.type) ? 'component' : adapter.contracts.includes(node.type) ? 'contract' : adapter.callables.includes(node.type) ? 'action' : undefined;
				// Arrow functions have a declared binding; other local variables are not actions.
				if (project && ['javascript', 'typescript', 'tsx'].includes(adapter.id) && node.type === 'variable_declarator' && ['arrow_function', 'function_expression'].includes(node.childForFieldName('value')?.type ?? '')) { kind = 'action'; }
				let childParentId = parentId;
				if (kind) {
					const name = declarationName(node, adapter);
					if (!name || name.hasError || (kind === 'contract' && node.hasError) || name.type === 'computed_property_name' || name.type === 'object_pattern' || name.type === 'array_pattern') {
						report('unnamedDeclaration', node);
					} else {
						const key = `${parentId}:${node.type}:${name.text}`;
						const ordinal = names.get(key) ?? 0;
						names.set(key, ordinal + 1);
						if (ordinal) { report('duplicateName', node); }
						const elementId = id(projectId, `${key}:${ordinal}`);
						const body = kind === 'contract' ? undefined : node.type === 'variable_declarator' ? node.childForFieldName('value')?.childForFieldName('body') : node.childForFieldName('body');
						result.declarations.push({ id: elementId, parentId, name: name.text, kind, syntaxKind: node.type, header: source.slice(node.startIndex, body?.startIndex ?? node.endIndex).trim(), evidence: evidence(file, revision, node), nameEvidence: evidence(file, revision, name) });
						if (kind !== 'contract') { childParentId = elementId; }
					}
				}
				// Contracts remain leaves in M1; their members are counted, not projected as actions.
				const projectChildren = project && kind !== 'contract' && !(adapter.id === 'dart' && node.type === 'method_signature');
				for (const child of node.namedChildren.reverse()) { pending.push({ node: child, parentId: childParentId, project: projectChildren }); }
			}
			result.syntaxKinds = Object.fromEntries(syntaxKinds);
			result.diagnostics = [...counts.values()];
		} finally { tree.delete(); }
	} finally { parser.delete(); }
	return result;
}

/** Projects only extracted facts into M1/M3. No features or invocation edges are invented. */
export function projectModel(projectId: string, name: string, files: IndexedFile[], semantic?: SemanticGraph): SemanticModel {
	const model: SemanticModel = { version: 3, id: projectId, name, semantics: { elements: [], relations: [] }, views: [], codeMappings: [], verifications: [] };
	const folders = new Map<string, string>();
	const addFolder = (directory: string): string | undefined => {
		if (directory === '.') { return undefined; }
		const existing = folders.get(directory);
		if (existing) { return existing; }
		const folderId = id(projectId, `directory:${directory}`);
		const parentId = addFolder(posix.dirname(directory));
		folders.set(directory, folderId);
		model.semantics.elements.push({ id: folderId, kind: 'component', name: posix.basename(directory), ...(parentId ? { parentId } : {}) });
		return folderId;
	};
	for (const file of files.filter(file => file.status === 'parsed' || file.status === 'partial')) {
		const fileId = file.moduleId ?? id(projectId, `file:${file.file}`);
		const parentId = addFolder(posix.dirname(file.file));
		model.semantics.elements.push({ id: fileId, kind: 'component', name: posix.basename(file.file), ...(parentId ? { parentId } : {}) });
		model.codeMappings.push({ id: fileId, elementId: fileId, file: file.file, symbol: '<module>', revision: file.revision! });
		for (const declaration of file.declarations) {
			const element: SemanticElement = { id: declaration.id, parentId: declaration.parentId, name: declaration.name, kind: declaration.kind };
			model.semantics.elements.push(element);
			model.codeMappings.push({ id: declaration.id, elementId: declaration.id, file: file.file, symbol: `${declaration.syntaxKind}:${declaration.name}`, revision: file.revision! });
		}
		const nodes = [fileId, ...file.declarations.map(item => item.id)].map((elementId, index) => ({ elementId, x: 40 + (index % 4) * 260, y: 40 + Math.floor(index / 4) * 140 }));
		model.views.push({ id: fileId, name: file.file, kind: 'structure', nodes, relationIds: [] });
	}
	if (semantic) {
		const names = new Map(model.semantics.elements.map(element => [element.id, element.name]));
		model.semantics.relations = semantic.dependencies.map(edge => ({ id: edge.id, kind: 'dependency', from: edge.from, to: edge.to, name: names.get(edge.to)! }));
		const endpoints = [...new Set(semantic.dependencies.flatMap(edge => [edge.from, edge.to]))];
		if (endpoints.length) { model.views.push({ id: 'code-semantic-dependencies', name: 'Code Dependencies', kind: 'structure', nodes: endpoints.map((elementId, index) => ({ elementId, x: 40 + (index % 4) * 260, y: 40 + Math.floor(index / 4) * 140 })), relationIds: model.semantics.relations.map(relation => relation.id) }); }
	}
	const errors = validateSemanticModel(model).filter(item => item.severity === 'error');
	if (errors.length) { throw new Error(`Invalid imported model: ${JSON.stringify(errors)}`); }
	return model;
}

/** Rebinds source-derived keys while retaining stable IDs at an unchanged location. */
function preserveIdentity(projectId: string, file: IndexedFile, reserved: Set<string>, generation: string, previous?: IndexedFile): void {
	const freshId = (sourceId: string): string => {
		let next = sourceId;
		for (let attempt = 0; reserved.has(next); attempt++) { next = id(projectId, `added:${generation}:${sourceId}:${attempt}`); }
		reserved.add(next);
		return next;
	};
	const moduleSourceId = id(projectId, `file:${file.file}`);
	file.moduleId = previous ? previous.moduleId ?? moduleSourceId : freshId(moduleSourceId);
	const ids = new Map<string, string>([[moduleSourceId, file.moduleId]]);
	const previousIds = new Map(previous?.declarations.map(item => [item.sourceId ?? item.id, item.id]));
	for (const declaration of file.declarations) {
		declaration.sourceId = declaration.id;
		declaration.id = previousIds.get(declaration.sourceId) ?? freshId(declaration.id);
		ids.set(declaration.sourceId, declaration.id);
		declaration.parentId = ids.get(declaration.parentId) ?? declaration.parentId;
	}
}

/** Reuses an exact, unique content move without parsing it or guessing renamed symbols. */
function relocateFile(projectId: string, previous: IndexedFile, path: string): IndexedFile {
	const file = structuredClone(previous);
	file.file = path;
	file.moduleId ??= id(projectId, `file:${previous.file}`);
	const sourceIds = new Map([[file.moduleId, id(projectId, `file:${path}`)]]);
	const names = new Map<string, number>();
	for (const declaration of file.declarations) {
		const parent = sourceIds.get(declaration.parentId);
		if (!parent) { throw new Error('Invalid declaration order or parent in import state'); }
		const key = `${parent}:${declaration.syntaxKind}:${declaration.name}`;
		const ordinal = names.get(key) ?? 0;
		names.set(key, ordinal + 1);
		declaration.sourceId = id(projectId, `${key}:${ordinal}`);
		sourceIds.set(declaration.id, declaration.sourceId);
	}
	for (const item of [...file.declarations, ...file.imports, ...file.diagnostics]) {
		if (item.evidence) { item.evidence.file = path; }
	}
	for (const declaration of file.declarations) { if (declaration.nameEvidence) { declaration.nameEvidence.file = path; } }
	for (const diagnostic of file.diagnostics) { diagnostic.file = path; }
	return file;
}

/** Checks the baseline projection before any cached facts can be consumed. */
export function validateProjection(snapshot: CodeImport): void {
	const manifest = snapshot.files.map(file => [file.file, file.status, file.revision ?? '']);
	const revision = hash(JSON.stringify(snapshot.scope ? { scope: snapshot.scope, files: manifest } : manifest));
	if (revision !== snapshot.revision) { throw new Error('Import state has an inconsistent source manifest'); }
	for (const file of snapshot.files.filter(file => file.declarations.length)) {
		const expected = relocateFile(snapshot.projectId, file, file.file);
		if (expected.declarations.some((item, index) => item.sourceId !== file.declarations[index].sourceId)) { throw new Error('Import state has inconsistent source identities'); }
	}
	if (snapshot.semantic) { validateSemanticGraph(snapshot.semantic, snapshot.files, snapshot.revision, snapshot.projectId); }
	if (!isDeepStrictEqual(projectModel(snapshot.projectId, snapshot.model.name, snapshot.files, snapshot.semantic), snapshot.model)) {
		throw new Error('Import state does not match its generated model');
	}
}

/** Reads a bounded source inventory. Does not follow symlinks, execute builds, or write files. */
export async function importCode(root: string, projectId: string, options: ImportOptions = {}): Promise<CodeImport> {
	if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(projectId)) { throw new Error('Invalid project identifier'); }
	root = await realpath(root);
	const adapter = `${adapterVersion}:${hash(JSON.stringify(languageAdapters))}`;
	const previous = options.previous;
	const scope = readSourceScope(options.scope ?? previous?.scope ?? defaultScope);
	if (previous && (previous.projectId !== projectId || previous.sourceRoot !== root)) { throw new Error('Import state belongs to a different source root or project'); }
	if (previous) { validateProjection(previous); }
	const cacheCompatible = previous?.adapter === adapter && isDeepStrictEqual(previous.scope ?? defaultScope, scope);
	const cachedFiles = new Map(cacheCompatible ? previous.files.map(file => [file.file, file]) : []);
	const reserved = new Set(previous?.model.semantics.elements.map(element => element.id));
	const previousFiles = new Map(previous?.files.map(file => [file.file, file]));
	const contentGroups = new Map<string, IndexedFile[]>();
	if (cacheCompatible) {
		for (const file of previous.files.filter(file => file.status === 'parsed')) {
			const key = `${file.language}:${file.revision}`;
			contentGroups.set(key, [...(contentGroups.get(key) ?? []), file]);
		}
	}
	const relocationCandidates = new Map<string, IndexedFile>();
	const analysis: CodeImport['analysis'] = { parsed: [], reused: [], renamed: [], ambiguousRenames: [] };
	const files: IndexedFile[] = [];
	let entries = 0;
	parserInitialization ??= Parser.init();
	await parserInitialization;
	const visit = async (directory: string, inherited: IgnoreContext[] = []): Promise<void> => {
		const contexts = await directoryIgnores(directory, relative(root, directory).split(sep).join('/'), scope, inherited);
		for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
			options.signal?.throwIfAborted();
			if (++entries > maxEntries) { throw new Error(`Source inventory exceeds ${maxEntries} entries. Narrow the import with .adeignore or the source scope exclusions.`); }
			const path = join(directory, entry.name);
			const file = relative(root, path).split(sep).join('/');
			const empty = (status: IndexedFile['status'], diagnostics: ImportDiagnostic[] = []): IndexedFile => ({ file, status, declarations: [], syntaxKinds: {}, imports: [], diagnostics });
			if (entry.name === '.ade') { continue; }
			if (entry.isSymbolicLink()) { files.push(empty('excluded', [{ code: 'symlink', file, count: 1 }])); }
			else if (entry.name === '.git' || (!isConfiguration(entry.name) && excludedPath(file, entry.isDirectory(), scope, contexts))) { files.push(empty('excluded')); }
			else if (entry.isDirectory()) {
				if (scope.excludedDirectories.includes(entry.name)) { files.push(empty('excluded')); }
				else { await visit(path, contexts); }
			} else if (entry.isFile()) {
				const extension = extname(entry.name).toLowerCase();
				const override = scope.languageOverrides[extension];
				const adapter = languageAdapters.find(adapter => override ? adapter.id === override : adapter.extensions.includes(extension));
				if (isConfiguration(entry.name)) {
					if ((await stat(path)).size > maxFileBytes) { throw new Error(`Configuration file exceeds 2 MiB: ${file}`); }
					files.push({ ...empty('configuration'), revision: hash(await readFile(path, 'utf8')) });
				} else if (!adapter) {
					files.push(empty(knownSourceExtensions.has(extension) ? 'unsupported' : 'unclassified', knownSourceExtensions.has(extension) ? [{ code: 'unsupportedLanguage', file, count: 1 }] : []));
				} else if ((await stat(path)).size > maxFileBytes) {
					files.push(empty('unsupported', [{ code: 'fileTooLarge', file, count: 1 }]));
				} else {
					const source = await readFile(path, 'utf8');
					const revision = hash(source);
					const cached = cachedFiles.get(file);
					const candidates = contentGroups.get(`${adapter.id}:${revision}`);
					if (cached?.revision === revision && cached.language === adapter.id) {
						files.push(structuredClone(cached));
						analysis.reused.push(file);
					} else if (!previousFiles.has(file) && candidates?.length === 1) {
						const relocated = relocateFile(projectId, candidates[0], file);
						files.push(relocated);
						relocationCandidates.set(file, relocated);
					} else {
						const parsed = await parseFile(file, source, adapter, projectId);
						const oldFile = previousFiles.get(file);
						preserveIdentity(projectId, parsed, reserved, previous?.revision ?? '', oldFile?.language === adapter.id ? oldFile : undefined);
						files.push(parsed);
						analysis.parsed.push(file);
					}
				}
			}
		}
	};
	await visit(root);
	// A rename requires identical content and dialect, with one candidate in each entire snapshot.
	if (cacheCompatible) {
		const oldGroups = new Map<string, IndexedFile[]>();
		const newGroups = new Map<string, IndexedFile[]>();
		for (const [list, groups] of [[previous.files, oldGroups], [files, newGroups]] as const) {
			for (const file of list.filter(file => file.status === 'parsed')) {
				const key = `${file.language}:${file.revision}`;
				groups.set(key, [...(groups.get(key) ?? []), file]);
			}
		}
		const oldPaths = new Set(previous.files.map(file => file.file));
		const newPaths = new Set(files.map(file => file.file));
		for (const [key, group] of oldGroups) {
			const added = (newGroups.get(key) ?? []).filter(file => !oldPaths.has(file.file));
			const removed = group.filter(file => !newPaths.has(file.file));
			if (!added.length || !removed.length) { continue; }
			if (group.length === 1 && newGroups.get(key)?.length === 1) {
				const oldFile = removed[0];
				const newFile = added[0];
				files[files.indexOf(newFile)] = relocateFile(projectId, oldFile, newFile.file);
				analysis.renamed.push({ from: oldFile.file, to: newFile.file });
					relocationCandidates.delete(newFile.file);
			} else { analysis.ambiguousRenames.push({ from: removed.map(file => file.file), to: added.map(file => file.file) }); }
		}
	}
	// Copies and non-unique content matches receive new identities instead of borrowing the original.
	for (const [path, candidate] of relocationCandidates) {
		const source = await readFile(join(root, path), 'utf8');
		if (hash(source) !== candidate.revision) { throw new Error(`Source changed during import: ${path}`); }
		const parsed = await parseFile(path, source, languageAdapters.find(adapter => adapter.id === candidate.language)!, projectId);
		preserveIdentity(projectId, parsed, reserved, previous?.revision ?? '');
		files[files.indexOf(candidate)] = parsed;
		analysis.parsed.push(path);
	}
	options.signal?.throwIfAborted();
	if (options.renameHints?.length) {
		if (!previous) { throw new Error('Rename hints require an import baseline'); }
		applyRenameHints(previous, files, analysis, options.renameHints);
	}
	const revision = hash(JSON.stringify({ scope, files: files.map(file => [file.file, file.status, file.revision ?? '']) }));
	const semantic = previous?.semantic && cacheCompatible && previous.revision === revision ? structuredClone(previous.semantic) : undefined;
	if (previous?.semantic && !semantic) { analysis.semanticInvalidated = true; }
	return { version: 1, adapter, projectId, sourceRoot: root, revision, scope, excludedDirectories: [...scope.excludedDirectories], files, model: projectModel(projectId, basename(root), files, semantic), analysis, ...(semantic ? { semantic } : {}) };
}
