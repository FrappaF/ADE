/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ModelInteraction, type SemanticModelV4 } from './modelTypes.js';

/** A partial order produces layers; peers have no implied temporal relationship. */
export function scenarioLayers(interaction: ModelInteraction): string[][] {
	const remaining = new Set(interaction.occurrenceIds), layers: string[][] = [];
	const order = interaction.description?.order ?? [];
	while (remaining.size) {
		const layer = [...remaining].filter(id => !order.some(edge => edge.after === id && remaining.has(edge.before)));
		if (!layer.length) { return []; }
		layers.push(layer); for (const id of layer) { remaining.delete(id); }
	}
	return layers;
}

/** Exclusive or parallel operands are explicit; peers within one operand still need order evidence. */
function areSeparateScenarioBranches(model: SemanticModelV4, scenarioId: string, first: string, second: string): boolean {
	const scenario = model.foundation.interactions.find(entry => entry.id === scenarioId);
	return model.foundation.frames.some(frame => {
		if (!scenario?.frameIds.includes(frame.id) || frame.kind !== 'unspecified' || !frame.description || !['alt', 'par'].includes(frame.description.operator)) { return false; }
		const left = frame.description.operands.find(operand => operand.steps.includes(first)), right = frame.description.operands.find(operand => operand.steps.includes(second));
		return !!left && !!right && left.id !== right.id;
	});
}

/** Reachability distinguishes topological display layers from semantic temporal order. */
export function scenarioReachability(interaction: ModelInteraction): Map<string, Set<string>> {
	const edges = interaction.description?.order ?? [], result = new Map<string, Set<string>>();
	for (const id of interaction.occurrenceIds) {
		const reached = new Set<string>(), pending = edges.filter(edge => edge.before === id).map(edge => edge.after);
		while (pending.length) { const next = pending.pop()!; if (reached.has(next)) { continue; } reached.add(next); pending.push(...edges.filter(edge => edge.before === next).map(edge => edge.after)); }
		result.set(id, reached);
	}
	return result;
}

/** Incomparable occurrences remain uncertain even when drawn on different topological layers. */
export function scenarioUnorderedOccurrences(model: SemanticModelV4, scenarioId: string): Set<string> {
	const scenario = model.foundation.interactions.find(entry => entry.id === scenarioId), unknown = new Set<string>();
	if (!scenario) { return unknown; }
	const reachability = scenarioReachability(scenario);
	for (const [index, first] of scenario.occurrenceIds.entries()) {
		for (const second of scenario.occurrenceIds.slice(index + 1)) {
			if (!reachability.get(first)?.has(second) && !reachability.get(second)?.has(first) && !areSeparateScenarioBranches(model, scenarioId, first, second)) { unknown.add(first); unknown.add(second); }
		}
	}
	return unknown;
}
