/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IMarker, MarkerSeverity } from '../../../../../platform/markers/common/markers.js';
import { ITerminalInstance } from '../../../terminal/browser/terminal.js';
import { TaskProblemMonitor } from '../../browser/taskProblemMonitor.js';
import { AbstractProblemCollector } from '../../common/problemCollectors.js';

suite('TaskProblemMonitor', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	test('retains distinct errors in one file and owner while deduplicating repeats', () => {
		const found = store.add(new Emitter<IMarker[]>());
		const terminalDisposed = store.add(new Emitter<ITerminalInstance>());
		const terminal = new class extends mock<ITerminalInstance>() { override instanceId = 1; override onDisposed = terminalDisposed.event; };
		const collector = new class extends mock<AbstractProblemCollector>() {
			override onDidFindErrors = found.event;
			override onDidRequestInvalidateLastMarker = Event.None;
			protected override async processLineInternal() { }
		};
		const monitor = store.add(new TaskProblemMonitor());
		monitor.addTerminal(terminal, collector);
		const first: IMarker = { owner: 'build', resource: URI.file('/project/a.ts'), severity: MarkerSeverity.Error, message: 'first', startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 2 };
		const second = { ...first, message: 'second', startLineNumber: 2, endLineNumber: 2 };
		found.fire([first, second, first]);
		const problems = monitor.getTaskProblems(1)!.get('build')!;
		assert.deepStrictEqual(problems.markers.map((marker, i) => [problems.resources[i].path, marker.message, marker.startLineNumber]), [['/project/a.ts', 'first', 1], ['/project/a.ts', 'second', 2]]);
		terminalDisposed.fire(terminal);
	});
});
