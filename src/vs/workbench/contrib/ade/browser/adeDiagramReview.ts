/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { FileAccess } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { type AdeDiagramReview } from './adeAiService.js';
import { type AdeControls } from './adeControls.js';

interface DiagramReviewActions {
	busy: boolean; current: boolean;
	apply(): void; continue?(): void; refresh(): void; close(): void; technical(): void;
}

/** Explain the publication checks in the same place as the disabled decision. */
function blockedReasons(review: AdeDiagramReview, actions: DiagramReviewActions): string[] {
	const reasons: string[] = [];
	if (actions.busy) { reasons.push(localize('ade.review.busy', "An Operation Is Running. Wait for It to Finish Before Applying.")); }
	if (!actions.current) { reasons.push(localize('ade.draft.changed', "The Model Changed After This Review. Refresh the Review Before Applying.")); }
	const explain = (value: string): string => {
		const [code, ...parts] = value.split(':');
		const id = parts.join(':');
		const name = review.plan?.items.find(item => item.id === id)?.name ?? review.proposal.views.find(view => view.id === id)?.name ?? id;
		switch (code) {
			case 'plannedDiagramIncomplete': return localize('ade.review.pendingDiagram', "{0} Is Not Ready. Continue Generation to Complete or Explicitly Exclude It.", name);
			case 'diagramPlanRequired': return localize('ade.review.planMissing', "The Diagram Plan Has Not Been Prepared. Continue Generation to Create It.");
			case 'noDiagramDrafts': return localize('ade.review.noDrafts', "There Are No Prepared Diagrams to Apply. Continue Generation First.");
			case 'invalidDraft': return localize('ade.review.invalidDraft', "A Diagram Draft Needs Correction. Continue Generation to Resolve Its Validation Errors.");
			case 'unplannedDraft': return localize('ade.review.unplanned', "A Draft Is Not Linked to the Diagram Plan. Continue Generation to Reconcile the Plan.");
			case 'duplicatePlannedProposal': return localize('ade.review.duplicate', "Multiple Planned Diagrams Refer to the Same Draft. Continue Generation to Correct Their Assignments.");
			case 'staleEvidence': case 'staleQuery': case 'staleEvidenceRevision': case 'staleSource': case 'staleSourceRevision': return localize('ade.review.staleSources', "Source Files Changed After Analysis. Continue Generation to Refresh Their Evidence, Then Refresh This Review.");
			case 'projectReviewChanged': case 'staleRead': case 'staleModel': case 'staleSemanticRevision': case 'staleProjectReview': return localize('ade.review.staleModel', "The Project or Its Drafts Changed. Refresh This Review Before Applying.");
			case 'diagramGeometryInvalid': return localize('ade.review.geometry', "{0} Has Overlapping or Invalid Diagram Geometry. Continue Generation to Repair Its Layout.", name);
			case 'semanticIndexRefreshRequired': return localize('ade.review.indexChanged', "The Source Index Needs Updating. Update the Code Evidence, Then Continue Generation.");
			case 'missingEvidence': case 'evidenceOutsideScope': return localize('ade.review.evidenceMissing', "A Draft Has Missing or Out-of-Scope Source Evidence. Continue Generation to Refresh Its Sources.");
			default: return value;
		}
	};
	if (review.problem) { reasons.push(...review.problem.split(' · ').map(explain)); }
	if (review.proposal.status !== 'ready') {
		for (const diagnostic of review.proposal.diagnostics) {
			if (diagnostic.code === 'contract' && diagnostic.args[0]) { reasons.push(explain(diagnostic.args[0])); }
			else if (diagnostic.code === 'missingReference') { reasons.push(localize('ade.review.missingReference', "A Diagram References an Object That Does Not Exist ({0}). Continue Generation to Correct It.", diagnostic.args[0])); }
			else { reasons.push(localize('ade.review.validationReason', "A Draft Failed Validation: {0} at {1}. Continue Generation to Correct It.", diagnostic.code, diagnostic.path)); }
		}
		if (!review.proposal.diagnostics.length && !review.problem) { reasons.push(localize('ade.review.invalid', "The Draft Has Not Passed Validation. Continue Generation to Correct It, Then Refresh the Review.")); }
	}
	return [...new Set(reasons)];
}

/** Diagrams lead; model edits, evidence and diagnostics are a secondary disclosure below them. */
export function renderAdeDiagramReview(parent: HTMLElement, review: AdeDiagramReview, controls: AdeControls, actions: DiagramReviewActions): HTMLElement {
	const section = dom.append(parent, dom.$('section.ade-structural-review.ade-diagram-review'));
	section.setAttribute('aria-label', localize('ade.explore.review', "Review Diagram Draft"));
	dom.append(section, dom.$('h2')).textContent = review.projectReviewId ? localize('ade.explore.projectReview', "Project Diagram Review") : review.proposal.views.map(view => view.name).join(', ') || localize('ade.explore.review', "Review Diagram Draft");
	const reasons = blockedReasons(review, actions);
	const ready = review.proposal.status === 'ready' && actions.current && !review.problem;
	const toolbar = dom.append(section, dom.$('div.ade-review-actions'));
	const apply = controls.button(toolbar, review.projectReviewId ? localize('ade.review.publishAll', "Apply All Changes") : localize('ade.review.publish', "Apply to Project"), actions.apply, 'diagram-review-apply');
	apply.disabled = actions.busy || !ready;
	if (ready) { apply.classList.add('ade-primary-action'); }
	controls.button(toolbar, localize('ade.draft.refresh', "Refresh Review"), actions.refresh, 'diagram-review-refresh').disabled = actions.busy;
	controls.button(toolbar, localize('ade.draft.close', "Return to Exploration"), actions.close, 'diagram-review-close').disabled = actions.busy;
	if (reasons.length) {
		const blocked = dom.append(section, dom.$('aside.ade-review-blockers'));
		blocked.id = 'ade-review-blockers'; blocked.setAttribute('role', 'alert'); apply.setAttribute('aria-describedby', blocked.id);
		dom.append(blocked, dom.$('strong')).textContent = localize('ade.review.whyBlocked', "Why Applying Is Unavailable");
		const list = dom.append(blocked, dom.$('ul'));
		for (const reason of reasons) { dom.append(list, dom.$('li')).textContent = reason; }
		if (!ready && actions.continue) { controls.button(blocked, localize('ade.explore.continueProject', "Continue Generation"), actions.continue, 'diagram-review-continue').disabled = actions.busy; }
	}
	const body = dom.append(section, dom.$('div.ade-review-body'));
	for (const view of review.proposal.views) {
		const figure = dom.append(body, dom.$('figure.ade-review-preview'));
		dom.append(figure, dom.$('figcaption')).textContent = view.name;
		if (view.spec?.intent) { dom.append(figure, dom.$('p.ade-supporting-text')).textContent = view.spec.intent; }
		const image = review.images.find(image => image.viewId === view.id);
		if (image) {
			const preview = dom.append(figure, dom.$<HTMLImageElement>('img'));
			preview.src = FileAccess.uriToBrowserUri(URI.file(image.path)).toString(true);
			preview.alt = localize('ade.draft.preview', "Diagram Preview: {0}", view.name);
		} else { dom.append(figure, dom.$('p')).textContent = localize('ade.review.previewMissing', "Preview Is Unavailable. Refresh the Review or Continue Generation to Correct the Draft."); }
	}
	const details = controls.details(body, localize('ade.review.supportingDetails', "Change Details, Sources and Diagnostics ({0})", review.changes.length), 'diagram-review-details');
	dom.append(details, dom.$('p.ade-supporting-text')).textContent = review.projectReviewId ? localize('ade.draft.projectLocal', "Applies all reviewed diagrams and their shared model changes together in one local operation. The source code is preserved. This does not commit or push to Git.") : localize('ade.draft.local', "Applies this diagram proposal and its dependencies locally. Other drafts remain available. This does not commit or push to Git.");
	if (review.plan) {
		dom.append(details, dom.$('h3')).textContent = localize('ade.review.diagramPlan', "Diagram Plan and Exclusions");
		const list = dom.append(details, dom.$('ul'));
		for (const item of review.plan.items) {
			const row = dom.append(list, dom.$('li')); row.textContent = item.name + ' · ' + item.rationale;
			for (const gap of review.tasks?.find(task => task.id === item.id)?.gaps ?? []) { dom.append(row, dom.$('p')).textContent = gap; }
		}
	}
	dom.append(details, dom.$('h3')).textContent = localize('ade.review.plan', "Planned Changes");
	const changes = dom.append(details, dom.$('ul.ade-draft-changes'));
	for (const change of review.changes.filter(change => ['elements', 'relations', 'views'].includes(change.collection))) {
		const action = change.after === null ? localize('ade.review.delete', "Delete") : change.before === null ? localize('ade.review.create', "Create") : localize('ade.review.modify', "Modify");
		dom.append(changes, dom.$('li')).textContent = localize('ade.draft.change', "{0} · {1}", action, change.after?.name ?? change.before?.name ?? localize('ade.draft.supportingChange', "Supporting Model Data"));
	}
	dom.append(details, dom.$('h3')).textContent = localize('ade.draft.evidence', "Source Evidence");
	const sources = dom.append(details, dom.$('ul'));
	for (const source of review.sources) { dom.append(sources, dom.$('li')).textContent = source.file; }
	dom.append(details, dom.$('h3')).textContent = localize('ade.review.coverage', "Coverage and Limits");
	dom.append(details, dom.$('p')).textContent = localize('ade.draft.limits', "A diagram describes the reviewed scenario. It does not verify runtime behavior or establish complete coverage of the codebase. Source and model revisions are checked again when applying.");
	const technical = controls.details(details, localize('ade.review.technicalDetails', "Technical Details"), 'diagram-review-technical');
	if (review.problem) { dom.append(technical, dom.$('p')).textContent = review.problem; }
	for (const diagnostic of review.proposal.diagnostics) { dom.append(technical, dom.$('p')).textContent = `${diagnostic.code} · ${diagnostic.path} · ${diagnostic.args.join(' · ')}`; }
	for (const source of review.sources) { dom.append(technical, dom.$('p')).textContent = `${source.file} · ${source.start}–${source.end} · ${source.revision}`; }
	controls.button(technical, localize('ade.draft.artifact', "Open Complete Review Data"), actions.technical, 'diagram-review-technical-open').disabled = actions.busy;
	return section;
}
