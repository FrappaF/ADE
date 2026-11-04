/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../base/common/event.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { dirname, basename, isEqualOrParent } from '../../../../base/common/resources.js';
import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IUtilityProcessWorkerWorkbenchService } from '../../../services/utilityProcess/electron-browser/utilityProcessWorkerWorkbenchService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IAdeProjectService, AdeProjectService } from '../browser/adeProjectService.js';
import { IAdeCodeService } from '../browser/adeCodeService.js';
import { adeCodeChannel, CodeContext, CodeEvidence, CodeHistory, CodePreview, CodeRename, CodeRequest, CodeSource } from '../common/codeBridge.js';

/** Native orchestration: analysis is explicit and cancellable; source files are never rewritten. */
class AdeCodeService extends Disposable implements IAdeCodeService {
	declare readonly _serviceBrand: undefined;
	readonly available = true;
	private readonly changes = this._register(new Emitter<void>());
	readonly onDidChange = this.changes.event;
	private readonly watchers = this._register(new DisposableStore());
	context: CodeContext | undefined;
	busy = false;
	changed = false;
	private channel: Promise<IChannel> | undefined;
	private observed = '';
	private readonly bundles = new Map<string, string[]>();

	constructor(
		@IAdeProjectService private readonly project: AdeProjectService,
		@IUtilityProcessWorkerWorkbenchService private readonly workers: IUtilityProcessWorkerWorkbenchService,
		@IFileDialogService private readonly dialogs: IFileDialogService,
		@IQuickInputService private readonly quickInput: IQuickInputService,
		@INotificationService private readonly notifications: INotificationService,
		@IProgressService private readonly progress: IProgressService,
		@IFileService private readonly files: IFileService,
		@IEditorService private readonly editors: IEditorService
	) {
		super();
		this._register(project.onDidChange(() => { void this.refresh(); }));
		void this.refresh();
	}
	private getChannel(): Promise<IChannel> {
		return this.channel ??= this.workers.createWorker({ moduleId: 'vs/workbench/contrib/ade/node/adeCodeWorkerMain', type: 'ade-code', name: localize('ade.code.worker', "A.D.E Code Analysis") }).then(worker => {
			this._register(worker);
			void worker.onDidTerminate.then(() => { this.channel = undefined; });
			return worker.client.getChannel(adeCodeChannel);
		}, error => { this.channel = undefined; throw error; });
	}
	private async request<T>(request: CodeRequest, token = CancellationToken.None): Promise<T> {
		const channel = await this.getChannel();
		return JSON.parse(await channel.call<string>('execute', JSON.stringify(request), token));
	}
	async executeCollaboration(request: string, token = CancellationToken.None): Promise<string> {
		return (await this.getChannel()).call<string>('execute', JSON.stringify({ operation: 'collaboration', request }), token);
	}
	private async run(title: string, task: (token: CancellationToken) => Promise<void>): Promise<void> {
		if (this.busy) { return; }
		this.busy = true; this.changes.fire();
		const cancellation = new CancellationTokenSource();
		try { await this.progress.withProgress({ location: ProgressLocation.Notification, title, cancellable: true }, () => task(cancellation.token), () => cancellation.cancel()); }
		catch (error) { if (!/abort|cancel/i.test(String(error))) { this.notifications.error(localize('ade.code.failed', "Code analysis failed: {0}", String(error.message ?? error))); } }
		finally { cancellation.dispose(); this.busy = false; this.changes.fire(); }
	}
	private setContext(context: CodeContext | undefined): void {
		this.context = context; this.changed = false; this.watchers.clear();
		if (context) {
			const root = URI.file(context.sourceRoot);
			this.watchers.add(this.files.watch(root, { recursive: true, excludes: ['**/.ade/**', '**/.git/**', '**/node_modules/**'] }));
			this.watchers.add(this.files.onDidFilesChange(event => {
				if (!this.changed && [...event.rawAdded, ...event.rawUpdated, ...event.rawDeleted].some(resource => isEqualOrParent(resource, root) && !isEqualOrParent(resource, URI.joinPath(root, '.ade')))) { this.changed = true; this.changes.fire(); }
			}));
		}
		this.changes.fire();
	}
	private async refresh(): Promise<void> {
		const resource = this.project.modelUri;
		const key = resource?.toString() ?? '';
		if (key === this.observed) { return; }
		this.observed = key;
		if (!resource || resource.scheme !== 'file' || basename(resource) !== 'model.ade.json') { this.setContext(undefined); return; }
		try {
			const context = await this.request<CodeContext>({ operation: 'inspect', snapshot: dirname(resource).fsPath });
			if (this.observed === key) { this.setContext(context); }
		} catch { if (this.observed === key) { this.setContext(undefined); } }
	}
	private async open(context: CodeContext): Promise<void> {
		if (await this.project.openModelResource(URI.file(context.model))) { this.observed = this.project.modelUri!.toString(); this.setContext(context); this.project.showSystemMap(); }
	}
	async importCodebase(): Promise<void> {
		const selected = await this.dialogs.showOpenDialog({ title: localize('ade.code.import', "Import Codebase"), canSelectFiles: false, canSelectFolders: true, canSelectMany: false });
		if (!selected?.[0] || selected[0].scheme !== 'file') { return; }
		const mode = await this.quickInput.pick([
			{ label: localize('ade.code.auto', "Structure and Available Semantic Analysis"), description: localize('ade.code.auto.detail', "16 syntax profiles; built-in JavaScript/TypeScript compiler; optional SCIP indexes"), syntaxOnly: false },
			{ label: localize('ade.code.syntax', "Structure Only"), description: localize('ade.code.syntax.detail', "Declarations and textual contracts; references stay unresolved"), syntaxOnly: true }
		], { title: localize('ade.code.import', "Import Codebase"), placeHolder: localize('ade.code.accountFree', "Local deterministic analysis. No account or AI is required.") });
		if (!mode) { return; }
		await this.run(localize('ade.code.importing', "Importing Codebase"), async token => {
			await this.open(await this.request<CodeContext>({ operation: 'import', root: selected[0].fsPath, syntaxOnly: mode.syntaxOnly }, token));
		});
	}
	async sync(): Promise<void> { await this.reviewSync(); }
	private async reviewSync(renames: CodeRename[] = [], scope = this.context?.scope): Promise<void> {
		const current = this.context;
		if (!current || this.busy) { return; }
		if (this.project.dirty && !await this.project.save()) { return; }
		const version = this.project.documentVersion;
		let preview: CodePreview | undefined;
		await this.run(localize('ade.code.preparing', "Preparing Sync Preview"), async token => { preview = await this.request<CodePreview>({ operation: 'preview', snapshot: current.snapshot, scope, renames, bundles: this.bundles.get(current.sourceRoot) }, token); });
		if (!preview) { return; }
		const result = preview;
		const summary = localize('ade.code.summary', "Files: {0} added, {1} changed, {2} removed; {3} parsed, {4} reused. Symbols: +{5} / ~{6} / −{7}. Dependencies: +{8} / ~{9} / −{10}. Review {11} views.", result.files.added.length, result.files.changed.length, result.files.removed.length, result.parsed.length, result.reused.length, result.declarations.added.length, result.declarations.changed.length, result.declarations.removed.length, result.dependencies.added.length, result.dependencies.changed.length, result.dependencies.removed.length, result.impact.viewIds.length);
		const options: (IQuickPickItem & { action: string })[] = [];
		if (!result.conflicts.length) { options.push({ label: localize('ade.code.apply', "Apply Sync"), detail: summary, action: 'apply' }); }
		else { options.push({ label: localize('ade.code.blocked', "Sync Blocked — Review Conflicts"), detail: result.conflicts.map(item => `${item.code}: ${item.path}`).join('; '), action: 'conflicts' }); }
		if (result.declarations.removed.length && result.declarations.added.length) { options.push({ label: localize('ade.code.rename', "Confirm a Symbol Rename"), detail: localize('ade.code.rename.detail', "Choose the previous and current declaration to preserve its identity."), action: 'rename' }); }
		options.push({ label: localize('ade.code.coverage', "Inspect Coverage and Evidence"), detail: summary, action: 'inspect' }, { label: localize('ade.code.cancel', "Cancel"), action: 'cancel' });
		const choice = await this.quickInput.pick(options, { ignoreFocusLost: true, title: localize('ade.code.preview', "Sync Preview"), placeHolder: summary });
		if (choice?.action === 'rename') {
			const old = await this.quickInput.pick(current.declarations.filter(item => result.declarations.removed.includes(item.id)).map(item => ({ label: item.name, description: item.evidence.file, declaration: item })), { ignoreFocusLost: true, title: localize('ade.code.rename.old', "Choose the Previous Declaration") });
			if (!old) { return; }
			const next = await this.quickInput.pick(result.context.declarations.filter(item => result.declarations.added.includes(item.id) && item.kind === old.declaration.kind).map(item => ({ label: item.name, description: item.evidence.file, declaration: item })), { ignoreFocusLost: true, title: localize('ade.code.rename.new', "Choose the Renamed Declaration") });
			if (next) { await this.reviewSync([...renames, { fromId: old.declaration.id, toSourceId: next.declaration.sourceId }], scope); }
		} else if (choice?.action === 'apply') {
			if (version !== this.project.documentVersion || this.context?.snapshot !== current.snapshot) { this.notifications.warn(localize('ade.code.stale', "The model changed. Run Sync again to review a fresh preview.")); return; }
			await this.run(localize('ade.code.applying', "Applying Sync"), async token => { await this.open(await this.request<CodeContext>({ operation: 'apply', token: result.token }, token)); });
		} else if (choice?.action === 'conflicts') {
			const labels: Record<string, string> = {
				manualEdit: localize('ade.code.conflict.manual', "Your Model Edits Overlap the Source Update"),
				identityAmbiguity: localize('ade.code.conflict.identity', "Symbol Identity Is Ambiguous"),
				incompleteSource: localize('ade.code.conflict.source', "Source Analysis Is Incomplete"),
				invalidModel: localize('ade.code.conflict.model', "The Updated Model Would Be Invalid"),
				incompleteSemantic: localize('ade.code.conflict.semantic', "Refresh the Attached Semantic Indexes")
			};
			await this.quickInput.pick(result.conflicts.map(item => ({ label: labels[item.code] ?? item.code, description: item.path, detail: localize('ade.code.conflict.detail', "No snapshot was published. Resolve the source/model conflict, or restore an earlier model snapshot, then run Sync again.") })), { title: localize('ade.code.conflicts', "Sync Conflicts"), ignoreFocusLost: true, matchOnDescription: true });
		} else if (choice?.action === 'inspect') { await this.showEvidence(result.context); }
	}
	async configure(): Promise<void> {
		const context = this.context;
		if (!context || this.busy) { return; }
		const include = await this.quickInput.input({ title: localize('ade.code.scope.include', "Include Source Paths"), prompt: localize('ade.code.scope.glob', "Comma-separated glob patterns relative to the codebase"), value: context.scope.include.join(', ') });
		if (include === undefined) { return; }
		const exclude = await this.quickInput.input({ title: localize('ade.code.scope.exclude', "Exclude Source Paths"), prompt: localize('ade.code.scope.ignore', "Comma-separated Git ignore patterns; .gitignore and .adeignore also apply"), value: context.scope.exclude.join(', ') });
		if (exclude === undefined) { return; }
		const patterns = (text: string) => text.split(',').map(item => item.trim()).filter(Boolean);
		await this.reviewSync([], { ...context.scope, include: patterns(include), exclude: patterns(exclude) });
	}
	async attachIndex(): Promise<void> {
		const context = this.context;
		if (!context || this.busy) { return; }
		const paths = await this.dialogs.showOpenDialog({ title: localize('ade.code.index', "Attach Fresh SCIP Bundles"), canSelectFiles: true, canSelectFolders: false, canSelectMany: true, filters: [{ name: localize('ade.code.scipFilter', "SCIP JSON"), extensions: ['json'] }] });
		if (!paths?.length || paths.some(path => path.scheme !== 'file')) { return; }
		this.bundles.set(context.sourceRoot, paths.map(path => path.fsPath));
		await this.sync();
	}
	async recover(): Promise<void> {
		const context = this.context;
		if (!context || this.busy) { return; }
		const history = await this.request<CodeHistory>({ operation: 'history', snapshot: context.snapshot });
		const choice = await this.quickInput.pick(history.snapshots.filter(item => item.directory !== context.snapshot).map(item => ({ label: item.directory.split(/[\\/]/).pop()!, description: item.revision.slice(0, 12), directory: item.directory })), { ignoreFocusLost: true, title: localize('ade.code.recover', "Restore Model Snapshot"), placeHolder: localize('ade.code.recover.detail', "Restores the model and index. Source files keep their current contents.") });
		if (!choice || this.project.dirty && !await this.project.save()) { return; }
		await this.run(localize('ade.code.restoring', "Restoring Snapshot"), async token => { await this.open(await this.request<CodeContext>({ operation: 'restore', snapshot: context.snapshot, target: choice.directory }, token)); });
	}
	async inspect(elementId?: string): Promise<void> { if (this.context) { await this.showEvidence(this.context, elementId); } }
	private async showEvidence(context: CodeContext, elementId?: string): Promise<void> {
		const items: (IQuickPickItem & { evidence?: CodeEvidence })[] = [];
		const names = new Map(context.declarations.map(item => [item.id, item.name]));
		const selectedFile = context.files.find(file => file.elementId === elementId)?.path;
		for (const item of context.declarations) {
			if (elementId && item.id !== elementId && item.evidence.file !== selectedFile) { continue; }
			items.push({ label: item.name, description: `${item.evidence.file}:${item.evidence.line}`, detail: localize('ade.code.fact', "Extracted declaration · {0}", item.kind), evidence: item.evidence });
		}
		for (const edge of context.dependencies) {
			if (elementId && edge.id !== elementId && edge.from !== elementId && edge.to !== elementId && !edge.references.some(reference => reference.source.file === selectedFile)) { continue; }
			const name = (id: string) => names.get(id) ?? id;
			for (const reference of edge.references) {
				items.push({ label: `${name(edge.from)} → ${name(edge.to)}`, description: `${reference.source.file}:${reference.source.line}`, detail: localize('ade.code.reference', "Static reference · {0} · target {1}:{2}", reference.provider, reference.target.file, reference.target.line), evidence: reference.source });
				items.push({ label: localize('ade.code.definition', "Target Definition: {0}", name(edge.to)), description: `${reference.target.file}:${reference.target.line}`, evidence: reference.target });
			}
		}
		if (!elementId) {
			for (const file of context.files) { items.push({ label: file.path, description: `${file.language} · ${file.status}`, detail: file.diagnostics.join('; ') }); }
			for (const diagnostic of context.diagnostics) { items.push({ label: diagnostic }); }
		}
		if (!items.length) { items.push({ label: localize('ade.code.noEvidence', "No Extracted Code Evidence for This Element") }); }
		const choice = await this.quickInput.pick(items, { ignoreFocusLost: true, title: localize('ade.code.evidence', "Code Coverage and Evidence"), matchOnDescription: true, matchOnDetail: true, placeHolder: localize('ade.code.evidence.detail', "{0} files · {1} declarations · {2} dependencies. Extracted facts; runtime behavior and responsibilities are unobserved.", context.files.length, context.declarations.length, context.dependencies.length) });
		if (!choice?.evidence) { return; }
		if (context.revision !== this.context?.revision) { this.notifications.info(localize('ade.code.previewEvidence', "Apply Sync before navigating to the updated source positions.")); return; }
		const source = await this.request<CodeSource>({ operation: 'source', snapshot: context.snapshot, file: choice.evidence.file, revision: choice.evidence.revision, start: choice.evidence.start, end: choice.evidence.end });
		if (source.stale) { this.notifications.warn(localize('ade.code.sourceStale', "The source changed since this evidence was recorded. Run Sync to update positions.")); }
		await this.editors.openEditor({ resource: URI.file(source.path), options: { pinned: true, selection: source.stale ? undefined : { startLineNumber: source.startLine, startColumn: source.startColumn, endLineNumber: source.endLine, endColumn: source.endColumn } } });
	}
}
registerSingleton(IAdeCodeService, AdeCodeService, InstantiationType.Delayed);
for (const [id, title, method] of [
	['ade.importCodebase', localize2('ade.code.command.import', "Import Codebase"), 'importCodebase'],
	['ade.syncCode', localize2('ade.code.command.sync', "Sync Codebase"), 'sync'],
	['ade.inspectCode', localize2('ade.code.command.inspect', "Inspect Code Evidence"), 'inspect'],
	['ade.restoreCodeSnapshot', localize2('ade.code.command.restore', "Restore Code Model Snapshot"), 'recover'],
	['ade.attachCodeIndex', localize2('ade.code.command.attach', "Attach SCIP Bundles"), 'attachIndex'],
	['ade.configureCodeScope', localize2('ade.code.command.scope', "Configure Import Scope"), 'configure']
] as const) {
	registerAction2(class extends Action2 {
		constructor() { super({ id, title, category: localize2('ade.code.category', "A.D.E"), f1: true }); }
		override async run(accessor: ServicesAccessor): Promise<void> { await accessor.get(IAdeCodeService)[method](); }
	});
}
