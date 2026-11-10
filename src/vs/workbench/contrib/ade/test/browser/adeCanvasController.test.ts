/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { AdeCanvasController } from '../../browser/adeCanvasController.js';
import { AdeControls } from '../../browser/adeControls.js';
import { AdeProjectService } from '../../browser/adeProjectService.js';
import { checkoutModel } from '../../common/checkoutModel.js';
import { type VisualEdit } from '../../common/visualEditTypes.js';

suite('A.D.E canvas controller', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let root: HTMLElement;
	setup(() => { root = dom.append(document.body, dom.$('section')); });
	teardown(() => root.remove());

	function fixture() {
		const model = structuredClone(checkoutModel), edits: VisualEdit[] = [];
		const project = new class extends mock<AdeProjectService>() {
			override get model() { return model; }
			override editBatch(batch: VisualEdit[]): void { edits.push(...batch); }
		};
		const controls = disposables.add(new AdeControls());
		const storage = disposables.add(new InMemoryStorageService());
		const canvas = disposables.add(new AdeCanvasController({ root }, controls, project, storage));
		canvas.canvasViewport = root;
		canvas.canvasContent = dom.append(root, dom.$('div'));
		return { canvas, model, edits };
	}

	test('pan listeners follow the current render and clearing them stops old DOM from changing the camera', () => {
		const { canvas } = fixture();
		canvas.installPan(root);
		root.dispatchEvent(new WheelEvent('wheel', { deltaX: 20, deltaY: 30, cancelable: true }));
		root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));
		root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, cancelable: true }));
		assert.deepStrictEqual(canvas.camera, { x: -4, y: -78, zoom: 1 });
		assert.strictEqual(canvas.canvasContent!.style.transform, 'translate(-4px, -78px) scale(1)');
		canvas.interactions.clear();
		root.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, cancelable: true }));
		assert.deepStrictEqual(canvas.camera, { x: -4, y: -78, zoom: 1 });
		canvas.installPan(root);
		root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true }));
		assert.strictEqual(canvas.camera.x, 60);
	});

	test('keyboard node movement submits one atomic layout edit and leaves the model snapshot unchanged', () => {
		const { canvas, model, edits } = fixture(), before = structuredClone(model);
		const view = model.views[0], node = view.nodes[0];
		const button = dom.append(root, dom.$<HTMLButtonElement>('button'));
		canvas.installNodeEditing(button, view, node.elementId);
		button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true, cancelable: true }));
		assert.deepStrictEqual({ edits, model }, {
			edits: [{ kind: 'position', viewId: view.id, id: node.elementId, x: node.x + 40, y: node.y }],
			model: before
		});
	});
});
