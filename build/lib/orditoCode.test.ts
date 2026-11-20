import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isOrditoCodeInput } from './orditoCode.ts';

test('Ordito watcher covers native bundle inputs without watching generated outputs or dependencies', () => {
	for (const input of ['ordito/ai/implementation.ts', 'ordito/code-import/languages.ts', 'ordito/runtime/nativeHost.ts', 'ordito/ai/diagram-mcp.mjs', 'ordito/scripts/build-code-import.mjs', 'ordito/scripts/source-loader.mjs', 'ordito/runtime/package-lock.json', 'src/vs/workbench/contrib/ordito/common/modelStates.ts']) {
		assert.ok(isOrditoCodeInput(input), input);
		assert.ok(isOrditoCodeInput(input.replaceAll('/', '\\')), input);
	}
	for (const input of ['ordito/ai/test/collaboration.test.ts', 'ordito/runtime/node_modules/ajv/index.js', 'out/vs/workbench/contrib/ordito/node/orditoCodeEngine.js', 'ordito/docs/design.md', 'src/vs/workbench/contrib/ordito/browser/orditoProjectService.ts']) { assert.ok(!isOrditoCodeInput(input), input); }
});
