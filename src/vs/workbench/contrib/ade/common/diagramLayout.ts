/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SemanticModel, ModelView } from './semanticModel.js';

export type DiagramDensity = 'compact' | 'balanced' | 'spacious';

/** Shared geometry keeps layout, hit targets and obstacle routing in agreement. */
export function diagramNodeWidth(name: string): number { return Math.max(208, Math.min(400, name.length * 8 + 40)); }
export const diagramNodeHeight = 96;

/** Layer the directed graph, grouping cycles into a single layer and separating disconnected components. */
export function arrangeDiagram(model: SemanticModel, view: ModelView, density: DiagramDensity = 'balanced'): ModelView['nodes'] {
	const ids = view.nodes.map(node => node.elementId);
	const members = new Set(ids);
	const edges = model.semantics.relations.filter(edge => view.relationIds.includes(edge.id) && members.has(edge.from) && members.has(edge.to));
	const outgoing = new Map(ids.map(id => [id, edges.filter(edge => edge.from === id).map(edge => edge.to).sort()]));
	const indices = new Map<string, number>(), lows = new Map<string, number>(), groups: string[][] = [], stack: string[] = [];
	const stacked = new Set<string>();
	let next = 0;
	const visit = (id: string): void => {
		indices.set(id, next); lows.set(id, next++); stack.push(id); stacked.add(id);
		for (const target of outgoing.get(id)!) {
			if (!indices.has(target)) { visit(target); lows.set(id, Math.min(lows.get(id)!, lows.get(target)!)); }
			else if (stacked.has(target)) { lows.set(id, Math.min(lows.get(id)!, indices.get(target)!)); }
		}
		if (lows.get(id) === indices.get(id)) {
			const group: string[] = [];
			let member: string;
			do { member = stack.pop()!; stacked.delete(member); group.push(member); } while (member !== id);
			groups.push(group.sort());
		}
	};
	for (const id of [...ids].sort()) { if (!indices.has(id)) { visit(id); } }
	const owner = new Map(groups.flatMap((group, index) => group.map(id => [id, index] as const)));
	const levels = groups.map(() => 0);
	// Tarjan emits target components first, so one reverse traversal computes longest-path layers.
	for (let index = groups.length - 1; index >= 0; index--) {
		for (const id of groups[index]) {
			for (const target of outgoing.get(id)!) { const other = owner.get(target)!; if (other !== index) { levels[other] = Math.max(levels[other], levels[index] + 1); } }
		}
	}
	const gap = density === 'compact' ? 88 : density === 'spacious' ? 224 : 152;
	const rowGap = density === 'compact' ? 72 : density === 'spacious' ? 168 : 112;
	const elements = new Map(model.semantics.elements.map(element => [element.id, element]));
	const columns = new Map<number, string[]>();
	for (const id of ids) { const level = levels[owner.get(id)!]; const column = columns.get(level) ?? []; column.push(id); columns.set(level, column); }
	const positions = new Map<string, { x: number; y: number }>();
	let x = 0;
	for (const [, column] of [...columns].sort(([a], [b]) => a - b)) {
		column.sort();
		column.forEach((id, index) => positions.set(id, { x, y: index * (diagramNodeHeight + rowGap) }));
		x += Math.max(...column.map(id => diagramNodeWidth(elements.get(id)!.name))) + gap;
	}
	return view.nodes.map(node => ({ ...node, ...positions.get(node.elementId)! }));
}
