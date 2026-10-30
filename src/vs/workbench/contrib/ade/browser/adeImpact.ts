/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { localize } from '../../../../nls.js';
import { SemanticModel } from '../common/semanticModel.js';
import { getElementEvidence, getModelImpact } from '../common/modelImpact.js';
import { AdeControls } from './adeControls.js';
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
	const root = dom.append(parent, dom.$('section.ade-impact'));
	root.setAttribute('aria-label', localize('ade.impact.region', "Model Change Impact"));
	dom.append(root, dom.$('p')).textContent = localize('ade.impact.limits', "Potential review scope from declared containment and reverse directed references. Conditions are not evaluated. This is not a prediction of code changes.");
	const group = (title: string): HTMLElement => {
		const section = dom.append(root, dom.$('section.ade-impact-group'));
		dom.append(section, dom.$('h2')).textContent = title;
		return section;
	};
	const scope = group(localize('ade.impact.selectedScope', "Selected Scope and Contained Elements"));
	for (const element of impact.scope) { controls.button(scope, element.name, () => inspect(element.id), `impact-scope:${element.id}`); }
	const dependents = group(localize('ade.impact.potentialDependents', "Potential Dependents: {0}", impact.dependents.length));
	for (const entry of impact.dependents) {
		const row = dom.append(dependents, dom.$('div.ade-impact-entry'));
		row.dataset.elementId = entry.element.id;
		controls.button(row, entry.element.name, () => inspect(entry.element.id), `impact-dependent:${entry.element.id}`);
		dom.append(row, dom.$('p')).textContent = impactReason(model, entry);
	}
	if (!impact.dependents.length) { dom.append(dependents, dom.$('p')).textContent = localize('ade.impact.noDependents', "No dependents are declared through the supported references. This does not establish absence of dependencies in the code."); }
	const owners = group(localize('ade.impact.ownership', "Ownership Context"));
	for (const element of impact.owners) { controls.button(owners, element.name, () => inspect(element.id), `impact-owner:${element.id}`); }
	const views = group(localize('ade.impact.diagrams', "Diagrams to Review: {0}", impact.views.length));
	for (const view of impact.views) { controls.button(views, view.name, () => diagram(view.id), `impact-view:${view.id}`); }
	const relations = controls.details(root, localize('ade.impact.relationships', "Relationships to Review: {0}", impact.relationships.length), 'impact-relationships');
	const elements = new Map(model.semantics.elements.map(element => [element.id, element]));
	for (const relation of impact.relationships) {
		const row = dom.append(relations, dom.$('div.ade-impact-entry'));
		dom.append(row, dom.$('p')).textContent = localize('ade.impact.relationship', "{0} → {1}: {2} · {3}", elements.get(relation.from)!.name, elements.get(relation.to)!.name, relationLabels[relation.kind], relation.name);
		controls.button(row, localize('ade.impact.source', "Source: {0}", elements.get(relation.from)!.name), () => inspect(relation.from), `impact-source:${relation.id}`);
		controls.button(row, localize('ade.impact.target', "Target: {0}", elements.get(relation.to)!.name), () => inspect(relation.to), `impact-target:${relation.id}`);
		if (relation.classification) { dom.append(row, dom.$('p')).textContent = localize('ade.impact.unclassifiedRelation', "Unclassified relationship: excluded from propagation."); }
		if (relation.condition) { dom.append(row, dom.$('p')).textContent = localize('ade.impact.condition', "Condition: {0}", relation.condition); }
		if (relation.errorCode) { dom.append(row, dom.$('p')).textContent = localize('ade.impact.error', "Error: {0}", relation.errorCode); }
	}
	dom.append(root, dom.$('p')).textContent = localize('ade.impact.uncertain', "Unclassified Relationships Not Propagated: {0}", impact.unclassified.length);
	const evidence = group(localize('ade.impact.evidence', "Evidence to Review"));
	dom.append(evidence, dom.$('p')).textContent = localize('ade.evidence.limits', "Records do not establish the current implementation, freshness or latest result. No tests are run by this view.");
	for (const entry of impact.evidence) {
		const row = dom.append(evidence, dom.$('div.ade-impact-entry'));
		row.dataset.elementId = entry.element.id;
		controls.button(row, entry.element.name, () => inspect(entry.element.id), `impact-evidence:${entry.element.id}`);
		renderRecordedEvidence(row, model, entry.element.id, controls, `impact:${entry.element.id}`);
	}
}
