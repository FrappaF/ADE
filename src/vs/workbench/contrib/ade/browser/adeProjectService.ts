/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { basename, dirname } from '../../../../base/common/resources.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ConfirmResult, IDialogService, IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { checkoutModel } from '../common/checkoutModel.js';
import { InvalidSemanticModelError, migrateSemanticModel, SemanticModelService } from '../common/semanticModel.js';
import { DiagramContext, normalizeDiagramContext, resolveElementLocation, SemanticLocation, SemanticNavigationHistory } from '../common/visualNavigation.js';

import { VSBuffer } from '../../../../base/common/buffer.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { ITextFileService, IResolvedTextFileEditorModel } from '../../../services/textfile/common/textfiles.js';
import { applyVisualEdit, VisualEdit } from '../common/visualEditing.js';
import { diagnosticMessage } from './adeDiagnostics.js';

export const IAdeProjectService = createDecorator<AdeProjectService>('adeProjectService');

/** Workspace-owned editable model and visual context shared by native workbench surfaces. */
export class AdeProjectService extends Disposable {
	declare readonly _serviceBrand: undefined;
	private readonly changeEmitter = this._register(new Emitter<void>());
	readonly onDidChange = this.changeEmitter.event;
	private readonly modelDisposables = this._register(new DisposableStore());
	private readonly watchDisposables = this._register(new DisposableStore());
	private document: IResolvedTextFileEditorModel | undefined;
	private _saveError: string | undefined;
	private readonly semantics = new SemanticModelService(checkoutModel);
	private context: DiagramContext;
	private generation = 0;
	private restoring: Promise<void> | undefined;
	private initialized = false;
	private _section: SemanticLocation['section'];
	private inspectionId = '';
	private readonly navigation = new SemanticNavigationHistory();
	private _modelUri: URI | undefined;
	private _loading = false;
	private _error: string | undefined;
	private _diagnostics: string[] = [];

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IFileService private readonly fileService: IFileService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@ITextFileService private readonly textFiles: ITextFileService,
		@ITextModelService private readonly textModels: ITextModelService,
		@IWorkspaceContextService private readonly workspace: IWorkspaceContextService,
		@IDialogService private readonly dialogs: IDialogService
	) {
		super();
		// Read the M2.1 branch's presentation keys only as fallbacks for an older profile.
		let legacyContext: DiagramContext = { viewId: checkoutModel.views[0].id, selections: {} };
		try {
			const saved: DiagramContext = JSON.parse(storageService.get('ade.visual.context', StorageScope.WORKSPACE, '{}'));
			if (saved && typeof saved.viewId === 'string' && saved.selections && typeof saved.selections === 'object' && !Array.isArray(saved.selections)) {
				legacyContext = { viewId: saved.viewId, selections: Object.fromEntries(Object.entries(saved.selections).filter(([, value]) => typeof value === 'string')) };
			}
		} catch { /* Ignore corrupt state from the read-only shell. */ }
		const section = storageService.get('ade.shell.section', StorageScope.WORKSPACE)
			?? (storageService.getBoolean('ade.visual.home', StorageScope.WORKSPACE, true) ? 'home' : 'diagram');
		this._section = section === 'home' || section === 'map' || section === 'element' || section === 'impact' ? section : 'diagram';
		this.inspectionId = storageService.get('ade.shell.inspection', StorageScope.WORKSPACE, '');
		let selections: Record<string, string> = {};
		try {
			const saved: Record<string, string> = JSON.parse(storageService.get('ade.shell.diagramSelections', StorageScope.WORKSPACE) ?? JSON.stringify(legacyContext.selections));
			if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
				selections = Object.fromEntries(Object.entries(saved).filter(([, value]) => typeof value === 'string'));
			}
		} catch { /* Recover from obsolete or corrupt presentation state. */ }
		const viewId = storageService.get('ade.shell.diagram', StorageScope.WORKSPACE, legacyContext.viewId);
		if (!Object.hasOwn(selections, viewId)) {
			selections[viewId] = storageService.get('ade.shell.selection', StorageScope.WORKSPACE, '');
		}
		this.context = { viewId, selections };
		this.navigation.reset(this.location);
		const resource = storageService.get('ade.shell.model', StorageScope.WORKSPACE);
		if (resource) {
			try { this._modelUri = URI.parse(resource); } catch { /* Ignore obsolete workspace URI. */ }
		}
		this._register(storageService.onWillSaveState(() => {
			storageService.store('ade.shell.section', this._section, StorageScope.WORKSPACE, StorageTarget.MACHINE);
			storageService.store('ade.shell.model', this._modelUri?.toString(), StorageScope.WORKSPACE, StorageTarget.MACHINE);
			storageService.store('ade.shell.diagram', this.context.viewId, StorageScope.WORKSPACE, StorageTarget.MACHINE);
			storageService.store('ade.shell.diagramSelections', JSON.stringify(this.context.selections), StorageScope.WORKSPACE, StorageTarget.MACHINE);
			storageService.store('ade.shell.inspection', this.inspectionId, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}));
	}

	get dirty(): boolean { return this.document?.isDirty() ?? false; }
	get documentVersion(): string { return `${this.modelUri?.toString() ?? ''}:${this.document?.textEditorModel.getVersionId() ?? 0}`; }
	get editable(): boolean { return !!this.document && !this.document.isReadonly() && !this.loading && !this.error; }
	get saveError(): string | undefined { return this._saveError; }
	get canUndo(): boolean { return this.document?.textEditorModel.canUndo() ?? false; }
	get canRedo(): boolean { return this.document?.textEditorModel.canRedo() ?? false; }
	get section(): SemanticLocation['section'] { return this._section; }
	get modelUri(): URI | undefined { return this._modelUri; }
	/** Imported snapshots belong to the project above .ade, never to the snapshot directory. */
	get projectRoot(): URI | undefined {
		if (!this._modelUri) { return undefined; }
		let current = dirname(this._modelUri);
		while (dirname(current).path !== current.path) {
			if (basename(current) === '.ade') { return dirname(current); }
			current = dirname(current);
		}
		return dirname(this._modelUri);
	}
	get loading(): boolean { return this._loading; }
	get error(): string | undefined { return this._error; }
	get diagnostics(): readonly string[] { return this._diagnostics; }
	get model() { return this.semantics.getSnapshot(); }
	get activeView() { return this.section === 'element' || this.section === 'impact' || this.section === 'map' ? undefined : this.model.views.find(view => view.id === this.context.viewId); }
	get selectedId(): string { return this.section === 'element' || this.section === 'impact' ? this.inspectionId : this.context.selections[this.context.viewId] ?? ''; }
	get canGoBack(): boolean { return !this.loading && !this.error && this.navigation.canGo(this.model, -1); }
	get canGoForward(): boolean { return !this.loading && !this.error && this.navigation.canGo(this.model, 1); }
	private get location(): SemanticLocation {
		if (this.section === 'home' || this.section === 'map') { return { section: this.section }; }
		if (this.section === 'element') { return { section: 'element', elementId: this.inspectionId }; }
		if (this.section === 'impact') { return { section: 'impact', elementId: this.inspectionId }; }
		return { section: 'diagram', viewId: this.context.viewId, ...(this.selectedId ? { elementId: this.selectedId } : {}) };
	}
	private publishNavigation(): void { this.navigation.push(this.location); this.changeEmitter.fire(); }

	/** Reveal an identity in the preferred diagram, or inspect it when no diagram contains it. */
	revealElement(id: string, viewId = this.context.viewId): boolean {
		if (this.loading || this.error) { return false; }
		const location = resolveElementLocation(this.model, id, viewId);
		if (!location) { return false; }
		this.applyLocation(location);
		this.publishNavigation();
		return true;
	}
	inspectElement(id: string): void {
		if (this.loading || this.error || !this.model.semantics.elements.some(element => element.id === id)) { return; }
		this.applyLocation({ section: 'element', elementId: id });
		this.publishNavigation();
	}
	showImpact(id = this.selectedId): void {
		if (this.loading || this.error || !this.model.semantics.elements.some(element => element.id === id)) { return; }
		this.applyLocation({ section: 'impact', elementId: id });
		this.publishNavigation();
	}
	private applyLocation(location: SemanticLocation): void {
		this._section = location.section;
		if (location.section === 'element' || location.section === 'impact') { this.inspectionId = location.elementId; }
		if (location.section === 'diagram') {
			this.context.viewId = location.viewId;
			if (location.elementId) { this.context.selections[location.viewId] = location.elementId; }
		}
	}
	goBack(): void { this.go(-1); }
	goForward(): void { this.go(1); }
	private go(direction: -1 | 1): void {
		if (this.loading || this.error) { return; }
		const location = this.navigation.go(this.model, direction);
		if (location) { this.applyLocation(location); this.changeEmitter.fire(); }
	}

	/** Called by both surfaces; restoration starts at most once. */
	restore(): Promise<void> {
		if (!this.initialized) {
			this.initialized = true;
			if (this._modelUri) {
				this.restoring = this.loadModel(this._modelUri);
			} else {
				this.restoring = this.restoreWorkspaceProject();
				this.context = normalizeDiagramContext(this.model, this.context);
				if ((this.section === 'element' || this.section === 'impact') && !this.model.semantics.elements.some(element => element.id === this.inspectionId)) { this._section = 'diagram'; }
				this.navigation.replace(this.location);
			}
		}
		return this.restoring ?? Promise.resolve();
	}

	private async restoreWorkspaceProject(): Promise<void> {
		const generation = this.generation;
		const folders = this.workspace?.getWorkspace().folders ?? [];
		const active = this.storageService.get('ade.project.activeRoot', StorageScope.PROFILE);
		const folder = folders.find(folder => folder.uri.toString() === active) ?? (folders.length === 1 ? folders[0] : undefined);
		if (folder && (await this.fileService.exists(URI.joinPath(folder.uri, '.ade', 'code-project.json')) || await this.fileService.exists(URI.joinPath(folder.uri, '.ade', 'model.json'))) && generation === this.generation && !this._modelUri) {
			await this.openProject(folder.uri);
		}
	}

	showSystemMap(): void {
		if (this.loading || this.error) { return; }
		this._section = 'map';
		this.publishNavigation();
	}

	showHome(): void {
		this._section = 'home';
		this.publishNavigation();
	}

	showDiagram(viewId: string): void {
		if (this._loading || this._error || !this.model.views.some(view => view.id === viewId)) { return; }
		this.context.viewId = viewId;
		this._section = 'diagram';
		this.publishNavigation();
	}

	selectElement(elementId: string): void {
		if (!this.activeView?.nodes.some(node => node.elementId === elementId)) { return; }
		this.context.selections[this.context.viewId] = elementId;
		this.publishNavigation();
	}

	async useDemo(): Promise<void> {
		if (!await this.prepareToReplace()) { return; }
		++this.generation;
		this.restoring = undefined;
		this.initialized = true;
		this.modelDisposables.clear();
		this.watchDisposables.clear();
		this.document = undefined;
		this._saveError = undefined;
		this._modelUri = undefined;
		this._error = undefined;
		this._loading = false;
		this._diagnostics = [];
		this.semantics.replace(checkoutModel);
		this.context = normalizeDiagramContext(checkoutModel, { viewId: '', selections: {} });
		this._section = 'diagram';
		this.inspectionId = '';
		this.navigation.reset(this.location);
		this.changeEmitter.fire();
	}

	async chooseModel(): Promise<void> {
		const resources = await this.fileDialogService.showOpenDialog({
			title: localize('ade.choose', "Open A.D.E Model"), canSelectFiles: true, canSelectFolders: false, canSelectMany: false,
			filters: [{ name: localize('ade.modelFilter', "A.D.E Model"), extensions: ['json'] }]
		});
		if (resources?.[0] && await this.prepareToReplace()) {
			this.restoring = undefined;
			this._section = 'diagram';
			await this.loadModel(resources[0]);
		}
	}

	async openModelResource(resource: URI): Promise<boolean> {
		if (!await this.prepareToReplace()) { return false; }
		await this.loadModel(resource);
		return !this.error;
	}

	async retry(): Promise<void> {
		if (this._modelUri) { await this.loadModel(this._modelUri); }
	}

	/** Every visual edit is one transaction in the native text model's undo stack. */
	edit(edit: VisualEdit): void {
		this.editBatch([edit]);
	}

	editBatch(edits: readonly VisualEdit[]): void {
		if (!this.editable || !this.document) { return; }
		const next = edits.reduce((model, edit) => applyVisualEdit(model, edit), this.model);
		const text = this.document.textEditorModel;
		text.pushStackElement();
		text.pushEditOperations([], [{ range: text.getFullModelRange(), text: JSON.stringify(next, null, '\t') + '\n' }], () => null);
		text.pushStackElement();
	}

	async undo(): Promise<void> { await this.document?.textEditorModel.undo(); }
	async redo(): Promise<void> { await this.document?.textEditorModel.redo(); }

	async save(): Promise<boolean> {
		if (!this.document || this.error) { return false; }
		const document = this.document;
		try {
			const success = await document.save();
			if (document === this.document) {
				this._saveError = success ? undefined : localize('ade.saveFailed', "The project could not be saved. Check disk changes and permissions, or save a copy.");
				this.changeEmitter.fire();
			}
			return success;
		} catch (error) {
			if (document === this.document) {
				this._saveError = localize('ade.saveError', "Could not save the project: {0}", String(error.message ?? error));
				this.changeEmitter.fire();
			}
			return false;
		}
	}

	async saveAs(): Promise<boolean> {
		if (!this._modelUri || !this.document || this.error) { return false; }
		const source = this._modelUri;
		const document = this.document;
		const target = await this.fileDialogService.showSaveDialog({ title: localize('ade.saveCopy', "Save Project Copy"), defaultUri: source });
		if (!target || document !== this.document || source.toString() !== this._modelUri?.toString() || target.toString() === source.toString()) { return false; }
		const context = { diagram: { viewId: this.context.viewId, selections: { ...this.context.selections } }, location: this.location };
		const generation = this.generation;
		const saved = await this.textFiles.saveAs(source, target);
		if (!saved || generation !== this.generation || document !== this.document || source.toString() !== this._modelUri?.toString()) { return false; }
		await this.loadModel(saved, context);
		return !this.error;
	}

	async revert(): Promise<void> {
		await this.document?.revert();
		this._saveError = undefined;
		if (this._modelUri) { await this.loadModel(this._modelUri); }
	}

	private async prepareToReplace(): Promise<boolean> {
		if (!this.dirty) { return true; }
		const choice = await this.fileDialogService.showSaveConfirm([this.model.name]);
		if (choice === ConfirmResult.CANCEL) { return false; }
		if (choice === ConfirmResult.SAVE) { return this.save(); }
		await this.document?.revert();
		return true;
	}

	async createProject(name: string, folder: URI): Promise<boolean> {
		if (!name.trim()) { return false; }
		const directory = URI.joinPath(folder, '.ade');
		const resource = URI.joinPath(directory, 'model.json');
		if (await this.fileService.exists(resource) || await this.fileService.exists(URI.joinPath(directory, 'code-project.json'))) {
			if (!this.dialogs) { throw new Error(localize('ade.existingProject.error', "This folder already contains an A.D.E project. Use Open Project or choose another folder.")); }
			if (!(await this.dialogs.confirm({ message: localize('ade.existingProject', "This Folder Already Contains an A.D.E Project."), detail: localize('ade.existingProject.detail', "Open the existing project or cancel and choose another folder. Its model will be preserved."), primaryButton: localize('ade.existingProject.open', "Open Project") })).confirmed) { return false; }
			await this.openProject(folder);
			return !this.error;
		}
		if (!await this.prepareToReplace()) { return false; }
		const model = { version: 3, id: generateUuid(), name, semantics: { elements: [], relations: [] }, views: [], codeMappings: [], verifications: [] };
		await this.fileService.createFolder(directory);
		await this.fileService.createFile(resource, VSBuffer.fromString(JSON.stringify(model, null, '\t') + '\n'), { overwrite: false });
		this._section = 'diagram';
		await this.loadModel(resource);
		return !this.error;
	}

	async openProject(folder: URI): Promise<void> {
		if (await this.prepareToReplace()) {
			this._section = 'diagram';
			const pointer = URI.joinPath(folder, '.ade', 'code-project.json');
			let resource = URI.joinPath(folder, '.ade', 'model.json');
			if (await this.fileService.exists(pointer)) {
				const value = JSON.parse((await this.fileService.readFile(pointer)).value.toString());
				if (value.version !== 1 || typeof value.active !== 'string' || !/^[a-f0-9-]{36}$/.test(value.active)) { throw new Error(localize('ade.code.invalidPointer', "Invalid code project snapshot.")); }
				resource = URI.joinPath(folder, '.ade', 'imports', value.active, 'model.ade.json');
			}
			await this.loadModel(resource);
		}
	}

	private readDocument(document: IResolvedTextFileEditorModel): void {
		try {
			const result = migrateSemanticModel(JSON.parse(document.textEditorModel.getValue()));
			this.semantics.replace(result.model);
			this.context = normalizeDiagramContext(result.model, this.context);
			if ((this.section === 'element' || this.section === 'impact') && !result.model.semantics.elements.some(element => element.id === this.inspectionId)) {
				this._section = 'diagram';
				this.inspectionId = '';
			}
			this.navigation.replace(this.location);
			this._diagnostics = result.diagnostics.map(diagnosticMessage);
			this._error = undefined;
		} catch (error) {
			this._error = error instanceof InvalidSemanticModelError ? error.diagnostics.map(diagnosticMessage).join('\n')
				: localize('ade.loadFailed', "Could not read the selected model: {0}", String(error.message ?? error));
		}
		this.changeEmitter.fire();
	}

	private async loadModel(resource: URI, copiedContext?: { diagram: DiagramContext; location: SemanticLocation }): Promise<void> {
		const generation = ++this.generation;
		let reloadRequested = false;
		this.watchDisposables.clear();
		const sameDocument = this._modelUri?.toString() === resource.toString();
		if (!sameDocument) {
			this.navigation.reset({ section: 'home' });
			this.context = copiedContext?.diagram ?? { viewId: '', selections: {} };
			this.inspectionId = '';
			if (copiedContext) { this.applyLocation(copiedContext.location); }
			else if (this.section === 'element' || this.section === 'impact') { this._section = 'diagram'; }
		}
		this.initialized = true;
		this.restoring = undefined;
		this._modelUri = resource;
		this._loading = true;
		this._error = undefined;
		this._saveError = undefined;
		this.changeEmitter.fire();
		try {
			const watcher = this.watchDisposables.add(this.fileService.createWatcher(resource, { recursive: false, excludes: [] }));
			this.watchDisposables.add(watcher.onDidChange(event => {
				if (generation !== this.generation || !event.contains(resource)) { return; }
				if (this.loading) { reloadRequested = true; }
				else { void this.reloadWatchedModel(resource, generation); }
			}));
			const document = await this.textFiles.files.resolve(resource);
			if (generation !== this.generation) { return; }
			if (!document.isResolved()) { throw new Error('Unresolved project document'); }
			const reference = await this.textModels.createModelReference(resource);
			if (generation !== this.generation) { reference.dispose(); return; }
			this.modelDisposables.clear();
			this.modelDisposables.add(reference);
			this.document = document;
			this.modelDisposables.add(document.onDidChangeContent(() => { if (generation === this.generation) { this.readDocument(document); } }));
			this.modelDisposables.add(document.onDidChangeDirty(() => this.changeEmitter.fire()));
			this.modelDisposables.add(document.onDidChangeReadonly(() => this.changeEmitter.fire()));
			this.modelDisposables.add(document.onDidSave(() => { this._saveError = undefined; this.changeEmitter.fire(); }));
			this.readDocument(document);
		} catch (error) {
			if (generation !== this.generation) { return; }
			this._error = localize('ade.loadFailed', "Could not read the selected model: {0}", String(error.message ?? error));
		} finally {
			if (generation === this.generation) {
				this._loading = false;
				this.changeEmitter.fire();
				if (reloadRequested) { void this.reloadWatchedModel(resource, generation); }
			}
		}
	}

	/** Correlated file watching also covers restored inspectors and models outside the workspace. */
	private async reloadWatchedModel(resource: URI, generation: number): Promise<void> {
		if (generation !== this.generation || this.document?.isDirty()) { return; }
		if (!this.document?.isResolved() || this.document.textEditorModel.uri.toString() !== resource.toString()) { await this.loadModel(resource); return; }
		try {
			const document = await this.textFiles.files.resolve(resource, { reload: { async: false } });
			if (generation === this.generation && document === this.document && document.isResolved() && !document.isDirty()) { this.readDocument(document); }
		} catch (error) {
			if (generation !== this.generation || this.document?.isDirty()) { return; }
			this._error = localize('ade.refreshFailed', "Could not refresh the model from disk: {0}", String(error.message ?? error));
			this.changeEmitter.fire();
		}
	}

	override dispose(): void {
		++this.generation;
		super.dispose();
	}
}

registerSingleton(IAdeProjectService, AdeProjectService, InstantiationType.Delayed);
