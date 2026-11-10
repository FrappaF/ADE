/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SemanticElement } from '../../../src/vs/workbench/contrib/ade/common/modelTypes.ts';
import type { SmokeHarness } from './harness.ts';
import assert from 'node:assert/strict';
import { mkdir, copyFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { clickAdeButton, openModelFile, enterValue, pickValue, chooseFolder, addElement, connect, runCommand, contractEntry } from './helpers.ts';

/** projects scenarios share only the harness values listed here. */
export function createProjectsScenarios(harness: SmokeHarness) {
	const { launch, workspace, args, validateSemanticModel, directory, root, evidence } = harness;

	async function checkIndependentProjects() {
		const folder = path.join(workspace, 'from-zero');
		await mkdir(folder);
		let window = await launch();
		let shell = window.locator('.ade-shell');
		await shell.getByRole('button', { name: 'Create Project', exact: true }).click();
		await enterValue(window, 'Name', 'Laboratorio da zero');
		await chooseFolder(window, folder);
		args[1] = folder;
		await shell.getByText('This project has no diagrams.', { exact: false }).waitFor();
		const projectFile = path.join(folder, '.ade/model.json');
		const empty = JSON.parse(await readFile(projectFile, 'utf8'));
		assert.deepEqual([empty.semantics.elements, empty.semantics.relations, empty.views], [[], [], []]);
		await window.locator('.ade-sidebar').getByRole('button', { name: 'Add Feature', exact: true }).click();
		await enterValue(window, 'Name', 'Acquisizione dati');
		await shell.getByRole('heading', { level: 1, name: 'Acquisizione dati · Structure', exact: true }).waitFor();
		for (const [kind, name] of [['Actor', 'Tecnico'], ['Interface', 'Console'], ['Controller', 'Raccoglitore'], ['Resource', 'Campione']]) { await addElement(window, kind, name); }
		await connect(window, 'Tecnico', 'Console', 'Invocation', 'Invia', '');
		await connect(window, 'Console', 'Raccoglitore', 'Invocation', 'Acquisisci', '');
		await connect(window, 'Raccoglitore', 'Campione', 'Write', 'Registra', 'Misura valida');
		await shell.locator('.ade-node').getByText('Raccoglitore', { exact: true }).click();
		await contractEntry(window, 'Raccoglitore', 'Inputs');
		await enterValue(window, 'Field Name', 'sensorId');
		await enterValue(window, 'Field Type', 'SensorId');
		await pickValue(window, 'Field Presence', 'Required');
		await shell.getByText('Input: sensorId (SensorId), Required', { exact: true }).waitFor();
		await window.locator('.ade-sidebar').getByRole('button', { name: 'Acquisizione dati · Flow', exact: true }).click();
		await runCommand(window, 'A.D.E: Add Existing Element');
		await pickValue(window, 'Add Existing Element', 'Raccoglitore');
		await addElement(window, 'Action', 'Valida misura');
		await connect(window, 'Raccoglitore', 'Valida misura', 'Invocation', 'Valida', 'Valore non negativo');
		await shell.getByText('Input: sensorId (SensorId), Required', { exact: true }).waitFor();
		await runCommand(window, 'A.D.E: Add Diagram');
		await pickValue(window, 'Choose Feature', 'Acquisizione dati');
		await pickValue(window, 'Diagram Type', 'Sequence Diagram');
		await enterValue(window, 'Name', 'Sequenza dati');
		for (const label of ['Tecnico → Console: Invia', 'Console → Raccoglitore: Acquisisci', 'Raccoglitore → Campione: Registra']) {
			await shell.getByRole('button', { name: 'Add Existing Message', exact: true }).click();
			await pickValue(window, 'Add Existing Message', label);
		}
		await shell.locator('.ade-node').getByText('Campione', { exact: true }).click();
		const messages = () => shell.locator('.ade-sequence-message').evaluateAll(buttons => buttons.map(button => button.dataset.relationId));
		const before = await messages();
		const options = shell.locator('details').filter({ hasText: 'Sequence Message Options: Registra' });
		await options.locator('summary').click();
		await options.getByRole('button', { name: 'Move Message Earlier', exact: true }).click();
		assert.deepEqual(await messages(), [before[0], before[2], before[1]]);
		await shell.getByRole('button', { name: 'Undo', exact: true }).click();
		assert.deepEqual(await messages(), before);
		await shell.getByRole('button', { name: 'Redo', exact: true }).click();
		await runCommand(window, 'A.D.E: Add Diagram');
		await pickValue(window, 'Choose Feature', 'Acquisizione dati');
		await pickValue(window, 'Diagram Type', 'State Diagram');
		await pickValue(window, 'Resource Lifecycle', 'Campione');
		await enterValue(window, 'Name', 'Ciclo campioni');
		for (const name of ['Nuovo', 'Archiviato']) {
			await shell.getByRole('button', { name: 'Add State', exact: true }).click();
			await enterValue(window, 'Name', name);
			await shell.locator('.ade-node').getByText(name, { exact: true }).waitFor();
		}
		await connect(window, 'Nuovo', 'Archiviato', 'Transition', 'Archivia', 'Misura valida');
		await shell.locator('.ade-state-summary details summary').click();
		await shell.getByRole('table', { name: 'Transition Table: Campione', exact: true }).getByRole('cell', { name: 'Archivia', exact: true }).waitFor();
		await clickAdeButton(window, 'Read Diagram');
		await window.locator('.accessible-view:visible').getByText('Resource: Campione. Visible states: 2 of 2. Visible transitions: 1.', { exact: true }).waitFor();
		await window.keyboard.press('Escape');
		await shell.locator('.ade-node').getByText('Campione', { exact: true }).click();
		await shell.getByRole('button', { name: 'Show Change Impact', exact: true }).click();
		await shell.getByRole('heading', { level: 1, name: 'Change Impact: Campione', exact: true }).waitFor();
		await shell.getByRole('heading', { name: 'Potential Dependents: 3', exact: true }).waitFor();
		await shell.getByRole('button', { name: 'Read Change Impact', exact: true }).click();
		await window.locator('.accessible-view:visible').getByText('Potential Dependents: 3', { exact: true }).waitFor();
		await window.keyboard.press('Escape');
		await shell.getByRole('button', { name: 'Save', exact: true }).click();
		await shell.getByText('Saved', { exact: true }).waitFor();
		const saved = JSON.parse(await readFile(projectFile, 'utf8'));
		assert.deepEqual(validateSemanticModel(saved), []);
		assert.deepEqual(saved.semantics.elements.map((element: SemanticElement) => element.name).sort(), ['Acquisizione dati', 'Archiviato', 'Campione', 'Console', 'Nuovo', 'Raccoglitore', 'Tecnico', 'Valida misura'].sort());
		assert.deepEqual([saved.codeMappings, saved.verifications], [[], []]);
		await harness.app.close();
		harness.app = undefined;
		window = await launch();
		shell = window.locator('.ade-shell');
		await shell.getByRole('heading', { level: 1, name: 'Change Impact: Campione', exact: true }).waitFor();
		console.log('PASS: a project created from an empty folder supports native design, contracts, sequences, states, impact, undo/redo, save and restart without demo data.');
		const libraryFile = path.join(directory, 'library.ade.json');
		const observatoryFile = path.join(directory, 'observatory.ade.json');
		await copyFile(path.join(root, 'ade/examples/library.ade.json'), libraryFile);
		await copyFile(path.join(root, 'ade/examples/observatory.ade.json'), observatoryFile);
		await openModelFile(window, libraryFile);
		await shell.getByRole('heading', { level: 1, name: 'Servizio prestiti', exact: true }).waitFor();
		assert.equal(await window.locator('.ade-sidebar').getByRole('button', { name: 'Ciclo campioni', exact: true }).count(), 0);
		await runCommand(window, 'A.D.E: Search System');
		await enterValue(window, 'Search Filter', 'Contract');
		await enterValue(window, 'Search System', 'Regole del prestito');
		await shell.getByText('This element is not placed in a diagram.', { exact: true }).waitFor();
		await shell.getByRole('button', { name: 'Show Change Impact', exact: true }).click();
		await shell.getByRole('heading', { name: 'Potential Dependents: 3', exact: true }).waitFor();
		await window.locator('.ade-sidebar').getByRole('button', { name: 'Stati della copia', exact: true }).click();
		await shell.getByText('2 of 2 declared states visible · 2 visible transitions', { exact: true }).waitFor();
		await shell.locator('.ade-node').getByText('Copia', { exact: true }).click();
		await shell.getByRole('button', { name: 'Show Change Impact', exact: true }).click();
		await shell.getByRole('heading', { name: 'Potential Dependents: 4', exact: true }).waitFor();
		await window.screenshot({ path: path.join(evidence, 'independent-library.png') });
		await openModelFile(window, observatoryFile);
		await shell.getByText('This project has no diagrams. Add a diagram to an existing feature to continue.', { exact: true }).waitFor();
		assert.equal(await shell.locator('.ade-impact, .ade-canvas').count(), 0);
		await shell.getByRole('button', { name: 'Add Diagram', exact: true }).click();
		await pickValue(window, 'Choose Feature', 'Acquisizioni notturne');
		await pickValue(window, 'Diagram Type', 'State Diagram');
		await window.locator('.quick-input-widget').getByText('Resource Lifecycle', { exact: true }).waitFor();
		const resource = window.locator('.quick-input-widget .monaco-list-row').filter({ hasText: 'Coordinatore' });
		await resource.getByText('Esposizione', { exact: true }).click();
		await enterValue(window, 'Name', 'Stati esposizione');
		await runCommand(window, 'A.D.E: Include Resource Lifecycle');
		await shell.getByText('2 of 2 declared states visible · 1 visible transitions', { exact: true }).waitFor();
		await runCommand(window, 'A.D.E: Search System');
		await enterValue(window, 'Search Filter', 'Contract');
		await enterValue(window, 'Search System', 'Vincoli ottici');
		await shell.getByRole('button', { name: 'Show Change Impact', exact: true }).click();
		await shell.getByRole('heading', { level: 1, name: 'Change Impact: Vincoli ottici', exact: true }).waitFor();
		await shell.getByRole('heading', { name: 'Potential Dependents: 3', exact: true }).waitFor();
		await shell.getByRole('button', { name: 'Save', exact: true }).click();
		await shell.getByText('Saved', { exact: true }).waitFor();
		const updated = JSON.parse(await readFile(observatoryFile, 'utf8'));
		assert.deepEqual(validateSemanticModel(updated), []);
		assert.deepEqual(updated.semantics, JSON.parse(await readFile(path.join(root, 'ade/examples/observatory.ade.json'), 'utf8')).semantics);
		await window.screenshot({ path: path.join(evidence, 'independent-observatory.png') });
		console.log('PASS: independently authored library and observatory projects support shared resources, unplaced contracts, empty views, no initial diagrams, cycles, homonyms and document-scoped identities.');
		await harness.app.close();
		harness.app = undefined;
	}

	return { checkIndependentProjects };
}
