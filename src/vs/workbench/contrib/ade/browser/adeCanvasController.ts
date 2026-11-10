/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { DisposableStore, Disposable } from '../../../../base/common/lifecycle.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ModelView } from '../common/modelTypes.js';
import { AdeProjectService } from './adeProjectService.js';
import { AdeControls } from './adeControls.js';
import { DiagramCamera, DiagramBounds, fitDiagramCamera, zoomDiagram } from '../common/diagramCamera.js';
import { notationBoundaries, notationGroupMembers } from '../common/diagramLayout.js';

interface AdeCanvasControllerHost {
	readonly root: HTMLElement;
}

/** Owns camera state and per-render pointer/keyboard listeners for the ADE editor. */
export class AdeCanvasController extends Disposable {
	readonly interactions = this._register(new DisposableStore());

	camera: DiagramCamera = { x: 80, y: 112, zoom: 1 };

	cameraKey: string | undefined;

	readonly cameras = new Map<string, DiagramCamera>();

	worldBounds: DiagramBounds = { x: 0, y: 0, width: 1, height: 1 };

	floatingMenu: HTMLElement | undefined;

	floatingInspector: HTMLElement | undefined;

	zoomReadout: HTMLElement | undefined;

	suppressCanvasClick = false;

	get zoom(): number { return this.camera.zoom; }

	set zoom(value: number) { this.camera = zoomDiagram(this.camera, value, { x: (this.canvasViewport?.clientWidth ?? 800) / 2, y: (this.canvasViewport?.clientHeight ?? 600) / 2 }); }

	canvasViewport: HTMLElement | undefined;

	canvasContent: HTMLElement | undefined;

	fitDiagram(): void {
		if (!this.canvasViewport) { return; }
		this.camera = fitDiagramCamera(this.worldBounds, { width: this.canvasViewport.clientWidth, height: this.canvasViewport.clientHeight });
		this.applyCamera();
	}

	applyCamera(): void {
		if (!this.canvasContent || !this.canvasViewport) { return; }
		this.canvasContent.style.transform = `translate(${this.camera.x}px, ${this.camera.y}px) scale(${this.camera.zoom})`;
		this.canvasViewport.style.backgroundPosition = `${this.camera.x}px ${this.camera.y}px`;
		let grid = 24 * this.zoom;
		while (grid < 16) { grid *= 2; }
		while (grid > 48) { grid /= 2; }
		this.canvasViewport.style.backgroundSize = `${grid}px ${grid}px`;
		if (this.zoomReadout) { this.zoomReadout.textContent = `${Math.round(this.zoom * 100)}%`; }
		const menu = this.floatingMenu;
		const inspector = this.floatingInspector;
		if (menu && inspector) { inspector.style.top = menu.offsetLeft + menu.offsetWidth + inspector.offsetWidth + 24 > this.host.root.clientWidth ? `${menu.offsetTop + menu.offsetHeight + 12}px` : ''; }
		if (this.cameraKey) { this.cameras.set(this.cameraKey, { ...this.camera }); }
	}

	installPan(parent: HTMLElement): void {
		this.interactions.add(dom.addDisposableListener(parent, 'wheel', (event: WheelEvent) => {
			event.preventDefault();
			if (event.ctrlKey || event.metaKey) {
				const bounds = parent.getBoundingClientRect();
				this.camera = zoomDiagram(this.camera, this.zoom * Math.exp(-event.deltaY * 0.002), { x: event.clientX - bounds.left, y: event.clientY - bounds.top });
			} else { this.camera.x -= event.deltaX; this.camera.y -= event.deltaY; }
			this.applyCamera();
		}, { passive: false }));
		this.interactions.add(dom.addDisposableListener(parent, 'keydown', (event: KeyboardEvent) => {
			if (event.target !== parent) { return; }
			const step = event.shiftKey ? 160 : 64;
			const offset = event.key === 'ArrowLeft' ? [step, 0] : event.key === 'ArrowRight' ? [-step, 0] : event.key === 'ArrowUp' ? [0, step] : event.key === 'ArrowDown' ? [0, -step] : undefined;
			if (offset) { event.preventDefault(); event.stopPropagation(); this.camera.x += offset[0]; this.camera.y += offset[1]; this.applyCamera(); }
			else if (event.key === 'Home') { event.preventDefault(); this.fitDiagram(); }
		}));
		let drag: { x: number; y: number; left: number; top: number } | undefined;
		this.interactions.add(dom.addDisposableListener(parent, 'pointerdown', (event: PointerEvent) => {
			this.controls.setExpanded('canvas-actions', false);
			this.suppressCanvasClick = false;
			const target = event.target as Element;
			if (event.button === 1 || event.button === 0 && (event.altKey || !target.closest('button, [role="button"], .ade-connection-label, [data-relation-id]'))) {
				drag = { x: event.clientX, y: event.clientY, left: this.camera.x, top: this.camera.y };
				parent.setPointerCapture(event.pointerId); parent.focus(); parent.classList.add('is-panning'); event.preventDefault();
			}
		}));
		this.interactions.add(dom.addDisposableListener(parent, 'pointermove', (event: PointerEvent) => {
			if (drag) { this.camera.x = drag.left + event.clientX - drag.x; this.camera.y = drag.top + event.clientY - drag.y; this.applyCamera(); }
		}));
		this.interactions.add(dom.addDisposableListener(parent, 'pointerup', (event: PointerEvent) => {
			if (drag) { this.suppressCanvasClick = Math.abs(event.clientX - drag.x) + Math.abs(event.clientY - drag.y) > 3; drag = undefined; parent.classList.remove('is-panning'); }
		}));
		this.interactions.add(dom.addDisposableListener(parent, 'pointercancel', () => { drag = undefined; parent.classList.remove('is-panning'); }));
		this.interactions.add(dom.addDisposableListener(parent, 'click', (event: MouseEvent) => { if (this.suppressCanvasClick && event.detail > 0) { this.suppressCanvasClick = false; event.preventDefault(); event.stopPropagation(); } }, true));
		this.interactions.add(dom.addDisposableListener(parent, 'focusin', (event: FocusEvent) => {
			const target = event.target as HTMLElement;
			if (!target.classList.contains('ade-node')) { return; }
			const bounds = target.getBoundingClientRect(), viewport = parent.getBoundingClientRect();
			if (bounds.right < viewport.left + 24 || bounds.left > viewport.right - 24 || bounds.bottom < viewport.top + 80 || bounds.top > viewport.bottom - 64) {
				this.camera.x += viewport.left + viewport.width / 2 - (bounds.left + bounds.width / 2);
				this.camera.y += viewport.top + viewport.height / 2 - (bounds.top + bounds.height / 2); this.applyCamera();
			}
		}));
	}

	installNodeEditing(button: HTMLButtonElement, view: ModelView, id: string): void {
		const isBoundary = notationBoundaries(this.project.model, view).some(box => box.elementId === id);
		const members = isBoundary ? notationGroupMembers(this.project.model, view, id) : new Set([id]);
		const move = (dx: number, dy: number) => this.project.editBatch(view.nodes.filter(node => members.has(node.elementId)).map(node => ({ kind: 'position', viewId: view.id, id: node.elementId, x: Math.round(node.x + dx), y: Math.round(node.y + dy) })));
		let drag: { x: number; y: number; left: number; top: number } | undefined;
		this.interactions.add(dom.addDisposableListener(button, 'pointerdown', (event: PointerEvent) => {
			if (event.button !== 0 || event.altKey) { return; }
			drag = { x: event.clientX, y: event.clientY, left: parseFloat(button.style.left), top: parseFloat(button.style.top) };
			button.setPointerCapture(event.pointerId);
		}));
		this.interactions.add(dom.addDisposableListener(button, 'pointermove', (event: PointerEvent) => {
			if (!drag) { return; }
			button.style.left = `${drag.left + (event.clientX - drag.x) / this.zoom}px`;
			button.style.top = `${drag.top + (event.clientY - drag.y) / this.zoom}px`;
		}));
		this.interactions.add(dom.addDisposableListener(button, 'pointerup', (event: PointerEvent) => {
			if (!drag) { return; }
			const dx = (event.clientX - drag.x) / this.zoom;
			const dy = (event.clientY - drag.y) / this.zoom;
			drag = undefined;
			if (Math.abs(dx) + Math.abs(dy) > 3) {
				move(dx, dy);
				this.project.selectElement(id);
			}
		}));
		this.interactions.add(dom.addDisposableListener(button, 'pointercancel', () => {
			if (drag) { button.style.left = `${drag.left}px`; button.style.top = `${drag.top}px`; drag = undefined; }
		}));
		this.interactions.add(dom.addDisposableListener(button, 'keydown', (event: KeyboardEvent) => {
			const step = event.shiftKey ? 40 : 20;
			const offset = event.key === 'ArrowLeft' ? [-step, 0] : event.key === 'ArrowRight' ? [step, 0] : event.key === 'ArrowUp' ? [0, -step] : event.key === 'ArrowDown' ? [0, step] : undefined;
			if (offset) {
				event.preventDefault();
				event.stopPropagation();
				move(offset[0], offset[1]);
			}
		}));
	}

	constructor(
		private readonly host: AdeCanvasControllerHost,
		private readonly controls: AdeControls,
		private readonly project: AdeProjectService,
		storageService: IStorageService
	) {
		super();
		try {
			const saved: Record<string, DiagramCamera> = JSON.parse(storageService.get('ade.canvas.cameras', StorageScope.WORKSPACE) ?? '{}');
			for (const [key, camera] of Object.entries(saved).slice(-100)) { if (camera && [camera.x, camera.y, camera.zoom].every(Number.isFinite) && camera.zoom >= 0.05 && camera.zoom <= 3) { this.cameras.set(key, camera); } }
		} catch { /* Ignore obsolete viewport state. */ }
		this._register(storageService.onWillSaveState(() => storageService.store('ade.canvas.cameras', JSON.stringify(Object.fromEntries([...this.cameras].slice(-100))), StorageScope.WORKSPACE, StorageTarget.MACHINE)));
	}
}
