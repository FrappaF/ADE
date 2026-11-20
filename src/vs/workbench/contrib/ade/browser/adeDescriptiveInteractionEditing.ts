/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { type Knowledge, type ModelFrame, type ModelView } from '../common/modelTypes.js';
import { type AdeEditingContext } from './adeEditingContext.js';
import { AdeFormDialog } from './adeFormDialog.js';
import { adeInteractionRows } from './adeInteractionContent.js';

type Frame = Extract<ModelFrame, { kind: 'unspecified' }> & { description: NonNullable<Extract<ModelFrame, { kind: 'unspecified' }>['description']> };
type Operator = Frame['description']['operator'];
type Operand = Frame['description']['operands'][number];

function scenarioContext(ui: AdeEditingContext, view: ModelView) {
	const model = ui.project.model;
	if (model.version !== 5 || !view.interactionId || (view.kind !== 'activity' && view.kind !== 'sequence')) { return; }
	const scenario = model.foundation.interactions.find(item => item.id === view.interactionId && item.profile === 'descriptive');
	const description = scenario?.description;
	if (!scenario || !description) { return; }
	const frames = model.foundation.frames.filter((frame): frame is Frame => frame.kind === 'unspecified' && !!frame.description && scenario.frameIds.includes(frame.id));
	const occurrences = model.foundation.occurrences.filter(step => scenario.occurrenceIds.includes(step.id));
	const participants = description.participantIds.map(id => ({ value: id, label: model.semantics.elements.find(element => element.id === id)?.name ?? id }));
	return { model, scenario, description, frames, occurrences, participants };
}

const operators: { value: Operator; label: string }[] = [
	{ value: 'alt', label: localize('ade.scenario.operator.alt', "Exclusive Alternatives") },
	{ value: 'opt', label: localize('ade.scenario.operator.opt', "Optional Branch") },
	{ value: 'par', label: localize('ade.scenario.operator.par', "Parallel Branches") },
	{ value: 'loop', label: localize('ade.scenario.operator.loop', "Loop") }
];

const conditionText = (condition: Knowledge) => condition.state === 'known' ? String(condition.value ?? '') : '';

function branchLabel(frame: Frame, frameIndex: number, operand: Operand, operandIndex: number): string {
	const condition = conditionText(operand.condition) || localize('ade.scenario.branch.noCondition', "Condition Unspecified");
	return localize('ade.scenario.branch.label', "{0} {1} · Branch {2} · {3}", operators.find(operator => operator.value === frame.description.operator)?.label, frameIndex + 1, operandIndex + 1, condition);
}

/** Editing a step changes the shared scenario. The same form is used by Connect. */
export async function editAdeDescriptiveMessage(ui: AdeEditingContext, view: ModelView, selection: { id?: string; from?: string; operandId?: string } = {}): Promise<void> {
	const context = scenarioContext(ui, view);
	if (!context?.participants.length) { return; }
	const { occurrences, frames, participants } = context;
	const previous = occurrences.find(step => step.id === selection.id);
	const currentBranch = frames.flatMap(frame => frame.description.operands).find(operand => !!previous && operand.steps.includes(previous.id));
	const choices = [
		{ value: '', label: localize('ade.scenario.root', "Outside a Branch") },
		...frames.flatMap((frame, frameIndex) => frame.description.operands.map((operand, operandIndex) => ({ value: operand.id, label: branchLabel(frame, frameIndex, operand, operandIndex) })))
	];
	const title = view.kind === 'sequence'
		? previous ? localize('ade.scenario.editMessage', "Edit Message") : localize('ade.scenario.addMessage', "Add Message")
		: previous ? localize('ade.scenario.editStep', "Edit Step") : localize('ade.scenario.addStep', "Add Step");
	const dialog = new AdeFormDialog(ui.container, { title, description: view.name });
	try {
		const name = dialog.text(dialog.body, localize('ade.scenario.stepName', "Name"), previous?.name, { required: true });
		const from = dialog.select(dialog.body, localize('ade.scenario.from', "From"), previous?.from ?? selection.from ?? participants[0].value, participants, { required: true });
		const to = dialog.select(dialog.body, localize('ade.scenario.to', "To"), previous?.to ?? participants.find(item => item.value !== from.value)?.value ?? from.value, participants, { required: true });
		const branch = dialog.select(dialog.body, localize('ade.scenario.placement', "Branch"), currentBranch?.id ?? selection.operandId ?? '', choices);
		const change = await dialog.open(() => ({ name: name.value.trim(), from: from.value, to: to.value, operandId: branch.value || null }));
		if (change) {
			if (previous?.name === change.name && previous.from === change.from && previous.to === change.to && (currentBranch?.id ?? null) === change.operandId) { return; }
			const id = previous?.id ?? generateUuid();
			ui.edit({ kind: 'scenarioOccurrence', viewId: view.id, id, ...change });
			ui.project.selectElement(id);
		}
	} finally { dialog.dispose(); }
}

function updateFrame(ui: AdeEditingContext, view: ModelView, id: string, operator: Operator, operands: readonly Operand[]): void {
	const minimum = operator === 'alt' || operator === 'par' ? 2 : 1;
	const newOperands = operands.slice();
	while (newOperands.length < minimum) { newOperands.push({ id: generateUuid(), condition: { state: 'omitted' }, steps: [], evidenceIds: [] }); }
	ui.edit({ kind: 'scenarioFrame', viewId: view.id, id, operator, operands: newOperands });
}

async function editFrameType(ui: AdeEditingContext, view: ModelView, frame?: Frame): Promise<void> {
	const chosen = await ui.quickInput.pick(operators.map(item => ({ ...item, picked: item.value === frame?.description.operator })), {
		title: frame ? localize('ade.scenario.frameType', "Change Frame Type") : localize('ade.scenario.addFrame', "Add Frame")
	});
	if (chosen && chosen.value !== frame?.description.operator) {
		const id = frame?.id ?? generateUuid();
		updateFrame(ui, view, id, chosen.value, frame?.description.operands ?? []);
		ui.project.selectElement(id);
	}
}

async function editScenarioDetails(ui: AdeEditingContext, view: ModelView, previous: { trigger: string; scope: string }): Promise<void> {
	const dialog = new AdeFormDialog(ui.container, { title: localize('ade.scenario.details', "Edit Scenario Details"), description: view.name });
	try {
		const trigger = dialog.text(dialog.body, localize('ade.scenario.trigger', "Trigger"), previous.trigger, { required: true });
		const scope = dialog.text(dialog.body, localize('ade.scenario.scope', "Scope"), previous.scope, { required: true, multiline: true });
		const result = await dialog.open(() => ({ trigger: trigger.value.trim(), scope: scope.value.trim() }));
		if (result && (result.trigger !== previous.trigger || result.scope !== previous.scope)) { ui.edit({ kind: 'scenarioDetails', viewId: view.id, ...result }); }
	} finally { dialog.dispose(); }
}

async function editBranchCondition(ui: AdeEditingContext, view: ModelView, frame: Frame, operand?: Operand): Promise<void> {
	const dialog = new AdeFormDialog(ui.container, {
		title: operand ? localize('ade.scenario.editCondition', "Edit Branch Condition") : localize('ade.scenario.addBranch', "Add Branch"),
		description: view.name
	});
	try {
		const previous = operand ? conditionText(operand.condition) : '';
		const input = dialog.text(dialog.body, localize('ade.scenario.conditionField', "Condition"), previous, { multiline: true });
		const answer = await dialog.open(() => input.value.trim());
		if (answer === undefined || (operand && answer === previous)) { return; }
		const condition: Knowledge = answer ? { state: 'known', value: answer } : { state: 'omitted' };
		const operands = operand ? frame.description.operands.map(item => item.id === operand.id ? { ...item, condition } : item)
			: [...frame.description.operands, { id: generateUuid(), condition, steps: [], evidenceIds: [] }];
		updateFrame(ui, view, frame.id, frame.description.operator, operands);
	} finally { dialog.dispose(); }
}

async function editScenarioOrder(ui: AdeEditingContext, view: ModelView, context: NonNullable<ReturnType<typeof scenarioContext>>): Promise<void> {
	const labels = new Map(context.occurrences.map(step => [step.id, step.name ?? step.id]));
	const edge = await ui.quickInput.pick([
		{ label: localize('ade.scenario.addOrdering', "Add Order Between Steps"), entry: undefined },
		...context.description.order.map(entry => ({ label: localize('ade.scenario.ordering', "{0} before {1}", labels.get(entry.before), labels.get(entry.after)), entry }))
	], { title: localize('ade.scenario.editOrder', "Edit Step Order") });
	if (!edge) { return; }
	if (edge.entry) {
		const remove = await ui.quickInput.pick([{ label: localize('ade.scenario.removeOrdering', "Remove This Order Constraint"), value: true }], { title: edge.label });
		if (remove) { ui.edit({ kind: 'scenarioOrderEdge', viewId: view.id, before: edge.entry.before, after: edge.entry.after, remove: true }); }
		return;
	}
	const steps = [...labels].map(([value, label]) => ({ value, label }));
	const dialog = new AdeFormDialog(ui.container, { title: edge.label, description: view.name });
	try {
		const before = dialog.select(dialog.body, localize('ade.scenario.orderBefore', "Earlier Step"), steps[0].value, steps);
		const after = dialog.select(dialog.body, localize('ade.scenario.orderAfter', "Later Step"), steps[1].value, steps);
		const edit = await dialog.open(() => ({ before: before.value, after: after.value }), result => result.before === result.after ? localize('ade.scenario.sameStep', "Choose two different steps.") : undefined);
		if (edit) { ui.edit({ kind: 'scenarioOrderEdge', viewId: view.id, ...edit }); }
	} finally { dialog.dispose(); }
}

/** Open the selected scenario item directly, or choose an operation from the diagram's Contents menu. */
export async function editAdeDescriptiveInteraction(ui: AdeEditingContext, view: ModelView, selectedId?: string): Promise<void> {
	const context = scenarioContext(ui, view);
	if (!context) { return; }
	const { model, scenario, description, frames, occurrences, participants } = context;
	const labels = new Map(adeInteractionRows(model, scenario.id).map(row => [row.id, row.label]));
	const itemIds = new Set([...scenario.occurrenceIds, ...scenario.frameIds, ...description.participantIds, ...frames.flatMap(frame => frame.description.operands.map(operand => operand.id))]);
	let id = selectedId && itemIds.has(selectedId) ? selectedId : undefined;
	if (!id) {
		const choice = await ui.quickInput.pick([
			{ label: localize('ade.scenario.details', "Edit Scenario Details"), value: 'details', id: '' },
			...(participants.length ? [{ label: view.kind === 'activity' ? localize('ade.scenario.addStep', "Add Step") : localize('ade.scenario.addMessage', "Add Message"), value: 'addStep', id: '' }] : []),
			{ label: localize('ade.scenario.addFrame', "Add Frame"), value: 'addFrame', id: '' },
			...(occurrences.length > 1 ? [{ label: localize('ade.scenario.editOrder', "Edit Step Order"), value: 'order', id: '' }] : []),
			...participants.map(item => ({ label: item.label, description: localize('ade.scenario.participant', "Participant"), value: 'item', id: item.value })),
			...frames.map((frame, index) => ({ label: localize('ade.scenario.frameItem', "{0} · Frame {1}", operators.find(item => item.value === frame.description.operator)?.label, index + 1), value: 'item', id: frame.id })),
			...occurrences.map(item => ({ label: item.name ?? item.id, description: labels.get(item.id), value: 'item', id: item.id }))
		], { title: localize('ade.scenario.editor', "Edit Diagram Scenario") });
		if (!choice) { return; }
		switch (choice.value) {
			case 'details': return editScenarioDetails(ui, view, description);
			case 'addStep': return editAdeDescriptiveMessage(ui, view);
			case 'addFrame': return editFrameType(ui, view);
			case 'order': return editScenarioOrder(ui, view, context);
		}
		id = choice.id;
	}
	if (occurrences.some(step => step.id === id)) { return editAdeDescriptiveMessage(ui, view, { id }); }
	const participant = participants.find(item => item.value === id);
	if (participant) {
		const position = participants.indexOf(participant);
		const choice = await ui.quickInput.pick([
			...(position ? [{ label: localize('ade.scenario.moveParticipantEarlier', "Move Participant Earlier"), direction: -1 as const }] : []),
			...(position < participants.length - 1 ? [{ label: localize('ade.scenario.moveParticipantLater', "Move Participant Later"), direction: 1 as const }] : []),
			{ label: localize('ade.scenario.removeParticipant', "Remove Participant and Its Steps"), direction: 0 as const }
		], { title: participant.label });
		if (choice?.direction) { ui.edit({ kind: 'sequenceOrder', viewId: view.id, id, target: 'participant', direction: choice.direction }); }
		else if (choice) { ui.edit({ kind: 'sequenceRemove', viewId: view.id, id, target: 'participant' }); }
		return;
	}
	const frame = frames.find(item => item.id === id || item.description.operands.some(operand => operand.id === id));
	if (!frame) { return; }
	const operands = frame.description.operands, operator = frame.description.operator;
	const selectedOperand = operands.find(operand => operand.id === id);
	if (!selectedOperand) {
		const pick = await ui.quickInput.pick([
			{ label: localize('ade.scenario.frameType', "Change Frame Type"), value: 'type', id: '' },
			{ label: localize('ade.scenario.addBranch', "Add Branch"), value: 'add', id: '' },
			{ label: localize('ade.scenario.removeFrame', "Remove Frame and Keep Its Steps"), value: 'remove', id: '' },
			...operands.map((operand, index) => ({ label: branchLabel(frame, frames.indexOf(frame), operand, index), value: 'branch', id: operand.id }))
		], { title: labels.get(frame.id) ?? localize('ade.scenario.frame', "Frame") });
		if (pick?.value === 'type') { await editFrameType(ui, view, frame); }
		else if (pick?.value === 'add') { await editBranchCondition(ui, view, frame); }
		else if (pick?.value === 'remove') { ui.edit({ kind: 'scenarioRemoveFrame', viewId: view.id, id: frame.id }); }
		else if (pick?.value === 'branch') { await editAdeDescriptiveInteraction(ui, view, pick.id); }
		return;
	}
	const index = operands.indexOf(selectedOperand);
	const minimum = operator === 'alt' || operator === 'par' ? 2 : 1;
	const pick = await ui.quickInput.pick([
		{ label: localize('ade.scenario.editCondition', "Edit Branch Condition"), value: 'condition' },
		...(participants.length ? [{ label: localize('ade.scenario.addStepToBranch', "Add Step to This Branch"), value: 'step' }] : []),
		...(operands.length > minimum ? [{ label: localize('ade.scenario.removeBranch', "Remove Branch and Keep Its Steps"), value: 'remove' }] : []),
		...(index ? [{ label: localize('ade.scenario.moveBranchEarlier', "Move Branch Earlier"), value: 'earlier' }] : []),
		...(index < operands.length - 1 ? [{ label: localize('ade.scenario.moveBranchLater', "Move Branch Later"), value: 'later' }] : [])
	], { title: branchLabel(frame, frames.indexOf(frame), selectedOperand, index) });
	if (pick?.value === 'condition') { await editBranchCondition(ui, view, frame, selectedOperand); }
	else if (pick?.value === 'step') { await editAdeDescriptiveMessage(ui, view, { operandId: selectedOperand.id }); }
	else if (pick?.value === 'remove') { updateFrame(ui, view, frame.id, operator, operands.filter(item => item !== selectedOperand)); }
	else if (pick) {
		const next = operands.slice();
		next.splice(index, 1);
		next.splice(index + (pick.value === 'earlier' ? -1 : 1), 0, selectedOperand);
		updateFrame(ui, view, frame.id, operator, next);
	}
}
