import { localize } from '../../../../nls.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { relativePath } from '../../../../base/common/resources.js';
import { isDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IAdeProjectService } from '../browser/adeProjectService.js';
import type { FeatureCodeDiff, FeatureCodeGenerationRequest, FeatureCodeGenerationRun, FeatureCodeGenerationSetup } from '../common/featureCodeGeneration.js';
import type { AdeAiConnection } from './adeAiConnection.js';
import type { AdeAiProject, AdeAiWorkflow } from './adeAiTypes.js';

interface Target { root: string; modelFile: string; key: string }

/** Keeps the workbench on the current feature while the worker owns staging and publication. */
export class AdeAiFeatureCode extends Disposable {
	run: FeatureCodeGenerationRun | undefined;
	problem: string | undefined;
	private currentKey: string | undefined;
	private cancellation: CancellationTokenSource | undefined;

	constructor(
		private readonly host: AdeAiWorkflow,
		private readonly connection: AdeAiConnection,
		@IAdeProjectService private readonly project: AdeAiProject,
		@IConfigurationService private readonly configuration: IConfigurationService,
		@IStorageService private readonly storage: IStorageService,
		@IDialogService private readonly dialogs: IDialogService,
		@IEditorService private readonly editors: IEditorService,
		@ITextModelService private readonly textModels: ITextModelService,
	) { super(); }

	private target(): Target | undefined {
		const root = this.project.projectRoot, model = this.project.modelUri;
		if (root?.scheme !== 'file' || model?.scheme !== 'file' || !this.project.editable || this.project.error) { return undefined; }
		const modelFile = relativePath(root, model);
		if (!modelFile || modelFile.startsWith('../')) { return undefined; }
		return { root: root.fsPath, modelFile, key: 'ade.ai.featureCode:' + model.toString() };
	}

	private current(target: Target): boolean { return this.target()?.key === target.key; }

	private record(target: Target, run: FeatureCodeGenerationRun): void {
		if (!this.current(target)) { return; }
		this.currentKey = target.key;
		this.storage.store(target.key, run.id, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		this.run = run;
		this.host.changed();
	}

	private showProblem(target: Target, error: unknown): void {
		if (!this.current(target)) { return; }
		this.problem = error instanceof Error ? error.message : String(error);
		this.host.changed();
	}

	followProject(): void {
		const target = this.target();
		if (target?.key === this.currentKey) { return; }
		this.currentKey = target?.key;
		this.cancellation?.cancel();
		this.run = undefined;
		this.problem = undefined;
		const id = target && this.storage.get(target.key, StorageScope.WORKSPACE);
		if (target && id) {
			// Restoration is read-only. Do not open an editor or send a provider request during project load.
			void this.host.request<FeatureCodeGenerationRun>({ operation: 'featureImplementationSession', root: target.root, id }).then(run => this.record(target, run), error => this.showProblem(target, error));
		}
	}

	async inspect(): Promise<FeatureCodeGenerationSetup | undefined> {
		const target = this.target();
		if (!target || this.host.busy) { return undefined; }
		try {
			const setup = await this.host.request<FeatureCodeGenerationSetup>({ operation: 'featureImplementationInspect', root: target.root, modelFile: target.modelFile });
			return this.current(target) ? setup : undefined;
		} catch (error) { this.showProblem(target, error); return undefined; }
	}

	async prepare(request: FeatureCodeGenerationRequest): Promise<void> {
		const target = this.target();
		if (!target || this.host.busy || this.configuration.getValue<boolean>('chat.disableAIFeatures') === true) { return; }
		const config = await this.connection.readyConfig();
		if (!config || !this.current(target)) { return; }
		if (!config.maxCalls) { this.showProblem(target, localize('ade.featureCode.requestsDisabled', "Enable AI Requests in AI Settings Before Preparing Code.")); return; }
		await this.host.run(async token => {
			if (!this.current(target) || !await this.project.save()) { return; }
			this.problem = undefined;
			try {
				const run = await this.host.request<FeatureCodeGenerationRun>({ operation: 'featureImplementationPrepare', root: target.root, modelFile: target.modelFile, ...request, config }, token);
				this.record(target, run);
				await this.advance(target, run, token);
			} catch (error) { if (!token.isCancellationRequested) { this.showProblem(target, error); } throw error; }
		}, { inline: true });
	}

	async resume(clarification?: string): Promise<void> {
		const target = this.target(), run = this.run;
		if (!target || !run || this.host.busy) { return; }
		await this.host.run(async token => {
			if (!this.current(target) || !await this.project.save()) { return; }
			this.problem = undefined;
			await this.advance(target, run, token, clarification);
		}, { inline: true });
	}

	private async advance(target: Target, start: FeatureCodeGenerationRun, token: CancellationToken, clarification?: string): Promise<void> {
		const source = new CancellationTokenSource(token);
		this.cancellation = source;
		let run = start;
		try {
			for (let remaining = start.tasks.length + 1; remaining > 0 && !source.token.isCancellationRequested && this.current(target); remaining--) {
				if (run.status === 'waitingUser' ? !clarification?.trim() : !['prepared', 'generating', 'failed', 'interrupted'].includes(run.status)) { break; }
				const next = run.tasks.find(task => task.status !== 'ready')?.id ?? run.verification?.cases?.find(result => !result.passed)?.featureId;
				const previous = JSON.stringify([run.status, ...run.tasks.map(task => task.status)]);
				this.run = { ...run, status: 'generating', tasks: run.tasks.map(task => task.id === next ? { ...task, status: 'running' } : task) };
				this.host.changed();
				run = await this.host.request<FeatureCodeGenerationRun>({ operation: 'featureImplementationStep', root: target.root, id: run.id, ...(clarification?.trim() ? { clarification: clarification.trim() } : {}) }, source.token);
				clarification = undefined;
				this.record(target, run);
				if (run.status === 'failed' || run.status === 'interrupted' || JSON.stringify([run.status, ...run.tasks.map(task => task.status)]) === previous) { break; }
			}
		} catch (error) {
			if (!source.token.isCancellationRequested) { this.showProblem(target, error); }
			if (this.current(target)) {
				this.run = run;
				this.host.changed();
				try { this.record(target, await this.host.request<FeatureCodeGenerationRun>({ operation: 'featureImplementationSession', root: target.root, id: start.id })); }
				catch (loadError) { if (!source.token.isCancellationRequested) { this.showProblem(target, loadError); } }
			}
			if (!source.token.isCancellationRequested) { throw error; }
		} finally {
			this.cancellation = undefined;
			source.dispose();
		}
	}

	cancel(): void { this.cancellation?.cancel(); }

	async action(operation: 'featureImplementationVerify' | 'featureImplementationApply' | 'featureImplementationUndo' | 'featureImplementationRecover'): Promise<void> {
		const target = this.target(), run = this.run;
		if (!target || !run || this.host.busy) { return; }
		await this.host.run(async token => {
			if (!this.current(target) || this.run !== run) { return; }
			if (operation === 'featureImplementationVerify' && (!run.reviewId || !['ready', 'failed', 'verified'].includes(run.status))) { return; }
			if (operation === 'featureImplementationApply' || operation === 'featureImplementationUndo') {
				const apply = operation === 'featureImplementationApply';
				if (apply ? run.status !== 'verified' || !run.verification?.passed || !run.files.length : run.status !== 'applied') { return; }
				const message = apply ? localize('ade.featureCode.applyConfirm', "Apply the Verified Code Changes?") : localize('ade.featureCode.undoConfirm', "Restore the Previous Code Files?");
				const detail = localize('ade.featureCode.changeFiles', "Local files affected:\n{0}", run.files.map(file => file.file).join('\n'));
				if (!(await this.dialogs.confirm({ message, detail })).confirmed) { return; }
			}
			if (!this.current(target) || this.run !== run || !await this.project.save() || token.isCancellationRequested) { return; }
			this.problem = undefined;
			try {
				const next = await this.host.request<FeatureCodeGenerationRun>({ operation, root: target.root, id: run.id, ...(operation !== 'featureImplementationRecover' ? { reviewId: run.reviewId } : {}) }, token);
				this.record(target, next);
			} catch (error) { if (!token.isCancellationRequested) { this.showProblem(target, error); } throw error; }
		}, { kind: operation === 'featureImplementationVerify' ? 'ai' : 'local', inline: true });
	}

	async diff(file: string): Promise<void> {
		const target = this.target(), run = this.run;
		if (!target || !run?.files.some(entry => entry.file === file)) { return; }
		try {
			const diff = await this.host.request<FeatureCodeDiff>({ operation: 'featureImplementationDiff', root: target.root, id: run.id, file });
			if (!this.current(target) || this.run !== run) { return; }
			const original = await this.textModels.createSyntheticDocument(diff.before ?? '', null);
			try {
				const modified = await this.textModels.createSyntheticDocument(diff.after ?? '', null);
				try {
					const pane = await this.editors.openEditor({ original: { resource: original.object.textEditorModel.uri }, modified: { resource: modified.object.textEditorModel.uri }, label: file, options: { pinned: true } });
					const control = pane?.getControl();
					if (isDiffEditor(control)) { control.updateOptions({ readOnly: true, originalEditable: false }); }
				} finally { modified.dispose(); }
			} finally { original.dispose(); }
		} catch (error) { this.showProblem(target, error); }
	}

	override dispose(): void {
		this.cancellation?.cancel();
		super.dispose();
	}
}
