/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { IChannel, IPCClient } from '../../../../../base/parts/ipc/common/ipc.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ServiceIdentifier } from '../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IProgressService } from '../../../../../platform/progress/common/progress.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IShellEnvironmentService } from '../../../../services/environment/electron-browser/shellEnvironmentService.js';
import { IUtilityProcessWorker, IUtilityProcessWorkerWorkbenchService } from '../../../../services/utilityProcess/electron-browser/utilityProcessWorkerWorkbenchService.js';
import { IAdeOperationService } from '../../browser/adeOperationService.js';
import { IAdeProjectService } from '../../browser/adeProjectService.js';
import { IAdeProjectWorkspaceService } from '../../browser/adeProjectWorkspace.js';
import { adeCodeProtocolVersion, CodeBridgeProtocol, CodeContext } from '../../common/codeBridge.js';
import { checkoutModel } from '../../common/checkoutModel.js';
import { AdeCodeService } from '../../electron-browser/adeCodeService.js';

suite('A.D.E native code bridge compatibility', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const compatible: CodeBridgeProtocol = { version: adeCodeProtocolVersion, operations: ['diagramPrepare', 'diagramStep'] };
	function fixture(initial: CodeBridgeProtocol | undefined | Error) {
		const instantiation = store.add(new TestInstantiationService());
		const stub = <T extends object>(id: ServiceIdentifier<T>, values: object = {}) => instantiation.stub(id, Object.assign(new (mock<T>())(), values));
		let protocol = initial, created = 0, disposed = 0;
		const calls: string[] = [];
		const commands: string[] = [];
		const channel: IChannel = { listen: () => Event.None, async call<T>(command: string): Promise<T> {
			calls.push(command);
			if (command === 'protocol') { if (protocol instanceof Error) { throw protocol; } return protocol as T; }
			return '/cli/codex' as T;
		} };
		stub(IUtilityProcessWorkerWorkbenchService, { createWorker: async () => {
			created++;
			return Object.assign(new (mock<IUtilityProcessWorker>())(), { client: Object.assign(new (mock<IPCClient<string>>())(), { getChannel: () => channel }), onDidTerminate: new Promise<never>(() => {}), dispose: () => { disposed++; } });
		} });
		const model = structuredClone(checkoutModel);
		stub(IAdeProjectService, { onDidChange: Event.None, model });
		stub(IAdeOperationService, { onDidChange: Event.None });
		stub(IShellEnvironmentService, { getShellEnv: async () => ({ PATH: '/cli' }) });
		stub(IFileDialogService); stub(IQuickInputService); stub(INotificationService); stub(IProgressService); stub(IFileService); stub(IEditorService); stub(IAdeProjectWorkspaceService); stub(IConfigurationService);
		stub(ICommandService, { executeCommand: async (command: string) => { commands.push(command); } });
		const service = store.add(instantiation.createInstance(AdeCodeService));
		return { service, calls, commands, model, stats: () => ({ created, disposed }), setProtocol: (value: CodeBridgeProtocol) => { protocol = value; } };
	}
	for (const direction of [undefined, 'code', 'model'] as const) {
		test(`Sync ${direction ?? 'both'} builds the first diagrams before checking alignment`, async () => {
			const f = fixture(compatible);
			const context: CodeContext = { snapshot: '/project/.ade/imports/index', model: '/project/.ade/imports/index/model.ade.json', sourceRoot: '/project', revision: 'fixture', scope: { include: ['**'], exclude: [], excludedDirectories: [], respectGitignore: true, languageOverrides: {} }, files: [], declarations: [], dependencies: [], providers: [], diagnostics: [], diagramState: 'index' };
			f.service.context = context;
			await f.service.sync(direction);
			assert.deepStrictEqual({ commands: f.commands, calls: f.calls }, { commands: ['ade.ai.buildDiagrams'], calls: [] });
		});
	}
	test('checks the bundled engine before requests and reuses a compatible worker', async () => {
		const f = fixture(compatible);
		assert.strictEqual(await f.service.resolveCli('codex'), '/cli/codex');
		assert.strictEqual(await f.service.resolveCli('codex'), '/cli/codex');
		assert.deepStrictEqual({ calls: f.calls, ...f.stats() }, { calls: ['protocol', 'resolveCli', 'resolveCli'], created: 1, disposed: 0 });
	});
	const cases: [string, CodeBridgeProtocol | undefined | Error][] = [
		['old engine without metadata', undefined],
		['old worker without handshake', new Error('Invalid analysis request')],
		['different protocol version', { ...compatible, version: adeCodeProtocolVersion + 1 }],
		['missing diagram operation', { ...compatible, operations: ['diagramPrepare'] }]
	];
	for (const [name, protocol] of cases) {
		test(`explains ${name}, blocks execution and allows retry after repair`, async () => {
			const f = fixture(protocol);
			await assert.rejects(f.service.resolveCli('codex'), /analysis engine is out of date.*npm run build-fast.*fully quit/);
			assert.deepStrictEqual({ calls: f.calls, ...f.stats() }, { calls: ['protocol'], created: 1, disposed: 1 });
			f.setProtocol(compatible);
			assert.strictEqual(await f.service.resolveCli('codex'), '/cli/codex');
			assert.deepStrictEqual(f.calls, ['protocol', 'protocol', 'resolveCli']);
		});
	}
});
