import '../scripts/source-loader.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
const { deploymentBoundaryHeader, isClearSegment, placeConnectionLabel, routeDiagramConnection, routeDiagramConnections } = await import('../../src/vs/workbench/contrib/ordito/common/diagramRouting.ts');

const boxes = [
	{ id: 'from', x: 64, y: 100, width: 192, height: 88 },
	{ id: 'middle', x: 300, y: 80, width: 192, height: 128 },
	{ id: 'to', x: 540, y: 100, width: 192, height: 88 }
];

test('incident slots separate converging, parallel, reverse and self relations deterministically', () => {
	const nodes = [
		{ id: 'hub', x: 600, y: 400, width: 240, height: 96 },
		...Array.from({ length: 6 }, (_, i) => ({ id: `n${i}`, x: 60, y: i * 180 + 40, width: 220, height: 96 }))
	];
	const edges = [
		...Array.from({ length: 6 }, (_, i) => ({ id: `r${i}`, from: `n${i}`, to: 'hub' })),
		{ id: 'parallel1', from: 'n0', to: 'hub' }, { id: 'parallel2', from: 'n0', to: 'hub' },
		{ id: 'reverse', from: 'hub', to: 'n0' }, { id: 'self', from: 'hub', to: 'hub' }
	];
	const routes = routeDiagramConnections(nodes, edges);
	assert.deepEqual(routes, routeDiagramConnections(nodes, [...edges].reverse()));
	for (const route of routes.values()) { assertClear(route, nodes); }
	const endpoints = edges.filter(edge => edge.to === 'hub').map(edge => JSON.stringify(routes.get(edge.id).at(-1)));
	assert.equal(new Set(endpoints).size, endpoints.length);
});

function assertClear(route, obstacles) {
	assert.ok(route?.length >= 2, 'A route reaches both endpoints');
	assert.ok(route.slice(1).every((point, index) => isClearSegment(route[index], point, obstacles)), JSON.stringify(route));
}

test('orthogonal routing goes around intervening nodes and never changes saved layout', () => {
	const before = JSON.stringify(boxes);
	const route = routeDiagramConnection(boxes, 'from', 'to');
	assertClear(route, boxes);
	assert.ok(route.some(point => point.y <= 80 || point.y >= 208));
	assert.equal(JSON.stringify(boxes), before);
});

test('parallel, reverse and self connections have distinct paths reaching node borders', () => {
	const routes = [routeDiagramConnection(boxes, 'from', 'to'), routeDiagramConnection(boxes, 'from', 'to', 1), routeDiagramConnection(boxes, 'to', 'from', 2), routeDiagramConnection(boxes, 'from', 'from')];
	for (const route of routes) { assertClear(route, boxes); }
	assert.equal(new Set(routes.map(route => JSON.stringify(route))).size, 4);
	assert.ok(routes[3].length >= 4);
});

test('overlapping layouts with no available ports report failure instead of drawing through nodes', () => {
	assert.equal(routeDiagramConnection([...boxes, { id: 'cover', x: 0, y: 0, width: 290, height: 300 }], 'from', 'to'), undefined);
	assert.equal(routeDiagramConnection(boxes, 'removed', 'to'), undefined);
	assert.equal(isClearSegment({ x: 0, y: 0 }, { x: 1, y: 1 }, []), false);
});

test('labels avoid nodes and earlier labels, with a detached fallback for crowded routes', () => {
	const route = routeDiagramConnection(boxes, 'from', 'to');
	const first = placeConnectionLabel(route, 180, boxes);
	const second = placeConnectionLabel(route, 180, [...boxes, first.box]);
	assert.notDeepEqual(first.box, second.box);
	const fallback = placeConnectionLabel([{ x: 100, y: 100 }, { x: 140, y: 100 }], 800, boxes);
	assert.deepEqual({ detached: fallback.detached, width: fallback.box.width, below: fallback.box.y > 208 }, { detached: true, width: 800, below: true });
});

test('short gaps use a nearby label with an unobstructed leader instead of a long diagonal', () => {
	const nodes = [{ x: 64, y: 64, width: 192, height: 88 }, { x: 324, y: 64, width: 192, height: 88 }];
	const placement = placeConnectionLabel([{ x: 256, y: 108 }, { x: 324, y: 108 }], 180, nodes);
	const attachment = { x: placement.anchor.x, y: placement.box.y + placement.box.height };
	assert.deepEqual({ near: placement.box.y < 64, leader: placement.detached, clear: isClearSegment(placement.anchor, attachment, nodes) }, { near: true, leader: true, clear: true });
});

test('short deployment connections keep their captions near the route across the canvas origin', () => {
	const boundary = { x: -24, y: -44, width: 256, height: 164 };
	const host = { id: 'host', ...deploymentBoundaryHeader(boundary, 'Host Web') };
	const artifact = { id: 'artifact', x: 0, y: 0, width: 208, height: 96 };
	const nodes = [host, artifact];
	const route = routeDiagramConnection(nodes, host.id, artifact.id);
	assertClear(route, nodes);
	const placement = placeConnectionLabel(route, 83, nodes, { allowNegativeCoordinates: true });
	assert.deepEqual({
		startsAtHeader: route[0].x === host.x + host.width,
		endsAtArtifact: route.at(-1).y === artifact.y,
		aboveArtifact: placement.box.y + placement.box.height <= artifact.y,
		detached: placement.detached
	}, { startsAtHeader: true, endsAtArtifact: true, aboveArtifact: true, detached: false });
});
