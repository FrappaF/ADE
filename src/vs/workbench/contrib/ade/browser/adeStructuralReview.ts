/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { localize } from '../../../../nls.js';
import type { StructuralProjectSession } from '../common/modelProject.js';
import type { SemanticModel } from '../common/semanticModel.js';
import { describeModelPredicate, validateModelPredicate } from '../common/modelExpressions.js';
import type { AdeControls } from './adeControls.js';

export interface StructuralReviewActions {
	busy: boolean; canVerify: boolean; canApply: boolean; canUndo: boolean;
	problem?: string;
	prepare(): void;
	verify(): void; apply(): void; undo(): void; technical(): void; returnToDiagram(): void;
}

/** Normal review uses semantic names and real outcomes; packets/hashes stay in the technical disclosure. */
export function renderStructuralReview(parent: HTMLElement, model: SemanticModel, session: StructuralProjectSession, controls: AdeControls, actions: StructuralReviewActions): HTMLElement {
	const section = dom.append(parent, dom.$('section.ade-structural-review'));
	section.setAttribute('aria-label', localize('ade.review.title', "Model and Code Review"));
	dom.append(section, dom.$('h2')).textContent = localize('ade.review.title', "Model and Code Review");
	const status = dom.append(section, dom.$('p')); status.setAttribute('role', 'status');
	status.textContent = session.status === 'undone' ? localize('ade.review.undone', "Local Changes Undone · Prepare a New Review to Continue") : session.status === 'failed' ? localize('ade.review.failed', "Real Verification Failed · Application Blocked") : actions.canApply ? localize('ade.review.passed', "Real Verification Passed · Ready to Apply Locally") : actions.canUndo ? localize('ade.review.applied', "Applied Locally · Exact Undo Available") : actions.canVerify ? localize('ade.review.staged', "Proposal Prepared · Real Verification Required") : localize('ade.review.stale', "Review Changed or Inactive · Prepare a New Review Before Applying");
	const toolbar = dom.append(section, dom.$('div.ade-review-actions'));
	toolbar.setAttribute('aria-label', localize('ade.review.actions', "Review Actions"));
	for (const [label, callback, enabled, id] of [
		[localize('ade.review.verify', "Run Real Verification"), actions.verify, actions.canVerify, 'review-verify'],
		[localize('ade.review.publish', "Apply to Project"), actions.apply, actions.canApply, 'review-publish'],
		[localize('ade.review.undo', "Undo Local Changes"), actions.undo, actions.canUndo, 'review-undo'],
		[localize('ade.review.return', "Return to Diagram"), actions.returnToDiagram, true, 'review-return']
	] as const) {
		const button = controls.button(toolbar, label, callback, id); button.disabled = actions.busy || !enabled;
		if (id === 'review-publish' && actions.canApply || id === 'review-verify' && !actions.canApply && actions.canVerify) { button.classList.add('ade-primary-action'); }
	}
	if (!actions.canVerify && !actions.canApply && !actions.canUndo) {
		const prepare = controls.button(toolbar, localize('ade.review.prepareNew', "Prepare New Review"), actions.prepare, 'review-prepare');
		prepare.disabled = actions.busy;
		prepare.classList.add('ade-primary-action');
	}
	const body = dom.append(section, dom.$('div.ade-review-body'));
	dom.append(body, dom.$('p.ade-supporting-text')).textContent = localize('ade.review.local', "Changes apply to this project on your computer. Commit and push are separate Git actions.");
	if (actions.problem) {
		const problem = dom.append(body, dom.$('p')); problem.setAttribute('role', 'alert');
		problem.textContent = localize('ade.review.recovery', "The operation could not finish. Your review is preserved. Check the cause in Technical Details, resolve it, then prepare a new review.");
	}
	dom.append(body, dom.$('p')).textContent = localize('ade.review.scope', "{0} · {1} File Changes · Zero AI Calls", session.direction === 'forward' ? localize('ade.review.forward', "Model to Code") : localize('ade.review.reverse', "Code to Model"), session.mutations.length);
	const proposedModel = session.next?.model;
	if (proposedModel && (proposedModel.version === 4 || proposedModel.version === 5)) {
		const behavior = dom.append(body, dom.$('section.ade-review-behavior'));
		dom.append(behavior, dom.$('h3')).textContent = localize('ade.review.behavior', "Reviewed Behavior · {0}", proposedModel.name);
		for (const predicate of proposedModel.foundation.predicates ?? []) {
			const operation = proposedModel.foundation.blueprint?.operations.find(operation => operation.id === predicate.operationId);
			const owner = proposedModel.semantics.elements.find(element => element.id === operation?.ownerId);
			const rule = validateModelPredicate(proposedModel, predicate).length ? localize('ade.review.incompleteRule', "Incomplete Rule") : describeModelPredicate(proposedModel, predicate);
			dom.append(behavior, dom.$('p')).textContent = localize('ade.review.rule', "{0} · {1}: {2}", owner?.name ?? proposedModel.name, operation?.name ?? localize('ade.review.ruleLabel', "Rule"), rule);
		}
		for (const interaction of proposedModel.foundation.interactions.filter(interaction => interaction.execution)) {
			dom.append(behavior, dom.$('p')).textContent = localize('ade.review.interaction', "Executable Interaction · {0}", proposedModel.semantics.elements.find(element => element.id === interaction.ownerId)?.name ?? proposedModel.name);
		}
		for (const machine of proposedModel.foundation.stateMachines ?? []) {
			dom.append(behavior, dom.$('p')).textContent = localize('ade.review.machine', "State Machine · {0}", proposedModel.semantics.elements.find(element => element.id === machine.ownerId)?.name ?? proposedModel.name);
		}
		for (const topology of proposedModel.foundation.messaging ?? []) { dom.append(behavior, dom.$('p')).textContent = localize('ade.review.messaging', "Messaging Topology · {0}", topology.channels.map(channel => channel.name).join(', ') || proposedModel.name); }
	}
	const plan = dom.append(body, dom.$('section.ade-review-changes'));
	dom.append(plan, dom.$('h3')).textContent = localize('ade.review.plan', "Planned Changes");
	for (const change of session.mutations) {
		const action = change.before === null ? localize('ade.review.create', "Create") : change.after === null ? localize('ade.review.delete', "Delete") : localize('ade.review.modify', "Modify");
		dom.append(plan, dom.$('p')).textContent = `${action} · ${change.file}`;
	}
	if (session.stackPlan) {
		const migration = controls.details(body, localize('ade.review.stackPlan', "Runtime Change · {0} → {1}", session.stackPlan.from, session.stackPlan.to), 'structural-stack-plan');
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
			const detail = controls.details(body, task.text, `review-task:${task.id}`);
			for (const item of task.clarifications) { dom.append(detail, dom.$('p')).textContent = localize('ade.task.questionAnswer', "Question: {0}\nAnswer: {1}", item.question, item.answer); }
		}
	}
	const scope = dom.append(body, dom.$('section.ade-review-coverage'));
	dom.append(scope, dom.$('h3')).textContent = localize('ade.review.coverage', "Coverage and Limits");
	dom.append(scope, dom.$('p')).textContent = localize('ade.review.limits', "Verifies Emitted Predicates, Interaction Plans, Flat States and Messaging Configuration with Independent Data. Custom Code and Live Broker Execution Are Outside This Runner. Reverse Preserves Contracts and Architecture Decisions; Unsupported Changes Require Resolution.");
	if (session.verification) {
		dom.append(body, dom.$('p')).textContent = localize('ade.review.counts', "{0} Derived Cases · {1} Independent Cases", session.verification.generated, session.verification.independent);
		const results = controls.details(body, localize('ade.review.results', "Verification Output"), 'structural-review-results');
		const pre = dom.append(results, dom.$('pre')); pre.tabIndex = 0; pre.textContent = session.verification.output;
	}
	const technical = controls.details(body, localize('ade.review.technicalDetails', "Technical Details"), 'structural-review-technical');
	if (actions.problem) { dom.append(technical, dom.$('p')).textContent = actions.problem; }
	dom.append(technical, dom.$('p')).textContent = localize('ade.review.price', "Provider Price Unknown · No Provider Calls in This Review");
	controls.button(technical, localize('ade.review.technical', "Open File Differences and Technical Context"), actions.technical, 'review-technical').disabled = actions.busy;
	return section;
}
