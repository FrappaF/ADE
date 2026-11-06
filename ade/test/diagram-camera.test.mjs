/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zoomDiagram, fitDiagramCamera } from '../../src/vs/workbench/contrib/ade/common/diagramCamera.ts';

test('zoom preserves the world point under the pointer, including negative world coordinates', () => {
	const camera = { x: 900, y: -300, zoom: .8 }, point = { x: 240, y: 180 };
	for (const zoom of [.001, .5, 1.7, 30]) {
		const next = zoomDiagram(camera, zoom, point);
		assert.ok(Math.abs((point.x - next.x) / next.zoom - (point.x - camera.x) / camera.zoom) < 1e-9);
		assert.ok(Math.abs((point.y - next.y) / next.zoom - (point.y - camera.y) / camera.zoom) < 1e-9);
		assert.ok(next.zoom >= .05 && next.zoom <= 3);
	}
});

test('fit centers world bounds independently of their origin and leaves viewport padding', () => {
	for (const origin of [-2000, 0, 17000]) {
		const bounds = { x: origin, y: -400, width: 2400, height: 800 }, viewport = { width: 1280, height: 900 };
		const camera = fitDiagramCamera(bounds, viewport);
		assert.ok(bounds.x * camera.zoom + camera.x >= 71.99);
		assert.ok((bounds.x + bounds.width) * camera.zoom + camera.x <= viewport.width - 71.99);
		assert.ok(Math.abs((bounds.x + bounds.width / 2) * camera.zoom + camera.x - viewport.width / 2) < 1e-9);
		assert.ok(Math.abs((bounds.y + bounds.height / 2) * camera.zoom + camera.y - viewport.height / 2) < 1e-9);
	}
});
