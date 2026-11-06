/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** JSON-only boundary between the sandboxed workbench and the analysis utility process. */
export const adeCodeChannel = 'adeCode';
/** Increment when the workbench requires a new engine request or response contract. */
export const adeCodeProtocolVersion = 2;
export interface CodeBridgeProtocol { version: number; operations: string[] }
export interface CliExecutableRequest { executable: string; path?: string; pathExt?: string }
export interface CliRuntimeEnvironment { path?: string; pathExt?: string; codexHome?: string }
export interface CliAccountRequest extends CliExecutableRequest { provider: 'codex' | 'claude'; codexHome?: string }
export interface CliAccountState { status: 'signedIn' | 'signedOut' | 'unavailable' | 'error'; executable?: string; reason?: 'notFound' | 'timeout' | 'failed' | 'unsupported' }
export interface CodeScope {
	include: string[]; exclude: string[]; excludedDirectories: string[];
	respectGitignore: boolean; languageOverrides: Record<string, string>;
}
export interface CodeRename { fromId: string; toSourceId: string }
export interface CodeResolution { path: string; choice: 'model' | 'code' }
export type CodeRequest =
	| { operation: 'collaboration'; request: string }
	| { operation: 'import'; root: string; scope?: CodeScope; syntaxOnly?: boolean; bundles?: string[] }
	| { operation: 'inspect' | 'preview' | 'history'; snapshot: string; scope?: CodeScope; renames?: CodeRename[]; resolutions?: CodeResolution[]; bundles?: string[] }
	| { operation: 'undoSync' | 'recoverSync'; snapshot: string; id: string }
	| { operation: 'apply'; token: string }
	| { operation: 'reconciliationPrepare'; token: string; config: string; sourceFiles: string[]; resolutions?: CodeResolution[]; clarification?: string }
	| { operation: 'reconciliationPropose'; token: string; reviewId: string }
	| { operation: 'diagramPrepare'; snapshot: string; config: string; resume?: string; clarification?: string }
	| { operation: 'diagramStep'; snapshot: string; id: string; reviewId: string }
	| { operation: 'restore'; snapshot: string; target: string }
	| { operation: 'source'; snapshot: string; file: string; revision: string; start: number; end: number };
export interface CodeEvidence { file: string; revision: string; start: number; end: number; line: number; endLine: number }
export interface CodeContext {
	snapshot: string; model: string; sourceRoot: string; revision: string; scope: CodeScope;
	files: { path: string; elementId?: string; language: string; status: string; diagnostics: string[] }[];
	declarations: { id: string; sourceId: string; name: string; kind: string; evidence: CodeEvidence }[];
	dependencies: { id: string; from: string; to: string; references: { source: CodeEvidence; target: CodeEvidence; provider: string }[] }[];
	providers: string[]; diagnostics: string[];
	diagramState?: 'index' | 'diagrams';
}
export interface CodeDiagramProgress { id: string; sourceRoot: string; reviewId: string; status: 'ready' | 'running' | 'questions' | 'failed' | 'complete'; completed: number; total: number; calls: number; symbols: number; files: number; model: string; questions: string[]; excluded: number; error?: string; context?: CodeContext }
export interface CodePreview {
	token: string; context: CodeContext;
	files: { added: string[]; changed: string[]; removed: string[]; unchanged: string[] };
	declarations: { added: string[]; changed: string[]; removed: string[] };
	dependencies: { added: string[]; changed: string[]; removed: string[] };
	conflicts: { code: string; path: string; base?: string; current?: string; incoming?: string; choices?: ('model' | 'code')[] }[];
	impact: { elementIds: string[]; viewIds: string[] };
	parsed: string[]; reused: string[]; semanticAnalyzed: string[]; semanticReused: string[];
	reconciliation?: { status: 'aligned' | 'pending' | 'conflict' | 'verificationFailed'; origin: 'model' | 'code' | 'both' | 'none'; commonRevision: string; sourceEdits: { file: string; beforeRevision: string; afterRevision: string }[]; diagnostics: string[] };
	ai?: { summary: string; questions: string[]; usage: { inputTokens: number | null; outputTokens: number | null }; cost: number | null; modelEdits: object[]; sourceEdits: object[]; bindings: object[]; cached?: boolean };
}
export interface CodeReconciliationContext { reviewId: string; contents: string; metrics: { inputBytes: number; schemaBytes: number; sourceBytes: number; disclosedBytes: number; estimatedTokens: number } }
export interface CodeSource { path: string; stale: boolean; startLine: number; startColumn: number; endLine: number; endColumn: number }
export interface CodeHistory { snapshots: { directory: string; revision: string }[]; operations?: { id: string; created: string; status: 'reconciling' | 'applied' | 'undoing' | 'undone' | 'rolledBack'; origin: string; fromRevision: string; toRevision: string; from: string; to: string }[] }
export type CodeResponse = CodeContext | CodePreview | CodeSource | CodeHistory | CodeReconciliationContext | CodeDiagramProgress;
export interface CodeEngine { execute(request: string, signal?: AbortSignal): Promise<string> }
