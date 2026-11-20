import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { SemanticElement, SemanticModel } from '../common/modelTypes.js';
import { getElementEvidence, getModelImpact } from '../common/modelImpact.js';
import { AdeActionMenu } from './adeActionMenu.js';
import { AdeControls } from './adeControls.js';
import { diagramIcon, elementIcon } from './adeIcons.js';
import { describeRecordedEvidence, evidenceSummary, impactReason } from './adeImpactContent.js';
import { relationLabels } from './adeLabels.js';

/** Evidence disclosures preserve recorded metadata without presenting it as current implementation status. */
export function renderRecordedEvidence(parent: HTMLElement, model: SemanticModel, id: string, controls: AdeControls, key = id): void {
	const section = dom.append(parent, dom.$('section.ade-recorded-evidence'));
	section.setAttribute('aria-label', localize('ade.evidence.title', "Recorded Evidence"));
	dom.append(section, dom.$('p')).textContent = evidenceSummary(getElementEvidence(model, id));
	const details = controls.details(section, localize('ade.evidence.details', "Inspect Recorded Evidence"), `recorded-evidence:${key}`);
	for (const line of describeRecordedEvidence(model, id)) { dom.append(details, dom.$('p')).textContent = line; }
}

/** Each result links back to the shared semantic identity; review scope itself is never persisted in the model. */
export function renderChangeImpact(parent: HTMLElement, model: SemanticModel, id: string, controls: AdeControls, inspect: (id: string) => void, diagram: (id: string) => void): void {
	const impact = getModelImpact(model, id);
	const menu = new AdeActionMenu(controls);
	const root = dom.append(parent, dom.$('section.ade-impact'));
	root.setAttribute('aria-label', localize('ade.impact.region', "Model Change Impact"));
	const main = dom.append(root, dom.$('div.ade-impact-column.ade-action-menu'));
	const context = dom.append(root, dom.$('aside.ade-impact-column.ade-action-menu', { 'aria-label': localize('ade.impact.context', "Review Context") }));
	const group = (column: HTMLElement, title: string): HTMLElement => {
		const section = dom.append(column, dom.$('section.ade-impact-group'));
		const heading = dom.append(section, dom.$('h2', { id: generateUuid() }));
		heading.textContent = title;
		section.setAttribute('aria-labelledby', heading.id);
		return section;
	};
	const openElement = (parent: HTMLElement, element: SemanticElement, key: string) =>
		menu.action(parent, element.name, () => inspect(element.id), { id: `impact-${key}:${element.id}`, kind: 'navigation', icon: elementIcon(element.kind) });

	const dependents = group(main, localize('ade.impact.potentialDependents', "Potential Dependents: {0}", impact.dependents.length));
	for (const entry of impact.dependents) {
		const row = dom.append(dependents, dom.$('div.ade-impact-entry'));
		row.dataset.elementId = entry.element.id;
		menu.action(row, entry.element.name, () => inspect(entry.element.id), {
			id: `impact-dependent:${entry.element.id}`, kind: 'navigation', icon: elementIcon(entry.element.kind),
			description: impactReason(model, entry),
			detail: entry.distance === 1 ? localize('ade.impact.direct', "Direct") : localize('ade.impact.steps', "{0} Steps Away", entry.distance)
		});
	}
	if (!impact.dependents.length) { dom.append(dependents, dom.$('p.ade-impact-note')).textContent = localize('ade.impact.emptyDependents', "No declared references point to this scope."); }

	const views = group(context, localize('ade.impact.diagrams', "Diagrams to Review: {0}", impact.views.length));
	for (const view of impact.views) {
		menu.action(views, view.name, () => diagram(view.id), { id: `impact-view:${view.id}`, kind: 'navigation', icon: diagramIcon(view.kind) });
	}
	if (!impact.views.length) { dom.append(views, dom.$('p.ade-impact-note')).textContent = localize('ade.impact.emptyDiagrams', "No diagrams reference this scope."); }
	const scope = group(context, localize('ade.impact.scopeAndContents', "Selected Scope and Contents"));
	for (const element of impact.scope) { openElement(scope, element, 'scope'); }
	const owners = group(context, localize('ade.impact.ownership', "Ownership Context"));
	for (const element of impact.owners) { openElement(owners, element, 'owner'); }
	if (!impact.owners.length) { dom.append(owners, dom.$('p.ade-impact-note')).textContent = localize('ade.impact.emptyOwners', "No declared owners outside this scope."); }

	const relations = menu.disclosure(main, localize('ade.impact.relationships', "Relationships to Review: {0}", impact.relationships.length), 'impact-relationships', { icon: Codicon.link });
	relations.parentElement!.classList.add('ade-impact-disclosure', 'ade-impact-relationships');
	if (impact.unclassified.length) { dom.append(relations, dom.$('p.ade-impact-note')).textContent = localize('ade.impact.uncertain', "Unclassified Relationships Not Propagated: {0}", impact.unclassified.length); }
	if (!impact.relationships.length) { dom.append(relations, dom.$('p.ade-impact-note')).textContent = localize('ade.impact.emptyRelationships', "No declared relationships reach this scope."); }
	const elements = new Map(model.semantics.elements.map(element => [element.id, element]));
	for (const relation of impact.relationships) {
		const row = dom.append(relations, dom.$('div.ade-impact-entry.ade-impact-relationship'));
		const from = elements.get(relation.from)!, to = elements.get(relation.to)!;
		dom.append(row, dom.$('h3')).textContent = relation.name
			? localize('ade.impact.namedRelationship', "{0} · {1}", relationLabels[relation.kind], relation.name)
			: relationLabels[relation.kind];
		const endpoints = dom.append(row, dom.$('div.ade-impact-actions'));
		controls.button(endpoints, localize('ade.impact.source', "Source: {0}", from.name), () => inspect(from.id), `impact-source:${relation.id}`);
		controls.button(endpoints, localize('ade.impact.target', "Target: {0}", to.name), () => inspect(to.id), `impact-target:${relation.id}`);
		if (relation.classification) { dom.append(row, dom.$('p')).textContent = localize('ade.impact.unclassifiedRelation', "Unclassified relationship: excluded from propagation."); }
		if (relation.condition) { dom.append(row, dom.$('p')).textContent = localize('ade.impact.condition', "Condition: {0}", relation.condition); }
		if (relation.errorCode) { dom.append(row, dom.$('p')).textContent = localize('ade.impact.error', "Error: {0}", relation.errorCode); }
	}
	const evidence = group(main, localize('ade.impact.evidence', "Evidence to Review"));
	const records = menu.disclosure(evidence, localize('ade.impact.evidenceByElement', "Recorded Evidence by Element"), 'impact-records', { icon: Codicon.checklist });
	dom.append(records, dom.$('p.ade-impact-note')).textContent = localize('ade.evidence.limits', "Records do not establish the current implementation, freshness or latest result. No tests are run by this view.");
	for (const entry of impact.evidence) {
		const row = dom.append(records, dom.$('div.ade-impact-entry'));
		row.dataset.elementId = entry.element.id;
		openElement(row, entry.element, 'evidence');
		renderRecordedEvidence(row, model, entry.element.id, controls, `impact:${entry.element.id}`);
	}
}
