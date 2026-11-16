/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TerminalTaskSystem } from '../../browser/terminalTaskSystem.js';
import { CustomTask, RuntimeType } from '../../common/tasks.js';

suite('TerminalTaskSystem dependency failures', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function task() {
		return new CustomTask('parent', { kind: 'workspace', label: 'test', config: { file: 'tasks.json', index: 0, element: {} } }, 'parent', 'shell', { runtime: RuntimeType.Shell, name: 'parent' }, false, {}, { dependsOn: [{ uri: URI.file('/project'), task: 'missing' }] });
	}

	test('does not execute a parent when a dependency cannot be resolved', async () => {
		let executed = false;
		// Exercise dependency orchestration without constructing terminal UI services.
		const system = Object.assign(Object.create(TerminalTaskSystem.prototype), {
			_activeTasks: {}, _taskDependencies: {}, _showTaskLoadErrors() { }, _log() { }, _showOutput() { },
			_executeCommand: async () => { executed = true; return { exitCode: 0 }; }
		}) as TerminalTaskSystem;
		// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers
		const result = await system['_executeTask'](task(), { resolve: async () => undefined }, 'test', new Set(), new Map());
		assert.deepStrictEqual({ result, executed }, { result: { exitCode: 1 }, executed: false });
	});

	test('reports cancelled variable input as failure', async () => {
		const system = Object.assign(Object.create(TerminalTaskSystem.prototype), {
			_currentTask: {}, _contextService: { getWorkspace: () => ({ folders: [] }) }, _taskSystemInfoResolver() { },
			_collectTaskVariables() { }, _acquireInput: async () => undefined, _fireTaskEvent() { }
		}) as TerminalTaskSystem;
		// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers
		assert.deepStrictEqual(await system['_executeCommand'](task(), 'test', new Map()), { exitCode: 1 });
	});
});
