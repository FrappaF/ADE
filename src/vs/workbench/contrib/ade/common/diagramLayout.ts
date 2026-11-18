/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type SemanticModel, type ModelView, type SemanticElement } from './modelTypes.js';
import { type DiagramBox, type DiagramPoint } from './diagramRouting.js';

export type DiagramDensity = 'compact' | 'balanced' | 'spacious';

interface NodeSize { width: number; height: number }
interface LayoutEdge { from: string; to: string }
interface NotationBoundary extends DiagramBox { elementId: string; name: string }

const boundaryPadding = { inline: 24, top: 44, bottom: 24 };

/** Shared geometry keeps layout, hit targets and obstacle routing in agreement. */
export function diagramNodeWidth(name: string): number { return Math.max(208, Math.min(400, name.length * 8 + 40)); }
export const diagramNodeHeight = 96;

/** Prefer word boundaries; split only tokens that cannot fit on a complete line. */
export function wrapDiagramText(value: string, columns: number): string[] {
	const width = Math.max(1, Math.floor(columns)), lines: string[] = []; let remaining = value;
	while (remaining.length > width) {
		const space = remaining.lastIndexOf(' ', width), end = space > 0 ? space : width;
		lines.push(remaining.slice(0, end)); remaining = remaining.slice(end).trimStart();
	}
	lines.push(remaining); return lines;
}

/** Layer the directed graph, grouping cycles into a single layer and separating disconnected components. */
export function arrangeDiagram(model: SemanticModel, view: ModelView, density: DiagramDensity = 'spacious'): ModelView['nodes'] {
	const ids = view.nodes.map(node => node.elementId);
	const members = new Set(ids);
	const edges = model.semantics.relations.filter(edge => view.relationIds.includes(edge.id) && members.has(edge.from) && members.has(edge.to));
	const gap = density === 'compact' ? 88 : density === 'spacious' ? 320 : 152;
	const rowGap = density === 'compact' ? 72 : density === 'spacious' ? 208 : 112;
	const elements = new Map(model.semantics.elements.map(element => [element.id, element]));
	const sizes = new Map(ids.map(id => [id, notationNodeSize(elements.get(id)!)]));
	const positions = view.kind === 'deployment'
		? arrangeDeployment(ids, edges, sizes, deploymentParents(model, view), density)
		: arrangeLayers(ids, edges, sizes, gap, rowGap);
	// Context dependencies must not appear inside the subject's ownership boundary.
	if (view.subjectId && (view.kind === 'c4Container' || view.kind === 'c4Component')) {
		const owned = notationGroupMembers(model, view, view.subjectId);
		const internal = view.nodes.filter(node => node.elementId !== view.subjectId && owned.has(node.elementId));
		if (internal.length) {
			const right = Math.max(...internal.map(node => positions.get(node.elementId)!.x + sizes.get(node.elementId)!.width)) + gap;
			let y = Math.min(...internal.map(node => positions.get(node.elementId)!.y));
			for (const node of view.nodes.filter(node => !owned.has(node.elementId))) {
				positions.set(node.elementId, { x: right, y });
				y += sizes.get(node.elementId)!.height + rowGap;
			}
		}
	}
	return view.nodes.map(node => ({ ...node, ...positions.get(node.elementId)! }));
}

function arrangeLayers(ids: readonly string[], edges: readonly LayoutEdge[], sizes: ReadonlyMap<string, NodeSize>, gap: number, rowGap: number, groupLayout = false): Map<string, DiagramPoint> {
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
	const order = new Map(ids.map((id, index) => [id, index]));
	const layers = new Map<number, number[]>();
	groups.forEach((_, index) => { const level = levels[index]; const layer = layers.get(level) ?? []; layer.push(index); layers.set(level, layer); });
	const positions = new Map<string, DiagramPoint>();
	const bands: { ids: string[]; x: number; width: number; height: number }[] = [];
	let layerX = 0;
	for (const [, layer] of [...layers].sort(([a], [b]) => a - b)) {
		layer.sort((a, b) => Math.min(...groups[a].map(id => order.get(id)!)) - Math.min(...groups[b].map(id => order.get(id)!)));
		const bandIds = layer.flatMap(index => groups[index]);
		const rowHeight = groupLayout ? Math.max(...bandIds.map(id => sizes.get(id)!.height)) : diagramNodeHeight;
		const targetHeight = Math.ceil(Math.sqrt(bandIds.length)) * (rowHeight + rowGap);
		let columnX = layerX, columnWidth = 0, y = 0, layerRight = layerX;
		for (const index of layer) {
			const group = groups[index].sort((a, b) => order.get(a)! - order.get(b)!);
			const columns = group.length > 3 ? Math.ceil(Math.sqrt(group.length)) : 1;
			const width = Math.max(...group.map(id => sizes.get(id)!.width));
			const groupHeight = Math.max(...group.map(id => sizes.get(id)!.height));
			const rows = Math.ceil(group.length / columns), groupWidth = columns * (width + gap) - gap;
			if (y && y + rows * (groupHeight + rowGap) > targetHeight) { columnX += columnWidth + gap; columnWidth = 0; y = 0; }
			group.forEach((id, position) => positions.set(id, { x: columnX + position % columns * (width + gap), y: y + Math.floor(position / columns) * (groupHeight + rowGap) }));
			columnWidth = Math.max(columnWidth, groupWidth); layerRight = Math.max(layerRight, columnX + groupWidth);
			y += rows * (groupHeight + rowGap);
		}
		bands.push({ ids: bandIds, x: layerX, width: layerRight - layerX, height: Math.max(...bandIds.map(id => positions.get(id)!.y + sizes.get(id)!.height)) });
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
	return positions;
}

/** Measure whole host groups before laying out their siblings, including links between groups. */
function arrangeDeployment(ids: string[], edges: LayoutEdge[], sizes: Map<string, NodeSize>, parents: ReadonlyMap<string, string>, density: DiagramDensity): Map<string, DiagramPoint> {
	const children = Map.groupBy(ids, id => parents.get(id));
	const pathOf = (id: string) => {
		const path = [id];
		for (let parent = parents.get(id); parent; parent = parents.get(parent)) { path.push(parent); }
		return path.reverse();
	};
	const paths = new Map(ids.map(id => [id, pathOf(id)]));
	const projected = new Map<string | undefined, LayoutEdge[]>();
	for (const edge of edges) {
		const from = paths.get(edge.from)!, to = paths.get(edge.to)!;
		let index = 0;
		while (index < from.length && from[index] === to[index]) { index++; }
		// Host-to-descendant links are represented by containment at this level.
		if (index < from.length && index < to.length) {
			const parent = index ? from[index - 1] : undefined, links = projected.get(parent) ?? [];
			links.push({ from: from[index], to: to[index] });
			projected.set(parent, links);
		}
	}
	const gap = density === 'compact' ? 64 : density === 'spacious' ? 144 : 96;
	const rowGap = density === 'compact' ? 48 : density === 'spacious' ? 96 : 64;
	const positions = new Map<string, DiagramPoint>();
	const measure = (parent?: string): void => {
		const siblings = children.get(parent);
		if (!siblings?.length) { return; }
		siblings.forEach(measure);
		const layer = arrangeLayers(siblings, projected.get(parent) ?? [], sizes, gap, rowGap, true);
		const boxes = siblings.map(id => ({ ...layer.get(id)!, ...sizes.get(id)! }));
		const boundary = parent ? encloseBoundary(boxes) : undefined;
		if (parent && boundary) { sizes.set(parent, boundary); }
		for (const [id, position] of layer) {
			positions.set(id, { x: position.x - (boundary?.x ?? 0), y: position.y - (boundary?.y ?? 0) });
		}
	};
	measure();
	const place = (parent: string | undefined, origin: DiagramPoint): void => {
		for (const child of children.get(parent) ?? []) {
			const position = positions.get(child)!;
			const absolute = { x: origin.x + position.x, y: origin.y + position.y };
			positions.set(child, absolute);
			place(child, absolute);
		}
	};
	place(undefined, { x: 0, y: 0 });
	return positions;
}

/** Text compartments are used consistently by geometry, native rendering and accessible reading. */
export function notationLines(element: SemanticElement): string[] {
	return [...[element.details?.technology, element.details?.environment].filter((value): value is string => !!value), ...(element.details?.members ?? []).map(member => `${member.key === 'none' ? '' : member.key.toUpperCase() + ' '}${member.name}${member.kind === 'method' ? '()' : ''}${member.type ? ': ' + member.type : ''}${['table', 'entity', 'resource'].includes(element.kind) && member.kind === 'attribute' && !member.required ? ' ?' : ''}`)];
}
export function notationNodeSize(element: SemanticElement): { width: number; height: number } {
	if (element.kind === 'start' || element.kind === 'end') { return { width: 80, height: 80 }; }
	const lines = notationLines(element);
	if (element.kind === 'useCase') {
		const contentRatio = 0.7;
		const width = Math.max(256, Math.min(440, Math.ceil(Math.max(element.name.length, ...lines.map(line => line.length)) * 8 / contentRatio + 32)));
		// Keep the centered content inside the oval, matching the 70% text width in CSS.
		const columns = Math.max(1, Math.floor((width * contentRatio - 2) / 8));
		const contentHeight = 16 + 8 + wrapDiagramText(element.name, columns).length * 20 + lines.reduce((height, line) => height + 17 + wrapDiagramText(line, columns).length * 22, 0);
		return { width, height: Math.max(136, Math.ceil(width / 2), Math.ceil(contentHeight / contentRatio)) };
	}
	const width = Math.max(208, Math.min(440, Math.max(element.name.length, ...lines.map(line => line.length)) * 8 + 40));
	if (element.kind === 'decision') {
		// At 60% of the diamond's width, its centered content has 40% of its height available.
		const contentRatio = 0.6;
		const columns = Math.max(1, Math.floor(width * contentRatio / 8));
		const contentHeight = wrapDiagramText(element.name, columns).length * 20 + lines.reduce((height, line) => height + 1 + wrapDiagramText(line, columns).length * 22, 0);
		return { width, height: Math.max(96, Math.ceil((contentHeight + 8) / (1 - contentRatio))) };
	}
	const columns = Math.max(1, Math.floor((width - 32) / 8));
	return { width, height: Math.max(96, 60 + Math.ceil(element.name.length / columns) * 20 + lines.reduce((rows, line) => rows + Math.ceil(line.length / columns), 0) * 22) };
}

function encloseBoundary(boxes: readonly DiagramBox[]): DiagramBox {
	const x = Math.min(...boxes.map(box => box.x)) - boundaryPadding.inline;
	const y = Math.min(...boxes.map(box => box.y)) - boundaryPadding.top;
	return {
		x, y,
		width: Math.max(...boxes.map(box => box.x + box.width)) - x + boundaryPadding.inline,
		height: Math.max(...boxes.map(box => box.y + box.height)) - y + boundaryPadding.bottom
	};
}

function isBoundaryElement(element: SemanticElement): boolean {
	return ['system', 'container', 'package', 'deploymentNode', 'networkNode', 'dataStore', 'resource'].includes(element.kind);
}

/** Boundaries use declared containment/hosting and never invent grouping from file paths. */
export function notationBoundaries(model: SemanticModel, view: ModelView): NotationBoundary[] {
	if (!['c4Container', 'c4Component', 'component', 'package', 'deployment', 'network', 'useCase', 'databaseSchema'].includes(view.kind)) { return []; }
	const elements = new Map(model.semantics.elements.map(element => [element.id, element]));
	if (view.kind === 'deployment') {
		const parents = deploymentParents(model, view);
		const groups = Map.groupBy(view.nodes, node => parents.get(node.elementId));
		const boundaries: NotationBoundary[] = [];
		const measure = (node: ModelView['nodes'][number]): DiagramBox => {
			const elementId = node.elementId, element = elements.get(elementId)!;
			const children = groups.get(elementId);
			if (!children?.length) { return { ...node, ...notationNodeSize(element) }; }
			const boundary = { elementId, name: element.name, ...encloseBoundary(children.map(measure)) };
			boundaries.push(boundary);
			return boundary;
		};
		for (const node of groups.get(undefined) ?? []) { measure(node); }
		// Descendants are measured first, but the enclosing boundary paints first.
		return boundaries.reverse();
	}
	const groupMembers = notationGroupResolver(model, view);
	return view.nodes.flatMap(node => {
		const element = elements.get(node.elementId)!;
		if (!isBoundaryElement(element)) { return []; }
		const children = groupMembers(element.id);
		children.delete(element.id);
		const nodes = view.nodes.filter(child => children.has(child.elementId));
		if (!nodes.length) { return []; }
		const boxes = nodes.map(child => ({ ...child, ...notationNodeSize(elements.get(child.elementId)!) }));
		return [{ elementId: element.id, name: element.name, ...encloseBoundary(boxes) }];
	});
}

/** A visible boundary moves its declared descendants and hosted elements as one local layout edit. */
export function notationGroupMembers(model: SemanticModel, view: ModelView, root: string): Set<string> {
	if (view.kind === 'deployment') {
		const parents = deploymentParents(model, view);
		return collectNotationMembers(root, Map.groupBy(parents.keys(), id => parents.get(id)!));
	}
	return notationGroupResolver(model, view)(root);
}

/** A concrete enclosure requires a unique host. Keep other declared hosting links as edges. */
function deploymentParents(model: SemanticModel, view: ModelView): Map<string, string> {
	const visibleNodes = new Set(view.nodes.map(node => node.elementId));
	const visibleRelations = new Set(view.relationIds);
	const hosts = Map.groupBy(model.semantics.relations.filter(relation =>
		relation.kind === 'hosting' && visibleRelations.has(relation.id) && visibleNodes.has(relation.from) && visibleNodes.has(relation.to)
	), relation => relation.to);
	const parents = new Map<string, string>();
	const assignParent = (child: string, parent: string) => {
		for (let ancestor: string | undefined = parent; ancestor; ancestor = parents.get(ancestor)) {
			if (ancestor === child) { return; }
		}
		parents.set(child, parent);
	};
	for (const [id, relations] of hosts) {
		const candidates = new Set(relations.map(relation => relation.from));
		if (candidates.size === 1) { assignParent(id, candidates.values().next().value!); }
	}
	for (const [id, owner] of notationOwners(model)) {
		if (!hosts.has(id)) { assignParent(id, owner); }
	}
	const elements = new Map(model.semantics.elements.map(element => [element.id, element]));
	const enclosed = new Map<string, string>();
	for (const id of visibleNodes) {
		for (let parent = parents.get(id); parent; parent = parents.get(parent)) {
			if (visibleNodes.has(parent) && isBoundaryElement(elements.get(parent)!)) {
				enclosed.set(id, parent);
				break;
			}
		}
	}
	return enclosed;
}

function notationOwners(model: SemanticModel): Map<string, string> {
	const owners = new Map<string, string>();
	if (model.version === 4 || model.version === 5) {
		for (const entry of model.foundation.ownership) { if (entry.role === 'architecture' && !owners.has(entry.elementId)) { owners.set(entry.elementId, entry.ownerId); } }
	} else {
		for (const element of model.semantics.elements) { if (element.parentId) { owners.set(element.id, element.parentId); } }
	}
	return owners;
}

/** Build adjacency once per geometry pass, then visit each reachable element once. */
function notationGroupResolver(model: SemanticModel, view: ModelView): (root: string) => Set<string> {
	const children = new Map<string, string[]>();
	const add = (parent: string, child: string) => { const entries = children.get(parent) ?? []; entries.push(child); children.set(parent, entries); };
	for (const [id, parent] of notationOwners(model)) { add(parent, id); }
	const visible = new Set(view.relationIds);
	for (const relation of model.semantics.relations) { if (relation.kind === 'hosting' && visible.has(relation.id)) { add(relation.from, relation.to); } }
	return root => collectNotationMembers(root, children);
}

function collectNotationMembers(root: string, children: ReadonlyMap<string, readonly string[]>): Set<string> {
	const members = new Set([root]), queue = [root];
	for (let index = 0; index < queue.length; index++) { for (const child of children.get(queue[index]) ?? []) { if (!members.has(child)) { members.add(child); queue.push(child); } } }
	return members;
}
