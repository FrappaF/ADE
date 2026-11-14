/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { editAdePredicateCriteria } from '../browser/adePredicateCriteria.js';
import { assertPureProject, type StructuralProjectSession as StructuralSession, type ProjectCriteria } from '../common/modelProject.js';
import { ModelContinuity, type ContinuityPolicy } from '../common/modelContinuity.js';
import { validateSemanticModel } from '../common/modelValidation.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { editAdeMessagingCriteria } from '../browser/adeMessagingCriteria.js';
import { editAdeStateCriteria } from '../browser/adeStateCriteria.js';
import { describeAdeStateSimulation } from '../browser/adeStateContent.js';
import { interpretModelStateMachine } from '../common/modelStates.js';
import { editAdeInteractionCriteria } from '../browser/adeInteractionCriteria.js';
import { localize } from '../../../../nls.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { hasKey } from '../../../../base/common/types.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IFilesConfigurationService } from '../../../services/filesConfiguration/common/filesConfigurationService.js';
import { IAdeProjectService } from '../browser/adeProjectService.js';
import { IAdeOperationService, AdeOperationService } from '../browser/adeOperationService.js';
import { AdeInput } from '../browser/adeInput.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../common/editor.js';
import { canonicalJson, semanticContent } from '../common/modelSerialization.js';
import { type AdeAiProject, type AdeAiWorkflow } from './adeAiTypes.js';

/** Structural model review, simulation and continuous preparation; lifecycle belongs to this component. */
export class AdeAiStructural extends Disposable {
	private structuralSession: StructuralSession | undefined;

	/** Keep the selected path: the worker canonicalizes symlinked project roots. */
	private structuralProjectRoot: string | undefined;

	private structuralInvalid = false;

	private preparationProblem: string | undefined;

	get structuralProblem(): string | undefined { return this.preparationProblem ?? this.continuity.error; }

	get structuralReview(): StructuralSession | undefined { return this.structuralSession; }

	private readonly continuity = this._register(new ModelContinuity<StructuralSession>(session => {
		this.structuralInvalid = false; this.preparationProblem = undefined; this.structuralSession = session; this.host.clearImplementation();
		this.structuralProjectRoot = this.project.projectRoot?.fsPath;
		this.storage.store('ade.structural.session', JSON.stringify({ root: this.structuralProjectRoot ?? session.root, id: session.id }), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}, policy => {
		if (policy) { this.storage.store('ade.structural.continuity', JSON.stringify(policy), StorageScope.WORKSPACE, StorageTarget.MACHINE); }
		this.host.changed();
	}));

	get continuityStatus(): string {
		const labels = { off: localize('ade.continuity.off', "Off"), paused: localize('ade.continuity.paused', "Paused"), waiting: localize('ade.continuity.waiting', "Waiting for Stable Edits"), preparing: localize('ade.continuity.preparing', "Preparing Review"), review: localize('ade.continuity.review', "Review Required"), aligned: localize('ade.continuity.aligned', "Aligned"), blocked: localize('ade.continuity.blocked', "Complete the Specification"), exhausted: localize('ade.continuity.exhausted', "Budget Exhausted"), failed: localize('ade.continuity.failed', "Preparation Failed") };
		const root = this.project.projectRoot?.fsPath;
		let budget = this.continuity.budget, state = this.continuity.state;
		if (!budget || budget.root !== root) {
			budget = undefined; state = 'off';
			try {
				const saved: ContinuityPolicy | null = JSON.parse(this.storage.get('ade.structural.continuity', StorageScope.WORKSPACE) ?? 'null');
				if (saved?.version === 1 && saved.root === root && Number.isInteger(saved.maxPreparations) && saved.maxPreparations >= 1 && saved.maxPreparations <= 100 && Number.isInteger(saved.attempted) && saved.attempted >= 0 && saved.attempted <= saved.maxPreparations) { budget = saved; state = 'paused'; }
			} catch { /* Invalid saved policies must not imply active or available work. */ }
		}
		const error = this.continuity.budget?.root === root ? this.continuity.error : undefined;
		return localize('ade.continuity.status', "Continuous Preparation: {0} · {1}/{2} Jobs · Zero AI Calls · Manual Publication", labels[state], budget?.attempted ?? 0, budget?.maxPreparations ?? 0) + (error ? ` · ${error}` : '');
	}

	async configureContinuity(): Promise<void> {
		const root = this.project.projectRoot?.fsPath;
		if (!root || (this.project.model.version !== 4 && this.project.model.version !== 5)) { return; }
		if (this.continuity.active) { const exhausted = this.continuity.state === 'exhausted'; this.continuity.pause(); if (!exhausted) { return; } }
		let saved: ContinuityPolicy | undefined;
		try { saved = JSON.parse(this.storage.get('ade.structural.continuity', StorageScope.WORKSPACE) ?? 'null'); } catch { /* Invalid saved policy requires a new explicit budget. */ }
		const canResume = saved?.root === root && saved.attempted < saved.maxPreparations;
		const choice = saved?.root === root ? await this.quick.pick([...(canResume ? [{ label: localize('ade.continuity.resume', "Resume Saved Budget"), value: 'resume' }] : []), { label: localize('ade.continuity.new', "Set New Budget"), value: 'new' }], { title: localize('ade.continuity.title', "Continuous Preparation"), ...(!canResume ? { placeHolder: localize('ade.continuity.exhaustedHelp', "The Saved Budget Is Exhausted ({0}/{1} Jobs). Set a New Budget to Continue.", saved.attempted, saved.maxPreparations) } : {}) }) : { value: 'new' };
		if (!choice) { return; }
		let policy = saved;
		if (choice.value === 'new') {
			const jobs = await this.quick.input({ title: localize('ade.continuity.limit', "Preparation Budget (1–100 Jobs)"), value: '10', validateInput: async value => /^([1-9]|[1-9][0-9]|100)$/.test(value) ? undefined : localize('ade.continuity.integer', "Enter an integer from 1 to 100.") }); if (!jobs) { return; }
			policy = { version: 1, revision: generateUuid(), root, maxPreparations: Number(jobs), attempted: 0, maxInputBytes: 196608, outputReserveBytes: 65536, review: 'manual', providerCalls: 0 };
		}
		if (!policy || policy.root !== root || this.project.projectRoot?.fsPath !== root) { return; }
		if (!(await this.dialogs.confirm({ message: localize('ade.continuity.enable', "Enable Continuous Local Preparation for This Project?"), detail: localize('ade.continuity.disclose', "Valid semantic edits are saved and coalesced into reviewed model-to-code proposals. Remaining preparations: {0}. Each context allows 192 KiB with a 64 KiB output reserve. Zero provider calls. Tests and publication require explicit review. Stop at any time; resuming retains consumption. Restarting the workbench leaves preparation paused.", policy.maxPreparations - policy.attempted), primaryButton: localize('ade.continuity.start', "Enable Preparation") })).confirmed || this.project.projectRoot?.fsPath !== root || !await this.trust.requestWorkspaceTrust()) { return; }
		this.continuity.configure(policy); this.updateContinuity();
	}

	updateContinuity(): void {
		if (!this.continuity.active) { return; }
		const root = this.project.projectRoot?.fsPath;
		if (root !== this.continuity.budget?.root) { this.continuity.pause(); return; }
		let valid = this.project.editable !== false && !this.project.error && (this.project.model.version === 4 || this.project.model.version === 5) && !validateSemanticModel(this.project.model).some(item => item.severity === 'error');
		if (valid && (this.project.model.version === 4 || this.project.model.version === 5)) { try { assertPureProject(this.project.model); } catch { valid = false; } }
		const revision = `${root}:${valid}:${canonicalJson(semanticContent(this.project.model))}`;
		this.continuity.update(revision, valid, async (signal, policy) => {
			const operation = this.operations.acquire('ai');
			if (!operation || this.host.busy) { operation?.dispose(); throw new Error(localize('ade.continuity.busy', "Another Project Operation Is Active. Pause and Resume Preparation to Retry.")); }
			const cancellation = new CancellationTokenSource(), cancel = () => cancellation.cancel(); signal.addEventListener('abort', cancel, { once: true });
			this.host.busy = true; this.host.changed();
			try {
				signal.throwIfAborted();
				if (!await this.trust.requestWorkspaceTrust() || !await this.project.save() || revision !== `${this.project.projectRoot?.fsPath}:true:${canonicalJson(semanticContent(this.project.model))}`) { throw new Error(localize('ade.continuity.changed', "The Project Changed Before Preparation.")); }
				signal.throwIfAborted();
				const result = await this.host.request<{ session?: StructuralSession }>({ operation: 'structuralPrepare', root, direction: 'forward', maxInputBytes: policy.maxInputBytes }, cancellation.token);
				return result.session;
			} finally { signal.removeEventListener('abort', cancel); cancellation.dispose(); operation.dispose(); this.host.busy = false; this.host.changed(); }
		});
	}

	get structuralCurrent(): boolean {
		const session = this.structuralSession; if (!session || this.structuralInvalid || this.project.projectRoot?.fsPath !== (this.structuralProjectRoot ?? session.root)) { return false; }
		const expected = session.status === 'applied' ? session.next.model : JSON.parse(session.observed.find(entry => entry.file === '.ade/model.json')!.value!.content);
		return canonicalJson(semanticContent(this.project.model)) === canonicalJson(semanticContent(expected));
	}

	async structuralReverse(): Promise<void> { await this.preparePureProject('reverse'); }

	async movePureSource(): Promise<void> {
		const model = this.project.model; if ((model.version !== 4 && model.version !== 5)) { return; }
		const behavior = await this.quick.pick([...(model.foundation.predicates ?? []).map(predicate => ({ label: predicate.id, id: predicate.id })), ...model.foundation.interactions.filter(entry => entry.execution).map(entry => ({ label: entry.id, id: entry.id })), ...(model.foundation.messaging ?? []).map(entry => ({ label: entry.id, id: entry.id })), ...(model.foundation.stateMachines ?? []).map(entry => ({ label: model.semantics.elements.find(element => element.id === entry.ownerId)?.name ?? entry.id, id: entry.id }))], { title: localize('ade.pure.move', "Move Model Behavior Source") }); if (!behavior) { return; }
		const file = await this.quick.input({ title: localize('ade.pure.move.path', "Destination Source"), value: 'src/model-behavior.mjs', prompt: localize('ade.pure.move.hint', "Choose a source filename. The reviewed plan preserves the behavior identity.") });
		if (file) { await this.preparePureProject('forward', { [behavior.id]: file }); }
	}

	async preparePureProject(direction: 'forward' | 'reverse', paths?: Record<string, string>): Promise<void> {
		await this.host.run(async token => {
			const root = this.project.projectRoot?.fsPath;
			if (!root || !this.project.modelUri?.path.endsWith('/.ade/model.json')) { this.host.info(localize('ade.pure.projectRequired', "Code Review Requires a Project Saved as .ade/model.json. Use Save Project Copy to save this model at that location inside a project folder, then prepare the review again.")); return; }
			if (!await this.project.save() || !await this.trust.requestWorkspaceTrust()) { return; }
			const revision = canonicalJson(semanticContent(this.project.model));
			this.preparationProblem = undefined;
			let result: { status: string; session?: StructuralSession };
			try { result = await this.host.request({ operation: 'structuralPrepare', root, direction, ...(paths ? { paths } : {}) }, token); }
			catch (error) { if (!token.isCancellationRequested) { this.preparationProblem = error instanceof Error ? error.message : String(error); this.host.changed(); } throw error; }
			if (token.isCancellationRequested || this.project.projectRoot?.fsPath !== root || revision !== canonicalJson(semanticContent(this.project.model))) { return; }
			if (!result.session) { this.structuralSession = undefined; this.host.clearImplementation(); this.structuralInvalid = false; this.host.info(localize('ade.pure.aligned', "Model Behavior Is Aligned · No Proposal · No AI Calls")); return; }
			this.structuralInvalid = false; this.structuralSession = result.session; this.structuralProjectRoot = root; this.host.clearImplementation();
			this.storage.store('ade.structural.session', JSON.stringify({ root, id: result.session.id }), StorageScope.WORKSPACE, StorageTarget.MACHINE);
			await this.reviewPureProject();
		}, { kind: 'local' });
	}

	async structuralTechnicalReview(): Promise<void> { await this.host.run(async () => this.reviewPureProject(true), { kind: 'local' }); }

	async reviewPureProject(technical = false): Promise<void> {
		const session = this.structuralSession; if (!session) { return; }
		if (!technical) { await this.editors.openEditor({ resource: AdeInput.RESOURCE, options: { pinned: true, revealIfOpened: true } }); this.host.changed(); return; }
		const summary = session.mutations.map(edit => ({ file: edit.file, action: edit.before === null ? 'create' : edit.after === null ? 'delete' : 'modify', before: edit.before?.content ?? null, after: edit.after?.content ?? null }));
		for (const edit of summary) {
			const folder = URI.joinPath(URI.file(session.root), '.ade', 'structural', 'sessions', session.id, 'review');
			const original = URI.joinPath(folder, 'before', edit.file), modified = URI.joinPath(folder, 'after', edit.file);
			await this.files.createFolder(URI.joinPath(original, '..')); await this.files.createFolder(URI.joinPath(modified, '..'));
			await this.files.writeFile(original, VSBuffer.fromString(edit.before ?? '')); await this.files.writeFile(modified, VSBuffer.fromString(edit.after ?? ''));
			await this.filesConfiguration.updateReadonly([original, modified], { value: localize('ade.pure.reviewSnapshot', "This file is a review snapshot. Change the model and prepare a new review to update it.") });
			await this.editors.openEditor({ original: { resource: original }, modified: { resource: modified }, label: edit.file, options: { pinned: true } });
		}
		const report = URI.joinPath(URI.file(session.root), '.ade', 'structural', 'sessions', session.id, 'review', 'Technical Review.json');
		await this.files.createFolder(URI.joinPath(report, '..'));
		await this.files.writeFile(report, VSBuffer.fromString(JSON.stringify({ status: this.status, direction: session.direction, changes: summary.map(({ before, after, ...entry }) => entry), coverage: session.coverage, context: session.packets.map(entry => JSON.parse(entry.packet.bytes)), verification: session.verification ?? null, calls: 0, cost: null }, null, '\t')));
		await this.filesConfiguration.updateReadonly(report, { value: localize('ade.pure.reviewSnapshot', "This file is a review snapshot. Change the model and prepare a new review to update it.") });
		await this.editors.openEditor({ resource: report, options: { pinned: true } });
	}

	async runPureAction(operation: 'structuralVerify' | 'structuralApply' | 'structuralUndo'): Promise<void> {
		await this.host.run(async token => {
			if (!(operation === 'structuralVerify' ? this.canVerify : operation === 'structuralUndo' ? this.canUndo : this.canApply)) { return; }
			const session = this.structuralSession; if (!session || !this.structuralCurrent || !await this.project.save()) { return; }
			const message = operation === 'structuralVerify' ? localize('ade.pure.verify', "Verify the Reviewed Model Behavior?") : operation === 'structuralUndo' ? localize('ade.pure.undo', "Restore the Previous Model and Code?") : localize('ade.pure.apply', "Apply the Verified Changes to This Project?");
			const detail = operation === 'structuralVerify' ? localize('ade.pure.runner', "Runs domain-emitted expressions, interactions, flat state machines and messaging configurations with scripted response data and independent business criteria. Custom project code, arbitrary tests and live broker execution are excluded.") : localize('ade.pure.localChanges', "Local files affected:\n{0}\n\nThis changes files on your computer. It does not commit or push to Git.", session.mutations.map(edit => edit.file).join('\n'));
			const primaryButton = operation === 'structuralVerify' ? localize('ade.review.verify', "Run Real Verification") : operation === 'structuralUndo' ? localize('ade.review.undo', "Undo Local Changes") : localize('ade.review.publish', "Apply to Project");
			if (!(await this.dialogs.confirm({ message, detail, primaryButton })).confirmed) { return; }
			if (!this.structuralCurrent || !await this.project.save() || operation === 'structuralVerify' && !await this.trust.requestWorkspaceTrust()) { return; }
			try { this.structuralSession = await this.host.request<StructuralSession>({ operation, root: session.root, id: session.id, reviewId: session.reviewId }, token); }
			catch (error) { this.structuralInvalid = true; this.preparationProblem = error instanceof Error ? error.message : String(error); this.host.changed(); throw error; }
			if (operation !== 'structuralVerify') { this.continuity.pause(); await this.project.revert(); }
			await this.reviewPureProject();
		}, { kind: 'local' });
	}

	async structuralResume(): Promise<void> { await this.resumePureProject(false); }

	async structuralRecover(): Promise<void> { await this.resumePureProject(true); }

	private async resumePureProject(recover: boolean): Promise<void> {
		await this.host.run(async token => {
			const saved = this.storage.get('ade.structural.session', StorageScope.WORKSPACE); if (!saved) { return; }
			const request: { root: string; id: string } = JSON.parse(saved);
			if (request.root !== this.project.projectRoot?.fsPath || !await this.project.save()) { return; }
			this.structuralSession = await this.host.request<StructuralSession>({ ...request, operation: recover ? 'structuralRecover' : 'structuralSession' }, token); this.structuralProjectRoot = request.root; this.structuralInvalid = false; this.preparationProblem = undefined; this.host.clearImplementation();
			if (recover) { await this.project.revert(); } await this.reviewPureProject();
		}, { kind: 'local' });
	}

	async simulateStates(): Promise<void> {
		await this.host.run(async token => {
			const root = this.project.projectRoot, model = this.project.model; if (!root || (model.version !== 4 && model.version !== 5)) { return; }
			const version = canonicalJson(semanticContent(model)), file = URI.joinPath(root, '.ade', 'criteria.json'); if (!await this.files.exists(file)) { this.host.info(localize('ade.states.simulation.author', "Author an Independent State Case Before Simulating.")); return; }
			const before = (await this.files.readFile(file)).value.toString(); if (new TextEncoder().encode(before).length > 2097152) { throw new Error(localize('ade.states.simulation.budget', "The Criteria File Exceeds the Local Simulation Budget.")); } const criteria: ProjectCriteria = JSON.parse(before);
			const choice = await this.quick.pick((criteria.states ?? []).map(entry => ({ label: entry.id, entry })), { title: localize('ade.states.simulation.select', "Simulate Authored State Scenario") }); if (!choice) { return; }
			const controller = new AbortController(), listener = token.onCancellationRequested(() => controller.abort()); let result: Awaited<ReturnType<typeof interpretModelStateMachine>>;
			try { if (token.isCancellationRequested) { controller.abort(); } result = await interpretModelStateMachine(model, choice.entry.machineId, choice.entry.scenario, controller.signal); } finally { listener.dispose(); }
			if (canonicalJson(semanticContent(this.project.model)) !== version || this.project.projectRoot?.toString() !== root.toString() || (await this.files.readFile(file)).value.toString() !== before) { throw new Error(localize('ade.states.simulation.stale', "The Specification Changed. Run a New Simulation.")); }
			const report = URI.joinPath(root, '.ade', 'reports', generateUuid(), localize('ade.states.simulation.file', "State Simulation.txt"));
			await this.files.createFolder(URI.joinPath(report, '..'));
			await this.files.writeFile(report, VSBuffer.fromString(describeAdeStateSimulation(model, choice.entry.machineId, result)));
			await this.editors.openEditor({ resource: report, options: { pinned: true } });
		}, { kind: 'local' });
	}

	private invalidateCriteriaReview(): void {
		if (!this.structuralSession || this.project.projectRoot?.fsPath !== (this.structuralProjectRoot ?? this.structuralSession.root)) { return; }
		this.structuralInvalid = true;
		this.preparationProblem = localize('ade.pure.criteria.updated', "Independent business expectations changed. Prepare a new review before running verification or applying.");
		this.host.changed();
	}

	async editPureCriteria(): Promise<void> {
		await this.host.run(async () => {
			const root = this.project.projectRoot; if (!root) { return; } const file = URI.joinPath(root, '.ade', 'criteria.json');
			const exists = await this.files.exists(file); const before = exists ? (await this.files.readFile(file)).value.toString() : undefined; const criteria: ProjectCriteria = before ? JSON.parse(before) : { version: 1, revision: '1', cases: [] };
			const model = this.project.model, version = canonicalJson(semanticContent(this.project.model));
			if ((model.version === 4 || model.version === 5) && (model.foundation.interactions.some(entry => entry.execution) || model.foundation.stateMachines?.length || model.foundation.messaging?.length)) {
				const mode = await this.quick.pick([...(model.foundation.messaging?.length ? [{ label: localize('ade.messaging.newCase', "Author Independent Messaging Case"), interaction: true, messaging: true }, ...(criteria.messaging?.length ? [{ label: localize('ade.messaging.editCase', "Edit Messaging Expectations"), interaction: true, messaging: true, editMessaging: true }] : [])] : []), ...(model.foundation.stateMachines?.length ? [{ label: localize('ade.criteria.newState', "Author Independent State Case"), interaction: true, states: true }] : []), ...(model.foundation.interactions.some(entry => entry.execution) ? [{ label: localize('ade.criteria.newInteraction', "Author Independent Interaction Case"), interaction: true }] : []), ...(model.foundation.predicates?.length || criteria.cases.length ? [{ label: localize('ade.criteria.predicateCases', "Predicate Test Cases"), interaction: false }] : [])], { title: localize('ade.pure.criteria', "Independent Business Expectations") }); if (!mode) { return; }
				if (mode.interaction) {
					const next = hasKey(mode, { messaging: true }) && mode.messaging ? await editAdeMessagingCriteria(this.quick, model, criteria, hasKey(mode, { editMessaging: true }) && mode.editMessaging) : hasKey(mode, { states: true }) && mode.states ? await editAdeStateCriteria(this.quick, model, criteria) : await editAdeInteractionCriteria(this.quick, model, criteria); if (!next) { return; }
					if (canonicalJson(semanticContent(this.project.model)) !== version || this.project.projectRoot?.toString() !== root.toString() || (await this.files.exists(file) ? (await this.files.readFile(file)).value.toString() : undefined) !== before) { throw new Error(localize('ade.pure.criteria.stale', "Criteria changed. Open them again.")); }
					if (exists) { await this.files.writeFile(file, VSBuffer.fromString(JSON.stringify(next, null, '\t') + '\n')); } else { await this.files.createFile(file, VSBuffer.fromString(JSON.stringify(next, null, '\t') + '\n'), { overwrite: false }); } this.invalidateCriteriaReview(); return;
				}
			}
			if (model.version !== 4 && model.version !== 5) { return; }
			const next = await editAdePredicateCriteria(this.quick, model, criteria); if (!next) { return; }
			if (canonicalJson(semanticContent(this.project.model)) !== version || this.project.projectRoot?.toString() !== root.toString() || (await this.files.exists(file) ? (await this.files.readFile(file)).value.toString() : undefined) !== before) { throw new Error(localize('ade.pure.criteria.stale', "Criteria changed. Open them again.")); }
			if (exists) { await this.files.writeFile(file, VSBuffer.fromString(JSON.stringify(next, null, '\t') + '\n')); }
			else { await this.files.createFile(file, VSBuffer.fromString(JSON.stringify(next, null, '\t') + '\n'), { overwrite: false }); }
			this.invalidateCriteriaReview();
		}, { kind: 'local', interactive: true });
	}

	constructor(
		private readonly host: Pick<AdeAiWorkflow, 'clearImplementation' | 'changed' | 'busy' | 'request' | 'run' | 'info'>,
		@IAdeProjectService private readonly project: AdeAiProject,
		@IQuickInputService private readonly quick: IQuickInputService,
		@IDialogService private readonly dialogs: IDialogService,
		@IFileService private readonly files: IFileService,
		@IEditorService private readonly editors: IEditorService,
		@IFilesConfigurationService private readonly filesConfiguration: IFilesConfigurationService,
		@IStorageService private readonly storage: IStorageService,
		@IWorkspaceTrustRequestService private readonly trust: IWorkspaceTrustRequestService,
		@IAdeOperationService private readonly operations: AdeOperationService
	) {
		super();
		const protectSnapshots = () => {
			const snapshots: URI[] = [];
			for (const editor of this.editors.editors) {
				const resources = EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.BOTH });
				for (const resource of URI.isUri(resources) ? [resources] : [resources?.primary, resources?.secondary]) {
					if (resource?.scheme === 'file' && /\/\.ade\/structural\/sessions\/[a-f0-9-]+\/review\//i.test(resource.path)) { snapshots.push(resource); }
				}
			}
			if (snapshots.length) { void this.filesConfiguration.updateReadonly(snapshots, { value: localize('ade.pure.reviewSnapshot', "This file is a review snapshot. Change the model and prepare a new review to update it.") }); }
		};
		this._register(this.editors.onDidVisibleEditorsChange(protectSnapshots));
		protectSnapshots();
	}


	get status(): string | undefined {
		const session = this.structuralSession;
		if (!session) { return undefined; }
		if (!this.structuralCurrent) { return localize('ade.pure.changed', "Model Behavior Changed · Prepare a New Review"); }
		return localize('ade.pure.status', "Model Behavior · {0} · {1} Independent Cases · {2} AI Calls", session.status, session.verification?.independent ?? (session.criteria.cases.length + (session.criteria.interactions?.length ?? 0) + (session.criteria.states?.length ?? 0) + (session.criteria.messaging?.length ?? 0)), session.calls);
	}
	get canVerify(): boolean { return this.structuralCurrent && !!this.structuralSession && ['staged', 'failed', 'passed', 'rolledBack'].includes(this.structuralSession.status); }
	get canApply(): boolean { return this.structuralCurrent && this.structuralSession?.status === 'passed'; }
	get canUndo(): boolean { return this.structuralCurrent && this.structuralSession?.status === 'applied'; }
	clear(): void { this.structuralSession = undefined; this.structuralProjectRoot = undefined; }
	resetProject(): void { this.continuity.pause(); this.preparationProblem = undefined; this.clear(); }

}
