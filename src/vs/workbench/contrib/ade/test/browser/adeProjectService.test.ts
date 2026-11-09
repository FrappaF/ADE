/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { messagingFixture } from '../common/messagingFixture.js';
import { stateFixture } from '../common/stateFixture.js';
import { interactionFixture } from '../common/interactionFixture.js';
import { createPureProject } from '../../common/modelProject.js';
import { switchModelStack } from '../../common/modelStack.js';
import { nodeOrdersFixture } from '../common/nodeOrdersFixture.js';
import { blueprintFixture } from '../common/blueprintFixture.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { URI } from '../../../../../base/common/uri.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfirmResult, IDialogService, IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { FileChangesEvent, FileChangeType, IFileContent, IFileSystemWatcher } from '../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { AdeProjectService } from '../../browser/adeProjectService.js';
import { IWorkspaceContextService, IWorkspaceFoldersChangeEvent } from '../../../../../platform/workspace/common/workspace.js';
import { testWorkspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { projectDocuments } from './testProjectDocuments.js';
import { migrateSemanticModelToV4 } from '../../common/modelMigration.js';
import { checkoutModel } from '../../common/checkoutModel.js';
import { libraryModel, observatoryModel } from '../common/independentProjects.js';

class ModelDialogs extends mock<IFileDialogService>() {
	selected: URI | undefined;
	saveTarget: URI | undefined;
	choice = ConfirmResult.CANCEL;
	override async showOpenDialog(): Promise<URI[] | undefined> { return this.selected ? [this.selected] : undefined; }
	override async showSaveConfirm(): Promise<ConfirmResult> { return this.choice; }
	override async showSaveDialog(): Promise<URI | undefined> { return this.saveTarget; }
}

class DelayedFileService extends FileService {
	delay: { resource: URI; gate: DeferredPromise<void> } | undefined;
	private readonly watchers = new Set<{ resource: URI; emitter: Emitter<FileChangesEvent> }>();
	get watcherCount(): number { return this.watchers.size; }
	override createWatcher(resource: URI): IFileSystemWatcher {
		const store = new DisposableStore();
		const emitter = store.add(new Emitter<FileChangesEvent>());
		const watcher = { resource, emitter };
		this.watchers.add(watcher);
		store.add(toDisposable(() => this.watchers.delete(watcher)));
		return { onDidChange: emitter.event, dispose: () => store.dispose() };
	}
	emitWatch(resource: URI): void {
		for (const watcher of this.watchers) {
			if (watcher.resource.toString() === resource.toString()) { watcher.emitter.fire(new FileChangesEvent([{ resource, type: FileChangeType.UPDATED }], false)); }
		}
	}
	override async readFile(resource: URI): Promise<IFileContent> {
		if (resource.toString() === this.delay?.resource.toString()) { await this.delay.gate.p; }
		return super.readFile(resource);
	}
}

suite('A.D.E project context', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let storage: InMemoryStorageService;
	let files: DelayedFileService;
	let dialogs: ModelDialogs;
	let contextFolders: URI[] = [];
	let workspaceChanges: Emitter<IWorkspaceFoldersChangeEvent>;
	let confirmExisting = false;
	const workspaceContext = new class extends mock<IWorkspaceContextService>() {
		override get onDidChangeWorkspaceFolders() { return workspaceChanges.event; }
		override getWorkspace() { return testWorkspace(...contextFolders); }
	};
	const projectDialogs = new class extends mock<IDialogService>() { override async confirm() { return { confirmed: confirmExisting }; } };
	let documents: ReturnType<typeof projectDocuments>;
	const resource = URI.parse('test:/checkout.ade.json');

	setup(async () => {
		contextFolders = []; confirmExisting = false;
		workspaceChanges = disposables.add(new Emitter<IWorkspaceFoldersChangeEvent>());
		storage = disposables.add(new InMemoryStorageService());
		files = disposables.add(new DelayedFileService(new NullLogService()));
		const provider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(files.registerProvider('test', provider));
		await files.writeFile(resource, VSBuffer.fromString(JSON.stringify(checkoutModel)));
		dialogs = new ModelDialogs();
		documents = projectDocuments(files, disposables);
	});

	test('a new workspace restores its project and resolves imported snapshots to the source root', async () => {
		const folder = URI.parse('test:/project with spaces');
		await files.writeFile(URI.joinPath(folder, '.ade', 'model.json'), VSBuffer.fromString(JSON.stringify(checkoutModel)));
		contextFolders = [folder];
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		await project.restore();
		assert.deepStrictEqual([project.projectRoot?.toString(), project.model.id], [folder.toString(), checkoutModel.id]);
		const snapshot = URI.joinPath(folder, '.ade', 'imports', 'snapshot', 'model.ade.json');
		await files.writeFile(snapshot, VSBuffer.fromString(JSON.stringify(checkoutModel)));
		await project.openModelResource(snapshot);
		assert.strictEqual(project.projectRoot?.toString(), folder.toString());
	});
	test('native workspace changes replace the active project and empty folders clear the old model', async () => {
		const first = URI.parse('test:/first'), second = URI.parse('test:/second');
		contextFolders = [first];
		await files.writeFile(URI.joinPath(first, '.ade/model.json'), VSBuffer.fromString(JSON.stringify(checkoutModel)));
		await files.writeFile(URI.joinPath(second, '.ade/model.json'), VSBuffer.fromString(JSON.stringify(libraryModel)));
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		await project.restore();
		contextFolders = [first, second];
		await project.followWorkspace();
		assert.strictEqual(project.projectRoot?.toString(), first.toString(), 'adding a root preserves the current project');
		contextFolders = [second];
		const switched = Event.toPromise(Event.filter(project.onDidChange, () => project.model.id === libraryModel.id && !project.loading));
		workspaceChanges.fire({ added: [], removed: [], changed: [] });
		await switched;
		assert.deepStrictEqual([project.projectRoot?.toString(), project.model.id], [second.toString(), libraryModel.id]);
		contextFolders = [URI.parse('test:/empty')];
		await project.followWorkspace();
		assert.deepStrictEqual([project.modelUri, project.section, project.model.semantics.elements.length, project.model.views.length], [undefined, 'home', 0, 0]);
	});

	test('cancelled folder switch keeps unsaved work and retry saves before opening the new folder', async () => {
		const first = URI.parse('test:/first'), second = URI.parse('test:/second');
		const source = URI.joinPath(first, '.ade/model.json');
		contextFolders = [first];
		await files.writeFile(source, VSBuffer.fromString(JSON.stringify(checkoutModel)));
		await files.writeFile(URI.joinPath(second, '.ade/model.json'), VSBuffer.fromString(JSON.stringify(libraryModel)));
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		await project.restore();
		project.edit({ kind: 'rename', target: 'element', id: 'payment', name: 'Keep My Work' });
		contextFolders = [second];
		await project.followWorkspace();
		assert.ok(project.error?.includes('workspace folder changed'));
		assert.deepStrictEqual([project.dirty, project.editable, project.modelUri, project.projectRoot], [true, false, undefined, undefined]);
		assert.ok(!JSON.parse((await files.readFile(source)).value.toString()).semantics.elements.some((element: { name: string }) => element.name === 'Keep My Work'));
		dialogs.choice = ConfirmResult.SAVE;
		await project.retry();
		assert.strictEqual(project.model.id, libraryModel.id);
		assert.ok(JSON.parse((await files.readFile(source)).value.toString()).semantics.elements.some((element: { name: string }) => element.name === 'Keep My Work'));
	});

	test('copied workspace state cannot restore a project belonging to a different folder', async () => {
		contextFolders = [URI.parse('test:/new-folder')];
		storage.store('ade.shell.model', resource.toString(), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		storage.store('ade.shell.workspace', JSON.stringify(['test:/old-folder']), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		storage.store('ade.shell.section', 'diagram', StorageScope.WORKSPACE, StorageTarget.MACHINE);
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		await project.restore();
		assert.deepStrictEqual([project.modelUri, project.section, project.model.views.length], [undefined, 'home', 0]);
	});

	test('an existing project is opened only after confirmation, without overwriting its model', async () => {
		const folder = URI.parse('test:/existing');
		const model = URI.joinPath(folder, '.ade', 'model.json');
		const original = JSON.stringify(checkoutModel);
		await files.writeFile(model, VSBuffer.fromString(original));
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		assert.strictEqual(await project.createProject('Replacement', folder), false);
		confirmExisting = true;
		assert.strictEqual(await project.createProject('Replacement', folder), true);
		assert.deepStrictEqual([project.model.id, (await files.readFile(model)).value.toString()], [checkoutModel.id, original]);
	});

	test('opens the active imported snapshot from a code project folder and rejects pointer traversal', async () => {
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		const folder = URI.parse('test:/codebase');
		const version = '11111111-1111-4111-8111-111111111111';
		const directory = URI.joinPath(folder, '.ade', 'imports', version);
		await files.createFolder(directory);
		const model = URI.joinPath(directory, 'model.ade.json');
		await files.writeFile(model, VSBuffer.fromString(JSON.stringify(checkoutModel)));
		const pointer = URI.joinPath(folder, '.ade', 'code-project.json');
		await files.writeFile(pointer, VSBuffer.fromString(JSON.stringify({ version: 1, active: version })));
		await project.openProject(folder);
		assert.strictEqual(project.modelUri?.toString(), model.toString());
		assert.strictEqual(project.model.id, checkoutModel.id);
		await files.writeFile(pointer, VSBuffer.fromString(JSON.stringify({ version: 1, active: '../../other' })));
		await assert.rejects(project.openProject(folder), /Invalid code project snapshot/);
		assert.strictEqual(project.modelUri?.toString(), model.toString());
	});

	test('restores diagram and independent selections after a workspace restart', async () => {
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		await project.restore();
		dialogs.selected = resource;
		await project.chooseModel();
		project.showDiagram('purchase-outcome');
		project.selectElement('declined');
		project.showDiagram('cart-structure');
		project.selectElement('cart');
		await storage.flush();
		project.dispose();
		const restored = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		await restored.restore();
		assert.deepStrictEqual([restored.section, restored.activeView?.id, restored.selectedId, restored.modelUri?.toString()],
			['diagram', 'cart-structure', 'cart', resource.toString()]);
		restored.showDiagram('purchase-outcome');
		assert.strictEqual(restored.selectedId, 'declined');
	});

	test('migrates M1 selection and recovers from invalid saved presentation state', async () => {
		storage.store('ade.shell.section', 'properties', StorageScope.WORKSPACE, StorageTarget.MACHINE);
		storage.store('ade.shell.selection', 'payment', StorageScope.WORKSPACE, StorageTarget.MACHINE);
		storage.store('ade.shell.diagramSelections', '{broken', StorageScope.WORKSPACE, StorageTarget.MACHINE);
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		await project.restore();
		assert.deepStrictEqual([project.section, project.activeView?.id, project.selectedId], ['diagram', 'purchase-structure', 'payment']);
	});

	test('migrates the M2.1 branch profile and gives newer presentation keys precedence', async () => {
		storage.store('ade.visual.home', false, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		storage.store('ade.visual.context', JSON.stringify({ viewId: 'cancellation-structure', selections: { 'purchase-structure': 'payment', 'cancellation-structure': 'order' } }), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		storage.store('ade.shell.model', resource.toString(), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		await project.restore();
		assert.deepStrictEqual([project.section, project.activeView?.id, project.selectedId, project.dirty], ['diagram', 'cancellation-structure', 'order', false]);
		project.showDiagram('purchase-structure');
		assert.strictEqual(project.selectedId, 'payment');
		await storage.flush();
		project.dispose();
		const restored = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		await restored.restore();
		assert.deepStrictEqual([restored.activeView?.id, restored.selectedId], ['purchase-structure', 'payment']);
	});

	test('ignores malformed branch profile data while preserving current selections', async () => {
		storage.store('ade.visual.context', '{', StorageScope.WORKSPACE, StorageTarget.MACHINE);
		storage.store('ade.shell.diagram', 'purchase-outcome', StorageScope.WORKSPACE, StorageTarget.MACHINE);
		storage.store('ade.shell.diagramSelections', JSON.stringify({ 'purchase-outcome': 'declined' }), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		await project.restore();
		assert.deepStrictEqual([project.activeView?.id, project.selectedId, project.error], ['purchase-outcome', 'declined', undefined]);
	});

	test('system map is a restored history destination and never overwrites per-diagram selections', async () => {
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		await project.restore();
		dialogs.selected = resource;
		await project.chooseModel();
		project.showDiagram('purchase-outcome');
		project.selectElement('declined');
		project.showSystemMap();
		assert.deepStrictEqual([project.section, project.activeView, project.dirty], ['map', undefined, false]);
		project.inspectElement('payment-contract');
		project.goBack();
		assert.strictEqual(project.section, 'map');
		project.goBack();
		assert.deepStrictEqual([project.section, project.selectedId], ['diagram', 'declined']);
		project.goForward();
		dialogs.saveTarget = URI.parse('test:/map-copy.ade.json');
		assert.strictEqual(await project.saveAs(), true);
		await storage.flush();
		project.dispose();
		const restored = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		await restored.restore();
		assert.deepStrictEqual([restored.section, restored.activeView, restored.canGoBack, restored.dirty], ['map', undefined, false, false]);
		restored.showDiagram('purchase-outcome');
		assert.strictEqual(restored.selectedId, 'declined');
	});

	test('invalid documents expose diagnostics and retry recovers without writing the source', async () => {
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		dialogs.selected = resource;
		await files.writeFile(resource, VSBuffer.fromString('{"version":99}'));
		await project.chooseModel();
		assert.ok(project.error?.includes('Expected:'));
		assert.strictEqual((await files.readFile(resource)).value.toString(), '{"version":99}');
		await files.writeFile(resource, VSBuffer.fromString(JSON.stringify(checkoutModel)));
		await project.retry();
		assert.deepStrictEqual([project.loading, project.error, project.activeView?.id], [false, undefined, 'purchase-structure']);
	});

	test('a superseded asynchronous load cannot overwrite a newer document or the demo', async () => {
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		const gate = new DeferredPromise<void>();
		files.delay = { resource, gate };
		dialogs.selected = resource;
		const pending = project.chooseModel();
		await Promise.resolve();
		const second = URI.parse('test:/other.ade.json');
		await files.writeFile(second, VSBuffer.fromString(JSON.stringify({ ...checkoutModel, id: 'other', name: 'Other' })));
		dialogs.selected = second;
		await project.chooseModel();
		await gate.complete();
		await pending;
		assert.deepStrictEqual([project.model.id, project.modelUri?.toString(), project.loading], ['other', second.toString(), false]);
		files.delay = { resource, gate: new DeferredPromise<void>() };
		dialogs.selected = resource;
		const obsolete = project.chooseModel();
		await Promise.resolve();
		await project.useDemo();
		await files.delay.gate.complete();
		await obsolete;
		assert.deepStrictEqual([project.model.id, project.modelUri, project.loading, project.error], ['checkout-example', undefined, false, undefined]);
	});

	test('switching documents resets selections even when their diagram identities coincide', async () => {
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		dialogs.selected = resource;
		await project.chooseModel();
		project.showDiagram('purchase-outcome');
		project.selectElement('declined');
		const other = URI.parse('test:/other.ade.json');
		await files.writeFile(other, VSBuffer.fromString(JSON.stringify(checkoutModel)));
		dialogs.selected = other;
		await project.chooseModel();
		assert.deepStrictEqual([project.activeView?.id, project.selectedId], ['purchase-structure', 'customer']);
	});

	test('choosing the demo releases navigation from a pending workspace restore', async () => {
		storage.store('ade.shell.model', resource.toString(), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		const gate = new DeferredPromise<void>();
		files.delay = { resource, gate };
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		const pending = project.restore();
		try {
			await project.useDemo();
			let ready = false;
			void project.restore().then(() => { ready = true; });
			await Promise.resolve();
			assert.strictEqual(ready, true);
		} finally {
			await gate.complete();
			await pending;
		}
		assert.deepStrictEqual([project.modelUri, project.loading, project.error], [undefined, false, undefined]);
	});

	test('creates an empty project without overwrites, and records feature creation as one native undo transaction', async () => {
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		const folder = URI.parse('test:/project');
		assert.strictEqual(await project.createProject('Checkout', folder), true);
		assert.deepStrictEqual([project.model.version, project.model.name, project.model.views.length, project.dirty], [4, 'Checkout', 0, false]);
		project.editBatch([
			{ kind: 'feature', id: 'purchase', name: 'Conferma acquisto' },
			{ kind: 'diagram', id: 'structure', featureId: 'purchase', name: 'Struttura', viewKind: 'structure' },
			{ kind: 'diagram', id: 'flow', featureId: 'purchase', name: 'Flusso', viewKind: 'activity' }
		]);
		assert.deepStrictEqual([project.model.views.length, project.dirty, project.canUndo], [2, true, true]);
		await project.undo();
		assert.deepStrictEqual([project.model.views.length, project.model.semantics.elements.length, project.dirty, project.canRedo], [0, 0, false, true]);
		await project.redo();
		assert.strictEqual(project.model.views[1].featureId, 'purchase');
		assert.strictEqual(await project.save(), true);
		const snapshot = (await files.readFile(project.modelUri!)).value.toString();
		assert.strictEqual(await project.createProject('Replacement', folder), false);
		assert.strictEqual((await files.readFile(project.modelUri!)).value.toString(), snapshot);
	});

	test('visual edits upgrade v2 only on mutation, save and reopen preserve semantic identity and layout', async () => {
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		dialogs.selected = resource;
		await project.chooseModel();
		assert.strictEqual(project.model.version, 2);
		project.edit({ kind: 'rename', target: 'element', id: 'payment', name: 'Autorizza pagamento' });
		project.edit({ kind: 'position', viewId: 'purchase-structure', id: 'payment', x: -100, y: 260 });
		assert.deepStrictEqual([project.model.version, project.dirty], [3, true]);
		await project.undo();
		assert.strictEqual(project.model.views[0].nodes.find(node => node.elementId === 'payment')!.x, 520);
		await project.redo();
		assert.strictEqual(await project.save(), true);
		await project.retry();
		assert.deepStrictEqual([project.model.semantics.elements.find(element => element.id === 'payment')!.name, project.model.views[0].nodes.find(node => node.elementId === 'payment')!.x, project.dirty], ['Autorizza pagamento', -100, false]);
	});

	test('contract editing shares identity across details and diagrams with native undo, redo and persistence', async () => {
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		dialogs.selected = resource;
		await project.chooseModel();
		project.inspectElement('payment-contract');
		const behavior = { inputs: [{ name: 'amount', type: 'Money', required: true }], outputs: [], preconditions: ['Amount is positive'], postconditions: [], errors: [], permissions: [], acceptanceCriteria: [] };
		project.edit({ kind: 'behavior', id: 'payment-contract', behavior });
		const edited = structuredClone(project.model);
		await project.undo();
		assert.deepStrictEqual([project.model.version, project.model.semantics.elements.find(element => element.id === 'payment-contract')!.behavior, project.dirty], [2, undefined, false]);
		await project.redo();
		assert.deepStrictEqual(project.model, edited);
		project.edit({ kind: 'include', id: 'payment-contract', viewId: 'purchase-structure' });
		project.revealElement('payment-contract', 'purchase-structure');
		assert.deepStrictEqual([project.section, project.selectedId, project.model.semantics.elements.find(element => element.id === project.selectedId)!.behavior], ['diagram', 'payment-contract', behavior]);
		await project.save();
		await project.retry();
		assert.deepStrictEqual([project.model.semantics.elements.find(element => element.id === 'payment-contract')!.behavior, project.dirty], [behavior, false]);
	});

	test('sequence order and shared messages use native undo, save, restart and context repair', async () => {
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		dialogs.selected = resource;
		await project.chooseModel();
		project.editBatch([
			{ kind: 'diagram', id: 'sequence', name: 'Purchase Sequence', viewKind: 'sequence', featureId: 'purchase' },
			{ kind: 'sequenceMessage', viewId: 'sequence', id: 'checkout-confirm' },
			{ kind: 'sequenceMessage', viewId: 'sequence', id: 'confirm-order' }
		]);
		project.showDiagram('sequence');
		project.selectElement('checkout-controller');
		project.edit({ kind: 'sequenceOrder', viewId: 'sequence', id: 'confirm-order', target: 'message', direction: -1 });
		await project.undo();
		assert.deepStrictEqual(project.activeView!.relationIds, ['checkout-confirm', 'confirm-order']);
		await project.redo();
		project.edit({ kind: 'condition', id: 'confirm-order', condition: 'Authorized payment' });
		await project.save();
		await storage.flush();
		project.dispose();
		const restarted = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		await restarted.restore();
		assert.deepStrictEqual([restarted.activeView!.kind, restarted.activeView!.relationIds, restarted.selectedId, restarted.dirty], ['sequence', ['confirm-order', 'checkout-confirm'], 'checkout-controller', false]);
		restarted.showDiagram('purchase-structure');
		assert.strictEqual(restarted.model.semantics.relations.find(relation => relation.id === 'confirm-order')!.condition, 'Authorized payment');
		restarted.showDiagram('sequence');
		restarted.edit({ kind: 'sequenceRemove', viewId: 'sequence', id: 'checkout-controller', target: 'participant' });
		assert.deepStrictEqual([restarted.activeView!.relationIds, restarted.model.semantics.elements.length, restarted.model.semantics.relations.length, restarted.selectedId], [[], checkoutModel.semantics.elements.length, checkoutModel.semantics.relations.length, 'checkout']);
	});

	test('resource state views share transitions and persist native history and repaired selection', async () => {
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		dialogs.selected = resource;
		await project.chooseModel();
		project.editBatch([
			{ kind: 'stateDiagram', id: 'states', name: 'Order States', featureId: 'purchase', resourceId: 'order' },
			{ kind: 'stateLifecycle', viewId: 'states', resourceId: 'order' }
		]);
		await project.undo();
		assert.strictEqual(project.model.version, 2);
		await project.redo();
		project.showDiagram('states');
		project.selectElement('pending');
		project.edit({ kind: 'renameRelation', id: 'order-confirmed', name: 'Payment Accepted' });
		await project.save();
		await storage.flush();
		project.dispose();
		const restored = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		await restored.restore();
		assert.deepStrictEqual([restored.activeView!.kind, restored.activeView!.relationIds, restored.selectedId, restored.dirty], ['state', ['order-confirmed', 'order-declined'], 'pending', false]);
		const semantics = structuredClone(restored.model.semantics);
		restored.edit({ kind: 'exclude', viewId: 'states', id: 'pending', target: 'element' });
		assert.deepStrictEqual([restored.model.semantics, restored.activeView!.relationIds, restored.selectedId], [semantics, [], 'order']);
		await restored.undo();
		assert.deepStrictEqual(restored.activeView!.relationIds, ['order-confirmed', 'order-declined']);
		restored.showDiagram('purchase-outcome');
		assert.strictEqual(restored.model.semantics.relations.find(relation => relation.id === 'order-confirmed')!.name, 'Payment Accepted');
	});

	test('resource creation and its state diagram are atomic when a later batch edit is invalid', async () => {
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		dialogs.selected = resource;
		await project.chooseModel();
		const before = structuredClone(project.model);
		assert.throws(() => project.editBatch([
			{ kind: 'resource', id: 'shipment', name: 'Shipment', parentId: 'purchase' },
			{ kind: 'stateDiagram', id: 'shipment-state', name: 'Shipment States', featureId: 'missing', resourceId: 'shipment' }
		]));
		assert.deepStrictEqual([project.model, project.dirty, project.canUndo], [before, false, false]);
	});

	test('impact is a read-only navigation destination that restores through history, save copy and restart', async () => {
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		dialogs.selected = resource;
		await project.chooseModel();
		project.showImpact('payment-contract');
		assert.deepStrictEqual([project.section, project.selectedId, project.activeView, project.dirty, project.model.version], ['impact', 'payment-contract', undefined, false, 2]);
		project.goBack();
		assert.strictEqual(project.section, 'diagram');
		project.goForward();
		assert.strictEqual(project.section, 'impact');
		project.edit({ kind: 'rename', id: 'payment-contract', target: 'element', name: 'Payment Contract Updated' });
		dialogs.saveTarget = URI.parse('test:/impact-copy.json');
		assert.strictEqual(await project.saveAs(), true);
		await storage.flush();
		project.dispose();
		const restored = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		await restored.restore();
		assert.deepStrictEqual([restored.section, restored.selectedId, restored.activeView, restored.modelUri!.toString(), restored.model.semantics.elements.find(element => element.id === 'payment-contract')!.name, restored.dirty], ['impact', 'payment-contract', undefined, dialogs.saveTarget.toString(), 'Payment Contract Updated', false]);
		restored.edit({ kind: 'deleteElement', id: 'payment-contract' });
		assert.strictEqual(restored.section, 'diagram');
	});

	test('changing documents clears impact even when identities coincide and failed loads do not expose the old report', async () => {
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		dialogs.selected = resource;
		await project.chooseModel();
		project.showImpact('payment-contract');
		const other = URI.parse('test:/other-impact.json');
		await files.writeFile(other, VSBuffer.fromString(JSON.stringify({ ...checkoutModel, id: 'other' })));
		dialogs.selected = other;
		await project.chooseModel();
		assert.deepStrictEqual([project.section, project.canGoBack, project.dirty], ['diagram', false, false]);
		project.showImpact('payment-contract');
		await files.writeFile(other, VSBuffer.fromString('{"version":99}'));
		await project.retry();
		assert.ok(project.error);
	});

	test('independent project files with overlapping IDs retain their own topology and inspector context', async () => {
		const library = URI.parse('test:/independent-library.json');
		const observatory = URI.parse('test:/independent-observatory.json');
		await files.writeFile(library, VSBuffer.fromString(JSON.stringify(libraryModel)));
		await files.writeFile(observatory, VSBuffer.fromString(JSON.stringify(observatoryModel)));
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		dialogs.selected = library;
		await project.chooseModel();
		assert.deepStrictEqual(project.model, libraryModel);
		project.showDiagram('states');
		project.selectElement('active');
		project.showImpact('contract');
		dialogs.saveTarget = URI.parse('test:/independent-copy.json');
		await project.saveAs();
		await storage.flush();
		project.dispose();
		const restored = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		await restored.restore();
		assert.deepStrictEqual([restored.model, restored.section, restored.selectedId, restored.dirty], [libraryModel, 'impact', 'contract', false]);
		dialogs.selected = observatory;
		await restored.chooseModel();
		assert.deepStrictEqual([restored.model, restored.section, restored.activeView, restored.selectedId, restored.canGoBack], [observatoryModel, 'diagram', undefined, '', false]);
		restored.edit({ kind: 'diagram', id: 'structure', name: 'Acquisizioni', featureId: 'feature', viewKind: 'structure' });
		restored.edit({ kind: 'include', viewId: 'structure', id: 'scheduler' });
		await restored.save();
		dialogs.selected = library;
		await restored.chooseModel();
		assert.deepStrictEqual(restored.model, libraryModel);
	});

	test('empty projects create independent resource lifecycles with native undo and round-trip persistence', async () => {
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		await project.createProject('Stazione oceanografica', URI.parse('test:/marine-laboratory'));
		assert.deepStrictEqual([project.model.semantics.elements, project.model.views, project.model.codeMappings, project.model.verifications], [[], [], [], []]);
		project.editBatch([
			{ kind: 'feature', id: 'acquisition', name: 'Acquisizione' },
			{ kind: 'resource', id: 'sample', name: 'Campione', parentId: 'acquisition' },
			{ kind: 'stateDiagram', id: 'sample-states', name: 'Stati del campione', featureId: 'acquisition', resourceId: 'sample' },
			{ kind: 'element', id: 'fresh', name: 'Nuovo', elementKind: 'state', parentId: 'sample', viewId: 'sample-states' },
			{ kind: 'element', id: 'archived', name: 'Archiviato', elementKind: 'state', parentId: 'sample', viewId: 'sample-states' },
			{ kind: 'relation', id: 'archive', name: 'Archivia', relationKind: 'transition', from: 'fresh', to: 'archived', condition: 'Misura valida', viewId: 'sample-states' }
		]);
		project.showDiagram('sample-states');
		project.selectElement('archived');
		await project.undo();
		assert.strictEqual(project.model.semantics.elements.length, 0);
		await project.redo();
		await project.save();
		await project.retry();
		assert.deepStrictEqual([project.model.name, project.model.semantics.elements.map(element => element.id), project.model.semantics.relations.map(relation => relation.id), project.dirty], ['Stazione oceanografica', ['acquisition', 'sample', 'fresh', 'archived'], ['archive'], false]);
	});

	test('saving a copy preserves diagram and selections across source revert and workspace restart', async () => {
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		dialogs.selected = resource;
		await project.chooseModel();
		project.showDiagram('cart-structure');
		project.selectElement('cart');
		project.showDiagram('purchase-outcome');
		project.selectElement('declined');
		project.edit({ kind: 'rename', target: 'element', id: 'declined', name: 'Declined in Copy' });
		const target = URI.parse('test:/copy.ade.json');
		dialogs.saveTarget = target;
		assert.strictEqual(await project.saveAs(), true);
		await storage.flush();
		project.dispose();
		const restored = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		await restored.restore();
		const outcome = { resource: restored.modelUri?.toString(), view: restored.activeView?.id, selected: restored.selectedId, dirty: restored.dirty, name: restored.model.semantics.elements.find(element => element.id === 'declined')?.name };
		restored.showDiagram('cart-structure');
		assert.deepStrictEqual({ ...outcome, otherSelection: restored.selectedId, source: JSON.parse((await files.readFile(resource)).value.toString()) },
			{ resource: target.toString(), view: 'purchase-outcome', selected: 'declined', dirty: false, name: 'Declined in Copy', otherSelection: 'cart', source: checkoutModel });
	});

	test('a completed save copy cannot reopen a project superseded during file IO', async () => {
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		dialogs.selected = resource;
		await project.chooseModel();
		const target = URI.parse('test:/copy.ade.json');
		dialogs.saveTarget = target;
		const started = new DeferredPromise<void>();
		const saved = new DeferredPromise<URI>();
		documents.textFiles.saveAs = async () => { started.complete(); return saved.p; };
		const copying = project.saveAs();
		await started.p;
		await project.useDemo();
		saved.complete(target);
		assert.deepStrictEqual({ result: await copying, resource: project.modelUri, loading: project.loading, model: project.model },
			{ result: false, resource: undefined, loading: false, model: checkoutModel });
	});

	test('semantic exploration reaches unplaced contracts and restores exact perspectives without dirtying the model', async () => {
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		dialogs.selected = resource;
		await project.chooseModel();
		project.revealElement('payment', 'purchase-outcome');
		project.revealElement('payment-contract');
		assert.deepStrictEqual([project.section, project.activeView, project.selectedId, project.dirty], ['element', undefined, 'payment-contract', false]);
		project.goBack();
		assert.deepStrictEqual([project.section, project.activeView?.id, project.selectedId], ['diagram', 'purchase-outcome', 'payment']);
		project.goForward();
		project.inspectElement('purchase');
		project.revealElement('payment', 'purchase-structure');
		assert.deepStrictEqual([project.activeView?.id, project.selectedId, project.canGoForward, project.model], ['purchase-structure', 'payment', false, checkoutModel]);
	});

	test('inspector context survives save copy and restart while history remains local to the new document', async () => {
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		dialogs.selected = resource;
		await project.chooseModel();
		project.inspectElement('payment-contract');
		project.edit({ kind: 'rename', target: 'element', id: 'payment-contract', name: 'Payment Contract' });
		dialogs.saveTarget = URI.parse('test:/copy.ade.json');
		await project.saveAs();
		await storage.flush();
		project.dispose();
		const restored = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		await restored.restore();
		assert.deepStrictEqual([restored.section, restored.selectedId, restored.activeView, restored.canGoBack, restored.model.semantics.elements.find(element => element.id === 'payment-contract')?.name,
			JSON.parse((await files.readFile(resource)).value.toString())], ['element', 'payment-contract', undefined, false, 'Payment Contract', checkoutModel]);
	});

	test('deleting inspected identities repairs context and opening another file clears navigation history', async () => {
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		dialogs.selected = resource;
		await project.chooseModel();
		project.inspectElement('payment-contract');
		project.edit({ kind: 'deleteElement', id: 'payment-contract' });
		assert.deepStrictEqual([project.section, project.activeView?.id], ['diagram', 'purchase-structure']);
		await project.undo();
		const other = URI.parse('test:/other.ade.json');
		await files.writeFile(other, VSBuffer.fromString(JSON.stringify({ ...checkoutModel, id: 'other' })));
		project.inspectElement('payment-contract');
		dialogs.selected = other;
		await project.chooseModel();
		assert.deepStrictEqual([project.section, project.modelUri?.toString(), project.canGoBack, project.canGoForward], ['diagram', other.toString(), false, false]);
	});

	test('correlated watcher reloads clean inspectors, preserves dirty edits and is released when leaving the document', async () => {
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		dialogs.selected = resource;
		await project.chooseModel();
		project.inspectElement('payment-contract');
		const updated = structuredClone(checkoutModel);
		updated.semantics.elements.find(element => element.id === 'payment-contract')!.name = 'External Contract';
		await files.writeFile(resource, VSBuffer.fromString(JSON.stringify(updated)));
		const changed = Event.toPromise(Event.filter(project.onDidChange, () => project.model.semantics.elements.some(element => element.name === 'External Contract')));
		files.emitWatch(resource);
		await changed;
		project.edit({ kind: 'rename', target: 'element', id: 'payment-contract', name: 'Local Contract' });
		await files.writeFile(resource, VSBuffer.fromString(JSON.stringify(checkoutModel)));
		files.emitWatch(resource);
		assert.deepStrictEqual([project.section, project.selectedId, project.dirty, project.model.semantics.elements.find(element => element.id === 'payment-contract')!.name], ['element', 'payment-contract', true, 'Local Contract']);
		dialogs.choice = ConfirmResult.DONT_SAVE;
		await project.useDemo();
		assert.strictEqual(files.watcherCount, 0);
	});

	test('watcher recovers a failed new-file open without reusing selections from the previous document', async () => {
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		dialogs.selected = resource;
		await project.chooseModel();
		project.revealElement('declined');
		const missing = URI.parse('test:/missing.ade.json');
		dialogs.selected = missing;
		await project.chooseModel();
		assert.ok(project.error);
		await files.writeFile(missing, VSBuffer.fromString(JSON.stringify(checkoutModel)));
		const repaired = Event.toPromise(Event.filter(project.onDidChange, () => !project.loading && !project.error));
		files.emitWatch(missing);
		await repaired;
		assert.deepStrictEqual([project.activeView?.id, project.selectedId, project.canGoBack], ['purchase-structure', 'customer', false]);
	});

	test('cancelled document replacement preserves dirty edits; discard restores the original file', async () => {
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		dialogs.selected = resource;
		await project.chooseModel();
		project.edit({ kind: 'rename', target: 'element', id: 'payment', name: 'Changed' });
		await project.useDemo();
		assert.deepStrictEqual([project.modelUri?.toString(), project.dirty, project.model.semantics.elements.find(element => element.id === 'payment')!.name], [resource.toString(), true, 'Changed']);
		dialogs.choice = ConfirmResult.DONT_SAVE;
		await project.useDemo();
		assert.deepStrictEqual([project.modelUri, project.dirty, project.model], [undefined, false, checkoutModel]);
		assert.deepStrictEqual(JSON.parse((await files.readFile(resource)).value.toString()), checkoutModel);
	});
	test('v4 upgrade is explicit, recoverable through native undo, and stable after save/reopen', async () => {
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		const original = (await files.readFile(resource)).value.toString();
		await project.openModelResource(resource);
		assert.strictEqual(project.model.version, 2, 'opening does not migrate a legacy document');
		project.upgradeToV4();
		const upgraded = project.model;
		assert.deepStrictEqual([upgraded.version, project.dirty, project.hasStructuralErrors], [4, true, false]);
		assert.strictEqual((await files.readFile(resource)).value.toString(), original, 'migration does not save implicitly');
		await project.undo();
		assert.strictEqual(project.model.version, 2);
		await project.redo();
		assert.deepStrictEqual(project.model, upgraded);
		assert.strictEqual(await project.save(), true);
		await project.openModelResource(resource);
		assert.deepStrictEqual(project.model, upgraded);
		assert.notStrictEqual(project.readiness('checkout-controller').state, 'generationReady');
	});

	test('referentially invalid v4 drafts remain editable, saveable and recoverable without allocating new IDs', async () => {
		const model = migrateSemanticModelToV4(checkoutModel);
		model.semantics.relations.push({ id: 'draft.invalid', kind: 'dependency', from: 'checkout-controller', to: 'not-declared', name: 'Incomplete' });
		await files.writeFile(resource, VSBuffer.fromString(JSON.stringify(model)));
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		assert.strictEqual(await project.openModelResource(resource), true);
		assert.deepStrictEqual([project.error, project.hasStructuralErrors, project.editable, project.activeView], [undefined, true, true, undefined]);
		project.edit({ kind: 'rename', target: 'element', id: 'checkout-controller', name: 'Recoverable Draft' });
		assert.strictEqual(await project.save(), true);
		await project.undo();
		assert.deepStrictEqual(project.model, model);
		await project.redo();
		const edited = project.model;
		await project.save();
		await project.openModelResource(resource);
		assert.deepStrictEqual(project.model, edited);
		assert.strictEqual(project.hasStructuralErrors, true);
	});

	test('blueprint operations and ADR revisions round-trip in one native undo transaction', async () => {
		const model = structuredClone(blueprintFixture);
		await files.writeFile(resource, VSBuffer.fromString(JSON.stringify(model)));
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		await project.openModelResource(resource);
		const operation = structuredClone(model.foundation.blueprint!.operations[0]); operation.name = 'submitOrder';
		const decision = structuredClone(model.foundation.decisions[0]); decision.revision = 'adr.2'; decision.record!.decision = 'Clarified rationale';
		project.editBatch([{ kind: 'blueprint', section: 'operations', entry: operation }, { kind: 'decision', entry: decision, expectedRevision: 'adr.1' }]);
		const edited = project.model;
		await project.undo(); assert.deepStrictEqual(project.model, model);
		await project.redo(); assert.deepStrictEqual(project.model, edited);
		assert.strictEqual(await project.save(), true);
		await project.openModelResource(resource); assert.deepStrictEqual(project.model, edited);
		assert.throws(() => project.edit({ kind: 'decision', entry: decision, expectedRevision: 'adr.1' }), /stale/);
		assert.deepStrictEqual(project.model, edited);
	});

	test('a required interface draft saves, reopens and can be repaired with undo', async () => {
		const model = structuredClone(blueprintFixture);
		model.foundation.blueprint!.connections = [];
		await files.writeFile(resource, VSBuffer.fromString(JSON.stringify(model)));
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		await project.openModelResource(resource);
		assert.deepStrictEqual([project.error, project.hasStructuralErrors, project.editable], [undefined, true, true]);
		project.edit({ kind: 'description', id: 'component.checkout', description: 'Draft responsibility' });
		assert.strictEqual(await project.save(), true); await project.openModelResource(resource);
		assert.strictEqual(project.hasStructuralErrors, true);
	});

	test('pure predicates save, undo and reopen through the native document without replacing stable IDs', async () => {
		await files.writeFile(resource, VSBuffer.fromString(JSON.stringify(nodeOrdersFixture)));
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		await project.openModelResource(resource);
		const predicate = structuredClone(nodeOrdersFixture.foundation.predicates![0]); predicate.nodes[1] = { id: 'zero', kind: 'literal', typeId: 'type.quantity', value: 1 };
		project.edit({ kind: 'predicate', entry: predicate }); const edited = project.model;
		await project.undo(); assert.deepStrictEqual(project.model, nodeOrdersFixture); await project.redo();
		await project.save(); await project.openModelResource(resource); assert.deepStrictEqual(project.model, edited);
	});

	test('structural context preview is local, leaves document bytes unchanged and hides stale data', async () => {
		await files.writeFile(resource, VSBuffer.fromString(JSON.stringify(nodeOrdersFixture)));
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		await project.openModelResource(resource); const before = project.model;
		const packet = await project.prepareStructuralContext('operation.submit', 'Inspect the declared predicate');
		assert.deepStrictEqual([project.model, project.dirty, project.taskPreview?.seal, packet.metrics.calls], [before, false, packet.seal, 0]);
		project.edit({ kind: 'description', id: 'component.checkout', description: 'Revised responsibility' }); assert.strictEqual(project.taskPreview, undefined);
	});

	test('an unsupported future document cannot be saved through the semantic editor', async () => {
		const source = JSON.stringify({ ...checkoutModel, version: 5 });
		await files.writeFile(resource, VSBuffer.fromString(source));
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		assert.strictEqual(await project.openModelResource(resource), false);
		assert.strictEqual(await project.save(), false);
		project.upgradeToV4();
		assert.strictEqual((await files.readFile(resource)).value.toString(), source);
	});

	test('first pure feature is created from an empty project with independent criteria and native undo', async () => {
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		await project.createProject('Quantity Domain', URI.parse('test:/pure-project'));
		const identity = project.model.id; await project.createPureFeature();
		assert.strictEqual(project.model.id, identity);
		assert.strictEqual(project.model.version === 4 && project.model.foundation.predicates?.length, 1);
		const criteria = JSON.parse((await files.readFile(URI.parse('test:/pure-project/.ade/criteria.json'))).value.toString());
		assert.deepStrictEqual(criteria.cases.map((entry: { expected: boolean | null | string }) => entry.expected), [false, false, true, true, null, 'typeError', 'typeError', 'typeError']);
		await project.undo(); assert.strictEqual(project.model.semantics.elements.length, 0); await project.redo();
		await project.save(); await project.openProject(URI.parse('test:/pure-project'));
		assert.strictEqual(project.model.version === 4 && project.model.foundation.predicates?.length, 1);
	});

	test('pure starter never replaces an existing specification', async () => {
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs)); await project.openModelResource(resource);
		await assert.rejects(project.createPureFeature(), /empty version 4/); assert.deepStrictEqual(project.model, checkoutModel);
	});

	test('executable interaction edits preserve hierarchy, save, reopen and participate in native undo/redo', async () => {
		const model = structuredClone(interactionFixture); model.views = [{ id: 'sequence', name: 'Checkout Sequence', kind: 'sequence', nodes: [], relationIds: [], interactionId: 'interaction.checkout' }];
		await files.writeFile(resource, VSBuffer.fromString(JSON.stringify(model)));
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs)); await project.openModelResource(resource);
		const interaction = structuredClone(model.foundation.interactions[0]); interaction.execution!.revision = '2';
		const frames = model.foundation.frames.filter(frame => interaction.frameIds.includes(frame.id)).map(frame => structuredClone(frame));
		const frame = frames.find(frame => frame.kind === 'alt')!; if (frame.kind === 'alt') { const node = frame.operands[0].guard!.nodes.find(node => node.kind === 'literal')!; if (node.kind === 'literal') { node.value = 'pending'; } }
		const entry = { interaction, frames, occurrences: model.foundation.occurrences.filter(call => interaction.occurrenceIds.includes(call.id)), expectedRevision: '1' };
		project.editBatch([{ kind: 'interaction', entry }, { kind: 'viewInteraction', viewId: 'sequence', interactionId: interaction.id }]); const edited = project.model;
		await project.undo(); assert.deepStrictEqual(project.model, model); await project.redo(); assert.deepStrictEqual(project.model, edited);
		await project.save(); await project.openModelResource(resource); assert.deepStrictEqual(project.model, edited); assert.throws(() => project.edit({ kind: 'interaction', entry }), /revision changed/);
	});

	test('flat machine edits save/reopen with native undo/redo and stale revision protection', async () => {
		await files.writeFile(resource, VSBuffer.fromString(JSON.stringify(stateFixture)));
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs)); await project.openModelResource(resource);
		const entry = structuredClone(stateFixture.foundation.stateMachines![0]); entry.revision = '2'; entry.transitions[0].priority = 5;
		project.editBatch([{ kind: 'stateMachine', entry, expectedRevision: '1' }, { kind: 'viewStateMachine', viewId: 'view.lifecycle', stateMachineId: entry.id }]); const edited = project.model;
		await project.undo(); assert.deepStrictEqual(project.model, stateFixture); await project.redo(); assert.deepStrictEqual(project.model, edited); await project.save(); await project.openModelResource(resource); assert.deepStrictEqual(project.model, edited); assert.throws(() => project.edit({ kind: 'stateMachine', entry, expectedRevision: '1' }), /revision changed/);
	});

	test('messaging topology saves/reopens and uses native undo/redo with stale policy protection', async () => {
		await files.writeFile(resource, VSBuffer.fromString(JSON.stringify(messagingFixture)));
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs)); await project.openModelResource(resource);
		const entry = structuredClone(messagingFixture.foundation.messaging![0]); entry.revision = '2'; entry.subscriptions[0].ackWaitMs = 1000;
		project.editBatch([{ kind: 'messaging', entry, expectedRevision: '1' }, { kind: 'viewMessaging', viewId: 'view.messaging', messagingId: entry.id }]); const edited = project.model;
		await project.undo(); assert.deepStrictEqual(project.model, messagingFixture); await project.redo(); assert.deepStrictEqual(project.model, edited); await project.save(); await project.openModelResource(resource); assert.deepStrictEqual(project.model, edited); assert.throws(() => project.edit({ kind: 'messaging', entry, expectedRevision: '1' }), /revision changed/);
	});

	test('task clarification uses native undo/redo, survives save/reopen, and seals the current intent in preview', async () => {
		await files.writeFile(resource, VSBuffer.fromString(JSON.stringify(nodeOrdersFixture)));
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		await project.openModelResource(resource);
		const entry = { id: 'task.quantity', target: { kind: 'operation' as const, id: 'operation.submit' }, revision: '1', text: 'Strict quantity rule', clarifications: [], history: [] };
		project.edit({ kind: 'taskIntent', entry });
		project.edit({ kind: 'taskIntent', expectedRevision: '1', entry: { ...entry, revision: '2', clarifications: [{ question: 'Zero?', answer: 'Reject zero' }] } });
		const edited = project.model; await project.undo(); assert.strictEqual(project.model.version === 4 && project.model.foundation.tasks![0].revision, '1');
		await project.redo(); assert.deepStrictEqual(project.model, edited); await project.save(); await project.openModelResource(resource); assert.deepStrictEqual(project.model, edited);
		const packet = await project.prepareStructuralContext('operation.submit', 'fallback'); const value = JSON.parse(packet.bytes);
		assert.deepStrictEqual(value.intent, { revision: '2', text: 'Strict quantity rule', clarifications: [{ question: 'Zero?', answer: 'Reject zero' }] });
	});

	test('runtime binding batch is one native undo, invalidates preview and survives save/reopen with Bun context', async () => {
		let serial = 0; const portable = createPureProject('Portable Quantity', () => 'portable.' + ++serial).model, operationId = portable.foundation.blueprint!.operations[0].id;
		await files.writeFile(resource, VSBuffer.fromString(JSON.stringify(portable)));
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		await project.openModelResource(resource); const initial = project.model; if (initial.version !== 4) { throw new Error('Expected v4'); }
		await project.prepareStructuralContext(operationId, 'Keep same business rule'); const oldSeal = project.taskPreview!.seal;
		project.editBatch(switchModelStack(initial, 'bun.esm').foundation.platform.bindings.map(entry => ({ kind: 'platformBinding', entry })));
		assert.strictEqual(project.taskPreview, undefined); const edited = project.model; await project.undo(); assert.deepStrictEqual(project.model, initial); await project.redo(); assert.deepStrictEqual(project.model, edited);
		await project.save(); await project.openModelResource(resource); const packet = await project.prepareStructuralContext(operationId, 'Keep same business rule'); assert.notStrictEqual(packet.seal, oldSeal); assert.ok(packet.bytes.includes('bun.esm')); assert.deepStrictEqual(project.model, edited);
	});

	test('Node-specific normative ADR remains binding and blocks Bun context until explicitly revised', async () => {
		await files.writeFile(resource, VSBuffer.fromString(JSON.stringify(nodeOrdersFixture)));
		const project = disposables.add(new AdeProjectService(storage, files, dialogs, documents.textFiles, documents.textModels, workspaceContext, projectDialogs));
		await project.openModelResource(resource); const model = project.model; if (model.version !== 4) { throw new Error('Expected v4'); }
		project.editBatch(switchModelStack(model, 'bun.esm').foundation.platform.bindings.map(entry => ({ kind: 'platformBinding', entry })));
		await assert.rejects(project.prepareStructuralContext('operation.submit', 'Keep same business rule'), /decisionUnsatisfied/);
	});

});
