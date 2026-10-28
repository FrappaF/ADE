'use strict';
const vscode = require('vscode');
const {renderModel} = require('./model');
function activate(context) {
  context.subscriptions.push(vscode.commands.registerCommand('ade.open', async resource => {
    const selected = resource instanceof vscode.Uri ? [resource] : await vscode.window.showOpenDialog({canSelectMany: false, filters: {'Diagram model': ['json']}, defaultUri: vscode.Uri.joinPath(context.extensionUri, 'examples', 'checkout.diagram.json')});
    if (!selected) return;
    const document = await vscode.workspace.openTextDocument(selected[0]);
    let html;
    try { html = renderModel(JSON.parse(document.getText())); }
    catch (error) { vscode.window.showErrorMessage(`A.D.E: ${error.message}`); return; }
    const panel = vscode.window.createWebviewPanel('ade', 'A.D.E', vscode.ViewColumn.Beside, {enableScripts: false, localResourceRoots: []});
    panel.webview.html = html;
    const listener = vscode.workspace.onDidChangeTextDocument(event => {
      if (event.document.uri.toString() !== document.uri.toString()) return;
      try { panel.webview.html = renderModel(JSON.parse(event.document.getText())); }
      catch { /* Keep the last valid diagram while editing incomplete JSON. */ }
    });
    panel.onDidDispose(() => listener.dispose());
    return panel;
  }));
}
module.exports = {activate};
