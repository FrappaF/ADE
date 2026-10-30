/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'node:crypto';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, extname, join, relative, sep, posix } from 'node:path';
import { Language, Parser, type Node } from 'web-tree-sitter';
import { languageAdapters, type LanguageAdapter } from './languages.ts';
import { validateSemanticModel, type SemanticElement, type SemanticModel } from '../../src/vs/workbench/contrib/ade/common/semanticModel.ts';

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
	parentId: string;
	name: string;
	kind: 'component' | 'contract' | 'action';
	syntaxKind: string;
	/** Verbatim declaration header, not an inferred behavioral contract. */
	header: string;
	evidence: SourceEvidence;
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
	status: 'parsed' | 'partial' | 'unsupported' | 'unclassified' | 'excluded';
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
	/** Content manifest; neither a Git commit nor a runtime verification. */
	revision: string;
	excludedDirectories: string[];
	files: IndexedFile[];
	model: SemanticModel;
}

const require = createRequire(import.meta.url);
const adapterVersion = 'tree-sitter-syntax-v1:web-tree-sitter@0.27.1:grammars@0.1.17';
const loadedLanguages = new Map<string, Promise<Language>>();
let parserInitialization: Promise<void> | undefined;
const excludedDirectories = ['.git', '.ade', 'node_modules', 'vendor', 'dist', 'build', 'out', 'target', 'bin', 'obj', '__pycache__', '.venv', 'venv', '.next', '.build'];
const knownSourceExtensions = new Set(['.kt', '.kts', '.scala', '.sc', '.vb', '.sql', '.sh', '.bash', '.ps1', '.r', '.lua', '.ex', '.exs', '.vue', '.svelte', '.html', '.css', '.m', '.mm']);
const maxFileBytes = 2 * 1024 * 1024;
const maxEntries = 10000;

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
		const grammar = require.resolve(`@repomix/tree-sitter-wasms/out/tree-sitter-${adapter.grammar}.wasm`);
		let language = loadedLanguages.get(grammar);
		if (!language) { language = Language.load(grammar); loadedLanguages.set(grammar, language); }
		parser.setLanguage(await language);
		const tree = parser.parse(source);
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
						const body = node.type === 'variable_declarator' ? node.childForFieldName('value')?.childForFieldName('body') : node.childForFieldName('body');
						result.declarations.push({ id: elementId, parentId, name: name.text, kind, syntaxKind: node.type, header: source.slice(node.startIndex, body?.startIndex ?? node.endIndex).trim(), evidence: evidence(file, revision, node) });
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
function projectModel(projectId: string, name: string, files: IndexedFile[]): SemanticModel {
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
		const fileId = id(projectId, `file:${file.file}`);
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
	const errors = validateSemanticModel(model).filter(item => item.severity === 'error');
	if (errors.length) { throw new Error(`Invalid imported model: ${JSON.stringify(errors)}`); }
	return model;
}

/** Reads a bounded source inventory. Does not follow symlinks, execute builds, or write files. */
export async function importCode(root: string, projectId: string): Promise<CodeImport> {
	if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(projectId)) { throw new Error('Invalid project identifier'); }
	root = await realpath(root);
	const files: IndexedFile[] = [];
	let entries = 0;
	parserInitialization ??= Parser.init();
	await parserInitialization;
	const visit = async (directory: string): Promise<void> => {
		for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
			if (++entries > maxEntries) { throw new Error(`Source inventory exceeds ${maxEntries} entries`); }
			const path = join(directory, entry.name);
			const file = relative(root, path).split(sep).join('/');
			const empty = (status: IndexedFile['status'], diagnostics: ImportDiagnostic[] = []): IndexedFile => ({ file, status, declarations: [], syntaxKinds: {}, imports: [], diagnostics });
			if (entry.isSymbolicLink()) { files.push(empty('excluded', [{ code: 'symlink', file, count: 1 }])); }
			else if (entry.isDirectory()) {
				if (excludedDirectories.includes(entry.name)) { files.push(empty('excluded')); }
				else { await visit(path); }
			} else if (entry.isFile()) {
				const extension = extname(entry.name).toLowerCase();
				const adapter = languageAdapters.find(adapter => adapter.extensions.includes(extension));
				if (!adapter) {
					files.push(empty(knownSourceExtensions.has(extension) ? 'unsupported' : 'unclassified', knownSourceExtensions.has(extension) ? [{ code: 'unsupportedLanguage', file, count: 1 }] : []));
				} else if ((await stat(path)).size > maxFileBytes) {
					files.push(empty('unsupported', [{ code: 'fileTooLarge', file, count: 1 }]));
				} else {
					files.push(await parseFile(file, await readFile(path, 'utf8'), adapter, projectId));
				}
			}
		}
	};
	await visit(root);
	const revision = hash(JSON.stringify(files.map(file => [file.file, file.status, file.revision ?? ''])));
	return { version: 1, adapter: `${adapterVersion}:${hash(JSON.stringify(languageAdapters))}`, projectId, revision, excludedDirectories: [...excludedDirectories], files, model: projectModel(projectId, basename(root), files) };
}
