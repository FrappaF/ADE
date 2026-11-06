/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { URI } from '../../../../../base/common/uri.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ServiceIdentifier } from '../../../../../platform/instantiation/common/instantiation.js';
import { IInputOptions, IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IProgressService } from '../../../../../platform/progress/common/progress.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceTrustRequestService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { IAgentHostService } from '../../../../../platform/agentHost/common/agentService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ICodexAccountService, ICodexAccountViewInfo } from '../../../../services/agentHost/browser/codexAccountService.js';
import { IAgentSdkSetupService } from '../../../../services/agentHost/browser/agentSdkSetupService.js';
import { IChatWidgetService } from '../../../chat/browser/chat.js';
import { ITerminalService, ITerminalGroupService } from '../../../terminal/browser/terminal.js';
import { IAdeProjectService } from '../../browser/adeProjectService.js';
import { IAdeCodeService } from '../../browser/adeCodeService.js';
import { IAdeOperationService, AdeOperationService } from '../../browser/adeOperationService.js';
import { CliAccountState, CodeContext, CodePreview, CodeRequest } from '../../common/codeBridge.js';
import { AdeAiService } from '../../electron-browser/adeAiService.js';
import { checkoutModel } from '../../common/checkoutModel.js';

interface Choice { label?: string; id?: string; provider?: string; maxCalls?: number; picked?: boolean }
const config = { version: 1, provider: 'codex', connection: 'cli', executable: 'codex', model: 'native-model', timeoutMs: 10000, maxContextBytes: 65536, maxCalls: 2 };

suite('A.D.E native AI orchestration', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	function fixture(configured = true, executable = 'codex', maxCalls = 2) {
		const instantiation = store.add(new TestInstantiationService());
		const stub = <T extends object>(id: ServiceIdentifier<T>, values: object) => { const service = Object.assign(new (mock<T>())(), values); instantiation.stub(id, service); return service; };
		const storage = store.add(new InMemoryStorageService());
		if (configured) { storage.store('ade.ai.cliConfig', JSON.stringify({ ...config, executable, maxCalls }), StorageScope.PROFILE, StorageTarget.MACHINE); }
		const changed = store.add(new Emitter<void>());
		const projectChanged = store.add(new Emitter<void>());
		const root = '/workspace/ade-ai-fixture';
		const context: CodeContext = { snapshot: root + '/.ade/imports/fixture', model: root + '/.ade/imports/fixture/model.ade.json', sourceRoot: root, revision: 'fixture',
			scope: { include: ['**'], exclude: [], excludedDirectories: ['.ade'], respectGitignore: true, languageOverrides: {} },
			files: [{ path: 'checkout.mjs', language: 'javascript', status: 'parsed', diagnostics: [] }],
			declarations: [{ id: 'checkout-controller', sourceId: 'checkout-controller', name: 'Checkout', kind: 'action', evidence: { file: 'checkout.mjs', revision: 'fixture', start: 0, end: 10, line: 1, endLine: 1 } }], dependencies: [], providers: [], diagnostics: [] };
		let accountState: CliAccountState = { status: 'signedIn' };
		let resolveExecutable: (executable: string) => Promise<string | undefined> = async executable => executable;
		const opened: CodeContext[] = [];
		const code = { changed: false, openContext: async (value: CodeContext) => { opened.push(value); }, context, onDidChange: changed.event, executeCollaboration: async (input: string) => execute(input), executeReconciliation: async (request: CodeRequest) => execute(JSON.stringify(request)), resolveCli: (executable: string) => resolveExecutable(executable), checkCliAccount: async () => accountState };
		const picks: ((items: readonly Choice[]) => Choice | Choice[] | undefined)[] = [];
		const inputs: string[] = [];
		const inputOptions: IInputOptions[] = [];
		const chats: { resource: string; attachments: string[]; focused: boolean }[] = [];
		const pickerTitles: string[] = [];
		const editorInputs: object[] = [];
		let confirmed = true, failDiagram = false, hiddenPanels = 0, closedAlerts = 0;
		const dialogDetails: string[] = [];
		const attachmentFiles = new Map<string, URI[]>();
		const deletedAttachments: string[] = [];
		const diagramContexts: string[] = [];
		const errors: string[] = [];
		const infos: string[] = [];
		const terminals: object[] = [];
		const requests: string[] = [];
		let signIns = 0, disabled = false;
		let terminalError: Error | undefined;
		let terminalFocus: Promise<void> = Promise.resolve();
		const focusRequested = new DeferredPromise<void>();
		const terminalExit = store.add(new Emitter<number>());
		const account: { status: ICodexAccountViewInfo['status']; authUrl?: string } = { status: 'signedOut' };
		const accountChanged = store.add(new Emitter<ICodexAccountViewInfo>());
		let trust: Promise<boolean> | undefined;
		const setups: { agent: string; download: string }[] = [];
		instantiation.stub(IStorageService, storage);
		const operations = store.add(new AdeOperationService());
		instantiation.stub(IAdeOperationService, operations);
		const project = { model: structuredClone(checkoutModel), modelUri: URI.file(context.model), onDidChange: projectChanged.event, save: async () => true };
		const projectService = stub(IAdeProjectService, project);
		const codeService = stub(IAdeCodeService, code);
		stub(IQuickInputService, { pick: async (items: Choice[], options?: { title: string }) => { if (options) { pickerTitles.push(options.title); } return picks.shift()?.(items); }, input: async (options?: IInputOptions) => { if (options) { inputOptions.push(options); } return inputs.shift(); } });
		stub(INotificationService, { notify: (notification: { message: string }) => { errors.push(notification.message); return { close: () => { closedAlerts++; } }; }, error: (message: string) => errors.push(message), info: (message: string) => infos.push(message) });
		stub(IProgressService, { withProgress: async (_options: object, task: () => Promise<void>) => task() });
		stub(IDialogService, { confirm: async (options: { detail: string }) => { dialogDetails.push(options.detail); return { confirmed }; } });
		stub(IFileService, { createFolder: async () => {}, writeFile: async () => {} });
		stub(IEditorService, { openEditor: async (input: object) => { editorInputs.push(input); return undefined; } });
		stub(ITerminalService, { createTerminal: async (options: { config: object }) => { if (terminalError) { throw terminalError; } terminals.push({ config: options.config }); return { focusWhenReady: async () => { await focusRequested.complete(); await terminalFocus; }, onExit: terminalExit.event }; }, setActiveInstance: () => {} });
		stub(ITerminalGroupService, { showPanel: async () => {}, hidePanel: () => { hiddenPanels++; } });
		stub(IChatWidgetService, { openSession: async (resource: URI) => { const chat = { resource: resource.toString(), attachments: [] as string[], focused: false }; chats.push(chat); return { attachmentModel: { get fileAttachments() { return attachmentFiles.get(resource.toString()) ?? []; }, delete: (id: string) => { deletedAttachments.push(id); attachmentFiles.set(resource.toString(), (attachmentFiles.get(resource.toString()) ?? []).filter(uri => uri.toString() !== id)); }, addFile: async (uri: URI) => { chat.attachments.push(uri.toString()); attachmentFiles.set(resource.toString(), [...(attachmentFiles.get(resource.toString()) ?? []), uri]); }, updateContext: (_deleted: string[], entries: { value: string }[]) => { diagramContexts.push(entries[0].value); } }, setInputPlaceholder: () => {}, focusInput: () => { chat.focused = true; } }; } });
		stub(ICodexAccountService, { account, onDidChangeAccount: accountChanged.event, signIn: () => signIns++ });
		stub(IAgentSdkSetupService, { setups, requestReload: () => {} });
		stub(IAgentHostService, { rootState: { value: { agents: [{ provider: 'codex', models: [{ id: '@provider=openai:native-model', name: 'Native Account', provider: 'codex' }, { id: '@provider=vscode-proxy:proxy-model', name: 'Other Account', provider: 'codex' }] }] } } });
		stub(IConfigurationService, { getValue: (key: string) => key === 'chat.disableAIFeatures' ? disabled : undefined, updateValue: async () => {} });
		stub(IWorkspaceTrustRequestService, { requestWorkspaceTrust: async () => trust ?? true });
		const session = { id: '11111111-1111-4111-8111-111111111111', root, worktree: root + '/.ade/worktrees/fixture', reviewId: 'changes', status: 'staged', generated: { summary: 'Payment refusal', files: [{ file: 'checkout.mjs', content: 'export const result = false;' }] }, before: [{ file: 'checkout.mjs', content: 'export const result = true;' }], usage: { inputTokens: 10, outputTokens: 20 }, cost: null };
		const execute = async (input: string) => {
				const request: { operation: string } = JSON.parse(input); requests.push(request.operation);
				switch (request.operation) {
					case 'prepare': return JSON.stringify({ reviewId: 'context', request: { snapshot: context.snapshot }, context: { sources: [{ file: 'checkout.mjs' }] } });
					case 'plan': return JSON.stringify({ planId: 'plan', plan: { summary: 'Payment refusal', questions: [], steps: [{ description: 'Implement refusal' }], changes: [{ file: 'checkout.mjs', kind: 'modify', reason: 'Handle refused payments' }] } });
					case 'stage': return JSON.stringify(session);
					case 'verify': return JSON.stringify({ ...session, status: 'passed', verification: { code: 0, output: 'Passed', durationMs: 1 } });
					case 'apply': return JSON.stringify({ ...session, status: 'applied' });
					case 'undo': return JSON.stringify({ ...session, status: 'undone' });
					case 'diagramPrepare': return JSON.stringify({ id: 'diagram-job', sourceRoot: root, reviewId: 'diagram-scope', status: 'ready', completed: 0, total: 2, calls: 0, symbols: 1, files: 1, model: 'economical-diagrams', questions: [], excluded: 0 });
					case 'diagramStep': if (failDiagram) { throw new Error('Provider Offline'); } return JSON.stringify({ id: 'diagram-job', sourceRoot: root, reviewId: 'diagram-scope', status: 'complete', completed: 2, total: 2, calls: 2, symbols: 1, files: 1, model: 'economical-diagrams', questions: [], excluded: 0, context: { ...context, diagramState: 'diagrams' } });
					case 'reconciliationPrepare': return JSON.stringify({ reviewId: 'reconcile-context', contents: '{"prompt":"reviewed"}', metrics: { inputBytes: 1000, schemaBytes: 100, sourceBytes: 8000, disclosedBytes: 500, estimatedTokens: 275 } });
					case 'reconciliationPropose': return JSON.stringify({ token: 'proposal', context, ai: { summary: 'Reconcile payment', questions: [] } });
					default: throw new Error('Unexpected fixture operation');
				}
		};
		const service = store.add(instantiation.createInstance(AdeAiService));
		return { service, operations, opened, chats, deletedAttachments, diagramContexts, setCodeChanged: (value: boolean) => { Object.assign(codeService, { changed: value }); }, setModelUri: (value: URI) => { Object.assign(projectService, { modelUri: value }); }, dialogDetails, pickerTitles, editorInputs, project, projectChanged, get hiddenPanels() { return hiddenPanels; }, get closedAlerts() { return closedAlerts; }, setConfirmed: (value: boolean) => { confirmed = value; }, failDiagram: (value = true) => { failDiagram = value; }, setAccountState: (value: CliAccountState) => { accountState = value; }, storage, picks, inputs, inputOptions, errors, infos, terminals, requests, setups, code, changed, root, get signIns() { return signIns; }, disable: () => { disabled = true; }, holdTrust: (pending: Promise<boolean>) => { trust = pending; },
			holdTerminalFocus: (pending: Promise<void>) => { terminalFocus = pending; }, focusRequested: focusRequested.p, exitTerminal: () => terminalExit.fire(0),
			publishAccount: (value: ICodexAccountViewInfo) => { Object.assign(account, { authUrl: undefined }, value); accountChanged.fire(account); }, failTerminal: (error: Error) => { terminalError = error; },
			setCliResolver: (resolver: typeof resolveExecutable) => { resolveExecutable = resolver; } };
	}
	test('primary Codex chat uses the connected CLI account without model setup', async () => {
		const f = fixture(false);
		await f.service.chat();
		assert.equal(f.terminals.length, 1);
		assert.equal(f.signIns, 0);
		assert.deepStrictEqual(f.requests, []);
		assert.equal(f.errors.length, 0);
	});
	test('native Codex chat opens in the chat pane and focuses input', async () => {
		const f = fixture();
		f.publishAccount({ status: 'signedIn' });
		f.setCliResolver(async () => undefined);
		f.setups.push({ agent: 'codex', download: 'ready' });
		await f.service.chat();
		assert.equal(f.chats.length, 1);
		assert.equal(f.chats[0].focused, true);
		assert.equal(f.terminals.length, 0);
		assert.deepStrictEqual(f.requests, []);
	});
	test('transient CLI account errors do not start another login', async () => {
		const f = fixture(); f.setAccountState({ status: 'error', reason: 'timeout' });
		await f.service.chat();
		assert.equal(f.terminals.length, 0); assert.equal(f.signIns, 0);
	});
	test('diagram generation uses a separate model, reviews its full budget and opens the published model', async () => {
		const f = fixture(); f.picks.push(items => items[0]);
		await f.service.buildDiagrams();
		assert.deepStrictEqual(f.requests, ['diagramPrepare', 'diagramStep']);
		assert.equal(f.opened[0].diagramState, 'diagrams');
		assert.equal(f.service.diagramProgress?.status, 'complete');
		assert.ok(f.dialogDetails[0].includes('2 additional requests'));
		assert.equal(f.errors.length, 0);
	});
	test('zero-budget diagram generation prepares scope without inference', async () => {
		const f = fixture(true, 'codex', 0); f.picks.push(items => items[0]);
		await f.service.buildDiagrams();
		assert.deepStrictEqual(f.requests, ['diagramPrepare']); assert.equal(f.opened.length, 0);
	});
	test('first diagram generation asks for a model once and skips coding setup', async () => {
		const f = fixture(false); f.picks.push(items => items[0]);
		await f.service.buildDiagrams();
		assert.deepStrictEqual(f.pickerTitles, ['Model for Diagrams']);
		assert.deepStrictEqual(f.requests, ['diagramPrepare', 'diagramStep']);
		assert.equal(f.infos.length, 0); assert.equal(f.errors.length, 0);
		assert.equal(f.opened.length, 1);
	});
	test('cancelling first model selection leaves the codebase available without inference', async () => {
		const f = fixture(false);
		await f.service.buildDiagrams();
		assert.deepStrictEqual(f.requests, []); assert.equal(f.errors.length, 0);
		assert.match(f.service.workflowStatus!, /No Model Selected/);
	});
	test('first setup still requires disclosure approval before inference', async () => {
		const f = fixture(false); f.picks.push(items => items[0]); f.setConfirmed(false);
		await f.service.buildDiagrams();
		assert.deepStrictEqual(f.requests, ['diagramPrepare']); assert.equal(f.opened.length, 0);
	});
	test('Codex reuses the same terminal until exit and exposes a route back to diagrams', async () => {
		const f = fixture();
		await f.service.chat(); await f.service.chat();
		assert.equal(f.terminals.length, 1); assert.equal(f.service.chatLocation, 'terminal');
		f.setCodeChanged(true); await f.service.returnToDiagrams();
		assert.equal(f.hiddenPanels, 1); assert.equal(f.editorInputs.length, 1);
		assert.match(f.service.workflowStatus!, /Code Changed/);
		f.exitTerminal(); await f.service.chat(); assert.equal(f.terminals.length, 2);
	});
	test('native chat reopens its conversation and attaches only the current model', async () => {
		const f = fixture(); f.publishAccount({ status: 'signedIn' }); f.setups.push({ agent: 'codex', download: 'ready' });
		await f.service.chat(); await f.service.chat();
		assert.equal(f.chats[0].resource, f.chats[1].resource);
		assert.equal(f.chats[0].attachments.length, 1); assert.equal(f.chats[1].attachments.length, 0);
		const currentModel = URI.file(f.root + '/new-snapshot/model.ade.json'); f.setModelUri(currentModel); await f.service.chat();
		assert.deepStrictEqual(f.chats[2].attachments, [currentModel.toString()]);
		assert.equal(f.chats[2].resource, f.chats[0].resource);
		assert.deepStrictEqual(f.deletedAttachments, [URI.file(f.code.context.model).toString()]);
		assert.equal(JSON.parse(f.diagramContexts[2]).model, currentModel.fsPath);
	});
	test('failed diagram generation keeps actionable progress for resume', async () => {
		const f = fixture(); f.picks.push(items => items[0]); f.failDiagram();
		await f.service.buildDiagrams();
		assert.equal(f.service.diagramProgress?.status, 'failed');
		assert.equal(f.service.diagramProgress?.error, 'Provider Offline');
		assert.equal(f.service.diagramProgress?.completed, 0); assert.equal(f.opened.length, 0);
		f.failDiagram(false); await f.service.resumeDiagrams();
		assert.equal(f.closedAlerts, 1); assert.equal(f.opened.length, 1);
	});
	test('manual model edits clear stale completion messages', async () => {
		const f = fixture(); await f.service.chat();
		assert.ok(f.service.workflowStatus); f.projectChanged.fire(); assert.equal(f.service.workflowStatus, undefined);
	});
	test('constructing the visual service does not request inference', () => {
		const f = fixture();
		assert.deepStrictEqual(f.requests, []);
	});
	test('bidirectional Sync reviews selected context and returns one proposal without applying source changes', async () => {
		const f = fixture();
		f.picks.push(items => [items[0]]);
		const preview: CodePreview = { token: 'preview', context: f.code.context, files: { added: [], changed: ['checkout.mjs'], removed: [], unchanged: [] }, declarations: { added: [], changed: [], removed: [] }, dependencies: { added: [], changed: [], removed: [] }, conflicts: [], impact: { elementIds: [], viewIds: [] }, parsed: [], reused: [], semanticAnalyzed: [], semanticReused: [] };
		const result = await f.service.reconcile(preview);
		assert.deepStrictEqual({ requests: f.requests, token: result?.token, errors: f.errors }, { requests: ['reconciliationPrepare', 'reconciliationPropose'], token: 'proposal', errors: [] });
	});
	test('zero-call Sync budget prepares context without making an inference request', async () => {
		const f = fixture(true, 'codex', 0);
		f.picks.push(items => [items[0]]);
		const preview: CodePreview = { token: 'preview', context: f.code.context, files: { added: [], changed: [], removed: [], unchanged: [] }, declarations: { added: [], changed: [], removed: [] }, dependencies: { added: [], changed: [], removed: [] }, conflicts: [], impact: { elementIds: [], viewIds: [] }, parsed: [], reused: [], semanticAnalyzed: [], semanticReused: [] };
		await f.service.reconcile(preview);
		assert.deepStrictEqual({ requests: f.requests, errors: f.errors }, { requests: ['reconciliationPrepare'], errors: [] });
	});
	test('an authenticated CLI is recognized without native account login or inference', async () => {
		const f = fixture();
		await f.service.refreshConnection();
		assert.match(f.service.connectionStatus, /CLI Account Connected.*native-model/);
		assert.deepStrictEqual({ signIns: f.signIns, terminals: f.terminals, requests: f.requests }, { signIns: 0, terminals: [], requests: [] });
	});
	test('logout blocks inference and a later external login is recognized on refresh', async () => {
		const f = fixture();
		f.setAccountState({ status: 'signedOut' });
		await f.service.implement();
		assert.match(f.service.connectionStatus, /Requires Sign-In/);
		assert.deepStrictEqual(f.requests, []);
		f.setAccountState({ status: 'signedIn' });
		await f.service.refreshConnection();
		assert.match(f.service.connectionStatus, /Connected/);
	});
	test('unknown CLI status is reported as an error instead of asking for a new login', async () => {
		const f = fixture(); f.setAccountState({ status: 'error', reason: 'unsupported' });
		await f.service.implement();
		assert.match(f.service.connectionStatus, /Could Not Verify.*unsupported/);
		assert.deepStrictEqual({ signIns: f.signIns, requests: f.requests }, { signIns: 0, requests: [] });
	});
	test('project operations block concurrent AI commands until released', async () => {
		const f = fixture(); const operation = f.operations.acquire('code')!;
		try { await f.service.implement(); assert.deepStrictEqual(f.requests, []); assert.match(f.infos.at(-1)!, /already running/); }
		finally { operation.dispose(); }
	});
	test('session prerequisites are explained for review, apply, undo and recovery', async () => {
		const f = fixture();
		await f.service.review(); await f.service.apply(); await f.service.undo(); await f.service.recover();
		assert.deepStrictEqual(f.requests, []);
		assert.match(f.infos.join('\n'), /No Implementation Is Open/);
		assert.match(f.infos.join('\n'), /Apply Requires Passing Tests/);
		assert.match(f.infos.join('\n'), /No Saved Implementation/);
	});
	test('zero budget prepares local context without requiring a CLI or making an AI request', async () => {
		const f = fixture(true, 'codex', 0);
		f.setCliResolver(async () => { throw new Error('No CLI lookup should be needed'); });
		f.picks.push(items => items.find(item => item.id === 'purchase'), items => [...items]); f.inputs.push('Handle refusal');
		await f.service.implement();
		assert.deepStrictEqual({ requests: f.requests, errors: f.errors }, { requests: ['prepare'], errors: [] });
		assert.match(f.service.status, /No AI Request Was Made/);
	});
	test('one-run budget reports that the plan is ready without silently stopping before generation', async () => {
		const f = fixture(true, 'codex', 1);
		f.picks.push(items => items.find(item => item.id === 'purchase'), items => [...items]); f.inputs.push('Handle refusal');
		await f.service.implement();
		assert.deepStrictEqual(f.requests, ['prepare', 'plan']);
		assert.match(f.service.status, /Plan Ready.*One-Run Budget/);
	});
	test('a login that exits before terminal focus still refreshes the CLI account', async () => {
		const f = fixture(false); const focus = new DeferredPromise<void>();
		f.setAccountState({ status: 'signedOut' }); f.holdTerminalFocus(focus.p);
		f.picks.push(items => items.find(item => item.provider === 'codex'), items => items.find(item => item.id === 'cliLogin'));
		const connecting = f.service.connect();
		await f.focusRequested;
		f.setAccountState({ status: 'signedIn' }); f.exitTerminal();
		await focus.complete(); await connecting;
		assert.match(f.service.connectionStatus, /CLI Account Connected/);
		assert.deepStrictEqual(f.requests, []);
	});
	test('model selection decodes the native Codex account ID and saves an explicit request budget', async () => {
		const f = fixture(false);
		f.picks.push(items => items.find(item => item.provider === 'codex'), items => items.find(item => item.id === 'configure'), items => {
			assert.deepStrictEqual(items.map(item => item.id), ['native-model']); return items[0];
		}, items => items.find(item => item.maxCalls === 1));
		f.inputs.push('codex');
		await f.service.connect();
		const saved = JSON.parse(f.storage.get('ade.ai.cliConfig', StorageScope.PROFILE)!);
		assert.deepStrictEqual({ model: saved.model, connection: saved.connection, maxCalls: saved.maxCalls }, { model: 'native-model', connection: 'cli', maxCalls: 1 });
	});
	test('a model ID cannot be saved as the CLI executable', async () => {
		const f = fixture(false);
		f.setCliResolver(async executable => executable === 'codex' ? '/installed/codex' : undefined);
		f.picks.push(items => items.find(item => item.provider === 'codex'), items => items.find(item => item.id === 'configure'), items => items[0]);
		f.inputs.push('codex-terra-5.6');
		await f.service.connect();
		assert.strictEqual(f.storage.get('ade.ai.cliConfig', StorageScope.PROFILE), undefined);
		assert.match(f.errors[0], /model ID belongs in the Model field/i);
		assert.ok(!f.pickerTitles.some(title => title.startsWith('Agent Run Budget')));
		const field = f.inputOptions.find(options => options.title === 'Original CLI Executable')!;
		assert.match(field.prompt!, /not a model ID/);
		assert.ok(await field.validateInput!('codex-terra-5.6'));
		assert.strictEqual(await field.validateInput!('codex'), undefined);
	});

	test('an invalid saved executable can use installed Codex while preserving both model settings', async () => {
		const f = fixture(true, 'codex-terra-5.6');
		f.storage.store('ade.ai.diagramModel.codex', 'economical-diagram-model', StorageScope.PROFILE, StorageTarget.MACHINE);
		f.setCliResolver(async executable => executable === 'codex' ? '/installed/codex' : undefined);
		f.picks.push(items => items.find(item => item.id === 'installed'));
		await f.service.buildDiagrams();
		const saved = JSON.parse(f.storage.get('ade.ai.cliConfig', StorageScope.PROFILE)!);
		assert.deepStrictEqual([saved.executable, saved.model, f.storage.get('ade.ai.diagramModel.codex', StorageScope.PROFILE)], ['codex', 'native-model', 'economical-diagram-model']);
		assert.deepStrictEqual(f.requests, ['diagramPrepare', 'diagramStep']);
		assert.deepStrictEqual([f.errors, f.terminals, f.signIns], [[], [], 0]);
		assert.ok(f.pickerTitles.includes('Repair CLI Executable'));
	});

	test('cancelling executable repair keeps settings and starts no inference', async () => {
		const f = fixture(true, 'codex-terra-5.6');
		f.setCliResolver(async executable => executable === 'codex' ? '/installed/codex' : undefined);
		await f.service.buildDiagrams();
		assert.strictEqual(JSON.parse(f.storage.get('ade.ai.cliConfig', StorageScope.PROFILE)!).executable, 'codex-terra-5.6');
		assert.deepStrictEqual([f.requests, f.terminals, f.errors], [[], [], []]);
	});

	test('executable repair accepts a validated custom path without changing the model', async () => {
		const f = fixture(true, 'codex-terra-5.6');
		f.setCliResolver(async executable => executable === 'codex' || executable === '/custom account/codex' ? executable : undefined);
		f.picks.push(items => items.find(item => item.id === 'choose'));
		f.inputs.push(' /custom account/codex ');
		await f.service.openCli();
		const saved = JSON.parse(f.storage.get('ade.ai.cliConfig', StorageScope.PROFILE)!);
		assert.deepStrictEqual([saved.executable, saved.model], ['/custom account/codex', 'native-model']);
		assert.deepStrictEqual(f.terminals, [{ config: { name: 'Codex', executable: '/custom account/codex', args: ['--model', 'native-model'], cwd: f.root } }]);
	});

	test('Codex uses native ChatGPT sign-in when ready and the official CLI login otherwise', async () => {
		const f = fixture(false);
		f.setups.push({ agent: 'codex', download: 'ready' });
		f.picks.push(items => items.find(item => item.provider === 'codex'), items => items.find(item => item.id === 'login'));
		await f.service.connect();
		assert.deepStrictEqual({ signIns: f.signIns, terminals: f.terminals }, { signIns: 1, terminals: [] });
		f.setups.length = 0;
		f.picks.push(items => items.find(item => item.provider === 'codex'), items => items.find(item => item.id === 'login'));
		await f.service.connect();
		assert.deepStrictEqual(f.terminals, [{ config: { name: 'Codex Login', executable: 'codex', args: ['login'], cwd: f.root } }]);
	});
	test('Claude login runs its original CLI in the integrated terminal', async () => {
		const f = fixture(false);
		f.picks.push(items => items.find(item => item.provider === 'claude'), items => items.find(item => item.id === 'login'));
		await f.service.connect();
		assert.deepStrictEqual({ signIns: f.signIns, terminals: f.terminals }, { signIns: 0, terminals: [{ config: { name: 'Claude Code', executable: 'claude', args: ['auth', 'login'], cwd: f.root } }] });
	});
	test('native flow suggests files from model evidence and gates application on passing verification', async () => {
		const f = fixture();
		f.picks.push(items => items.find(item => item.id === 'purchase'), items => { assert.strictEqual(items[0].picked, true); return [...items]; });
		f.inputs.push('Handle payment refusal');
		await f.service.implement();
		assert.deepStrictEqual({ errors: f.errors, requests: f.requests, verify: f.service.canVerify, apply: f.service.canApply }, { errors: [], requests: ['prepare', 'plan', 'stage'], verify: true, apply: false });
		await f.service.apply();
		assert.deepStrictEqual(f.requests, ['prepare', 'plan', 'stage']);
		await f.service.verify();
		assert.strictEqual(f.service.canApply, true);
		await f.service.apply();
		assert.strictEqual(f.service.canUndo, true);
		await f.service.undo();
		assert.deepStrictEqual({ errors: f.errors, requests: f.requests, undo: f.service.canUndo }, { errors: [], requests: ['prepare', 'plan', 'stage', 'verify', 'apply', 'undo'], undo: false });
	});
	test('disabling AI prevents CLI launches and inference requests', async () => {
		const f = fixture(); f.disable();
		await f.service.openCli(); await f.service.implement();
		assert.deepStrictEqual({ terminals: f.terminals, requests: f.requests }, { terminals: [], requests: [] });
	});
	test('concurrent commands cannot start a second workflow while workspace trust is pending', async () => {
		const f = fixture();
		const trust = new DeferredPromise<boolean>(); f.holdTrust(trust.p);
		f.picks.push(items => items.find(item => item.id === 'purchase'), items => [...items]);
		f.inputs.push('Handle payment refusal');
		const first = f.service.implement();
		await f.service.implement();
		assert.strictEqual(f.service.busy, true);
		assert.deepStrictEqual(f.requests, []);
		await trust.complete(true); await first;
		assert.deepStrictEqual({ requests: f.requests, errors: f.errors }, { requests: ['prepare', 'plan', 'stage'], errors: [] });
	});
	test('an explicitly selected Codex executable owns its login even when another native SDK is ready', async () => {
		const f = fixture(true, '/custom/codex');
		f.setups.push({ agent: 'codex', download: 'ready' });
		f.picks.push(items => items.find(item => item.provider === 'codex'), items => items.find(item => item.id === 'login'));
		await f.service.connect();
		assert.deepStrictEqual({ signIns: f.signIns, terminals: f.terminals }, { signIns: 0, terminals: [{ config: { name: 'Codex Login', executable: '/custom/codex', args: ['login'], cwd: f.root } }] });
	});
	test('missing Codex shows installation and PATH instructions before any sign-in attempt', async () => {
		const f = fixture(false);
		f.setCliResolver(async () => undefined);
		f.setups.push({ agent: 'codex', download: 'ready' });
		f.picks.push(items => items.find(item => item.provider === 'codex'), items => items.find(item => item.id === 'login'));
		await f.service.connect();
		assert.deepStrictEqual({ signIns: f.signIns, terminals: f.terminals, requests: f.requests, errors: f.errors.length }, { signIns: 0, terminals: [], requests: [], errors: 1 });
		assert.match(f.errors[0], /npm install -g @openai\/codex/);
		assert.match(f.service.status, /absolute executable path/);
	});
	test('missing Claude shows its official installation instructions', async () => {
		const f = fixture(false);
		f.setCliResolver(async () => undefined);
		f.picks.push(items => items.find(item => item.provider === 'claude'), items => items.find(item => item.id === 'login'));
		await f.service.connect();
		assert.match(f.errors[0], /https:\/\/code.claude.com\/docs\/en\/setup/);
		assert.deepStrictEqual(f.terminals, []);
	});
	test('Open AI CLI reports a missing executable instead of opening a broken terminal', async () => {
		const f = fixture();
		f.setCliResolver(async () => undefined);
		await f.service.openCli();
		assert.deepStrictEqual({ terminals: f.terminals, errors: f.errors.length }, { terminals: [], errors: 1 });
	});
	test('CLI sign-in uses the resolved executable and confirms where to finish login', async () => {
		const f = fixture(false);
		f.setCliResolver(async () => '/installed path/codex');
		f.setups.push({ agent: 'codex', download: 'ready' });
		f.picks.push(items => items.find(item => item.provider === 'codex'), items => items.find(item => item.id === 'cliLogin'));
		await f.service.connect();
		assert.deepStrictEqual({ signIns: f.signIns, terminals: f.terminals }, { signIns: 0, terminals: [{ config: { name: 'Codex Login', executable: '/installed path/codex', args: ['login'], cwd: f.root } }] });
		assert.match(f.infos[0], /integrated terminal/);
	});
	test('an already signed-in native account gives feedback without requesting another login', async () => {
		const f = fixture(false);
		f.publishAccount({ status: 'signedIn' });
		f.setups.push({ agent: 'codex', download: 'ready' });
		f.picks.push(items => items.find(item => item.provider === 'codex'), items => items.find(item => item.id === 'login'));
		await f.service.connect();
		assert.deepStrictEqual({ signIns: f.signIns, infos: f.infos.length }, { signIns: 0, infos: 1 });
		assert.match(f.service.status, /already signed in/);
	});
	test('native login reports progress, browser handoff and success without a late timeout', async () => {
		const clock = sinon.useFakeTimers();
		try {
			const f = fixture(false);
			f.setups.push({ agent: 'codex', download: 'ready' });
			f.picks.push(items => items.find(item => item.provider === 'codex'), items => items.find(item => item.id === 'login'));
			await f.service.connect();
			assert.match(f.service.status, /Starting Codex sign-in/);
			f.publishAccount({ status: 'signedOut', authUrl: 'https://auth.openai.com/fixture' });
			clock.tick(16000);
			assert.match(f.service.status, /browser/);
			f.publishAccount({ status: 'signedIn' });
			assert.deepStrictEqual(f.errors, []);
			assert.match(f.service.status, /is signed in/);
		} finally { clock.restore(); }
	});
	test('an unanswered native login explains the timeout and offers an explicit CLI fallback', async () => {
		const clock = sinon.useFakeTimers();
		try {
			const f = fixture(false);
			f.setups.push({ agent: 'codex', download: 'ready' });
			f.picks.push(items => items.find(item => item.provider === 'codex'), items => items.find(item => item.id === 'login'));
			await f.service.connect();
			clock.tick(15000);
			assert.match(f.errors[0], /Sign In with CLI/);
			assert.deepStrictEqual(f.terminals, []);
		} finally { clock.restore(); }
	});
	test('native login failures are shown and stop waiting for a response', async () => {
		const clock = sinon.useFakeTimers();
		try {
			const f = fixture(false);
			f.setups.push({ agent: 'codex', download: 'ready' });
			f.picks.push(items => items.find(item => item.provider === 'codex'), items => items.find(item => item.id === 'login'));
			await f.service.connect();
			f.publishAccount({ status: 'error' });
			clock.tick(16000);
			assert.strictEqual(f.errors.length, 1);
			assert.match(f.errors[0], /Native Codex sign-in failed/);
		} finally { clock.restore(); }
	});
	test('lookup and terminal launch failures are reported instead of rejecting silently', async () => {
		const f = fixture(false);
		f.setCliResolver(async () => { throw new Error('Lookup worker unavailable'); });
		f.picks.push(items => items.find(item => item.provider === 'codex'), items => items.find(item => item.id === 'login'));
		await f.service.connect();
		assert.match(f.errors[0], /Lookup worker unavailable/);
		f.setCliResolver(async executable => executable);
		f.failTerminal(new Error('Terminal launch failed'));
		f.picks.push(items => items.find(item => item.provider === 'codex'), items => items.find(item => item.id === 'login'));
		await f.service.connect();
		assert.match(f.errors[1], /Terminal launch failed/);
	});
});
