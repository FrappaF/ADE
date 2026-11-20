import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IOrditoCodeService } from '../browser/orditoCodeService.js';
import { IOrditoProjectService } from '../browser/orditoProjectService.js';
import { orditoErrorNotification } from '../browser/orditoErrors.js';
import { codeUpdateContent, createModelCodeUpdateContext, describeModelCodeChanges, type ModelCodeUpdateState, type SavedModelChange } from '../common/modelCodeUpdate.js';
import { canonicalJson } from '../common/modelSerialization.js';
import { type OrditoAiConnection } from './orditoAiConnection.js';
import { runCodeUpdate } from './orditoAiCodeUpdateRunner.js';
import { type OrditoAiProject, type OrditoAiWorkflow } from './orditoAiTypes.js';

interface CodeUpdateTarget {
	root: string;
	modelUri: string;
}

interface PreparedCodeUpdate {
	change: SavedModelChange;
	revision: string;
	context: string;
}

/** Carries saved implementation intent through a dedicated, cancellable workflow. */
export class OrditoAiCodeUpdates extends Disposable {
	private view: ModelCodeUpdateState | undefined;
	private target: CodeUpdateTarget | undefined;
	private prepared: PreparedCodeUpdate | undefined;
	private active: CancellationTokenSource | undefined;
	private opening = false;

	get state(): ModelCodeUpdateState | undefined { return this.view; }

	constructor(
		private readonly host: Pick<OrditoAiWorkflow, 'busy' | 'changed' | 'info' | 'run'>,
		private readonly connection: OrditoAiConnection,
		@IOrditoProjectService private readonly project: OrditoAiProject,
		@IOrditoCodeService private readonly code: IOrditoCodeService,
		@IConfigurationService private readonly configuration: IConfigurationService,
		@INotificationService private readonly notifications: INotificationService,
		@ICommandService private readonly commands: ICommandService
	) {
		super();
		this._register(project.onDidSaveModel(change => this.suggest(change)));
		this._register(project.onDidChange(() => this.followProject()));
	}

	private projectTarget(): CodeUpdateTarget | undefined {
		const root = this.project.projectRoot;
		const model = this.project.modelUri;
		return root?.scheme === 'file' && model?.scheme === 'file' ? { root: root.fsPath, modelUri: model.toString() } : undefined;
	}

	private sameProject(target: CodeUpdateTarget): boolean {
		const current = this.projectTarget();
		return current?.root === target.root && current.modelUri === target.modelUri;
	}

	private currentRevision(): string {
		return canonicalJson(codeUpdateContent(this.project.model));
	}

	private setState(state: ModelCodeUpdateState | undefined): void {
		this.view = state;
		this.host.changed();
	}

	private followProject(): void {
		if (!this.target) { return; }
		if (!this.sameProject(this.target)) {
			this.active?.cancel();
			this.target = undefined;
			this.prepared = undefined;
			this.setState(undefined);
		} else if (this.prepared && (this.project.hasStructuralErrors || this.prepared.revision !== this.currentRevision())) {
			this.invalidate();
		}
	}

	private invalidate(): void {
		const running = this.view?.phase === 'running';
		this.active?.cancel();
		this.prepared = undefined;
		if (this.view) {
			const status = running ? localize('ordito.codeUpdate.staleRunning', "The diagrams changed during the update. Review any local file changes before refreshing.") : localize('ordito.codeUpdate.stale', "The diagrams have changed. Refresh the saved changes before continuing.");
			this.setState({ id: this.view.id, phase: 'unavailable', changes: [], status, canRefresh: true });
		}
	}

	private suggest(change: SavedModelChange): void {
		if (this.host.busy || this.active || !this.project.editable || this.project.hasStructuralErrors ||
			this.configuration.getValue<boolean>('chat.disableAIFeatures') === true || this.configuration.getValue<boolean>('ordito.codeUpdates.suggestAfterSave') === false ||
			change.modelUri !== this.projectTarget()?.modelUri) { return; }
		this.notifications.prompt(Severity.Info, localize('ordito.codeUpdate.suggest', "Saved diagram changes are ready for a codebase update."), [{
			label: localize('ordito.codeUpdate.button', "Update Codebase from Diagrams"),
			run: () => this.commands.executeCommand('ordito.ai.updateCodebase')
		}]);
	}

	async update(): Promise<void> {
		if (this.opening || this.active) { return; }
		const target = this.projectTarget();
		if (!target) {
			this.host.info(localize('ordito.codeUpdate.localProject', "Open a local diagram project before updating its codebase."));
			return;
		}
		this.opening = true;
		try {
			const id = generateUuid();
			this.target = target;
			this.prepared = undefined;
			if (!this.project.editable || this.project.hasStructuralErrors) {
				this.setState({ id, phase: 'unavailable', changes: [], status: localize('ordito.codeUpdate.invalidModel', "Open an editable model and resolve its validation errors before updating the codebase.") });
				return;
			}
			const saved = await this.project.save();
			if (!this.sameProject(target)) { return; }
			const change = this.project.lastSavedChange;
			if (!saved || this.project.hasStructuralErrors) {
				this.setState({ id, phase: 'unavailable', changes: [], status: this.project.saveError ?? localize('ordito.codeUpdate.saveRequired', "Save valid diagram changes before updating the codebase.") });
			} else if (!change?.changes.length) {
				this.setState({ id, phase: 'unavailable', changes: [], status: localize('ordito.codeUpdate.noChanges', "There are no pending saved diagram changes. Edit and save a diagram to prepare an update.") });
			} else {
				const revision = canonicalJson(codeUpdateContent(change.model));
				if (change.modelUri !== target.modelUri || revision !== this.currentRevision()) {
					this.setState({ id, phase: 'unavailable', changes: [], status: localize('ordito.codeUpdate.changedWhileSaving', "The diagrams changed while preparing the update. Save them and refresh the changes."), canRefresh: true });
					return;
				}
				this.prepared = { change, revision, context: JSON.stringify(createModelCodeUpdateContext(change)) };
				this.setState({ id, phase: 'ready', changes: describeModelCodeChanges(change.changes) });
			}
		} finally {
			this.opening = false;
		}
	}

	async start(): Promise<void> {
		const view = this.view;
		const target = this.target;
		const prepared = this.prepared;
		if (!view || !target || !prepared || this.active || this.host.busy) { return; }
		if (!this.sameProject(target) || prepared.revision !== this.currentRevision() || !this.project.editable || this.project.hasStructuralErrors) {
			this.invalidate();
			return;
		}
		const source = new CancellationTokenSource();
		this.active = source;
		const started = Date.now();
		let entered = false;
		const playing = (phase: ModelCodeUpdateState['phase'], status: string, summary?: string) => {
			if (this.prepared !== prepared || this.active !== source) { return; }
			this.setState({ ...view, phase, status, summary, durationMs: phase === 'running' ? undefined : Date.now() - started });
		};
		const cancelled = () => playing('cancelled', localize('ordito.codeUpdate.cancelled', "Update stopped. Review any local file changes before retrying."));
		playing('running', localize('ordito.codeUpdate.preparing', "Checking the workspace and saved diagram changes"));
		try {
			await this.host.run(async token => {
				entered = true;
				const hostCancellation = token.onCancellationRequested(() => source.cancel());
				try {
					if (source.token.isCancellationRequested || token.isCancellationRequested) { cancelled(); return; }
					if (!this.sameProject(target) || prepared.revision !== this.currentRevision() || !this.project.editable || this.project.hasStructuralErrors) { this.invalidate(); return; }
					const result = await runCodeUpdate({
						root: target.root,
						context: prepared.context,
						token: source.token,
						onProgress: message => { if (!source.token.isCancellationRequested) { playing('running', message); } }
					}, this.connection, this.code);
					if (source.token.isCancellationRequested) { cancelled(); return; }
					if (!this.sameProject(target) || prepared.revision !== this.currentRevision()) { this.invalidate(); return; }
					if (result.outcome === 'needs-input') {
						playing('failed', localize('ordito.codeUpdate.needsInput', "Clarify the diagram changes and retry the update."), result.text);
						return;
					}
					this.project.acknowledgeCodeUpdate(prepared.change);
					playing('completed', result.outcome === 'already-aligned' ? localize('ordito.codeUpdate.aligned', "The code already reflects the saved changes.") : localize('ordito.codeUpdate.completed', "Code update completed. Review the local changes."), result.text);
					this.prepared = undefined;
				} catch (error) {
					if (source.token.isCancellationRequested || isCancellationError(error)) { cancelled(); }
					else { playing('failed', orditoErrorNotification(error, 'ai', this.project.model)); }
				} finally {
					hostCancellation.dispose();
				}
			}, { inline: true });
			if (!entered) {
				if (source.token.isCancellationRequested) { cancelled(); }
				else { playing('ready', localize('ordito.codeUpdate.notStarted', "The update did not start. Check workspace trust and AI settings, then try again.")); }
			}
		} finally {
			if (this.active === source) { this.active = undefined; }
			source.dispose();
			this.host.changed();
		}
	}

	stop(): void {
		this.active?.cancel();
		if (this.view?.phase === 'running') {
			this.setState({ ...this.view, stopping: true, status: localize('ordito.codeUpdate.stopping', "Stopping the code update") });
		}
	}

	close(): void {
		if (this.active) { return; }
		this.target = undefined;
		this.prepared = undefined;
		this.setState(undefined);
	}

	override dispose(): void {
		this.active?.dispose(true);
		this.active = undefined;
		super.dispose();
	}
}
