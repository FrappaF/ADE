/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, copyFile, readFile, readdir, chmod } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
import { validateSemanticModel } from '../../src/vs/workbench/contrib/ade/common/semanticModel.ts';
import { checkoutModel } from '../../src/vs/workbench/contrib/ade/common/checkoutModel.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const aiLive = process.argv.includes('--ai-live');
if (aiLive && !process.env.ADE_AI_MODEL) { throw new Error('--ai-live requires ADE_AI_MODEL from the authenticated Codex account'); }
const product = JSON.parse(await (await import('node:fs/promises')).readFile(path.join(root, 'product.json'), 'utf8'));
const executablePath = process.env.ADE_ELECTRON_PATH || path.join(root, '.build/electron', process.platform === 'darwin'
	? `${product.nameLong}.app/Contents/MacOS/${product.nameShort}`
	: process.platform === 'win32' ? `${product.nameShort}.exe` : product.applicationName);
const directory = await mkdtemp(path.join(tmpdir(), 'ade-smoke-'));
const portable = path.join(directory, 'portable');
const userData = path.join(portable, 'user-data');
const workspace = path.join(directory, 'project');
const evidence = path.join(root, '.build/ade-smoke');
await mkdir(portable);
const launchEnv = { ...process.env, VSCODE_DEV: '1', NODE_ENV: 'development', VSCODE_PORTABLE: portable };
await mkdir(path.join(userData, 'User'), { recursive: true });
await mkdir(workspace);
await mkdir(evidence, { recursive: true });
await writeFile(path.join(userData, 'User/settings.json'), JSON.stringify({
	'window.dialogStyle': 'custom',
	'files.simpleDialog.enable': true,
	'files.autoSave': 'off',
	'workbench.startupEditor': 'adeHome',
	'workbench.secondarySideBar.defaultVisibility': 'hidden',
	'window.restoreWindows': 'all',
	'terminal.integrated.gpuAcceleration': 'off',
	'telemetry.telemetryLevel': 'off',
	'update.mode': 'none'
}));
const navigationOnly = process.argv.includes('--navigation-only');
const sequenceOnly = process.argv.includes('--sequence-only');
const stateOnly = process.argv.includes('--state-only');
const impactOnly = process.argv.includes('--impact-only');
const codeOnly = process.argv.includes('--code-only');
const aiOnly = process.argv.includes('--ai-only') || aiLive;
const extraCleanup = [];
const projectsOnly = process.argv.includes('--projects-only');
const modelFile = path.join(navigationOnly || sequenceOnly || stateOnly || impactOnly ? directory : workspace, 'checkout.ade.json');
const emptyFile = path.join(workspace, 'empty.ade.json');
const invalidFile = path.join(workspace, 'invalid.ade.json');
const otherFile = path.join(workspace, 'other.ade.json');
if (!projectsOnly) {
	await writeFile(modelFile, JSON.stringify(checkoutModel));
	await writeFile(emptyFile, JSON.stringify({ ...checkoutModel, id: 'empty', name: 'Empty System', semantics: { elements: [], relations: [] }, views: [] }));
	await writeFile(invalidFile, '{"version":99}');
	await writeFile(otherFile, JSON.stringify({ ...checkoutModel, id: 'other', name: 'Other System' }));
}
const args = [root, workspace, `--user-data-dir=${userData}`, `--extensions-dir=${directory}/extensions`,
	`--shared-data-dir=${directory}/shared-data`,
	'--disable-workspace-trust', '--disable-telemetry', '--disable-updates', '--disable-experiments',
	'--disable-dev-shm-usage', '--no-sandbox', '--password-store=basic', '--use-inmemory-secretstorage',
	'--disable-extension=vscode.vscode-api-tests'];
const uxOnly = process.argv.includes('--ux-only');
if (process.argv.includes('--native-only') || uxOnly || navigationOnly || sequenceOnly || stateOnly || impactOnly || projectsOnly || codeOnly || aiOnly) {
	// Prove the product shell works independently of built-in extension activation too.
	for (const entry of await readdir(path.join(root, 'extensions'), { withFileTypes: true })) {
		if (!entry.isDirectory()) { continue; }
		const manifest = await readFile(path.join(root, 'extensions', entry.name, 'package.json'), 'utf8').catch(error => {
			if (error.code === 'ENOENT') { return undefined; }
			throw error;
		});
		if (manifest) {
			const extension = JSON.parse(manifest);
			// Theme coverage enables only the declarative built-in themes, which have no executable entry point.
			if ((uxOnly || sequenceOnly || stateOnly || impactOnly) && extension.name === 'theme-defaults') { continue; }
			args.push(`--disable-extension=${extension.publisher ?? 'vscode'}.${extension.name}`);
		}
	}
}
let app;
let electronOutput = '';
async function launch() {
	app = await electron.launch({ executablePath, args, cwd: root, env: launchEnv, timeout: 90000 });
	electronOutput = '';
	app.process().stderr?.on('data', data => { electronOutput = (electronOutput + data.toString()).slice(-12000); });
	const window = await app.firstWindow({ timeout: 90000 });
	window.setDefaultTimeout(30000);
	await window.locator('.ade-shell').waitFor({ timeout: 90000 });
	return window;
}

async function openModelFile(window, file) {
	await window.locator('.ade-sidebar').getByRole('button', { name: 'Open Model', exact: true }).click();
	const input = window.locator('.quick-input-widget input:visible');
	await input.waitFor();
	await input.fill(path.dirname(file) + path.sep);
	await window.locator('.quick-input-widget').getByText(path.basename(file), { exact: true }).dblclick();
	await input.waitFor({ state: 'hidden' });
}
async function enterValue(window, title, value) {
	const widget = window.locator('.quick-input-widget');
	await widget.getByText(title, { exact: true }).waitFor();
	await widget.locator('input:visible').fill(value);
	await window.keyboard.press('Enter');
	await widget.getByText(title, { exact: true }).waitFor({ state: 'hidden' });
}
async function pickValue(window, title, label) {
	const widget = window.locator('.quick-input-widget');
	await widget.getByText(title, { exact: true }).waitFor();
	await widget.locator('input:visible').fill(label);
	await widget.getByText(label, { exact: true }).click();
	await widget.getByText(title, { exact: true }).waitFor({ state: 'hidden' });
}
async function chooseFolder(window, folder) {
	const widget = window.locator('.quick-input-widget');
	await widget.getByText('Choose Project Folder', { exact: true }).waitFor();
	await widget.locator('input:visible').fill(folder + path.sep);
	await widget.getByRole('button', { name: 'OK', exact: true }).click();
	await widget.waitFor({ state: 'hidden' });
}
async function addElement(window, kind, name) {
	await window.locator('.ade-shell').getByRole('button', { name: 'Add Element', exact: true }).click();
	await pickValue(window, 'Element Type', kind);
	await enterValue(window, 'Name', name);
	await window.locator('.ade-canvas').getByRole('button', { name, exact: true }).waitFor();
}
async function connect(window, source, target, kind, name, condition) {
	await window.locator('.ade-canvas').getByRole('button', { name: source, exact: true }).click();
	await window.locator('.ade-properties').getByRole('button', { name: 'Connect Selection', exact: true }).click();
	await pickValue(window, 'Relationship Type', kind);
	await pickValue(window, 'Target Element', target);
	await enterValue(window, 'Relationship Name', name);
	await enterValue(window, 'Condition (Optional)', condition);
	await window.locator('.quick-input-widget').waitFor({ state: 'hidden' });
}

async function runCommand(window, name) {
	const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
	await window.keyboard.press(`${modifier}+Shift+P`);
	await window.locator('.quick-input-widget input:visible').fill(`>${name}`);
	await window.locator('.quick-input-widget .monaco-list-row').getByText(name, { exact: true }).waitFor();
	await window.keyboard.press('Enter');
}

async function searchSystem(window, kind, name) {
	await window.locator('.ade-shell').getByRole('button', { name: 'Search System', exact: true }).click();
	await pickValue(window, 'Search Filter', kind);
	await window.locator('.quick-input-widget input:visible').fill(name);
	await pickValue(window, 'Search System', name);
}

async function contractEntry(window, name, section, entry = 'Add Entry') {
	await window.locator('.ade-properties').getByRole('button', { name: 'Edit Behavioral Contract', exact: true }).click();
	await pickValue(window, `Behavioral Contract: ${name}`, section);
	await pickValue(window, section, entry);
	if (entry !== 'Add Entry') { await pickValue(window, `Contract Entry: ${entry}`, 'Edit Entry'); }
}

async function checkContractEditing(window) {
	const shell = window.locator('.ade-shell');
	await contractEntry(window, 'Contratto pagamento', 'Inputs');
	await enterValue(window, 'Field Name', 'amount');
	await enterValue(window, 'Field Type', 'Money');
	await pickValue(window, 'Field Presence', 'Required');
	await shell.getByText('Input: amount (Money), Required', { exact: true }).waitFor();
	await contractEntry(window, 'Contratto pagamento', 'Inputs');
	await enterValue(window, 'Field Name', 'amount');
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
		if (!await options.evaluate(element => element.open)) { await options.locator('summary').click(); }
		await shell.getByRole('button', { name: 'Add Existing Element', exact: true }).click();
		await pickValue(window, 'Add Existing Element', 'Contratto pagamento');
		await shell.locator('.ade-node[aria-pressed="true"]').filter({ hasText: 'Contratto pagamento' }).waitFor();
		await shell.getByText('Output: receipt (PaymentReceipt), Required', { exact: true }).waitFor();
	}
	await shell.locator('.ade-properties').getByRole('button', { name: 'Element Details', exact: true }).click();
	await shell.getByRole('button', { name: 'Read Element Details', exact: true }).click();
	await window.locator('.accessible-view:visible').getByText('Output: receipt (PaymentReceipt), Required', { exact: true }).waitFor();
	await window.keyboard.press('Escape');
	await shell.getByText('Error payment-declined: No order is confirmed', { exact: true }).scrollIntoViewIfNeeded();
	await window.screenshot({ path: path.join(evidence, 'behavioral-contract.png') });
	console.log('PASS: native contract creation, validation, cancellation, editing, removal, undo/redo and shared details across two diagrams with accessible reading.');
}

async function checkCodeBridge() {
	const sourceRoot = path.join(workspace, 'codebase');
	await mkdir(sourceRoot);
	await writeFile(path.join(sourceRoot, 'gateway.ts'), 'export function charge(amount: number): boolean { return amount > 0; }');
	await writeFile(path.join(sourceRoot, 'checkout.ts'), 'import {charge as pay} from "./gateway"; export function checkout(amount: number): boolean { return pay(amount); }');
	await writeFile(path.join(sourceRoot, 'obsolete.py'), 'def obsolete():\n    return 1\n');
	await writeFile(path.join(sourceRoot, 'unsupported.vb'), 'Class Unsupported\nEnd Class\n');
	let window = await launch();
	let shell = window.locator('.ade-shell');
	await shell.getByRole('button', { name: 'Import Codebase', exact: true }).click();
	const widget = window.locator('.quick-input-widget');
	await widget.locator('input:visible').fill(sourceRoot + path.sep);
	await widget.getByRole('button', { name: 'OK', exact: true }).click();
	await pickValue(window, 'Import Codebase', 'Structure and Available Semantic Analysis');
	await shell.getByRole('button', { name: 'Sync', exact: true }).waitFor({ timeout: 90000 });
	const snapshot = async () => {
		const pointer = JSON.parse(await readFile(path.join(sourceRoot, '.ade/code-project.json'), 'utf8'));
		const folder = path.join(sourceRoot, '.ade/imports', pointer.active);
		return { folder, state: JSON.parse(await readFile(path.join(folder, 'import-state.json'), 'utf8')), model: JSON.parse(await readFile(path.join(folder, 'model.ade.json'), 'utf8')) };
	};
	const initial = await snapshot();
	assert.ok(initial.state.semantic.dependencies.length >= 1);
	assert.equal(initial.state.files.find(file => file.file === 'unsupported.vb').status, 'unsupported');
	const previous = initial.state.files.flatMap(file => file.declarations).find(item => item.name === 'checkout');
	await writeFile(path.join(sourceRoot, 'checkout.ts'), 'import {charge as pay} from "./gateway"; export function purchase(amount: number, tag: string): boolean { return pay(amount); }');
	await rm(path.join(sourceRoot, 'obsolete.py'));
	await shell.getByRole('button', { name: 'Sync', exact: true }).click();
	await pickValue(window, 'Sync Preview', 'Confirm a Symbol Rename');
	await pickValue(window, 'Choose the Previous Declaration', 'checkout');
	await pickValue(window, 'Choose the Renamed Declaration', 'purchase');
	await pickValue(window, 'Sync Preview', 'Apply Sync');
	await window.waitForFunction(() => {
		// UI state is exposed through the rendered, accessible system map.
		return document.querySelector('.ade-shell')?.textContent.includes('purchase');
	});
	const updated = await snapshot();
	assert.notEqual(updated.folder, initial.folder);
	assert.ok(updated.state.files.flatMap(file => file.declarations).some(item => item.id === previous.id && item.name === 'purchase'));
	assert.deepEqual(updated.state.analysis.parsed, ['checkout.ts']);
	assert.ok(updated.state.analysis.reused.includes('gateway.ts'));
	assert.ok(!updated.state.files.some(file => file.file === 'obsolete.py'));
	await runCommand(window, 'A.D.E: Inspect Code Evidence');
	await widget.locator('input:visible').fill('purchase');
	await window.keyboard.press('Enter');
	await window.locator('.monaco-editor .view-lines').filter({ hasText: 'purchase' }).first().waitFor();
	await runCommand(window, 'A.D.E: Return to Model');
	await window.screenshot({ path: path.join(evidence, 'm4-code-sync.png') });
	await app.close(); app = undefined;
	window = await launch(); shell = window.locator('.ade-shell');
	await shell.getByRole('button', { name: 'Sync', exact: true }).waitFor({ timeout: 90000 });
	await shell.getByRole('button', { name: 'Home', exact: true }).click();
	await shell.getByRole('button', { name: 'Open Project', exact: true }).click();
	await chooseFolder(window, sourceRoot);
	await shell.getByRole('button', { name: 'Sync', exact: true }).waitFor();
	await runCommand(window, 'A.D.E: Restore Code Model Snapshot');
	await window.locator('.quick-input-widget').getByText(path.basename(initial.folder), { exact: true }).click();
	await shell.getByRole('button', { name: 'Sync', exact: true }).waitFor();
	assert.equal((await snapshot()).folder, initial.folder);
	assert.ok((await readFile(path.join(sourceRoot, 'checkout.ts'), 'utf8')).includes('purchase'));
	await writeFile(path.join(evidence, 'm4-code-results.json'), JSON.stringify({ imported: initial.state.files.length, dependencyCount: initial.state.semantic.dependencies.length, renamedId: previous.id, parsed: updated.state.analysis.parsed, reused: updated.state.analysis.reused, recovery: true }, null, 2));
	await app.close(); app = undefined;
	console.log('PASS: native code import, compiler references, contract/rename/delete Sync, source navigation, restart and recovery.');
}

async function checkAiWorkflow() {
	const { fixture, original } = await import('../ai/test/fixtures.mjs');
	const { readSession } = await import('../ai/implementation.ts');
	const { runProcess } = await import('../ai/process.ts');
	const f = await fixture({ after: callback => extraCleanup.push(callback) });
	const executable = aiLive ? (process.env.ADE_AI_EXECUTABLE || 'codex') : path.join(f.directory, 'simulated-codex.mjs');
	const model = aiLive ? process.env.ADE_AI_MODEL : 'simulated-m5-model';
	const resultFile = path.join(evidence, aiLive ? 'm5-live-results.json' : 'm5-native-results.json');
	await rm(resultFile, { force: true });
	if (aiLive) {
		const { readProviderConfig } = await import('../ai/contracts.ts');
		readProviderConfig({ version: 1, provider: 'codex', connection: 'cli', executable, model, timeoutMs: 180000, maxContextBytes: 262144, maxCalls: 2 });
	}
	const counter = path.join(f.directory, 'calls');
	if (!aiLive) {
		await writeFile(counter, '0');
		await writeFile(executable, `#!${process.execPath}\nimport {readFileSync,writeFileSync,writeSync} from 'node:fs';
const args=process.argv.slice(2),schema=JSON.parse(readFileSync(args[args.indexOf('--output-schema')+1],'utf8'));
const counter=${JSON.stringify(counter)};
writeFileSync(counter,String(Number(readFileSync(counter,'utf8'))+1));
writeFileSync(args[args.indexOf('--output-last-message')+1],JSON.stringify(schema.properties.steps?${JSON.stringify(f.plan)}:${JSON.stringify(f.generated)}));
writeSync(1,JSON.stringify({type:'turn.completed',usage:{input_tokens:10,output_tokens:20}})+'\\n');\n`);
		await chmod(executable, 0o700);
	}
	let window = await launch();
	await openModelFile(window, path.join(f.snapshot, 'model.ade.json'));
	await window.locator('.ade-shell').getByRole('button', { name: 'Sync', exact: true }).waitFor({ timeout: 90000 });
	await runCommand(window, 'A.D.E: Connect Claude Code or Codex');
	await pickValue(window, 'Choose AI CLI', 'Codex');
	await pickValue(window, 'Codex', 'Choose Model and CLI');
	const widget = window.locator('.quick-input-widget');
	await widget.getByText(/^(Model ID from Your CLI|Choose a Model Available to Your Account)$/).waitFor();
	if (await widget.getByText('Model ID from Your CLI', { exact: true }).isVisible()) {
		await enterValue(window, 'Model ID from Your CLI', model);
	} else if (aiLive) {
		await pickValue(window, 'Choose a Model Available to Your Account', process.env.ADE_AI_MODEL_LABEL || model);
	} else { await window.keyboard.press('Enter'); }
	await enterValue(window, 'Original CLI Executable', executable);
	await pickValue(window, 'Agent Run Budget · Provider Usage Is Managed by Its CLI', 'Plan and Implementation · At Most Two Agent Runs');
	if (!aiLive) { assert.equal(Number(await readFile(counter, 'utf8')), 0); }
	await runCommand(window, 'A.D.E: Implement Feature');
	await pickValue(window, 'Implement Feature', 'checkout');
	await enterValue(window, 'Requested Behavior', `For the supported boolean inputs, checkout(false) must return exactly 'declined' and checkout(true) must retain exactly 'paid'. No behavior for non-boolean inputs is requested.`);
	await widget.getByText('Review Source Files to Share · Suggested from Model Evidence', { exact: true }).waitFor();
	await window.keyboard.press('Enter');
	await window.locator('.monaco-dialog-box').getByRole('button', { name: 'Send Context', exact: true }).click();
	console.log('M5: context approved; awaiting the CLI plan.');
	await window.locator('.monaco-dialog-box').getByRole('button', { name: 'Generate in Worktree', exact: true }).click({ timeout: aiLive ? 200000 : 30000 });
	await window.locator('.monaco-editor .view-lines').filter({ hasText: 'Changes Ready for Review' }).last().waitFor({ timeout: aiLive ? 200000 : 30000 });
	console.log('M5: implementation staged; checking independent acceptance.');
	const ids = await readdir(path.join(f.root, '.ade/collaboration'));
	assert.equal(ids.length, 1);
	const session = await readSession(f.root, ids[0]);
	if (aiLive) { assert.equal(session.prepared.config.model, model); }
	const checkBehavior = async folder => {
		const result = await runProcess(process.execPath, ['--input-type=module', '-e', `import assert from 'node:assert/strict'; import {checkout} from './checkout.mjs'; assert.deepEqual([checkout(false), checkout(true)], ['declined', 'paid']);`], folder);
		assert.equal(result.code, 0, 'Independent payment refusal and approval checks must pass');
	};
	await checkBehavior(session.worktree);
	const returnToModel = async () => {
		await runCommand(window, 'A.D.E: Return to Model');
		const collaboration = window.locator('.ade-shell details').filter({ has: window.locator('summary', { hasText: /^AI Collaboration$/ }) });
		if (!await collaboration.evaluate(element => element.open)) { await collaboration.locator('summary').click(); }
		return collaboration;
	};
	let collaboration = await returnToModel();
	await collaboration.getByText('Changes Ready for Review', { exact: true }).waitFor();
	if (!aiLive) { assert.equal(Number(await readFile(counter, 'utf8')), 2); }
	assert.equal(await readFile(path.join(f.root, 'checkout.mjs'), 'utf8'), original);
	await collaboration.getByRole('button', { name: 'Run Tests', exact: true }).click();
	await window.locator('.monaco-dialog-box').getByRole('button', { name: 'Run Tests', exact: true }).click();
	await window.locator('.monaco-editor .view-lines').filter({ hasText: 'Tests Passed · Ready to Apply' }).last().waitFor();
	collaboration = await returnToModel();
	await collaboration.getByText('Tests Passed · Ready to Apply', { exact: true }).waitFor();
	await collaboration.getByRole('button', { name: 'Apply Verified Changes', exact: true }).click();
	await window.locator('.monaco-dialog-box').getByRole('button', { name: 'Apply Changes', exact: true }).click();
	await collaboration.getByText('Applied · Undo Available', { exact: true }).waitFor();
	for (const file of session.generated.files) {
		if (file.content === null) { await assert.rejects(readFile(path.join(f.root, file.file)), { code: 'ENOENT' }); }
		else { assert.deepEqual(await readFile(path.join(f.root, file.file)), Buffer.from(file.content)); }
	}
	await checkBehavior(f.root);
	await window.screenshot({ path: path.join(evidence, aiLive ? 'm5-live-applied.png' : 'm5-applied.png') });
	await app.close(); app = undefined;
	window = await launch();
	await window.locator('.ade-shell').getByRole('button', { name: 'Sync', exact: true }).waitFor({ timeout: 90000 });
	await runCommand(window, 'A.D.E: Resume Implementation');
	await window.locator('.monaco-editor .view-lines').filter({ hasText: 'Applied · Undo Available' }).last().waitFor();
	collaboration = await returnToModel();
	await collaboration.getByRole('button', { name: 'Undo Implementation', exact: true }).click();
	await window.locator('.monaco-dialog-box').getByRole('button', { name: 'Undo Implementation', exact: true }).click();
	await collaboration.getByText('Changes Undone', { exact: true }).waitFor();
	assert.equal(await readFile(path.join(f.root, 'checkout.mjs'), 'utf8'), original);
	if (!aiLive) { assert.equal(Number(await readFile(counter, 'utf8')), 2); }
	for (const before of session.before) {
		if (before.content === null) { await assert.rejects(readFile(path.join(f.root, before.file)), { code: 'ENOENT' }); }
		else { assert.deepEqual(await readFile(path.join(f.root, before.file)), Buffer.from(before.content)); }
	}
	await writeFile(resultFile, JSON.stringify({ kind: aiLive ? 'native-ui-with-live-codex' : 'native-ui-with-simulated-cli', recordedAt: new Date().toISOString(), externalProviderValidated: aiLive, model: session.prepared.config.model, calls: 2, usage: session.usage, passingTests: true, independentAcceptancePassed: true, applied: true, restartResume: true, undone: true, sourcePreserved: true }, null, 2));
	await app.close(); app = undefined;
	console.log(aiLive ? 'PASS: native M5 with live Codex, independent acceptance, apply, restart, resume and exact undo.' : 'PASS: native M5 context disclosure, plan approval, simulated CLI subprocess, independent acceptance, worktree tests, apply, restart, resume and undo; no external provider is validated.');
}

async function checkIndependentProjects() {
	const folder = path.join(workspace, 'from-zero');
	await mkdir(folder);
	let window = await launch();
	let shell = window.locator('.ade-shell');
	await shell.getByRole('button', { name: 'Create Project', exact: true }).click();
	await enterValue(window, 'Name', 'Laboratorio da zero');
	await chooseFolder(window, folder);
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
	await shell.getByRole('button', { name: 'Read Diagram', exact: true }).click();
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
	assert.deepEqual(saved.semantics.elements.map(element => element.name).sort(), ['Acquisizione dati', 'Archiviato', 'Campione', 'Console', 'Nuovo', 'Raccoglitore', 'Tecnico', 'Valida misura'].sort());
	assert.deepEqual([saved.codeMappings, saved.verifications], [[], []]);
	await app.close();
	app = undefined;
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
	await app.close();
	app = undefined;
}

async function checkModelImpact() {
	const fixture = structuredClone(checkoutModel);
	fixture.name = 'Synthetic Evidence Fixture';
	fixture.codeMappings.push({ id: 'fixture-mapping', elementId: 'checkout-controller', file: 'fixture.ts', symbol: 'confirm', revision: 'fixture-rev-1' });
	fixture.verifications.push(
		{ id: 'fixture-pass', elementId: 'checkout-controller', criterionId: 'purchase-success', outcome: 'passed', evidence: 'fixture-passed', revision: 'fixture-rev-1' },
		{ id: 'fixture-fail', elementId: 'checkout-controller', criterionId: 'purchase-success', outcome: 'failed', evidence: 'fixture-failed', revision: 'fixture-rev-2' },
		{ id: 'fixture-unknown', elementId: 'checkout-controller', criterionId: 'purchase-declined', outcome: 'unknown', evidence: 'fixture-unknown', revision: 'fixture-rev-3' });
	fixture.semantics.relations.push({ id: 'fixture-unclassified', kind: 'dependency', from: 'cart', to: 'payment-contract', name: 'Unclassified fixture', classification: 'legacy-unclassified' });
	await writeFile(modelFile, JSON.stringify(fixture));
	let window = await launch();
	let shell = window.locator('.ade-shell');
	await openModelFile(window, modelFile);
	await searchSystem(window, 'Contract', 'Pagamento');
	await shell.getByRole('button', { name: 'Show Change Impact', exact: true }).click();
	await shell.getByRole('heading', { level: 1, name: 'Change Impact: Pagamento', exact: true }).waitFor();
	assert.equal(await shell.locator('.ade-canvas').count(), 0);
	const dependents = () => shell.locator('.ade-impact-group').filter({ has: window.getByRole('heading', { name: 'Potential Dependents: 5', exact: true }) });
	assert.equal(await dependents().locator('.ade-impact-entry').count(), 5);
	assert.equal(await dependents().locator('[data-element-id="cart"]').count(), 0);
	await shell.getByText('Unclassified Relationships Not Propagated: 1', { exact: true }).waitFor();
	const links = shell.locator('.ade-impact > details');
	await links.locator('summary').click();
	await links.getByText('Unclassified relationship: excluded from propagation.', { exact: true }).waitFor();
	await links.getByRole('button', { name: 'Target: Pagamento', exact: true }).first().click();
	await shell.getByRole('heading', { level: 1, name: 'Pagamento', exact: true }).waitFor();
	await shell.getByRole('button', { name: 'Back', exact: true }).click();
	const evidenceGroup = shell.locator('.ade-impact-group').filter({ has: window.getByRole('heading', { name: 'Evidence to Review', exact: true }) });
	const controller = evidenceGroup.locator('[data-element-id="checkout-controller"]');
	await controller.getByText('Inspect Recorded Evidence', { exact: true }).click();
	await controller.getByText('Recorded Passed · Criterion: purchase-success · Evidence: fixture-passed · Revision: fixture-rev-1', { exact: true }).waitFor();
	await controller.getByText('Recorded Failed · Criterion: purchase-success · Evidence: fixture-failed · Revision: fixture-rev-2', { exact: true }).waitFor();
	await controller.getByText('Recorded Unknown · Criterion: purchase-declined · Evidence: fixture-unknown · Revision: fixture-rev-3', { exact: true }).waitFor();
	await controller.getByText('Different Outcomes Recorded for Criteria: purchase-success. Review each revision; no latest result is inferred.', { exact: true }).waitFor();
	assert.equal(await readFile(modelFile, 'utf8'), JSON.stringify(fixture), 'Impact navigation and record inspection never edit the document');
	await controller.scrollIntoViewIfNeeded();
	await window.screenshot({ path: path.join(evidence, 'recorded-evidence.png') });
	await shell.getByRole('button', { name: 'Read Change Impact', exact: true }).click();
	await window.locator('.accessible-view:visible').getByText('Change Impact: Pagamento', { exact: true }).waitFor();
	await window.locator('.accessible-view:visible').getByText('Potential Dependents: 5', { exact: true }).waitFor();
	await window.keyboard.press('Escape');
	await dependents().getByRole('button', { name: 'Richiedi pagamento', exact: true }).click();
	await shell.getByRole('heading', { level: 1, name: 'Richiedi pagamento', exact: true }).waitFor();
	await shell.getByRole('button', { name: 'Back', exact: true }).click();
	await shell.getByRole('heading', { level: 1, name: 'Change Impact: Pagamento', exact: true }).waitFor();
	await shell.getByRole('button', { name: 'Forward', exact: true }).click();
	await shell.getByRole('heading', { level: 1, name: 'Richiedi pagamento', exact: true }).waitFor();
	await shell.getByRole('button', { name: 'Back', exact: true }).click();
	const diagrams = shell.locator('.ade-impact-group').filter({ has: window.getByRole('heading', { name: 'Diagrams to Review: 3', exact: true }) });
	await diagrams.getByRole('button', { name: 'Esito pagamento', exact: true }).click();
	await shell.getByRole('heading', { level: 1, name: 'Esito pagamento', exact: true }).waitFor();
	await shell.getByRole('button', { name: 'Back', exact: true }).click();
	await shell.getByRole('button', { name: 'Element Details', exact: true }).click();
	await shell.getByRole('heading', { level: 1, name: 'Pagamento', exact: true }).waitFor();
	await runCommand(window, 'A.D.E: Show Change Impact');
	await shell.getByRole('heading', { level: 1, name: 'Change Impact: Pagamento', exact: true }).waitFor();
	await shell.locator('.ade-properties').getByRole('button', { name: 'Rename Element', exact: true }).click();
	await enterValue(window, 'Name', 'Contratto pagamento');
	await shell.getByRole('heading', { level: 1, name: 'Change Impact: Contratto pagamento', exact: true }).waitFor();
	await shell.getByRole('button', { name: 'Undo', exact: true }).click();
	await shell.getByRole('heading', { level: 1, name: 'Change Impact: Pagamento', exact: true }).waitFor();
	await shell.getByRole('button', { name: 'Redo', exact: true }).click();
	await shell.getByRole('heading', { level: 1, name: 'Change Impact: Contratto pagamento', exact: true }).waitFor();
	await shell.getByRole('heading', { level: 1, name: 'Change Impact: Contratto pagamento', exact: true }).scrollIntoViewIfNeeded();
	await window.screenshot({ path: path.join(evidence, 'model-impact.png') });
	await shell.getByRole('button', { name: 'Save', exact: true }).click();
	await shell.getByText('Saved', { exact: true }).waitFor();
	const saved = JSON.parse(await readFile(modelFile, 'utf8'));
	assert.deepEqual(validateSemanticModel(saved).filter(diagnostic => diagnostic.severity === 'error'), []);
	assert.deepEqual([saved.codeMappings, saved.verifications], [fixture.codeMappings, fixture.verifications]);
	console.log('PASS: model-only impact, reverse reasons, uncertain links, recorded outcomes/revisions, semantic navigation, reading and native undo/redo/save.');
	await app.close();
	app = undefined;
	window = await launch();
	shell = window.locator('.ade-shell');
	await shell.getByRole('heading', { level: 1, name: 'Change Impact: Contratto pagamento', exact: true }).waitFor();
	await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(800, 800));
	await shell.getByRole('button', { name: 'Element Details', exact: true }).focus();
	await window.keyboard.press('Enter');
	await shell.getByRole('heading', { level: 1, name: 'Contratto pagamento', exact: true }).waitFor();
	await shell.getByRole('button', { name: 'Show Change Impact', exact: true }).focus();
	await window.keyboard.press('Enter');
	await shell.getByRole('heading', { level: 1, name: 'Change Impact: Contratto pagamento', exact: true }).waitFor();
	const updated = structuredClone(saved);
	updated.semantics.relations = updated.semantics.relations.filter(relation => relation.id !== 'gateway-contract');
	await writeFile(modelFile, JSON.stringify(updated));
	await shell.getByRole('heading', { name: 'Potential Dependents: 4', exact: true }).waitFor();
	const removed = structuredClone(updated);
	removed.semantics.elements = removed.semantics.elements.filter(element => element.id !== 'payment-contract');
	removed.semantics.relations = removed.semantics.relations.filter(relation => relation.from !== 'payment-contract' && relation.to !== 'payment-contract');
	await writeFile(modelFile, JSON.stringify(removed));
	await shell.locator('.ade-canvas').waitFor();
	assert.equal(await shell.locator('.ade-impact').count(), 0);
	await openModelFile(window, otherFile);
	assert.equal(await shell.locator('.ade-impact').count(), 0);
	await openModelFile(window, invalidFile);
	await shell.getByRole('alert').waitFor();
	assert.equal(await shell.locator('.ade-impact').count(), 0);
	console.log('PASS: impact restores after restart, supports narrow-window keyboard navigation and recomputes on external edits/deletion without stale reports across documents.');
	await app.close();
	app = undefined;
}

async function checkStateDiagram() {
	let window = await launch();
	let shell = window.locator('.ade-shell');
	await openModelFile(window, modelFile);
	await runCommand(window, 'A.D.E: Add Diagram');
	await pickValue(window, 'Choose Feature', 'Conferma acquisto');
	await pickValue(window, 'Diagram Type', 'State Diagram');
	await pickValue(window, 'Resource Lifecycle', 'Ordine');
	await enterValue(window, 'Name', 'Order Lifecycle');
	await shell.getByRole('heading', { level: 1, name: 'Order Lifecycle', exact: true }).waitFor();
	await shell.getByText('0 of 3 declared states visible · 0 visible transitions', { exact: true }).waitFor();
	assert.equal(await shell.locator('.ade-node').count(), 1);
	await shell.getByRole('button', { name: 'Add Existing Transition', exact: true }).click();
	await pickValue(window, 'Add Existing Transition', 'In attesa → Confermato: pagamento riuscito');
	assert.equal(await shell.locator('.ade-node').count(), 3);
	await runCommand(window, 'A.D.E: Include Resource Lifecycle');
	await shell.getByText('3 of 3 declared states visible · 2 visible transitions', { exact: true }).waitFor();
	await shell.getByRole('button', { name: 'Add State', exact: true }).click();
	await enterValue(window, 'Name', 'Annullato');
	await shell.locator('.ade-node').getByText('Annullato', { exact: true }).waitFor();
	await connect(window, 'In attesa', 'Annullato', 'Transition', 'Richiesta annullamento', 'ordine annullabile');
	await connect(window, 'Annullato', 'Annullato', 'Transition', 'Riprova', 'richiesta valida');
	await shell.locator('.ade-node').getByText('Confermato', { exact: true }).click();
	await shell.locator('.ade-properties').getByRole('button', { name: 'Edit Transition Event', exact: true }).click();
	await enterValue(window, 'Transition Event (Optional)', 'Ricevuta conferma pagamento');
	await shell.locator('.ade-properties').getByRole('button', { name: 'Edit Condition', exact: true }).click();
	await enterValue(window, 'Condition (Optional)', 'pagamento verificato');
	await shell.locator('.ade-connection-label').filter({ hasText: 'Ricevuta conferma pagamento · [pagamento verificato]' }).waitFor();
	await shell.locator('.ade-node').getByText('In attesa', { exact: true }).click();
	await contractEntry(window, 'In attesa', 'Errors');
	await enterValue(window, 'Error Code', 'payment-declined');
	await enterValue(window, 'Error Description', 'Nessun ordine confermato');
	await shell.locator('.ade-node').getByText('Pagamento rifiutato', { exact: true }).click();
	await shell.locator('.ade-properties').getByRole('button', { name: 'Edit Relationship Error', exact: true }).click();
	await pickValue(window, 'Relationship Error', 'payment-declined');
	const tableDetails = shell.locator('.ade-state-summary details');
	await tableDetails.locator('summary').click();
	const table = tableDetails.getByRole('table', { name: 'Transition Table: Ordine', exact: true });
	assert.equal(await table.locator('tbody tr').count(), 4);
	await table.locator('tr[data-relation-id="order-confirmed"]').getByRole('cell', { name: 'Ricevuta conferma pagamento', exact: true }).waitFor();
	await table.locator('tr[data-relation-id="order-declined"]').getByRole('cell', { name: 'payment-declined', exact: true }).waitFor();
	await table.screenshot({ path: path.join(evidence, 'state-transition-table.png') });
	await table.locator('tr[data-relation-id="order-confirmed"]').getByRole('button', { name: 'In attesa', exact: true }).click();
	await shell.getByRole('button', { name: 'Read Diagram', exact: true }).click();
	await window.locator('.accessible-view:visible').getByText('Resource: Ordine. Visible states: 4 of 4. Visible transitions: 4.', { exact: true }).waitFor();
	await window.keyboard.press('Escape');
	await tableDetails.locator('summary').click();
	await shell.locator('.ade-node').getByText('Confermato', { exact: true }).click();
	await shell.locator('.ade-properties').getByRole('button', { name: 'Remove Relationship from Diagram', exact: true }).click();
	assert.equal(await shell.locator('svg path[data-relation-id="order-confirmed"]').count(), 0);
	await shell.getByRole('button', { name: 'Undo', exact: true }).click();
	await shell.locator('svg path[data-relation-id="order-confirmed"]').waitFor();
	await shell.locator('.ade-properties').getByRole('button', { name: 'Rename Element', exact: true }).click();
	await enterValue(window, 'Name', 'Ordine confermato');
	await window.locator('.ade-sidebar').getByRole('button', { name: 'Esito pagamento', exact: true }).click();
	await shell.locator('.ade-node').getByText('Ordine confermato', { exact: true }).click();
	await shell.locator('.ade-connection-label').filter({ hasText: 'Ricevuta conferma pagamento · [pagamento verificato]' }).waitFor();
	await shell.locator('.ade-properties').getByRole('button', { name: 'Order Lifecycle', exact: true }).click();
	const cancelled = shell.locator('.ade-node').getByText('Annullato', { exact: true });
	await cancelled.focus();
	await window.keyboard.press('Enter');
	const before = await cancelled.evaluate(element => parseFloat(element.style.left));
	await window.keyboard.press('ArrowRight');
	assert.equal(await cancelled.evaluate(element => parseFloat(element.style.left)), before + 20);
	await shell.getByRole('button', { name: 'Undo', exact: true }).click();
	assert.equal(await cancelled.evaluate(element => parseFloat(element.style.left)), before);
	await shell.getByRole('button', { name: 'Redo', exact: true }).click();
	await shell.getByRole('button', { name: 'Fit Diagram', exact: true }).click();
	await shell.locator('.ade-canvas-scroll').scrollIntoViewIfNeeded();
	await window.screenshot({ path: path.join(evidence, 'state-diagram.png') });
	await shell.getByRole('button', { name: 'Save', exact: true }).click();
	await shell.getByText('Saved', { exact: true }).waitFor();
	const saved = JSON.parse(await readFile(modelFile, 'utf8'));
	assert.deepEqual(validateSemanticModel(saved), []);
	assert.equal(saved.semantics.elements.length, checkoutModel.semantics.elements.length + 1);
	assert.equal(saved.semantics.relations.length, checkoutModel.semantics.relations.length + 2);
	console.log('PASS: resource lifecycle, state creation, guarded/self transitions, shared event/error editing, table, native reading, move, undo/redo and save.');
	await app.close();
	app = undefined;
	window = await launch();
	shell = window.locator('.ade-shell');
	await shell.getByRole('heading', { level: 1, name: 'Order Lifecycle', exact: true }).waitFor();
	await shell.locator('.ade-properties').getByRole('heading', { name: 'Annullato', exact: true }).waitFor();
	await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(800, 800));
	await shell.getByRole('button', { name: 'Remove State from Diagram', exact: true }).focus();
	await window.keyboard.press('Enter');
	assert.equal(await shell.locator('.ade-node').getByText('Annullato', { exact: true }).count(), 0);
	await shell.getByRole('button', { name: 'Save', exact: true }).click();
	await shell.getByText('Saved', { exact: true }).waitFor();
	const removed = JSON.parse(await readFile(modelFile, 'utf8'));
	assert.deepEqual(removed.semantics, saved.semantics);
	assert.deepEqual(removed.views.slice(0, 4), saved.views.slice(0, 4));
	await shell.getByRole('button', { name: 'Add Existing State', exact: true }).click();
	await window.locator('.quick-input-widget').getByText('Add Existing State', { exact: true }).waitFor();
	await window.locator('.quick-input-widget input:visible').fill('Annullato');
	await window.locator('.quick-input-widget .monaco-list-row').getByText('Annullato', { exact: true }).waitFor();
	await window.keyboard.press('Enter');
	await shell.locator('.ade-node').getByText('Annullato', { exact: true }).waitFor();
	await runCommand(window, 'A.D.E: Add Diagram');
	await pickValue(window, 'Choose Feature', 'Conferma acquisto');
	await pickValue(window, 'Diagram Type', 'State Diagram');
	await pickValue(window, 'Resource Lifecycle', 'Create New Resource');
	await enterValue(window, 'Resource Name', 'Spedizione');
	await enterValue(window, 'Name', 'Shipment Lifecycle');
	await shell.getByRole('heading', { level: 1, name: 'Shipment Lifecycle', exact: true }).waitFor();
	await shell.locator('.ade-node').getByText('Spedizione', { exact: true }).waitFor();
	await shell.getByRole('button', { name: 'Undo', exact: true }).click();
	assert.equal(await window.locator('.ade-sidebar').getByRole('button', { name: 'Shipment Lifecycle', exact: true }).count(), 0);
	await shell.getByRole('button', { name: 'Save', exact: true }).click();
	await shell.getByText('Saved', { exact: true }).waitFor();
	const final = JSON.parse(await readFile(modelFile, 'utf8'));
	assert.deepEqual(final.semantics, saved.semantics);
	console.log('PASS: state diagram/resource creation, lifecycle reuse, guarded/self transitions, event/error/contract editing across views, transition table, native reading, keyboard move, local removal, undo/redo, save/restart and narrow-window interaction.');
	await app.close();
	app = undefined;
}

async function checkSequenceDiagram() {
	let window = await launch();
	let shell = window.locator('.ade-shell');
	await openModelFile(window, modelFile);
	await runCommand(window, 'A.D.E: Add Diagram');
	await pickValue(window, 'Choose Feature', 'Conferma acquisto');
	await pickValue(window, 'Diagram Type', 'Sequence Diagram');
	await enterValue(window, 'Name', 'Purchase Sequence');
	await shell.getByRole('heading', { name: 'Purchase Sequence', exact: true, level: 1 }).waitFor();
	await shell.getByText('This diagram has no elements.', { exact: true }).waitFor();
	const ids = ['customer-checkout', 'checkout-confirm', 'confirm-payment', 'payment-gateway', 'confirm-order', 'show-declined', 'confirm-cart'];
	const names = new Map(checkoutModel.semantics.elements.map(element => [element.id, element.name]));
	for (const id of ids) {
		const relation = checkoutModel.semantics.relations.find(relation => relation.id === id);
		await shell.getByRole('button', { name: 'Add Existing Message', exact: true }).click();
		await pickValue(window, 'Add Existing Message', `${names.get(relation.from)} → ${names.get(relation.to)}: ${relation.name}`);
		await shell.locator(`.ade-sequence-message[data-relation-id="${id}"]`).waitFor();
	}
	const messageIds = () => shell.locator('.ade-sequence-message').evaluateAll(buttons => buttons.map(button => button.dataset.relationId));
	const participants = () => shell.locator('.ade-sequence .ade-node').allTextContents();
	assert.deepEqual(await messageIds(), ids);
	await shell.locator('.ade-sequence .ade-node').getByText('Conferma ordine', { exact: true }).click();
	await shell.getByRole('button', { name: 'Move Participant Left', exact: true }).click();
	assert.deepEqual((await participants()).slice(0, 3), ['Cliente', 'Conferma ordine', 'Checkout']);
	await shell.getByRole('button', { name: 'Undo', exact: true }).click();
	assert.deepEqual((await participants()).slice(0, 3), ['Cliente', 'Checkout', 'Conferma ordine']);
	await shell.getByRole('button', { name: 'Redo', exact: true }).click();
	const options = shell.locator('details').filter({ has: window.getByText('Sequence Message Options: crea ordine', { exact: true }) });
	await options.locator('summary').click();
	await options.getByRole('button', { name: 'Move Message Earlier', exact: true }).click();
	const reordered = [...ids];
	[reordered[3], reordered[4]] = [reordered[4], reordered[3]];
	assert.deepEqual(await messageIds(), reordered);
	await options.getByRole('button', { name: 'Remove Message from Diagram', exact: true }).click();
	assert.equal((await messageIds()).includes('confirm-order'), false);
	await shell.getByRole('button', { name: 'Undo', exact: true }).click();
	assert.deepEqual(await messageIds(), reordered);
	await connect(window, 'Conferma ordine', 'Conferma ordine', 'Invocation', 'Controlla carrello', 'carrello valido');
	assert.equal(await shell.locator('.ade-sequence-message').count(), 8);
	await contractEntry(window, 'Conferma ordine', 'Outputs', 'orderId');
	await enterValue(window, 'Field Name', 'orderId');
	await enterValue(window, 'Field Type', 'OrderReference');
	await pickValue(window, 'Field Presence', 'Required');
	await shell.getByText('Output: orderId (OrderReference), Required', { exact: true }).waitFor();
	await shell.getByRole('button', { name: 'Read Diagram', exact: true }).click();
	const reading = window.locator('.accessible-view:visible');
	await reading.getByText('Message 1', { exact: true }).waitFor();
	await window.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End');
	await reading.getByText('Message 8', { exact: true }).waitFor();
	await reading.getByText('Output: orderId (OrderReference), Required', { exact: true }).waitFor();
	await window.keyboard.press('Escape');
	await window.locator('.ade-sidebar').getByRole('button', { name: 'Percorso acquisto', exact: true }).click();
	await shell.locator('.ade-node').getByText('Conferma ordine', { exact: true }).click();
	await shell.getByText('Output: orderId (OrderReference), Required', { exact: true }).waitFor();
	await shell.locator('.ade-properties').getByRole('button', { name: 'Purchase Sequence', exact: true }).click();
	await shell.getByRole('button', { name: 'Fit Diagram', exact: true }).click();
	const firstZoom = await shell.locator('.ade-canvas-content').evaluate(element => element.style.transform);
	await shell.getByRole('button', { name: 'Fit Diagram', exact: true }).click();
	assert.equal(await shell.locator('.ade-canvas-content').evaluate(element => element.style.transform), firstZoom);
	const labelsClear = await shell.locator('.ade-sequence-message').evaluateAll(labels => labels.every((label, index) => {
		const a = label.getBoundingClientRect();
		return labels.slice(index + 1).every(other => { const b = other.getBoundingClientRect(); return a.bottom <= b.top || b.bottom <= a.top || a.right <= b.left || b.right <= a.left; });
	}));
	assert.equal(labelsClear, true, 'Measured message labels do not overlap');
	await window.screenshot({ path: path.join(evidence, 'sequence-diagram.png') });
	await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(800, 800));
	await shell.locator('.ade-sequence .ade-node').getByText('Conferma ordine', { exact: true }).focus();
	await window.keyboard.press('Enter');
	await shell.getByRole('button', { name: 'Move Participant Right', exact: true }).focus();
	await window.keyboard.press('Enter');
	await shell.getByRole('button', { name: 'Undo', exact: true }).click();
	await shell.getByRole('button', { name: 'Reset Zoom', exact: true }).click();
	await shell.locator('.ade-canvas-scroll').focus();
	await window.keyboard.press('ArrowRight');
	assert.ok(await shell.locator('.ade-canvas-scroll').evaluate(element => element.scrollLeft > 0));
	await shell.getByRole('button', { name: 'Save', exact: true }).click();
	await shell.getByText('Saved', { exact: true }).waitFor();
	const saved = JSON.parse(await readFile(modelFile, 'utf8'));
	const sequence = saved.views.find(view => view.kind === 'sequence');
	assert.deepEqual(validateSemanticModel(saved), []);
	assert.equal(saved.semantics.relations.length, checkoutModel.semantics.relations.length + 1);
	assert.deepEqual(saved.views.slice(0, 4).map(view => ({ ...view, featureId: undefined })), checkoutModel.views.map(view => ({ ...view, featureId: undefined })));
	await app.close();
	app = undefined;
	window = await launch();
	shell = window.locator('.ade-shell');
	await shell.getByRole('heading', { name: 'Purchase Sequence', exact: true, level: 1 }).waitFor();
	assert.deepEqual(await messageIds(), sequence.relationIds);
	await shell.getByText('Output: orderId (OrderReference), Required', { exact: true }).waitFor();
	await shell.getByRole('button', { name: 'Remove Participant from Diagram', exact: true }).click();
	assert.equal((await participants()).includes('Conferma ordine'), false);
	await shell.getByRole('button', { name: 'Save', exact: true }).click();
	await shell.getByText('Saved', { exact: true }).waitFor();
	const removed = JSON.parse(await readFile(modelFile, 'utf8'));
	assert.deepEqual(removed.semantics, saved.semantics);
	assert.deepEqual(removed.views.slice(0, 4), saved.views.slice(0, 4));
	console.log('PASS: sequence creation, shared interactions, participant/message order, view-only removal, self messages, contracts across views, accessible reading, measured labels, stable Fit Diagram, narrow-window keyboard pan, save and restart.');
	await app.close();
	app = undefined;
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
	assert.equal(await cancellationDetails().evaluate(details => details.open), false);
	await shell.getByRole('button', { name: 'System Map', exact: true }).click();
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
	assert.equal(await connection.evaluate(element => element.parentElement.open), true, 'Map disclosure survives a semantic visit');
	await shell.locator('.ade-navigation').getByRole('button', { name: 'Percorso acquisto', exact: true }).click();
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
	await shell.getByRole('button', { name: 'Search System', exact: true }).click();
	await window.locator('.quick-input-widget').getByText('Search Filter', { exact: true }).waitFor();
	await window.keyboard.press('Escape');
	await shell.getByRole('heading', { level: 1, name: 'Esito pagamento', exact: true }).waitFor();
	await window.screenshot({ path: path.join(evidence, 'semantic-navigation.png') });
	assert.equal(await readFile(modelFile, 'utf8'), JSON.stringify(checkoutModel));
	console.log('PASS: typed semantic search, unplaced contract details, accessible reading, relationship navigation, shared identity across diagrams, breadcrumbs and back/forward branching.');
	await openModelFile(window, modelFile);
	assert.equal(await cancellationDetails().evaluate(details => details.open), true, 'Group state is isolated between demo and file, despite equal semantic IDs');
	await cancellationDetails().locator(':scope > summary').focus();
	await window.keyboard.press('Space');
	assert.equal(await cancellationDetails().evaluate(details => details.open), false);
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
	assert.equal(saved.semantics.elements.find(element => element.id === 'payment-contract').name, 'Contratto pagamento');
	assert.deepEqual(saved.semantics.elements.find(element => element.id === 'payment-contract').behavior.outputs, [{ name: 'receipt', type: 'PaymentReceipt', required: true }]);
	await app.close();
	app = undefined;
	window = await launch();
	shell = window.locator('.ade-shell');
	await shell.getByRole('heading', { level: 1, name: 'Contratto pagamento', exact: true }).waitFor();
	await shell.getByText('Output: receipt (PaymentReceipt), Required', { exact: true }).waitFor();
	assert.equal(await cancellationDetails().evaluate(details => details.open), false, 'Collapsed groups survive a workspace restart');
	await cancellationDetails().locator(':scope > summary').focus();
	await window.keyboard.press('Enter');
	await cancellationDetails().getByRole('button', { name: 'Percorso annullamento', exact: true }).waitFor();
	assert.equal(await shell.getByRole('button', { name: 'Back', exact: true }).isEnabled(), false);
	assert.equal(await window.locator('.tabs-container .tab').filter({ hasText: 'checkout.ade.json' }).count(), 0);
	await window.screenshot({ path: path.join(evidence, 'semantic-element-details.png') });
	const removed = structuredClone(saved);
	removed.semantics.elements = removed.semantics.elements.filter(element => element.id !== 'payment-contract');
	removed.semantics.relations = removed.semantics.relations.filter(relation => relation.from !== 'payment-contract' && relation.to !== 'payment-contract');
	const surviving = new Set(removed.semantics.relations.map(relation => relation.id));
	for (const view of removed.views) {
		view.relationIds = view.relationIds.filter(id => surviving.has(id));
		view.nodes = view.nodes.filter(node => node.elementId !== 'payment-contract');
	}
	await writeFile(modelFile, JSON.stringify(removed));
	await shell.getByRole('heading', { level: 1, name: 'Percorso acquisto', exact: true }).waitFor();
	assert.equal(await shell.getByRole('alert').count(), 0);
	console.log('PASS: semantic inspector edits use native undo/redo/save, restart restores the inspected identity, and external deletion repairs context without stale details.');
	await shell.getByRole('button', { name: 'System Map', exact: true }).click();
	await app.close();
	app = undefined;
	window = await launch();
	shell = window.locator('.ade-shell');
	await shell.getByRole('button', { name: 'Read System Map', exact: true }).waitFor();
	assert.equal(await shell.getByRole('button', { name: 'Back', exact: true }).isEnabled(), false);
	await shell.locator('.ade-system-map').getByRole('button', { name: 'Esito pagamento', exact: true }).click();
	const routed = await shell.locator('svg path[data-relation-id]').evaluateAll(paths => paths.map(path => ({ id: path.getAttribute('data-relation-id'), d: path.getAttribute('d') })));
	assert.equal(routed.length, removed.views[1].relationIds.length);
	assert.ok(routed.every(path => path.d.split(' M ')[0].split(' L ').length >= 2));
	const labelsClear = await shell.locator('.ade-canvas').evaluate(canvas => {
		const boxes = [...canvas.querySelectorAll('.ade-node, .ade-connection-label')].map(element => ({ label: element.classList.contains('ade-connection-label'), box: element.getBoundingClientRect() }));
		return boxes.every((a, index) => boxes.slice(index + 1).every(b => !(a.label || b.label) || !(a.box.left < b.box.right && a.box.right > b.box.left && a.box.top < b.box.bottom && a.box.bottom > b.box.top)));
	});
	assert.equal(labelsClear, true, 'Actual rendered labels avoid nodes and one another');
	await window.screenshot({ path: path.join(evidence, 'routed-connections.png') });
	console.log('PASS: system map covers all identities, supports keyboard and accessible reading, opens semantic breadcrumbs, restores after restart, and diagram labels do not overlap nodes or one another.');
	const shared = structuredClone(removed);
	shared.views.push({ id: 'shared-review', featureId: 'purchase', name: 'Shared Review', kind: 'structure', nodes: [
		{ elementId: 'payment', x: 0, y: 0 }, { elementId: 'cancel-controller', x: 300, y: 0 }
	], relationIds: [] });
	assert.deepEqual(validateSemanticModel(shared), []);
	await writeFile(modelFile, JSON.stringify(shared));
	await cancellationDetails().getByText('Related Diagrams', { exact: true }).waitFor();
	await cancellationDetails().getByRole('button', { name: 'Shared Review', exact: true }).click();
	await shell.getByRole('heading', { level: 1, name: 'Shared Review', exact: true }).waitFor();
	await shell.getByRole('navigation', { name: 'Semantic Path', exact: true }).getByRole('button', { name: 'Conferma acquisto', exact: true }).waitFor();
	assert.equal(await sidebar().getByRole('button', { name: 'Shared Review', exact: true }).count(), 2, 'Owner and related feature reference the same diagram');
	await shell.getByText('Diagram Type: Structure', { exact: true }).waitFor();
	await window.screenshot({ path: path.join(evidence, 'integrated-m2-sidebar.png') });
	console.log('PASS: integrated M2 cancellation example, persistent keyboard disclosures per document, stable sidebar DOM on selection, and shared references with preserved canonical ownership.');
	await app.close();
	app = undefined;
}

async function checkDiagramAccessibility(window) {
	const shell = window.locator('.ade-shell');
	const sidebar = window.locator('.ade-sidebar');
	const reading = window.locator('.accessible-view:visible');
	const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
	const openReading = process.platform === 'linux' ? 'Alt+Shift+F2' : 'Alt+F2';
	const openHelp = process.platform === 'linux' ? 'Alt+Shift+F1' : 'Alt+F1';
	await sidebar.getByRole('button', { name: 'Esito pagamento', exact: true }).click();
	const selected = shell.locator('.ade-node[aria-pressed="true"]');
	await shell.locator('.ade-node').getByText('Pagamento rifiutato', { exact: true }).click();
	await selected.focus();
	await window.keyboard.press(openReading);
	await reading.getByText('Diagram: Esito pagamento', { exact: true }).waitFor();
	await reading.getByText('Condition: pagamento non autorizzato', { exact: true }).waitFor();
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
	const readButton = shell.getByRole('button', { name: 'Read Diagram', exact: true });
	await readButton.click();
	await reading.getByText('Selected Element: Pagamento rifiutato', { exact: true }).waitFor();
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
	updated.semantics.elements.find(element => element.id === 'declined').name = 'Refused Payment';
	await writeFile(modelFile, JSON.stringify(updated));
	await reading.getByText('Diagram: Accessible Payment', { exact: true }).waitFor();
	await reading.getByText('Selected Element: Refused Payment', { exact: true }).waitFor();
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
	await window.waitForFunction(() => document.querySelector('.ade-shell').getAttribute('aria-description') === '');
	assert.equal(await sidebar.getAttribute('aria-description'), '');
	await writeFile(settingsFile, JSON.stringify({ ...settings, 'accessibility.verbosity.ade': true }));
	await window.waitForFunction(() => document.querySelector('.ade-shell').getAttribute('aria-description').includes('Accessibility Help'));
	const keybindingsFile = path.join(userData, 'User/keybindings.json');
	await writeFile(keybindingsFile, JSON.stringify([{ key: 'ctrl+alt+shift+r', command: 'editor.action.accessibleView' }]));
	await window.waitForFunction(() => document.querySelector('.ade-shell').getAttribute('aria-description').includes('+R'));
	await selected.focus();
	await window.keyboard.press('Control+Alt+Shift+r');
	await reading.getByText('Diagram: Esito pagamento', { exact: true }).waitFor();
	await window.keyboard.press('Escape');
	await writeFile(keybindingsFile, '[]');
	await window.waitForFunction(() => !document.querySelector('.ade-shell').getAttribute('aria-description').includes('+R'));
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
	await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(800, 800));
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
	await shell.locator('.ade-node').last().evaluate(element => element.click());
	assert.equal(await content.evaluate(element => element.scrollTop), scrollBefore, 'Selection retains the property reading position');
	await viewport.focus();
	await window.keyboard.press('ArrowRight');
	const panBefore = await viewport.evaluate(element => element.scrollLeft);
	await openModelFile(window, otherFile);
	await shell.getByText('Other System · Design intent', { exact: true }).waitFor();
	assert.equal(await viewport.evaluate(element => element.scrollLeft), 0, 'Equal view IDs in different documents do not share scroll');
	await openModelFile(window, modelFile);
	await shell.getByText('Acquisto · Design intent', { exact: true }).waitFor();
	assert.equal(await viewport.evaluate(element => element.scrollLeft), panBefore, 'Returning to a document restores its own scroll');
	await shell.getByRole('button', { name: 'Fit Diagram', exact: true }).click();
	assert.ok(await viewport.evaluate(element => element.scrollWidth <= element.clientWidth + 1), 'Fit contains the diagram horizontally');
	assert.equal(await viewport.evaluate(element => element.scrollLeft), 0);
	const fittedZoom = await shell.locator('.ade-canvas-content').evaluate(element => element.style.transform);
	await shell.getByRole('button', { name: 'Fit Diagram', exact: true }).click();
	assert.equal(await shell.locator('.ade-canvas-content').evaluate(element => element.style.transform), fittedZoom, 'Fitting twice keeps the same zoom');
	const layout = await shell.evaluate(element => {
		const content = element.querySelector('.ade-content');
		const canvas = element.querySelector('.ade-visual').getBoundingClientRect();
		const properties = element.querySelector('.ade-properties').getBoundingClientRect();
		return { overflows: content.scrollWidth > content.clientWidth + 1, stacked: properties.top >= canvas.bottom };
	});
	assert.deepEqual(layout, { overflows: false, stacked: true });
	console.log('UX: canvas keyboard and narrow layout checked.');
	const options = shell.locator('summary').getByText('Diagram Options', { exact: true });
	await options.focus();
	await window.keyboard.press('Enter');
	await shell.getByRole('button', { name: 'Rename Diagram', exact: true }).waitFor();
	await runCommand(window, 'A.D.E: Rename Diagram');
	await enterValue(window, 'Name', 'Keyboard diagram');
	await shell.getByRole('heading', { name: 'Keyboard diagram', exact: true }).waitFor();
	assert.equal(await shell.locator('details', { hasText: 'Diagram Options' }).evaluate(element => element.open), true);
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
			const rgba = value => value.match(/[\d.]+/g).map(Number);
			let background = [0, 0, 0, 0];
			for (let surface = element; surface && background[3] < 1; surface = surface.parentElement) {
				const color = rgba(getComputedStyle(surface).backgroundColor);
				const alpha = color[3] ?? 1;
				for (let index = 0; index < 3; index++) { background[index] += color[index] * alpha * (1 - background[3]); }
				background[3] += alpha * (1 - background[3]);
			}
			const style = getComputedStyle(element);
			return { foreground: rgba(style.color), background, outline: style.outlineStyle, outlineColor: style.outlineColor };
		});
		const luminance = color => color.slice(0, 3).map(channel => channel / 255).map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
		const light = luminance(appearance.foreground);
		const dark = luminance(appearance.background);
		const contrast = (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
		assert.ok(contrast >= 4.5, `${name}: selected node text contrast ${contrast.toFixed(2)}`);
		assert.notEqual(appearance.outline, 'none', `${name}: keyboard focus is visible`);
		assert.notEqual(appearance.outlineColor, 'rgba(0, 0, 0, 0)');
		await window.screenshot({ path: path.join(evidence, `ux-${themeClass}.png`) });
		await shell.getByRole('button', { name: 'System Map', exact: true }).click();
		await shell.getByRole('button', { name: 'Read System Map', exact: true }).waitFor();
		assert.equal(await shell.locator('.ade-content').evaluate(element => element.scrollWidth > element.clientWidth + 1), false, `${name}: narrow map fits its content area`);
		const mapElement = shell.locator('.ade-system-map button').first();
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
	await shell.getByRole('button', { name: 'Terminal', exact: true }).click();
	const terminalInput = window.locator('.terminal .xterm-helper-textarea');
	await terminalInput.waitFor({ state: 'attached' });
	await terminalInput.focus();
	await window.keyboard.type("printf 'ADE_TERMINAL_OK\\n'\n");
	await window.locator('.terminal .xterm-rows > div').filter({ hasText: /^ADE_TERMINAL_OK\s*$/ }).waitFor();
	await window.keyboard.press(process.platform === 'linux' ? 'Alt+Shift+F1' : 'Alt+F1');
	const terminalHelp = window.locator('.accessible-view:visible');
	await terminalHelp.getByText('The Focus Accessible Terminal View command', { exact: false }).waitFor();
	assert.equal(await terminalHelp.getByText('A.D.E Accessibility Help', { exact: true }).count(), 0, 'ADE providers do not intercept help in technical tools');
	await window.keyboard.press('Escape');
	await window.keyboard.press(`${modifier}+Alt+d`);
	await window.locator('.ade-sidebar').waitFor();
	await shell.locator('.ade-properties').getByRole('heading', { name: selection, exact: true }).waitFor();
	console.log('PASS: integrated terminal executes a command and returns to the same model selection.');
	await app.close();
	app = undefined;
	const restored = await launch();
	await restored.locator('.ade-shell').getByRole('heading', { name: 'Keyboard diagram', exact: true }).waitFor();
	assert.equal(await restored.locator('.tabs-container .tab').filter({ hasText: 'checkout.ade.json' }).count(), 0);
	console.log('PASS: keyboard pan/selection, Fit Diagram, retained scroll, accessible options, command editing and saved context after restart.');
	await app.close();
	app = undefined;
}

try {
	if (aiOnly) { await checkAiWorkflow(); }
	if (codeOnly) { await checkCodeBridge(); }
	if (projectsOnly) { await checkIndependentProjects(); }
	if (impactOnly) { await checkModelImpact(); }
	if (stateOnly) { await checkStateDiagram(); }
	if (sequenceOnly) { await checkSequenceDiagram(); }
	if (navigationOnly) { await checkSemanticNavigation(); }
	if (uxOnly) { await checkVisualUX(); }
	if (!process.argv.includes('--extension-only') && !uxOnly && !navigationOnly && !sequenceOnly && !stateOnly && !impactOnly && !projectsOnly && !codeOnly && !aiOnly) {
		let window = await launch();
		let shell = window.locator('.ade-shell');
		let sidebar = window.locator('.ade-sidebar');
		await sidebar.waitFor();
		assert.equal(await window.locator('.explorer-viewlet:visible').count(), 0);
		await shell.getByRole('button', { name: 'Explore Purchase Example', exact: true }).click();
		await sidebar.locator('section[aria-label="Conferma acquisto"]')
			.getByRole('button', { name: 'Percorso acquisto', exact: true }).click();
		const collaboration = shell.locator('details').filter({ has: window.locator('summary', { hasText: /^AI Collaboration$/ }) });
		await collaboration.locator('summary').click();
		assert.equal(await collaboration.getByRole('button', { name: 'Connect Claude Code or Codex', exact: true }).isEnabled(), true);
		assert.equal(await collaboration.getByRole('button', { name: 'Open AI CLI', exact: true }).isEnabled(), true);
		for (const name of ['Implement Feature', 'Run Tests', 'Apply Verified Changes', 'Undo Implementation']) {
			assert.equal(await collaboration.getByRole('button', { name, exact: true }).isEnabled(), false);
		}
		await collaboration.getByRole('button', { name: 'Connect Claude Code or Codex', exact: true }).click();
		await window.locator('.quick-input-widget').getByText('Choose AI CLI', { exact: true }).waitFor();
		await window.locator('.quick-input-widget').getByText('Codex', { exact: true }).waitFor();
		await window.locator('.quick-input-widget').getByText('Claude Code', { exact: true }).waitFor();
		await window.keyboard.press('Escape');
		await window.locator('.quick-input-widget').waitFor({ state: 'hidden' });
		await window.screenshot({ path: path.join(evidence, 'ai-collaboration.png') });
		await collaboration.locator('summary').click();
		console.log('PASS: native AI controls and provider chooser render without inference; implementation, tests, apply and undo require an imported project or reviewed session.');
		await shell.locator('.ade-canvas').getByRole('button', { name: 'Richiedi pagamento', exact: true }).click();
		await shell.locator('.ade-properties').getByRole('heading', { name: 'Richiedi pagamento', exact: true }).waitFor();
		await sidebar.getByRole('button', { name: 'Struttura carrello', exact: true }).click();
		await shell.getByRole('heading', { name: 'Struttura carrello', exact: true }).waitFor();
		await shell.locator('.ade-canvas').getByRole('button', { name: 'Carrello', exact: true }).click();
		await sidebar.getByRole('button', { name: 'Percorso acquisto', exact: true }).click();
		await shell.locator('.ade-properties').getByRole('heading', { name: 'Richiedi pagamento', exact: true }).waitFor();
		await sidebar.getByRole('button', { name: 'Esito pagamento', exact: true }).click();
		const declined = shell.locator('.ade-canvas').getByRole('button', { name: 'Pagamento rifiutato', exact: true });
		await declined.focus();
		await window.keyboard.press('Enter');
		assert.equal(await declined.getAttribute('aria-pressed'), 'true');
		assert.equal(await declined.evaluate(element => element === document.activeElement), true);
		await shell.locator('.ade-properties').getByText('Condition: pagamento non autorizzato', { exact: true }).waitFor();
		await shell.getByRole('button', { name: 'Files', exact: true }).click();
		await window.locator('.explorer-viewlet').waitFor();
		await shell.getByRole('button', { name: 'Return to Model', exact: true }).click();
		await sidebar.waitFor();
		await shell.locator('.ade-properties').getByRole('heading', { name: 'Pagamento rifiutato', exact: true }).waitFor();
		for (const [name, selector] of [['Debug', '.debug-viewlet'], ['Git', '.scm-viewlet']]) {
			await shell.getByRole('button', { name, exact: true }).click();
			await window.locator(selector).waitFor();
			await shell.getByRole('button', { name: 'Return to Model', exact: true }).click();
			await sidebar.waitFor();
			await shell.locator('.ade-properties').getByRole('heading', { name: 'Pagamento rifiutato', exact: true }).waitFor();
		}
		await window.screenshot({ path: path.join(evidence, 'visual-workbench.png') });
		await app.close();
		app = undefined;
		window = await launch();
		shell = window.locator('.ade-shell');
		sidebar = window.locator('.ade-sidebar');
		await sidebar.waitFor();
		await shell.getByRole('heading', { name: 'Esito pagamento', exact: true }).waitFor();
		await shell.locator('.ade-properties').getByRole('heading', { name: 'Pagamento rifiutato', exact: true }).waitFor();
		await sidebar.getByRole('button', { name: 'Struttura carrello', exact: true }).click();
		await shell.locator('.ade-properties').getByRole('heading', { name: 'Carrello', exact: true }).waitFor();
		await shell.getByRole('button', { name: 'Home', exact: true }).click();
		assert.equal(await shell.getByRole('button', { name: 'Create Project', exact: false }).isEnabled(), true);
		assert.equal(await shell.getByRole('button', { name: 'Import Codebase', exact: false }).isEnabled(), true);
		await window.screenshot({ path: path.join(evidence, 'home.png') });
		const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
		await window.keyboard.press(`${modifier}+Shift+P`);
		await window.locator('.quick-input-widget input').fill('>A.D.E: Open Home');
		await window.keyboard.press('Enter');
		await shell.getByRole('heading', { name: 'Your System, in Context', exact: true }).waitFor();
		await openModelFile(window, modelFile);
		await shell.getByRole('heading', { name: 'Percorso acquisto', exact: true }).waitFor();
		await sidebar.getByRole('button', { name: 'Esito pagamento', exact: true }).click();
		await shell.locator('.ade-canvas').getByRole('button', { name: 'Pagamento rifiutato', exact: true }).click();
		await app.close();
		app = undefined;
		window = await launch();
		shell = window.locator('.ade-shell');
		await shell.getByRole('heading', { name: 'Esito pagamento', exact: true }).waitFor();
		await shell.locator('.ade-properties').getByRole('heading', { name: 'Pagamento rifiutato', exact: true }).waitFor();
		await openModelFile(window, emptyFile);
		await shell.getByText('This project has no diagrams.', { exact: false }).waitFor();
		assert.equal(await shell.locator('.ade-node').count(), 0);
		await openModelFile(window, invalidFile);
		await shell.getByRole('alert').getByText('Expected:', { exact: false }).waitFor();
		assert.equal(await shell.locator('.ade-node').count(), 0);
		await shell.getByRole('button', { name: 'Retry', exact: true }).click();
		await shell.getByRole('alert').getByText('Expected:', { exact: false }).waitFor();
		await writeFile(invalidFile, JSON.stringify(checkoutModel));
		await shell.getByRole('heading', { name: 'Percorso acquisto', exact: true }).waitFor();
		const changed = structuredClone(checkoutModel);
		changed.views[0].name = 'Updated Purchase Diagram';
		await writeFile(invalidFile, JSON.stringify(changed));
		await shell.getByRole('heading', { name: 'Updated Purchase Diagram', exact: true }).waitFor();
		await window.screenshot({ path: path.join(evidence, 'external-update.png') });
		console.log('PASS: native sidebar, cross-feature diagrams, canvas, keyboard selection, technical views and persisted diagram context.');
		console.log('PASS: file model restore, empty model, validation error, retry and correlated external update.');
		await shell.getByRole('button', { name: 'Home', exact: true }).click();
		const newFolder = path.join(workspace, 'new-system');
		await mkdir(newFolder);
		await shell.getByRole('button', { name: 'Create Project', exact: true }).click();
		await enterValue(window, 'Name', 'Nuovo acquisto');
		await chooseFolder(window, newFolder);
		await shell.getByRole('heading', { name: 'Nuovo acquisto', exact: true }).waitFor();
		await shell.getByRole('button', { name: 'Add Feature', exact: true }).click();
		await enterValue(window, 'Name', 'Conferma acquisto');
		await shell.getByRole('heading', { name: 'Conferma acquisto · Structure', exact: true }).waitFor();
		await addElement(window, 'Actor', 'Cliente');
		await addElement(window, 'Interface', 'Checkout');
		await addElement(window, 'Controller', 'Conferma ordine');
		await addElement(window, 'Resource', 'Ordine');
		await connect(window, 'Cliente', 'Checkout', 'Invocation', 'Conferma acquisto', '');
		await connect(window, 'Checkout', 'Conferma ordine', 'Invocation', 'Invia', '');
		await connect(window, 'Conferma ordine', 'Ordine', 'Write', 'Crea ordine', 'pagamento autorizzato');
		await window.locator('.ade-sidebar').getByRole('button', { name: 'Conferma acquisto · Flow', exact: true }).click();
		for (const name of ['Richiedi pagamento', 'Ordine confermato', 'Pagamento rifiutato']) { await addElement(window, 'Action', name); }
		await connect(window, 'Richiedi pagamento', 'Ordine confermato', 'Invocation', 'Conferma ordine', 'pagamento autorizzato');
		await connect(window, 'Richiedi pagamento', 'Pagamento rifiutato', 'Invocation', 'Mostra errore', 'pagamento rifiutato');
		console.log('PASS: creates project, feature, structure and conditional success/refusal flow through native UI.');
		const moved = shell.locator('.ade-canvas').getByRole('button', { name: 'Ordine confermato', exact: true });
		await moved.click();
		const before = await moved.evaluate(element => parseFloat(element.style.left));
		await moved.focus();
		await window.keyboard.press('ArrowRight');
		assert.equal(await moved.evaluate(element => parseFloat(element.style.left)), before + 20);
		await window.keyboard.press(`${modifier}+z`);
		assert.equal(await moved.evaluate(element => parseFloat(element.style.left)), before);
		await shell.getByRole('button', { name: 'Redo', exact: true }).click();
		assert.equal(await moved.evaluate(element => parseFloat(element.style.left)), before + 20);
		await shell.getByRole('button', { name: 'Zoom Out', exact: true }).click();
		assert.equal(await shell.locator('.ade-canvas-content').evaluate(element => element.style.transform), 'scale(0.8)');
		await shell.getByRole('button', { name: 'Reset Zoom', exact: true }).click();
		const bounds = await moved.boundingBox();
		await window.mouse.move(bounds.x + 40, bounds.y + 40);
		await window.mouse.down();
		await window.mouse.move(bounds.x + 64, bounds.y + 72, { steps: 5 });
		await window.mouse.up();
		await shell.locator('.ade-canvas').getByRole('button', { name: 'Pagamento rifiutato', exact: true }).click();
		await shell.locator('.ade-properties').getByRole('button', { name: 'Delete Element', exact: true }).click();
		await window.locator('.monaco-dialog-box').getByRole('button', { name: 'Delete', exact: true }).click();
		assert.equal(await shell.locator('.ade-canvas .ade-node').count(), 2);
		await shell.getByRole('button', { name: 'Undo', exact: true }).click();
		await shell.locator('.ade-canvas').getByRole('button', { name: 'Pagamento rifiutato', exact: true }).waitFor();
		await window.keyboard.press(`${modifier}+s`);
		await shell.getByText('Saved', { exact: true }).waitFor();
		const projectFile = path.join(newFolder, '.ade/model.json');
		const saved = JSON.parse(await readFile(projectFile, 'utf8'));
		assert.deepEqual(validateSemanticModel(saved), []);
		assert.equal(saved.version, 3);
		assert.equal(saved.views.length, 2);
		assert.equal(saved.semantics.relations.length, 5);
		const flow = saved.views.find(view => view.kind === 'activity');
		const confirmed = saved.semantics.elements.find(element => element.name === 'Ordine confermato');
		assert.deepEqual(flow.nodes.find(node => node.elementId === confirmed.id), { elementId: confirmed.id, x: 304, y: 32 });
		assert.equal(await window.locator('.tabs-container .tab').filter({ hasText: 'model.json' }).count(), 0);
		await window.screenshot({ path: path.join(evidence, 'visual-editing.png') });
		await app.close();
		app = undefined;
		window = await launch();
		shell = window.locator('.ade-shell');
		await shell.getByRole('heading', { name: 'Conferma acquisto · Flow', exact: true }).waitFor();
		await shell.locator('.ade-canvas').getByRole('button', { name: 'Richiedi pagamento', exact: true }).click();
		await shell.locator('.ade-properties').getByRole('button', { name: 'Rename Element', exact: true }).click();
		await enterValue(window, 'Name', 'Pagamento aggiornato');
		await shell.locator('.ade-canvas').getByRole('button', { name: 'Pagamento aggiornato', exact: true }).waitFor();
		await shell.getByText('Unsaved Changes', { exact: true }).waitFor();
		const external = structuredClone(saved);
		external.name = 'External system';
		await writeFile(projectFile, JSON.stringify(external));
		await shell.getByRole('button', { name: 'Save', exact: true }).click();
		await shell.getByRole('alert').getByText('could not be saved', { exact: false }).waitFor();
		assert.equal(JSON.parse(await readFile(projectFile, 'utf8')).name, 'External system');
		console.log('PASS: native undo/redo, keyboard move, node drag, zoom, safe deletion, save/reopen and external save conflict.');
		await app.close();
		app = undefined;
		window = await launch();
		shell = window.locator('.ade-shell');
		await shell.locator('.ade-canvas').getByRole('button', { name: 'Pagamento aggiornato', exact: true }).waitFor();
		await shell.getByText('Unsaved Changes', { exact: true }).waitFor();
		assert.equal(JSON.parse(await readFile(projectFile, 'utf8')).name, 'External system');
		assert.equal(await window.locator('.tabs-container .tab').filter({ hasText: 'model.json' }).count(), 0);
		await shell.locator('summary').getByText('Project Options', { exact: true }).click();
		await shell.getByRole('button', { name: 'Reload Project', exact: true }).click();
		await window.locator('.monaco-dialog-box').getByRole('button', { name: 'Reload', exact: true }).click();
		await shell.getByText('External system · Design intent', { exact: true }).waitFor();
		await shell.getByText('Saved', { exact: true }).waitFor();
		console.log('PASS: unsaved backup recovery reopens the visual editor, with external file intact and explicit discard/reload.');
		await shell.locator('.ade-canvas').getByRole('button', { name: 'Richiedi pagamento', exact: true }).click();
		await shell.locator('.ade-properties').getByRole('button', { name: 'Rename Element', exact: true }).click();
		await enterValue(window, 'Name', 'Pagamento in copia');
		await shell.locator('.ade-canvas').getByRole('button', { name: 'Pagamento in copia', exact: true }).waitFor();
		await shell.getByText('Unsaved Changes', { exact: true }).waitFor();
		await shell.getByRole('button', { name: 'Save Project Copy', exact: true }).click();
		const copyPicker = window.locator('.quick-input-widget');
		await copyPicker.getByText('Save Project Copy', { exact: true }).waitFor();
		const copyFile = path.join(newFolder, 'copy.ade.json');
		await copyPicker.locator('input:visible').fill(newFolder + path.sep);
		await copyPicker.getByText('.ade', { exact: true }).waitFor();
		await copyPicker.locator('input:visible').fill(copyFile);
		await copyPicker.getByRole('button', { name: 'OK', exact: true }).click();
		await copyPicker.waitFor({ state: 'hidden' });
		await shell.getByText('Saved', { exact: true }).waitFor();
		assert.deepEqual(JSON.parse(await readFile(projectFile, 'utf8')), external, 'Save Copy preserves the source document');
		assert.ok(JSON.parse(await readFile(copyFile, 'utf8')).semantics.elements.some(element => element.name === 'Pagamento in copia'));
		await app.close();
		app = undefined;
		window = await launch();
		await window.locator('.ade-canvas').getByRole('button', { name: 'Pagamento in copia', exact: true }).waitFor();
		assert.equal(await window.locator('.tabs-container .tab').filter({ hasText: 'copy.ade.json' }).count(), 0);
		console.log('PASS: Save Project Copy preserves the original and restores the saved copy in the visual editor.');

		await app.close();
		app = undefined;
	}
	if (process.argv.includes('--native-only') || uxOnly || navigationOnly || sequenceOnly || stateOnly || impactOnly || projectsOnly || codeOnly || aiOnly) {
		console.log('PASS: native-only smoke completed without an Extension Development Host.');
	} else {
		await copyFile(path.join(root, 'ade/prototype/examples/checkout.diagram.json'), path.join(workspace, 'checkout.diagram.json'));
		await new Promise((resolve, reject) => {
			const child = spawn(executablePath, [...args, '--skip-welcome',
				`--extensionDevelopmentPath=${root}/ade/prototype`, `--extensionTestsPath=${root}/ade/prototype/host-test/index.cjs`],
			{ cwd: root, env: launchEnv, stdio: 'inherit' });
			const timer = setTimeout(() => { child.kill(); reject(new Error('Extension Host smoke timed out')); }, 120000);
			child.on('error', error => { clearTimeout(timer); reject(error); });
			child.on('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Extension Host exited with ${code}`)); });
		});
	}
} catch (error) {
	console.error(error);
	if (electronOutput) { console.error(electronOutput); }
	if (app) {
		for (const [index, window] of app.windows().entries()) {
			const state = await window.locator('.ade-shell, .quick-input-widget:visible, .notifications-toasts:visible').allInnerTexts().catch(() => []);
			console.error(`Workbench state ${index}: ${state.join('\n').slice(-10000)}`);
			await window.screenshot({ path: path.join(evidence, `failure-${index}.png`) }).catch(() => {});
		}
	}
	throw error;
} finally {
	try { await app?.close(); } finally {
		await rm(directory, { recursive: true, force: true });
		for (const callback of extraCleanup.reverse()) { await callback(); }
	}
}
