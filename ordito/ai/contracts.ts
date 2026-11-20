import { Ajv2020 } from 'ajv/dist/2020.js';
import { array, object, text } from '../runtime/schemas.ts';
import type { CodeDeclaration, ImportDiagnostic } from '../code-import/importCode.ts';
import type { SemanticGraph } from '../code-import/semanticGraph.ts';
import { type SemanticElement, type SemanticRelation, type CodeMapping } from '../../src/vs/workbench/contrib/ordito/common/modelTypes.ts';

export interface ProviderConfig {
	version: 1;
	provider: 'codex' | 'claude';
	connection: 'cli';
	model: string;
	executable: string;
	timeoutMs: number;
	maxContextBytes: number;
	/** Per-workflow CLI invocation budget; provider-internal retries are owned by the original CLI. */
	maxCalls: number;
}

export interface ImplementationRequest {
	version: 1;
	snapshot: string;
	featureId: string;
	intent: string;
	constraints: string[];
	/** Only these explicit source files may be disclosed; no automatic repository upload. */
	sourceFiles: string[];
}

export interface FeatureContext {
	version: 1;
	projectId: string;
	sourceRevision: string;
	modelRevision: string;
	featureId: string;
	intent: string;
	constraints: string[];
	elements: SemanticElement[];
	relations: SemanticRelation[];
	mappings: CodeMapping[];
	impact: { elementIds: string[]; viewIds: string[] };
	semantic: Pick<SemanticGraph, 'providers' | 'dependencies' | 'diagnostics'>;
	sources: { file: string; revision: string; language: string; status: string; content: string; declarations: CodeDeclaration[]; diagnostics: ImportDiagnostic[] }[];
}

export interface ImplementationPlan {
	summary: string;
	steps: { id: string; description: string; elementIds: string[]; sourceFiles: string[] }[];
	questions: { question: string; reason: string }[];
	changes: { file: string; kind: 'create' | 'modify' | 'delete'; reason: string; elementIds: string[] }[];
	tests: { description: string; elementId: string; criterionId: string }[];
	limitations: string[];
}

export interface PlanResult {
	plan: ImplementationPlan;
	usage: { inputTokens: number | null; outputTokens: number | null };
}

/** All providers return proposals, never execution or verification outcomes. */
export interface PlanProvider {
	propose(config: ProviderConfig, context: FeatureContext, signal?: AbortSignal): Promise<PlanResult>;
}

export interface StructuredProvider {
	complete(config: ProviderConfig, prompt: string, schema: object, signal?: AbortSignal): Promise<{ value: unknown; usage: PlanResult['usage']; cost: number | null }>;
}

const boundedText = { ...text, maxLength: 8000 };
const strings = { ...array(boundedText), maxItems: 50 };
const boundedInteger = (minimum: number, maximum: number) => ({ type: 'integer', minimum, maximum });
const ajv = new Ajv2020({ allErrors: true });
const validConfig = ajv.compile<ProviderConfig>(object({
	version: { const: 1 }, provider: { enum: ['codex', 'claude'] }, connection: { const: 'cli' },
	model: { ...text, maxLength: 200 }, executable: { ...text, maxLength: 4096 },
	timeoutMs: boundedInteger(100, 300000),
	maxContextBytes: boundedInteger(1024, 524288),
	maxCalls: boundedInteger(0, 2)
}));
const validRequest = ajv.compile<ImplementationRequest>(object({
	version: { const: 1 }, snapshot: boundedText, featureId: boundedText, intent: boundedText,
	constraints: strings, sourceFiles: { ...strings, maxItems: 20 }
}));

/** Shared strict schema for provider output and local validation. No shell commands or patches. */
export const planSchema = object({
	summary: boundedText,
	steps: { ...array(object({ id: boundedText, description: boundedText, elementIds: { ...strings, minItems: 1 }, sourceFiles: strings })), minItems: 1, maxItems: 30 },
	questions: { ...array(object({ question: boundedText, reason: boundedText })), maxItems: 20 },
	changes: { ...array(object({ file: boundedText, kind: { enum: ['create', 'modify', 'delete'] }, reason: boundedText, elementIds: { ...strings, minItems: 1 } })), maxItems: 30 },
	tests: { ...array(object({ description: boundedText, elementId: boundedText, criterionId: boundedText })), maxItems: 50 },
	limitations: strings
});
export const validPlan = ajv.compile<ImplementationPlan>(planSchema);

/** Unknown keys are rejected, including credential values and unsupported login modes. */
export function readProviderConfig(value: unknown): ProviderConfig {
	if (!validConfig(value)) { throw new Error('Invalid local CLI provider configuration'); }
	if (value.executable !== value.provider && !/^(?:\/|[a-z]:[\\/])/i.test(value.executable)) { throw new Error('Select the original CLI by name or absolute executable path'); }
	return structuredClone(value);
}

export function readImplementationRequest(value: unknown): ImplementationRequest {
	if (!validRequest(value)) { throw new Error('Invalid implementation request'); }
	if (new Set(value.sourceFiles).size !== value.sourceFiles.length) { throw new Error('Selected source files must be unique'); }
	return structuredClone(value);
}
