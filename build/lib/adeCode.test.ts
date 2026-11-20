import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAdeCodeInput } from './adeCode.ts';

test('ADE watcher covers native bundle inputs without watching generated outputs or dependencies', () => {
	for (const input of ['ade/ai/implementation.ts', 'ade/code-import/languages.ts', 'ade/runtime/nativeHost.ts', 'ade/ai/diagram-mcp.mjs', 'ade/scripts/build-code-import.mjs', 'ade/scripts/source-loader.mjs', 'ade/runtime/package-lock.json', 'src/vs/workbench/contrib/ade/common/modelStates.ts']) {
		assert.ok(isAdeCodeInput(input), input);
		assert.ok(isAdeCodeInput(input.replaceAll('/', '\\')), input);
	}
	for (const input of ['ade/ai/test/collaboration.test.ts', 'ade/runtime/node_modules/ajv/index.js', 'out/vs/workbench/contrib/ade/node/adeCodeEngine.js', 'ade/docs/design.md', 'src/vs/workbench/contrib/ade/browser/adeProjectService.ts']) { assert.ok(!isAdeCodeInput(input), input); }
});
