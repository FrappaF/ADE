import { compileModelInteraction, validateModelInteraction } from './modelInteractions.js';
import { valueRuntime } from './modelValues.js';
import { interactionInterpreterSource } from './interactionRuntime.generated.js';
import { matchesInteractionRuntimeRegion } from './interactionRuntime.legacy.js';
import { canonicalJson } from './modelSerialization.js';
import { type SemanticModelV4 } from './modelTypes.js';
import { modelOwnedRegion, readModelOwnedRegion } from './modelOwnedRegion.js';

/** Canonical data plan and a profile-owned runtime. No project code or arbitrary text becomes executable. */
export function emitModelInteraction(model: SemanticModelV4, id: string): string {
	const program = compileModelInteraction(model, id);
	return `const program=${canonicalJson(program)};\nconst types=program.model.foundation.types;\n${valueRuntime}\nconst interactionRules={maxCalls:1000};\nconst fieldValueType=f=>({typeId:f.typeId,nullable:f.nullable?.state==='known'&&f.nullable.value===true,optional:!f.required});\nconst isModelValue=(_model,id,value,nullable)=>valid(id,value,nullable);\nconst evaluateModelExpression=(_model,g,scope,input)=>expr(g,input,scope);\n${interactionInterpreterSource}\nexport default (input,replies)=>executeInteractionProgram(program,input,replies);\n`;
}
export function interactionRegion(model: SemanticModelV4, id: string): string { return modelOwnedRegion('interaction-v1', emitModelInteraction(model, id)); }
export function readInteractionRegion(source: string): { region: string; programText: string } {
	const { region, content } = readModelOwnedRegion(source, 'interaction-v1', 'Partial interaction mapping: unique owned region required');
	const line = content.split('\n')[0];
	if (!line.startsWith('const program=') || !line.endsWith(';')) { throw new Error('Partial interaction mapping: data plan missing'); }
	return { region, programText: line.slice('const program='.length, -1) };
}
/** Reverse accepts data-plan edits only when the complete runtime re-emits identically. Intent is never inferred. */
export function reverseModelInteraction(model: SemanticModelV4, id: string, source: string): SemanticModelV4 {
	const read = readInteractionRegion(source);
	let data: ReturnType<typeof compileModelInteraction>;
	try { data = JSON.parse(read.programText); } catch { throw new Error('Partial interaction mapping: invalid data plan'); }
	if (data.version !== 1 || data.targetId !== id || !data.model?.foundation) { throw new Error('Partial interaction mapping: wrong identity'); }
	const original = compileModelInteraction(model, id), next = structuredClone(model);
	// Only existing owned messages/frames/interactions are writable. Contracts, types and ADRs retain their authorship.
	const preserve = (program: typeof original) => { const copy = structuredClone(program); copy.model.foundation.occurrences = []; copy.model.foundation.frames = []; copy.model.foundation.interactions = []; return canonicalJson(copy); };
	if (preserve(original) !== preserve(data)) { throw new Error('Partial interaction mapping: contract or intent mutation'); }
	for (const key of ['occurrences', 'frames', 'interactions'] as const) {
		const ids = new Set(original.model.foundation[key].map(entry => entry.id));
		if (new Set(data.model.foundation[key].map(entry => entry.id)).size !== ids.size || data.model.foundation[key].some(entry => !ids.has(entry.id))) { throw new Error('Partial interaction mapping: invented or deleted identity'); }
		if (key === 'occurrences') { next.foundation.occurrences = next.foundation.occurrences.map(entry => ids.has(entry.id) ? data.model.foundation.occurrences.find(item => item.id === entry.id)! : entry); }
		else if (key === 'frames') { next.foundation.frames = next.foundation.frames.map(entry => ids.has(entry.id) ? data.model.foundation.frames.find(item => item.id === entry.id)! : entry); }
		else { next.foundation.interactions = next.foundation.interactions.map(entry => ids.has(entry.id) ? data.model.foundation.interactions.find(item => item.id === entry.id)! : entry); }
	}
	if (validateModelInteraction(next, id).length || !matchesInteractionRuntimeRegion(read.region, 'interaction-v1', emitModelInteraction(next, id))) { throw new Error('Partial interaction mapping: unsupported body or invalid semantics'); }
	return next;
}
