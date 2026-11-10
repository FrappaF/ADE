/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { readSemanticDraft, validateSemanticShape, scenarioLayers, scenarioUnorderedOccurrences, type InteractionArgument, type ModelExpression, type ModelField, type ModelFrame, type ModelInteraction, type SemanticModelV4 } from './semanticModel.js';
import { checkModelExpression, evaluateModelExpression, fieldValueType, isModelValue, resolveValueType, type ExpressionScope, type ModelValue } from './modelValues.js';
import { canonicalJson } from './modelSerialization.js';

export interface InteractionReply { delayMs: number; outputs?: Record<string, ModelValue>; error?: { code: string; details: ModelValue } }
export type InteractionReplies = Record<string, InteractionReply[]>;
export interface InteractionTrace { kind: 'call' | 'reply' | 'error' | 'timeout' | 'cancel' | 'enter' | 'exit' | 'join'; id: string; operationId?: string; correlation?: ModelValue; value?: ModelValue }
export interface InteractionResult { outcome: 'completed' | 'failed'; outputs: Record<string, ModelValue>; trace: InteractionTrace[]; error?: { code: string; at: string }; joins: { id: string; outcomes: string[] }[] }
export interface InteractionProgram { version: 1; targetId: string; model: SemanticModelV4 }
export const interactionRules = { version: 1, maxDepth: 16, maxSteps: 1000, maxIterations: 1000, maxCalls: 1000, critical: 'interaction-local exclusion by effect resource; nested locks use ascending resource order', parallel: 'all; cancellation cooperative and drained; branch results in declared order; no escaping branch variables', timeout: 'required reply; explicit finite deadline; no implicit retry', execution: 'trusted generated orchestration with scripted data adapters; no project code, network, DB or broker' } as const;

/** Synthetic result records belong to the compiler, never to the persisted PIM. */
export function interactionValueModel(model: SemanticModelV4): SemanticModelV4 {
	const operations = model.foundation.blueprint?.operations ?? [], types = [...model.foundation.types, ...operations.map(operation => ({ id: '$result.' + operation.id, name: operation.name, kind: 'record' as const, fields: operation.outputs }))];
	const resultField = (id: string, typeId: string): ModelField => ({ id, name: id, type: '', typeId, required: true, nullable: { state: 'known', value: false } });
	const exports = (steps: string[], seen = new Set<string>()): ModelField[] => steps.flatMap(id => {
		if (seen.has(id)) { return []; } seen.add(id); const call = model.foundation.occurrences.find(call => call.id === id), frame = model.foundation.frames.find(frame => frame.id === id);
		if (call?.execution) { return [resultField(call.execution.resultId, '$result.' + call.operationId)]; }
		if (frame?.kind === 'ref') { return [resultField(frame.resultId, '$result.' + model.foundation.interactions.find(interaction => interaction.id === frame.interactionId)?.execution?.operationId)]; }
		if (frame?.kind === 'par') { return [resultField(frame.resultId, '$join.' + frame.id)]; }
		return frame?.kind === 'critical' ? exports(frame.steps, seen) : [];
	});
	for (const frame of model.foundation.frames) {
		if (frame.kind !== 'par') { continue; }
		for (const operand of frame.operands) { types.push({ id: '$branch.' + operand.id, name: operand.id, kind: 'record', fields: exports(operand.steps) }); }
		types.push({ id: '$join.' + frame.id, name: frame.id, kind: 'record', fields: frame.operands.map(operand => resultField(operand.id, '$branch.' + operand.id)) });
	}
	return { ...model, foundation: { ...model.foundation, types } };
}
export function interactionFrameSteps(frame: ModelFrame): string[][] {
	return 'steps' in frame ? [frame.steps] : 'operands' in frame ? frame.operands.map(operand => operand.steps) : [];
}
function operationScope(fields: ModelField[]): ExpressionScope { return Object.fromEntries(fields.map(field => [field.id!, fieldValueType(field)])); }
function booleanExpression(model: SemanticModelV4, expression: ModelExpression, scope: ExpressionScope): string[] {
	const result = checkModelExpression(model, expression, scope);
	return [...result.errors, ...(result.type?.typeId === '$boolean' || resolveValueType(model, result.type?.typeId ?? '')?.primitive === 'boolean' ? [] : ['booleanGuard'])];
}
function argumentsErrors(model: SemanticModelV4, args: InteractionArgument[], fields: ModelField[], scope: ExpressionScope): string[] {
	const errors: string[] = [];
	if (new Set(args.map(arg => arg.fieldId)).size !== args.length || fields.some(field => field.required && !args.some(arg => arg.fieldId === field.id))) { errors.push('argumentArity'); }
	for (const arg of args) {
		const field = fields.find(field => field.id === arg.fieldId), result = checkModelExpression(model, arg.expression, scope); errors.push(...result.errors);
		if (!field || field.typeId !== result.type?.typeId && !(result.type?.typeId === '$boolean' && resolveValueType(model, field.typeId ?? '')?.primitive === 'boolean') || result.type?.nullable && !(field.nullable?.state === 'known' && field.nullable.value === true) || result.type?.optional && field.required) { errors.push('argumentType'); }
	}
	return errors;
}

/** Reject scope leaks, ambiguous policies, unbounded recursion and unprotected shared effects before emitting. */
export function validateModelInteraction(model: SemanticModelV4, targetId: string): string[] {
	if (validateSemanticShape(model).length) { return ['interactionShape']; }
	const errors: string[] = [], typed = interactionValueModel(model), operations = model.foundation.blueprint?.operations ?? [], f = model.foundation;
	const visited = new Set<string>(), callPath = new Set<string>(); let size = 0;
	const validate = (id: string, depth: number, inheritedLocks: string[] = []) => {
		const visitKey = canonicalJson([id, inheritedLocks]);
		if (callPath.has(id)) { errors.push('refCycle'); return; } if (visited.has(visitKey)) { return; }
		if (depth > interactionRules.maxDepth) { errors.push('depthBudget'); return; }
		const interaction = f.interactions.find(entry => entry.id === id), execution = interaction?.execution, operation = operations.find(entry => entry.id === execution?.operationId);
		if (!interaction || interaction.profile === 'descriptive' || !execution || !operation || !interaction.ownerId || operation.ownerId !== interaction.ownerId || interaction.legacyRelationOrder?.length) { errors.push('interactionContract'); return; }
		if (operation.permissions.length || operation.effects.length) { errors.push('unsupportedInteractionEffects'); }
		visited.add(visitKey); callPath.add(id);
		const local = new Set<string>(), usedOccurrences = new Set<string>(), usedFrames = new Set<string>();
		const walk = (steps: string[], scope: ExpressionScope, locks: string[], level: number): Map<string, boolean> => {
			const effects = new Map<string, boolean>();
			if (level > interactionRules.maxDepth) { errors.push('depthBudget'); return effects; }
			const addEffects = (source: Map<string, boolean>) => { for (const [key, protectedEffect] of source) { effects.set(key, (effects.get(key) ?? true) && protectedEffect); } };
			for (const step of steps) {
				if (++size > interactionRules.maxSteps) { errors.push('stepBudget'); return effects; }
				if (local.has(step)) { errors.push('stepMultipleParents'); continue; } local.add(step);
				const occurrence = f.occurrences.find(entry => entry.id === step), frame = f.frames.find(entry => entry.id === step);
				const bind = (id: string, typeId: string) => { if (Object.hasOwn(scope, id)) { errors.push('resultAlreadyDefined'); } scope[id] = { typeId, nullable: false, optional: false }; };
				if (occurrence && !frame) {
					usedOccurrences.add(step); const call = occurrence.execution, operation = operations.find(entry => entry.id === occurrence.operationId);
					if (!call || !operation || operation.ownerId !== occurrence.to || !model.semantics.elements.some(entry => entry.id === occurrence.from) || operation.permissions.length) { errors.push('messageContract'); continue; }
					errors.push(...argumentsErrors(typed, call.arguments, operation.inputs, scope));
					const correlation = checkModelExpression(typed, call.correlation, scope); errors.push(...correlation.errors);
					if (correlation.type?.optional || correlation.type?.nullable || !['string', 'integer'].includes(resolveValueType(typed, correlation.type?.typeId ?? '')?.primitive ?? '')) { errors.push('correlationType'); }
					bind(call.resultId, '$result.' + operation.id);
					for (const effect of operation.effects) { effects.set(effect, (effects.get(effect) ?? true) && locks.includes(effect)); }
				} else if (frame && !occurrence) {
					usedFrames.add(step);
					if (frame.kind === 'unspecified') { errors.push('unspecifiedFrame'); continue; }
					if (frame.kind === 'ref') {
						const referenced = f.interactions.find(entry => entry.id === frame.interactionId), contract = operations.find(entry => entry.id === referenced?.execution?.operationId);
						if (!referenced?.execution || referenced.execution.revision !== frame.revision || !contract) { errors.push('refContractRevision'); continue; }
						errors.push(...argumentsErrors(typed, frame.arguments, contract.inputs, scope)); validate(frame.interactionId, depth + 1, locks); bind(frame.resultId, '$result.' + contract.id);
						// Effects inside refs are inspected in the caller's lock scope as well.
						for (const [item, protectedEffect] of interactionEffects(model, frame.interactionId, locks)) { effects.set(item, (effects.get(item) ?? true) && protectedEffect); }
					} else if (frame.kind === 'alt') {
						if (frame.operands.length < 2 || frame.operands.filter(operand => operand.guard === null).length !== 1 || frame.operands.at(-1)?.guard !== null || new Set(frame.operands.map(operand => operand.id)).size !== frame.operands.length) { errors.push('altSelection'); }
						for (const operand of frame.operands) { if (operand.guard) { errors.push(...booleanExpression(typed, operand.guard, scope)); } addEffects(walk(operand.steps, { ...scope }, locks, level + 1)); }
					} else if (frame.kind === 'par') {
						if (frame.operands.length < 2 || new Set(frame.operands.map(operand => operand.id)).size !== frame.operands.length) { errors.push('parallelOperands'); }
						const branches = frame.operands.map(operand => walk(operand.steps, { ...scope }, locks, level + 1));
						bind(frame.resultId, '$join.' + frame.id);
						for (let i = 0; i < branches.length; i++) { for (let j = i + 1; j < branches.length; j++) { for (const [effect, protectedEffect] of branches[i]) { if (branches[j].has(effect) && (!protectedEffect || !branches[j].get(effect))) { errors.push('sharedEffectRace'); } } } addEffects(branches[i]); }
					} else if (frame.kind === 'critical') {
						if (locks.some(resource => resource >= frame.resource)) { errors.push('criticalLockOrder'); }
						addEffects(walk(frame.steps, scope, [...locks, frame.resource], level + 1));
					} else {
						const inner = { ...scope };
						if (frame.kind === 'loop') { if (Object.hasOwn(scope, frame.iterationId) || resolveValueType(typed, frame.iterationTypeId)?.primitive !== 'integer') { errors.push('loopCounter'); } inner[frame.iterationId] = { typeId: frame.iterationTypeId, nullable: false, optional: false }; }
						errors.push(...booleanExpression(typed, frame.guard, inner)); addEffects(walk(frame.steps, inner, locks, level + 1));
					}
				} else { errors.push('stepMissingOrAmbiguous'); }
			}
			return effects;
		};
		const scope = operationScope(operation.inputs); walk(execution.steps, scope, inheritedLocks, depth);
		errors.push(...argumentsErrors(typed, execution.outputs, operation.outputs, scope));
		if (new Set(interaction.occurrenceIds).size !== interaction.occurrenceIds.length || new Set(interaction.frameIds).size !== interaction.frameIds.length || canonicalJson([...usedOccurrences].sort()) !== canonicalJson([...interaction.occurrenceIds].sort()) || canonicalJson([...usedFrames].sort()) !== canonicalJson([...interaction.frameIds].sort())) { errors.push('interactionMembership'); }
		callPath.delete(id);
	};
	validate(targetId, 0); return [...new Set(errors)];
}
function interactionEffects(model: SemanticModelV4, id: string, locks: string[], visited = new Set<string>()): Map<string, boolean> {
	if (visited.has(id)) { return new Map(); } visited.add(id);
	const interaction = model.foundation.interactions.find(entry => entry.id === id), effects = new Map<string, boolean>(), seen = new Set<string>();
	const merge = (entries: Map<string, boolean>) => { for (const [effect, protectedEffect] of entries) { effects.set(effect, (effects.get(effect) ?? true) && protectedEffect); } };
	const walk = (steps: string[], locks: string[], depth: number) => { if (depth > 16) { return; } for (const id of steps) {
		if (seen.has(id)) { continue; } seen.add(id); const call = model.foundation.occurrences.find(entry => entry.id === id), frame = model.foundation.frames.find(entry => entry.id === id);
		for (const effect of model.foundation.blueprint?.operations.find(operation => operation.id === call?.operationId)?.effects ?? []) { effects.set(effect, (effects.get(effect) ?? true) && locks.includes(effect)); }
		if (frame?.kind === 'ref') { merge(interactionEffects(model, frame.interactionId, locks, new Set(visited))); }
		else if (frame) { for (const steps of interactionFrameSteps(frame)) { walk(steps, frame.kind === 'critical' ? [...locks, frame.resource] : locks, depth + 1); } }
	} }; walk(interaction?.execution?.steps ?? [], locks, 0); return effects;
}

/** Compile a detached dependency closure; unrelated prose, geometry and code never enter the runtime. */
export function compileModelInteraction(model: SemanticModelV4, targetId: string): InteractionProgram {
	const reasons = validateModelInteraction(model, targetId); if (reasons.length) { throw new Error('Invalid interaction: ' + reasons.join(', ')); }
	const ids = new Set([targetId]); for (const id of ids) { const entry = model.foundation.interactions.find(entry => entry.id === id)!; for (const frame of model.foundation.frames.filter(frame => entry.frameIds.includes(frame.id))) { if (frame.kind === 'ref') { ids.add(frame.interactionId); } } }
	const interactions = model.foundation.interactions.filter(entry => ids.has(entry.id));
	const occurrenceIds = new Set(interactions.flatMap(entry => entry.occurrenceIds)), frameIds = new Set(interactions.flatMap(entry => entry.frameIds));
	const occurrences = model.foundation.occurrences.filter(entry => occurrenceIds.has(entry.id)), operationIds = new Set([...occurrences.map(entry => entry.operationId), ...interactions.map(entry => entry.execution!.operationId)]);
	const selected = model.foundation.blueprint!.operations.filter(entry => operationIds.has(entry.id)), selectedFrames = model.foundation.frames.filter(entry => frameIds.has(entry.id));
	const typeIds = new Set(selected.flatMap(operation => [...operation.inputs, ...operation.outputs, ...operation.errors].map(field => field.typeId!).filter(Boolean)));
	for (const frame of selectedFrames) { if (frame.kind === 'loop') { typeIds.add(frame.iterationTypeId); } }
	const data = JSON.stringify({ occurrences, frames: selectedFrames, interactions }); for (const type of model.foundation.types) { if (data.includes(JSON.stringify(type.id))) { typeIds.add(type.id); } }
	for (const id of typeIds) { const type = model.foundation.types.find(type => type.id === id); for (const nested of [...type?.fields.map(field => field.typeId) ?? [], type?.itemTypeId, type?.targetTypeId]) { if (nested) { typeIds.add(nested); } } }
	const runtimeModel: SemanticModelV4 = { version: 4, id: model.id, name: model.name, semantics: { elements: [], relations: [] }, views: [], codeMappings: [], verifications: [], foundation: { types: model.foundation.types.filter(type => typeIds.has(type.id)), occurrences, frames: selectedFrames, interactions, ownership: [], memberships: [], integrations: [], assertions: [], platform: { bindings: [] }, decisions: [], blueprint: { operations: selected, interfaces: [], ports: [], connections: [], transports: [], modules: [], fieldMappings: [] } } };
	return structuredClone({ version: 1, targetId, model: interactionValueModel(runtimeModel) });
}

class InteractionFailure extends Error { readonly reason: string; readonly at: string; constructor(reason: string, at: string) { super(reason); this.reason = reason; this.at = at; } }
function fail(code: string, id: string): never { throw new InteractionFailure(code, id); }
function valuesFor(model: SemanticModelV4, args: InteractionArgument[], fields: ModelField[], scope: ExpressionScope, input: Record<string, ModelValue>): Record<string, ModelValue> {
	const result: Record<string, ModelValue> = Object.create(null);
	for (const arg of args) { const value = evaluateModelExpression(model, arg.expression, scope, input); if (value !== undefined) { result[arg.fieldId] = value; } }
	assertFields(model, fields, result); return { ...result };
}
function assertFields(model: SemanticModelV4, fields: ModelField[], input: Record<string, ModelValue>): void {
	if (Object.keys(input).some(id => !fields.some(field => field.id === id)) || fields.some(field => Object.hasOwn(input, field.id!) ? !isModelValue(model, field.typeId!, input[field.id!], field.nullable?.state === 'known' && field.nullable.value === true) : field.required)) { throw new Error('messageValueType'); }
}

/** Scripted responses are data only. Cancellation clears timers and the join drains all branches. */
export async function interpretModelInteraction(model: SemanticModelV4, targetId: string, input: Record<string, ModelValue>, replies: InteractionReplies): Promise<InteractionResult> {
	const program = compileModelInteraction(model, targetId); return executeInteractionProgram(program, input, replies);
}
export async function executeInteractionProgram(program: InteractionProgram, input: Record<string, ModelValue>, replies: InteractionReplies, signal?: AbortSignal, observe?: (entry: InteractionTrace) => void): Promise<InteractionResult> {
	replies = structuredClone(replies);
	const model = structuredClone(program.model), f = model.foundation, operations = f.blueprint!.operations, trace: InteractionTrace[] = [], joins: InteractionResult['joins'] = [], consumed = new Map<string, number>(), mutex = new Map<string, Promise<void>>(); let calls = 0;
	const record = (entry: InteractionTrace) => { trace.push(entry); observe?.(structuredClone(entry)); };
	const run = async (id: string, values: Record<string, ModelValue>, signal: AbortSignal): Promise<Record<string, ModelValue>> => {
		const interaction = f.interactions.find(entry => entry.id === id)!, execution = interaction.execution!, operation = operations.find(entry => entry.id === execution.operationId)!; assertFields(model, operation.inputs, values);
		const walk = async (steps: string[], env: Record<string, ModelValue>, scope: ExpressionScope, currentSignal: AbortSignal): Promise<void> => {
			for (const id of steps) {
				if (currentSignal.aborted) { fail('cancelled', id); }
				const call = f.occurrences.find(entry => entry.id === id), frame = f.frames.find(entry => entry.id === id);
				if (call) {
					if (++calls > interactionRules.maxCalls) { fail('callBudget', id); }
					const execution = call.execution!, operation = operations.find(entry => entry.id === call.operationId)!, args = valuesFor(model, execution.arguments, operation.inputs, scope, env), correlation = evaluateModelExpression(model, execution.correlation, scope, env)!;
					record({ kind: 'call', id, operationId: operation.id, correlation, value: args });
					const index = consumed.get(id) ?? 0; consumed.set(id, index + 1); const reply = replies[id]?.[index];
					if (!reply || !Number.isSafeInteger(reply.delayMs) || reply.delayMs < 0 || reply.delayMs > 30000 || !!reply.outputs === !!reply.error) { fail('replyContract', id); }
					await new Promise<void>((resolve, reject) => {
						let timer: ReturnType<typeof setTimeout>, deadline: ReturnType<typeof setTimeout>;
						const done = (reason?: string) => { clearTimeout(timer); clearTimeout(deadline); currentSignal.removeEventListener('abort', cancel); if (reason) { record({ kind: reason === 'timeout' ? 'timeout' : 'cancel', id }); reject(new InteractionFailure(reason, id)); } else { resolve(); } };
						const cancel = () => done('cancelled'); currentSignal.addEventListener('abort', cancel, { once: true });
						timer = setTimeout(() => done(), reply.delayMs); deadline = setTimeout(() => done('timeout'), execution.timeoutMs);
						if (currentSignal.aborted) { cancel(); }
					});
					if (reply.error) {
						const error = operation.errors.find(error => error.code === reply.error!.code); if (!error || !isModelValue(model, error.typeId, reply.error.details, false)) { fail('undeclaredError', id); }
						record({ kind: 'error', id, value: reply.error.details }); fail(reply.error.code, id);
					}
					assertFields(model, operation.outputs, reply.outputs!); record({ kind: 'reply', id, value: reply.outputs! }); env[execution.resultId] = reply.outputs!; scope[execution.resultId] = { typeId: '$result.' + operation.id, nullable: false, optional: false };
				} else if (frame && frame.kind !== 'unspecified') {
					const guard = (g: ModelExpression, input = env, variables = scope) => { const value = evaluateModelExpression(model, g, variables, input); if (typeof value !== 'boolean') { fail('indeterminateGuard', id); } return value; };
					if (frame.kind === 'alt') {
						const matches = frame.operands.filter(operand => operand.guard && guard(operand.guard)); if (matches.length > 1) { fail('ambiguousGuard', id); }
						await walk((matches[0] ?? frame.operands.find(operand => operand.guard === null)!).steps, { ...env }, { ...scope }, currentSignal);
					} else if (frame.kind === 'opt') { if (guard(frame.guard)) { await walk(frame.steps, { ...env }, { ...scope }, currentSignal); } }
					else if (frame.kind === 'loop') {
						const inner = { ...scope, [frame.iterationId]: { typeId: frame.iterationTypeId, nullable: false, optional: false } }; let iteration = 0;
						while (guard(frame.guard, { ...env, [frame.iterationId]: iteration }, inner)) { if (iteration === frame.maxIterations) { fail('loopLimit', id); } await walk(frame.steps, { ...env, [frame.iterationId]: iteration++ }, { ...inner }, currentSignal); }
					} else if (frame.kind === 'ref') {
						const contract = operations.find(entry => entry.id === f.interactions.find(entry => entry.id === frame.interactionId)!.execution!.operationId)!;
						env[frame.resultId] = await run(frame.interactionId, valuesFor(model, frame.arguments, contract.inputs, scope, env), currentSignal); scope[frame.resultId] = { typeId: '$result.' + contract.id, nullable: false, optional: false };
					} else if (frame.kind === 'critical') {
						const previous = mutex.get(frame.resource) ?? Promise.resolve(); let release!: () => void; const current = new Promise<void>(resolve => { release = resolve; }); mutex.set(frame.resource, previous.then(() => current));
						await previous; let entered = false; try { if (currentSignal.aborted) { record({ kind: 'cancel', id }); fail('cancelled', id); } entered = true; record({ kind: 'enter', id }); await walk(frame.steps, env, scope, currentSignal); } finally { if (entered) { record({ kind: 'exit', id }); } release(); }
					} else {
						const controller = new AbortController(), cancel = () => controller.abort(); currentSignal.addEventListener('abort', cancel, { once: true }); if (currentSignal.aborted) { controller.abort(); }
						let first: InteractionFailure | undefined;
						try {
							const results = await Promise.allSettled(frame.operands.map(async operand => { const branch = { ...env }; try { await walk(operand.steps, branch, { ...scope }, controller.signal); return Object.fromEntries(Object.entries(branch).filter(([id]) => !Object.hasOwn(env, id))); } catch (error) { if (!first) { first = error instanceof InteractionFailure ? error : new InteractionFailure(error instanceof Error ? error.message : 'executionFailed', id); } if (frame.failure === 'cancel') { controller.abort(); } throw error; } }));
							const outcomes = results.map(result => result.status === 'fulfilled' ? 'completed' : result.reason instanceof InteractionFailure ? result.reason.reason : 'executionFailed'); joins.push({ id, outcomes }); record({ kind: 'join', id, value: outcomes }); if (first) { throw first; } env[frame.resultId] = Object.fromEntries(frame.operands.map((operand, index) => [operand.id, results[index].status === 'fulfilled' ? results[index].value! : {}])); scope[frame.resultId] = { typeId: '$join.' + frame.id, nullable: false, optional: false };
						} finally { currentSignal.removeEventListener('abort', cancel); }
					}
				} else { fail('stepMissing', id); }
			}
		};
		const scope = operationScope(operation.inputs); await walk(execution.steps, values, scope, signal); return valuesFor(model, execution.outputs, operation.outputs, scope, values);
	};
	try { return { outcome: 'completed', outputs: await run(program.targetId, structuredClone(input), signal ?? new AbortController().signal), trace, joins }; }
	catch (error) { return { outcome: 'failed', outputs: {}, trace, joins, error: { code: error instanceof InteractionFailure ? error.reason : error instanceof Error ? error.message : 'executionFailed', at: error instanceof InteractionFailure ? error.at : program.targetId } }; }
}

/** Human-readable hierarchy derives from semantic order; view geometry cannot reorder execution. */
export function describeModelInteraction(model: SemanticModelV4, id: string): { id: string; depth: number; kind: string; text: string }[] {
	const rows: { id: string; depth: number; kind: string; text: string }[] = [], interaction = model.foundation.interactions.find(entry => entry.id === id);
	if (interaction?.profile === 'descriptive') {
		const frames = model.foundation.frames.filter(frame => interaction.frameIds.includes(frame.id) && frame.kind === 'unspecified' && frame.description);
		const owner = (id: string): string => frames.find(frame => frame.occurrenceIds.includes(id))?.id ?? id;
		const ordered = (ids: string[], edges: { before: string; after: string }[]): string[][] => {
			const remaining = new Set(ids), layers: string[][] = [];
			while (remaining.size) { const layer = [...remaining].filter(id => !edges.some(edge => edge.after === id && remaining.has(edge.before))); if (!layer.length) { return []; } layers.push(layer); for (const id of layer) { remaining.delete(id); } }
			return layers;
		};
		const message = (id: string, depth: number) => { const call = model.foundation.occurrences.find(entry => entry.id === id)!; rows.push({ id, depth, kind: 'message', text: call.name ?? id }); };
		const edges = interaction.description!.order.map(edge => ({ before: owner(edge.before), after: owner(edge.after) })).filter(edge => edge.before !== edge.after);
		const groups = ordered([...new Set(interaction.occurrenceIds.map(owner))], edges);
		// A frame can surround an external event. Collapsing it may cycle even though occurrence order is valid.
		if (!groups.length && interaction.occurrenceIds.length) {
			if (scenarioUnorderedOccurrences(model, id).size) { rows.push({ id: id + '.partialOrder', depth: 0, kind: 'unordered', text: 'partialOrder' }); }
			for (const layer of scenarioLayers(interaction)) { for (const step of layer) { message(step, 0); } }
			return rows;
		}
		for (const [index, layer] of groups.entries()) {
			if (layer.length > 1) { rows.push({ id: interaction.id + '.layer.' + index, depth: 0, kind: 'unordered', text: 'partialOrder' }); }
			for (const id of layer) {
				const frame = frames.find(frame => frame.id === id);
				if (frame?.kind === 'unspecified' && frame.description) {
					rows.push({ id, depth: 0, kind: frame.description.operator, text: frame.description.operator });
					for (const operand of frame.description.operands) {
						rows.push({ id: operand.id, depth: 1, kind: 'operand', text: operand.condition.state === 'known' ? String(operand.condition.value) : '?' });
						for (const [position, peers] of ordered(operand.steps, interaction.description!.order.filter(edge => operand.steps.includes(edge.before) && operand.steps.includes(edge.after))).entries()) {
							if (peers.length > 1) { rows.push({ id: operand.id + '.layer.' + position, depth: 2, kind: 'unordered', text: 'partialOrder' }); }
							for (const step of peers) { message(step, 2); }
						}
					}
				} else { message(id, 0); }
			}
		}
		return rows;
	}
	const visited = new Set<string>();
	const walk = (steps: string[], depth: number) => { if (depth > 16) { return; } for (const id of steps) {
		if (visited.has(id)) { rows.push({ id, depth, kind: 'invalid', text: id }); continue; } visited.add(id);
		const call = model.foundation.occurrences.find(entry => entry.id === id), frame = model.foundation.frames.find(entry => entry.id === id);
		if (call) { const operation = model.foundation.blueprint?.operations.find(entry => entry.id === call.operationId); rows.push({ id, depth, kind: 'message', text: `${call.from} → ${call.to}: ${operation?.name ?? call.operationId} · ${call.execution?.mode ?? 'draft'} · ${call.execution?.timeoutMs ?? '?'} ms → ${call.execution?.resultId ?? '?'}` }); }
		else if (frame) { const { occurrenceIds, ...policy } = frame; rows.push({ id, depth, kind: frame.kind, text: canonicalJson(policy) }); if ('operands' in frame) { for (const operand of frame.operands) { rows.push({ id: operand.id, depth: depth + 1, kind: 'operand', text: 'guard' in operand && operand.guard === null ? 'else' : operand.id }); walk(operand.steps, depth + 2); } } else { for (const steps of interactionFrameSteps(frame)) { walk(steps, depth + 1); } } }
	} };
	walk(interaction?.execution?.steps ?? [], 0); return rows;
}

// The emitted runtime is fixed text, deliberately independent of transpiler output. See interactionRuntime.ts.
export { emitModelInteraction, interactionRegion, readInteractionRegion, reverseModelInteraction } from './interactionRuntime.js';

export interface InteractionEdit { interaction: ModelInteraction; occurrences: SemanticModelV4['foundation']['occurrences']; frames: ModelFrame[]; expectedRevision?: string }
/** Replace one owned hierarchy atomically; unrelated interactions and all structural intent are retained. */
export function setModelInteraction(model: SemanticModelV4, edit: InteractionEdit): SemanticModelV4 {
	const existing = model.foundation.interactions.find(entry => entry.id === edit.interaction.id);
	if (existing?.execution?.revision !== edit.expectedRevision) { throw new Error('Interaction revision changed'); }
	const other = model.foundation.interactions.filter(entry => entry.id !== edit.interaction.id);
	const oldOccurrences = new Set(existing?.occurrenceIds ?? []), oldFrames = new Set(existing?.frameIds ?? []);
	if (other.some(entry => entry.occurrenceIds.some(id => oldOccurrences.has(id) || edit.occurrences.some(call => call.id === id)) || entry.frameIds.some(id => oldFrames.has(id) || edit.frames.some(frame => frame.id === id)))) { throw new Error('Interaction hierarchy has another owner'); }
	if (edit.occurrences.some(entry => !oldOccurrences.has(entry.id) && model.foundation.occurrences.some(current => current.id === entry.id)) || edit.frames.some(entry => !oldFrames.has(entry.id) && model.foundation.frames.some(current => current.id === entry.id))) { throw new Error('Interaction hierarchy identity belongs to another definition'); }
	const candidate = structuredClone(model);
	const replace = <T extends { id: string }>(previous: T[], owned: Set<string>, values: T[]): T[] => {
		const next = previous.flatMap(entry => { if (!owned.has(entry.id)) { return [entry]; } const replacement = values.find(value => value.id === entry.id); return replacement ? [structuredClone(replacement)] : []; });
		return [...next, ...values.filter(value => !previous.some(entry => entry.id === value.id)).map(value => structuredClone(value))];
	};
	candidate.foundation.occurrences = replace(candidate.foundation.occurrences, oldOccurrences, edit.occurrences);
	candidate.foundation.frames = replace(candidate.foundation.frames, oldFrames, edit.frames);
	candidate.foundation.interactions = replace(candidate.foundation.interactions, new Set([edit.interaction.id]), [edit.interaction]);
	return readSemanticDraft(candidate) as SemanticModelV4;
}
