/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { type IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { type ModelTaskIntent, type SemanticModelV4 } from '../common/modelTypes.js';
import { type VisualEdit } from '../common/visualEditing.js';

/** Human task intent, independently versioned from an immutable context packet. */
export async function editAdeTask(quick: Pick<IQuickInputService, 'pick' | 'input'>, model: SemanticModelV4): Promise<VisualEdit[] | undefined> {
	const choice = await quick.pick([...(model.foundation.tasks ?? []).map(task => ({ label: task.text, task: task as ModelTaskIntent | undefined })), { label: localize('ade.task.new', "Create Task"), task: undefined as ModelTaskIntent | undefined }], { title: localize('ade.task.edit', "Tasks and Clarifications") }); if (!choice) { return; }
	const previous = choice.task;
	const target = previous?.target ?? (await quick.pick([
		...(model.foundation.blueprint?.operations ?? []).map(entry => ({ label: entry.name, target: { kind: 'operation' as const, id: entry.id } })),
		...model.foundation.interactions.filter(entry => entry.execution).map(entry => ({ label: model.foundation.blueprint?.operations.find(operation => operation.id === entry.execution?.operationId)?.name ?? localize('ade.task.interaction', "Interaction"), target: { kind: 'interaction' as const, id: entry.id } })),
		...(model.foundation.stateMachines ?? []).map(entry => ({ label: model.semantics.elements.find(element => element.id === entry.ownerId)?.name ?? localize('ade.task.states', "State Machine"), target: { kind: 'stateMachine' as const, id: entry.id } })),
		...(model.foundation.messaging ?? []).map(entry => ({ label: localize('ade.task.messaging', "Messaging · {0}", entry.channels.map(channel => channel.name).join(', ')), target: { kind: 'messaging' as const, id: entry.id } }))
	], { title: localize('ade.task.scope', "Task Scope") }))?.target; if (!target) { return; }
	const required = async (title: string, value = '') => quick.input({ title, value, ignoreFocusLost: true, validateInput: async value => value.trim() ? undefined : localize('ade.task.required', "Enter a value.") });
	const action = previous ? (await quick.pick([{ label: localize('ade.task.revise', "Revise Intent"), value: 'text' }, { label: localize('ade.task.answer', "Add Clarification"), value: 'clarify' }], { title: localize('ade.task.edit', "Tasks and Clarifications") }))?.value : 'text'; if (!action) { return; }
	const entry: ModelTaskIntent = structuredClone(previous ?? { id: generateUuid(), target, revision: '', text: '', clarifications: [], history: [] });
	if (action === 'text') { const text = await required(localize('ade.task.intent', "Task Intent"), entry.text); if (!text) { return; } entry.text = text; }
	else {
		const question = await required(localize('ade.task.question', "Clarification Question")); if (!question) { return; }
		const answer = await required(localize('ade.task.answerValue', "Answer Saved in the Task Intent")); if (!answer) { return; }
		entry.clarifications.push({ question, answer });
	}
	entry.revision = generateUuid();
	return [{ kind: 'taskIntent', entry, ...(previous ? { expectedRevision: previous.revision } : {}) }];
}
