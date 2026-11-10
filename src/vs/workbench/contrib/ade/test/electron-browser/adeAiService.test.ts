/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
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
import { FileOperationError, FileOperationResult, IFileService } from '../../../../../platform/files/common/files.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceTrustRequestService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { IAgentHostService } from '../../../../../platform/agentHost/common/agentService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ICodexAccountService, ICodexAccountViewInfo } from '../../../../services/agentHost/browser/codexAccountService.js';
import { IAgentSdkSetupService } from '../../../../services/agentHost/browser/agentSdkSetupService.js';
import { ILanguageModelsService } from '../../../chat/common/languageModels.js';
import { ILanguageModelToolsService, IToolData, IToolImpl } from '../../../chat/common/tools/languageModelToolsService.js';
import { IAgentHostActiveClientService } from '../../../chat/browser/agentSessions/agentHost/agentHostActiveClientService.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { IAdeAiDialogService, type AdeAiDialogOptions } from '../../browser/adeAiDialog.js';
import { IChatWidgetService } from '../../../chat/browser/chat.js';
import { ITerminalService, ITerminalGroupService } from '../../../terminal/browser/terminal.js';
import { IAdeProjectService } from '../../browser/adeProjectService.js';
import { IAdeCodeService } from '../../browser/adeCodeService.js';
import { IAdeOperationService, AdeOperationService } from '../../browser/adeOperationService.js';
import { CliAccountState, CodeContext, CodeDiagramProgress, CodeDiagramExploration, CodePreview, CodeRequest } from '../../common/codeBridge.js';
import { AdeAiService } from '../../electron-browser/adeAiService.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { stateFixture, stateCriteriaFixture } from '../common/stateFixture.js';
import { nodeOrdersFixture } from '../common/nodeOrdersFixture.js';
import { diagramToolDefinitions } from '../../common/diagramTools.js';
import { checkoutModel } from '../../common/checkoutModel.js';

interface Choice { label?: string; id?: string; provider?: string; maxCalls?: number; picked?: boolean }
const config = { version: 1, provider: 'codex', connection: 'cli', executable: 'codex', model: 'native-model', timeoutMs: 10000, maxContextBytes: 65536, maxCalls: 2 };

suite('A.D.E native AI orchestration', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	function fixture(configured = true, executable = 'codex', maxCalls = 2, savedExploration?: { id: string; resource?: string }) {
		const instantiation = store.add(new TestInstantiationService());
		const stub = <T extends object>(id: ServiceIdentifier<T>, values: object) => { const service = Object.assign(new (mock<T>())(), values); instantiation.stub(id, service); return service; };
		const storage = store.add(new InMemoryStorageService());
		if (configured) { storage.store('ade.ai.cliConfig', JSON.stringify({ ...config, executable, maxCalls }), StorageScope.PROFILE, StorageTarget.MACHINE); }
		const changed = store.add(new Emitter<void>());
		const aiProgress = store.add(new Emitter<import('../../common/codeBridge.js').CodeAiProgress>());
		const liveUpdates: import('../../common/codeBridge.js').CodeAiProgress[] = [];
		const projectChanged = store.add(new Emitter<void>());
		const savedModel = store.add(new Emitter<import('../../common/modelCodeUpdate.js').SavedModelChange>());
		const contextFiles = new Map<string, string>();
		const chatRequests: Extract<CodeRequest, { operation: 'diagramChat' }>[] = [];
		const root = '/workspace/ade-ai-fixture';
		if (savedExploration) { storage.store('ade.ai.exploration', JSON.stringify({ root, snapshot: root + '/.ade/imports/fixture', ...savedExploration }), StorageScope.WORKSPACE, StorageTarget.MACHINE); }
		const context: CodeContext = { snapshot: root + '/.ade/imports/fixture', model: root + '/.ade/imports/fixture/model.ade.json', sourceRoot: root, revision: 'fixture',
			scope: { include: ['**'], exclude: [], excludedDirectories: ['.ade'], respectGitignore: true, languageOverrides: {} },
			files: [{ path: 'checkout.mjs', language: 'javascript', status: 'parsed', diagnostics: [] }],
			declarations: [{ id: 'checkout-controller', sourceId: 'checkout-controller', name: 'Checkout', kind: 'action', evidence: { file: 'checkout.mjs', revision: 'fixture', start: 0, end: 10, line: 1, endLine: 1 } }], dependencies: [], providers: [], diagnostics: [] };
		let accountState: CliAccountState = { status: 'signedIn' };
		let resolveExecutable: (executable: string) => Promise<string | undefined> = async executable => executable;
		const opened: CodeContext[] = [];
		let projectContext = Promise.resolve(true);
		const code = { changed: false, ensureProjectContext: async () => projectContext, openContext: async (value: CodeContext) => { opened.push(value); }, context, onDidChange: changed.event, onDidAiProgress: aiProgress.event, executeCollaboration: async (input: string) => execute(input), executeReconciliation: async (request: CodeRequest) => execute(JSON.stringify(request)), resolveCli: (executable: string) => resolveExecutable(executable), checkCliAccount: async () => accountState };
		const picks: ((items: readonly Choice[]) => Choice | Choice[] | undefined)[] = [];
		const inputs: string[] = [];
		const inputOptions: IInputOptions[] = [];
		const chats: { resource: string; attachments: string[]; focused: boolean }[] = [];
		const chatPrompts: string[] = [];
		const pickerTitles: string[] = [];
		const editorInputs: object[] = [];
		let failPureApply = false;
		let confirmed = true, failDiagram = false, hiddenPanels = 0, closedAlerts = 0;
		const dialogDetails: string[] = [];
		const confirmations: boolean[] = [];
		let plannedProgress: CodeDiagramProgress | undefined;
		let exploratoryDraft: CodeDiagramExploration['proposals'][number] | undefined, exploratoryApplied = false;
		const explorationActions: string[] = [];
		let projectWorkflow = false;
		const explorationSessionIds: (string | undefined)[] = [];
		let explorationId = savedExploration?.id ?? generateUuid(), explorationMissing = false, explorationReadError: Error | undefined;
		let planApproved = false;
		const attachmentFiles = new Map<string, URI[]>();
		const deletedAttachments: string[] = [];
		const diagramContexts: string[] = [];
		const errors: string[] = [];
		const infos: string[] = [];
		const terminals: object[] = [];
		const dialogs: AdeAiDialogOptions[] = []; let activeDialog: AdeAiDialogOptions | undefined;
		const requests: string[] = [];
		const sourceSelections: string[][] = [];
		let signIns = 0, disabled = false, incremental = false;
		const nativeDiagramModels: string[] = [], selectedChatModels: string[] = [];
		stub(ILanguageModelsService, { getLanguageModelIds: () => nativeDiagramModels.map(id => 'native:' + id), lookupLanguageModel: (identifier: string) => ({ id: '@provider=openai:' + identifier.slice('native:'.length), targetChatSessionType: 'agent-host-codex' }) });
		const diagramTools = new Map<string, { data: IToolData; impl: IToolImpl }>();
		const sessionTools = new Map<string, readonly string[]>();
		stub(ILanguageModelToolsService, { registerTool: (data: IToolData, impl: IToolImpl) => { diagramTools.set(data.id, { data, impl }); return toDisposable(() => diagramTools.delete(data.id)); } });
		stub(IAgentHostActiveClientService, { setSessionTools: (resource: URI, ids: string[]) => sessionTools.set(resource.toString(), ids), clearSessionTools: (resource: URI) => { const ids = sessionTools.get(resource.toString()); for (const [key, current] of sessionTools) { if (current === ids) { sessionTools.delete(key); } } }, moveSessionTools: (source: URI, target: URI) => { const ids = sessionTools.get(source.toString()); if (ids) { sessionTools.set(target.toString(), ids); } }, acquireSessionTools: (resource: URI) => ({ object: observableValue('session-tools', (sessionTools.get(resource.toString()) ?? []).map(id => ({ name: diagramTools.get(id)!.data.toolReferenceName }))), dispose: () => {} }) });
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
		const project = { model: structuredClone(checkoutModel), modelUri: URI.file(context.model), editable: true, onDidSaveModel: savedModel.event, onDidChange: projectChanged.event, save: async () => true };
		let reverted = 0;
		Object.assign(project, { projectRoot: URI.file(root), revert: async () => { reverted++; } });
		const projectService = stub(IAdeProjectService, project);
		const codeService = stub(IAdeCodeService, code);
		stub(IQuickInputService, { pick: async (items: Choice[], options?: { title: string }) => { if (options) { pickerTitles.push(options.title); } return picks.shift()?.(items); }, input: async (options?: IInputOptions) => { if (options) { inputOptions.push(options); } return inputs.shift(); } });
		stub(INotificationService, { notify: (notification: { message: string }) => { errors.push(notification.message); return { close: () => { closedAlerts++; } }; }, error: (message: string) => errors.push(message), info: (message: string) => infos.push(message) });
		stub(IProgressService, { withProgress: async (_options: object, task: () => Promise<void>) => task() });
		stub(IDialogService, { confirm: async (options: { detail: string }) => { dialogDetails.push(options.detail); return { confirmed: confirmations.shift() ?? confirmed }; } });
		let stateData: string | undefined;
		const fileChanges = store.add(new Emitter<{ contains(resource: URI): boolean }>());
		stub(IFileService, { createWatcher: () => ({ onDidChange: fileChanges.event, dispose: () => {} }), createFolder: async () => {}, writeFile: async (resource: URI, content: VSBuffer) => { contextFiles.set(resource.fsPath, content.toString()); }, exists: async () => stateData !== undefined,
			stat: async () => { if (explorationReadError) { throw explorationReadError; } if (explorationMissing) { throw new FileOperationError('Exploration session was removed', FileOperationResult.FILE_NOT_FOUND); } return { isFile: true }; },
			readFile: async (resource: URI) => ({ value: VSBuffer.fromString(resource?.path.endsWith('/review-fixture.json') ? '{"changes":[{"before":null,"after":{"name":"Reviewed responsibility"}}]}' : stateData ?? '') }) });
		stub(IEditorService, { openEditor: async (input: object) => { editorInputs.push(input); return undefined; } });
		stub(ITerminalService, { createTerminal: async (options: { config: object }) => { if (terminalError) { throw terminalError; } terminals.push({ config: options.config }); return { focusWhenReady: async () => { await focusRequested.complete(); await terminalFocus; }, onExit: terminalExit.event }; }, setActiveInstance: () => {} });
		stub(ITerminalGroupService, { showPanel: async () => {}, hidePanel: () => { hiddenPanels++; } });
		stub(IChatWidgetService, { openSession: async (resource: URI) => {  const chat = { resource: resource.toString(), attachments: [] as string[], focused: false }; chats.push(chat); return { input: { setCurrentLanguageModel: (model: { identifier: string }) => selectedChatModels.push(model.identifier) }, attachmentModel: { get fileAttachments() { return attachmentFiles.get(resource.toString()) ?? []; }, delete: (id: string) => { deletedAttachments.push(id); attachmentFiles.set(resource.toString(), (attachmentFiles.get(resource.toString()) ?? []).filter(uri => uri.toString() !== id)); }, addFile: async (uri: URI) => { chat.attachments.push(uri.toString()); attachmentFiles.set(resource.toString(), [...(attachmentFiles.get(resource.toString()) ?? []), uri]); }, updateContext: (_deleted: string[], entries: { value: string }[]) => { diagramContexts.push(entries[0].value); } }, setInput: (value: string) => { chatPrompts.push(value); }, setInputPlaceholder: () => {}, focusInput: () => { chat.focused = true; } }; } });
		stub(IAdeAiDialogService, { updateConversation: (event: import('../../common/codeBridge.js').CodeAiProgress) => liveUpdates.push(event), updateProgress: () => {}, open: async (options: AdeAiDialogOptions) => { dialogs.push(options); activeDialog = options; return options.resource ? instantiation.get(IChatWidgetService).openSession(options.resource) : undefined; }, close: async () => { const options = activeDialog; activeDialog = undefined; await options?.onClose(); } });
		stub(ICodexAccountService, { account, onDidChangeAccount: accountChanged.event, signIn: () => signIns++ });
		stub(IAgentSdkSetupService, { setups, requestReload: () => {} });
		stub(IAgentHostService, { rootState: { value: { agents: [{ provider: 'codex', models: [{ id: '@provider=openai:native-model', name: 'Native Account', provider: 'codex' }, { id: '@provider=vscode-proxy:proxy-model', name: 'Other Account', provider: 'codex' }] }] } } });
		stub(IConfigurationService, { getValue: (key: string) => key === 'chat.disableAIFeatures' ? disabled : key === 'ade.diagramImport.incremental' ? incremental : undefined, updateValue: async () => {} });
		stub(IWorkspaceTrustRequestService, { requestWorkspaceTrust: async () => trust ?? true });
		const session = { id: '11111111-1111-4111-8111-111111111111', root, worktree: root + '/.ade/worktrees/fixture', reviewId: 'changes', status: 'staged', generated: { summary: 'Payment refusal', files: [{ file: 'checkout.mjs', content: 'export const result = false;' }] }, before: [{ file: 'checkout.mjs', content: 'export const result = true;' }], usage: { inputTokens: 10, outputTokens: 20 }, cost: null };
		const pure = { observed: [{ file: '.ade/model.json', value: { content: JSON.stringify(nodeOrdersFixture), mode: 420 } }], next: { model: nodeOrdersFixture }, id: '22222222-2222-4222-8222-222222222222', root, reviewId: 'pure-review', status: 'staged', mutations: [{ file: 'src/predicate.mjs', before: null, after: { content: 'pure', mode: 420 } }], coverage: { forward: 'pure-v1' }, criteria: { cases: [{ id: 'independent' }] }, packets: [{ packet: { bytes: '{"seal":"pure"}' } }], calls: 0 };
		let pureAligned = false;
		const execute = async (inputText: string) => {
				const request: { operation: string } = JSON.parse(inputText); requests.push(request.operation);
				switch (request.operation) {
					case 'diagramChat': { chatRequests.push(JSON.parse(inputText)); const request = JSON.parse(inputText) as { requestId: string }; aiProgress.fire({ requestId: request.requestId, kind: 'message', itemId: 'reply', text: 'Diagrams prepared' }); return JSON.stringify({ text: 'Diagrams prepared' }); }
					case 'exploration': {
						const input = JSON.parse((JSON.parse(inputText) as { request: string }).request);
						explorationActions.push(input.tool ?? input.action);
						if (input.action === 'open') {
							explorationSessionIds.push(input.sessionId);
							if (input.sessionId && explorationMissing) { throw new Error('ENOENT: saved exploration session was removed'); }
							if (!input.sessionId) { explorationId = generateUuid(); explorationMissing = false; }
						}
						if (input.action === 'review') { return JSON.stringify({ sessionId: explorationId, data: { reviewId: 'whole-project-review', proposal: { id: 'whole-project-review', status: 'ready', diagnostics: [], views: checkoutModel.views.slice(0, 2) }, reviewFile: root + '/.ade/exploration/review-fixture.json', images: checkoutModel.views.slice(0, 2).map(view => ({ viewId: view.id, path: root + '/.ade/exploration/' + view.id + '.svg' })) }, diagnostics: [] }); }
						if (input.action === 'publish' || input.action === 'publishAll') { exploratoryApplied = true; return JSON.stringify({ sessionId: explorationId, data: { snapshot: root + '/.ade/imports/published' }, diagnostics: [] }); }
						if (input.action === 'tool') { return JSON.stringify({ sessionId: explorationId, data: input.tool === 'ade_view_preview' ? { reviewFile: root + '/.ade/exploration/review-fixture.json', images: [{ path: root + '/.ade/exploration/preview.svg', viewId: 'overview' }] } : { files: [] }, diagnostics: [] }); }
						return JSON.stringify({ sessionId: explorationId, data: { sessionId: explorationId, model: 'chat-selected', ...(projectWorkflow ? { workflow: 'project', batch: { blockers: [] } } : {}), budget: { maxToolCalls: 80, maxReadBytes: 1048576, maxDurationMs: 1800000, maxModelTurns: 8 }, usage: { toolCalls: 0, readBytes: 0, modelTurns: [], turnsObservable: false, inputTokens: null, outputTokens: null }, tasks: [], proposals: exploratoryDraft ? [{ ...exploratoryDraft, status: exploratoryApplied ? 'applied' : exploratoryDraft.status }] : [], mcp: { command: 'node', args: ['adeDiagramMcp.js', root] } }, diagnostics: [] });
					}
					case 'inspect': return JSON.stringify({ ...context, snapshot: root + '/.ade/imports/published', diagramState: 'diagrams' });
					case 'structuralPrepare': return JSON.stringify(pureAligned ? { status: 'aligned', calls: 0 } : { status: 'staged', calls: 0, session: pure });
					case 'structuralVerify': return JSON.stringify({ ...pure, status: 'passed', verification: { code: 0, output: 'Independent case passed', independent: 1 } });
					case 'structuralApply': if (failPureApply) { throw new Error('Structural source inventory changed; prepare a new review'); } return JSON.stringify({ ...pure, status: 'applied' });
					case 'structuralUndo': return JSON.stringify({ ...pure, status: 'undone' });
					case 'structuralSession': return JSON.stringify(pure);
					case 'structuralRecover': return JSON.stringify({ ...pure, status: 'rolledBack' });
					case 'prepare': return JSON.stringify({ reviewId: 'context', request: { snapshot: context.snapshot }, context: { sources: [{ file: 'checkout.mjs' }] } });
					case 'plan': return JSON.stringify({ planId: 'plan', plan: { summary: 'Payment refusal', questions: [], steps: [{ description: 'Implement refusal' }], changes: [{ file: 'checkout.mjs', kind: 'modify', reason: 'Handle refused payments' }] } });
					case 'stage': return JSON.stringify(session);
					case 'verify': return JSON.stringify({ ...session, status: 'passed', verification: { code: 0, output: 'Passed', durationMs: 1 } });
					case 'apply': return JSON.stringify({ ...session, status: 'applied' });
					case 'undo': return JSON.stringify({ ...session, status: 'undone' });
					case 'diagramPrepare': if (plannedProgress) { return JSON.stringify(plannedProgress); } return JSON.stringify({ inputBudgetBytes: 49152, responseHeadroomBytes: 16384, id: 'diagram-job', sourceRoot: root, reviewId: 'diagram-scope', status: 'ready', completed: 0, total: 2, calls: 0, symbols: 1, files: 1, model: 'economical-diagrams', questions: [], excluded: 0 });
					case 'diagramApprovePlan': assert.ok(plannedProgress?.plan); planApproved = true; plannedProgress.status = 'ready'; return JSON.stringify(plannedProgress);
					case 'diagramStep': if (failDiagram) { throw new Error('Provider Offline'); }
						if (plannedProgress) {
							if (plannedProgress.completed === 0) { plannedProgress.status = 'plan'; plannedProgress.completed = 1; }
							else { assert.equal(planApproved, true); plannedProgress.completed++; plannedProgress.plan![plannedProgress.completed - 2].status = 'complete'; if (plannedProgress.completed === plannedProgress.total) { plannedProgress.status = 'complete'; plannedProgress.context = { ...context, diagramState: 'diagrams' }; } }
							return JSON.stringify(plannedProgress);
						}
						return JSON.stringify({ id: 'diagram-job', sourceRoot: root, reviewId: 'diagram-scope', status: 'complete', completed: 2, total: 2, calls: 2, symbols: 1, files: 1, model: 'economical-diagrams', questions: [], excluded: 0, context: { ...context, diagramState: 'diagrams' } });
					case 'reconciliationPrepare': sourceSelections.push((JSON.parse(inputText) as { sourceFiles: string[] }).sourceFiles); return JSON.stringify({ reviewId: 'reconcile-context', contents: '{"prompt":"reviewed"}', metrics: { inputBytes: 1000, schemaBytes: 100, sourceBytes: 8000, disclosedBytes: 500, estimatedTokens: 275 } });
					case 'reconciliationPropose': return JSON.stringify({ token: 'proposal', context, ai: { summary: 'Reconcile payment', questions: [] } });
					default: throw new Error('Unexpected fixture operation');
				}
		};
		const service = store.add(instantiation.createInstance(AdeAiService));
		return { savedModel, contextFiles, chatRequests, prepareProjectReview: () => { incremental = true; projectWorkflow = true; exploratoryDraft = { id: 'project-view', status: 'ready', diagnostics: [], views: structuredClone(checkoutModel.views.slice(0, 2)) }; }, explorationSessionIds, removeExploration: () => { explorationMissing = true; exploratoryDraft = undefined; }, failExplorationRead: (error: Error) => { explorationReadError = error; }, prepareExploratoryDraft: (status: 'ready' | 'invalid' = 'ready') => { incremental = true; exploratoryDraft = { id: 'draft-review', status, diagnostics: [], views: [structuredClone(checkoutModel.views[0])] }; }, explorationActions, nativeDiagramModels, selectedChatModels, enableIncremental: () => { incremental = true; }, diagramTools, sessionTools, failPurePublication: () => { failPureApply = true; }, useStateModel: () => { Object.assign(projectService, { model: structuredClone(stateFixture) }); stateData = JSON.stringify(stateCriteriaFixture); }, get reverted() { return reverted; }, setPureAligned: () => { pureAligned = true; }, usePureModel: () => { Object.assign(project, { model: structuredClone(nodeOrdersFixture), modelUri: URI.file(root + '/.ade/model.json') }); Object.assign(projectService, project); projectChanged.fire(); }, service, operations, opened, chats, chatPrompts, dialogs, fileChanges, aiProgress, liveUpdates, deletedAttachments, diagramContexts, setCodeChanged: (value: boolean) => { Object.assign(codeService, { changed: value }); }, setModelUri: (value: URI) => { Object.assign(projectService, { modelUri: value }); }, dialogDetails, pickerTitles, editorInputs, project, projectChanged, get hiddenPanels() { return hiddenPanels; }, get closedAlerts() { return closedAlerts; }, confirmations, useDiagramPlan: () => { plannedProgress = { id: 'diagram-job', sourceRoot: root, reviewId: 'diagram-plan', status: 'ready', completed: 0, total: 3, calls: 0, symbols: 1, files: 1, model: 'economical-diagrams', questions: [], excluded: 0, remainingRequests: 1, plan: [{ key: 'overview', name: 'Overview', kind: 'structure', feature: null, focus: ['checkout-controller'], intent: 'System responsibilities', status: 'pending' }, { key: 'sequence', name: 'Checkout Interaction', kind: 'sequence', feature: 'purchase', focus: ['checkout-controller'], intent: 'Request and persistence order', status: 'pending' }] }; }, setConfirmed: (value: boolean) => { confirmed = value; }, failDiagram: (value = true) => { failDiagram = value; }, setAccountState: (value: CliAccountState) => { accountState = value; }, storage, picks, inputs, inputOptions, errors, infos, terminals, requests, sourceSelections, setups, code, changed, root, get signIns() { return signIns; }, disable: () => { disabled = true; }, holdTrust: (pending: Promise<boolean>) => { trust = pending; },
			holdProjectContext: (pending: Promise<boolean>) => { projectContext = pending; }, holdTerminalFocus: (pending: Promise<void>) => { terminalFocus = pending; }, focusRequested: focusRequested.p, exitTerminal: () => terminalExit.fire(0),
			publishAccount: (value: ICodexAccountViewInfo) => { Object.assign(account, { authUrl: undefined }, value); accountChanged.fire(account); }, failTerminal: (error: Error) => { terminalError = error; },
			setCliResolver: (resolver: typeof resolveExecutable) => { resolveExecutable = resolver; } };
	}
	test('primary Codex modal selects a model and uses the connected CLI account', async () => {
		const f = fixture(false); f.picks.push(items => items[0]);
		await f.service.chat();
		assert.deepStrictEqual([f.dialogs.length, f.terminals.length], [1, 0]);
		assert.equal(f.signIns, 0);
		assert.deepStrictEqual(f.requests, []);
		assert.equal(f.errors.length, 0);
	});
	test('native Codex chat opens in the modal and focuses input', async () => {
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
		assert.match(f.dialogDetails[0], /49152 bytes per request.*16384 bytes/s);
		assert.equal(f.errors.length, 0);
	});
	test('the diagram proposal is reviewed separately before per-view steps', async () => {
		const f = fixture(); f.picks.push(items => items[0]); f.useDiagramPlan();
		await f.service.buildDiagrams();
		assert.deepStrictEqual(f.requests, ['diagramPrepare', 'diagramStep', 'diagramApprovePlan', 'diagramStep', 'diagramStep']);
		assert.match(f.dialogDetails[1], /Overview · Structure.*System responsibilities.*Checkout Interaction · Sequence.*Request and persistence order/s);
		assert.match(f.dialogDetails[1], /2 diagrams · Up to 1 additional requests/);
		assert.equal(f.opened.length, 1);
	});

	test('declining the proposal keeps it reviewable and resume does not analyze sources again', async () => {
		const f = fixture(); f.picks.push(items => items[0]); f.useDiagramPlan(); f.confirmations.push(true, false);
		await f.service.buildDiagrams();
		assert.deepStrictEqual({ requests: f.requests, status: f.service.diagramProgress?.status, opened: f.opened.length }, { requests: ['diagramPrepare', 'diagramStep'], status: 'plan', opened: 0 });
		await f.service.resumeDiagrams();
		assert.deepStrictEqual(f.requests, ['diagramPrepare', 'diagramStep', 'diagramPrepare', 'diagramApprovePlan', 'diagramStep', 'diagramStep']);
		assert.equal(f.opened.length, 1);
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
	test('CLI conversations open in a modal and reset when closed without opening a terminal', async () => {
		const f = fixture();
		await f.service.chat();
		assert.deepStrictEqual([f.dialogs.length, f.terminals.length, f.service.chatLocation], [1, 0, 'modal']);
		await f.service.returnToDiagrams();
		assert.deepStrictEqual([f.service.chatLocation, f.hiddenPanels, f.editorInputs.length], [undefined, 0, 0]);
		await f.service.chat();
		assert.deepStrictEqual([f.dialogs.length, f.terminals.length], [2, 0]);
	});

	test('closing native chat clears its tool binding and reopens a new conversation with the same drafts', async () => {
		const f = fixture(); f.prepareExploratoryDraft(); f.publishAccount({ status: 'signedIn' }); f.setups.push({ agent: 'codex', download: 'ready' });
		await f.service.buildDiagrams(); const first = f.chats[0].resource;
		await f.service.returnToDiagrams();
		assert.deepStrictEqual([f.diagramTools.size, f.sessionTools.size, f.service.diagramExploration?.proposals.length], [0, 0, 1]);
		await f.service.chat();
		assert.notEqual(f.chats.at(-1)!.resource, first);
		assert.deepStrictEqual([f.diagramTools.size, f.terminals.length], [diagramToolDefinitions.length, 0]);
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
	for (const state of ['index', 'legacyIndex', 'emptyViews'] as const) {
		test(`Sync generates diagrams when the design is ${state}, even with no code changes`, async () => {
			const f = fixture(false);
			if (state === 'index') { f.code.context.diagramState = 'index'; }
			if (state === 'legacyIndex') { f.project.model.id = 'code:legacy'; f.project.model.semantics.elements = f.project.model.semantics.elements.filter(element => element.kind !== 'feature'); }
			if (state === 'emptyViews') { f.project.model.views = []; }
			f.picks.push(items => items[0]);
			const preview: CodePreview = { token: 'preview', context: f.code.context, files: { added: [], changed: [], removed: [], unchanged: [] }, declarations: { added: [], changed: [], removed: [] }, dependencies: { added: [], changed: [], removed: [] }, conflicts: [], impact: { elementIds: [], viewIds: [] }, parsed: [], reused: [], semanticAnalyzed: [], semanticReused: [], reconciliation: { status: 'aligned', origin: 'none', commonRevision: 'fixture', sourceEdits: [], diagnostics: [] } };
			await f.service.reconcile(preview);
			assert.deepStrictEqual({ requests: f.requests, opened: f.opened.length, errors: f.errors }, { requests: ['diagramPrepare', 'diagramStep'], opened: 1, errors: [] });
		});
	}
	test('zero-call Sync budget prepares context without making an inference request', async () => {
		const f = fixture(true, 'codex', 0);
		f.picks.push(items => [items[0]]);
		const preview: CodePreview = { token: 'preview', context: f.code.context, files: { added: [], changed: [], removed: [], unchanged: [] }, declarations: { added: [], changed: [], removed: [] }, dependencies: { added: [], changed: [], removed: [] }, conflicts: [], impact: { elementIds: [], viewIds: [] }, parsed: [], reused: [], semanticAnalyzed: [], semanticReused: [] };
		await f.service.reconcile(preview);
		assert.deepStrictEqual({ requests: f.requests, errors: f.errors }, { requests: ['reconciliationPrepare'], errors: [] });
	});
	test('Update Code prepares all affected files even when more than 20 are suggested', async () => {
		const f = fixture();
		f.code.context.files = Array.from({ length: 26 }, (_, index) => ({ path: `task${index}.py`, language: 'python', status: 'parsed', diagnostics: [] }));
		const preview: CodePreview = { token: 'preview', context: f.code.context, files: { added: [], changed: f.code.context.files.map(file => file.path), removed: [], unchanged: [] }, declarations: { added: [], changed: [], removed: [] }, dependencies: { added: [], changed: [], removed: [] }, conflicts: [], impact: { elementIds: [], viewIds: [] }, parsed: [], reused: [], semanticAnalyzed: [], semanticReused: [] };
		await f.service.reconcile(preview, [], 'model');
		assert.deepStrictEqual({ selected: f.sourceSelections, requests: f.requests, errors: f.errors }, { selected: [preview.files.changed], requests: ['reconciliationPrepare', 'reconciliationPropose'], errors: [] });
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
	test('v4 first project uses deterministic structural worker with review, verification, apply and undo', async () => {
		const f = fixture(false); f.usePureModel(); await f.service.implement();
		assert.deepStrictEqual(f.requests, ['structuralPrepare']); assert.strictEqual(f.editorInputs.length, 1);
		await f.service.verify(); assert.strictEqual(f.service.canApply, true);
		await f.service.apply(); assert.strictEqual(f.service.canUndo, true); await f.service.undo();
		assert.deepStrictEqual([f.requests, f.reverted, f.errors], [['structuralPrepare', 'structuralVerify', 'structuralApply', 'structuralUndo'], 2, []]);
	});

	test('aligned v4 target uses no inference, proposal or review editor', async () => {
		const f = fixture(false); f.usePureModel(); f.setPureAligned(); await f.service.implement();
		assert.deepStrictEqual([f.requests, f.editorInputs, f.errors], [['structuralPrepare'], [], []]); assert.ok(f.infos.some(message => /No AI Calls/.test(message)));
	});

	test('v4 reverse resumes the same structural review and recovery without provider setup', async () => {
		const f = fixture(false); f.usePureModel(); await f.service.structuralReverse(); await f.service.structuralResume(); await f.service.structuralRecover();
		assert.deepStrictEqual([f.requests, f.errors, f.reverted], [['structuralPrepare', 'structuralSession', 'structuralRecover'], [], 1]);
	});

	test('v4 publication cancellation keeps the reviewed changes unapplied', async () => {
		const f = fixture(false); f.usePureModel(); await f.service.implement(); await f.service.verify(); f.setConfirmed(false); await f.service.apply();
		assert.deepStrictEqual(f.requests, ['structuralPrepare', 'structuralVerify']); assert.strictEqual(f.service.canApply, true);
	});

	test('semantic changes immediately mark a reviewed pure target for a new review', async () => {
		const f = fixture(false); f.usePureModel(); await f.service.implement(); await f.service.verify();
		assert.strictEqual(f.service.canApply, true); Object.assign(f.project.model, { name: 'Changed semantic intent' }); f.projectChanged.fire();
		assert.strictEqual(f.service.canApply, false); assert.match(f.service.status, /Prepare a New Review/);
	});

	test('native state simulation reads authored criteria and explains phases with zero provider requests', async () => {
		const f = fixture(false); f.useStateModel(); f.disable(); f.picks.push(items => items.find(item => item.label === 'checkout.failed-charge')); await f.service.simulateStates();
		assert.deepStrictEqual([f.requests, f.errors, f.editorInputs.length], [[], [], 1]); const opened = f.editorInputs[0] as { contents: string }; for (const part of ['Draft', 'denied', 'doCancelled · action.watch', 'Zero AI Calls']) { assert.ok(opened.contents.includes(part)); }
	});

	test('continuous preparation is off by default and coalesces native semantic edits without provider setup', async () => {
		const clock = sinon.useFakeTimers();
		try {
			const f = fixture(false); f.usePureModel(); f.disable(); f.projectChanged.fire(); await clock.tickAsync(650);
			assert.deepStrictEqual(f.requests, []); f.inputs.push('2'); await f.service.configureContinuity();
			Object.assign(f.project.model, { name: 'First' }); f.projectChanged.fire(); Object.assign(f.project.model, { name: 'Final' }); f.projectChanged.fire();
			await clock.tickAsync(650); assert.deepStrictEqual(f.requests, ['structuralPrepare']);
			assert.match(f.service.continuityStatus, /1\/2 Jobs.*Zero AI Calls.*Manual Publication/);
			f.projectChanged.fire(); await clock.tickAsync(650); assert.deepStrictEqual(f.requests, ['structuralPrepare']);
			await f.service.configureContinuity(); assert.match(f.service.continuityStatus, /Paused/);
		} finally { clock.restore(); }
	});
	test('continuous budget exhaustion blocks new jobs and resume does not refill the saved budget', async () => {
		const clock = sinon.useFakeTimers();
		try {
			const f = fixture(false); f.usePureModel(); f.inputs.push('1'); await f.service.configureContinuity(); await clock.tickAsync(650);
			Object.assign(f.project.model, { name: 'More' }); f.projectChanged.fire(); await clock.tickAsync(650);
			assert.deepStrictEqual(f.requests, ['structuralPrepare']); assert.match(f.service.continuityStatus, /Budget Exhausted/);
			await f.service.configureContinuity(); f.picks.push(items => items[0]); await f.service.configureContinuity(); await clock.tickAsync(650);
			assert.deepStrictEqual(f.requests, ['structuralPrepare']); assert.equal(JSON.parse(f.storage.get('ade.structural.continuity', StorageScope.WORKSPACE)!).attempted, 1);
			await f.service.configureContinuity();
		} finally { clock.restore(); }
	});
	test('continuous preparation ignores layout, blocks incomplete specifications and pauses on project replacement', async () => {
		const clock = sinon.useFakeTimers();
		try {
			const f = fixture(false); f.usePureModel(); f.inputs.push('3'); await f.service.configureContinuity(); await clock.tickAsync(650);
			f.project.model.views = []; f.projectChanged.fire(); await clock.tickAsync(650); assert.deepStrictEqual(f.requests, ['structuralPrepare']);
			Object.assign(f.project.model, { foundation: { ...(f.project.model as typeof nodeOrdersFixture).foundation, predicates: [] } }); f.projectChanged.fire(); await clock.tickAsync(650); assert.match(f.service.continuityStatus, /Complete the Specification/);
			Object.assign(f.project.model, { id: 'another-project' }); f.projectChanged.fire(); assert.match(f.service.continuityStatus, /Paused/);
		} finally { clock.restore(); }
	});
	test('stale structural review cannot execute verification or publication through direct methods', async () => {
		const f = fixture(false); f.usePureModel(); await f.service.implement(); await f.service.verify();
		Object.assign(f.project.model, { name: 'New Task' }); f.projectChanged.fire(); await f.service.apply(); await f.service.verify();
		assert.deepStrictEqual(f.requests, ['structuralPrepare', 'structuralVerify']); assert.equal(f.service.canApply, false);
	});
	test('normal review returns to the diagram; technical packets remain an explicit secondary action', async () => {
		const f = fixture(false); f.usePureModel(); f.disable(); await f.service.implement();
		assert.ok(Object.hasOwn(f.editorInputs[0], 'resource')); assert.equal(f.editorInputs.length, 1);
		await f.service.structuralTechnicalReview(); assert.equal(f.editorInputs.length, 3);
		assert.deepStrictEqual(f.requests, ['structuralPrepare']); assert.deepStrictEqual(f.errors, []);
	});

	test('worker freshness rejection invalidates frontend publication and exposes a resolvable issue', async () => {
		const f = fixture(false); f.usePureModel(); await f.service.implement(); await f.service.verify(); f.failPurePublication(); await f.service.apply();
		assert.equal(f.service.canApply, false); assert.equal(f.service.canVerify, false); assert.match(f.service.structuralProblem!, /inventory changed/);
		await f.service.apply(); assert.deepStrictEqual(f.requests, ['structuralPrepare', 'structuralVerify', 'structuralApply']);
	});

	test('incremental import binds the registered tools before chat and reuses its project session', async () => {
		const f = fixture(); f.enableIncremental(); f.publishAccount({ status: 'signedIn' }); f.setups.push({ agent: 'codex', download: 'ready' });
		await f.service.buildDiagrams();
		assert.deepStrictEqual([f.requests, f.diagramTools.size, f.sessionTools.size, f.service.diagramExploration?.model, f.terminals.length], [['exploration'], diagramToolDefinitions.length, 1, 'chat-selected', 0]);
		assert.ok(f.diagramTools.values().next().value!.data.agentHostPreferences?.availability === 'session');
		assert.ok(f.diagramContexts.some(value => value.includes('ade_project_inspect')));
		await f.service.resumeDiagrams();
		assert.deepStrictEqual([f.chats[0].resource, f.diagramTools.size], [f.chats[1].resource, diagramToolDefinitions.length]);
	});
	test('a removed persisted exploration starts a new session after reimporting the same root', async () => {
		const oldId = generateUuid();
		const f = fixture(true, 'codex', 2, { id: oldId, resource: 'agent-host-codex:/removed-session' });
		f.enableIncremental(); f.removeExploration();
		await f.service.buildDiagrams();
		assert.deepStrictEqual([f.explorationSessionIds[0], f.dialogs.length, f.errors], [undefined, 1, []]);
		const saved = JSON.parse(f.storage.get('ade.ai.exploration', StorageScope.WORKSPACE)!);
		assert.notEqual(saved.id, oldId);
		assert.equal(saved.resource, undefined);
	});

	test('a persisted exploration retains its drafts and opens a fresh chat after the import snapshot advances', async () => {
		const id = generateUuid(), resource = 'agent-host-codex:/existing-session';
		const f = fixture(true, 'codex', 2, { id, resource });
		f.enableIncremental(); f.publishAccount({ status: 'signedIn' }); f.setups.push({ agent: 'codex', download: 'ready' });
		f.code.context.snapshot = f.root + '/.ade/imports/next-snapshot';
		await f.service.resumeDiagrams();
		assert.notEqual(f.chats[0].resource, resource);
		assert.deepStrictEqual([f.explorationSessionIds, f.service.diagramExploration?.sessionId, f.errors], [[id], id, []]);
	});

	test('removing the exploration detaches its native chat, tools and review before opening a new session', async () => {
		const f = fixture(); f.prepareExploratoryDraft(); f.publishAccount({ status: 'signedIn' }); f.setups.push({ agent: 'codex', download: 'ready' });
		await f.service.buildDiagrams(); await f.service.reviewDiagramProposal('draft-review');
		const oldId = f.service.diagramExploration!.sessionId, oldChat = f.chats[0].resource;
		f.removeExploration();
		await f.service.chat();
		assert.notEqual(f.service.diagramExploration!.sessionId, oldId);
		assert.notEqual(f.chats.at(-1)!.resource, oldChat);
		assert.deepStrictEqual([f.diagramTools.size, f.sessionTools.has(oldChat), f.service.diagramReview, f.errors], [diagramToolDefinitions.length, false, undefined, []]);
	});

	test('removing the exploration opens a fresh modal and keeps the terminal closed', async () => {
		const f = fixture(); f.enableIncremental();
		await f.service.buildDiagrams();
		const oldId = f.service.diagramExploration!.sessionId;
		f.removeExploration();
		await f.service.chat();
		assert.notEqual(f.service.diagramExploration!.sessionId, oldId);
		assert.deepStrictEqual([f.dialogs.length, f.errors], [2, []]);
	});

	test('returning to diagrams after deleting the session clears its stale workspace reference', async () => {
		const f = fixture(); f.enableIncremental();
		await f.service.buildDiagrams();
		f.removeExploration();
		await f.service.returnToDiagrams();
		assert.deepStrictEqual([f.service.diagramExploration, f.service.chatLocation, f.storage.get('ade.ai.exploration', StorageScope.WORKSPACE), f.errors], [undefined, undefined, undefined, []]);
		await f.service.buildDiagrams();
		assert.deepStrictEqual([f.dialogs.length, f.errors], [2, []]);
	});

	test('a permission error does not discard a saved exploration or replace its conversation', async () => {
		const f = fixture(); f.enableIncremental();
		await f.service.buildDiagrams();
		const saved = f.storage.get('ade.ai.exploration', StorageScope.WORKSPACE);
		f.failExplorationRead(new FileOperationError('Permission denied', FileOperationResult.FILE_PERMISSION_DENIED));
		await assert.rejects(f.service.chat(), /Permission denied/);
		assert.deepStrictEqual([f.storage.get('ade.ai.exploration', StorageScope.WORKSPACE), f.dialogs.length], [saved, 1]);
		await f.service.buildDiagrams();
		assert.deepStrictEqual([f.dialogs.length, f.errors.length], [1, 1]);
	});

	test('the CLI modal sends a cancellable headless request with its project session and refreshes automatically', async () => {
		const f = fixture(); f.enableIncremental();
		await f.service.buildDiagrams();
		assert.deepStrictEqual([f.requests, f.terminals.length], [['exploration'], 0]);
		const response = await f.dialogs[0].send!([{ role: 'user', text: 'Prepare every planned diagram' }], CancellationToken.None);
		assert.deepStrictEqual([response, f.requests, f.service.busy, f.liveUpdates.map(event => event.text)], ['Diagrams prepared', ['exploration', 'diagramChat', 'exploration'], false, ['Diagrams prepared']]);
	});

	test('sending from a blocked review refreshes its existing decision surface after the response', async () => {
		const f = fixture(); f.prepareProjectReview();
		await f.service.buildDiagrams(); await f.service.reviewDiagramProposal();
		const before = f.explorationActions.filter(action => action === 'review').length;
		await f.dialogs[0].send!([{ role: 'user', text: 'Repair the review blockers' }], CancellationToken.None);
		assert.equal(f.explorationActions.filter(action => action === 'review').length, before + 1);
		assert.equal(f.liveUpdates[0].text, 'Diagrams prepared');
	});

	test('session file changes refresh progress through the read-only status action', async () => {
		const f = fixture(); f.enableIncremental(); await f.service.buildDiagrams();
		const clock = sinon.useFakeTimers();
		try {
			f.fileChanges.fire({ contains: () => true }); await clock.tickAsync(350);
			assert.deepStrictEqual(f.explorationActions, ['open', 'status']);
			await f.service.returnToDiagrams(); const count = f.requests.length;
			f.fileChanges.fire({ contains: () => true }); await clock.tickAsync(350);
			assert.equal(f.requests.length, count, 'closing the modal disposes the watcher');
		} finally { clock.restore(); }
	});

	test('diagram tools reject a different chat and are disposed with their session binding', async () => {
		const f = fixture(); f.enableIncremental(); f.publishAccount({ status: 'signedIn' }); f.setups.push({ agent: 'codex', download: 'ready' });
		await f.service.buildDiagrams();
		const entry = f.diagramTools.values().next().value!;
		await assert.rejects(entry.impl.invoke({ callId: 'wrong-chat', toolId: entry.data.id, parameters: {}, context: { sessionResource: URI.parse('agent-host-codex:/another-conversation') } }, async () => 0, { report: () => {} }, CancellationToken.None), /Another Conversation/);
		f.service.dispose();
		assert.deepStrictEqual([f.diagramTools.size, f.sessionTools.size], [0, 0]);
	});

	test('an explicitly selected model is applied without changing account, and a failed first open can be retried', async () => {
		const f = fixture(); f.enableIncremental(); f.publishAccount({ status: 'signedIn' }); f.setups.push({ agent: 'codex', download: 'ready' });
		f.storage.store('ade.ai.diagramModel.codex', 'gpt-5.6-terra', StorageScope.PROFILE, StorageTarget.MACHINE);
		await f.service.buildDiagrams();
		assert.match(f.errors[0], /Selected Diagram Model Is Not Available/);
		assert.deepStrictEqual([f.selectedChatModels, f.terminals.length, f.diagramTools.size], [[], 0, diagramToolDefinitions.length]);
		f.nativeDiagramModels.push('gpt-5.6-terra'); await f.service.resumeDiagrams();
		assert.deepStrictEqual([f.selectedChatModels, f.errors.length, f.diagramTools.size], [['native:gpt-5.6-terra'], 1, diagramToolDefinitions.length]);
	});
	test('promotion from an untitled chat to its canonical URI preserves the exploratory conversation', async () => {
		const f = fixture(); f.enableIncremental(); f.publishAccount({ status: 'signedIn' }); f.setups.push({ agent: 'codex', download: 'ready' });
		await f.service.buildDiagrams();
		const canonical = URI.parse('agent-host-codex:/canonical-session'), original = f.chats[0].resource;
		f.sessionTools.set(canonical.toString(), f.sessionTools.get(original)!);
		const entry = f.diagramTools.values().next().value!;
		await entry.impl.invoke({ callId: 'promoted-chat', toolId: entry.data.id, parameters: {}, context: { sessionResource: canonical, requestId: 'turn-one' } }, async () => 0, { report: () => {} }, CancellationToken.None);
		await f.service.chat();
		assert.deepStrictEqual([f.chats.at(-1)!.resource, f.diagramTools.size], [canonical.toString(), diagramToolDefinitions.length]);
		assert.equal(JSON.parse(f.storage.get('ade.ai.exploration', StorageScope.WORKSPACE)!).resource, canonical.toString());
	});

	test('review opens one human-readable surface and waits for an explicit apply action', async () => {
		const f = fixture(); f.prepareExploratoryDraft(); f.publishAccount({ status: 'signedIn' }); f.setups.push({ agent: 'codex', download: 'ready' });
		await f.service.buildDiagrams(); await f.service.reviewDiagramProposal('draft-review');
		assert.deepStrictEqual(f.explorationActions, ['open', 'open', 'ade_view_preview']);
		assert.match(f.service.diagramReview!.contents, /Reviewed responsibility/);
		assert.equal(f.service.diagramReview!.images.length, 1);
		assert.equal(f.opened.length, 0);
		await f.service.applyDiagramReview();
		assert.deepStrictEqual(f.explorationActions, ['open', 'open', 'ade_view_preview', 'publish', 'open']);
		assert.deepStrictEqual([f.opened[0].snapshot, f.service.diagramReview], [f.root + '/.ade/imports/published', undefined]);
	});

	test('complete project review combines previews and applies all changes only after one final confirmation', async () => {
		const f = fixture(); f.prepareProjectReview();
		await f.service.buildDiagrams(); await f.service.reviewDiagramProposal();
		assert.deepStrictEqual([f.service.diagramReview?.projectReviewId, f.service.diagramReview?.images.length, f.opened.length], ['whole-project-review', 2, 0]);
		assert.ok(f.explorationActions.includes('review'));
		assert.equal(f.explorationActions.includes('ade_view_preview'), false);
		f.setConfirmed(false); await f.service.applyDiagramReview();
		assert.equal(f.explorationActions.includes('publishAll'), false);
		f.setConfirmed(true); await f.service.applyDiagramReview();
		assert.deepStrictEqual([f.explorationActions.filter(action => action === 'publishAll').length, f.explorationActions.includes('publish'), f.opened.length, f.service.diagramReview], [1, false, 1, undefined]);
	});

	test('chat after applying diagrams opens without a prompt to repeat the completed generation', async () => {
		const f = fixture(); f.prepareExploratoryDraft();
		await f.service.buildDiagrams(); await f.service.reviewDiagramProposal('draft-review'); await f.service.applyDiagramReview();
		await f.service.chat();
		assert.equal(f.dialogs.at(-1)!.prompt, '');
		assert.equal(f.service.diagramExploration?.proposals[0].status, 'applied');
	});

	for (const native of [false, true]) {
		test(`${native ? 'native' : 'CLI'} model-to-code update opens an independent coding modal with the saved project context`, async () => {
			const f = fixture(); f.enableIncremental();
			if (native) { f.publishAccount({ status: 'signedIn' }); f.setups.push({ agent: 'codex', download: 'ready' }); }
			await f.service.buildDiagrams();
			await f.service.updateCodebase();
			assert.equal(f.contextFiles.size, 1);
			const [file, text] = [...f.contextFiles][0];
			const context = JSON.parse(text);
			assert.deepStrictEqual([context.root, context.modelFile, context.model, context.scope], [f.root, f.project.modelUri.fsPath, f.project.model, 'saved-model']);
			const prompt = native ? f.chatPrompts.at(-1)! : f.dialogs.at(-1)!.prompt!;
			assert.ok(prompt.includes(file) && prompt.includes('desired specification') && prompt.includes('meaningful tests'));
			assert.equal(f.requests.includes('diagramChat'), false);
			if (native) {
				assert.equal(f.sessionTools.has(f.chats.at(-1)!.resource), false);
				assert.ok(f.chats.at(-1)!.attachments.includes(URI.file(file).toString()));
			} else {
				await f.dialogs.at(-1)!.send!([{ role: 'user', text: prompt }], CancellationToken.None);
				assert.deepStrictEqual([f.chatRequests[0].root, f.chatRequests[0].snapshot, f.chatRequests[0].sessionId], [f.root, undefined, undefined]);
				f.project.model.name = 'A newer unsaved specification';
				await assert.rejects(f.dialogs.at(-1)!.send!([{ role: 'user', text: 'Continue' }], CancellationToken.None), /Model Changed/);
			}
			assert.deepStrictEqual(f.errors, []);
		});
	}

	test('declining the save suggestion keeps the model saved and never opens a coding request', async () => {
		const f = fixture(); f.setConfirmed(false);
		f.savedModel.fire({ modelUri: f.project.modelUri.toString(), model: structuredClone(f.project.model), changes: [{ collection: 'elements', id: 'new-feature', before: null, after: { name: 'New feature' } }] });
		await new Promise<void>(resolve => setTimeout(resolve, 0));
		assert.deepStrictEqual([f.dialogDetails.length, f.dialogs.length, f.contextFiles.size], [1, 0, 0]);
	});

	test('accepting the save suggestion includes exact before and after definitions in the coding context', async () => {
		const f = fixture();
		const changes = [{ collection: 'elements', id: 'changed-feature', before: { name: 'Before' }, after: { name: 'After' } }];
		f.savedModel.fire({ modelUri: f.project.modelUri.toString(), model: structuredClone(f.project.model), changes });
		await new Promise<void>(resolve => setTimeout(resolve, 0));
		assert.deepStrictEqual(JSON.parse([...f.contextFiles.values()][0]).changes, changes);
		assert.deepStrictEqual([f.dialogs.length, f.requests.includes('diagramChat')], [1, false]);
	});

	test('updating waits for the current project codebase and canceling setup never opens the assistant', async () => {
		const f = fixture(); f.enableIncremental();
		const prepared = new DeferredPromise<boolean>(); f.holdProjectContext(prepared.p);
		const pending = f.service.updateDiagrams();
		assert.deepStrictEqual([f.dialogs.length, f.requests], [0, []]);
		await prepared.complete(false); await pending;
		assert.deepStrictEqual([f.dialogs.length, f.requests], [0, []]);
	});

	for (const native of [false, true]) {
		test(`${native ? 'native' : 'CLI'} codebase update pre-fills an editable prompt without sending or leaking it into the next chat`, async () => {
			const f = fixture(); f.prepareExploratoryDraft();
			if (native) { f.publishAccount({ status: 'signedIn' }); f.setups.push({ agent: 'codex', download: 'ready' }); }
			await f.service.buildDiagrams(); await f.service.reviewDiagramProposal('draft-review'); await f.service.applyDiagramReview();
			await f.service.updateDiagrams();
			const prompt = native ? f.chatPrompts.at(-1) : f.dialogs.at(-1)!.prompt;
			assert.ok(prompt); assert.ok(prompt.startsWith('Update the project diagrams from the current codebase using the ADE tools.'));
			for (const intent of ['preserve existing diagram and object IDs', 'manual layout', 'single complete project review', 'Do not publish changes']) { assert.ok(prompt.includes(intent), intent); }
			assert.deepStrictEqual([f.requests.includes('diagramChat'), f.errors], [false, []], 'prefilling never submits a model request');
			await f.service.returnToDiagrams(); await f.service.chat();
			assert.equal(native ? f.chatPrompts.at(-1) : f.dialogs.at(-1)!.prompt, '', 'ordinary chat remains independent after the dialog closes');
		});
	}

	test('declining a reviewed diagram preserves both the draft and its decision surface', async () => {
		const f = fixture(); f.prepareExploratoryDraft(); f.publishAccount({ status: 'signedIn' }); f.setups.push({ agent: 'codex', download: 'ready' });
		await f.service.buildDiagrams(); f.setConfirmed(false); await f.service.reviewDiagramProposal('draft-review'); await f.service.applyDiagramReview();
		assert.deepStrictEqual([f.explorationActions, f.opened.length, f.service.diagramReview?.id, f.service.diagramExploration?.proposals[0].status], [['open', 'open', 'ade_view_preview'], 0, 'draft-review', 'ready']);
	});

	test('a changed model blocks application of a previously reviewed diagram', async () => {
		const f = fixture(); f.prepareExploratoryDraft(); f.publishAccount({ status: 'signedIn' }); f.setups.push({ agent: 'codex', download: 'ready' });
		await f.service.buildDiagrams(); await f.service.reviewDiagramProposal('draft-review');
		f.project.model.name = 'Changed after review';
		await f.service.applyDiagramReview();
		assert.deepStrictEqual([f.opened.length, f.explorationActions.includes('publish'), !!f.service.diagramReview?.problem, f.errors], [0, false, true, []]);
	});

	test('an invalid imported draft remains readable but cannot publish through the service', async () => {
		const f = fixture(); f.prepareExploratoryDraft('invalid'); f.publishAccount({ status: 'signedIn' }); f.setups.push({ agent: 'codex', download: 'ready' });
		await f.service.buildDiagrams(); await f.service.reviewDiagramProposal('draft-review'); await f.service.applyDiagramReview();
		assert.deepStrictEqual([f.service.diagramReview?.proposal.status, f.service.diagramReview?.changes[0].after?.name, f.opened.length, f.explorationActions.includes('publish')], ['invalid', 'Reviewed responsibility', 0, false]);
	});

	test('closing a draft review makes a stale apply action harmless', async () => {
		const f = fixture(); f.prepareExploratoryDraft(); f.publishAccount({ status: 'signedIn' }); f.setups.push({ agent: 'codex', download: 'ready' });
		await f.service.buildDiagrams(); await f.service.reviewDiagramProposal('draft-review'); f.service.closeDiagramReview(); await f.service.applyDiagramReview();
		assert.deepStrictEqual([f.service.diagramReview, f.opened.length, f.explorationActions.includes('publish')], [undefined, 0, false]);
	});

});
