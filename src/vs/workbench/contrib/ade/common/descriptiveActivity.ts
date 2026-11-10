/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { wrapDiagramText } from './diagramLayout.js';
import { scenarioLayers, scenarioUnorderedOccurrences } from './modelScenario.js';
import { type Knowledge, type SemanticModelV4 } from './modelTypes.js';

interface ActivityBox { x: number; y: number; width: number; height: number }
export interface DescriptiveActivityProjection {
	width: number; height: number;
	nodes: (ActivityBox & { occurrenceId: string; participantId: string; name: string; endpoints: string; evidenceIds: string[] })[];
	edges: { before: string; after: string; evidenceIds: string[]; basis: string }[];
	groups: (ActivityBox & { id: string; operator: string; operands: (ActivityBox & { id: string; condition: Knowledge })[] })[];
	unordered: boolean;
}

/** Activities project occurrences and only declared order. Grouping never adds execution edges. */
export function projectDescriptiveActivity(model: SemanticModelV4, scenarioId: string): DescriptiveActivityProjection {
	const scenario = model.foundation.interactions.find(entry => entry.id === scenarioId);
	if (!scenario?.description || scenario.profile !== 'descriptive') { throw new Error('descriptiveScenarioRequired'); }
	const calls = scenario.occurrenceIds.map(id => model.foundation.occurrences.find(entry => entry.id === id)!);
	const frames = model.foundation.frames.filter(frame => scenario.frameIds.includes(frame.id) && frame.kind === 'unspecified' && frame.description);
	const layers = scenarioLayers(scenario), levels = new Map(layers.flatMap((layer, index) => layer.map(id => [id, index] as const)));
	const elements = new Map(model.semantics.elements.map(element => [element.id, element.name]));
	const labels = new Map(calls.map(call => [call.id, { name: call.name ?? call.id, endpoints: `${elements.get(call.from) ?? call.from} → ${elements.get(call.to) ?? call.to}` }]));
	const nodeWidth = Math.max(240, Math.min(440, Math.max(1, ...[...labels.values()].flatMap(label => [label.name.length, label.endpoints.length])) * 8 + 40));
	const columns = Math.max(1, Math.floor((nodeWidth - 32) / 8));
	const nodeHeight = Math.max(104, 48 + Math.max(1, ...[...labels.values()].map(label => wrapDiagramText(label.name, columns).length + wrapDiagramText(label.endpoints, columns).length)) * 22);
	const conditionRows = Math.max(1, ...frames.flatMap(frame => frame.kind === 'unspecified' && frame.description ? frame.description.operands.map(operand => wrapDiagramText('Condition: ' + (operand.condition.state === 'known' ? String(operand.condition.value) : '?'), columns).length + 1) : []));
	const headerHeight = Math.max(112, 80 + conditionRows * 22);
	const rowHeight = nodeHeight + 120, nodes: DescriptiveActivityProjection['nodes'] = [], groups: DescriptiveActivityProjection['groups'] = [];
	const height = Math.max(240, headerHeight + layers.length * rowHeight + 64); let x = 32;
	const placed = new Set<string>();
	const place = (ids: string[], left: number): number => {
		const counts = new Map<number, number>();
		for (const id of ids) {
			const call = calls.find(call => call.id === id); if (!call || placed.has(id)) { continue; }
			const level = levels.get(id) ?? 0, column = counts.get(level) ?? 0; counts.set(level, column + 1); placed.add(id);
			nodes.push({ occurrenceId: id, participantId: call.to, ...labels.get(id)!, x: left + column * (nodeWidth + 48), y: headerHeight + level * rowHeight, width: nodeWidth, height: nodeHeight, evidenceIds: call.evidenceIds ?? [] });
		}
		return Math.max(1, ...counts.values()) * (nodeWidth + 48);
	};
	for (const frame of frames) {
		if (frame.kind !== 'unspecified' || !frame.description) { continue; }
		const left = x, operands: DescriptiveActivityProjection['groups'][number]['operands'] = [];
		for (const operand of frame.description.operands) {
			const width = place(operand.steps, x + 20);
			operands.push({ id: operand.id, condition: operand.condition, x, y: 60, width, height: height - 80 }); x += width;
		}
		groups.push({ id: frame.id, operator: frame.description.operator, x: left - 12, y: 24, width: x - left + 24, height: height - 32, operands }); x += 96;
	}
	for (const call of calls.filter(call => !placed.has(call.id))) { x += place([call.id], x) + 24; }
	return { nodes, groups, width: Math.max(720, x + 32), height, edges: [...scenario.description.order], unordered: scenarioUnorderedOccurrences(model, scenarioId).size > 0 };
}
