import { localize } from '../../../../nls.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { type IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { editOrditoMessaging } from './orditoMessagingEditing.js';
import { readOrditoMessagingScenario } from './orditoMessagingCriteria.js';
import { compileModelMessaging, simulateMessaging } from '../common/modelMessaging.js';
import { editOrditoStateMachine } from './orditoStateEditing.js';
import { editOrditoInteraction } from './orditoInteractionEditing.js';
import { editOrditoDescriptiveInteraction } from './orditoDescriptiveInteractionEditing.js';
import { editOrditoPredicate } from './orditoPredicateEditing.js';
import { editOrditoStack } from './orditoStackEditing.js';
import { editOrditoTask } from './orditoTaskEditing.js';
import { OrditoEditingWizard, type OrditoWizardReviewLabels } from './orditoEditingWizard.js';
import { type OrditoEditingContext } from './orditoEditingContext.js';
import { type OrditoEditingCommand } from './orditoEditingCommands.js';

/** Collects specification intent; domain mutation remains in the project service. */
export async function runOrditoSpecificationCommand(ui: OrditoEditingContext, command: Extract<OrditoEditingCommand, 'taskIntent' | 'createPureFeature' | 'selectStructuralProfile' | 'messaging' | 'simulateMessaging' | 'stateMachine' | 'interaction' | 'editScenario' | 'predicate' | 'prepareStructuralContext'>, id?: string): Promise<void> {
	const view = ui.project.activeView;
	const model = ui.project.model;
	const collect = async <T>(title: string, callback: (quick: Pick<IQuickInputService, 'pick' | 'input'>) => Promise<T | undefined>, reviewLabels?: OrditoWizardReviewLabels): Promise<T | undefined> => {
		const disposables = new DisposableStore();
		try { return await disposables.add(new OrditoEditingWizard(ui.container)).run(title, model.name, callback, reviewLabels); }
		finally { disposables.dispose(); }
	};
	if (command === 'taskIntent') { if ((model.version === 4 || model.version === 5)) { const edits = await collect(localize('ordito.task.edit', "Tasks and Clarifications"), quick => editOrditoTask(quick, model)); if (edits) { ui.edit(edits); } } return; }
	if (command === 'createPureFeature') { await ui.project.createPureFeature(); return; }
	if (command === 'selectStructuralProfile') { if ((model.version === 4 || model.version === 5)) { const edits = await editOrditoStack(ui.quickInput, model, ui.dialogs); if (edits?.length) { ui.edit(edits); } } return; }
	if (command === 'messaging') { if ((model.version !== 4 && model.version !== 5)) { return; } const edits = await collect(localize('ordito.messaging.edit', "Edit Messaging"), quick => editOrditoMessaging(quick, model)); if (edits?.length) { const entry = edits.find(edit => edit.kind === 'messaging'); if (view && entry?.kind === 'messaging') { edits.push({ kind: 'viewMessaging', viewId: view.id, messagingId: entry.entry.id }); } ui.edit(edits); } return; }
	if (command === 'simulateMessaging') {
		if ((model.version !== 4 && model.version !== 5)) { return; }
		const configured = await collect(localize('ordito.messaging.simulate', "Simulate Messaging · No Broker"), async quick => {
			const topologies = model.foundation.messaging ?? [];
			const topology = topologies.length === 1 ? topologies[0] : (await quick.pick(topologies.map(topology => ({ label: topology.id, topology })), { title: localize('ordito.messaging.simulate', "Simulate Messaging · No Broker") }))?.topology;
			if (!topology) { return; }
			const scenario = await readOrditoMessagingScenario(quick, model, topology);
			return scenario ? { topologyId: topology.id, scenario } : undefined;
		}, {
			heading: localize('ordito.messaging.reviewScenario', "Review Simulation Scenario"),
			help: localize('ordito.messaging.reviewScenarioHelp', "Check the publication and delivery steps before running the scenario locally."),
			confirm: localize('ordito.messaging.runSimulation', "Run Simulation")
		});
		if (!configured) { return; }
		const result = simulateMessaging(compileModelMessaging(model, configured.topologyId), configured.scenario);
		const labels = { published: localize('ordito.messaging.observedPublication', "Publication Observation"), deliveries: localize('ordito.messaging.observedDelivery', "Worker Delivery Observation"), deadLetters: localize('ordito.messaging.observedDlq', "Dead-letter Outcome"), errors: localize('ordito.messaging.observedRejection', "Rejected Step") };
		const observations = (['published', 'deliveries', 'deadLetters', 'errors'] as const).flatMap(kind => result[kind].map(value => ({ label: value, description: labels[kind] })));
		if (!observations.length) { observations.push({ label: localize('ordito.messaging.emptySimulation', "No Messages or Deliveries in This Scenario"), description: localize('ordito.messaging.emptySimulationHelp', "Add Publish Message or Deliver to Worker steps to observe messaging behavior.") }); }
		await ui.quickInput.pick(observations, { title: localize('ordito.messaging.simResult', "Simulation Result · Zero AI Calls · No Network"), placeHolder: localize('ordito.messaging.simSummary', "Publication Observations: {0} · Delivery Observations: {1} · Dead Letters: {2} · Rejections: {3}", result.published.length, result.deliveries.length, result.deadLetters.length, result.errors.length) }); return;
	}
	if (command === 'stateMachine') { if ((model.version !== 4 && model.version !== 5)) { return; } const edits = await collect(localize('ordito.states.edit', "Edit State Machine"), quick => editOrditoStateMachine(quick, model)); if (edits?.length) { const entry = edits.find(edit => edit.kind === 'stateMachine'); if (view?.kind === 'state' && entry?.kind === 'stateMachine') { edits.push({ kind: 'viewStateMachine', viewId: view.id, stateMachineId: entry.entry.id }); } ui.edit(edits); } return; }
	if (command === 'editScenario') {
		if (view) { await editOrditoDescriptiveInteraction(ui, view, id); }
		return;
	}
	if (command === 'interaction') {
		if ((model.version !== 4 && model.version !== 5)) { return; }
		const edits = await collect(localize('ordito.interaction.edit', "Edit Interaction"), quick => editOrditoInteraction(quick, model, id ?? ui.project.selectedId)); if (edits?.length) { const entry = edits[0]; if (view?.kind === 'sequence' && entry.kind === 'interaction') { edits.push({ kind: 'viewInteraction', viewId: view.id, interactionId: entry.entry.interaction.id }); } ui.edit(edits); } return;
	}
	if (command === 'predicate') {
		if ((model.version !== 4 && model.version !== 5)) { throw new Error(localize('ordito.predicate.upgrade', "Upgrade the model to version 4 to edit predicates.")); }
		const edits = await collect(localize('ordito.predicate.edit', "Edit Predicate"), quick => editOrditoPredicate(quick, model, id ?? ui.project.selectedId)); if (edits?.length) { ui.edit(edits); } return;
	}
	if (command === 'prepareStructuralContext') {
		if ((model.version !== 4 && model.version !== 5)) { return; }
		const configured = await collect(localize('ordito.task.prepare', "Prepare Structural Context"), async quick => {
			const operation = await quick.pick((model.foundation.blueprint?.operations ?? []).map(operation => ({ label: operation.name, operation })), { title: localize('ordito.task.target', "Structural Task Operation") }); if (!operation) { return; }
			const intent = model.foundation.tasks?.findLast(task => task.target.kind === 'operation' && task.target.id === operation.operation.id)?.text ?? await quick.input({ title: localize('ordito.task.intent', "Task Intent"), validateInput: async value => value.trim() ? undefined : localize('ordito.task.required', "Enter a value.") });
			return intent ? { operationId: operation.operation.id, intent } : undefined;
		});
		if (configured) { await ui.project.prepareStructuralContext(configured.operationId, configured.intent); } return;
	}
}
