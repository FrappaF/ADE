import { type AdeProjectService } from '../browser/adeProjectService.js';
import { type CancellationToken } from '../../../../base/common/cancellation.js';
import { type AdeDiagramReview } from '../browser/adeAiService.js';

export interface CliConfig {
	version: 1; provider: 'codex' | 'claude'; connection: 'cli'; model: string; executable: string;
	timeoutMs: number; maxContextBytes: number; maxCalls: number;
}

export interface PreparedReview { reviewId: string; request: { snapshot: string }; context: { sources: { file: string }[] } }

export interface Proposal { planId: string; usage?: { inputTokens: number | null; outputTokens: number | null }; plan: { summary: string; questions: { question: string; reason: string }[]; changes: { file: string; kind: string; reason: string }[]; steps: { description: string }[]; tests?: { description: string }[]; limitations?: string[] } }

export interface CollaborationSession {
	plan?: Proposal['plan']; planId?: string;
	id: string; root: string; worktree: string; reviewId: string; status: 'staged' | 'passed' | 'failed' | 'applied' | 'undone';
	generated: { summary: string; files: { file: string; content: string | null }[] };
	before: { file: string; content: string | null }[];
	verification?: { code: number; output: string; durationMs: number; outcome?: 'incomplete' | 'passed' | 'failed' | 'cancelled' };
	usage: { inputTokens: number | null; outputTokens: number | null }; cost: number | null;
}

export interface ModelRates { input: number; output: number; unit: string; source: string; asOf: string }

export interface ModelBenchmark {
	kind: string; recordedAt: string; defaultModel: string | null;
	models: { candidate: { config: CliConfig; rates?: ModelRates }; eligible: boolean; estimatedConsumption: number | null; cases: { repository?: string; language?: string; direction?: string; passed: boolean; durationMs: number; inputTokens: number | null; outputTokens: number | null }[] }[];
}

export type AdeAiProject = Pick<AdeProjectService, '_serviceBrand' | 'model' | 'save' | 'saveError' | 'projectRoot' | 'modelUri' | 'activeView' | 'onDidChange' | 'onDidSaveModel' | 'lastSavedChange' | 'acknowledgeCodeUpdate' | 'hasStructuralErrors' | 'revert' | 'editable' | 'error'>;

/** Shared execution boundary; each workflow owns its own session and disposables. */
export interface AdeAiWorkflow {
	busy: boolean;
	activityStatus: string | undefined;
	changed(): void;
	report(message: string): void;
	info(message: string): void;
	request<T>(request: { operation: string;[key: string]: unknown }, token?: CancellationToken): Promise<T>;
	run(task: (token: CancellationToken) => Promise<void>, options?: AdeAiRunOptions): Promise<void>;
	clearImplementation(): void;
	buildDiagrams(): Promise<void>;
	readonly reviewSession: Pick<CollaborationSession, 'status' | 'worktree'> | undefined;
}

/** Names the execution policy instead of positional boolean flags. */
export interface AdeAiRunOptions { kind?: 'ai' | 'diagram' | 'local'; interactive?: boolean; inline?: boolean; review?: AdeDiagramReview }
