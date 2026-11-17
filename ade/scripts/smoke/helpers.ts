/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Locator, Page } from 'playwright-core';
import path from 'node:path';
import { mkdir, symlink } from 'node:fs/promises';
import type { SmokeHarness } from './harness.ts';

/** Reveal semantic tab panels and disclosures in document order, without relying on their labels. */
async function revealAdeAncestors(window: Page, target: Locator) {
	await target.waitFor({ state: 'attached' });
	const ancestors = target.locator('xpath=ancestor::*[@role="tabpanel" or self::details]');
	for (const ancestor of await ancestors.all()) {
		if (await ancestor.getAttribute('role') === 'tabpanel') {
			if (!await ancestor.evaluate(element => element.hasAttribute('hidden'))) { continue; }
			const labels = (await ancestor.getAttribute('aria-labelledby'))?.split(/\s+/) ?? [];
			const panelId = await ancestor.getAttribute('id');
			let activated = false;
			for (const tab of await window.getByRole('tab', { includeHidden: true }).all()) {
				if (labels.includes(await tab.getAttribute('id') ?? '') && await tab.getAttribute('aria-controls') === panelId) {
					await tab.click(); activated = true; break;
				}
			}
			if (!activated) { throw new Error('No accessible tab controls the hidden ADE panel.'); }
		} else if (!await ancestor.evaluate(element => element instanceof HTMLDetailsElement && element.open)) {
			await ancestor.locator(':scope > summary').click();
		}
	}
	await target.waitFor();
}

export async function revealAdeButton(window: Page, name: string) {
	const shell = window.locator('.ade-shell');
	let button = shell.getByRole('button', { name, exact: true, includeHidden: true });
	if (!await button.count()) {
		if (name === 'Update Code') { await openCodeActions(window); }
		else { await openProjectSection(window, 'Project Settings'); }
		button = shell.getByRole('button', { name, exact: true, includeHidden: true });
	}
	await revealAdeAncestors(window, button);
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
	await revealAdeAncestors(window, target);
	// Decorated disclosures put their visible label in a span; retain the summary identity.
	const summary = target.locator('xpath=ancestor-or-self::summary[1]');
	return await summary.count() ? summary : target;
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

/** Support native quick inputs, grouped forms and shared wizard steps by their visible labels. */
export async function enterValue(window: Page, title: string, value: string) {
	const surface = window.locator('.quick-input-widget:visible, dialog.ade-form-dialog:visible, dialog.ade-editing-wizard:visible').filter({ has: window.getByText(title, { exact: true }) }).first();
	await surface.waitFor();
	if (await surface.evaluate(element => element.matches('dialog.ade-form-dialog'))) {
		await surface.getByLabel(title, { exact: true }).fill(value);
		await submitAdeForm(window);
	} else if (await surface.evaluate(element => element.matches('dialog.ade-editing-wizard'))) {
		const input = await surface.locator('input[type="text"], input[type="password"]').elementHandle();
		await surface.locator('input[type="text"], input[type="password"]').fill(value);
		await surface.getByRole('button', { name: 'Next', exact: true }).click();
		await input!.waitForElementState('hidden');
	} else {
		await surface.locator('input:visible').fill(value);
		await window.keyboard.press('Enter');
		await surface.getByText(title, { exact: true }).waitFor({ state: 'hidden' });
	}
}

export async function pickValue(window: Page, title: string, label: string, timeout = 30000) {
	const surface = window.locator('.quick-input-widget:visible, dialog.ade-editing-wizard:visible').filter({ has: window.getByText(title, { exact: true }) }).first();
	await surface.waitFor({ timeout });
	if (await surface.evaluate(element => element.matches('dialog.ade-editing-wizard'))) {
		const choice = surface.locator('label.ade-blueprint-choice').filter({ has: window.locator('strong').filter({ hasText: new RegExp(`^${RegExp.escape(label)}$`) }) });
		const previous = await choice.elementHandle();
		await choice.click();
		await surface.getByRole('button', { name: 'Next', exact: true }).click();
		await previous!.waitForElementState('hidden');
		return;
	}
	const initialChoices = await surface.locator('.quick-input-list-row .label-name').allTextContents();
	await surface.locator('input:visible').fill(label);
	// Match the complete item label, not a highlighted substring in another result.
	const choice = surface.locator('.quick-input-list .quick-input-list-row:first-child .label-name').filter({ hasText: new RegExp(`^${RegExp.escape(label)}$`) });
	try { await choice.click(); }
	catch (error) { console.error(`Quick pick ${title}: expected ${label}; initial choices: ${JSON.stringify(initialChoices)}`); throw error; }
	await choice.waitFor({ state: 'hidden' });
}

/** Review remains an explicit smoke action, matching the product's atomic save boundary. */
export async function applyWizardChanges(window: Page) {
	const wizard = window.locator('dialog.ade-editing-wizard:visible');
	await wizard.getByRole('heading', { name: 'Review Your Changes', exact: true }).waitFor();
	await wizard.getByRole('button', { name: 'Apply Changes', exact: true }).click();
	await wizard.waitFor({ state: 'hidden' });
}

export async function submitAdeForm(window: Page) {
	const dialog = window.locator('dialog.ade-form-dialog:visible');
	await dialog.locator(':scope > footer button[type="submit"]').click();
	await dialog.waitFor({ state: 'hidden' });
}

/** Match context-qualified options while rejecting ambiguous homonyms. */
async function selectAdeFormOption(window: Page, field: string, label: string, context?: string) {
	const select = window.locator('dialog.ade-form-dialog:visible').getByLabel(field, { exact: true });
	await select.waitFor();
	const options = await select.locator('option').evaluateAll(options => options.map(option => ({ label: option.textContent ?? '', value: option.getAttribute('value') ?? '' })));
	const matches = options.filter(option => (option.label === label || option.label.startsWith(label + ' · ')) && (!context || option.label.includes(context)));
	if (matches.length !== 1) { throw new Error(`Expected one ${field} option for ${label}${context ? ` (${context})` : ''}; found ${JSON.stringify(matches)}`); }
	await select.selectOption(matches[0].value);
}

/** Complete all fields together, then submit once, including an optional new lifecycle resource. */
export async function completeDiagramForm(window: Page, options: { name: string; kind: string; feature: string; resource?: string; resourceContext?: string; newResource?: string }) {
	const dialog = window.locator('dialog.ade-form-dialog:visible');
	await dialog.getByRole('heading', { name: 'Create Diagram', exact: true }).waitFor();
	await dialog.getByLabel('Name', { exact: true }).fill(options.name);
	await selectAdeFormOption(window, 'Diagram Type', options.kind);
	await selectAdeFormOption(window, 'Choose Feature', options.feature);
	if (options.resource || options.newResource) {
		await selectAdeFormOption(window, 'Resource Whose State Is Represented', options.resource ?? 'Create New Resource', options.resourceContext);
		if (options.newResource) { await dialog.getByLabel('Resource Name', { exact: true }).fill(options.newResource); }
	}
	await submitAdeForm(window);
}

export async function completeRelationForm(window: Page, options: { source?: string; target?: string; kind?: string; name: string; condition: string; error?: string }) {
	const dialog = window.locator('dialog.ade-form-dialog:visible');
	await dialog.waitFor();
	if (options.source) { await selectAdeFormOption(window, 'Relationship Source', options.source); }
	if (options.kind) { await selectAdeFormOption(window, 'Relationship Type', options.kind); }
	if (options.target) { await selectAdeFormOption(window, 'Target Element', options.target); }
	await dialog.getByLabel('Relationship Name', { exact: true }).fill(options.name);
	await dialog.getByLabel('Condition (Optional)', { exact: true }).fill(options.condition);
	if (options.error) { await selectAdeFormOption(window, 'Relationship Error', options.error); }
	await submitAdeForm(window);
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
	const dialog = window.locator('dialog.ade-form-dialog:visible');
	await dialog.getByRole('heading', { name: 'Add Element', exact: true }).waitFor();
	await selectAdeFormOption(window, 'Element Type', kind);
	await dialog.getByLabel('Name', { exact: true }).fill(name);
	await submitAdeForm(window);
	await window.locator('.ade-canvas').getByRole('button', { name, exact: true }).waitFor();
}

export async function connect(window: Page, source: string, target: string, kind: string, name: string, condition: string) {
	await closeCanvasActions(window);
	await window.locator('.ade-canvas').getByRole('button', { name: source, exact: true }).click();
	await openProperties(window);
	await clickAdeButton(window, 'Connect Selection');
	await completeRelationForm(window, { target, kind, name, condition });
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
