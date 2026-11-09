/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import type { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import type { SemanticModelV4 } from '../common/semanticModel.js';
import type { ProjectCriteria, StateCase } from '../common/modelProject.js';
import { compileModelStateMachine, type StateScenario, type StateReplies, type StateObservation } from '../common/modelStates.js';
import { adeCriteriaData, readAdeInteractionReplies } from './adeInteractionCriteria.js';

type Dialogs = Pick<IQuickInputService, 'pick' | 'input'>;
/** Every expected state, transition, action call and phase is selected by the author before execution. */
export async function editAdeStateCriteria(quick: Dialogs, model: SemanticModelV4, previous: ProjectCriteria): Promise<ProjectCriteria | undefined> {
	const chosen = await quick.pick((model.foundation.stateMachines ?? []).map(machine => ({ label: model.semantics.elements.find(element => element.id === machine.ownerId)?.name ?? machine.id, machine })), { title: localize('ade.states.criteria', "Independent State Expectations") }); if (!chosen) { return; }
	const machine = chosen.machine, program = compileModelStateMachine(model, machine.id), operation = model.foundation.blueprint!.operations.find(operation => operation.id === machine.operationId)!;
	const criterion = await quick.pick(operation.acceptanceCriteria.map(criterion => ({ label: criterion.then, criterion })), { title: localize('ade.criteria.criterion', "Business Criterion") }); if (!criterion) { return; }
	const name = await quick.input({ title: localize('ade.criteria.name', "Independent Case Name") }); if (!name?.trim()) { return; }
	const { fields } = adeCriteriaData(quick, model), input = await fields(operation.inputs); if (!input) { return; }
	const readReplies = async (): Promise<StateReplies | undefined> => { const replies: StateReplies = Object.create(null); for (const action of machine.actions) { const data = await readAdeInteractionReplies(quick, model, action.interactionId); if (!data) { return; } replies[action.id] = data; } return { ...replies }; };
	const replies = await readReplies(); if (!replies) { return; }
	const scenario: StateScenario = { instanceId: generateUuid(), input, replies, events: [] }, statuses: string[] = [], errors: (string | null)[] = [], transitions: (string | null)[] = [];
	while (scenario.events.length < 1000) {
		const trigger = await quick.pick([{ label: localize('ade.states.finishEvents', "Finish Event Sequence"), event: undefined as typeof machine.events[number] | undefined }, ...machine.events.map(event => ({ label: model.foundation.blueprint!.operations.find(operation => operation.id === event.operationId)!.name, event }))], { title: localize('ade.states.events', "Authored Event Sequence") }); if (!trigger) { return; } if (!trigger.event) { break; }
		const delivery = await quick.input({ title: localize('ade.states.delivery', "Delivery ID · Reuse to Test Duplicates") }); if (!delivery) { return; }
		const payload = await fields(model.foundation.blueprint!.operations.find(operation => operation.id === trigger.event!.operationId)!.inputs); if (!payload) { return; }
		const data = await readReplies(); if (!data) { return; }
		const checkpoint = await quick.pick([{ label: localize('ade.states.continue', "Continue Immediately"), value: 'continue' }, { label: localize('ade.states.settle', "Wait for Do Completion"), value: 'settle' }, { label: localize('ade.states.reopen', "Checkpoint and Reopen"), value: 'reopen' }], { title: localize('ade.states.after', "After This Event") }); if (!checkpoint) { return; }
		const status = await quick.pick(['accepted', 'duplicate', 'rejected', 'failed'].map(value => ({ label: value, value })), { title: localize('ade.states.expectedStatus', "Expected Event Outcome · Authored Independently") }); if (!status) { return; }
		const error = status.value === 'failed' || status.value === 'rejected' ? await quick.input({ title: localize('ade.states.expectedError', "Expected Exact Error Code") }) : ''; if (error === undefined) { return; }
		const transition = await quick.pick([{ label: localize('ade.states.noTransition', "No Selected Transition"), transitionId: null as string | null }, ...machine.transitions.map(transition => ({ label: transition.id, transitionId: transition.id }))], { title: localize('ade.states.expectedTransition', "Expected Selected Transition") }); if (!transition) { return; }
		scenario.events.push({ event: { id: delivery, eventId: trigger.event.id, input: payload }, replies: data, ...(checkpoint.value === 'settle' ? { settle: true } : checkpoint.value === 'reopen' ? { reopen: true } : {}) }); statuses.push(status.value); errors.push(error || null); transitions.push(transition.transitionId);
	}
	const state = await quick.pick(machine.states.map(state => ({ label: model.semantics.elements.find(element => element.id === state.elementId)!.name, id: state.elementId })), { title: localize('ade.states.expectedFinal', "Expected Final State") }); if (!state) { return; }
	const error = await quick.input({ title: localize('ade.states.expectedLatch', "Expected Instance Error · Leave Empty for None") }); if (error === undefined) { return; }
	const activity = await quick.pick(['none', 'completed', 'cancelled', 'failed'].map(value => ({ label: value, value: value as StateObservation['doStatus'] })), { title: localize('ade.states.expectedDo', "Expected Do Outcome") }); if (!activity) { return; }
	const ordered = async (title: string, values: { label: string; id: string }[]) => { const result: string[] = []; while (result.length < 10000) { const choice = await quick.pick([{ label: localize('ade.states.finishOrder', "Finish Expected Order"), id: '' }, ...values], { title }); if (!choice) { return; } if (!choice.id) { return result; } result.push(choice.id); } return result; };
	const calls = await ordered(localize('ade.states.expectedCalls', "Expected Calls · Authored Order"), [...new Set(Object.values(program.actions).flatMap(program => program.model.foundation.occurrences.map(call => call.id)))].map(id => ({ label: id, id }))); if (!calls) { return; }
	const phases = await ordered(localize('ade.states.expectedPhases', "Expected Lifecycle Phases · Authored Order"), [...machine.transitions.flatMap(transition => ['guard', 'commit'].map(phase => ({ label: phase + ': ' + transition.id, id: phase + ':' + transition.id }))), ...machine.actions.flatMap(action => ['entry', 'exit', 'effect', 'doStart', 'doCompleted', 'doCancelled', 'doFailed'].map(phase => ({ label: phase + ': ' + action.id, id: phase + ':' + action.id })))]); if (!phases) { return; }
	const entry: StateCase = { id: name.trim() + '.' + generateUuid(), machineId: machine.id, criterionId: criterion.criterion.id, scenario, expected: { stateId: state.id, error: error || null, doStatus: activity.value, statuses, errors, transitions, calls, phases } };
	return { ...structuredClone(previous), revision: generateUuid(), states: [...previous.states ?? [], entry] };
}
