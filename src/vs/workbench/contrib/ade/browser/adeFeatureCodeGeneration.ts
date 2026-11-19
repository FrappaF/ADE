/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { featureCodeProfiles, parseFeatureCodeCases, type FeatureCodeGenerationRun } from '../common/featureCodeGeneration.js';
import { type IAdeAiService } from './adeAiService.js';
import { type AdeControls } from './adeControls.js';
import { AdeEditingWizard } from './adeEditingWizard.js';
import { renderAdeErrorNotice } from './adeErrorNotice.js';
import { describeAdeError } from './adeErrors.js';
import { AdeFormDialog } from './adeFormDialog.js';
import { type AdeProjectService } from './adeProjectService.js';

export function hasFeatureCodeReview(run: FeatureCodeGenerationRun | undefined): boolean {
	return !!run?.reviewId && ['ready', 'verified', 'failed', 'applied', 'undone', 'interrupted'].includes(run.status);
}

function featureCodeStatus(run: FeatureCodeGenerationRun, busy: boolean): string {
	switch (run.status) {
		case 'prepared': return localize('ade.featureCode.prepared', "Feature Plan Ready");
		case 'generating': {
			if (!busy) { return localize('ade.featureCode.interrupted', "Generation Paused · Checkpoint Saved"); }
			const feature = run.tasks.find(task => task.status !== 'ready');
			return feature ? localize('ade.featureCode.generatingFeature', "Preparing Code · {0}", feature.name) : localize('ade.featureCode.generating', "Preparing Code");
		}
		case 'waitingUser': return localize('ade.featureCode.waiting', "A Feature Needs Your Input");
		case 'ready': return localize('ade.featureCode.ready', "Changes Ready for Review · Verification Required");
		case 'verified': return run.files.length ? localize('ade.featureCode.verified', "Verification Passed · Ready to Apply") : localize('ade.featureCode.verifiedUnchanged', "Verification Passed · No File Changes");
		case 'failed': return run.verification ? localize('ade.featureCode.verificationFailed', "Verification Failed · Application Blocked") : localize('ade.featureCode.failed', "Code Generation Needs Attention");
		case 'applied': return localize('ade.featureCode.applied', "Changes Applied Locally");
		case 'undone': return localize('ade.featureCode.undone', "Local Changes Undone");
		case 'interrupted': return localize('ade.featureCode.interrupted', "Generation Paused · Checkpoint Saved");
	}
}

function taskStatus(status: FeatureCodeGenerationRun['tasks'][number]['status']): string {
	switch (status) {
		case 'pending': return localize('ade.featureCode.taskPending', "Pending");
		case 'running': return localize('ade.featureCode.taskRunning', "Preparing");
		case 'ready': return localize('ade.featureCode.taskReady', "Prepared");
		case 'waitingUser': return localize('ade.featureCode.taskWaiting', "Needs Input");
		case 'failed': return localize('ade.featureCode.taskFailed', "Needs Attention");
	}
}

function profileLabel(profile: { language: string; runtime: string; framework: string | null }): string {
	return localize('ade.featureCode.stackValue', "{0} · {1} · {2}", profile.language, profile.runtime, profile.framework ?? localize('ade.featureCode.noFramework', "No Framework"));
}

/** User-facing setup and review for the staged AI code workflow. */
export class AdeFeatureCodeGeneration extends Disposable {
	private readonly dialog = this._register(new MutableDisposable<AdeEditingWizard | AdeFormDialog>());
	private configuring = false;

	constructor(private readonly project: AdeProjectService, private readonly ai: IAdeAiService, private readonly container: () => HTMLElement) { super(); }

	async configure(): Promise<void> {
		const modelUri = this.project.modelUri?.toString();
		if (this.configuring || this.dialog.value || !modelUri) { return; }
		this.configuring = true;
		try {
			const setup = await this.ai.inspectCodeGeneration();
			if (!setup || this._store.isDisposed || this.project.modelUri?.toString() !== modelUri) { return; }
			const version = this.project.documentVersion;
			if (setup.supportProblem) { throw new Error(setup.supportProblem); }
			if (!setup.profiles.length) { throw new Error(localize('ade.featureCode.noProfile', "No supported code generation stack was found for this project.")); }
			const title = setup.mode === 'create' ? localize('ade.featureCode.generate', "Generate Code from Diagrams") : localize('ade.codeUpdate.button', "Update Codebase from Diagrams");
			const context = localize('ade.featureCode.destination', "{0} · Destination: {1}", this.project.model.name, this.project.projectRoot?.fsPath ?? modelUri);
			const features = this.project.model.semantics.elements.filter(element => element.kind === 'feature' && (!setup.featureIds || setup.featureIds.includes(element.id)));
			if (!features.length) { throw new Error(localize('ade.featureCode.noFeatures', "Add a feature with a diagram before preparing code.")); }
			const profiles = setup.profiles.map(profile => ({ id: profile.id, label: profileLabel(profile) }));
			const choices = features.map(feature => ({ id: feature.id, label: feature.name, description: feature.description, picked: true }));
			const wizard = this.dialog.value = new AdeEditingWizard(this.container(), title);
			const request = await wizard.run(title, context, async () => {
				const profile = await wizard.pick(profiles, {
					title: setup.mode === 'create' ? localize('ade.featureCode.chooseStack', "Choose Stack") : localize('ade.featureCode.confirmStack', "Confirm Project Stack"),
					prompt: localize('ade.featureCode.chooseStackHint', "The stack sets the language, runtime and framework for this generation."),
					activeItem: profiles.find(profile => profile.id === setup.defaultProfileId) ?? profiles[0]
				});
				if (!profile) { return; }
				const selected = await wizard.pick(choices, {
					title: localize('ade.featureCode.chooseFeatures', "Select Features"),
					prompt: localize('ade.featureCode.chooseFeaturesHint', "Choose at least one feature. ADE prepares each in order and reuses the shared code already staged."),
					canPickMany: true,
					requireSelection: true
				});
				if (!selected?.length) { return; }
				const intent = await wizard.input({ title: localize('ade.featureCode.intent', "Implementation Notes"), prompt: localize('ade.featureCode.intentHint', "Optional. Describe constraints or preferences for this generation."), validateInput: async value => value.length > 4000 ? localize('ade.featureCode.intentLength', "Enter up to 4,000 characters.") : undefined });
				if (intent === undefined) { return; }
				const featureIds = selected.map(feature => feature.id);
				const casesText = await wizard.input({
					title: localize('ade.featureCode.testCases', "Independent Verification Cases"),
					prompt: localize('ade.featureCode.testCasesHint', "Enter known inputs and expected results as version 1 JSON, or leave this blank to use .ade/feature-code-cases.json. Selected feature IDs: {0}.", featureIds.join(', ')),
					placeHolder: JSON.stringify({ version: 1, cases: [{ id: 'example', featureId: featureIds[0], input: {}, expected: {} }] }, null, 2),
					multiline: true,
					summarize: value => value.trim() ? localize('ade.featureCode.enteredCases', "Use Entered Cases") : localize('ade.featureCode.projectCases', "Use Project Cases"),
					validateInput: async value => {
						if (!value.trim()) { return; }
						try {
							const cases = parseFeatureCodeCases(value);
							if (featureIds.some(id => !cases.some(test => test.featureId === id))) { return localize('ade.featureCode.caseCoverage', "Include a case for each selected feature, or leave this field blank to use the project file."); }
						} catch { return localize('ade.featureCode.invalidCases', "Enter a version 1 JSON object with a cases array. Each case needs a unique id, a featureId, an input and an expected result."); }
						return undefined;
					}
				});
				if (casesText === undefined) { return; }
				return { profileId: profile.id, featureIds, intent: intent.trim() || undefined, ...(casesText.trim() ? { cases: parseFeatureCodeCases(casesText) } : {}) };
			}, {
				heading: localize('ade.featureCode.reviewSetup', "Review Code Generation"),
				help: localize('ade.featureCode.reviewSetupHint', "ADE prepares these features in a staging area. You review the files, run verification and apply the changes from Code."),
				confirm: localize('ade.featureCode.prepare', "Prepare Code Changes")
			});
			if (!request) { return; }
			if (this.project.modelUri?.toString() !== modelUri || this.project.documentVersion !== version) { throw new Error(localize('ade.featureCode.modelChanged', "The model changed during setup. Open code generation again for the current model.")); }
			await this.ai.prepareCodeGeneration(request);
		} finally { this.dialog.clear(); this.configuring = false; }
	}

	async clarify(): Promise<void> {
		const run = this.ai.codeGeneration;
		if (this.dialog.value || !run?.questions?.length) { return; }
		const dialog = this.dialog.value = new AdeFormDialog(this.container(), { title: localize('ade.featureCode.clarify', "Answer Clarifications"), description: localize('ade.featureCode.clarifyHint', "Answer these questions to resume the current feature."), confirmLabel: localize('ade.featureCode.resume', "Resume Generation") });
		try {
			const questions = dom.append(dialog.body, dom.$('ul'));
			for (const question of run.questions) { dom.append(questions, dom.$('li')).textContent = question; }
			const input = dialog.text(dialog.body, localize('ade.featureCode.answer', "Answer"), undefined, { multiline: true, required: true });
			const answer = await dialog.open(() => input.value.trim());
			if (answer && this.ai.codeGeneration?.id === run.id) { await this.ai.resumeCodeGeneration(answer); }
		} finally { this.dialog.clear(); }
	}

	renderProgress(parent: HTMLElement, run: FeatureCodeGenerationRun | undefined, controls: AdeControls, busy: boolean): void {
		if (this.ai.codeGenerationProblem) { renderAdeErrorNotice(parent, describeAdeError(this.ai.codeGenerationProblem, 'ai', this.project.model), controls); }
		if (!run) { return; }
		dom.append(parent, dom.$('p.ade-code-status', { role: 'status' })).textContent = featureCodeStatus(run, busy);
		if (busy && run.status === 'generating') { controls.button(parent, localize('ade.featureCode.stop', "Stop Generation"), () => this.ai.cancelCodeGeneration(), 'feature-code-stop'); }
		if (!run.tasks.length) { return; }
		const details = controls.details(parent, localize('ade.featureCode.progressDetails', "Feature Progress"), 'feature-code-progress');
		const list = dom.append(details, dom.$('ol'));
		for (const task of run.tasks) {
			const item = dom.append(list, dom.$('li'));
			item.textContent = localize('ade.featureCode.taskRow', "{0} · {1}", task.name, taskStatus(task.status));
			for (const gap of task.gaps) { dom.append(item, dom.$('p')).textContent = gap; }
		}
	}

	renderReview(parent: HTMLElement, run: FeatureCodeGenerationRun, controls: AdeControls, busy: boolean, close: () => void): HTMLElement {
		const title = localize('ade.featureCode.reviewTitle', "AI Code Review");
		const section = dom.append(parent, dom.$('section.ade-structural-review', { 'aria-label': title }));
		dom.append(section, dom.$('h2')).textContent = title;
		dom.append(section, dom.$('p', { role: 'status' })).textContent = featureCodeStatus(run, busy);
		const toolbar = dom.append(section, dom.$('div.ade-review-actions', { 'aria-label': localize('ade.review.actions', "Review Actions") }));
		if (run.status === 'ready' || run.status === 'failed') {
			const verify = controls.button(toolbar, localize('ade.featureCode.verify', "Run Verification"), () => this.ai.verifyCodeGeneration(), 'feature-code-verify');
			verify.classList.add('ade-primary-action'); verify.disabled = busy;
		}
		if (run.status === 'failed' && run.verification?.cases?.some(test => !test.passed)) {
			controls.button(toolbar, localize('ade.featureCode.repair', "Repair Failing Features"), () => this.ai.resumeCodeGeneration(), 'feature-code-repair').disabled = busy;
		}
		if (run.status === 'applied') {
			controls.button(toolbar, localize('ade.review.undo', "Undo Local Changes"), () => this.ai.undoCodeGeneration(), 'feature-code-undo').disabled = busy;
		} else if (run.status === 'interrupted') {
			controls.button(toolbar, localize('ade.featureCode.recover', "Recover Code Generation"), () => this.ai.recoverCodeGeneration(), 'feature-code-recover').disabled = busy;
		} else if (run.status !== 'undone' && (run.status !== 'verified' || run.files.length > 0)) {
			const apply = controls.button(toolbar, localize('ade.review.publish', "Apply to Project"), () => this.ai.applyCodeGeneration(), 'feature-code-apply');
			const verified = run.status === 'verified' && run.verification?.passed === true;
			apply.disabled = busy || !verified;
			apply.classList.toggle('ade-primary-action', verified);
		}
		controls.button(toolbar, localize('ade.featureCode.back', "Back to Code"), close, 'feature-code-back');
		const body = dom.append(section, dom.$('div.ade-review-body'));
		if (this.ai.codeGenerationProblem) { renderAdeErrorNotice(body, describeAdeError(this.ai.codeGenerationProblem, 'ai', this.project.model), controls); }
		const profile = featureCodeProfiles.find(profile => profile.id === run.profileId);
		if (profile) { dom.append(body, dom.$('p')).textContent = profileLabel(profile); }
		dom.append(body, dom.$('p.ade-supporting-text')).textContent = localize('ade.featureCode.reviewDestination', "Local destination: {0}", run.root);
		const model = this.project.model;
		const operationCriteria = model.version === 4 || model.version === 5 ? model.foundation.blueprint?.operations.flatMap(operation => operation.acceptanceCriteria) ?? [] : [];
		const criteria = new Map([...model.semantics.elements.flatMap(element => element.behavior?.acceptanceCriteria ?? []), ...operationCriteria].map(criterion => [criterion.id, criterion.then]));
		const cases = run.verification?.cases ?? [];
		for (const task of run.tasks) {
			const group = dom.append(body, dom.$('section.ade-review-changes'));
			dom.append(group, dom.$('h3')).textContent = task.name;
			const views = (task.diagramIds ?? []).map(id => model.views.find(view => view.id === id)?.name ?? id);
			if (views.length) { dom.append(group, dom.$('p')).textContent = localize('ade.featureCode.reviewDiagrams', "Diagrams · {0}", views.join(', ')); }
			if (task.criterionIds?.length) { dom.append(group, dom.$('p')).textContent = localize('ade.featureCode.reviewCriteria', "Acceptance Criteria · {0}", task.criterionIds.map(id => criteria.get(id) ?? id).join(', ')); }
			for (const gap of task.gaps) { dom.append(group, dom.$('p')).textContent = gap; }
			this.renderFiles(group, run.files.filter(file => file.featureId === task.id), controls, busy);
			for (const test of cases) {
				if (test.featureId !== task.id) { continue; }
				const result = test.passed ? localize('ade.featureCode.casePassed', "Passed") : test.message ? localize('ade.featureCode.caseFailureReason', "Failed · {0}", test.message) : localize('ade.featureCode.caseFailed', "Failed");
				dom.append(group, dom.$('p')).textContent = localize('ade.featureCode.reviewCase', "{0} · {1}", test.id, result);
			}
		}
		const shared = run.files.filter(file => !file.featureId);
		if (shared.length) {
			const group = dom.append(body, dom.$('section.ade-review-changes'));
			dom.append(group, dom.$('h3')).textContent = localize('ade.featureCode.sharedFiles', "Shared Project Files");
			this.renderFiles(group, shared, controls, busy);
		}
		if (run.verification?.output) {
			const details = controls.details(body, localize('ade.review.results', "Verification Output"), 'feature-code-verification-output');
			const output = dom.append(details, dom.$('pre', { tabindex: '0' }));
			output.textContent = run.verification.output;
		}
		return section;
	}

	private renderFiles(parent: HTMLElement, files: FeatureCodeGenerationRun['files'], controls: AdeControls, busy: boolean): void {
		if (!files.length) { return; }
		const list = dom.append(parent, dom.$('ul'));
		for (const file of files) {
			const item = dom.append(list, dom.$('li'));
			const action = file.kind === 'create' ? localize('ade.review.create', "Create") : file.kind === 'delete' ? localize('ade.review.delete', "Delete") : localize('ade.review.modify', "Modify");
			dom.append(item, dom.$('p')).textContent = localize('ade.featureCode.fileRow', "{0} · {1}", action, file.file);
			const button = controls.button(item, localize('ade.featureCode.diff', "Open Diff"), () => this.ai.openCodeGenerationDiff(file.file), `feature-code-diff:${file.file}`);
			button.setAttribute('aria-label', localize('ade.featureCode.diffForFile', "Open Diff for {0}", file.file)); button.disabled = busy;
		}
	}
}
