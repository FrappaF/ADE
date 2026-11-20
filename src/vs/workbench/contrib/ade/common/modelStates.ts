import { checkShape, semanticModelV4Schema, semanticModelV5Schema } from './modelSchema.js';
import { readSemanticDraft } from './modelValidation.js';
import { type ModelDiagnostic, type ModelField, type ModelStateMachine, type SemanticModelV4 } from './modelTypes.js';
import { checkModelExpression, evaluateModelExpression, fieldValueType, isModelValue, resolveValueType, type ExpressionScope, type ModelValue } from './modelValues.js';
import { compileModelInteraction, executeInteractionProgram, validateModelInteraction, type InteractionProgram, type InteractionReplies } from './modelInteractions.js';

export const stateRules = { version: 1, profile: 'flat', events: 'serialized-per-instance', priority: 'highest-true; ties-fail', unexpected: 'reject-without-consumption', repeated: 'delivery-id-and-payload', failure: 'latch-without-state-advance-or-retry', persistence: 'quiescent-versioned-snapshot', maxStates: 100, maxTransitions: 1000, maxDeliveries: 1000, maxQueued: 100, maxTrace: 10000, maxScenarioBytes: 2097152, maxScriptedReplies: 1000, maxScriptedDelayMs: 5000, scenarioTimeoutMs: 10000 } as const;
export interface StateProgram { version: 1; rules: typeof stateRules; targetId: string; machine: ModelStateMachine; model: SemanticModelV4; actions: Record<string, InteractionProgram> }
export interface StateEvent { id: string; eventId: string; input: Record<string, ModelValue> }
export type StateReplies = Record<string, InteractionReplies>;
export interface StateTrace { phase: 'guard' | 'entry' | 'exit' | 'effect' | 'doStart' | 'doCompleted' | 'doCancelled' | 'doFailed' | 'commit' | 'call'; id: string; value?: ModelValue }
export interface StateResult { status: 'accepted' | 'duplicate' | 'rejected' | 'failed'; stateId: string; transitionId?: string; error?: string; trace: StateTrace[] }
export interface StateSnapshot { version: 1; machineId: string; revision: string; programRevision: string; instanceId: string; input: Record<string, ModelValue>; stateId: string; sequence: number; deliveries: StateEvent[]; doStatus: 'none' | 'completed' | 'cancelled' | 'failed'; error: string | null }
export interface StateInstance { send(event: StateEvent, replies?: StateReplies): Promise<StateResult>; settle(): Promise<void>; checkpoint(): StateSnapshot; inspect(): { stateId: string; error: string | null; doStatus: string; trace: StateTrace[] }; dispose(): Promise<void> }
export interface StateScenario { instanceId: string; input: Record<string, ModelValue>; replies: StateReplies; events: { event: StateEvent; replies: StateReplies; settle?: boolean; reopen?: boolean }[] }
export interface StateObservation { stateId: string; error: string | null; doStatus: string; statuses: string[]; errors: (string | null)[]; transitions: (string | null)[]; calls: string[]; phases: string[] }

const scopeFor = (fields: ModelField[]): ExpressionScope => Object.fromEntries(fields.map(field => [field.id!, fieldValueType(field)]));

/** Generation validation never upgrades descriptive or hierarchical state diagrams. */
export function validateModelStateMachine(model: SemanticModelV4, id: string): string[] {
	const shape: ModelDiagnostic[] = []; checkShape(model, model.version === 5 ? semanticModelV5Schema : semanticModelV4Schema, '', shape); if (shape.length) { return ['stateShape']; }
	const m = model.foundation.stateMachines?.find(machine => machine.id === id); if (!m) { return ['stateMissing']; } if (model.foundation.stateMachines!.filter(machine => machine.id === id).length !== 1) { return ['stateIdentity']; }
	const errors: string[] = [], operations = model.foundation.blueprint?.operations ?? [], root = operations.find(operation => operation.id === m.operationId);
	const owner = model.semantics.elements.find(element => element.id === m.ownerId);
	if (!owner || owner.kind !== 'class' || !root || root.ownerId !== m.ownerId || root.outputs.length || root.permissions.length || root.effects.length || root.errors.length) { errors.push('stateOwnerOrContract'); }
	const unique = (ids: string[]) => new Set(ids).size === ids.length;
	const states = m.states.map(state => state.elementId), locals = [...m.events.map(event => event.id), ...m.actions.map(action => action.id), ...m.transitions.map(transition => transition.id)];
	if (!unique(states) || !unique(locals) || m.states.length > stateRules.maxStates || m.transitions.length > stateRules.maxTransitions || m.initialIds.length !== 1 || !states.includes(m.initialIds[0]) || !unique(m.finalIds) || m.finalIds.some(id => !states.includes(id))) { errors.push('stateInitialOrIdentity'); }
	for (const state of m.states) {
		const element = model.semantics.elements.find(element => element.id === state.elementId);
		if (!element || element.kind !== 'state' || element.parentId !== m.ownerId || model.semantics.elements.some(child => child.parentId === state.elementId)) { errors.push('stateHierarchyOrOwnership'); }
		if (m.finalIds.includes(state.elementId) && (state.doActionId || m.transitions.some(transition => transition.from === state.elementId))) { errors.push('stateFinalOutgoing'); }
		for (const actionId of [...state.entry, ...state.exit, ...state.doActionId ? [state.doActionId] : []]) { if (!m.actions.some(action => action.id === actionId)) { errors.push('stateActionMissing'); } }
	}
	const typed = (fields: ModelField[]) => fields.every(field => fieldValueType(field).typeId && resolveValueType(model, field.typeId!));
	if (!root || !typed(root.inputs)) { errors.push('stateInputType'); }
	for (const event of m.events) { const op = operations.find(operation => operation.id === event.operationId); if (!op || op.outputs.length || op.permissions.length || op.effects.length || op.errors.length || !typed(op.inputs) || op.inputs.some(field => root?.inputs.some(input => input.id === field.id))) { errors.push('stateEventContract'); } }
	const scope = scopeFor(root?.inputs ?? []);
	const checkAction = (id: string, variables: ExpressionScope) => {
		const action = m.actions.find(action => action.id === id), interaction = model.foundation.interactions.find(interaction => interaction.id === action?.interactionId), contract = operations.find(operation => operation.id === interaction?.execution?.operationId);
		if (!action || !interaction?.execution || !contract || interaction.execution.revision !== action.revision || validateModelInteraction(model, interaction.id).length) { errors.push('stateActionContract'); return; }
		if (!unique(action.arguments.map(arg => arg.fieldId)) || contract.inputs.some(field => field.required && !action.arguments.some(arg => arg.fieldId === field.id))) { errors.push('stateArguments'); }
		for (const arg of action.arguments) { const field = contract.inputs.find(field => field.id === arg.fieldId), result = checkModelExpression(model, arg.expression, variables); if (!field || result.errors.length || result.type?.typeId !== field.typeId || result.type?.nullable && field.nullable?.state === 'known' && field.nullable.value === false || result.type?.optional && field.required) { errors.push('stateArgumentType'); } }
	};
	for (const state of m.states) { for (const id of [...state.entry, ...state.exit, ...state.doActionId ? [state.doActionId] : []]) { checkAction(id, scope); } }
	const used = new Set(m.states.flatMap(state => [...state.entry, ...state.exit, ...state.doActionId ? [state.doActionId] : []]));
	for (const transition of m.transitions) {
		const event = m.events.find(event => event.id === transition.eventId), op = operations.find(operation => operation.id === event?.operationId), variables = { ...scope, ...scopeFor(op?.inputs ?? []) };
		if (!states.includes(transition.from) || !states.includes(transition.to) || !event || transition.kind === 'internal' && transition.from !== transition.to) { errors.push('stateTransitionReference'); }
		if (transition.guard) { const result = checkModelExpression(model, transition.guard, variables); if (result.errors.length || result.type?.typeId !== '$boolean' && resolveValueType(model, result.type?.typeId ?? '')?.primitive !== 'boolean') { errors.push('stateGuardType'); } }
		for (const id of transition.effects) { used.add(id); checkAction(id, variables); }
	}
	if (m.actions.some(action => !used.has(action.id))) { errors.push('stateUnusedAction'); }
	const reachable = new Set(m.initialIds); for (const id of reachable) { for (const transition of m.transitions.filter(transition => transition.from === id)) { reachable.add(transition.to); } }
	if (states.some(id => !reachable.has(id))) { errors.push('stateUnreachable'); }
	return [...new Set(errors)];
}

/** Close only executable contracts, types and action bodies; project intent stays in the review packet. */
export function compileModelStateMachine(model: SemanticModelV4, id: string): StateProgram {
	const errors = validateModelStateMachine(model, id); if (errors.length) { throw new Error('Invalid state machine: ' + errors.join(', ')); }
	const machine = model.foundation.stateMachines!.find(machine => machine.id === id)!;
	const actions = Object.fromEntries(machine.actions.map(action => [action.id, compileModelInteraction(model, action.interactionId)]));
	const operationIds = new Set([machine.operationId, ...machine.events.map(event => event.operationId)]);
	const operations = model.foundation.blueprint!.operations.filter(operation => operationIds.has(operation.id));
	const typeIds = new Set(operations.flatMap(operation => operation.inputs.map(field => field.typeId!)));
	for (const expression of [...machine.transitions.flatMap(transition => transition.guard ? [transition.guard] : []), ...machine.actions.flatMap(action => action.arguments.map(arg => arg.expression))]) { for (const node of expression.nodes) { if (node.kind === 'literal' || node.kind === 'collection' && node.operator === 'count') { typeIds.add(node.typeId); } } }
	for (const id of typeIds) { const type = model.foundation.types.find(type => type.id === id); for (const nested of [...type?.fields.map(field => field.typeId) ?? [], type?.itemTypeId, type?.targetTypeId]) { if (nested) { typeIds.add(nested); } } }
	const runtime: SemanticModelV4 = { version: 4, id: model.id, name: '', semantics: { elements: [], relations: [] }, views: [], codeMappings: [], verifications: [], foundation: { ownership: [], memberships: [], integrations: [], types: model.foundation.types.filter(type => typeIds.has(type.id)), occurrences: [], frames: [], interactions: [], assertions: [], decisions: [], platform: { bindings: [] }, blueprint: { operations, interfaces: [], ports: [], connections: [], transports: [], modules: [], fieldMappings: [] } } };
	return structuredClone({ version: 1, rules: stateRules, targetId: id, machine, model: runtime, actions });
}

// <state-runtime>
function stateFields(model: SemanticModelV4, fields: ModelField[], value: Record<string, ModelValue>): void {
	if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(id => !fields.some(field => field.id === id)) || fields.some(field => Object.hasOwn(value, field.id!) ? !isModelValue(model, field.typeId!, value[field.id!], field.nullable?.state === 'known' && field.nullable.value === true) : field.required)) { throw new Error('stateValueType'); }
}
function stateKey(value: object): string { const normalize = (value: ModelValue): ModelValue => Array.isArray(value) ? value.map(normalize) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])])) : value; return JSON.stringify(normalize(value as ModelValue)); }
function stateEvent(program: StateProgram, event: StateEvent): void {
	if (!event || Object.keys(event).sort().join(',') !== 'eventId,id,input' || typeof event.id !== 'string' || !event.id || event.id.length > 256 || typeof event.eventId !== 'string') { throw new Error('stateEventShape'); }
	const definition = program.machine.events.find(entry => entry.id === event.eventId), operation = program.model.foundation.blueprint!.operations.find(operation => operation.id === definition?.operationId);
	if (!operation) { throw new Error('stateEventUnknown'); } stateFields(program.model, operation.inputs, event.input);
}
function stateRestore(program: StateProgram, instanceId: string, input: Record<string, ModelValue>, programRevision: string, value: StateSnapshot): StateSnapshot {
	const m = program.machine;
	if (!value || Object.keys(value).sort().join(',') !== 'deliveries,doStatus,error,input,instanceId,machineId,programRevision,revision,sequence,stateId,version' || value.version !== 1 || value.machineId !== m.id || value.revision !== m.revision || value.programRevision !== programRevision || value.instanceId !== instanceId || stateKey(value.input) !== stateKey(input) || !m.states.some(state => state.elementId === value.stateId) || !Number.isSafeInteger(value.sequence) || value.sequence < 0 || value.sequence > stateRules.maxDeliveries || !Array.isArray(value.deliveries) || value.deliveries.length !== value.sequence || !['none', 'completed', 'cancelled', 'failed'].includes(value.doStatus) || value.error !== null && (typeof value.error !== 'string' || !value.error) || value.doStatus === 'failed' && !value.error) { throw new Error('stateCheckpointInvalid'); }
	const seen = new Set<string>(); let stateId = m.initialIds[0];
	for (const event of value.deliveries) { stateEvent(program, event); if (seen.has(event.id)) { throw new Error('stateCheckpointInvalid'); } seen.add(event.id); const transitions = m.transitions.filter(transition => transition.from === stateId && transition.eventId === event.eventId).filter(transition => { const value = transition.guard === null ? true : evaluateModelExpression(program.model, transition.guard, Object.fromEntries([...program.model.foundation.blueprint!.operations.find(op => op.id === m.operationId)!.inputs, ...program.model.foundation.blueprint!.operations.find(op => op.id === m.events.find(e => e.id === event.eventId)!.operationId)!.inputs].map(field => [field.id!, fieldValueType(field)])), { ...input, ...event.input }); if (typeof value !== 'boolean') { throw new Error('stateCheckpointInvalid'); } return value; }); const priority = Math.max(...transitions.map(transition => transition.priority)); const winners = transitions.filter(transition => transition.priority === priority); if (winners.length !== 1) { throw new Error('stateCheckpointInvalid'); } stateId = winners[0].to; }
	if (stateId !== value.stateId || !m.states.find(state => state.elementId === stateId)!.doActionId && value.doStatus !== 'none' || m.states.find(state => state.elementId === stateId)!.doActionId && value.error === null && value.doStatus !== 'completed') { throw new Error('stateCheckpointInvalid'); }
	return structuredClone(value);
}

/** Local instance: copied enqueue, cooperative do cancellation, error latch and quiescent checkpoints. */
/* eslint-disable prefer-const -- These declarations are serialized into persisted project regions; keep their emitted bytes compatible. */
export async function executeStateProgram(source: StateProgram, initial: Record<string, ModelValue>, instanceId: string, bootstrap: StateReplies = {}, restore?: StateSnapshot, parentSignal?: AbortSignal): Promise<StateInstance> {
	const program = structuredClone(source), input = structuredClone(initial), m = program.machine, model = program.model, operations = model.foundation.blueprint!.operations, contract = operations.find(operation => operation.id === m.operationId)!;
	bootstrap = structuredClone(bootstrap); restore = restore ? structuredClone(restore) : undefined;
	if (!instanceId || instanceId.length > 256) { throw new Error('stateInstanceId'); } stateFields(model, contract.inputs, input);
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stateKey(program))); const programRevision = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
	let snapshot: StateSnapshot = restore ? stateRestore(program, instanceId, input, programRevision, restore) : { version: 1, machineId: m.id, revision: m.revision, programRevision, instanceId, input, stateId: m.initialIds[0], sequence: 0, deliveries: [], doStatus: 'none', error: null };
	const trace: StateTrace[] = []; let queued = 0, disposed = false, queue = Promise.resolve(), doTask: Promise<void> | undefined, doController: AbortController | undefined, doRunning = false;
	const record = (phase: StateTrace['phase'], id: string, value?: ModelValue) => { if (trace.length >= stateRules.maxTrace) { throw new Error('stateTraceBudget'); } trace.push({ phase, id, ...value === undefined ? {} : { value } }); };
	const action = async (id: string, env: Record<string, ModelValue>, variables: ExpressionScope, replies: StateReplies, signal?: AbortSignal) => {
		const definition = m.actions.find(action => action.id === id)!, args: Record<string, ModelValue> = Object.create(null);
		for (const arg of definition.arguments) { const value = evaluateModelExpression(model, arg.expression, variables, env); if (value !== undefined) { args[arg.fieldId] = value; } }
		const result = await executeInteractionProgram(program.actions[id], args, replies[id] ?? {}, signal && parentSignal ? AbortSignal.any([signal, parentSignal]) : signal ?? parentSignal, call => { if (call.kind === 'call') { record('call', call.id, call.value); } });
		if (result.outcome !== 'completed') { throw new Error(result.error!.code); }
	};
	const baseScope = Object.fromEntries(contract.inputs.map(field => [field.id!, fieldValueType(field)]));
	const startDo = (replies: StateReplies) => {
		const id = m.states.find(state => state.elementId === snapshot.stateId)!.doActionId; snapshot.doStatus = 'none'; if (!id) { return; }
		doController = new AbortController(); const controller = doController; doRunning = true; record('doStart', id);
		doTask = (async () => { try { await action(id, input, baseScope, replies, controller.signal); snapshot.doStatus = 'completed'; record('doCompleted', id); } catch (error) { if ((controller.signal.aborted || parentSignal?.aborted) && error instanceof Error && error.message === 'cancelled') { snapshot.doStatus = 'cancelled'; record('doCancelled', id); } else { snapshot.doStatus = 'failed'; snapshot.error = error instanceof Error ? error.message : 'stateDoFailed'; record('doFailed', id); } } finally { doRunning = false; } })();
	};
	const cancelDo = async () => { if (doRunning) { doController!.abort(); await doTask; } };
	const phases = async (ids: string[], phase: 'entry' | 'exit' | 'effect', env: Record<string, ModelValue>, variables: ExpressionScope, replies: StateReplies) => { for (const id of ids) { if (parentSignal?.aborted) { throw new Error('stateScenarioTimeout'); } record(phase, id); await action(id, env, variables, replies); if (snapshot.error) { throw new Error(snapshot.error); } } };
	if (!restore) { try { await phases(m.states.find(state => state.elementId === snapshot.stateId)!.entry, 'entry', input, baseScope, bootstrap); startDo(bootstrap); } catch (error) { snapshot.error = error instanceof Error ? error.message : 'stateEntryFailed'; } }
	const process = async (event: StateEvent, replies: StateReplies): Promise<StateResult> => {
		const offset = trace.length; const result = (status: StateResult['status'], error?: string, transitionId?: string): StateResult => ({ status, stateId: snapshot.stateId, ...error ? { error } : {}, ...transitionId ? { transitionId } : {}, trace: structuredClone(trace.slice(offset)) });
		if (disposed) { return result('failed', 'stateDisposed'); } if (parentSignal?.aborted) { return result('failed', 'stateScenarioTimeout'); } if (snapshot.error) { return result('failed', snapshot.error); }
		try { stateEvent(program, event); } catch (error) { return result('rejected', error instanceof Error ? error.message : 'stateEventInvalid'); }
		const prior = snapshot.deliveries.find(delivery => delivery.id === event.id); if (prior) { return stateKey(prior) === stateKey(event) ? result('duplicate') : result('rejected', 'deliveryConflict'); }
		if (snapshot.sequence >= stateRules.maxDeliveries) { return result('rejected', 'stateDeliveryBudget'); }
		const eventContract = operations.find(operation => operation.id === m.events.find(entry => entry.id === event.eventId)!.operationId)!, variables = { ...baseScope, ...Object.fromEntries(eventContract.inputs.map(field => [field.id!, fieldValueType(field)])) }, env = { ...input, ...event.input };
		let candidates: ModelStateMachine['transitions'];
		try { candidates = m.transitions.filter(transition => transition.from === snapshot.stateId && transition.eventId === event.eventId).filter(transition => { const value = transition.guard === null ? true : evaluateModelExpression(model, transition.guard, variables, env); record('guard', transition.id, value ?? null); if (typeof value !== 'boolean') { throw new Error('indeterminateGuard'); } return value; }); } catch (error) { return result('failed', error instanceof Error ? error.message : 'stateGuardFailed'); }
		if (!candidates.length) { return result('rejected', 'unexpectedEvent'); }
		const priority = Math.max(...candidates.map(transition => transition.priority)), winners = candidates.filter(transition => transition.priority === priority); if (winners.length !== 1) { return result('failed', 'ambiguousTransition'); } const transition = winners[0];
		try {
			if (transition.kind === 'external') { await cancelDo(); if (snapshot.error) { throw new Error(snapshot.error); } await phases(m.states.find(state => state.elementId === snapshot.stateId)!.exit, 'exit', input, baseScope, replies); }
			await phases(transition.effects, 'effect', env, variables, replies);
			if (transition.kind === 'external') { await phases(m.states.find(state => state.elementId === transition.to)!.entry, 'entry', input, baseScope, replies); }
			if (snapshot.error) { throw new Error(snapshot.error); }
			record('commit', transition.id); snapshot.stateId = transition.to; snapshot.sequence++; snapshot.deliveries.push(event);
			if (transition.kind === 'external') { startDo(replies); }
			return result('accepted', undefined, transition.id);
		} catch (error) { snapshot.error = error instanceof Error ? error.message : 'stateActionFailed'; await cancelDo(); return result('failed', snapshot.error, transition.id); }
	};
	return {
		send(event, replies = {}) { const copy = structuredClone(event), data = structuredClone(replies); if (queued >= stateRules.maxQueued) { return Promise.reject(new Error('stateQueueBudget')); } queued++; const result = queue.then(() => process(copy, data)); queue = result.then(() => { queued--; }, () => { queued--; }); return result; },
		async settle() { await queue; await doTask; },
		checkpoint() { if (queued || doRunning || disposed) { throw new Error('stateCheckpointBusy'); } return structuredClone(snapshot); },
		inspect() { return { stateId: snapshot.stateId, error: snapshot.error, doStatus: doRunning ? 'running' : snapshot.doStatus, trace: structuredClone(trace) }; },
		async dispose() { disposed = true; await queue; await cancelDo(); }
	};
}

/** Replay authored event data; observation is compared separately with independent expectations. */
export async function runStateScenario(program: StateProgram, scenario: StateScenario, externalSignal?: AbortSignal): Promise<StateObservation> {
	scenario = structuredClone(scenario);
	if (!scenario || !Array.isArray(scenario.events) || scenario.events.length > stateRules.maxDeliveries || new TextEncoder().encode(JSON.stringify(scenario)).length > stateRules.maxScenarioBytes) { throw new Error('stateScenarioBudget'); }
	let count = 0, delay = 0;
	for (const data of [scenario.replies, ...scenario.events.map(step => step.replies)]) { if (!data || typeof data !== 'object' || Array.isArray(data)) { throw new Error('stateScenarioData'); } for (const replies of Object.values(data)) { if (!replies || typeof replies !== 'object' || Array.isArray(replies)) { throw new Error('stateScenarioData'); } for (const entries of Object.values(replies)) { if (!Array.isArray(entries)) { throw new Error('stateScenarioData'); } for (const reply of entries) { if (!reply || !Number.isSafeInteger(reply.delayMs) || reply.delayMs < 0 || reply.delayMs > 30000) { throw new Error('stateScenarioData'); } count++; delay += reply.delayMs; } } } }
	if (count > stateRules.maxScriptedReplies || delay > stateRules.maxScriptedDelayMs) { throw new Error('stateScenarioBudget'); }
	const timeout = AbortSignal.timeout(stateRules.scenarioTimeoutMs), signal = externalSignal ? AbortSignal.any([timeout, externalSignal]) : timeout; let instance = await executeStateProgram(program, scenario.input, scenario.instanceId, scenario.replies, undefined, signal), traces: StateTrace[] = []; const results: StateResult[] = [];
	try {
		for (const step of scenario.events) { results.push(await instance.send(step.event, step.replies)); if (step.settle) { await instance.settle(); } if (step.reopen) { await instance.settle(); const snapshot = instance.checkpoint(); traces.push(...instance.inspect().trace); await instance.dispose(); instance = await executeStateProgram(program, scenario.input, scenario.instanceId, {}, snapshot, signal); } }
		await instance.settle(); if (signal.aborted) { throw new Error('stateScenarioTimeout'); } const current = instance.inspect(); traces.push(...current.trace);
		return { stateId: current.stateId, error: current.error, doStatus: current.doStatus, statuses: results.map(result => result.status), errors: results.map(result => result.error ?? null), transitions: results.map(result => result.transitionId ?? null), calls: traces.filter(item => item.phase === 'call').map(item => item.id), phases: traces.filter(item => item.phase !== 'call').map(item => item.phase + ':' + item.id) };
	} finally { await instance.dispose(); }
}
/* eslint-enable prefer-const */
// </state-runtime>

export async function interpretModelStateMachine(model: SemanticModelV4, id: string, scenario: StateScenario, externalSignal?: AbortSignal): Promise<StateObservation> { return runStateScenario(compileModelStateMachine(model, id), scenario, externalSignal); }

/** One detached native transaction with optimistic revision; no unrelated draft is validated or rewritten. */
export function setModelStateMachine(model: SemanticModelV4, machine: ModelStateMachine, expectedRevision?: string): SemanticModelV4 {
	const prior = model.foundation.stateMachines?.find(entry => entry.id === machine.id); if (prior?.revision !== expectedRevision) { throw new Error('State machine revision changed'); }
	const next = structuredClone(model); next.foundation.stateMachines = [...next.foundation.stateMachines ?? []]; const index = next.foundation.stateMachines.findIndex(entry => entry.id === machine.id);
	if (index < 0) { next.foundation.stateMachines.push(structuredClone(machine)); } else { next.foundation.stateMachines[index] = structuredClone(machine); }
	return readSemanticDraft(next) as SemanticModelV4;
}
