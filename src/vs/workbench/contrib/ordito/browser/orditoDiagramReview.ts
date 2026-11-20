import * as dom from '../../../../base/browser/dom.js';
import { FileAccess } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { renderOrditoErrorNotice } from './orditoErrorNotice.js';
import { localize } from '../../../../nls.js';
import { type OrditoDiagramReview } from './orditoAiService.js';
import { type OrditoControls } from './orditoControls.js';

interface DiagramReviewActions {
	busy: boolean; current: boolean;
	apply(): void; continue?(): void; refresh(): void; close(): void; technical(): void;
}

/** Explain the publication checks in the same place as the disabled decision. */
function blockedReasons(review: OrditoDiagramReview, actions: DiagramReviewActions): string[] {
	const reasons: string[] = [];
	if (actions.busy) { reasons.push(localize('ordito.review.busy', "An Operation Is Running. Wait for It to Finish Before Applying.")); }
	if (!actions.current) { reasons.push(localize('ordito.draft.changed', "The Model Changed After This Review. Refresh the Review Before Applying.")); }
	const explain = (value: string): string => {
		if (value.startsWith('projectNotReady:')) { return explain(value.slice('projectNotReady:'.length)); }
		if (value.endsWith(': invalidProposal')) { return localize('ordito.review.previousInvalid', "An Earlier Draft Is Invalid. Continue Generation to Repair It or Archive It If It Was Replaced."); }
		const [code, ...parts] = value.split(':');
		const id = parts.join(':');
		const name = review.plan?.items.find(item => item.id === id)?.name ?? review.proposal.views.find(view => view.id === id)?.name ?? id;
		switch (code) {
			case 'plannedDiagramIncomplete': return localize('ordito.review.pendingDiagram', "{0} Is Not Ready. Continue Generation to Complete or Explicitly Exclude It.", name);
			case 'diagramPlanRequired': return localize('ordito.review.planMissing', "The Diagram Plan Has Not Been Prepared. Continue Generation to Create It.");
			case 'noDiagramDrafts': return localize('ordito.review.noDrafts', "There Are No Prepared Diagrams to Apply. Continue Generation First.");
			case 'invalidDraft': return localize('ordito.review.invalidDraft', "A Diagram Draft Needs Correction. Continue Generation to Resolve Its Validation Errors.");
			case 'unplannedDraft': return localize('ordito.review.unplanned', "A Draft Is Not Linked to the Diagram Plan. Continue Generation to Reconcile the Plan.");
			case 'duplicatePlannedProposal': return localize('ordito.review.duplicate', "Multiple Planned Diagrams Refer to the Same Draft. Continue Generation to Correct Their Assignments.");
			case 'diagramAuditRequired': return localize('ordito.review.auditRequired', "Continue Generation to Check the Drafts Against the Codebase.");
			case 'diagramAuditRepairRequired': return localize('ordito.review.auditRepairRequired', "Continue Generation to Address the Remaining Audit Findings.");
			case 'staleEvidence': case 'staleQuery': case 'staleEvidenceRevision': case 'staleSource': case 'staleSourceRevision': return localize('ordito.review.staleSources', "Source Files Changed After Analysis. Continue Generation to Refresh Their Evidence, Then Refresh This Review.");
			case 'projectReviewChanged': case 'staleRead': case 'staleModel': case 'staleSemanticRevision': case 'staleProjectReview': return localize('ordito.review.staleModel', "The Project or Its Drafts Changed. Refresh This Review Before Applying.");
			case 'diagramGeometryInvalid': return localize('ordito.review.geometry', "{0} Has Overlapping or Invalid Diagram Geometry. Continue Generation to Repair Its Layout.", name);
			case 'semanticIndexRefreshRequired': return localize('ordito.review.indexChanged', "The Source Index Needs Updating. Update the Code Evidence, Then Continue Generation.");
			case 'missingEvidence': case 'evidenceOutsideScope': return localize('ordito.review.evidenceMissing', "A Draft Has Missing or Out-of-Scope Source Evidence. Continue Generation to Refresh Its Sources.");
			default: return value;
		}
	};
	if (review.problem) { reasons.push(...review.problem.split(' · ').map(explain)); }
	if (review.proposal.status !== 'ready') {
		for (const diagnostic of review.proposal.diagnostics) {
			if (diagnostic.code === 'contract' && diagnostic.args[0]) { reasons.push(explain(diagnostic.args[0])); }
			else if (diagnostic.code === 'missingReference') { reasons.push(localize('ordito.review.missingReference', "A Diagram References an Object That Does Not Exist ({0}). Continue Generation to Correct It.", diagnostic.args[0])); }
			else { reasons.push(localize('ordito.review.validationReason', "A Draft Failed Validation: {0} at {1}. Continue Generation to Correct It.", diagnostic.code, diagnostic.path)); }
		}
		if (!review.proposal.diagnostics.length && !review.problem) { reasons.push(localize('ordito.review.invalid', "The Draft Has Not Passed Validation. Continue Generation to Correct It, Then Refresh the Review.")); }
	}
	return [...new Set(reasons)];
}

function renderAuditReport(parent: HTMLElement, review: OrditoDiagramReview, controls: OrditoControls): void {
	const report = review.auditReport;
	if (!report) { return; }
	const section = dom.append(parent, dom.$('section.ordito-review-coverage'));
	dom.append(section, dom.$('h3')).textContent = localize('ordito.review.auditReport', "Codebase Audit Report");
	dom.append(section, dom.$('p')).textContent = report.summary;
	if (!report.findings.length) { return; }
	const details = controls.details(section, localize('ordito.review.auditFindings', "Audit Findings ({0})", report.findings.length), 'diagram-review-audit-findings');
	const list = dom.append(details, dom.$('ul'));
	const categories = {
		missing: localize('ordito.review.auditMissing', "Missing Coverage"),
		inconsistent: localize('ordito.review.auditInconsistent', "Inconsistency"),
		duplicate: localize('ordito.review.auditDuplicate', "Duplicate Identity"),
		improvement: localize('ordito.review.auditImprovement', "Improvement")
	};
	const sourcesById = new Map(review.sources.map(source => [source.id, source.file]));
	const viewNames = new Map(review.proposal.views.map(view => [view.id, view.name]));
	for (const finding of report.findings) {
		const row = dom.append(list, dom.$('li'));
		dom.append(row, dom.$('strong')).textContent = localize('ordito.review.auditFinding', "{0} · {1}", categories[finding.category], finding.summary);
		dom.append(row, dom.$('p')).textContent = finding.recommendation;
		dom.append(row, dom.$('p')).textContent = finding.resolution ? localize('ordito.review.auditResolution', "Draft correction · {0}", finding.resolution) : localize('ordito.review.auditPending', "Correction pending");
		const views = finding.viewIds.flatMap(id => viewNames.get(id) ?? []);
		const files = [...new Set(finding.evidenceIds.flatMap(id => sourcesById.get(id) ?? []))];
		if (views.length) { dom.append(row, dom.$('p.ordito-supporting-text')).textContent = localize('ordito.review.auditViews', "Diagrams · {0}", views.join(', ')); }
		if (files.length) { dom.append(row, dom.$('p.ordito-supporting-text')).textContent = localize('ordito.review.auditSources', "Sources · {0}", files.join(', ')); }
	}
}

/** Show the audit and diagram previews alongside the explicit publication decision. */
export function renderOrditoDiagramReview(parent: HTMLElement, review: OrditoDiagramReview, controls: OrditoControls, actions: DiagramReviewActions): HTMLElement {
	const section = dom.append(parent, dom.$('section.ordito-structural-review.ordito-diagram-review'));
	section.setAttribute('aria-label', localize('ordito.explore.review', "Review Diagram Draft"));
	dom.append(section, dom.$('h2')).textContent = review.projectReviewId ? localize('ordito.explore.projectReview', "Project Diagram Review") : review.proposal.views.map(view => view.name).join(', ') || localize('ordito.explore.review', "Review Diagram Draft");
	const reasons = blockedReasons(review, actions);
	const ready = review.proposal.status === 'ready' && actions.current && !review.problem;
	const toolbar = dom.append(section, dom.$('div.ordito-review-actions'));
	const apply = controls.button(toolbar, review.projectReviewId ? localize('ordito.review.publishAll', "Apply All Changes") : localize('ordito.review.publish', "Apply to Project"), actions.apply, 'diagram-review-apply');
	apply.disabled = actions.busy || !ready;
	if (ready) { apply.classList.add('ordito-primary-action'); }
	controls.button(toolbar, localize('ordito.draft.refresh', "Refresh Review"), actions.refresh, 'diagram-review-refresh').disabled = actions.busy;
	controls.button(toolbar, localize('ordito.draft.close', "Return to Exploration"), actions.close, 'diagram-review-close').disabled = actions.busy;
	if (reasons.length) {
		const blocked = dom.append(section, dom.$('aside.ordito-review-blockers'));
		blocked.id = 'ordito-review-blockers'; blocked.setAttribute('role', 'alert'); apply.setAttribute('aria-describedby', blocked.id);
		blocked.removeAttribute('role');
		renderOrditoErrorNotice(blocked, {
			title: localize('ordito.review.whyBlocked', "Why Applying Is Unavailable"),
			cause: reasons.join('\n'),
			resolution: localize('ordito.review.correctDraft', "Continue generation to correct the draft, then refresh the review before applying it."),
			details: review.problem
		}, controls);
		if (!ready && actions.continue) { controls.button(blocked, localize('ordito.explore.continueProject', "Continue Generation"), actions.continue, 'diagram-review-continue').disabled = actions.busy; }
	}
	const body = dom.append(section, dom.$('div.ordito-review-body'));
	renderAuditReport(body, review, controls);
	const featureSections = new Map<string | undefined, HTMLElement>();
	const features = review.featureCatalog?.features ?? [];
	if (features.length) {
		for (const feature of [{ elementId: undefined, name: localize('ordito.explore.systemScope', "System Overview") }, ...features.filter(feature => feature.elementId)]) {
			if (!review.proposal.views.some(view => view.featureId === feature.elementId)) { continue; }
			const group = dom.append(body, dom.$('section.ordito-review-feature'));
			dom.append(group, dom.$('h3')).textContent = feature.name;
			featureSections.set(feature.elementId, group);
		}
	}
	for (const view of review.proposal.views) {
		const figure = dom.append(featureSections.get(view.featureId) ?? body, dom.$('figure.ordito-review-preview'));
		dom.append(figure, dom.$('figcaption')).textContent = view.name;
		if (view.spec?.intent) { dom.append(figure, dom.$('p.ordito-supporting-text')).textContent = view.spec.intent; }
		const image = review.images.find(image => image.viewId === view.id);
		if (image) {
			const previewActions = dom.append(figure, dom.$('div.ordito-review-preview-actions'));
			const viewport = dom.append(figure, dom.$('div.ordito-review-preview-viewport'));
			viewport.tabIndex = 0; viewport.setAttribute('role', 'region'); viewport.setAttribute('aria-label', localize('ordito.draft.preview', "Diagram Preview: {0}", view.name));
			const preview = dom.append(viewport, dom.$<HTMLImageElement>('img'));
			preview.src = FileAccess.uriToBrowserUri(URI.file(image.path)).toString(true);
			preview.alt = localize('ordito.draft.preview', "Diagram Preview: {0}", view.name);
			const hint = dom.append(previewActions, dom.$('p.ordito-supporting-text')); hint.hidden = true;
			hint.textContent = localize('ordito.review.previewScrollHint', "Scroll Within the Preview to Read the Full-Size Diagram. Use Tab and Arrow Keys for Keyboard Navigation.");
			const fullLabel = localize('ordito.review.previewFullSize', "View Full Size"), fitLabel = localize('ordito.review.previewFit', "Fit Preview to Width");
			const toggle = controls.button(previewActions, fullLabel, () => {
				const fullSize = viewport.classList.toggle('ordito-preview-full-size');
				toggle.textContent = fullSize ? fitLabel : fullLabel; toggle.setAttribute('aria-pressed', String(fullSize));
				toggle.setAttribute('aria-label', localize('ordito.review.previewSizeLabel', "{0}: {1}", fullSize ? fitLabel : fullLabel, view.name));
				hint.hidden = !fullSize;
				if (!fullSize) { viewport.scrollLeft = 0; viewport.scrollTop = 0; }
			}, `preview-size:${view.id}`);
			toggle.setAttribute('aria-pressed', 'false'); toggle.setAttribute('aria-label', localize('ordito.review.previewSizeLabel', "{0}: {1}", fullLabel, view.name));
			previewActions.insertBefore(toggle, hint);
		} else { dom.append(figure, dom.$('p')).textContent = localize('ordito.review.previewMissing', "Preview Is Unavailable. Refresh the Review or Continue Generation to Correct the Draft."); }
	}
	const details = controls.details(body, localize('ordito.review.supportingDetails', "Change Details, Sources and Diagnostics ({0})", review.changes.length), 'diagram-review-details');
	dom.append(details, dom.$('p.ordito-supporting-text')).textContent = review.projectReviewId ? localize('ordito.draft.projectLocal', "Applies all reviewed diagrams and their shared model changes together in one local operation. The source code is preserved. This does not commit or push to Git.") : localize('ordito.draft.local', "Applies this diagram proposal and its dependencies locally. Other drafts remain available. This does not commit or push to Git.");
	if (review.plan) {
		dom.append(details, dom.$('h3')).textContent = localize('ordito.review.diagramPlan', "Diagram Plan and Exclusions");
		const list = dom.append(details, dom.$('ul'));
		for (const featurePlan of review.featurePlans ?? []) {
			const name = featurePlan.featureId ? features.find(feature => feature.id === featurePlan.featureId)?.name ?? featurePlan.featureId : localize('ordito.explore.systemScope', "System Overview");
			for (const gap of featurePlan.gaps) { dom.append(list, dom.$('li')).textContent = localize('ordito.review.groupGap', "{0} · {1}", name, gap); }
		}
		for (const item of review.plan.items) {
			const row = dom.append(list, dom.$('li')); row.textContent = item.name + ' · ' + item.rationale;
			for (const gap of review.tasks?.find(task => task.id === item.id)?.gaps ?? []) { dom.append(row, dom.$('p')).textContent = gap; }
		}
	}
	dom.append(details, dom.$('h3')).textContent = localize('ordito.review.plan', "Planned Changes");
	const changes = dom.append(details, dom.$('ul.ordito-draft-changes'));
	for (const change of review.changes.filter(change => ['elements', 'relations', 'views'].includes(change.collection))) {
		const action = change.after === null ? localize('ordito.review.delete', "Delete") : change.before === null ? localize('ordito.review.create', "Create") : localize('ordito.review.modify', "Modify");
		dom.append(changes, dom.$('li')).textContent = localize('ordito.draft.change', "{0} · {1}", action, change.after?.name ?? change.before?.name ?? localize('ordito.draft.supportingChange', "Supporting Model Data"));
	}
	dom.append(details, dom.$('h3')).textContent = localize('ordito.draft.evidence', "Source Evidence");
	const sources = dom.append(details, dom.$('ul'));
	for (const source of review.sources) { dom.append(sources, dom.$('li')).textContent = source.file; }
	dom.append(details, dom.$('h3')).textContent = localize('ordito.review.coverage', "Coverage and Limits");
	dom.append(details, dom.$('p')).textContent = localize('ordito.draft.limits', "A diagram describes the reviewed scenario. It does not verify runtime behavior or establish complete coverage of the codebase. Source and model revisions are checked again when applying.");
	const technical = controls.details(details, localize('ordito.review.technicalDetails', "Technical Details"), 'diagram-review-technical');
	if (review.problem) { dom.append(technical, dom.$('p')).textContent = review.problem; }
	for (const diagnostic of review.proposal.diagnostics) { dom.append(technical, dom.$('p')).textContent = `${diagnostic.code} · ${diagnostic.path} · ${diagnostic.args.join(' · ')}`; }
	for (const source of review.sources) { dom.append(technical, dom.$('p')).textContent = `${source.file} · ${source.start}–${source.end} · ${source.revision}`; }
	controls.button(technical, localize('ordito.draft.artifact', "Open Complete Review Data"), actions.technical, 'diagram-review-technical-open').disabled = actions.busy;
	return section;
}
