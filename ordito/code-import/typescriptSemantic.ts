import ts from './typescriptRuntime.ts';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { CodeImport } from './importCode.ts';
import type { ScipBundle } from './scip.ts';
import { projectMetadataPath } from '../runtime/projectPaths.ts';

const compilerName = 'ordito-typescript-compiler';
const legacyCompilerName = 'ade-typescript-compiler';

export function isBuiltinCompiler(name: string): boolean {
	return name === compilerName || name === legacyCompilerName;
}

export interface CompilerDiagnostic { file: string; line: number; code: number; severity: 'error' | 'warning'; message: string }
interface CachedProject {
	builder?: ts.SemanticDiagnosticsBuilderProgram;
	sources: Map<string, { revision: string; file: ts.SourceFile }>;
	diagnostics: Map<string, readonly ts.Diagnostic[]>;
	documents: Map<string, { revision: string; document: NonNullable<ScipBundle['index']['documents']>[number] }>;
}
const projects = new Map<string, CachedProject>();
const hash = (value: string): string => createHash('sha256').update(value).digest('hex');

/** Built-in JS/TS analysis uses the compiler and its affected-file builder; project scripts/plugins are never loaded. */
export async function createTypeScriptBundle(state: CodeImport, signal?: AbortSignal, previous = state): Promise<{ bundle: ScipBundle; analyzed: string[]; reused: string[]; diagnostics: CompilerDiagnostic[] }> {
	signal?.throwIfAborted();
	const selected = state.files.filter(file => file.status === 'parsed' && ['javascript', 'typescript', 'tsx'].includes(file.language ?? ''));
	const known = new Map(state.files.filter(file => file.revision).map(file => [resolve(state.sourceRoot, file.file), file]));
	// The SCIP scheme and producer name are identities within saved semantic indexes.
	const legacy = previous.semantic?.providers.some(provider => provider.name === legacyCompilerName);
	const scheme = legacy ? 'ade-typescript' : 'ordito-typescript';
	const projectKey = `${state.sourceRoot}:${scheme}:${JSON.stringify(state.scope ?? {})}`;
	let cache = projects.get(projectKey);
	if (!cache) { cache = { sources: new Map(), diagnostics: new Map(), documents: new Map() }; projects.set(projectKey, cache); }
	while (projects.size > 3) { projects.delete(projects.keys().next().value!); }
	const configPath = join(state.sourceRoot, 'tsconfig.json');
	const config = existsSync(configPath) ? ts.readConfigFile(configPath, ts.sys.readFile) : { config: {} };
	const parsed = ts.parseJsonConfigFileContent(config.config ?? {}, { ...ts.sys, readFile: path => known.has(resolve(path)) ? ts.sys.readFile(path) : undefined, fileExists: path => known.has(resolve(path)), readDirectory: () => selected.map(file => join(state.sourceRoot, file.file)) }, state.sourceRoot);
	const options: ts.CompilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, allowJs: true, types: [], ...parsed.options, noEmit: true, skipLibCheck: true, incremental: true, tsBuildInfoFile: await projectMetadataPath(state.sourceRoot, 'compiler.tsbuildinfo') };
	const host = ts.createCompilerHost(options);
	const bundledLib = fileURLToPath(new URL('./typescript/lib.d.ts', import.meta.url));
	const lib = existsSync(bundledLib) ? dirname(bundledLib) : dirname(ts.getDefaultLibFilePath(options));
	host.getDefaultLibLocation = () => lib;
	host.getDefaultLibFileName = opts => join(lib, ts.getDefaultLibFileName(opts));
	host.getCurrentDirectory = () => state.sourceRoot;
	const read = host.readFile;
	host.readFile = path => {
		const absolute = resolve(path);
		return known.has(absolute) || absolute.startsWith(lib + sep) || /[\\/]node_modules[\\/].*\.d\.[cm]?ts$/.test(absolute) || /[\\/]node_modules[\\/].*package\.json$/.test(absolute) ? read(path) : undefined;
	};
	host.getSourceFile = (fileName, languageVersion) => {
		const text = host.readFile(fileName);
		if (text === undefined) { return undefined; }
		const key = resolve(fileName);
		const revision = hash(text + JSON.stringify(languageVersion));
		const old = cache!.sources.get(key);
		if (old?.revision === revision) { return old.file; }
		const file = Object.assign(ts.createSourceFile(fileName, text, languageVersion, true), { version: revision });
		cache!.sources.set(key, { revision, file });
		return file;
	};
	const builder = ts.createSemanticDiagnosticsBuilderProgram(selected.map(file => join(state.sourceRoot, file.file)), options, host, cache.builder);
	cache.builder = builder;
	const affected = new Set<string>();
	let work: ts.AffectedFileResult<readonly ts.Diagnostic[]>;
	const errors: ts.Diagnostic[] = [...(config.error ? [config.error] : []), ...parsed.errors.filter(error => error.code !== 18003)];
	while ((work = builder.getSemanticDiagnosticsOfNextAffectedFile())) {
		signal?.throwIfAborted();
		if ('fileName' in work.affected) { cache.diagnostics.set(resolve(work.affected.fileName), work.result); }
		if ('fileName' in work.affected) { affected.add(resolve(work.affected.fileName)); }
		else { for (const file of selected) { affected.add(join(state.sourceRoot, file.file)); } }
	}
	const program = builder.getProgram();
	errors.push(...program.getOptionsDiagnostics(), ...program.getGlobalDiagnostics());
	for (const [path, diagnostics] of cache.diagnostics) { if (known.has(path)) { errors.push(...diagnostics); } }
	const checker = program.getTypeChecker();
	const nameIds = new Map<string, string>();
	for (const file of state.files) {
		for (const declaration of file.declarations) { if (declaration.nameEvidence) { nameIds.set(`${resolve(state.sourceRoot, file.file)}:${declaration.nameEvidence.start}:${declaration.nameEvidence.end}`, declaration.sourceId ?? declaration.id); } }
	}
	const symbolId = (symbol: ts.Symbol): string => {
		const declarations = symbol.declarations ?? [];
		const represented = declarations.flatMap(declaration => {
			const name = ts.getNameOfDeclaration(declaration);
			const key = name ? nameIds.get(`${resolve(declaration.getSourceFile().fileName)}:${name.getStart()}:${name.getEnd()}`) : undefined;
			return key ? [key] : [];
		}).sort();
		const first = declarations[0];
		const key = represented.length ? represented.join(':') : first ? `${first.getSourceFile().fileName}:${first.getStart()}:${symbol.name}` : symbol.name;
		return `${scheme} . . . \`${key.replaceAll('`', '``')}\`.`;
	};
	const documents: NonNullable<ScipBundle['index']['documents']> = [];
	const analyzed: string[] = [];
	const reused: string[] = [];
	for (const file of selected) {
		signal?.throwIfAborted();
		const path = join(state.sourceRoot, file.file);
		const old = cache.documents.get(path);
		if (old && !affected.has(path) && old.revision === file.revision) { documents.push(structuredClone(old.document)); reused.push(file.file); continue; }
		const source = program.getSourceFile(path);
		if (!source) { continue; }
		const occurrences: NonNullable<NonNullable<ScipBundle['index']['documents']>[number]['occurrences']> = [];
		const visit = (node: ts.Node): void => {
			if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) {
				let symbol = checker.getSymbolAtLocation(node);
				if (symbol && symbol.flags & ts.SymbolFlags.Alias) { symbol = checker.getAliasedSymbol(symbol); }
				if (symbol) {
					const start = source.getLineAndCharacterOfPosition(node.getStart());
					const end = source.getLineAndCharacterOfPosition(node.getEnd());
					const definition = symbol.declarations?.some(declaration => ts.getNameOfDeclaration(declaration) === node) ?? false;
					occurrences.push({ range: [start.line, start.character, end.line, end.character], symbol: symbolId(symbol), symbol_roles: definition ? 1 : 0 });
				}
			}
			ts.forEachChild(node, visit);
		};
		visit(source);
		const document = { relative_path: file.file, position_encoding: 2, occurrences };
		documents.push(document); analyzed.push(file.file); cache.documents.set(path, { revision: file.revision!, document });
	}
	const diagnostics = errors.filter(error => !error.file || known.has(resolve(error.file.fileName))).map(error => ({ file: error.file ? relative(state.sourceRoot, error.file.fileName).replaceAll('\\', '/') : 'tsconfig.json', line: error.file ? error.file.getLineAndCharacterOfPosition(error.start ?? 0).line + 1 : 1, code: error.code, severity: error.category === ts.DiagnosticCategory.Error ? 'error' as const : 'warning' as const, message: ts.flattenDiagnosticMessageText(error.messageText, '\n') }));
	return { bundle: { version: 1, sourceRoot: state.sourceRoot, sourceRevision: state.revision, index: { metadata: { project_root: pathToFileURL(state.sourceRoot).href, tool_info: { name: legacy ? legacyCompilerName : compilerName, version: ts.version }, text_document_encoding: 1 }, documents } }, analyzed, reused, diagnostics };
}
