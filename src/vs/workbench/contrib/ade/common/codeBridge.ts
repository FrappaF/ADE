/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** JSON-only boundary between the sandboxed workbench and the analysis utility process. */
export const adeCodeChannel = 'adeCode';
/** Increment when the workbench requires a new engine request or response contract. */
export const adeCodeProtocolVersion = 9;
export interface CodeAiProgress { requestId: string; kind: 'connecting' | 'thinking' | 'waiting' | 'tool' | 'message'; itemId?: string; text?: string; tool?: string }
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
	| { operation: 'exploration'; snapshot: string; request: string }
	| { operation: 'diagramChat'; requestId?: string; root: string; snapshot?: string; sessionId?: string; config: string; messages: { role: 'user' | 'assistant'; text: string }[] }
	| { operation: 'import'; root: string; modelFile?: string; scope?: CodeScope; syntaxOnly?: boolean; bundles?: string[] }
	| { operation: 'inspect' | 'preview' | 'history'; snapshot: string; scope?: CodeScope; renames?: CodeRename[]; resolutions?: CodeResolution[]; bundles?: string[] }
	| { operation: 'undoSync' | 'recoverSync'; snapshot: string; id: string }
	| { operation: 'apply'; token: string }
	| { operation: 'reconciliationPrepare'; token: string; config: string; sourceFiles: string[]; resolutions?: CodeResolution[]; clarification?: string }
	| { operation: 'reconciliationPropose'; token: string; reviewId: string }
	| { operation: 'diagramPrepare'; snapshot: string; config: string; resume?: string; clarification?: string }
	| { operation: 'diagramStep' | 'diagramApprovePlan'; snapshot: string; id: string; reviewId: string }
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
export interface CodeDiagramProgress { id: string; sourceRoot: string; reviewId: string; status: 'ready' | 'running' | 'plan' | 'questions' | 'failed' | 'complete'; completed: number; total: number; calls: number; symbols: number; files: number; model: string; questions: string[]; excluded: number; inputBudgetBytes?: number; responseHeadroomBytes?: number; remainingRequests?: number; error?: string; phase?: 'analysis' | 'plan' | 'diagrams'; plan?: { key: string; name: string; kind: import('./semanticModel.js').ModelView['kind']; feature: string | null; intent: string; focus: string[]; status: 'pending' | 'running' | 'complete' }[]; context?: CodeContext }
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
export interface CodeEngine { execute(request: string, signal?: AbortSignal, progress?: (event: CodeAiProgress) => void): Promise<string> }

/** Compact product state; detailed receipts and proposals stay in the project journal. */
export interface CodeDiagramExploration {
	sessionId: string; model: string;
	workflow?: 'project';
	plan?: { revision: string; items: { id: string; name: string; viewKind: import('./modelTypes.js').ModelView['kind']; intent: string; rationale: string; parentId?: string; dependsOn: string[] }[] };
	batch?: { blockers: string[] };
	budgetStatus?: { exhausted: string[] };
	invalidation?: { evidenceIds: string[]; objectIds: string[]; viewIds: string[]; queryIds: string[] };
	budget: { maxToolCalls: number; maxReadBytes: number; maxDurationMs: number; maxModelTurns: number };
	usage: { toolCalls: number; readBytes: number; modelTurns: string[]; turnsObservable: boolean; inputTokens: null; outputTokens: null };
	tasks: { id: string; intent: string; status: string; gaps: string[]; proposalId?: string }[];
	proposals: { id: string; status: 'invalid' | 'ready' | 'applied'; diagnostics: { code: string; path: string; args: string[] }[]; views: import('./semanticModel.js').ModelView[] }[];
}
