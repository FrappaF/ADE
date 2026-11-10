/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { type IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { type ModelField, type SemanticModelV4 } from '../common/modelTypes.js';
import { compileModelInteraction, type InteractionReplies } from '../common/modelInteractions.js';
import { resolveValueType, type ModelValue } from '../common/modelValues.js';
import { type InteractionCase, type ProjectCriteria } from '../common/modelProject.js';

type Dialogs = Pick<IQuickInputService, 'pick' | 'input'>;
/** Collect authored JSON data through typed native controls; expectations never come from execution. */
export async function editAdeInteractionCriteria(quick: Dialogs, model: SemanticModelV4, previous: ProjectCriteria): Promise<ProjectCriteria | undefined> {
	const interaction = await quick.pick(model.foundation.interactions.filter(entry => entry.execution).map(interaction => ({ label: interaction.id, interaction })), { title: localize('ade.criteria.interaction', "Independent Interaction Expectations") }); if (!interaction) { return; }
	const operation = model.foundation.blueprint!.operations.find(operation => operation.id === interaction.interaction.execution!.operationId)!;
	const criterion = await quick.pick(operation.acceptanceCriteria.map(criterion => ({ label: criterion.then, criterion })), { title: localize('ade.criteria.criterion', "Business Criterion") }); if (!criterion) { return; }
	const name = await quick.input({ title: localize('ade.criteria.name', "Independent Case Name"), validateInput: async value => value.trim() ? undefined : localize('ade.criteria.nameRequired', "Enter a case name.") }); if (!name) { return; }
	const { fields } = adeCriteriaData(quick, model);
	const input = await fields(operation.inputs); if (!input) { return; }
	const program = compileModelInteraction(model, interaction.interaction.id), replies = await readAdeInteractionReplies(quick, model, interaction.interaction.id); if (!replies) { return; }
	const outcome = await quick.pick([{ label: localize('ade.criteria.completed', "Expected Completion"), value: 'completed' as const }, { label: localize('ade.criteria.failed', "Expected Failure"), value: 'failed' as const }], { title: localize('ade.criteria.expected', "Expected Business Outcome · Authored Independently") }); if (!outcome) { return; }
	let error: string | undefined;
	if (outcome.value === 'failed') { error = (await quick.pick([...new Set(['timeout', 'loopLimit', 'indeterminateGuard', 'ambiguousGuard', ...program.model.foundation.blueprint!.operations.flatMap(operation => operation.errors.map(error => error.code))])].map(code => ({ label: code, code })), { title: localize('ade.criteria.failure', "Expected Failure Code") }))?.code; if (!error) { return; } }
	const outputs = outcome.value === 'completed' ? await fields(operation.outputs) : {}; if (!outputs) { return; }
	const calls: string[] = [];
	while (calls.length < 1000) {
		const choice = await quick.pick([{ label: localize('ade.criteria.finishCalls', "Finish Expected Call Order"), id: '' }, ...program.model.foundation.occurrences.map(call => ({ label: model.foundation.blueprint!.operations.find(operation => operation.id === call.operationId)!.name, description: call.id, id: call.id }))], { title: localize('ade.criteria.order', "Expected Calls · {0} Added", calls.length) }); if (!choice) { return; } if (!choice.id) { break; } calls.push(choice.id);
	}
	const entry: InteractionCase = { id: name.trim() + '.' + generateUuid(), interactionId: interaction.interaction.id, criterionId: criterion.criterion.id, input, replies, expected: { outcome: outcome.value, outputs, calls, ...(error ? { error } : {}) } };
	return { ...structuredClone(previous), revision: generateUuid(), interactions: [...previous.interactions ?? [], entry] };
}

/** Shared typed data authoring for interaction and state criteria. */
export function adeCriteriaData(quick: Dialogs, model: SemanticModelV4) {
	const scalar = async (typeId: string, title: string, depth = 0): Promise<ModelValue | undefined> => {
		if (depth > 16) { throw new Error(localize('ade.criteria.depth', "This Input Exceeds the Supported Depth.")); }
		const type = resolveValueType(model, typeId); if (!type) { return; }
		if (type.kind === 'enum') { return (await quick.pick(type.values!.map(value => ({ label: value, value })), { title }))?.value; }
		if (type.kind === 'record') { return fields(type.fields, depth + 1); }
		if (type.kind === 'collection') {
			const values: ModelValue[] = []; while (values.length < 100) { const action = await quick.pick([{ label: localize('ade.criteria.add', "Add Item"), add: true }, { label: localize('ade.criteria.done', "Finish Collection"), add: false }], { title }); if (!action) { return; } if (!action.add) { return values; } const value = await scalar(type.itemTypeId!, title, depth + 1); if (value === undefined) { return; } values.push(value); } return values;
		}
		if (type.primitive === 'boolean') { return (await quick.pick([{ label: localize('ade.criteria.true', "True"), value: true }, { label: localize('ade.criteria.false', "False"), value: false }], { title }))?.value; }
		const answer = await quick.input({ title, validateInput: async value => type.primitive !== 'integer' || /^-?\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? undefined : localize('ade.criteria.integer', "Enter a safe integer.") }); return answer === undefined ? undefined : type.primitive === 'integer' ? Number(answer) : answer;
	};
	const fields = async (parameters: ModelField[], depth = 0): Promise<Record<string, ModelValue> | undefined> => {
		const result: Record<string, ModelValue> = Object.create(null);
		for (const field of parameters) {
			const nullable = field.nullable?.state === 'known' && field.nullable.value === true;
			const choice = await quick.pick([{ label: localize('ade.criteria.value', "Value for {0}", field.name), value: 'set' }, ...(!field.required ? [{ label: localize('ade.criteria.absent', "Absent"), value: 'absent' }] : []), ...(nullable ? [{ label: localize('ade.criteria.null', "Null"), value: 'null' }] : [])], { title: field.name }); if (!choice) { return; } if (choice.value === 'absent') { continue; } if (choice.value === 'null') { result[field.id!] = null; continue; }
			const value = await scalar(field.typeId!, field.name, depth); if (value === undefined) { return; } result[field.id!] = value;
		} return { ...result };
	};
	return { fields, scalar };
}

export async function readAdeInteractionReplies(quick: Dialogs, model: SemanticModelV4, interactionId: string): Promise<InteractionReplies | undefined> {
	const { fields, scalar } = adeCriteriaData(quick, model);
	const program = compileModelInteraction(model, interactionId), replies: InteractionReplies = {};
	for (const call of program.model.foundation.occurrences) {
		const contract = model.foundation.blueprint!.operations.find(operation => operation.id === call.operationId)!; replies[call.id] = [];
		while (replies[call.id].length < 100) {
			const kind = await quick.pick([{ label: localize('ade.criteria.reply', "Add Successful Reply"), value: 'reply' }, ...contract.errors.map(error => ({ label: error.code, value: error.id })), { label: localize('ade.criteria.finishReplies', "Finish Replies for This Occurrence"), value: 'done' }], { title: localize('ade.criteria.call', "Scripted Data for {0} · {1}", contract.name, call.id) }); if (!kind) { return; } if (kind.value === 'done') { break; }
			const delay = await quick.input({ title: localize('ade.criteria.delay', "Reply Delay (Milliseconds)"), value: '0', validateInput: async value => /^\d+$/.test(value) && Number(value) <= 30000 ? undefined : localize('ade.criteria.delayRange', "Enter an integer from 0 to 30000.") }); if (delay === undefined) { return; }
			if (kind.value === 'reply') { const outputs = await fields(contract.outputs); if (!outputs) { return; } replies[call.id].push({ delayMs: Number(delay), outputs }); }
			else { const error = contract.errors.find(error => error.id === kind.value)!; const details = await scalar(error.typeId, error.code); if (details === undefined) { return; } replies[call.id].push({ delayMs: Number(delay), error: { code: error.code, details } }); }
		}
	}
	return replies;
}
