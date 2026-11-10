/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { localize } from '../../../../nls.js';
import type { StructuralProjectSession } from '../common/modelProject.js';
import type { SemanticModel } from '../common/semanticModel.js';
import type { AdeControls } from './adeControls.js';

export interface StructuralReviewActions {
	busy: boolean; canVerify: boolean; canApply: boolean; canUndo: boolean;
	verify(): void; apply(): void; undo(): void; technical(): void; returnToDiagram(): void;
}

/** Normal review uses semantic names and real outcomes; packets/hashes stay in the technical disclosure. */
export function renderStructuralReview(parent: HTMLElement, model: SemanticModel, session: StructuralProjectSession, controls: AdeControls, actions: StructuralReviewActions): void {
	const section = dom.append(parent, dom.$('section.ade-structural-review'));
	section.setAttribute('aria-label', localize('ade.review.title', "Model and Code Review"));
	dom.append(section, dom.$('h2')).textContent = localize('ade.review.title', "Model and Code Review");
	const status = dom.append(section, dom.$('p')); status.setAttribute('role', 'status');
	status.textContent = session.status === 'failed' ? localize('ade.review.failed', "Real Verification Failed · Publication Blocked") : actions.canApply ? localize('ade.review.passed', "Real Verification Passed · Ready for Reviewed Publication") : actions.canUndo ? localize('ade.review.applied', "Published · Exact Undo Available") : actions.canVerify ? localize('ade.review.staged', "Proposal Prepared · Real Verification Required") : localize('ade.review.stale', "Review Changed or Inactive · Prepare a New Review Before Publication");
	dom.append(section, dom.$('p')).textContent = localize('ade.review.scope', "{0} · {1} File Changes · Zero AI Calls · Price Unknown", session.direction === 'forward' ? localize('ade.review.forward', "Model to Code") : localize('ade.review.reverse', "Code to Model"), session.mutations.length);
	const plan = controls.details(section, localize('ade.review.plan', "Planned Changes"), 'structural-review-plan');
	for (const change of session.mutations) {
		const action = change.before === null ? localize('ade.review.create', "Create") : change.after === null ? localize('ade.review.delete', "Delete") : localize('ade.review.modify', "Modify");
		dom.append(plan, dom.$('p')).textContent = `${action} · ${change.file}`;
	}
	if (session.stackPlan) {
		const migration = controls.details(section, localize('ade.review.stackPlan', "Runtime Change · {0} → {1}", session.stackPlan.from, session.stackPlan.to), 'structural-stack-plan');
		for (const [label, value] of [
			[localize('ade.stack.implementation', "Implementation"), session.stackPlan.implementation],
			[localize('ade.stack.dependencies', "Dependencies"), session.stackPlan.dependencies],
			[localize('ade.stack.storage', "Storage and Existing Data"), session.stackPlan.storage],
			[localize('ade.stack.tests', "Business Verification"), session.stackPlan.tests],
			[localize('ade.stack.deployment', "Deployment"), session.stackPlan.deployment],
			[localize('ade.stack.recovery', "Recovery"), session.stackPlan.recovery]
		]) { dom.append(migration, dom.$('p')).textContent = `${label}: ${value}`; }
	}
	if ((model.version === 4 || model.version === 5)) {
		for (const task of model.foundation.tasks ?? []) {
			const detail = controls.details(section, task.text, `review-task:${task.id}`);
			for (const item of task.clarifications) { dom.append(detail, dom.$('p')).textContent = localize('ade.task.questionAnswer', "Question: {0}\nAnswer: {1}", item.question, item.answer); }
		}
	}
	const scope = controls.details(section, localize('ade.review.coverage', "Coverage and Partial Mappings"), 'structural-review-coverage');
	dom.append(scope, dom.$('p')).textContent = localize('ade.review.limits', "Verifies Emitted Predicates, Interaction Plans, Flat States and Messaging Configuration with Independent Data. Custom Code and Live Broker Execution Are Outside This Runner. Reverse Preserves Contracts and Architecture Decisions; Unsupported Changes Require Resolution.");
	if (session.verification) {
		dom.append(section, dom.$('p')).textContent = localize('ade.review.counts', "{0} Derived Cases · {1} Independent Cases", session.verification.generated, session.verification.independent);
		const results = controls.details(section, localize('ade.review.results', "Verification Output"), 'structural-review-results');
		const pre = dom.append(results, dom.$('pre')); pre.tabIndex = 0; pre.textContent = session.verification.output;
	}
	const toolbar = dom.append(section, dom.$('div.ade-review-actions'));
	for (const [label, callback, enabled, id] of [
		[localize('ade.review.verify', "Run Real Verification"), actions.verify, actions.canVerify, 'review-verify'],
		[localize('ade.review.publish', "Publish Verified Model and Code"), actions.apply, actions.canApply, 'review-publish'],
		[localize('ade.review.undo', "Undo Publication"), actions.undo, actions.canUndo, 'review-undo'],
		[localize('ade.review.technical', "Technical Preview and Differences"), actions.technical, true, 'review-technical'],
		[localize('ade.review.return', "Return to Diagram Selection"), actions.returnToDiagram, true, 'review-return']
	] as const) {
		const button = controls.button(toolbar, label, callback, id); button.disabled = actions.busy || !enabled;
		if (id === 'review-publish' && actions.canApply || id === 'review-verify' && !actions.canApply && actions.canVerify) { button.classList.add('ade-primary-action'); }
	}
}
