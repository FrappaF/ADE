/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

// This unit suite injects the terminal/chat services. Load their DI tokens without
// pulling in the renderer widgets re-exported by those modules. No DOM globals are
// replaced; rendering, preload and real provider integration require desktop tests.
const root = fileURLToPath(new URL('../../', import.meta.url));
const decorator = pathToFileURL(resolve(root, 'out/vs/platform/instantiation/common/instantiation.js')).href;
const tokens = new Map([
	[pathToFileURL(resolve(root, 'out/vs/workbench/contrib/chat/browser/chat.js')).href, ['IChatWidgetService', 'chatWidgetService']],
	[pathToFileURL(resolve(root, 'out/vs/workbench/contrib/terminal/browser/terminal.js')).href, ['ITerminalService', 'terminalService', 'ITerminalGroupService', 'terminalGroupService']]
]);
registerHooks({
	load(url, context, next) {
		const token = tokens.get(url);
		if (token) {
			return { format: 'module', source: `import { createDecorator } from ${JSON.stringify(decorator)}; ${Array.from({ length: token.length / 2 }, (_, i) => `export const ${token[i * 2]} = createDecorator(${JSON.stringify(token[i * 2 + 1])});`).join(' ')} ${url.endsWith('/chat.js') ? "export const ChatViewPaneTarget = Symbol('ChatViewPaneTarget');" : ''}`, shortCircuit: true };
		}
		if (url.endsWith('.css')) { return { format: 'module', source: 'export {};', shortCircuit: true }; }
		return next(url, context);
	}
});
process.chdir(root);
process.argv.splice(2, process.argv.length - 2, '--run', 'src/vs/workbench/contrib/ade/test/electron-browser/adeAiService.test.ts', '--run', 'src/vs/workbench/contrib/ade/test/electron-browser/adeProjectWorkspace.test.ts');
await import('../../test/unit/node/index.js');
