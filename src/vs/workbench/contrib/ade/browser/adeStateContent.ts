/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import type { SemanticModelV4 } from '../common/semanticModel.js';
import { describeModelExpression } from '../common/modelValues.js';
import type { StateObservation } from '../common/modelStates.js';

/** One shared, localized projection for native table and accessible reading. */
export function adeStateRows(model: SemanticModelV4, id: string): { id: string; label: string; text: string }[] {
	const machine = model.foundation.stateMachines?.find(machine => machine.id === id); if (!machine) { return []; }
	const name = (id: string) => model.semantics.elements.find(element => element.id === id)?.name ?? id;
	const action = (id: string) => { const ref = machine.actions.find(action => action.id === id), interaction = model.foundation.interactions.find(interaction => interaction.id === ref?.interactionId); return model.foundation.blueprint?.operations.find(operation => operation.id === interaction?.execution?.operationId)?.name ?? id; };
	return [{ id: machine.id, label: name(machine.ownerId), text: localize('ade.states.read.policy', "Flat State Machine: {0}. Revision {1}. One Event at a Time per Instance. Highest True Priority Wins; Equal Winners Fail. Failed Actions Block the Instance Without Advancing State. Persistence: Quiescent Snapshot v1.", name(machine.ownerId), machine.revision) }, ...machine.states.map(state => ({ id: state.elementId, label: name(state.elementId), text: localize('ade.states.read.state', "State: {0}. {1}. Entry: {2}. Exit: {3}. Do: {4}.", name(state.elementId), machine.initialIds.includes(state.elementId) ? localize('ade.states.initial', "Initial State") : machine.finalIds.includes(state.elementId) ? localize('ade.states.final', "Final State") : localize('ade.states.regular', "Regular State"), state.entry.map(action).join(', '), state.exit.map(action).join(', '), state.doActionId ? action(state.doActionId) : localize('ade.states.none', "None")) })), ...machine.transitions.map(transition => {
		const trigger = machine.events.find(event => event.id === transition.eventId), contract = model.foundation.blueprint?.operations.find(operation => operation.id === trigger?.operationId);
		return { id: transition.id, label: name(transition.from) + ' → ' + name(transition.to), text: localize('ade.states.read.transition', "{0} → {1}. Event: {2} ({3}). {4}. Priority: {5}. Guard: {6}. Effects: {7}.", name(transition.from), name(transition.to), contract?.name ?? transition.eventId, contract?.inputs.map(field => field.name + ': ' + (model.foundation.types.find(type => type.id === field.typeId)?.name ?? field.typeId)).join(', ') ?? '', transition.kind === 'internal' ? localize('ade.states.read.internal', "Internal: Effects Only") : localize('ade.states.read.external', "External: Guard, Cancel and Drain Do, Exit, Effects, Entry, Commit, Start Do"), transition.priority, transition.guard ? describeModelExpression(model, transition.guard) : localize('ade.states.read.always', "Always"), transition.effects.map(action).join(', ')) };
	})];
}

export function describeAdeStateSimulation(model: SemanticModelV4, id: string, observation: StateObservation): string {
	const names = new Map(adeStateRows(model, id).map(row => [row.id, row.label]));
	for (const action of model.foundation.stateMachines?.find(machine => machine.id === id)?.actions ?? []) { const interaction = model.foundation.interactions.find(interaction => interaction.id === action.interactionId); names.set(action.id, model.foundation.blueprint?.operations.find(operation => operation.id === interaction?.execution?.operationId)?.name ?? action.id); }
	const calls = new Map(model.foundation.occurrences.map(call => [call.id, model.foundation.blueprint?.operations.find(operation => operation.id === call.operationId)?.name ?? call.id]));
	return [localize('ade.states.simulation.title', "Local State Simulation · Scripted Replies · Zero AI Calls"), localize('ade.states.simulation.result', "State: {0}. Do: {1}. Error: {2}.", names.get(observation.stateId) ?? observation.stateId, observation.doStatus, observation.error ?? localize('ade.states.none', "None")), ...observation.statuses.map((status, index) => localize('ade.states.simulation.event', "Event {0}: {1}. Transition: {2}. Error: {3}.", index + 1, status, names.get(observation.transitions[index] ?? '') ?? observation.transitions[index] ?? '', observation.errors[index] ?? '')), ...observation.phases.map(phase => { const offset = phase.indexOf(':'); return localize('ade.states.simulation.phase', "Phase: {0} · {1}", phase.slice(0, offset), names.get(phase.slice(offset + 1)) ?? phase.slice(offset + 1)); }), localize('ade.states.simulation.calls', "Ordered Calls: {0}", observation.calls.map(id => calls.get(id) ?? id).join(', '))].join('\n');
}
