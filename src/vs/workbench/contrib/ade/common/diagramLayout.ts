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
export function arrangeDiagram(model: SemanticModel, view: ModelView, density: DiagramDensity = 'spacious'): ModelView['nodes'] {
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
	const gap = density === 'compact' ? 88 : density === 'spacious' ? 320 : 152;
	const rowGap = density === 'compact' ? 72 : density === 'spacious' ? 208 : 112;
	const elements = new Map(model.semantics.elements.map(element => [element.id, element]));
	const order = new Map(ids.map((id, index) => [id, index]));
	const layers = new Map<number, number[]>();
	groups.forEach((_, index) => { const level = levels[index]; const layer = layers.get(level) ?? []; layer.push(index); layers.set(level, layer); });
	const positions = new Map<string, { x: number; y: number }>();
	const bands: { ids: string[]; x: number; width: number; height: number }[] = [];
	let layerX = 0;
	for (const [, layer] of [...layers].sort(([a], [b]) => a - b)) {
		layer.sort((a, b) => Math.min(...groups[a].map(id => order.get(id)!)) - Math.min(...groups[b].map(id => order.get(id)!)));
		const count = layer.reduce((sum, group) => sum + groups[group].length, 0);
		const targetHeight = Math.ceil(Math.sqrt(count)) * (diagramNodeHeight + rowGap);
		let columnX = layerX, columnWidth = 0, y = 0, layerRight = layerX;
		for (const index of layer) {
			const group = groups[index].sort((a, b) => order.get(a)! - order.get(b)!);
			const columns = group.length > 3 ? Math.ceil(Math.sqrt(group.length)) : 1;
			const width = Math.max(...group.map(id => diagramNodeWidth(elements.get(id)!.name)));
			const rows = Math.ceil(group.length / columns), groupWidth = columns * (width + gap) - gap;
			if (y && y + rows * (diagramNodeHeight + rowGap) > targetHeight) { columnX += columnWidth + gap; columnWidth = 0; y = 0; }
			group.forEach((id, position) => positions.set(id, { x: columnX + position % columns * (width + gap), y: y + Math.floor(position / columns) * (diagramNodeHeight + rowGap) }));
			columnWidth = Math.max(columnWidth, groupWidth); layerRight = Math.max(layerRight, columnX + groupWidth);
			y += rows * (diagramNodeHeight + rowGap);
		}
		const bandIds = layer.flatMap(index => groups[index]);
		bands.push({ ids: bandIds, x: layerX, width: layerRight - layerX, height: Math.max(...bandIds.map(id => positions.get(id)!.y + diagramNodeHeight)) });
		layerX = layerRight + gap;
	}
	// Long causal chains should occupy the canvas in bands, not shrink to an
	// unreadable horizontal strip when fitted. Edges retain their direction.
	if (bands.length > 3) {
		let rowY = 0;
		for (let start = 0; start < bands.length; start += 3) {
			const row = bands.slice(start, start + 3), width = row.reduce((sum, band) => sum + band.width, 0) + (row.length - 1) * gap;
			let x = 0;
			for (const band of row) {
				const left = start / 3 % 2 ? width - x - band.width : x;
				for (const id of band.ids) { const point = positions.get(id)!; positions.set(id, { x: point.x - band.x + left, y: point.y + rowY }); }
				x += band.width + gap;
			}
			rowY += Math.max(...row.map(band => band.height)) + rowGap;
		}
	}
	return view.nodes.map(node => ({ ...node, ...positions.get(node.elementId)! }));
}
