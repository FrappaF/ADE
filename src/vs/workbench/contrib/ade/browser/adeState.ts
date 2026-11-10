/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { localize } from '../../../../nls.js';
import { ModelView, SemanticModel, SemanticRelation } from '../common/modelTypes.js';
import { adeStateRows } from './adeStateContent.js';
import { getStateDiagram } from '../common/stateDiagram.js';
import { AdeControls } from './adeControls.js';

/** Events and guards remain visible together rather than replacing one another on state edges. */
export function stateTransitionLabel(relation: SemanticRelation): string {
	return [relation.name, relation.condition ? `[${relation.condition}]` : '', relation.errorCode ? localize('ade.state.errorLabel', "Error: {0}", relation.errorCode) : ''].filter(Boolean).join(' · ');
}

/** Resource summaries and a native table complement the existing editable graph and accessible reader. */
export function renderAdeState(parent: HTMLElement, model: SemanticModel, view: ModelView, controls: AdeControls, inspect: (id: string) => void, select: (id: string) => void): void {
	if ((model.version === 4 || model.version === 5) && view.stateMachineId) {
		const section = dom.append(parent, dom.$('section.ade-state-summary')); section.setAttribute('aria-label', localize('ade.states.table', "Executable State Machine"));
		for (const row of adeStateRows(model, view.stateMachineId)) { const item = dom.append(section, dom.$('p')); item.dataset.stateId = row.id; if (model.semantics.elements.some(element => element.id === row.id)) { controls.button(item, row.label, () => select(row.id), 'state-executable:' + row.id); } dom.append(item, dom.$('span')).textContent = row.text; }
		return;
	}
	const state = getStateDiagram(model, view);
	const elements = new Map(model.semantics.elements.map(element => [element.id, element]));
	const summary = dom.append(parent, dom.$('section.ade-state-summary'));
	summary.setAttribute('aria-label', localize('ade.state.summary', "Resource Lifecycles"));
	dom.append(summary, dom.$('p')).textContent = localize('ade.state.intent', "Declared states and transitions. Events, conditions and errors describe expected behavior, not observed execution.");
	if (!state.groups.length) { dom.append(summary, dom.$('p')).textContent = localize('ade.state.noResource', "Use Add Existing Element in Diagram Options to include a resource before adding its states."); }
	for (const group of state.groups) {
		controls.button(summary, localize('ade.state.resource', "Resource: {0}", group.resource.name), () => inspect(group.resource.id), `state-resource:${group.resource.id}`);
		dom.append(summary, dom.$('p')).textContent = localize('ade.state.counts', "{0} of {1} declared states visible · {2} visible transitions", group.states.length, group.allStates.length, group.transitions.length);
		const details = controls.details(summary, localize('ade.state.table', "Transition Table: {0}", group.resource.name), `transition-table:${group.resource.id}`);
		const wrapper = dom.append(details, dom.$('.ade-transition-table-wrap'));
		const table = dom.append(wrapper, dom.$('table.ade-transition-table'));
		table.setAttribute('aria-label', localize('ade.state.table', "Transition Table: {0}", group.resource.name));
		const headings = dom.append(dom.append(table, dom.$('thead')), dom.$('tr'));
		for (const label of [localize('ade.state.from', "From"), localize('ade.state.to', "To"), localize('ade.state.event', "Event"), localize('ade.state.condition', "Condition"), localize('ade.state.error', "Error")]) {
			const heading = dom.append(headings, dom.$('th'));
			heading.setAttribute('scope', 'col');
			heading.textContent = label;
		}
		const body = dom.append(table, dom.$('tbody'));
		for (const relation of group.transitions) {
			const row = dom.append(body, dom.$('tr'));
			row.dataset.relationId = relation.id;
			controls.button(dom.append(row, dom.$('td')), elements.get(relation.from)!.name, () => select(relation.from), `state-from:${relation.id}`);
			controls.button(dom.append(row, dom.$('td')), elements.get(relation.to)!.name, () => select(relation.to), `state-to:${relation.id}`);
			for (const value of [relation.name, relation.condition, relation.errorCode]) { dom.append(row, dom.$('td')).textContent = value || localize('ade.state.notDeclared', "Not Declared"); }
		}
		if (!group.transitions.length) { dom.append(details, dom.$('p')).textContent = localize('ade.state.noTransitions', "No transitions are included for this resource."); }
	}
	if (state.unscopedStates.length) { dom.append(summary, dom.$('p')).textContent = localize('ade.state.unscoped', "States without a declared resource: {0}. Their historical data is preserved.", state.unscopedStates.map(element => element.name).join(', ')); }
	if (state.contextElements.length || state.contextRelations.length) { dom.append(summary, dom.$('p')).textContent = localize('ade.state.context', "Context: {0} additional elements and {1} relationships. These remain visible in the graph, Properties and Read Diagram.", state.contextElements.length, state.contextRelations.length); }
}
