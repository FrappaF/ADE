import { checkShape, knowledgeSchema } from './modelSchema.js';
import { type Knowledge, type ModelDiagnostic } from './modelTypes.js';

/** Null placeholders from structured output require a declared meaning; truthiness is never used. */
export interface ProviderKnowledgePolicy { nullMeans: 'known-null' | 'unknown' | 'omitted'; unknownReason: string }

/** Both adapters convert at the boundary and validate the tagged domain value before returning it. */
export function decodeProviderKnowledge(provider: 'codex' | 'claude', value: unknown, policy: ProviderKnowledgePolicy): Knowledge {
	let knowledge: unknown;
	if (provider === 'codex') {
		// Codex's required-property envelope uses explicit state and a nullable value/reason slot.
		if (!value || typeof value !== 'object' || Array.isArray(value)) { throw new Error('Invalid provider knowledge envelope'); }
		const entry = value as Record<string, unknown>;
		if (Object.keys(entry).sort().join(',') !== 'reason,state,value') { throw new Error('Invalid provider knowledge slots'); }
		if (entry.state === 'known' && entry.reason === null) { knowledge = { state: 'known', value: entry.value }; }
		else if (entry.state === 'unknown' && entry.value === null) { knowledge = { state: 'unknown', reason: entry.reason }; }
		else if (entry.state === 'omitted' && entry.value === null && entry.reason === null) { knowledge = { state: 'omitted' }; }
		else { throw new Error('Ambiguous provider knowledge'); }
	} else {
		// Claude adapter accepts either an explicit tagged union or a scalar transport slot.
		knowledge = value && typeof value === 'object' ? value : value === undefined ? { state: 'omitted' } : value === null
			? policy.nullMeans === 'known-null' ? { state: 'known', value: null } : policy.nullMeans === 'omitted' ? { state: 'omitted' } : { state: 'unknown', reason: policy.unknownReason }
			: { state: 'known', value };
	}
	const diagnostics: ModelDiagnostic[] = []; checkShape(knowledge, knowledgeSchema, '', diagnostics);
	if (diagnostics.length) { throw new Error('Invalid provider knowledge value'); }
	return structuredClone(knowledge as Knowledge);
}
