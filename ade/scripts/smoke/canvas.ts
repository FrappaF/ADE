/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ModelView, SemanticElement, ElementDetails } from '../../../src/vs/workbench/contrib/ade/common/modelTypes.ts';
import type { CodeRequest } from '../../../src/vs/workbench/contrib/ade/common/codeBridge.ts';
import type { SmokeHarness } from './harness.ts';
import assert from 'node:assert/strict';
import { mkdir, writeFile, copyFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { openModelFile, pickValue, runCommand, chooseAdeDiagram, submitAdeForm, revealAdeButton } from './helpers.ts';

/** canvas scenarios share only the harness values listed here. */
export function createCanvasScenarios(harness: SmokeHarness) {
	const { launch, modelFile, evidence, directory, checkoutModel, args, workspace } = harness;

	async function checkInfiniteCanvas() {
		const names = ['game.js', 'preload', 'create', 'drawTamagotchi', 'createStatBar', 'createGlassButton', 'update', 'updateProgressBar', 'updateTamagotchiExpression', 'feed', 'play', 'sleep', 'animateTamagotchi', 'degradeStats', 'incrementAge', 'showFeedback', 'disableButtons'];
		const elements = names.map((name, index) => ({ id: `node-${index}`, kind: index ? 'action' : 'component', name }));
		const relations = names.slice(1).flatMap((name, index) => [
			{ id: `edge-${index}`, kind: 'dependency', from: `node-${index + 1}`, to: `node-${(index + 1) % 16 + 1}`, name },
			{ id: `cross-${index}`, kind: 'dependency', from: `node-${index + 1}`, to: `node-${(index + 5) % 16 + 1}`, name: 'update' }
		]);
		const model = { version: 3, id: 'canvas-example', name: 'Virtual Pet', semantics: { elements, relations }, views: [{ id: 'game', kind: 'structure', name: 'Game Flow', nodes: elements.map((element, index) => ({ elementId: element.id, x: 40 + index % 4 * 260, y: 40 + Math.floor(index / 4) * 140 })), relationIds: relations.map(relation => relation.id) }], codeMappings: [], verifications: [] };
		model.semantics.relations.push({ id: 'sequence-call', kind: 'invocation', from: 'node-1', to: 'node-2', name: 'Initialize Game' });
		model.views.push({ id: 'sequence', kind: 'sequence', name: 'Game Sequence', nodes: model.views[0].nodes.slice(1, 3), relationIds: ['sequence-call'] });
		await writeFile(modelFile, JSON.stringify(model));
		let window = await launch(), shell = window.locator('.ade-shell');
		await runCommand(window, 'A.D.E: Open Model');
		await window.locator('.quick-input-widget').getByText('Open A.D.E Model', { exact: true }).waitFor();
		const input = window.locator('.quick-input-widget input:visible');
		await input.fill(path.dirname(modelFile) + path.sep);
		await window.locator('.quick-input-widget').getByText(path.basename(modelFile), { exact: true }).dblclick();
		await shell.locator('.ade-node').first().waitFor();
		const viewport = shell.locator('.ade-canvas-scroll');
		const geometry = await shell.evaluate(root => { const rootBox = root.getBoundingClientRect(), canvas = root.querySelector('.ade-canvas-scroll')!.getBoundingClientRect(); return { width: canvas.width / rootBox.width, height: canvas.height / rootBox.height }; });
		assert.ok(geometry.width > .98 && geometry.height > .98, 'Canvas fills the editor');
		assert.equal(await shell.locator('.ade-edge-caption.is-visible').count(), 0, 'Relationship labels do not cover the resting diagram');
		await shell.getByRole('button', { name: 'Spread Out', exact: true }).click();
		await window.keyboard.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s');
		await window.waitForFunction(() => !document.querySelector('.ade-shell')?.textContent.includes('Unsaved Changes'));
		const spread = JSON.parse(await readFile(modelFile, 'utf8'));
		assert.deepEqual(spread.semantics, model.semantics);
		assert.ok(Math.max(...spread.views[0].nodes.map((node: ModelView['nodes'][number]) => node.x)) > 1000);
		const before = await readFile(modelFile, 'utf8');
		await window.waitForFunction(() => (document.querySelector('.ade-canvas-scroll')?.clientWidth ?? 0) > 100);
		const box = await window.evaluate(() => { const r = document.querySelector('.ade-canvas-scroll')!.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
		assert.ok(box.width > 100 && box.height > 100);
		const matrix = () => window.evaluate(() => { const m = new DOMMatrix(getComputedStyle(document.querySelector('.ade-canvas-content')!).transform); return { x: m.e, y: m.f, zoom: m.a }; });
		const initial = await matrix();
		await window.mouse.move(box.x + 980, box.y + 650); await window.mouse.down(); await window.mouse.move(box.x + 500, box.y + 500, { steps: 6 }); await window.mouse.up();
		const moved = await matrix(); assert.ok(Math.abs(moved.x - initial.x) > 300);
		assert.deepEqual(await viewport.evaluate(element => [element.scrollLeft, element.scrollTop]), [0, 0]);
		await viewport.evaluate(element => element.addEventListener('wheel', event => { if (!(event instanceof WheelEvent)) { return; } const r = element.getBoundingClientRect(); element.setAttribute('data-wheel-point', JSON.stringify({ x: event.clientX - r.left, y: event.clientY - r.top })); }, { once: true }));
		await window.mouse.move(box.x + 500, box.y + 400); await window.keyboard.down('Control'); await window.mouse.wheel(0, -200); await window.keyboard.up('Control');
		const zoomed = await matrix(); assert.ok(zoomed.zoom > moved.zoom);
		const anchor = await viewport.evaluate(element => JSON.parse(element.getAttribute('data-wheel-point')!));
		assert.ok(Math.abs((anchor.x - moved.x) / moved.zoom - (anchor.x - zoomed.x) / zoomed.zoom) < .1, JSON.stringify({ anchor, moved, zoomed }));
		assert.equal(await readFile(modelFile, 'utf8'), before, 'Pan and zoom never edit the model');
		await shell.locator('.ade-floating-zoom').getByRole('button', { name: 'Fit Diagram', exact: true }).click();
		const beforeSelection = await matrix();
		const first = shell.locator('.ade-node').first(); await first.focus(); await window.keyboard.press('Enter');
		const inspector = shell.locator('aside.ade-properties'); await inspector.waitFor();
		const panel = await inspector.boundingBox(), after = await viewport.boundingBox(); assert.ok(panel); assert.ok(after);
		assert.deepEqual(await matrix(), beforeSelection, 'Opening details preserves the diagram camera');
		const visibleNode = await first.boundingBox(); assert.ok(visibleNode);
		assert.ok(visibleNode.x + visibleNode.width > box.x && visibleNode.x < box.x + box.width && visibleNode.y + visibleNode.height > box.y && visibleNode.y < box.y + box.height, 'The selected node stays visible');
		assert.ok(panel.width < after.width / 2 && panel.height < after.height, 'The inspector leaves most of the canvas available'); assert.equal(after.width, box.width); assert.equal(after.height, box.height);
		await window.screenshot({ path: path.join(evidence, 'infinite-canvas-details.png') });
		await first.focus(); const nodeLeft = await first.evaluate(element => parseFloat(element.style.left));
		await window.keyboard.press('ArrowLeft');
		assert.equal(await first.evaluate(element => parseFloat(element.style.left)), nodeLeft - 20);
		await window.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
		await window.waitForFunction(left => parseFloat(document.querySelector<HTMLElement>('.ade-node')!.style.left) === left, nodeLeft);
		await inspector.getByRole('button', { name: 'Close Properties', exact: true }).click();
		await viewport.focus(); const previous = await matrix(); await window.keyboard.press('ArrowRight'); assert.ok((await matrix()).x < previous.x);
		const edge = shell.locator('.ade-connection').first(); await edge.focus(); await window.keyboard.press('Enter');
		await inspector.waitFor();
		await window.screenshot({ path: path.join(evidence, 'infinite-canvas-relation.png') });
		await inspector.getByRole('button', { name: 'Close Properties', exact: true }).click();
		await shell.locator('.ade-floating-zoom').getByRole('button', { name: 'Fit Diagram', exact: true }).click();
		await window.screenshot({ path: path.join(evidence, 'infinite-canvas.png') });
		await writeFile(path.join(evidence, 'infinite-canvas-results.json'), JSON.stringify({ canvasFillsEditor: true, unboundedPan: true, pointerZoom: true, cameraDoesNotEditModel: true, spaciousLayout: true, compactFloatingInspector: true, selectionPreservesCamera: true, keyboardEditAndUndo: true, relationInspector: true }, null, 2));
		const savedCamera = await matrix();
		await harness.app.close(); harness.app = undefined;
		window = await launch(); shell = window.locator('.ade-shell');
		await shell.locator('.ade-workspace-bar').getByRole('button', { name: 'Game Flow', exact: true }).waitFor();
		assert.deepEqual(await matrix(), savedCamera, 'The camera survives application restart');
		await shell.getByRole('button', { name: 'Diagrams', exact: true }).click();
		await pickValue(window, 'Choose Diagram', 'Game Sequence');
		await shell.locator('.ade-sequence-message').click();
		await shell.locator('aside.ade-properties[aria-label="Relationship Properties"]').waitFor();
		await shell.locator('aside.ade-properties').getByText('Initialize Game', { exact: true }).waitFor();
		await harness.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(640, 760));
		await window.waitForFunction(() => (document.querySelector('.ade-shell')?.clientWidth ?? Infinity) < 650);
		const floatingBounds = await shell.evaluate(root => { const menu = root.querySelector('.ade-floating-menu')!.getBoundingClientRect(), panel = root.querySelector('aside.ade-properties')!.getBoundingClientRect(); return { menuBottom: menu.bottom, panelTop: panel.top }; });
		assert.ok(floatingBounds.panelTop >= floatingBounds.menuBottom, 'Floating panels do not overlap the menu in a narrow window');
		await harness.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 900));
		await window.waitForFunction(() => (document.querySelector('.ade-shell')?.clientWidth ?? 0) > 1000);
		await window.screenshot({ path: path.join(evidence, 'infinite-canvas-sequence.png') });
		// Invoke the same native action as File > Open Folder, reusing this window.
		const nextFolder = path.join(directory, 'second-project'), emptyFolder = path.join(directory, 'empty-project');
		await mkdir(path.join(nextFolder, '.ade'), { recursive: true }); await mkdir(emptyFolder);
		const nextModel = structuredClone(checkoutModel); nextModel.id = 'second-project'; nextModel.name = 'Second Project'; nextModel.views[0].name = 'Second Project Diagram';
		await writeFile(path.join(nextFolder, '.ade/model.json'), JSON.stringify(nextModel));
		for (const folder of [nextFolder, emptyFolder]) {
			await runCommand(window, 'File: Open Folder...');
			const widget = window.locator('.quick-input-widget');
			await widget.getByText('Open Folder', { exact: true }).waitFor();
			await widget.locator('input:visible').fill(folder + path.sep);
			await widget.getByRole('button', { name: 'OK', exact: true }).click();
			args[1] = folder;
			await window.waitForFunction(() => !!document.querySelector('.ade-shell') && !document.querySelector('.quick-input-widget input:focus'));
			if (folder === nextFolder) { await shell.getByRole('heading', { name: 'Second Project Diagram', exact: true }).waitFor(); }
			else { await shell.getByText('Current Folder:', { exact: false }).waitFor(); assert.equal(await shell.locator('.ade-node').count(), 0); }
			assert.equal(await shell.locator('.ade-canvas-title').getByText('Game Flow', { exact: true }).count(), 0);
		}
		await window.screenshot({ path: path.join(evidence, 'workspace-switched-empty.png') });
		const resultsFile = path.join(evidence, 'infinite-canvas-results.json');
		await writeFile(resultsFile, JSON.stringify({ ...JSON.parse(await readFile(resultsFile, 'utf8')), nativeOpenFolder: true, emptyFolderClearsProject: true, cameraRestoredAfterRestart: true, sequenceMessageClickable: true, narrowFloatingPanels: true }, null, 2));
		await harness.app.close(); harness.app = undefined;
		console.log('PASS: native File > Open Folder opens the new project and clears old diagrams in an empty folder.');
		console.log('PASS: full canvas, unbounded pan, pointer-anchored zoom, spacious layout and floating element/relationship details.');
	}

	async function checkNotations() {
		const { createCodeEngine } = await import('../../runtime/nativeHost.ts');
		const { architectureFiles, notationAnalysis, notationView } = await import('../../code-import/test/notation-fixture.mjs');
		const sourceRoot = path.join(workspace, 'notation-fixture');
		for (const [file, text] of Object.entries(architectureFiles)) { await mkdir(path.dirname(path.join(sourceRoot, file)), { recursive: true }); assert.ok(typeof text === 'string'); await writeFile(path.join(sourceRoot, file), text); }
		const engine = createCodeEngine({
			async complete(_config, prompt) {
				const context = JSON.parse(prompt.slice(prompt.indexOf('\n') + 1));
				return { value: context.step === 'diagram' ? notationView(context) : notationAnalysis(context), usage: { inputTokens: 100, outputTokens: 50 }, cost: null };
			}
		});
		const call = async (request: CodeRequest) => JSON.parse(await engine.execute(JSON.stringify(request)));
		const initial = await call({ operation: 'import', root: sourceRoot });
		let progress = await call({ operation: 'diagramPrepare', snapshot: initial.snapshot, config: JSON.stringify({ version: 1, provider: 'codex', connection: 'cli', model: 'authored-notation-fixture', executable: 'codex', maxCalls: 1, timeoutMs: 10000, maxContextBytes: 262144 }) });
		while (progress.status !== 'complete') { progress = await call({ operation: progress.status === 'plan' ? 'diagramApprovePlan' : 'diagramStep', snapshot: initial.snapshot, id: progress.id, reviewId: progress.reviewId }); }
		const file = path.join(directory, 'notation.ade.json');
		await copyFile(progress.context.model, file);
		const model = JSON.parse(await readFile(file, 'utf8'));
		const window = await launch(); await openModelFile(window, file);
		for (const view of model.views) {
			await chooseAdeDiagram(window, view.name);
			await window.locator('.ade-workspace-bar .ade-diagram-picker').filter({ hasText: view.name }).waitFor();
			await window.locator('.ade-shell').getByRole('button', { name: 'Fit Diagram', exact: true }).click();
			assert.equal(await window.locator('.ade-node, .ade-sequence-participant').count(), view.nodes.length);
			const overflow = await window.locator('.ade-node').evaluateAll(nodes => nodes.filter(node => node.scrollHeight > node.clientHeight + 2).map(node => node.textContent));
			assert.deepEqual(overflow, [], 'notation compartments fit their cards: ' + view.kind);
			await window.screenshot({ path: path.join(evidence, `notation-${view.kind}.png`) });
		}
		const c4 = model.views.find((view: ModelView) => view.kind === 'c4Container');
		await chooseAdeDiagram(window, c4.name);
		const actions = window.locator('.ade-floating-menu > details');
		if (!await actions.evaluate(element => element instanceof HTMLDetailsElement && element.open)) { await actions.locator(':scope > summary').click(); }
		const labels = await revealAdeButton(window, 'Show Relationship Labels');
		assert.equal(await labels.getAttribute('aria-pressed'), 'true');
		const captions = await window.locator('.ade-edge-caption.is-visible').count();
		await labels.click();
		assert.equal(await labels.getAttribute('aria-pressed'), 'false');
		assert.ok(await window.locator('.ade-edge-caption.is-visible').count() < captions, 'notation labels can be hidden to keep the canvas quiet');
		await labels.click();
		if (await actions.evaluate(element => element instanceof HTMLDetailsElement && element.open)) { await actions.locator(':scope > summary').click(); }
		const positions = () => window.locator('.ade-node').evaluateAll(nodes => Object.fromEntries(nodes.map(node => [node.getAttribute('aria-label'), parseFloat(node.style.left)])));
		const before = await positions();
		await window.locator('.ade-node[aria-label="Task System"]').focus();
		await window.keyboard.press('ArrowRight');
		await window.waitForFunction(expected => parseFloat(document.querySelector<HTMLElement>('.ade-node[aria-label="Task API"]')?.style.left ?? '0') === expected, before['Task API'] + 20);
		const after = await positions();
		assert.deepEqual(['Task System', 'Task API', 'Task Data', 'Task Owner'].map(name => after[name] - before[name]), [20, 20, 20, 0], 'moving a boundary moves its members once and keeps external actors fixed');
		await window.screenshot({ path: path.join(evidence, 'notation-c4-move.png') });
		const schema = model.views.find((view: ModelView) => view.kind === 'databaseSchema');
		await chooseAdeDiagram(window, schema.name);
		await window.locator('.ade-node[aria-label="tasks"]').click();
		await runCommand(window, 'A.D.E: Edit Attributes and Technology');
		const notation = window.locator('dialog.ade-form-dialog');
		await notation.getByRole('heading', { name: 'Attributes and Technology · tasks', exact: true }).waitFor();
		await notation.getByRole('button', { name: 'Add Attribute', exact: true }).click();
		const member = notation.locator('fieldset.ade-form-member').last();
		await member.getByLabel('Member Name', { exact: true }).fill('priority');
		await member.getByLabel('Type or Method Signature', { exact: true }).fill('INTEGER');
		await member.getByLabel('Key Kind', { exact: true }).selectOption({ label: 'No Key' });
		await member.getByRole('checkbox').setChecked(true);
		await submitAdeForm(window);
		await window.locator('.ade-node[aria-label="tasks"]').getByText('priority: INTEGER', { exact: true }).waitFor();
		await window.keyboard.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s');
		await window.waitForFunction(() => document.querySelector('.ade-shell')?.textContent.includes('Saved'));
		assert.ok(JSON.parse(await readFile(file, 'utf8')).semantics.elements.find((element: SemanticElement) => element.name === 'tasks').details.members.some((member: ElementDetails['members'][number]) => member.name === 'priority'));
		await window.screenshot({ path: path.join(evidence, 'notation-schema-edit.png') });
		await harness.app.close(); harness.app = undefined;
		console.log('PASS: all 16 native notation canvases render; table compartments fit and member editing persists. Authored fixture, no live inference.');
	}

	return { checkInfiniteCanvas, checkNotations };
}
