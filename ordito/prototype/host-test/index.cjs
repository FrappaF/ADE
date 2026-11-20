'use strict';
const assert = require('node:assert/strict');
const vscode = require('vscode');

exports.run = async function () {
  const folder = vscode.workspace.workspaceFolders[0].uri;
  const resource = vscode.Uri.joinPath(folder, 'checkout.diagram.json');
  const document = await vscode.workspace.openTextDocument(resource);
  const extension = vscode.extensions.all.find(extension => extension.packageJSON.name === 'ordito');
  assert.ok(extension, 'The development extension must be installed');
  const api = await extension.activate();
  assert.equal(await vscode.commands.executeCommand('ordito.open', resource), undefined);
  const deadline = Date.now() + 10000;
  while (!(vscode.window.tabGroups.activeTabGroup.activeTab?.input instanceof vscode.TabInputWebview) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.ok(vscode.window.tabGroups.activeTabGroup.activeTab?.input instanceof vscode.TabInputWebview, 'The command must open a webview tab');
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  const panel = await api.openModel(resource);
  assert.ok(panel, 'The development extension must open a webview');
  assert.match(panel.webview.html, /Acquisto/);
  async function replace(text) {
    const edit = new vscode.WorkspaceEdit();
    edit.replace(resource, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), text);
    assert.equal(await vscode.workspace.applyEdit(edit), true);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const model = JSON.parse(document.getText());
  model.name = 'M0 updated checkout';
  await replace(JSON.stringify(model));
  assert.match(panel.webview.html, /M0 updated checkout/);
  const validHtml = panel.webview.html;
  await replace('{');
  assert.equal(panel.webview.html, validHtml, 'Incomplete JSON must preserve the last valid diagram');
  await replace(JSON.stringify(model));
  panel.dispose();
  console.log('PASS: development extension activation, example rendering, live update and incomplete JSON recovery.');
};
