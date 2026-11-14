/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { AdeInput } from '../../browser/adeInput.js';
import { AdeProjectService } from '../../browser/adeProjectService.js';
import { AdeStartup } from '../../browser/adeStartup.js';
import { checkoutModel } from '../../common/checkoutModel.js';

suite('A.D.E startup', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function restoredModel(): AdeInput {
		return store.add(new AdeInput(new class extends mock<AdeProjectService>() {
			override readonly onDidChange = Event.None;
		}()));
	}

	function start(editors: EditorInput[], activeEditor: EditorInput | undefined): number {
		let opened = 0;
		const service = new class extends mock<IEditorService>() {
			override readonly editors = editors;
			override readonly activeEditor = activeEditor;
			override async openEditor(): Promise<undefined> { opened++; return undefined; }
		}();
		new AdeStartup(service, new TestConfigurationService({ workbench: { startupEditor: 'adeHome' } }), new (mock<IWorkbenchEnvironmentService>())(), new class extends mock<AdeProjectService>() { override async restore(): Promise<void> { } override takeWorkspaceFilesRequest(): boolean { return false; } }(), new (mock<ICommandService>())());
		return opened;
	}

	test('retains a restored background tab caption until its actual project is ready', () => {
		let restoring = true;
		const input = store.add(new AdeInput(new class extends mock<AdeProjectService>() {
			override readonly onDidChange = Event.None;
			override get restoringContext(): boolean { return restoring; }
			override get model() { return checkoutModel; }
			override get section() { return 'home' as const; }
			override get error() { return undefined; }
			override get loading() { return false; }
		}()));
		assert.strictEqual(input.getName(), 'A.D.E Home');
		input.restoreName('Create Diagrams: architecture');
		assert.strictEqual(input.getName(), 'Create Diagrams: architecture');
		restoring = false;
		assert.strictEqual(input.getName(), 'A.D.E Home');
	});

	test('opens Home in a fresh window and preserves an active restored model', () => {
		const model = restoredModel();
		assert.deepStrictEqual([start([], undefined), start([model], model)], [1, 0]);
	});

	test('a late startup contribution preserves the resumed review while its model is in the background', () => {
		const model = restoredModel();
		const review = store.add(new class extends EditorInput {
			override readonly typeId = 'ade-test-review';
			override readonly resource = URI.parse('untitled:resumed-review');
		}());
		assert.strictEqual(start([model, review], review), 0);
	});

	test('Files handoff waits for model restoration before revealing its root', async () => {
		const restored = new DeferredPromise<void>(), revealed = new DeferredPromise<void>(), root = URI.parse('file:///qa-project');
		const calls: unknown[][] = [];
		const project = new class extends mock<AdeProjectService>() { override async restore(): Promise<void> { await restored.p; } override takeWorkspaceFilesRequest(): boolean { return true; } override get projectRoot(): URI { return root; } }();
		const commands = Object.assign(new (mock<ICommandService>())(), { executeCommand: async (id: string, ...args: unknown[]) => { calls.push([id, ...args]); if (id === 'revealInExplorer') { await revealed.complete(); } } });
		const editors = Object.assign(new (mock<IEditorService>())(), { editors: [restoredModel()] });
		new AdeStartup(editors, new TestConfigurationService(), new (mock<IWorkbenchEnvironmentService>())(), project, commands);
		assert.deepStrictEqual(calls, []); await restored.complete(); await revealed.p;
		assert.deepStrictEqual(calls, [['workbench.view.explorer'], ['revealInExplorer', root]]);
	});

	test('a transiently missing active editor does not reopen an existing model', () => {
		assert.strictEqual(start([restoredModel()], undefined), 0);
	});
});
