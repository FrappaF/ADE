/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const assert = require('node:assert/strict');
const vscode = require('vscode');

/** Runs only inside the built ADE Extension Development Host. */
async function run() {
	assert.ok(vscode.workspace.workspaceFolders?.length, 'The demonstration workspace must open');
	const prototype = vscode.extensions.all.find(extension => extension.packageJSON.name === 'ade');
	assert.ok(prototype, 'ADE prototype must be discovered');
	await prototype.activate();
	const commands = await vscode.commands.getCommands();
	assert.ok(commands.includes('ade.open'), 'Prototype command must be registered');
	assert.ok(commands.includes('ade.workbench.open'), 'Native ADE command must be registered');
	await vscode.commands.executeCommand('ade.workbench.open');
	assert.equal(vscode.window.tabGroups.activeTabGroup.activeTab?.label, 'A.D.E Home');
	const example = vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, 'checkout.ade.json');
	const document = await vscode.workspace.openTextDocument(example);
	assert.equal(JSON.parse(document.getText()).version, 2);
	await vscode.window.showTextDocument(document);
	await vscode.commands.executeCommand('ade.workbench.open');
	assert.equal(vscode.window.tabGroups.activeTabGroup.activeTab?.label, 'A.D.E Home');
}

module.exports = { run };
