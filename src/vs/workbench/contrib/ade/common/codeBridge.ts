/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** JSON-only boundary between the sandboxed workbench and the analysis utility process. */
export const adeCodeChannel = 'adeCode';
export interface CliExecutableRequest { executable: string; path?: string; pathExt?: string }
export interface CliRuntimeEnvironment { path?: string; pathExt?: string; codexHome?: string }
export interface CliAccountRequest extends CliExecutableRequest { provider: 'codex' | 'claude'; codexHome?: string }
export interface CliAccountState { status: 'signedIn' | 'signedOut' | 'unavailable' | 'error'; executable?: string; reason?: 'notFound' | 'timeout' | 'failed' | 'unsupported' }
export interface CodeScope {
	include: string[]; exclude: string[]; excludedDirectories: string[];
	respectGitignore: boolean; languageOverrides: Record<string, string>;
}
export interface CodeRename { fromId: string; toSourceId: string }
export type CodeRequest =
	| { operation: 'collaboration'; request: string }
	| { operation: 'import'; root: string; scope?: CodeScope; syntaxOnly?: boolean; bundles?: string[] }
	| { operation: 'inspect' | 'preview' | 'history'; snapshot: string; scope?: CodeScope; renames?: CodeRename[]; bundles?: string[] }
	| { operation: 'apply'; token: string }
	| { operation: 'restore'; snapshot: string; target: string }
	| { operation: 'source'; snapshot: string; file: string; revision: string; start: number; end: number };
export interface CodeEvidence { file: string; revision: string; start: number; end: number; line: number; endLine: number }
export interface CodeContext {
	snapshot: string; model: string; sourceRoot: string; revision: string; scope: CodeScope;
	files: { path: string; elementId?: string; language: string; status: string; diagnostics: string[] }[];
	declarations: { id: string; sourceId: string; name: string; kind: string; evidence: CodeEvidence }[];
	dependencies: { id: string; from: string; to: string; references: { source: CodeEvidence; target: CodeEvidence; provider: string }[] }[];
	providers: string[]; diagnostics: string[];
}
export interface CodePreview {
	token: string; context: CodeContext;
	files: { added: string[]; changed: string[]; removed: string[]; unchanged: string[] };
	declarations: { added: string[]; changed: string[]; removed: string[] };
	dependencies: { added: string[]; changed: string[]; removed: string[] };
	conflicts: { code: string; path: string }[];
	impact: { elementIds: string[]; viewIds: string[] };
	parsed: string[]; reused: string[]; semanticAnalyzed: string[]; semanticReused: string[];
}
export interface CodeSource { path: string; stale: boolean; startLine: number; startColumn: number; endLine: number; endColumn: number }
export interface CodeHistory { snapshots: { directory: string; revision: string }[] }
export type CodeResponse = CodeContext | CodePreview | CodeSource | CodeHistory;
export interface CodeEngine { execute(request: string, signal?: AbortSignal): Promise<string> }
