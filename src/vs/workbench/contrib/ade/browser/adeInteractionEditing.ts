/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { type IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { type InteractionArgument, type ModelExpression, type ModelField, type ModelFrame, type ModelOccurrence, type SemanticModelV4 } from '../common/modelTypes.js';
import { interactionValueModel, setModelInteraction, validateModelInteraction, type InteractionEdit } from '../common/modelInteractions.js';
import { type VisualEdit } from '../common/visualEditing.js';
import { buildAdeExpression } from './adePredicateEditing.js';

type Dialogs = Pick<IQuickInputService, 'pick' | 'input'>;
type ExecutableFrame = Exclude<ModelFrame, { kind: 'unspecified' }>;
const field = (id: string, name: string, typeId: string): ModelField => ({ id, name, type: '', typeId, required: true, nullable: { state: 'known', value: false } });

/** One detached, hierarchical native editor. Cancel never mutates the project; save is one undoable edit. */
export async function editAdeInteraction(quick: Dialogs, model: SemanticModelV4, elementId?: string): Promise<VisualEdit[] | undefined> {
	const operation = await quick.pick((model.foundation.blueprint?.operations ?? []).map(operation => ({ label: operation.name, picked: operation.ownerId === elementId, operation })), { title: localize('ade.interaction.operation', "Interaction Contract") }); if (!operation) { return; }
	const existing = await quick.pick([{ label: localize('ade.interaction.new', "Create New Interaction"), interaction: undefined as SemanticModelV4['foundation']['interactions'][number] | undefined }, ...model.foundation.interactions.filter(entry => entry.execution?.operationId === operation.operation.id).map(interaction => ({ label: interaction.id, interaction }))], { title: localize('ade.interaction.select', "Executable Interaction") }); if (!existing) { return; }
	const interaction = existing.interaction ? structuredClone(existing.interaction) : { id: generateUuid(), ownerId: operation.operation.ownerId, occurrenceIds: [], frameIds: [], execution: { version: 1 as const, revision: '1', operationId: operation.operation.id, steps: [], outputs: [] } };
	if (!interaction.execution) { return; }
	const occurrences = model.foundation.occurrences.filter(entry => interaction.occurrenceIds.includes(entry.id)).map(entry => structuredClone(entry)), frames = model.foundation.frames.filter(entry => interaction.frameIds.includes(entry.id)).map(entry => structuredClone(entry));
	const rootFields = operation.operation.inputs;
	const expression = (fields: ModelField[], value?: ModelExpression, guard = false) => buildAdeExpression(quick, interactionValueModel({ ...model, foundation: { ...model.foundation, frames: [...model.foundation.frames.filter(entry => !frames.some(frame => frame.id === entry.id)), ...frames], occurrences: [...model.foundation.occurrences.filter(entry => !occurrences.some(call => call.id === entry.id)), ...occurrences] } }), fields, value, guard);
	const args = async (parameters: ModelField[], scope: ModelField[], previous: InteractionArgument[] = []): Promise<InteractionArgument[] | undefined> => {
		const result: InteractionArgument[] = [];
		for (const parameter of parameters) {
			const chosen = await quick.pick([{ label: localize('ade.interaction.argument', "Set {0}", parameter.name), set: true }, ...(!parameter.required ? [{ label: localize('ade.interaction.omit', "Omit Optional Value"), set: false }] : [])], { title: localize('ade.interaction.arguments', "Typed Arguments") }); if (!chosen) { return; } if (!chosen.set) { continue; }
			const value = await expression(scope, previous.find(entry => entry.fieldId === parameter.id)?.expression); if (!value) { return; } result.push({ fieldId: parameter.id!, expression: value });
		}
		return result;
	};
	const integer = async (title: string, value: number, maximum: number) => { const answer = await quick.input({ title, value: String(value), validateInput: async input => /^\d+$/.test(input) && Number(input) >= 1 && Number(input) <= maximum ? undefined : localize('ade.interaction.integer', "Enter an integer from 1 to {0}.", maximum) }); return answer === undefined ? undefined : Number(answer); };
	const message = async (scope: ModelField[], previous?: ModelOccurrence): Promise<ModelOccurrence | undefined> => {
		const target = await quick.pick((model.foundation.blueprint?.operations ?? []).map(operation => ({ label: operation.name, picked: operation.id === previous?.operationId, operation })), { title: localize('ade.interaction.call', "Called Operation") }); if (!target) { return; }
		const values = await args(target.operation.inputs, scope, previous?.execution?.arguments); if (!values) { return; }
		const mode = await quick.pick([{ label: localize('ade.interaction.sync', "Synchronous Call"), value: 'sync' as const }, { label: localize('ade.interaction.async', "Asynchronous Local Call"), value: 'async' as const }], { title: localize('ade.interaction.mode', "Call Mode · Required Reply, Propagated Errors") }); if (!mode) { return; }
		const timeoutMs = await integer(localize('ade.interaction.deadline', "Reply Timeout (Milliseconds)"), previous?.execution?.timeoutMs ?? 1000, 30000); if (!timeoutMs) { return; }
		const correlation = await expression(scope, previous?.execution?.correlation); if (!correlation) { return; }
		return { id: previous?.id ?? generateUuid(), from: interaction.ownerId!, to: target.operation.ownerId, operationId: target.operation.id, execution: { mode: mode.value, arguments: values, resultId: previous?.execution?.resultId ?? generateUuid(), response: 'required', failure: 'propagate', timeoutMs, correlation } };
	};
	const configure = async (kind: ExecutableFrame['kind'], scope: ModelField[], previous?: ExecutableFrame): Promise<ExecutableFrame | undefined> => {
		const base = { id: previous?.id ?? generateUuid(), occurrenceIds: previous?.occurrenceIds ?? [] as string[] };
		if (kind === 'ref') {
			const target = await quick.pick(model.foundation.interactions.filter(entry => entry.execution && entry.id !== interaction.id).map(interaction => ({ label: interaction.id, description: interaction.execution!.revision, interaction })), { title: localize('ade.interaction.ref', "Versioned Sub-interaction") }); if (!target) { return; }
			const contract = model.foundation.blueprint!.operations.find(operation => operation.id === target.interaction.execution!.operationId)!;
			const values = await args(contract.inputs, scope, previous?.kind === 'ref' ? previous.arguments : []); if (!values) { return; }
			return { ...base, kind, interactionId: target.interaction.id, revision: target.interaction.execution!.revision, arguments: values, resultId: previous?.kind === 'ref' ? previous.resultId : generateUuid() };
		}
		if (kind === 'critical') {
			const resource = await quick.input({ title: localize('ade.interaction.resource', "Shared Effect Resource · Interaction-local Exclusion"), value: previous?.kind === 'critical' ? previous.resource : undefined, validateInput: async value => value.trim() ? undefined : localize('ade.interaction.resourceRequired', "Name the effect resource declared by the called operations.") }); if (!resource) { return; }
			return { ...base, kind, resource: resource.trim(), scope: 'interaction', steps: previous?.kind === 'critical' ? previous.steps : [] };
		}
		if (kind === 'par') {
			const policy = await quick.pick([{ label: localize('ade.interaction.cancel', "Cancel Remaining Branches and Drain"), value: 'cancel' as const }, { label: localize('ade.interaction.collect', "Collect All Branch Outcomes"), value: 'collect' as const }], { title: localize('ade.interaction.join', "Join All · Results in Declared Order") }); if (!policy) { return; }
			return { ...base, kind, operands: previous?.kind === 'par' ? previous.operands : [1, 2].map(() => ({ id: generateUuid(), steps: [] })), join: 'all', failure: policy.value, resultOrder: 'declared', resultId: previous?.kind === 'par' ? previous.resultId : generateUuid() };
		}
		if (kind === 'alt') {
			const guard = await expression(scope, previous?.kind === 'alt' ? previous.operands[0].guard ?? undefined : undefined, true); if (!guard) { return; }
			return { ...base, kind, selection: 'exclusive', operands: previous?.kind === 'alt' ? previous.operands.map((operand, index) => index === 0 ? { ...operand, guard } : operand) : [{ id: generateUuid(), guard, steps: [] }, { id: generateUuid(), guard: null, steps: [] }] };
		}
		if (kind === 'loop') {
			const domainType = await quick.pick(model.foundation.types.filter(type => type.kind === 'primitive' && type.primitive === 'integer').map(type => ({ label: type.name, domainType: type })), { title: localize('ade.interaction.counter', "Loop Counter Domain Type") }); if (!domainType) { return; }
			const iterationId = previous?.kind === 'loop' ? previous.iterationId : generateUuid(), maxIterations = await integer(localize('ade.interaction.bound', "Maximum Iterations · Exceeding the Limit Fails"), previous?.kind === 'loop' ? previous.maxIterations : 10, 1000); if (!maxIterations) { return; }
			const guard = await expression([...scope, field(iterationId, localize('ade.interaction.iteration', "Iteration (Starts at Zero)"), domainType.domainType.id)], previous?.kind === 'loop' ? previous.guard : undefined, true); if (!guard) { return; }
			return { ...base, kind, guard, iterationId, iterationTypeId: domainType.domainType.id, maxIterations, limit: 'error', steps: previous?.kind === 'loop' ? previous.steps : [] };
		}
		const guard = await expression(scope, previous?.kind === 'opt' ? previous.guard : undefined, true); return guard ? { ...base, kind: 'opt', guard, steps: previous?.kind === 'opt' ? previous.steps : [] } : undefined;
	};
	const extendScope = (scope: ModelField[], steps: string[]): ModelField[] => {
		const next = [...scope];
		for (const id of steps) {
			const call = occurrences.find(entry => entry.id === id), frame = frames.find(entry => entry.id === id);
			if (call?.execution) { next.push(field(call.execution.resultId, localize('ade.interaction.result', "{0} Result", model.foundation.blueprint!.operations.find(operation => operation.id === call.operationId)!.name), '$result.' + call.operationId)); }
			if (frame?.kind === 'ref') { const operationId = model.foundation.interactions.find(entry => entry.id === frame.interactionId)!.execution!.operationId; next.push(field(frame.resultId, localize('ade.interaction.refResult', "Sub-interaction Result"), '$result.' + operationId)); }
			if (frame?.kind === 'par') { next.push(field(frame.resultId, localize('ade.interaction.parallelResult', "Parallel Results in Declared Branch Order"), '$join.' + frame.id)); }
			if (frame?.kind === 'critical') { next.push(...extendScope([], frame.steps)); }
		}
		return next;
	};
	const locations: { steps: string[]; scope: ModelField[]; title: string }[] = [{ steps: interaction.execution.steps, scope: rootFields, title: operation.operation.name }];
	while (true) {
		const location = locations.at(-1)!, scope = extendScope(location.scope, location.steps);
		const selected = await quick.pick([
			...location.steps.map(id => { const call = occurrences.find(entry => entry.id === id), frame = frames.find(entry => entry.id === id); return { label: call ? model.foundation.blueprint!.operations.find(operation => operation.id === call.operationId)!.name : frame?.kind ?? id, description: id, value: 'step', id }; }),
			{ label: localize('ade.interaction.addMessage', "Add Message"), value: 'message', id: '' },
			{ label: localize('ade.interaction.addFrame', "Add Frame"), value: 'frame', id: '' },
			...(locations.length > 1 ? [{ label: localize('ade.interaction.parent', "Return to Parent Frame"), value: 'parent', id: '' }] : []),
			{ label: localize('ade.interaction.save', "Validate and Save Interaction"), value: 'save', id: '' }
		], { title: localize('ade.interaction.hierarchy', "Interaction · {0}", locations.map(entry => entry.title).join(' / ')) }); if (!selected) { return; }
		if (selected.value === 'parent') { locations.pop(); continue; }
		if (selected.value === 'message') { const call = await message(scope); if (!call) { return; } occurrences.push(call); location.steps.push(call.id); continue; }
		if (selected.value === 'frame') {
			const kind = await quick.pick((['alt', 'opt', 'loop', 'par', 'critical', 'ref'] as const).map(value => ({ label: value, value })), { title: localize('ade.interaction.frame', "Frame Kind · critical Is the Canonical Region") }); if (!kind) { return; }
			const frame = await configure(kind.value, scope); if (!frame) { return; } frames.push(frame); location.steps.push(frame.id); continue;
		}
		if (selected.value === 'save') {
			const outputs = await args(operation.operation.outputs, extendScope(rootFields, interaction.execution.steps), interaction.execution.outputs); if (!outputs) { return; }
			interaction.execution.outputs = outputs; interaction.execution.revision = generateUuid();
			const retained = new Set<string>(); const visit = (steps: string[]) => { for (const id of steps) { if (retained.has(id)) { continue; } retained.add(id); const frame = frames.find(entry => entry.id === id); if (frame && 'steps' in frame) { visit(frame.steps); } if (frame && 'operands' in frame) { for (const operand of frame.operands) { visit(operand.steps); } } } }; visit(interaction.execution.steps);
			const ownedOccurrences = occurrences.filter(entry => retained.has(entry.id)), ownedFrames = frames.filter(entry => retained.has(entry.id));
			const descendants = (steps: string[], seen = new Set<string>()): string[] => steps.flatMap(id => { if (seen.has(id)) { return []; } seen.add(id); if (ownedOccurrences.some(call => call.id === id)) { return [id]; } const frame = ownedFrames.find(frame => frame.id === id); return frame && 'steps' in frame ? descendants(frame.steps, seen) : frame && 'operands' in frame ? frame.operands.flatMap(operand => descendants(operand.steps, seen)) : []; });
			for (const frame of ownedFrames) { if ('steps' in frame) { frame.occurrenceIds = descendants(frame.steps); } else if ('operands' in frame) { frame.occurrenceIds = frame.operands.flatMap(operand => descendants(operand.steps)); } }
			 interaction.occurrenceIds = ownedOccurrences.map(entry => entry.id); interaction.frameIds = ownedFrames.map(entry => entry.id);
			const entry: InteractionEdit = { interaction, occurrences: ownedOccurrences, frames: ownedFrames, expectedRevision: existing.interaction?.execution?.revision }, candidate = setModelInteraction(model, entry), errors = validateModelInteraction(candidate, interaction.id);
			if (errors.length) { throw new Error(localize('ade.interaction.invalid', "The interaction is incomplete: {0}", errors.join(', '))); }
			return [{ kind: 'interaction', entry }];
		}
		const index = location.steps.indexOf(selected.id), call = occurrences.find(entry => entry.id === selected.id), frame = frames.find(entry => entry.id === selected.id), before = extendScope(location.scope, location.steps.slice(0, index));
		const action = await quick.pick([
			{ label: localize('ade.interaction.edit', "Edit Policy or Arguments"), value: 'edit' },
			...(frame && frame.kind !== 'ref' && frame.kind !== 'unspecified' ? [{ label: localize('ade.interaction.children', "Open Child Steps"), value: 'children' }] : []),
			...(frame?.kind === 'alt' || frame?.kind === 'par' ? [{ label: localize('ade.interaction.branch', "Add Branch"), value: 'branch' }] : []),
			{ label: localize('ade.interaction.up', "Move Earlier"), value: 'up' }, { label: localize('ade.interaction.down', "Move Later"), value: 'down' }, { label: localize('ade.interaction.remove', "Remove Step and Its Children"), value: 'remove' }
		], { title: selected.label }); if (!action) { return; }
		if (action.value === 'remove') { location.steps.splice(index, 1); }
		else if (action.value === 'up' && index > 0 || action.value === 'down' && index < location.steps.length - 1) { const next = action.value === 'up' ? index - 1 : index + 1; [location.steps[index], location.steps[next]] = [location.steps[next], location.steps[index]]; }
		else if (action.value === 'edit') { if (call) { const changed = await message(before, call); if (!changed) { return; } Object.assign(call, changed); } else if (frame && frame.kind !== 'unspecified') { const changed = await configure(frame.kind, before, frame); if (!changed) { return; } Object.assign(frame, changed); } }
		else if (action.value === 'branch' && frame && 'operands' in frame) { if (frame.kind === 'alt') { const guard = await expression(before, undefined, true); if (!guard) { return; } frame.operands.splice(frame.operands.length - 1, 0, { id: generateUuid(), guard, steps: [] }); } else { frame.operands.push({ id: generateUuid(), steps: [] }); } }
		else if (action.value === 'children' && frame) {
			if ('operands' in frame) { const operand = await quick.pick(frame.operands.map((operand, index) => ({ label: frame.kind === 'alt' && 'guard' in operand && operand.guard === null ? localize('ade.interaction.else', "Else · All Other Outcomes") : localize('ade.interaction.branchNumber', "Branch {0}", index + 1), operand })), { title: localize('ade.interaction.operand', "Frame Operand") }); if (!operand) { return; } locations.push({ steps: operand.operand.steps, scope: before, title: operand.label }); }
			else if ('steps' in frame) { locations.push({ steps: frame.steps, scope: frame.kind === 'loop' ? [...before, field(frame.iterationId, localize('ade.interaction.iteration', "Iteration (Starts at Zero)"), frame.iterationTypeId)] : before, title: frame.kind }); }
		}
	}
}
