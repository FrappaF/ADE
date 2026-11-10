/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Page } from 'playwright-core';
import path from 'node:path';

export async function revealAdeButton(window: Page, name: string) {
	const shell = window.locator('.ade-shell');
	let button = shell.getByRole('button', { name, exact: true, includeHidden: true });
	if (!await button.count()) { await shell.getByRole('tab', { name: 'Project', exact: true }).click(); button = shell.getByRole('button', { name, exact: true, includeHidden: true }); }
	for (const disclosure of await button.locator('xpath=ancestor::details').all()) {
		if (!await disclosure.evaluate(element => element instanceof HTMLDetailsElement && element.open)) { await disclosure.locator(':scope > summary').click(); }
	}
	return button;
}

export async function clickAdeButton(window: Page, name: string) {
	if (name === 'Return to Model') { await runCommand(window, 'A.D.E: Return to Model'); return; }
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
	await window.locator('.ade-floating-menu').getByRole('button', { name: 'Diagrams', exact: true }).click();
	await pickValue(window, 'Choose Diagram', name);
}

export async function openProperties(window: Page) {
	const button = window.locator('.ade-shell').getByRole('button', { name: 'Properties', exact: true, includeHidden: true });
	if (await button.count() && await button.getAttribute('aria-pressed') !== 'true') { await clickAdeButton(window, 'Properties'); }
	const menu = window.locator('.ade-floating-menu > details');
	if (await menu.count() && await menu.evaluate(element => element instanceof HTMLDetailsElement && element.open)) { await menu.locator(':scope > summary').click(); }
}

export async function openAiSettings(window: Page) {
	await window.locator('.ade-shell').getByRole('tab', { name: 'AI Settings', exact: true }).click();
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
	await widget.locator('input:visible').fill(label);
	// Match the complete item label, not a highlighted substring in another result.
	const choice = widget.locator('.quick-input-list .quick-input-list-row:first-child .label-name').filter({ hasText: new RegExp(`^${RegExp.escape(label)}$`) });
	await choice.click();
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
	await pickValue(window, 'Element Type', kind);
	await enterValue(window, 'Name', name);
	await window.locator('.ade-canvas').getByRole('button', { name, exact: true }).waitFor();
}

export async function connect(window: Page, source: string, target: string, kind: string, name: string, condition: string) {
	await window.locator('.ade-canvas').getByRole('button', { name: source, exact: true }).click();
	await window.locator('.ade-properties').getByRole('button', { name: 'Connect Selection', exact: true }).click();
	await pickValue(window, 'Relationship Type', kind);
	await pickValue(window, 'Target Element', target);
	await enterValue(window, 'Relationship Name', name);
	await enterValue(window, 'Condition (Optional)', condition);
	await window.locator('.quick-input-widget').waitFor({ state: 'hidden' });
}

export async function runCommand(window: Page, name: string) {
	const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
	await window.keyboard.press(`${modifier}+Shift+P`);
	await window.locator('.quick-input-widget input:visible').fill(`>${name}`);
	await window.locator('.quick-input-widget .monaco-list-row').getByText(name, { exact: true }).waitFor();
	await window.keyboard.press('Enter');
}

export async function searchSystem(window: Page, kind: string, name: string) {
	await clickAdeButton(window, 'Search System');
	await pickValue(window, 'Search Filter', kind);
	await window.locator('.quick-input-widget input:visible').fill(name);
	await pickValue(window, 'Search System', name);
}

export async function contractEntry(window: Page, name: string, section: string, entry = 'Add Entry') {
	await clickAdeButton(window, 'Edit Behavioral Contract');
	await pickValue(window, `Behavioral Contract: ${name}`, section);
	await pickValue(window, section, entry);
	if (entry !== 'Add Entry') { await pickValue(window, `Contract Entry: ${entry}`, 'Edit Entry'); }
}
