/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/ade.css';
import { localize } from '../../../../nls.js';
import * as dom from '../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { checkoutModel } from '../common/checkoutModel.js';
import { InvalidSemanticModelError, migrateSemanticModel, ModelDiagnostic, SemanticModelService } from '../common/semanticModel.js';

import { AdeInput } from './adeInput.js';

/** Localized presentation of domain diagnostics, also usable by later editor adapters. */
function diagnosticMessage(diagnostic: ModelDiagnostic): string {
	const args = diagnostic.args;
	switch (diagnostic.code) {
		case 'shape': return localize('ade.shape', "Invalid value at {0}. Expected: {1}.", diagnostic.path, args[0]);
		case 'duplicateId': return localize('ade.duplicate', "Duplicate identifier {0} at {1}.", args[0], diagnostic.path);
		case 'missingReference': return localize('ade.missing', "Element or relation {0} does not exist ({1}).", args[0], diagnostic.path);
		case 'incompatibleRelation': return localize('ade.incompatible', "A {0} relation cannot connect {1} to {2} ({3}).", args[0], args[1], args[2], diagnostic.path);
		case 'containmentCycle': return localize('ade.cycle', "Element {0} contains itself through its parents ({1}).", args[0], diagnostic.path);
		case 'invalidParent': return localize('ade.parent', "Element {0} of kind {1} is not allowed at {2}.", args[0], args[1], diagnostic.path);
		case 'missingCriterion': return localize('ade.criterion', "Acceptance criterion {0} does not exist on {1}.", args[0], args[1]);
		case 'missingError': return localize('ade.errorCode', "Error {0} is not declared by {1}.", args[0], args[1]);
		case 'viewEndpoint': return localize('ade.endpoint', "Both endpoints of relation {0} must be present in this view.", args[0]);
		case 'legacyClassification': return localize('ade.legacy', "Imported relation {0} needs semantic classification.", args[0]);
	}
}

export class AdeEditor extends EditorPane {
	static readonly ID = AdeInput.ID;
	private root!: HTMLElement;
	private readonly renderDisposables = this._register(new DisposableStore());
	private readonly modelDisposables = this._register(new DisposableStore());
	private readonly semanticService = new SemanticModelService(checkoutModel);
	private diagnostics: ModelDiagnostic[] = [];
	private loadError: string | undefined;
	private loading = false;
	private loadGeneration = 0;
	private selectedId: string;
	private section: string;
	private modelUri: URI | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService adeStorageService: IStorageService,
		@ICommandService private readonly commandService: ICommandService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IFileService private readonly fileService: IFileService,
	) {
		super(AdeEditor.ID, group, telemetryService, themeService, adeStorageService);
		this.section = adeStorageService.get('ade.shell.section', StorageScope.WORKSPACE, 'home');
		this.selectedId = adeStorageService.get('ade.shell.selection', StorageScope.WORKSPACE, 'purchase');
		const resource = adeStorageService.get('ade.shell.model', StorageScope.WORKSPACE);
		if (resource) {
			try { this.modelUri = URI.parse(resource); } catch { /* Ignore obsolete workspace state. */ }
		}
		this._register(adeStorageService.onWillSaveState(() => {
			adeStorageService.store('ade.shell.section', this.section, StorageScope.WORKSPACE, StorageTarget.MACHINE);
			adeStorageService.store('ade.shell.selection', this.selectedId, StorageScope.WORKSPACE, StorageTarget.MACHINE);
			adeStorageService.store('ade.shell.model', this.modelUri?.toString(), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}));
	}

	protected override createEditor(parent: HTMLElement): void {
		this.root = dom.append(parent, dom.$('.ade-shell'));
		this.root.tabIndex = -1;
		if (this.modelUri) {
			void this.loadModel(this.modelUri);
		} else {
			this.render();
		}
	}

	override layout(dimension: dom.Dimension): void {
		dom.size(this.root, dimension.width, dimension.height);
	}

	override focus(): void { this.root?.focus(); }

	private button(parent: HTMLElement, label: string, action: () => void, disabled = false): HTMLButtonElement {
		const button = dom.append(parent, dom.$<HTMLButtonElement>('button'));
		button.type = 'button';
		button.textContent = label;
		button.disabled = disabled;
		this.renderDisposables.add(dom.addDisposableListener(button, 'click', action));
		return button;
	}

	private paragraph(parent: HTMLElement, content: string): void {
		dom.append(parent, dom.$('p')).textContent = content;
	}

	private async chooseModel(): Promise<void> {
		const resources = await this.fileDialogService.showOpenDialog({
			title: localize('ade.choose', "Open A.D.E Model"), canSelectFiles: true, canSelectFolders: false, canSelectMany: false,
			filters: [{ name: localize('ade.modelFilter', "A.D.E Model"), extensions: ['json'] }]
		});
		if (resources?.[0]) {
			this.section = 'model';
			await this.loadModel(resources[0]);
		}
	}

	private async loadModel(resource: URI): Promise<void> {
		const generation = ++this.loadGeneration;
		this.loading = true;
		this.loadError = undefined;
		this.modelUri = resource;
		this.modelDisposables.clear();
		const watcher = this.modelDisposables.add(this.fileService.createWatcher(resource, { recursive: false, excludes: [] }));
		this.modelDisposables.add(watcher.onDidChange(event => {
			if (event.contains(resource)) { void this.loadModel(resource); }
		}));
		this.render();
		try {
			const content = await this.fileService.readFile(resource);
			if (generation !== this.loadGeneration) { return; }
			const result = migrateSemanticModel(JSON.parse(content.value.toString()));
			this.semanticService.replace(result.model);
			this.diagnostics = result.diagnostics;
			if (!this.semanticService.getElement(this.selectedId)) {
				this.selectedId = result.model.semantics.elements[0]?.id ?? '';
			}
		} catch (error) {
			if (generation !== this.loadGeneration) { return; }
			this.loadError = error instanceof InvalidSemanticModelError
				? error.diagnostics.map(diagnosticMessage).join('\n')
				: localize('ade.loadFailed', "Could not read the selected model: {0}", String(error.message ?? error));
		} finally {
			if (generation === this.loadGeneration) {
				this.loading = false;
				this.render();
			}
		}
	}

	private render(): void {
		this.renderDisposables.clear();
		dom.clearNode(this.root);
		const navigation = dom.append(this.root, dom.$('nav.ade-navigation'));
		navigation.setAttribute('aria-label', localize('ade.navigation', "Project Navigation"));
		for (const [section, title] of [
			['home', localize('ade.home', "Home")], ['model', localize('ade.model', "System Model")],
			['properties', localize('ade.properties', "Properties")], ['ai', localize('ade.ai', "AI Collaboration")]
		]) {
			const button = this.button(navigation, title, () => { this.section = section; this.render(); this.root.focus(); });
			button.setAttribute('aria-current', String(this.section === section));
		}
		const content = dom.append(this.root, dom.$('main.ade-content'));
		if (this.section === 'home') {
			dom.append(content, dom.$('h1')).textContent = localize('ade.welcome', "Your System, in Context");
			this.paragraph(content, localize('ade.intro', "Explore the system model, its responsibilities and its contracts."));
			this.button(content, localize('ade.openProject', "Open Project"), () => { void this.commandService.executeCommand('workbench.action.files.openFolder'); });
			this.button(content, localize('ade.openModel', "Open Model"), () => { void this.chooseModel(); });
			this.button(content, localize('ade.demo', "Explore Purchase Example"), () => {
				++this.loadGeneration;
				this.modelDisposables.clear();
				this.modelUri = undefined;
				this.loadError = undefined;
				this.loading = false;
				this.diagnostics = [];
				this.semanticService.replace(checkoutModel);
				this.selectedId = 'purchase';
				this.section = 'model';
				this.render();
			});
			this.button(content, localize('ade.createFuture', "Create Project — Planned for Visual Editing"), () => { }, true);
			this.button(content, localize('ade.importFuture', "Import Codebase — Planned"), () => { }, true);
			return;
		}
		if (this.section === 'ai') {
			dom.append(content, dom.$('h1')).textContent = localize('ade.aiTitle', "AI Collaboration");
			this.paragraph(content, localize('ade.aiFuture', "Provider configuration and assisted implementation are planned. No AI provider is connected by this panel."));
			return;
		}
		this.button(content, localize('ade.openAnother', "Open Model"), () => { void this.chooseModel(); });
		if (this.loading || this.loadError) {
			const status = dom.append(content, dom.$('p.ade-status'));
			status.setAttribute('role', this.loadError ? 'alert' : 'status');
			status.textContent = this.loadError ?? localize('ade.loading', "Loading model…");
			return;
		}
		const model = this.semanticService.getSnapshot();
		dom.append(content, dom.$('h1')).textContent = model.name;
		this.paragraph(content, this.modelUri?.toString() ?? localize('ade.demoOnly', "Demonstration model · design intent"));
		for (const diagnostic of this.diagnostics) { this.paragraph(content, diagnosticMessage(diagnostic)); }
		const workspace = dom.append(content, dom.$('.ade-workspace'));
		const explorer = dom.append(workspace, dom.$('aside.ade-explorer'));
		explorer.setAttribute('aria-label', localize('ade.explorer', "Semantic Explorer"));
		for (const element of model.semantics.elements) {
			const button = this.button(explorer, element.name, () => { this.selectedId = element.id; this.render(); });
			button.setAttribute('aria-pressed', String(element.id === this.selectedId));
		}
		const detail = dom.append(workspace, dom.$('section.ade-detail'));
		const element = this.semanticService.getElement(this.selectedId);
		if (!element) { return; }
		dom.append(detail, dom.$('h2')).textContent = element.name;
		this.paragraph(detail, localize('ade.elementKind', "Type: {0}", element.kind));
		if (element.description) { this.paragraph(detail, element.description); }
		if (this.section === 'properties') {
			if (element.behavior) {
				for (const field of element.behavior.inputs) {
					this.paragraph(detail, localize('ade.input', "Input: {0} ({1})", field.name, field.type));
				}
				for (const field of element.behavior.outputs) {
					this.paragraph(detail, localize('ade.output', "Output: {0} ({1})", field.name, field.type));
				}
				for (const condition of element.behavior.preconditions) {
					this.paragraph(detail, localize('ade.precondition', "Precondition: {0}", condition));
				}
				for (const condition of element.behavior.postconditions) {
					this.paragraph(detail, localize('ade.postcondition', "Postcondition: {0}", condition));
				}
				for (const error of element.behavior.errors) { this.paragraph(detail, error.description); }
				for (const permission of element.behavior.permissions) {
					this.paragraph(detail, localize('ade.permission', "Authorization: {0} · {1}", this.semanticService.getElement(permission.actorId)!.name, permission.capability));
				}
				for (const criterion of element.behavior.acceptanceCriteria) {
					this.paragraph(detail, localize('ade.acceptance', "Given {0}, when {1}, then {2}.", criterion.given, criterion.when, criterion.then));
				}
			}
			this.paragraph(detail, localize('ade.evidence', "Code mappings: {0} · Verification records: {1}",
				model.codeMappings.filter(mapping => mapping.elementId === element.id).length,
				model.verifications.filter(verification => verification.elementId === element.id).length));
		} else {
			for (const relation of this.semanticService.getRelations(element.id)) {
				const targetId = relation.from === element.id ? relation.to : relation.from;
				const from = this.semanticService.getElement(relation.from)!;
				const to = this.semanticService.getElement(relation.to)!;
				this.button(detail, localize('ade.relation', "{0} → {1}: {2}", from.name, to.name, relation.name || relation.kind), () => {
					this.selectedId = targetId;
					this.render();
				});
			}
		}
	}

	override dispose(): void {
		++this.loadGeneration;
		super.dispose();
	}
}
