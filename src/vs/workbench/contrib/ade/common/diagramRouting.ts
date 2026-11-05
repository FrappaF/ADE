/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface DiagramPoint { x: number; y: number }
export interface DiagramBox extends DiagramPoint { width: number; height: number }
export interface DiagramObstacle extends DiagramBox { id: string }

function inside(point: DiagramPoint, box: DiagramBox): boolean {
	return point.x > box.x && point.x < box.x + box.width && point.y > box.y && point.y < box.y + box.height;
}

/** True only for orthogonal segments whose interior does not enter a node. */
export function isClearSegment(a: DiagramPoint, b: DiagramPoint, boxes: readonly DiagramBox[]): boolean {
	if (a.x !== b.x && a.y !== b.y) { return false; }
	return !boxes.some(box => inside(a, box) || inside(b, box) || (a.x === b.x
		? a.x > box.x && a.x < box.x + box.width && Math.max(a.y, b.y) > box.y && Math.min(a.y, b.y) < box.y + box.height
		: a.y > box.y && a.y < box.y + box.height && Math.max(a.x, b.x) > box.x && Math.min(a.x, b.x) < box.x + box.width));
}

interface Port { edge: DiagramPoint; point: DiagramPoint }
function ports(box: DiagramBox, offset: number, gap: number): Port[] {
	const x = box.x + box.width / 2 + offset;
	const y = box.y + box.height / 2 + offset;
	return [
		{ edge: { x: box.x + box.width, y }, point: { x: box.x + box.width + gap, y } },
		{ edge: { x, y: box.y + box.height }, point: { x, y: box.y + box.height + gap } },
		{ edge: { x: box.x, y }, point: { x: box.x - gap, y } },
		{ edge: { x, y: box.y }, point: { x, y: box.y - gap } }
	];
}

interface SearchStep { index: number; cost: number }

/** Small binary heap keeps routing independent of platform and workbench services. */
class Frontier {
	private readonly items: SearchStep[] = [];
	push(value: SearchStep): void {
		let index = this.items.length;
		this.items.push(value);
		while (index > 0) {
			const parent = (index - 1) >> 1;
			if (this.items[parent].cost <= value.cost) { break; }
			this.items[index] = this.items[parent]; index = parent;
		}
		this.items[index] = value;
	}
	pop(): SearchStep | undefined {
		const result = this.items[0];
		const last = this.items.pop();
		if (this.items.length && last) {
			let index = 0;
			while (index * 2 + 1 < this.items.length) {
				let child = index * 2 + 1;
				if (child + 1 < this.items.length && this.items[child + 1].cost < this.items[child].cost) { child++; }
				if (this.items[child].cost >= last.cost) { break; }
				this.items[index] = this.items[child]; index = child;
			}
			this.items[index] = last;
		}
		return result;
	}
}

/** Route around node rectangles on a compressed orthogonal grid, with a cost for bends. */
export function routeDiagramConnection(boxes: readonly DiagramObstacle[], fromId: string, toId: string, lane = 0, options?: { sourceOffset: number; targetOffset: number; occupied: readonly DiagramPoint[][] }): DiagramPoint[] | undefined {
	const from = boxes.find(box => box.id === fromId);
	const to = boxes.find(box => box.id === toId);
	if (!from || !to) { return undefined; }
	const offset = Math.min(24, Math.floor((lane + 1) / 2) * 8) * (lane % 2 ? 1 : -1);
	const gap = 20 + lane * 4;
	const sources = ports(from, options?.sourceOffset ?? offset, gap).filter((port, index) => (from !== to || index < 2) && isClearSegment(port.edge, port.point, boxes));
	const targets = ports(to, options?.targetOffset ?? -offset, gap).filter((port, index) => (from !== to || index >= 2) && isClearSegment(port.edge, port.point, boxes));
	if (!sources.length || !targets.length) { return undefined; }
	const allPorts = [...sources, ...targets];
	const xs = [...new Set([...boxes.flatMap(box => [box.x - gap, box.x + box.width + gap]), ...allPorts.map(port => port.point.x)])].sort((a, b) => a - b);
	const ys = [...new Set([...boxes.flatMap(box => [box.y - gap, box.y + box.height + gap]), ...allPorts.map(port => port.point.y)])].sort((a, b) => a - b);
	const pointAt = (index: number): DiagramPoint => ({ x: xs[index % xs.length], y: ys[Math.floor(index / xs.length)] });
	const indexOf = (point: DiagramPoint): number => ys.indexOf(point.y) * xs.length + xs.indexOf(point.x);
	const distances = new Map<number, number>();
	const previous = new Map<number, number>();
	const starts = new Map<number, Port>();
	const ends = new Map(targets.map(port => [indexOf(port.point), port]));
	const frontier = new Frontier();
	for (const port of sources) {
		const heading = port.edge.y === port.point.y ? 0 : 1;
		const key = indexOf(port.point) * 2 + heading;
		distances.set(key, gap); starts.set(key, port); frontier.push({ index: key, cost: gap });
	}
	let step: SearchStep | undefined;
	while ((step = frontier.pop())) {
		if (step.cost !== distances.get(step.index)) { continue; }
		const index = Math.floor(step.index / 2);
		const point = pointAt(index);
		const end = ends.get(index);
		if (end) {
			const route = [end.edge, point];
			let key = step.index;
			while (previous.has(key)) { key = previous.get(key)!; route.push(pointAt(Math.floor(key / 2))); }
			route.push(starts.get(key)!.edge);
			route.reverse();
			return route.filter((value, i) => i === 0 || i === route.length - 1 || !((route[i - 1].x === value.x && value.x === route[i + 1].x) || (route[i - 1].y === value.y && value.y === route[i + 1].y)));
		}
		const column = index % xs.length;
		const row = Math.floor(index / xs.length);
		for (const [nextColumn, nextRow, heading] of [[column - 1, row, 0], [column + 1, row, 0], [column, row - 1, 1], [column, row + 1, 1]]) {
			if (nextColumn < 0 || nextColumn >= xs.length || nextRow < 0 || nextRow >= ys.length) { continue; }
			const nextIndex = nextRow * xs.length + nextColumn;
			const next = pointAt(nextIndex);
			if (!isClearSegment(point, next, boxes)) { continue; }
			const overlap = options?.occupied.some(route => route.slice(1).some((end, i) => {
				const start = route[i];
				return point.x === next.x && point.x === start.x && start.x === end.x && Math.min(Math.max(point.y, next.y), Math.max(start.y, end.y)) > Math.max(Math.min(point.y, next.y), Math.min(start.y, end.y))
					|| point.y === next.y && point.y === start.y && start.y === end.y && Math.min(Math.max(point.x, next.x), Math.max(start.x, end.x)) > Math.max(Math.min(point.x, next.x), Math.min(start.x, end.x));
			}));
			const cost = step.cost + Math.abs(point.x - next.x) + Math.abs(point.y - next.y) + (heading === step.index % 2 ? 0 : 24) + (overlap ? 160 : 0);
			const key = nextIndex * 2 + heading;
			if (cost >= (distances.get(key) ?? Infinity)) { continue; }
			distances.set(key, cost); previous.set(key, step.index); frontier.push({ index: key, cost });
		}
	}
	return undefined;
}

/** Reserve distinct attachment slots across all incident relations, not only identical endpoint pairs. */
export function routeDiagramConnections(boxes: readonly DiagramObstacle[], connections: readonly { id: string; from: string; to: string }[]): Map<string, DiagramPoint[] | undefined> {
	const sorted = [...connections].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
	const slots = new Map<string, string[]>();
	for (const edge of sorted) {
		for (const [id, suffix] of [[edge.from, 'from'], [edge.to, 'to']]) { const entries = slots.get(id) ?? []; entries.push(`${edge.id}:${suffix}`); slots.set(id, entries); }
	}
	const offset = (id: string, key: string): number => {
		const box = boxes.find(box => box.id === id);
		const entries = slots.get(id)!;
		return box ? ((entries.indexOf(key) + 1) / (entries.length + 1) - 0.5) * Math.min(box.width, box.height) * 0.8 : 0;
	};
	const occupied: DiagramPoint[][] = [], result = new Map<string, DiagramPoint[] | undefined>();
	for (const edge of sorted) {
		const route = routeDiagramConnection(boxes, edge.from, edge.to, 0, { sourceOffset: offset(edge.from, `${edge.id}:from`), targetOffset: offset(edge.to, `${edge.id}:to`), occupied });
		result.set(edge.id, route);
		if (route) { occupied.push(route); }
	}
	return result;
}

function overlaps(a: DiagramBox, b: DiagramBox): boolean {
	return a.x < b.x + b.width + 6 && a.x + a.width + 6 > b.x && a.y < b.y + b.height + 6 && a.y + a.height + 6 > b.y;
}

/** Keep complete labels clear of nodes and earlier labels; crowded labels use a leader line. */
export function placeConnectionLabel(route: readonly DiagramPoint[], width: number, obstacles: readonly DiagramBox[]): { box: DiagramBox; anchor: DiagramPoint; detached: boolean } {
	const segments = route.slice(1).map((point, index) => ({ a: route[index], b: point }))
		.sort((a, b) => (Math.abs(b.b.x - b.a.x) + Math.abs(b.b.y - b.a.y)) - (Math.abs(a.b.x - a.a.x) + Math.abs(a.b.y - a.a.y)));
	for (const { a, b } of segments) {
		const anchor = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
		for (const distance of [6, 30, 54, 78]) {
			for (const side of [-1, 1]) {
				const box = a.y === b.y
					? { x: anchor.x - width / 2, y: anchor.y + (side < 0 ? -20 - distance : distance), width, height: 20 }
					: { x: anchor.x + (side < 0 ? -width - distance : distance), y: anchor.y - 10, width, height: 20 };
				const attachment = { x: Math.max(box.x, Math.min(anchor.x, box.x + box.width)), y: Math.max(box.y, Math.min(anchor.y, box.y + box.height)) };
				if (box.x >= 8 && box.y >= 8 && !obstacles.some(obstacle => overlaps(box, obstacle)) && isClearSegment(anchor, attachment, obstacles)) {
					return { box, anchor, detached: distance > 6 };
				}
			}
		}
	}
	const anchor = route[Math.floor(route.length / 2)];
	return { box: { x: 16, y: Math.max(0, ...obstacles.map(box => box.y + box.height)) + 16, width, height: 20 }, anchor, detached: true };
}
