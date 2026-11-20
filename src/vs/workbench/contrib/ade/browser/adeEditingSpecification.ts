/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { type IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { editAdeMessaging } from './adeMessagingEditing.js';
import { readAdeMessagingScenario } from './adeMessagingCriteria.js';
import { compileModelMessaging, simulateMessaging } from '../common/modelMessaging.js';
import { editAdeStateMachine } from './adeStateEditing.js';
import { editAdeInteraction } from './adeInteractionEditing.js';
import { editAdeDescriptiveInteraction } from './adeDescriptiveInteractionEditing.js';
import { editAdePredicate } from './adePredicateEditing.js';
import { editAdeStack } from './adeStackEditing.js';
import { editAdeTask } from './adeTaskEditing.js';
import { AdeEditingWizard, type AdeWizardReviewLabels } from './adeEditingWizard.js';
import { type AdeEditingContext } from './adeEditingContext.js';
import { type AdeEditingCommand } from './adeEditingCommands.js';

/** Collects specification intent; domain mutation remains in the project service. */
export async function runAdeSpecificationCommand(ui: AdeEditingContext, command: Extract<AdeEditingCommand, 'taskIntent' | 'createPureFeature' | 'selectStructuralProfile' | 'messaging' | 'simulateMessaging' | 'stateMachine' | 'interaction' | 'editScenario' | 'predicate' | 'prepareStructuralContext'>, id?: string): Promise<void> {
	const view = ui.project.activeView;
	const model = ui.project.model;
	const collect = async <T>(title: string, callback: (quick: Pick<IQuickInputService, 'pick' | 'input'>) => Promise<T | undefined>, reviewLabels?: AdeWizardReviewLabels): Promise<T | undefined> => {
		const disposables = new DisposableStore();
		try { return await disposables.add(new AdeEditingWizard(ui.container)).run(title, model.name, callback, reviewLabels); }
		finally { disposables.dispose(); }
	};
	if (command === 'taskIntent') { if ((model.version === 4 || model.version === 5)) { const edits = await collect(localize('ade.task.edit', "Tasks and Clarifications"), quick => editAdeTask(quick, model)); if (edits) { ui.edit(edits); } } return; }
	if (command === 'createPureFeature') { await ui.project.createPureFeature(); return; }
	if (command === 'selectStructuralProfile') { if ((model.version === 4 || model.version === 5)) { const edits = await editAdeStack(ui.quickInput, model, ui.dialogs); if (edits?.length) { ui.edit(edits); } } return; }
	if (command === 'messaging') { if ((model.version !== 4 && model.version !== 5)) { return; } const edits = await collect(localize('ade.messaging.edit', "Edit Messaging"), quick => editAdeMessaging(quick, model)); if (edits?.length) { const entry = edits.find(edit => edit.kind === 'messaging'); if (view && entry?.kind === 'messaging') { edits.push({ kind: 'viewMessaging', viewId: view.id, messagingId: entry.entry.id }); } ui.edit(edits); } return; }
	if (command === 'simulateMessaging') {
		if ((model.version !== 4 && model.version !== 5)) { return; }
		const configured = await collect(localize('ade.messaging.simulate', "Simulate Messaging · No Broker"), async quick => {
			const topologies = model.foundation.messaging ?? [];
			const topology = topologies.length === 1 ? topologies[0] : (await quick.pick(topologies.map(topology => ({ label: topology.id, topology })), { title: localize('ade.messaging.simulate', "Simulate Messaging · No Broker") }))?.topology;
			if (!topology) { return; }
			const scenario = await readAdeMessagingScenario(quick, model, topology);
			return scenario ? { topologyId: topology.id, scenario } : undefined;
		}, {
			heading: localize('ade.messaging.reviewScenario', "Review Simulation Scenario"),
			help: localize('ade.messaging.reviewScenarioHelp', "Check the publication and delivery steps before running the scenario locally."),
			confirm: localize('ade.messaging.runSimulation', "Run Simulation")
		});
		if (!configured) { return; }
		const result = simulateMessaging(compileModelMessaging(model, configured.topologyId), configured.scenario);
		const labels = { published: localize('ade.messaging.observedPublication', "Publication Observation"), deliveries: localize('ade.messaging.observedDelivery', "Worker Delivery Observation"), deadLetters: localize('ade.messaging.observedDlq', "Dead-letter Outcome"), errors: localize('ade.messaging.observedRejection', "Rejected Step") };
		const observations = (['published', 'deliveries', 'deadLetters', 'errors'] as const).flatMap(kind => result[kind].map(value => ({ label: value, description: labels[kind] })));
		if (!observations.length) { observations.push({ label: localize('ade.messaging.emptySimulation', "No Messages or Deliveries in This Scenario"), description: localize('ade.messaging.emptySimulationHelp', "Add Publish Message or Deliver to Worker steps to observe messaging behavior.") }); }
		await ui.quickInput.pick(observations, { title: localize('ade.messaging.simResult', "Simulation Result · Zero AI Calls · No Network"), placeHolder: localize('ade.messaging.simSummary', "Publication Observations: {0} · Delivery Observations: {1} · Dead Letters: {2} · Rejections: {3}", result.published.length, result.deliveries.length, result.deadLetters.length, result.errors.length) }); return;
	}
	if (command === 'stateMachine') { if ((model.version !== 4 && model.version !== 5)) { return; } const edits = await collect(localize('ade.states.edit', "Edit State Machine"), quick => editAdeStateMachine(quick, model)); if (edits?.length) { const entry = edits.find(edit => edit.kind === 'stateMachine'); if (view?.kind === 'state' && entry?.kind === 'stateMachine') { edits.push({ kind: 'viewStateMachine', viewId: view.id, stateMachineId: entry.entry.id }); } ui.edit(edits); } return; }
	if (command === 'editScenario') {
		if (view) { await editAdeDescriptiveInteraction(ui, view, id); }
		return;
	}
	if (command === 'interaction') {
		if ((model.version !== 4 && model.version !== 5)) { return; }
		const edits = await collect(localize('ade.interaction.edit', "Edit Interaction"), quick => editAdeInteraction(quick, model, id ?? ui.project.selectedId)); if (edits?.length) { const entry = edits[0]; if (view?.kind === 'sequence' && entry.kind === 'interaction') { edits.push({ kind: 'viewInteraction', viewId: view.id, interactionId: entry.entry.interaction.id }); } ui.edit(edits); } return;
	}
	if (command === 'predicate') {
		if ((model.version !== 4 && model.version !== 5)) { throw new Error(localize('ade.predicate.upgrade', "Upgrade the model to version 4 to edit predicates.")); }
		const edits = await collect(localize('ade.predicate.edit', "Edit Predicate"), quick => editAdePredicate(quick, model, id ?? ui.project.selectedId)); if (edits?.length) { ui.edit(edits); } return;
	}
	if (command === 'prepareStructuralContext') {
		if ((model.version !== 4 && model.version !== 5)) { return; }
		const configured = await collect(localize('ade.task.prepare', "Prepare Structural Context"), async quick => {
			const operation = await quick.pick((model.foundation.blueprint?.operations ?? []).map(operation => ({ label: operation.name, operation })), { title: localize('ade.task.target', "Structural Task Operation") }); if (!operation) { return; }
			const intent = model.foundation.tasks?.findLast(task => task.target.kind === 'operation' && task.target.id === operation.operation.id)?.text ?? await quick.input({ title: localize('ade.task.intent', "Task Intent"), validateInput: async value => value.trim() ? undefined : localize('ade.task.required', "Enter a value.") });
			return intent ? { operationId: operation.operation.id, intent } : undefined;
		});
		if (configured) { await ui.project.prepareStructuralContext(configured.operationId, configured.intent); } return;
	}
}
