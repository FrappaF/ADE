/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isClearSegment, placeConnectionLabel, routeDiagramConnection } from '../../src/vs/workbench/contrib/ade/common/diagramRouting.ts';

const boxes = [
	{ id: 'from', x: 64, y: 100, width: 192, height: 88 },
	{ id: 'middle', x: 300, y: 80, width: 192, height: 128 },
	{ id: 'to', x: 540, y: 100, width: 192, height: 88 }
];

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
