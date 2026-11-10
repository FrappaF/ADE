/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SemanticElement, SemanticRelation, ModelView } from '../../../src/vs/workbench/contrib/ade/common/modelTypes.ts';
import type { SmokeHarness } from './harness.ts';
import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { clickAdeButton, openModelFile, enterValue, pickValue, readAccessibleText, searchSystem, contractEntry } from './helpers.ts';

/** navigation scenarios share only the harness values listed here. */
export function createNavigationScenarios(harness: SmokeHarness) {
	const { launch, evidence, checkoutModel, modelFile, validateSemanticModel } = harness;

	async function checkContractEditing(window: import('playwright-core').Page) {
		const shell = window.locator('.ade-shell');
		await contractEntry(window, 'Contratto pagamento', 'Inputs');
		await enterValue(window, 'Field Name', 'amount');
		await enterValue(window, 'Field Type', 'Money');
		await pickValue(window, 'Field Presence', 'Required');
		await shell.getByText('Input: amount (Money), Required', { exact: true }).waitFor();
		await contractEntry(window, 'Contratto pagamento', 'Inputs');
		await window.locator('.quick-input-widget').getByText('Field Name', { exact: true }).waitFor();
		await window.locator('.quick-input-widget input:visible').fill('amount');
		await window.keyboard.press('Enter');
		await window.locator('.quick-input-widget').getByText('A field with this name already exists.', { exact: true }).waitFor();
		await window.keyboard.press('Escape');
		await contractEntry(window, 'Contratto pagamento', 'Outputs');
		await enterValue(window, 'Field Name', 'receipt');
		await window.locator('.quick-input-widget').getByText('Field Type', { exact: true }).waitFor();
		await window.keyboard.press('Escape');
		assert.equal(await shell.getByText('Output:', { exact: false }).count(), 0, 'Escape cancels the partially entered field');
		await contractEntry(window, 'Contratto pagamento', 'Outputs');
		await enterValue(window, 'Field Name', 'receipt');
		await enterValue(window, 'Field Type', 'Receipt');
		await pickValue(window, 'Field Presence', 'Optional');
		await shell.getByText('Output: receipt (Receipt), Optional', { exact: true }).waitFor();
		for (const [section, value] of [['Preconditions', 'Amount is positive'], ['Postconditions', 'At most one payment is authorized']]) {
			await contractEntry(window, 'Contratto pagamento', section);
			await enterValue(window, section, value);
		}
		await contractEntry(window, 'Contratto pagamento', 'Errors');
		await enterValue(window, 'Error Code', 'payment-declined');
		await enterValue(window, 'Error Description', 'No order is confirmed');
		await shell.getByText('Error payment-declined: No order is confirmed', { exact: true }).waitFor();
		await contractEntry(window, 'Contratto pagamento', 'Outputs', 'receipt');
		await enterValue(window, 'Field Name', 'receipt');
		await enterValue(window, 'Field Type', 'PaymentReceipt');
		await pickValue(window, 'Field Presence', 'Required');
		await shell.getByText('Output: receipt (PaymentReceipt), Required', { exact: true }).waitFor();
		await shell.getByRole('button', { name: 'Undo', exact: true }).click();
		await shell.getByText('Output: receipt (Receipt), Optional', { exact: true }).waitFor();
		await shell.getByRole('button', { name: 'Redo', exact: true }).click();
		await shell.getByText('Output: receipt (PaymentReceipt), Required', { exact: true }).waitFor();
		await shell.locator('.ade-properties').getByRole('button', { name: 'Edit Behavioral Contract', exact: true }).click();
		await pickValue(window, 'Behavioral Contract: Contratto pagamento', 'Preconditions');
		await pickValue(window, 'Preconditions', 'Amount is positive');
		await pickValue(window, 'Contract Entry: Amount is positive', 'Remove Entry');
		await shell.getByText('Precondition: Amount is positive', { exact: true }).waitFor({ state: 'hidden' });
		await shell.getByRole('button', { name: 'Undo', exact: true }).click();
		await shell.getByText('Precondition: Amount is positive', { exact: true }).waitFor();
		for (const diagram of ['Esito pagamento', 'Percorso acquisto']) {
			await window.locator('.ade-sidebar').getByRole('button', { name: diagram, exact: true }).click();
			const options = shell.locator('details').filter({ hasText: 'Diagram Options' });
			if (!await options.evaluate(element => element instanceof HTMLDetailsElement && element.open)) { await options.locator('summary').click(); }
			await shell.getByRole('button', { name: 'Add Existing Element', exact: true }).click();
			await pickValue(window, 'Add Existing Element', 'Contratto pagamento');
			await shell.locator('.ade-node[aria-pressed="true"]').filter({ hasText: 'Contratto pagamento' }).waitFor();
			await shell.getByText('Output: receipt (PaymentReceipt), Required', { exact: true }).waitFor();
		}
		await shell.locator('.ade-properties').getByRole('button', { name: 'Element Details', exact: true }).click();
		await shell.getByRole('button', { name: 'Read Element Details', exact: true }).click();
		await readAccessibleText(window, ['Output: receipt (PaymentReceipt), Required']);
		await window.keyboard.press('Escape');
		await shell.getByText('Error payment-declined: No order is confirmed', { exact: true }).scrollIntoViewIfNeeded();
		await window.screenshot({ path: path.join(evidence, 'behavioral-contract.png') });
		console.log('PASS: native contract creation, validation, cancellation, editing, removal, undo/redo and shared details across two diagrams with accessible reading.');
	}

	async function checkSemanticNavigation() {
		let window = await launch();
		let shell = window.locator('.ade-shell');
		await shell.getByRole('button', { name: 'Explore Purchase Example', exact: true }).click();
		const sidebar = () => window.locator('.ade-sidebar');
		const cancellationDetails = () => sidebar().locator('section[aria-label="Annullamento acquisto"] > details');
		const purchaseButton = sidebar().getByRole('button', { name: 'Percorso acquisto', exact: true });
		await purchaseButton.evaluate(button => { button.dataset.integrationIdentity = 'original'; });
		await shell.locator('.ade-node').getByText('Richiedi pagamento', { exact: true }).click();
		assert.equal(await purchaseButton.getAttribute('data-integration-identity'), 'original', 'Selecting a node preserves the sidebar DOM');
		await sidebar().getByRole('button', { name: 'Percorso annullamento', exact: true }).click();
		await shell.getByRole('heading', { level: 1, name: 'Percorso annullamento', exact: true }).waitFor();
		await shell.locator('.ade-node').getByText('Ordine', { exact: true }).click();
		await purchaseButton.click();
		assert.equal(await shell.locator('.ade-node[aria-pressed="true"]').textContent(), 'Richiedi pagamento');
		const cancellationSummary = cancellationDetails().locator(':scope > summary');
		await cancellationSummary.focus();
		await window.keyboard.press('Enter');
		assert.equal(await cancellationDetails().evaluate(details => details instanceof HTMLDetailsElement && details.open), false);
		await clickAdeButton(window, 'System Map');
		await shell.getByRole('heading', { level: 1, name: 'Acquisto', exact: true }).waitFor();
		assert.equal(await shell.locator('.ade-system-map button').count(), checkoutModel.semantics.elements.length + checkoutModel.views.length);
		const readMap = shell.getByRole('button', { name: 'Read System Map', exact: true });
		await readMap.click();
		await window.locator('.accessible-view:visible').getByText('System Map. Groups follow semantic containment; connections summarize declared relationships.', { exact: true }).waitFor();
		await window.keyboard.press('Escape');
		assert.equal(await readMap.evaluate(element => element === document.activeElement), true);
		const mapContract = shell.locator('.ade-system-map').getByRole('button', { name: 'Pagamento', exact: true });
		await mapContract.focus();
		await window.keyboard.press('Tab');
		await window.keyboard.press('Shift+Tab');
		assert.equal(await mapContract.evaluate(element => element === document.activeElement), true);
		await window.keyboard.press('Enter');
		await shell.getByRole('heading', { level: 1, name: 'Pagamento', exact: true }).waitFor();
		await shell.getByRole('navigation', { name: 'Semantic Path', exact: true }).getByRole('button', { name: 'Acquisto', exact: true }).click();
		await shell.getByRole('heading', { level: 1, name: 'Acquisto', exact: true }).waitFor();
		await window.screenshot({ path: path.join(evidence, 'system-map.png') });
		const connection = shell.locator('summary').getByText('Conferma acquisto → Pagamento (1)', { exact: true });
		await connection.click();
		await shell.getByRole('button', { name: 'Target: Pagamento', exact: true }).first().click();
		await shell.getByRole('heading', { level: 1, name: 'Pagamento', exact: true }).waitFor();
		await shell.getByRole('button', { name: 'Back', exact: true }).click();
		assert.equal(await connection.evaluate(element => element.parentElement instanceof HTMLDetailsElement && element.parentElement.open), true, 'Map disclosure survives a semantic visit');
		await shell.locator('.ade-navigation').getByRole('button', { name: 'Diagrams', exact: true }).click();
		await pickValue(window, 'Choose Diagram', 'Percorso acquisto');
		await shell.getByRole('heading', { level: 1, name: 'Percorso acquisto', exact: true }).waitFor();
		await searchSystem(window, 'Contract', 'Pagamento');
		await shell.getByRole('heading', { level: 1, name: 'Pagamento', exact: true }).waitFor();
		assert.equal(await shell.locator('.ade-canvas').count(), 0);
		await shell.getByText('This element is not placed in a diagram.', { exact: true }).waitFor();
		await shell.getByRole('button', { name: 'Read Element Details', exact: true }).click();
		await window.locator('.accessible-view:visible').getByText('Element Details: Pagamento', { exact: true }).waitFor();
		await window.keyboard.press('Escape');
		await shell.getByRole('button', { name: 'Back', exact: true }).click();
		await shell.getByRole('heading', { level: 1, name: 'Percorso acquisto', exact: true }).waitFor();
		await shell.getByRole('button', { name: 'Forward', exact: true }).click();
		await shell.getByRole('heading', { level: 1, name: 'Pagamento', exact: true }).waitFor();
		await shell.locator('.ade-properties').getByRole('button', { name: 'Richiedi pagamento → Pagamento: realizza contratto', exact: true }).click();
		await shell.getByRole('heading', { level: 1, name: 'Percorso acquisto', exact: true }).waitFor();
		assert.equal(await shell.locator('.ade-node[aria-pressed="true"]').textContent(), 'Richiedi pagamento');
		assert.equal(await shell.locator('.ade-node[aria-pressed="true"]').evaluate(element => element === document.activeElement), true);
		await shell.locator('.ade-properties').getByRole('button', { name: 'Esito pagamento', exact: true }).click();
		await shell.getByRole('heading', { level: 1, name: 'Esito pagamento', exact: true }).waitFor();
		assert.equal(await shell.locator('.ade-node[aria-pressed="true"]').textContent(), 'Richiedi pagamento');
		await shell.getByRole('button', { name: 'Back', exact: true }).click();
		await shell.getByRole('heading', { level: 1, name: 'Percorso acquisto', exact: true }).waitFor();
		assert.equal(await shell.locator('.ade-node[aria-pressed="true"]').textContent(), 'Richiedi pagamento');
		await shell.getByRole('button', { name: 'Forward', exact: true }).click();
		await shell.getByRole('heading', { level: 1, name: 'Esito pagamento', exact: true }).waitFor();
		await shell.getByRole('navigation', { name: 'Semantic Path', exact: true }).getByRole('button', { name: 'Conferma acquisto', exact: true }).click();
		await shell.getByRole('heading', { level: 1, name: 'Conferma acquisto', exact: true }).waitFor();
		await shell.getByRole('heading', { name: 'Feature Diagrams', exact: true }).waitFor();
		await shell.getByRole('button', { name: 'Back', exact: true }).click();
		await searchSystem(window, 'Diagrams', 'Struttura carrello');
		await shell.getByRole('heading', { level: 1, name: 'Struttura carrello', exact: true }).waitFor();
		assert.equal(await shell.getByRole('button', { name: 'Forward', exact: true }).isEnabled(), false, 'New navigation discards the forward branch');
		await shell.getByRole('button', { name: 'Back', exact: true }).click();
		await shell.getByRole('heading', { level: 1, name: 'Esito pagamento', exact: true }).waitFor();
		await clickAdeButton(window, 'Search System');
		await window.locator('.quick-input-widget').getByText('Search Filter', { exact: true }).waitFor();
		await window.keyboard.press('Escape');
		await shell.getByRole('heading', { level: 1, name: 'Esito pagamento', exact: true }).waitFor();
		await window.screenshot({ path: path.join(evidence, 'semantic-navigation.png') });
		assert.equal(await readFile(modelFile, 'utf8'), JSON.stringify(checkoutModel));
		console.log('PASS: typed semantic search, unplaced contract details, accessible reading, relationship navigation, shared identity across diagrams, breadcrumbs and back/forward branching.');
		await openModelFile(window, modelFile);
		assert.equal(await cancellationDetails().evaluate(details => details instanceof HTMLDetailsElement && details.open), true, 'Group state is isolated between demo and file, despite equal semantic IDs');
		await cancellationDetails().locator(':scope > summary').focus();
		await window.keyboard.press('Space');
		assert.equal(await cancellationDetails().evaluate(details => details instanceof HTMLDetailsElement && details.open), false);
		await searchSystem(window, 'Contract', 'Pagamento');
		await shell.getByRole('heading', { level: 1, name: 'Pagamento', exact: true }).waitFor();
		await shell.locator('.ade-properties').getByRole('button', { name: 'Rename Element', exact: true }).click();
		await enterValue(window, 'Name', 'Contratto pagamento');
		await shell.getByRole('heading', { level: 1, name: 'Contratto pagamento', exact: true }).waitFor();
		await shell.getByRole('button', { name: 'Undo', exact: true }).click();
		await shell.getByRole('heading', { level: 1, name: 'Pagamento', exact: true }).waitFor();
		await shell.getByRole('button', { name: 'Redo', exact: true }).click();
		await shell.getByRole('heading', { level: 1, name: 'Contratto pagamento', exact: true }).waitFor();
		await checkContractEditing(window);
		await window.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+s`);
		await shell.getByText('Saved', { exact: true }).waitFor();
		const saved = JSON.parse(await readFile(modelFile, 'utf8'));
		assert.deepEqual(validateSemanticModel(saved), []);
		assert.equal(saved.semantics.elements.find((element: SemanticElement) => element.id === 'payment-contract').name, 'Contratto pagamento');
		assert.deepEqual(saved.semantics.elements.find((element: SemanticElement) => element.id === 'payment-contract').behavior.outputs, [{ name: 'receipt', type: 'PaymentReceipt', required: true }]);
		await harness.app.close();
		harness.app = undefined;
		window = await launch();
		shell = window.locator('.ade-shell');
		await shell.getByRole('heading', { level: 1, name: 'Contratto pagamento', exact: true }).waitFor();
		await shell.getByText('Output: receipt (PaymentReceipt), Required', { exact: true }).waitFor();
		assert.equal(await cancellationDetails().evaluate(details => details instanceof HTMLDetailsElement && details.open), false, 'Collapsed groups survive a workspace restart');
		await cancellationDetails().locator(':scope > summary').focus();
		await window.keyboard.press('Enter');
		await cancellationDetails().getByRole('button', { name: 'Percorso annullamento', exact: true }).waitFor();
		assert.equal(await shell.getByRole('button', { name: 'Back', exact: true }).isEnabled(), false);
		assert.equal(await window.locator('.tabs-container .tab').filter({ hasText: 'checkout.ade.json' }).count(), 0);
		await window.screenshot({ path: path.join(evidence, 'semantic-element-details.png') });
		const removed = structuredClone(saved);
		removed.semantics.elements = removed.semantics.elements.filter((element: SemanticElement) => element.id !== 'payment-contract');
		removed.semantics.relations = removed.semantics.relations.filter((relation: SemanticRelation) => relation.from !== 'payment-contract' && relation.to !== 'payment-contract');
		const surviving = new Set(removed.semantics.relations.map((relation: SemanticRelation) => relation.id));
		for (const view of removed.views) {
			view.relationIds = view.relationIds.filter((id: string) => surviving.has(id));
			view.nodes = view.nodes.filter((node: ModelView['nodes'][number]) => node.elementId !== 'payment-contract');
		}
		await writeFile(modelFile, JSON.stringify(removed));
		await shell.getByRole('heading', { level: 1, name: 'Percorso acquisto', exact: true }).waitFor();
		assert.equal(await shell.getByRole('alert').count(), 0);
		console.log('PASS: semantic inspector edits use native undo/redo/save, restart restores the inspected identity, and external deletion repairs context without stale details.');
		await clickAdeButton(window, 'System Map');
		await harness.app.close();
		harness.app = undefined;
		window = await launch();
		shell = window.locator('.ade-shell');
		await shell.getByRole('button', { name: 'Read System Map', exact: true }).waitFor();
		assert.equal(await shell.getByRole('button', { name: 'Back', exact: true }).isEnabled(), false);
		await shell.locator('.ade-system-map').getByRole('button', { name: 'Esito pagamento', exact: true }).click();
		const routed = await shell.locator('svg path[data-relation-id]').evaluateAll(paths => paths.map(path => ({ id: path.getAttribute('data-relation-id'), d: path.getAttribute('d') })));
		assert.equal(routed.length, removed.views[1].relationIds.length);
		assert.ok(routed.every(path => path.d !== null && path.d.split(' M ')[0].split(' L ').length >= 2));
		const labelsClear = await shell.locator('.ade-canvas').evaluate(canvas => {
			const boxes = [...canvas.querySelectorAll('.ade-node, .ade-connection-label')].map(element => ({ label: element.classList.contains('ade-connection-label'), box: element.getBoundingClientRect() }));
			return boxes.every((a, index) => boxes.slice(index + 1).every(b => !(a.label || b.label) || !(a.box.left < b.box.right && a.box.right > b.box.left && a.box.top < b.box.bottom && a.box.bottom > b.box.top)));
		});
		assert.equal(labelsClear, true, 'Actual rendered labels avoid nodes and one another');
		await window.screenshot({ path: path.join(evidence, 'routed-connections.png') });
		console.log('PASS: system map covers all identities, supports keyboard and accessible reading, opens semantic breadcrumbs, restores after restart, and diagram labels do not overlap nodes or one another.');
		const shared = structuredClone(removed);
		shared.views.push({
			id: 'shared-review', featureId: 'purchase', name: 'Shared Review', kind: 'structure', nodes: [
				{ elementId: 'payment', x: 0, y: 0 }, { elementId: 'cancel-controller', x: 300, y: 0 }
			], relationIds: []
		});
		assert.deepEqual(validateSemanticModel(shared), []);
		await writeFile(modelFile, JSON.stringify(shared));
		await cancellationDetails().getByText('Related Diagrams', { exact: true }).waitFor();
		await cancellationDetails().getByRole('button', { name: 'Shared Review', exact: true }).click();
		await shell.getByRole('heading', { level: 1, name: 'Shared Review', exact: true }).waitFor();
		await shell.getByRole('navigation', { name: 'Semantic Path', exact: true }).getByRole('button', { name: 'Conferma acquisto', exact: true }).waitFor();
		assert.equal(await sidebar().getByRole('button', { name: 'Shared Review', exact: true }).count(), 2, 'Owner and related feature reference the same diagram');
		await shell.getByRole('region', { name: 'Diagram: Shared Review', exact: true }).waitFor();
		await window.screenshot({ path: path.join(evidence, 'integrated-m2-sidebar.png') });
		console.log('PASS: integrated M2 cancellation example, persistent keyboard disclosures per document, stable sidebar DOM on selection, and shared references with preserved canonical ownership.');
		await harness.app.close();
		harness.app = undefined;
	}

	return { checkContractEditing, checkSemanticNavigation };
}
