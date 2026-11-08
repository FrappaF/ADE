/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface DiagramCamera { x: number; y: number; zoom: number }
export interface DiagramBounds { x: number; y: number; width: number; height: number }

/** Zoom around a screen point without moving the world point underneath it. */
export function zoomDiagram(camera: DiagramCamera, zoom: number, point: { x: number; y: number }): DiagramCamera {
	zoom = Math.max(0.05, Math.min(3, zoom));
	const ratio = zoom / camera.zoom;
	return { x: point.x - (point.x - camera.x) * ratio, y: point.y - (point.y - camera.y) * ratio, zoom };
}

/** Fit arbitrary world bounds, including negative coordinates, inside the viewport. */
export function fitDiagramCamera(bounds: DiagramBounds, viewport: { width: number; height: number }, padding = 72): DiagramCamera {
	const zoom = Math.max(0.05, Math.min(1, Math.max(1, viewport.width - padding * 2) / Math.max(1, bounds.width), Math.max(1, viewport.height - padding * 2) / Math.max(1, bounds.height)));
	return { x: (viewport.width - bounds.width * zoom) / 2 - bounds.x * zoom, y: (viewport.height - bounds.height * zoom) / 2 - bounds.y * zoom, zoom };
}
