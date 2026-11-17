/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Page } from 'playwright-core';
import path from 'node:path';
import { mkdir, symlink } from 'node:fs/promises';
import type { SmokeHarness } from './harness.ts';

export async function revealAdeButton(window: Page, name: string) {
	const shell = window.locator('.ade-shell');
	let button = shell.getByRole('button', { name, exact: true, includeHidden: true });
	if (!await button.count()) {
		if (name === 'Update Code') { await openCodeActions(window); }
		else { await openProjectSection(window, 'Project Settings'); }
		button = shell.getByRole('button', { name, exact: true, includeHidden: true });
	}
	for (const disclosure of await button.locator('xpath=ancestor::details').all()) {
		if (!await disclosure.evaluate(element => element instanceof HTMLDetailsElement && element.open)) { await disclosure.locator(':scope > summary').click(); }
	}
	return button;
}

export async function clickAdeButton(window: Page, name: string) {
	if (name === 'Return to Model') {
		const back = window.locator('.ade-workspace-bar').getByRole('button', { name: 'Back to Diagram', exact: true });
		if (await back.isVisible()) { await back.click(); }
		else { await runCommand(window, 'A.D.E: Return to Model'); }
		return;
	}
	await (await revealAdeButton(window, name)).click();
}

export async function closeCanvasActions(window: Page) {
	const menu = window.locator('.ade-floating-menu > details');
	if (await menu.count() && await menu.evaluate(element => element instanceof HTMLDetailsElement && element.open)) { await menu.locator(':scope > summary').click(); }
}

export async function revealAdeText(window: Page, text: string) {
	const target = window.locator('.ade-shell').getByText(text, { exact: true });
	await target.waitFor({ state: 'attached' });
	for (const disclosure of await target.locator('xpath=ancestor::details').all()) {
		if (!await disclosure.evaluate(element => element instanceof HTMLDetailsElement && element.open)) { await disclosure.locator(':scope > summary').click(); }
	}
	await target.waitFor();
	return target;
}

export async function chooseAdeDiagram(window: Page, name: string) {
	await closeCanvasActions(window);
	await runCommand(window, 'A.D.E: Return to Model');
	const picker = window.locator('.ade-workspace-bar .ade-diagram-picker');
	if (await picker.count()) {
		if (await picker.getAttribute('aria-haspopup') !== 'listbox') { await picker.click(); }
		await window.locator('.ade-workspace-bar .ade-diagram-picker').click();
	} else { await window.locator('.ade-shell .ade-navigation').getByRole('button', { name: 'Diagrams', exact: true }).click(); }
	await pickValue(window, 'Choose Diagram', name);
}

export async function openProperties(window: Page) {
	const button = window.locator('.ade-shell').getByRole('button', { name: 'Properties', exact: true, includeHidden: true });
	if (!await window.locator('.ade-properties').count() && await button.count()) { await clickAdeButton(window, 'Properties'); }
	const menu = window.locator('.ade-floating-menu > details');
	if (await menu.count() && await menu.evaluate(element => element instanceof HTMLDetailsElement && element.open)) { await menu.locator(':scope > summary').click(); }
}

/** Establish the navigation view before scenarios inspect its diagram entries. */
export async function openDiagramNavigation(window: Page) {
	const sidebar = window.locator('.ade-sidebar');
	if (await sidebar.isVisible()) { return; }
	const diagrams = window.locator('.ade-workspace-bar').getByRole('button', { name: 'Diagrams', exact: true });
	if (!await window.locator('.monaco-workbench .part.sidebar').isVisible() && await diagrams.count()) { await diagrams.click(); }
	else {
		await runCommand(window, 'A.D.E: Show Diagram Navigation');
	}
	await sidebar.waitFor();
	await window.waitForFunction(() => !!document.querySelector('.ade-sidebar')?.contains(document.activeElement));
}

async function openProjectSection(window: Page, name: string) {
	const menu = window.locator('.ade-project-menu');
	if (!await menu.evaluate(element => element instanceof HTMLDetailsElement && element.open)) { await menu.locator(':scope > summary').click(); }
	await menu.getByRole('button', { name, exact: true }).click();
}

export async function openCodeActions(window: Page) {
	const code = window.locator('.ade-workspace-bar').getByRole('button', { name: 'Code', exact: true });
	if (await code.getAttribute('aria-pressed') !== 'true') { await code.click(); }
	return window.locator('.ade-content');
}

export async function codeAction(window: Page, name: string, disabled?: boolean) {
	await openCodeActions(window);
	await revealAdeButton(window, name);
	return window.locator('.ade-shell').getByRole('button', { name, exact: true, disabled });
}

export async function installSimulatedCodex(harness: SmokeHarness, executable: string) {
	const bin = path.join(harness.directory, 'simulated-cli-bin');
	await mkdir(bin);
	await symlink(executable, path.join(bin, 'codex'));
	harness.launchEnv.PATH = bin + path.delimiter + harness.launchEnv.PATH;
	harness.args.push('--force-disable-user-env');
}

export async function openAiSettings(window: Page) {
	await openProjectSection(window, 'AI Settings');
	return window.locator('.ade-content');
}

export async function openModelFile(window: Page, file: string) {
	await runCommand(window, 'A.D.E: Open Model');
	await window.locator('.quick-input-widget').getByText('Open A.D.E Model', { exact: true }).waitFor();

	const input = window.locator('.quick-input-widget input:visible');
	await input.waitFor();
	await input.fill(path.dirname(file) + path.sep);
	await window.locator('.quick-input-widget').getByText(path.basename(file), { exact: true }).dblclick();
	await input.waitFor({ state: 'hidden' });
	await window.waitForFunction(() => !document.querySelector('.ade-content')?.textContent?.includes('Loading model…'));
	await openProperties(window);
}

export async function enterValue(window: Page, title: string, value: string) {
	const widget = window.locator('.quick-input-widget');
	await widget.getByText(title, { exact: true }).waitFor();
	await widget.locator('input:visible').fill(value);
	await window.keyboard.press('Enter');
	await widget.getByText(title, { exact: true }).waitFor({ state: 'hidden' });
}

export async function pickValue(window: Page, title: string, label: string, timeout = 30000) {
	const widget = window.locator('.quick-input-widget');
	await widget.getByText(title, { exact: true }).waitFor({ timeout });
	const initialChoices = await widget.locator('.quick-input-list-row .label-name').allTextContents();
	await widget.locator('input:visible').fill(label);
	// Match the complete item label, not a highlighted substring in another result.
	const choice = widget.locator('.quick-input-list .quick-input-list-row:first-child .label-name').filter({ hasText: new RegExp(`^${RegExp.escape(label)}$`) });
	try { await choice.click(); }
	catch (error) { console.error(`Quick pick ${title}: expected ${label}; initial choices: ${JSON.stringify(initialChoices)}`); throw error; }
	// A following input may reuse the title, as when adding a precondition.
	await choice.waitFor({ state: 'hidden' });
}

export async function readAccessibleText(window: Page, expected: readonly string[]) {
	const reading = window.locator('.accessible-view:visible');
	await reading.waitFor();
	// Native Find reveals each expected line regardless of viewport size or trailing contract details.
	for (const text of expected) {
		await window.keyboard.press(process.platform === 'darwin' ? 'Meta+f' : 'Control+f');
		await reading.locator('.find-widget .find-part :is(input, textarea)').fill(text);
		// Exclude the Find input's mirrored text: the document line itself must be rendered.
		await reading.locator('.view-lines').getByText(text, { exact: true }).waitFor();
		await window.keyboard.press('Escape');
	}
	// Reopening this provider restores its cursor, so leave its title visible for the next reading.
	await window.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowUp' : 'Control+Home');
}

export async function chooseFolder(window: Page, folder: string) {
	const widget = window.locator('.quick-input-widget');
	await widget.getByText('Choose Project Folder', { exact: true }).waitFor();
	await widget.locator('input:visible').fill(folder + path.sep);
	await widget.getByRole('button', { name: 'OK', exact: true }).click();
	await widget.waitFor({ state: 'hidden' });
}

export async function addElement(window: Page, kind: string, name: string) {
	await window.locator('.ade-shell').getByRole('button', { name: 'Add Element', exact: true }).click();
	const widget = window.locator('.quick-input-widget');
	await widget.getByText('Element Type', { exact: true }).waitFor();
	await widget.locator('.quick-input-list-row .label-name').first().waitFor();
	const direct = widget.locator('.quick-input-list-row .label-name').filter({ hasText: new RegExp(`^${RegExp.escape(kind)}$`) });
	if (await direct.count()) { await pickValue(window, 'Element Type', kind); }
	else {
		const groups: Record<string, readonly string[]> = {
			Architecture: ['Software System', 'Container', 'Package'],
			Data: ['Entity', 'Table', 'Class', 'Contract', 'Data Store'],
			Interfaces: ['Interface'],
			Behavior: ['Controller', 'Action', 'State', 'Use Case', 'Process'],
			Flow: ['Decision', 'Start', 'End'],
			Infrastructure: ['Deployment Node', 'Artifact', 'Network Node']
		};
		const group = Object.entries(groups).find(([, kinds]) => kinds.includes(kind))?.[0];
		if (!group) { throw new Error(`No element type group for ${kind}`); }
		await pickValue(window, 'Element Type', 'More Element Types');
		await pickValue(window, 'Element Type', group);
		await pickValue(window, group, kind);
	}
	await enterValue(window, 'Name', name);
	await window.locator('.ade-canvas').getByRole('button', { name, exact: true }).waitFor();
}

export async function connect(window: Page, source: string, target: string, kind: string, name: string, condition: string) {
	await closeCanvasActions(window);
	await window.locator('.ade-canvas').getByRole('button', { name: source, exact: true }).click();
	await openProperties(window);
	await clickAdeButton(window, 'Connect Selection');
	await pickValue(window, 'Relationship Type', kind);
	await pickValue(window, 'Target Element', target);
	await enterValue(window, 'Relationship Name', name);
	await enterValue(window, 'Condition (Optional)', condition);
	await window.locator('.quick-input-widget').waitFor({ state: 'hidden' });
}

export async function runCommand(window: Page, name: string) {
	const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
	await window.locator('.monaco-dialog-box:visible').waitFor({ state: 'hidden' });
	await window.keyboard.press(`${modifier}+Shift+P`);
	await window.locator('.quick-input-widget input:visible').fill(`>${name}`);
	await window.locator('.quick-input-widget .monaco-list-row').getByText(name, { exact: true }).waitFor();
	await window.keyboard.press('Enter');
}

export async function searchSystem(window: Page, kind: string, name: string) {
	await runCommand(window, 'A.D.E: Search System');
	const widget = window.locator('.quick-input-widget');
	await widget.getByText('Search System', { exact: true }).waitFor();
	await widget.locator('input:visible').fill(name);
	const type = kind === 'Diagrams' ? 'Diagram' : kind;
	const row = widget.locator('.quick-input-list-row')
		.filter({ has: window.locator('.label-name').filter({ hasText: new RegExp(`^${RegExp.escape(name)}$`) }) })
		.filter({ has: window.locator('.label-description').filter({ hasText: new RegExp(`^${RegExp.escape(type)}$`) }) });
	await row.click();
	await row.waitFor({ state: 'hidden' });
}

export async function contractEntry(window: Page, name: string, section: string, entry = 'Add Entry') {
	await clickAdeButton(window, 'Edit Behavioral Contract');
	await pickValue(window, `Behavioral Contract: ${name}`, section);
	await pickValue(window, section, entry);
	if (entry !== 'Add Entry') { await pickValue(window, `Contract Entry: ${entry}`, 'Edit Entry'); }
}
