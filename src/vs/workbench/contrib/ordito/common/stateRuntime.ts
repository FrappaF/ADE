import { compileModelStateMachine, stateRules } from './modelStates.js';
import { valueRuntime } from './modelValues.js';
import { interactionInterpreterSource } from './interactionRuntime.generated.js';
import { stateInterpreterSource } from './stateRuntime.generated.js';
import { canonicalJson } from './modelSerialization.js';
import { type SemanticModelV4 } from './modelTypes.js';
import { matchesModelOwnedRegion, modelOwnedRegion, readModelOwnedRegion } from './modelOwnedRegion.js';

/** Static runtime and canonical data. Model prose is never executable source. */
export function emitModelStateMachine(model: SemanticModelV4, id: string): string {
	return `const program=${canonicalJson(compileModelStateMachine(model, id))};\nconst stateRules=${canonicalJson(stateRules)};\nconst interactionRules={maxCalls:1000};\nfunction stateValues(model){const types=model.foundation.types;${valueRuntime}\nreturn {valid,expr};}\nconst fieldValueType=f=>({typeId:f.typeId,nullable:f.nullable?.state==='known'&&f.nullable.value===true,optional:!f.required});\nconst isModelValue=(model,id,value,nullable)=>stateValues(model).valid(id,value,nullable);\nconst evaluateModelExpression=(model,g,scope,input)=>stateValues(model).expr(g,input,scope);\n${interactionInterpreterSource}\n${stateInterpreterSource}\nexport const createInstance=(input,id,replies,snapshot)=>executeStateProgram(program,input,id,replies,snapshot);\nexport default scenario=>runStateScenario(program,scenario);\n`;
}
export function stateMachineRegion(model: SemanticModelV4, id: string): string { return modelOwnedRegion('state-v1', emitModelStateMachine(model, id)); }
export function readStateMachineRegion(source: string): { region: string; programText: string } {
	const { region, content } = readModelOwnedRegion(source, 'state-v1', 'Partial state mapping: unique region required');
	const line = content.split('\n')[0];
	if (!line.startsWith('const program=') || !line.endsWith(';')) { throw new Error('Partial state mapping: missing data plan'); }
	return { region, programText: line.slice('const program='.length, -1) };
}
/** Only existing state-plan identities may change; contracts, action bodies and intent stay authored. */
export function reverseModelStateMachine(model: SemanticModelV4, id: string, source: string): SemanticModelV4 {
	const read = readStateMachineRegion(source), original = compileModelStateMachine(model, id), data = JSON.parse(read.programText) as typeof original;
	if (data.version !== 1 || data.targetId !== id || data.machine?.id !== id) { throw new Error('Partial state mapping: identity'); }
	const preserve = (value: typeof original) => { const { machine, ...rest } = value; return canonicalJson(rest); };
	if (preserve(original) !== preserve(data)) { throw new Error('Partial state mapping: contract or action body'); }
	for (const key of ['states', 'events', 'actions', 'transitions'] as const) { const ids = (machine: typeof original.machine) => machine[key].map(entry => 'id' in entry ? entry.id : entry.elementId).sort(); if (canonicalJson(ids(original.machine)) !== canonicalJson(ids(data.machine))) { throw new Error('Partial state mapping: invented or deleted identity'); } }
	if (data.machine.ownerId !== original.machine.ownerId || data.machine.operationId !== original.machine.operationId || data.machine.revision !== original.machine.revision) { throw new Error('Partial state mapping: intent boundary'); }
	const next = structuredClone(model); next.foundation.stateMachines = next.foundation.stateMachines!.map(machine => machine.id === id ? data.machine : machine);
	if (!matchesModelOwnedRegion(read.region, 'state-v1', emitModelStateMachine(next, id))) { throw new Error('Partial state mapping: invalid or unsupported runtime'); } return next;
}
