/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describeModelInteraction } from './modelInteractions.js';
import { scenarioLayers } from './modelScenario.js';
import { canonicalJson } from './modelSerialization.js';
import { type DescriptiveScenario, type ModelFrame, type ModelView, type SemanticModel, type SemanticModelV4 } from './modelTypes.js';
import { InvalidSemanticModelError, validateExploration } from './modelValidation.js';
import { excludeFromView, includeElement } from './visualEditSupport.js';
import { type VisualEditOf } from './visualEditTypes.js';
import { getEditableScenario } from './visualNavigation.js';

type EditableScenario = NonNullable<ReturnType<typeof getEditableScenario>>;
type DescriptiveFrame = Extract<ModelFrame, { kind: 'unspecified' }> & { description: NonNullable<Extract<ModelFrame, { kind: 'unspecified' }>['description']> };
type ScenarioEdge = DescriptiveScenario['order'][number];

function scenarioFrames(model: SemanticModelV4, scenario: EditableScenario): DescriptiveFrame[] {
	return model.foundation.frames.filter((frame): frame is DescriptiveFrame => scenario.frameIds.includes(frame.id) && frame.kind === 'unspecified' && !!frame.description);
}

function containingOperand(frames: readonly DescriptiveFrame[], id: string) {
	return frames.flatMap(frame => frame.description.operands).find(operand => operand.steps.includes(id));
}

function addAuthoredEdge(order: ScenarioEdge[], before: string, after: string): void {
	if (before !== after && !order.some(edge => edge.before === before && edge.after === after)) {
		order.push({ before, after, basis: 'authored', evidenceIds: [] });
	}
}

function validateScenarioOrder(model: SemanticModelV4, scenario: EditableScenario): void {
	const path = '/foundation/interactions/' + scenario.id + '/order';
	const diagnostics = validateExploration(model).filter(diagnostic => diagnostic.path === path);
	if (diagnostics.length) { throw new InvalidSemanticModelError(diagnostics); }
}

/** A participant belongs to an interaction, regardless of which of its views is opened. */
export function addScenarioParticipants(model: SemanticModel, view: ModelView, ids: readonly string[]): void {
	const scenario = getEditableScenario(model, view);
	if (!scenario) { return; }
	const added = ids.filter(id => !scenario.description.participantIds.includes(id));
	if (!added.length) { return; }
	scenario.description.participantIds.push(...new Set(added));
	scenario.authored = true;
	for (const linked of model.views.filter(diagram => diagram.interactionId === scenario.id)) {
		for (const id of added) { includeElement(linked, id, model); }
	}
}

/** Bridge removed intermediate steps so an unrelated part of the flow keeps its ordering. */
function pruneScenarioOrder(previous: ScenarioEdge[], removed: ReadonlySet<string>): ScenarioEdge[] {
	const order = previous.filter(edge => !removed.has(edge.before) && !removed.has(edge.after));
	const outgoing = Map.groupBy(previous, edge => edge.before);
	for (const boundary of previous.filter(edge => !removed.has(edge.before) && removed.has(edge.after))) {
		const pending = [boundary.after], visited = new Set<string>();
		while (pending.length) {
			const id = pending.pop()!;
			if (visited.has(id)) { continue; }
			visited.add(id);
			if (removed.has(id)) { pending.push(...(outgoing.get(id) ?? []).map(edge => edge.after)); }
			else { addAuthoredEdge(order, boundary.before, id); }
		}
	}
	return order;
}

function removeScenarioOccurrences(model: SemanticModelV4, scenario: EditableScenario, removed: ReadonlySet<string>): void {
	if (!removed.size) { return; }
	scenario.description.order = pruneScenarioOrder(scenario.description.order, removed);
	scenario.occurrenceIds = scenario.occurrenceIds.filter(id => !removed.has(id));
	model.foundation.occurrences = model.foundation.occurrences.filter(call => !removed.has(call.id));
	model.foundation.assertions = model.foundation.assertions.filter(assertion => assertion.subject.kind !== 'occurrence' || !removed.has(assertion.subject.id));
	for (const frame of scenarioFrames(model, scenario)) {
		for (const operand of frame.description.operands) {
			if (operand.steps.some(id => removed.has(id))) {
				operand.steps = operand.steps.filter(id => !removed.has(id));
				operand.evidenceIds = [];
			}
		}
		frame.occurrenceIds = frame.description.operands.flatMap(operand => operand.steps);
	}
}

function removeParticipants(model: SemanticModelV4, scenario: EditableScenario, removed: ReadonlySet<string>): void {
	scenario.description.participantIds = scenario.description.participantIds.filter(id => !removed.has(id));
	const owned = new Set(scenario.occurrenceIds);
	removeScenarioOccurrences(model, scenario, new Set(model.foundation.occurrences
		.filter(call => owned.has(call.id) && (removed.has(call.from) || removed.has(call.to))).map(call => call.id)));
	scenario.authored = true;
	for (const linked of model.views.filter(diagram => diagram.interactionId === scenario.id)) {
		for (const id of removed) { excludeFromView(model, linked, id, 'element'); }
	}
}

export function removeScenarioParticipant(model: SemanticModel, view: ModelView, id: string): boolean {
	const scenario = getEditableScenario(model, view);
	if (model.version !== 5 || !scenario?.description.participantIds.includes(id)) { return false; }
	removeParticipants(model, scenario, new Set([id]));
	return true;
}

export function pruneDeletedScenarioParticipants(model: SemanticModelV4, elementIds: ReadonlySet<string>): void {
	if (model.version !== 5) { return; }
	for (const interaction of model.foundation.interactions) {
		if (interaction.profile !== 'descriptive' || !interaction.description) { continue; }
		const scenario = interaction as EditableScenario;
		const removed = new Set(scenario.description.participantIds.filter(id => !elementIds.has(id)));
		if (removed.size) { removeParticipants(model, scenario, removed); }
		if (scenario.ownerId && !elementIds.has(scenario.ownerId) && model.views.some(view => view.interactionId === scenario.id)) {
			delete scenario.ownerId;
			scenario.authored = true;
		}
	}
}

/** Reorder steps within their current operand or the root without crossing alternate branches. */
export function getScenarioStepSiblings(model: SemanticModel, view: ModelView, id: string): string[] {
	const scenario = getEditableScenario(model, view);
	if (model.version !== 5 || !scenario?.occurrenceIds.includes(id)) { return []; }
	const frames = scenarioFrames(model, scenario);
	const operand = containingOperand(frames, id);
	const members = new Set(operand?.steps ?? scenario.occurrenceIds.filter(step => !containingOperand(frames, step)));
	const rows = describeModelInteraction(model, scenario.id).filter(row => row.kind === 'message' && members.has(row.id));
	return rows.map(row => row.id);
}

export function editScenarioSequence(model: SemanticModel, view: ModelView, edit: VisualEditOf<'sequenceOrder' | 'sequenceRemove'>): boolean {
	const scenario = getEditableScenario(model, view);
	if (model.version !== 5 || !scenario) { return false; }
	const ids = edit.target === 'participant' ? scenario.description.participantIds : scenario.occurrenceIds;
	if (!ids.includes(edit.id)) { throw new Error('Unknown scenario entry: ' + edit.id); }
	if (edit.kind === 'sequenceRemove') {
		if (edit.target === 'participant') { removeParticipants(model, scenario, new Set([edit.id])); }
		else { removeScenarioOccurrences(model, scenario, new Set([edit.id])); }
	} else if (edit.target === 'participant') {
		const index = ids.indexOf(edit.id), other = index + edit.direction;
		if (other < 0 || other >= ids.length) { return true; }
		[ids[index], ids[other]] = [ids[other], ids[index]];
		for (const linked of model.views.filter(diagram => diagram.interactionId === scenario.id)) {
			const first = linked.nodes.findIndex(node => node.elementId === ids[index]), second = linked.nodes.findIndex(node => node.elementId === ids[other]);
			if (first >= 0 && second >= 0) { [linked.nodes[first], linked.nodes[second]] = [linked.nodes[second], linked.nodes[first]]; }
		}
	} else {
		const siblings = getScenarioStepSiblings(model, view, edit.id), adjacent = siblings[siblings.indexOf(edit.id) + edit.direction];
		if (!adjacent || !siblings.includes(edit.id)) { return true; }
		// The mirrored edge endpoints retain the dependency graph while exchanging the two positions.
		const swap = (id: string) => id === edit.id ? adjacent : id === adjacent ? edit.id : id;
		scenario.occurrenceIds = scenario.occurrenceIds.map(swap);
		scenario.description.order = scenario.description.order.map(edge => {
			const before = swap(edge.before), after = swap(edge.after);
			return before === edge.before && after === edge.after ? edge : { before, after, basis: 'authored', evidenceIds: [] };
		});
		const frames = scenarioFrames(model, scenario);
		const operand = containingOperand(frames, edit.id);
		if (operand) {
			operand.steps = operand.steps.map(swap);
			operand.evidenceIds = [];
			for (const frame of frames) { frame.occurrenceIds = frame.description.operands.flatMap(operand => operand.steps); }
		}
	}
	scenario.authored = true;
	return true;
}

function appendOrder(scenario: EditableScenario, id: string, scope: readonly string[]): void {
	const predecessors = new Set(scope);
	for (const edge of scenario.description.order) {
		if (predecessors.has(edge.before) && scope.includes(edge.after)) { predecessors.delete(edge.before); }
	}
	for (const predecessor of predecessors) { addAuthoredEdge(scenario.description.order, predecessor, id); }
}

type ScenarioEdit = VisualEditOf<'scenarioOccurrence' | 'scenarioDetails' | 'scenarioFrame' | 'scenarioRemoveFrame' | 'scenarioOrderEdge'>;

/** The renderer projects the edited interaction and keeps all linked views consistent. */
export function applyScenarioEdit(model: SemanticModel, view: ModelView, edit: ScenarioEdit): void {
	const scenario = getEditableScenario(model, view);
	if (model.version !== 5 || !scenario) { throw new Error('A descriptive scenario is required'); }
	const frames = scenarioFrames(model, scenario);
	switch (edit.kind) {
		case 'scenarioDetails': {
			const { trigger, scope } = edit;
			if (trigger === scenario.description.trigger && scope === scenario.description.scope) { return; }
			Object.assign(scenario.description, { trigger, scope, evidenceIds: [] });
			break;
		}
		case 'scenarioOccurrence': {
			const call = model.foundation.occurrences.find(call => call.id === edit.id);
			if (call && !scenario.occurrenceIds.includes(call.id)) { throw new Error('Scenario occurrence belongs to another interaction'); }
			if ([edit.from, edit.to].some(id => !model.semantics.elements.some(element => element.id === id))) { throw new Error('Unknown scenario participant'); }
			addScenarioParticipants(model, view, [edit.from, edit.to]);
			const previous = containingOperand(frames, edit.id);
			const operand = edit.operandId === undefined ? previous : frames.flatMap(frame => frame.description.operands).find(operand => operand.id === edit.operandId);
			if (edit.operandId && !operand) { throw new Error('Unknown scenario branch'); }
			if (call) {
				if (call.from === edit.from && call.to === edit.to && call.name === edit.name && previous === operand) { return; }
				if (call.from !== edit.from || call.to !== edit.to) { delete call.operationId; }
				if (call.from !== edit.from || call.to !== edit.to || call.name !== edit.name) { Object.assign(call, { from: edit.from, to: edit.to, name: edit.name, evidenceIds: [] }); }
			} else {
				model.foundation.occurrences.push({ id: edit.id, profile: 'descriptive', name: edit.name, from: edit.from, to: edit.to, evidenceIds: [] });
				scenario.occurrenceIds.push(edit.id);
			}
			if (!call || previous !== operand) {
				if (call) { scenario.description.order = pruneScenarioOrder(scenario.description.order, new Set([edit.id])); }
				if (previous) {
					previous.steps = previous.steps.filter(step => step !== edit.id);
					previous.evidenceIds = [];
				}
				appendOrder(scenario, edit.id, operand?.steps ?? scenario.occurrenceIds.filter(id => id !== edit.id));
				if (operand) {
					operand.steps.push(edit.id);
					operand.evidenceIds = [];
				}
				for (const frame of frames) { frame.occurrenceIds = frame.description.operands.flatMap(operand => operand.steps); }
				validateScenarioOrder(model, scenario);
			}
			break;
		}
		case 'scenarioFrame': {
			const previous = frames.find(frame => frame.id === edit.id);
			const steps = edit.operands.flatMap(operand => operand.steps);
			const operandIds = new Set(edit.operands.map(operand => operand.id));
			if (edit.operands.length < (edit.operator === 'alt' || edit.operator === 'par' ? 2 : 1) || operandIds.size !== edit.operands.length ||
				new Set(steps).size !== steps.length || steps.some(id => !scenario.occurrenceIds.includes(id))) { throw new Error('Invalid scenario branch contents'); }
			const assigned = new Set(steps);
			for (const frame of frames.filter(frame => frame !== previous)) {
				if (frame.description.operands.some(operand => operandIds.has(operand.id))) { throw new Error('Scenario branch belongs to another frame'); }
				for (const operand of frame.description.operands) {
					if (operand.steps.some(id => assigned.has(id))) {
						operand.steps = operand.steps.filter(id => !assigned.has(id));
						operand.evidenceIds = [];
					}
				}
				frame.occurrenceIds = frame.description.operands.flatMap(operand => operand.steps);
			}
			const operands = edit.operands.map(operand => {
				const old = previous?.description.operands.find(entry => entry.id === operand.id);
				return { ...operand, evidenceIds: old && previous?.description.operator === edit.operator && canonicalJson(old.condition) === canonicalJson(operand.condition) && canonicalJson(old.steps) === canonicalJson(operand.steps) ? old.evidenceIds : [] };
			});
			const replacement: DescriptiveFrame = { id: edit.id, kind: 'unspecified', occurrenceIds: steps, description: { operator: edit.operator, operands } };
			if (previous && canonicalJson(previous) === canonicalJson(replacement)) { return; }
			if (previous) { Object.assign(previous, replacement); }
			else {
				if (model.foundation.frames.some(frame => frame.id === edit.id)) { throw new Error('Scenario frame belongs to another interaction'); }
				model.foundation.frames.push(replacement);
				scenario.frameIds.push(edit.id);
			}
			validateScenarioOrder(model, scenario);
			break;
		}
		case 'scenarioRemoveFrame': {
			if (!frames.some(frame => frame.id === edit.id)) { throw new Error('Unknown scenario frame'); }
			scenario.frameIds = scenario.frameIds.filter(id => id !== edit.id);
			model.foundation.frames = model.foundation.frames.filter(frame => frame.id !== edit.id);
			model.foundation.assertions = model.foundation.assertions.filter(assertion => assertion.subject.kind !== 'frame' || assertion.subject.id !== edit.id);
			break;
		}
		case 'scenarioOrderEdge': {
			if (edit.before === edit.after || !scenario.occurrenceIds.includes(edit.before) || !scenario.occurrenceIds.includes(edit.after)) { throw new Error('Unknown or identical scenario steps'); }
			const hasEdge = scenario.description.order.some(edge => edge.before === edit.before && edge.after === edit.after);
			if (hasEdge !== !!edit.remove) { return; }
			if (edit.remove) { scenario.description.order = scenario.description.order.filter(edge => edge.before !== edit.before || edge.after !== edit.after); }
			else { addAuthoredEdge(scenario.description.order, edit.before, edit.after); }
			if (!scenarioLayers(scenario).length) { throw new Error('Scenario order contains a cycle'); }
			validateScenarioOrder(model, scenario);
			break;
		}
	}
	scenario.authored = true;
}
