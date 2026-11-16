/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SmokeHarness } from './harness.ts';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { revealAdeButton, clickAdeButton, openModelFile, enterValue, pickValue, readAccessibleText, chooseFolder, runCommand } from './helpers.ts';

/** accessibility scenarios share only the harness values listed here. */
export function createAccessibilityScenarios(harness: SmokeHarness) {
	const { launch, checkoutModel, modelFile, evidence, userData, otherFile, directory, args } = harness;

	async function checkDiagramAccessibility(window: import('playwright-core').Page) {
		const shell = window.locator('.ade-shell');
		const sidebar = window.locator('.ade-sidebar');
		const reading = window.locator('.accessible-view:visible');
		const openReading = process.platform === 'linux' ? 'Alt+Shift+F2' : 'Alt+F2';
		const openHelp = process.platform === 'linux' ? 'Alt+Shift+F1' : 'Alt+F1';
		await sidebar.getByRole('button', { name: 'Esito pagamento', exact: true }).click();
		const selected = shell.locator('.ade-node[aria-pressed="true"]');
		await shell.locator('.ade-node').getByText('Pagamento rifiutato', { exact: true }).click();
		await selected.focus();
		await window.keyboard.press(openReading);
		await reading.getByText('Diagram: Esito pagamento', { exact: true }).waitFor();
		await readAccessibleText(window, ['Condition: pagamento autorizzato', 'Condition: pagamento non autorizzato']);
		await window.keyboard.press('Escape');
		assert.equal(await selected.evaluate(element => element === document.activeElement), true);
		await window.keyboard.press(openHelp);
		await reading.getByText('A.D.E Accessibility Help', { exact: true }).waitFor();
		await window.keyboard.press('Escape');
		assert.equal(await selected.evaluate(element => element === document.activeElement), true);
		await runCommand(window, 'Open Accessible View');
		await reading.getByText('Diagram: Esito pagamento', { exact: true }).waitFor();
		await window.keyboard.press('Escape');
		assert.equal(await selected.evaluate(element => element === document.activeElement), true);
		const readButton = await revealAdeButton(window, 'Read Diagram');
		await readButton.click();
		await readAccessibleText(window, ['Selected Element: Pagamento rifiutato']);
		await window.keyboard.press('Escape');
		assert.equal(await readButton.evaluate(element => element === document.activeElement), true);
		const navigation = sidebar.getByRole('button', { name: 'Esito pagamento', exact: true });
		await navigation.focus();
		await window.keyboard.press(openReading);
		await reading.getByText('Diagram: Esito pagamento', { exact: true }).waitFor();
		await window.keyboard.press('Escape');
		assert.equal(await navigation.evaluate(element => element === document.activeElement), true);
		await selected.focus();
		await window.keyboard.press(openReading);
		await reading.getByText('Diagram: Esito pagamento', { exact: true }).waitFor();
		const baseline = JSON.stringify(checkoutModel);
		assert.equal(await readFile(modelFile, 'utf8'), baseline, 'Reading and help never write the source');
		const updated = structuredClone(checkoutModel);
		updated.views[1].name = 'Accessible Payment';
		updated.semantics.elements.find(element => element.id === 'declined')!.name = 'Refused Payment';
		await writeFile(modelFile, JSON.stringify(updated));
		await reading.getByText('Diagram: Accessible Payment', { exact: true }).waitFor();
		await readAccessibleText(window, ['Selected Element: Refused Payment']);
		await window.screenshot({ path: path.join(evidence, 'accessible-diagram.png') });
		await window.keyboard.press('Escape');
		assert.equal(await selected.evaluate(element => element === document.activeElement), true, 'Restores the replacement node after external updates');
		await window.keyboard.press(openReading);
		await reading.getByText('Diagram: Accessible Payment', { exact: true }).waitFor();
		await writeFile(modelFile, '{"version":99}');
		await reading.getByText('Expected:', { exact: false }).first().waitFor();
		assert.equal(await reading.getByText('Diagram: Accessible Payment', { exact: true }).count(), 0, 'Invalid updates do not leave stale diagram text');
		await writeFile(modelFile, baseline);
		await reading.getByText('Diagram: Esito pagamento', { exact: true }).waitFor();
		await window.keyboard.press('Escape');
		const settingsFile = path.join(userData, 'User/settings.json');
		const settings = JSON.parse(await readFile(settingsFile, 'utf8'));
		await writeFile(settingsFile, JSON.stringify({ ...settings, 'accessibility.verbosity.ade': false }));
		await window.waitForFunction(() => document.querySelector('.ade-shell')!.getAttribute('aria-description')! === '');
		assert.equal(await sidebar.getAttribute('aria-description'), '');
		await writeFile(settingsFile, JSON.stringify({ ...settings, 'accessibility.verbosity.ade': true }));
		await window.waitForFunction(() => document.querySelector('.ade-shell')!.getAttribute('aria-description')!.includes('Accessibility Help'));
		const keybindingsFile = path.join(userData, 'User/keybindings.json');
		await writeFile(keybindingsFile, JSON.stringify([{ key: 'ctrl+alt+shift+r', command: 'editor.action.accessibleView' }]));
		await window.waitForFunction(() => document.querySelector('.ade-shell')!.getAttribute('aria-description')!.includes('+R'));
		await selected.focus();
		await window.keyboard.press('Control+Alt+Shift+r');
		await reading.getByText('Diagram: Esito pagamento', { exact: true }).waitFor();
		await window.keyboard.press('Escape');
		await writeFile(keybindingsFile, '[]');
		await window.waitForFunction(() => !document.querySelector('.ade-shell')!.getAttribute('aria-description')!.includes('+R'));
		await sidebar.getByRole('button', { name: 'Percorso acquisto', exact: true }).click();
		await shell.getByRole('heading', { name: 'Percorso acquisto', exact: true }).waitFor();
		assert.equal(await readFile(modelFile, 'utf8'), baseline);
		console.log('PASS: ADE reading and help from canvas/sidebar, both payment conditions, live external updates, invalid-state recovery, focus restoration, verbosity and custom keybinding.');
	}

	async function checkVisualUX() {
		const window = await launch();
		console.log('UX: desktop launched.');
		const shell = window.locator('.ade-shell');
		await openModelFile(window, modelFile);
		await checkDiagramAccessibility(window);
		console.log('UX: editable model opened.');
		await shell.locator('.ade-canvas').waitFor();
		await harness.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(800, 800));
		await window.locator('.ade-shell.ade-narrow').waitFor();
		const viewport = shell.locator('.ade-canvas-scroll');
		await viewport.focus();
		await window.keyboard.press('ArrowRight');
		assert.ok(await viewport.evaluate(element => element.scrollLeft) > 0, 'Canvas background supports keyboard pan');
		await window.keyboard.press('Tab');
		assert.equal(await shell.locator('.ade-node').first().evaluate(element => element === document.activeElement), true);
		await window.keyboard.press('Enter');
		assert.equal(await shell.locator('.ade-node').first().getAttribute('aria-pressed'), 'true');
		const content = shell.locator('.ade-content');
		await content.evaluate(element => { element.scrollTop = element.scrollHeight; });
		const scrollBefore = await content.evaluate(element => element.scrollTop);
		await shell.locator('.ade-node').last().evaluate(element => { if (!(element instanceof HTMLElement)) { throw new Error('Expected an HTML canvas node'); } element.click(); });
		assert.equal(await content.evaluate(element => element.scrollTop), scrollBefore, 'Selection retains the property reading position');
		await viewport.focus();
		await window.keyboard.press('ArrowRight');
		const panBefore = await viewport.evaluate(element => element.scrollLeft);
		await openModelFile(window, otherFile);
		await shell.locator('.ade-breadcrumbs').getByRole('button', { name: 'Other System', exact: true }).waitFor();
		assert.equal(await viewport.evaluate(element => element.scrollLeft), 0, 'Equal view IDs in different documents do not share scroll');
		await openModelFile(window, modelFile);
		await shell.locator('.ade-breadcrumbs').getByRole('button', { name: 'Acquisto', exact: true }).waitFor();
		assert.equal(await viewport.evaluate(element => element.scrollLeft), panBefore, 'Returning to a document restores its own scroll');
		await shell.getByRole('button', { name: 'Fit Diagram', exact: true }).click();
		assert.ok(await viewport.evaluate(element => element.scrollWidth <= element.clientWidth + 1), 'Fit contains the diagram horizontally');
		assert.equal(await viewport.evaluate(element => element.scrollLeft), 0);
		const fittedZoom = await shell.locator('.ade-canvas-content').evaluate(element => element.style.transform);
		await shell.getByRole('button', { name: 'Fit Diagram', exact: true }).click();
		assert.equal(await shell.locator('.ade-canvas-content').evaluate(element => element.style.transform), fittedZoom, 'Fitting twice keeps the same zoom');
		const layout = await shell.evaluate(element => {
			const content = element.querySelector('.ade-content')!;
			const canvas = element.querySelector('.ade-visual')!.getBoundingClientRect();
			const properties = element.querySelector('.ade-properties')!.getBoundingClientRect();
			return { overflows: content.scrollWidth > content.clientWidth + 1, stacked: properties.top >= canvas.bottom };
		});
		assert.deepEqual(layout, { overflows: false, stacked: true });
		console.log('UX: canvas keyboard and narrow layout checked.');
		const options = shell.locator('summary').getByText('Diagram Options', { exact: true });
		if (await options.evaluate(element => element.closest('details')!.open)) { await options.click(); }
		await options.focus();
		await window.keyboard.press('Enter');
		await shell.getByRole('button', { name: 'Rename Diagram', exact: true }).waitFor();
		await runCommand(window, 'A.D.E: Rename Diagram');
		await enterValue(window, 'Name', 'Keyboard diagram');
		await shell.getByRole('heading', { name: 'Keyboard diagram', exact: true }).waitFor();
		assert.equal(await shell.locator('details', { hasText: 'Diagram Options' }).evaluate(element => element instanceof HTMLDetailsElement && element.open), true);
		const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
		await window.keyboard.press(`${modifier}+s`);
		await shell.getByText('Saved', { exact: true }).waitFor();
		console.log('UX: keyboard command edit saved.');
		const settingsFile = path.join(userData, 'User/settings.json');
		const settings = JSON.parse(await readFile(settingsFile, 'utf8'));
		const themes = [['Light Modern', 'Light Modern', 'vs'], ['Dark Modern', 'Dark Modern', 'vs-dark'], ['Dark High Contrast', 'Default High Contrast', 'hc-black'], ['Light High Contrast', 'Default High Contrast Light', 'hc-light']];
		for (const [name, themeId, themeClass] of themes) {
			// Exercise the real configuration watcher and theme contributions using an isolated profile.
			await writeFile(settingsFile, JSON.stringify({ ...settings, 'workbench.colorTheme': themeId }));
			await window.locator(`.monaco-workbench.${themeClass}`).waitFor();
			const selected = shell.locator('.ade-node[aria-pressed="true"]');
			await selected.focus();
			await window.keyboard.press('Tab');
			await window.keyboard.press('Shift+Tab');
			// Resolve translucent surface colors through ancestors instead of comparing token names.
			const appearance = await selected.evaluate(element => {
				const rgba = (value: string) => value.match(/[\d.]+/g)!.map(Number);
				const background = [0, 0, 0, 0];
				for (let surface: Element | null = element; surface && background[3] < 1; surface = surface.parentElement) {
					const color = rgba(getComputedStyle(surface).backgroundColor);
					const alpha = color[3] ?? 1;
					for (let index = 0; index < 3; index++) { background[index] += color[index] * alpha * (1 - background[3]); }
					background[3] += alpha * (1 - background[3]);
				}
				const style = getComputedStyle(element);
				return { foreground: rgba(style.color), background, outline: style.outlineStyle, outlineColor: style.outlineColor };
			});
			const luminance = (color: number[]) => color.slice(0, 3).map((channel: number) => channel / 255).map((channel: number) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4).reduce((sum: number, channel: number, index: number) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
			const light = luminance(appearance.foreground);
			const dark = luminance(appearance.background);
			const contrast = (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
			assert.ok(contrast >= 4.5, `${name}: selected node text contrast ${contrast.toFixed(2)}`);
			assert.notEqual(appearance.outline, 'none', `${name}: keyboard focus is visible`);
			assert.notEqual(appearance.outlineColor, 'rgba(0, 0, 0, 0)');
			await window.screenshot({ path: path.join(evidence, `ux-${themeClass}.png`) });
			await clickAdeButton(window, 'System Map');
			await shell.getByRole('button', { name: 'Read System Map', exact: true }).waitFor();
			assert.equal(await shell.locator('.ade-content').evaluate(element => element.scrollWidth > element.clientWidth + 1), false, `${name}: narrow map fits its content area`);
			const mapElement = shell.locator('.ade-atlas-node button[data-action="filter"]').first();
			await mapElement.focus();
			await window.keyboard.press('Tab');
			await window.keyboard.press('Shift+Tab');
			assert.equal(await mapElement.evaluate(element => element === document.activeElement), true, `${name}: map retains keyboard focus`);
			await window.screenshot({ path: path.join(evidence, `map-${themeClass}.png`) });
			await shell.getByRole('button', { name: 'Back', exact: true }).click();
			await selected.waitFor();
			console.log(`PASS: narrow layout, keyboard focus and selected-node text contrast ${contrast.toFixed(2)}:1 in ${name}.`);
		}
		const selection = await shell.locator('.ade-node[aria-pressed="true"]').textContent();
		await clickAdeButton(window, 'Terminal');
		const terminalInput = window.locator('.terminal .xterm-helper-textarea');
		await terminalInput.waitFor({ state: 'attached' });
		await terminalInput.focus();
		await window.keyboard.type(`printf 'ADE_TERMINAL_OK\\n'\n`);
		await window.locator('.terminal .xterm-rows > div').filter({ hasText: /^ADE_TERMINAL_OK\s*$/ }).waitFor();
		await window.keyboard.press(process.platform === 'linux' ? 'Alt+Shift+F1' : 'Alt+F1');
		const terminalHelp = window.locator('.accessible-view:visible');
		await terminalHelp.getByText('The Focus Accessible Terminal View command', { exact: false }).waitFor();
		assert.equal(await terminalHelp.getByText('A.D.E Accessibility Help', { exact: true }).count(), 0, 'ADE providers do not intercept help in technical tools');
		await window.keyboard.press('Escape');
		await window.keyboard.press(`${modifier}+Alt+d`);
		await window.locator('.ade-sidebar').waitFor();
		await shell.locator('.ade-properties').getByRole('heading', { name: selection ?? '', exact: true }).waitFor();
		console.log('PASS: integrated terminal executes a command and returns to the same model selection.');
		await harness.app.close();
		harness.app = undefined;
		const restored = await launch();
		await restored.locator('.ade-shell').getByRole('heading', { name: 'Keyboard diagram', exact: true }).waitFor();
		assert.equal(await restored.locator('.tabs-container .tab').filter({ hasText: 'checkout.ade.json' }).count(), 0);
		console.log('PASS: keyboard pan/selection, Fit Diagram, retained scroll, accessible options, command editing and saved context after restart.');
		await harness.app.close();
		harness.app = undefined;
	}

	async function checkManualFollowup() {
		let window = await launch();
		console.log('Followup: desktop launched.');
		const shell = window.locator('.ade-shell');
		await openModelFile(window, modelFile);
		await shell.locator('.ade-node').first().waitFor();
		console.log('Followup: editable diagram opened.');
		const initial = await shell.locator('g.ade-connection').count();
		const source = shell.locator('.ade-node').filter({ hasText: /^Checkout$/ });
		await source.click({ button: 'right' });
		await window.getByRole('menuitem', { name: 'Create Relationship on Canvas…', exact: true }).press('Enter');
		await pickValue(window, 'Relationship Type', 'Dependency');
		await shell.getByText('Choose a Compatible Target on the Canvas', { exact: false }).waitFor();
		await window.keyboard.press('Escape');
		assert.equal(await shell.locator('g.ade-connection').count(), initial);
		await source.click({ button: 'right' });
		await window.getByRole('menuitem', { name: 'Create Relationship on Canvas…', exact: true }).press('Enter');
		await pickValue(window, 'Relationship Type', 'Dependency');
		await shell.locator('.ade-node').filter({ hasText: /^Carrello$/ }).click();
		await enterValue(window, 'Relationship Name', 'Dipendenza dal carrello');
		await enterValue(window, 'Condition (Optional)', 'carrello valido');
		assert.equal(await shell.locator('g.ade-connection').count(), initial + 1);
		await shell.getByRole('button', { name: 'Undo', exact: true }).click();
		assert.equal(await shell.locator('g.ade-connection').count(), initial);
		console.log('Followup: canvas creation, cancellation and undo checked.');
		await source.click({ button: 'right' });
		await window.getByRole('menuitem', { name: 'Create Relationship on Canvas…', exact: true }).press('Enter');
		await pickValue(window, 'Relationship Type', 'Dependency');
		await shell.getByRole('button', { name: 'Diagrams', exact: true }).click();
		await pickValue(window, 'Choose Diagram', 'Esito pagamento');
		assert.equal(await shell.getByText('Choose a Compatible Target on the Canvas', { exact: false }).count(), 0, 'Changing diagrams cancels the pending relationship');
		await shell.getByRole('button', { name: 'Diagrams', exact: true }).click();
		await pickValue(window, 'Choose Diagram', 'Percorso acquisto');
		const relation = shell.locator('.ade-connection-label').filter({ hasText: /^Write · crea ordine/ });
		await relation.click({ button: 'right' });
		await window.getByRole('menuitem', { name: 'Edit Relationship…', exact: true }).waitFor();
		await window.screenshot({ path: path.join(evidence, 'followup-relation-menu.png') });
		await window.getByRole('menuitem', { name: 'Edit Relationship…', exact: true }).press('Enter');
		await pickValue(window, 'Relationship Source', 'Conferma ordine');
		await pickValue(window, 'Relationship Type', 'Read');
		await pickValue(window, 'Target Element', 'Ordine');
		await enterValue(window, 'Relationship Name', 'Legge ordine');
		await enterValue(window, 'Condition (Optional)', 'ordine esistente');
		await pickValue(window, 'Relationship Error', 'No Error');
		await shell.locator('.ade-connection-label').filter({ hasText: /^Read · Legge ordine · \[ordine esistente\]/ }).waitFor();
		await shell.getByRole('button', { name: 'Undo', exact: true }).click();
		await relation.waitFor();
		await clickAdeButton(window, 'Arrange Diagram');
		await pickValue(window, 'Diagram Spacing', 'Spacious');
		await shell.getByRole('button', { name: 'Fit Diagram', exact: true }).click();
		await window.screenshot({ path: path.join(evidence, 'followup-canvas.png') });
		await window.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+s`);
		await shell.getByText('Saved', { exact: true }).waitFor();
		console.log('Followup: relation editing and layout checked.');
		const folder = path.join(directory, 'nuovo progetto');
		await mkdir(folder);
		await runCommand(window, 'A.D.E: Create Project');
		await enterValue(window, 'Name', 'Progetto di collaudo');
		await chooseFolder(window, folder);
		await shell.getByRole('heading', { name: 'Progetto di collaudo', exact: true }).waitFor({ timeout: 90000 });
		await clickAdeButton(window, 'Files');
		await window.locator('.explorer-viewlet').getByText('nuovo progetto', { exact: true }).first().waitFor();
		await runCommand(window, 'A.D.E: Return to Model');
		await clickAdeButton(window, 'Terminal');
		const terminal = window.locator('.terminal .xterm-helper-textarea');
		await terminal.waitFor({ state: 'attached' });
		await terminal.focus(); await window.keyboard.type(`printf '__ADE_PROJECT_ROOT__'; pwd\n`);
		// Terminal rows wrap at the viewport width; reconstruct the output before comparing a long path.
		await window.waitForFunction(expected => [...document.querySelectorAll('.terminal .xterm-rows > div')].map(row => row.textContent).join('').includes(expected), '__ADE_PROJECT_ROOT__' + folder);
		await window.screenshot({ path: path.join(evidence, 'followup-project-terminal.png') });
		await harness.app.close(); harness.app = undefined;
		args[1] = folder;
		window = await launch();
		await window.locator('.ade-shell').getByRole('heading', { name: 'Progetto di collaudo', exact: true }).waitFor();
		await harness.app.close(); harness.app = undefined;
		await writeFile(path.join(evidence, 'followup-results.json'), JSON.stringify({ platform: process.platform, recordedAt: new Date().toISOString(), canvasConnectionAndCancel: true, relationshipEditingAndUndo: true, layoutAndFit: true, projectFiles: true, terminalCwd: true, restart: true }, null, 2));
		console.log('PASS: native context menus, canvas connection/cancel, relation editing/undo, layout, project Files, terminal cwd and restart.');
	}

	return { checkDiagramAccessibility, checkVisualUX, checkManualFollowup };
}
