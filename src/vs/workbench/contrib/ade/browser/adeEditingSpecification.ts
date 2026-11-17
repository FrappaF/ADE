/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { editAdeMessaging } from './adeMessagingEditing.js';
import { readAdeMessagingScenario } from './adeMessagingCriteria.js';
import { compileModelMessaging, simulateMessaging } from '../common/modelMessaging.js';
import { editAdeStateMachine } from './adeStateEditing.js';
import { editAdeInteraction } from './adeInteractionEditing.js';
import { editAdePredicate } from './adePredicateEditing.js';
import { editAdeStack } from './adeStackEditing.js';
import { editAdeTask } from './adeTaskEditing.js';
import { type BlueprintEditMode } from './adeBlueprintEditing.js';
import { AdeBlueprintWizard } from './adeBlueprintWizard.js';
import { type AdeEditingContext } from './adeEditingContext.js';
import { type AdeEditingCommand } from './adeEditingCommands.js';

/** Collects specification intent; domain mutation remains in the project service. */
export async function runAdeSpecificationCommand(ui: AdeEditingContext, command: Extract<AdeEditingCommand, 'taskIntent' | 'createPureFeature' | 'selectStructuralProfile' | 'messaging' | 'simulateMessaging' | 'stateMachine' | 'interaction' | 'predicate' | 'prepareStructuralContext' | 'blueprint' | 'projectDecisions'>, id?: string, mode?: BlueprintEditMode): Promise<void> {
	const view = ui.project.activeView;
	const model = ui.project.model;
	if (command === 'taskIntent') { if ((model.version === 4 || model.version === 5)) { const edits = await editAdeTask(ui.quickInput, model); if (edits) { ui.edit(edits); } } return; }
	if (command === 'createPureFeature') { await ui.project.createPureFeature(); return; }
	if (command === 'selectStructuralProfile') { if ((model.version === 4 || model.version === 5)) { const edits = await editAdeStack(ui.quickInput, model, ui.dialogs); if (edits?.length) { ui.edit(edits); } } return; }
	if (command === 'messaging') { if ((model.version !== 4 && model.version !== 5)) { return; } const edits = await editAdeMessaging(ui.quickInput, model); if (edits?.length) { const entry = edits.find(edit => edit.kind === 'messaging'); if (view && entry?.kind === 'messaging') { edits.push({ kind: 'viewMessaging', viewId: view.id, messagingId: entry.entry.id }); } ui.edit(edits); } return; }
	if (command === 'simulateMessaging') {
		if ((model.version !== 4 && model.version !== 5)) { return; }
		const selected = await ui.quickInput.pick((model.foundation.messaging ?? []).map(topology => ({ label: topology.id, topology })), { title: localize('ade.messaging.simulate', "Simulate Messaging · No Broker") }); if (!selected) { return; }
		const scenario = await readAdeMessagingScenario(ui.quickInput, model, selected.topology); if (!scenario) { return; }
		const result = simulateMessaging(compileModelMessaging(model, selected.topology.id), scenario);
		const labels = { published: localize('ade.messaging.observedPublication', "Publication Observation"), deliveries: localize('ade.messaging.observedDelivery', "Worker Delivery Observation"), deadLetters: localize('ade.messaging.observedDlq', "Dead-letter Outcome"), errors: localize('ade.messaging.observedRejection', "Rejected Step") };
		const observations = (['published', 'deliveries', 'deadLetters', 'errors'] as const).flatMap(kind => result[kind].map(value => ({ label: value, description: labels[kind] })));
		if (!observations.length) { observations.push({ label: localize('ade.messaging.emptySimulation', "No Messages or Deliveries in This Scenario"), description: localize('ade.messaging.emptySimulationHelp', "Add Publish Message or Deliver to Worker steps to observe messaging behavior.") }); }
		await ui.quickInput.pick(observations, { title: localize('ade.messaging.simResult', "Simulation Result · Zero AI Calls · No Network"), placeHolder: localize('ade.messaging.simSummary', "Publication Observations: {0} · Delivery Observations: {1} · Dead Letters: {2} · Rejections: {3}", result.published.length, result.deliveries.length, result.deadLetters.length, result.errors.length) }); return;
	}
	if (command === 'stateMachine') { if ((model.version !== 4 && model.version !== 5)) { return; } const edits = await editAdeStateMachine(ui.quickInput, model); if (edits?.length) { const entry = edits.find(edit => edit.kind === 'stateMachine'); if (view?.kind === 'state' && entry?.kind === 'stateMachine') { edits.push({ kind: 'viewStateMachine', viewId: view.id, stateMachineId: entry.entry.id }); } ui.edit(edits); } return; }
	if (command === 'interaction') {
		if ((model.version !== 4 && model.version !== 5)) { return; }
		const edits = await editAdeInteraction(ui.quickInput, model, id ?? ui.project.selectedId); if (edits?.length) { const entry = edits[0]; if (view?.kind === 'sequence' && entry.kind === 'interaction') { edits.push({ kind: 'viewInteraction', viewId: view.id, interactionId: entry.entry.interaction.id }); } ui.edit(edits); } return;
	}
	if (command === 'predicate') {
		if ((model.version !== 4 && model.version !== 5)) { throw new Error(localize('ade.predicate.upgrade', "Upgrade the model to version 4 to edit predicates.")); }
		const edits = await editAdePredicate(ui.quickInput, model, id ?? ui.project.selectedId); if (edits?.length) { ui.edit(edits); } return;
	}
	if (command === 'prepareStructuralContext') {
		if ((model.version !== 4 && model.version !== 5)) { return; }
		const operation = await ui.quickInput.pick((model.foundation.blueprint?.operations ?? []).map(operation => ({ label: operation.name, operation })), { title: localize('ade.task.target', "Structural Task Operation") }); if (!operation) { return; }
		const intent = model.foundation.tasks?.findLast(task => task.target.kind === 'operation' && task.target.id === operation.operation.id)?.text ?? await ui.name(undefined, localize('ade.task.intent', "Task Intent")); if (!intent) { return; }
		await ui.project.prepareStructuralContext(operation.operation.id, intent); return;
	}
	if (command === 'blueprint' || command === 'projectDecisions') {
		if ((model.version !== 4 && model.version !== 5)) { throw new Error(localize('ade.blueprint.upgrade', "Upgrade the model to version 4 to edit its blueprint.")); }
		const disposables = new DisposableStore();
		try {
			const wizard = disposables.add(new AdeBlueprintWizard(ui.container));
			const edits = await wizard.open(model, id ?? ui.project.selectedId, view, command === 'projectDecisions' ? 'decision' : mode);
			if (edits?.length) {
				ui.edit(edits);
				const created = edits.find(edit => edit.kind === 'c4View' && !model.views.some(view => view.id === edit.view.id));
				if (created?.kind === 'c4View') { ui.project.showDiagram(created.view.id); }
			}
		} finally { disposables.dispose(); }
		return;
	}
}
