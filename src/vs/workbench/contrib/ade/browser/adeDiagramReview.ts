/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { FileAccess } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import type { AdeDiagramReview } from './adeAiService.js';
import type { AdeControls } from './adeControls.js';

interface DiagramReviewActions {
	busy: boolean; current: boolean;
	apply(): void; refresh(): void; close(): void; technical(): void;
}

/** One decision surface keeps proposal effects, source evidence, previews and limits together. */
export function renderAdeDiagramReview(parent: HTMLElement, review: AdeDiagramReview, controls: AdeControls, actions: DiagramReviewActions): HTMLElement {
	const section = dom.append(parent, dom.$('section.ade-structural-review.ade-diagram-review'));
	section.setAttribute('aria-label', localize('ade.explore.review', "Review Diagram Draft"));
	dom.append(section, dom.$('h2')).textContent = review.proposal.views.map(view => view.name).join(', ') || localize('ade.explore.review', "Review Diagram Draft");
	const ready = review.proposal.status === 'ready' && actions.current && !review.problem;
	const status = dom.append(section, dom.$('p'));
	status.setAttribute('role', ready ? 'status' : 'alert');
	status.textContent = ready ? localize('ade.draft.ready', "Draft Ready · Review Before Applying") : localize('ade.draft.blocked', "Draft Needs Review · Application Blocked");
	const toolbar = dom.append(section, dom.$('div.ade-review-actions'));
	const apply = controls.button(toolbar, localize('ade.review.publish', "Apply to Project"), actions.apply, 'diagram-review-apply');
	apply.disabled = actions.busy || !ready;
	if (ready) { apply.classList.add('ade-primary-action'); }
	controls.button(toolbar, localize('ade.draft.refresh', "Refresh Review"), actions.refresh, 'diagram-review-refresh').disabled = actions.busy;
	controls.button(toolbar, localize('ade.draft.close', "Return to Exploration"), actions.close, 'diagram-review-close').disabled = actions.busy;
	const body = dom.append(section, dom.$('div.ade-review-body'));
	dom.append(body, dom.$('p.ade-supporting-text')).textContent = localize('ade.draft.local', "Applies this diagram proposal and its dependencies locally. Other drafts remain available. This does not commit or push to Git.");
	if (!ready) {
		dom.append(body, dom.$('p')).textContent = actions.current ? localize('ade.draft.correct', "Continue the exploration to correct this draft, or refresh its review. Existing diagrams are preserved.") : localize('ade.draft.changed', "The model changed after this review was prepared. Refresh the review before applying it.");
	}
	dom.append(body, dom.$('h3')).textContent = localize('ade.review.plan', "Planned Changes");
	const changes = dom.append(body, dom.$('ul.ade-draft-changes'));
	const visibleChanges = review.changes.filter(change => ['elements', 'relations', 'views'].includes(change.collection));
	for (const change of visibleChanges) {
		const action = change.after === null ? localize('ade.review.delete', "Delete") : change.before === null ? localize('ade.review.create', "Create") : localize('ade.review.modify', "Modify");
		const name = change.after?.name ?? change.before?.name;
		const label = name ?? localize('ade.draft.supportingChange', "Supporting Model Data");
		dom.append(changes, dom.$('li')).textContent = localize('ade.draft.change', "{0} · {1}", action, label);
	}
	if (review.changes.length > visibleChanges.length) { dom.append(body, dom.$('p')).textContent = localize('ade.draft.metadata', "{0} supporting evidence and metadata changes are included. Complete details are available below.", review.changes.length - visibleChanges.length); }
	if (!review.changes.length) { dom.append(body, dom.$('p')).textContent = localize('ade.draft.noChanges', "Resolved changes are unavailable until the draft diagnostics are corrected."); }
	dom.append(body, dom.$('h3')).textContent = localize('ade.draft.evidence', "Source Evidence");
	const sources = dom.append(body, dom.$('ul'));
	for (const source of review.sources) { dom.append(sources, dom.$('li')).textContent = source.file; }
	if (!review.sources.length) { dom.append(body, dom.$('p')).textContent = localize('ade.draft.noEvidence', "No source ranges are attached to this review. Check the exploration's evidence before accepting its claims."); }
	dom.append(body, dom.$('h3')).textContent = localize('ade.review.coverage', "Coverage and Limits");
	dom.append(body, dom.$('p')).textContent = localize('ade.draft.limits', "A diagram describes the reviewed scenario. It does not verify runtime behavior or establish complete coverage of the codebase. Source and model revisions are checked again when applying.");
	for (const view of review.proposal.views) {
		const figure = dom.append(body, dom.$('figure.ade-review-preview'));
		dom.append(figure, dom.$('figcaption')).textContent = view.name;
		if (view.spec?.intent) { dom.append(figure, dom.$('p')).textContent = view.spec.intent; }
		const image = review.images.find(image => image.viewId === view.id);
		if (image) {
			const preview = dom.append(figure, dom.$<HTMLImageElement>('img'));
			preview.src = FileAccess.uriToBrowserUri(URI.file(image.path)).toString(true);
			preview.alt = localize('ade.draft.preview', "Diagram preview: {0}. Model changes and source evidence are listed above.", view.name);
		}
	}
	const technical = controls.details(body, localize('ade.review.technicalDetails', "Technical Details"), 'diagram-review-technical');
	if (review.problem) { dom.append(technical, dom.$('p')).textContent = review.problem; }
	for (const diagnostic of review.proposal.diagnostics) { dom.append(technical, dom.$('p')).textContent = `${diagnostic.code} · ${diagnostic.path} · ${diagnostic.args.join(' · ')}`; }
	for (const source of review.sources) { dom.append(technical, dom.$('p')).textContent = `${source.file} · ${source.start}–${source.end} · ${source.revision}`; }
	controls.button(technical, localize('ade.draft.artifact', "Open Complete Review Data"), actions.technical, 'diagram-review-technical-open').disabled = actions.busy;
	return section;
}
