/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { localize } from '../../../../nls.js';
import type { SemanticModelV4 } from '../common/semanticModel.js';
import { projectDescriptiveActivity } from '../common/descriptiveActivity.js';
import type { AdeControls } from './adeControls.js';

/** Reuse native controls and boundary styling; arrows come exclusively from the scenario. */
export function renderAdeDescriptiveActivity(canvas: HTMLElement, model: SemanticModelV4, scenarioId: string, controls: AdeControls, select: (id: string) => void): { width: number; height: number } {
	const projection = projectDescriptiveActivity(model, scenarioId), svg = canvas.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
	canvas.classList.add('ade-sequence'); svg.setAttribute('aria-hidden', 'true'); canvas.appendChild(svg);
	for (const group of projection.groups) {
		const rect = canvas.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'rect'); rect.classList.add('ade-sequence-frame');
		for (const key of ['x', 'y', 'width', 'height'] as const) { rect.setAttribute(key, String(group[key])); } svg.appendChild(rect);
		const heading = canvas.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'text'); heading.classList.add('ade-notation-boundary-label'); heading.setAttribute('x', String(group.x + 12)); heading.setAttribute('y', String(group.y + 20)); heading.textContent = group.operator; svg.appendChild(heading);
		for (const operand of group.operands) {
			const label = dom.append(canvas, dom.$('span.ade-sequence-message')); label.textContent = operand.condition.state === 'known' ? localize('ade.activity.condition', "Condition: {0}", String(operand.condition.value)) : localize('ade.activity.unknownCondition', "Condition Is Unknown");
			label.classList.add('ade-sequence-message'); label.style.left = `${operand.x + 8}px`; label.style.top = `${operand.y}px`; label.style.width = `${operand.width - 16}px`;
		}
	}
	for (const edge of projection.edges) {
		const from = projection.nodes.find(node => node.occurrenceId === edge.before)!, to = projection.nodes.find(node => node.occurrenceId === edge.after)!;
		const x = to.x + to.width / 2, y = to.y, path = canvas.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute('d', `M ${from.x + from.width / 2} ${from.y + from.height} L ${x} ${y} m -6 -8 l 6 8 l 6 -8`);
		if (edge.basis === 'inferred') { path.setAttribute('stroke-dasharray', '6 4'); } svg.appendChild(path);
	}
	for (const node of projection.nodes) {
		const button = controls.button(canvas, localize('ade.activity.occurrence', "{0}\n{1}", node.name, node.endpoints), () => select(node.participantId), `activity:${node.occurrenceId}`);
		button.classList.add('ade-node'); button.style.whiteSpace = 'pre-line'; button.dataset.occurrenceId = node.occurrenceId;
		for (const key of ['left', 'top', 'width', 'height'] as const) { const value = key === 'left' ? node.x : key === 'top' ? node.y : node[key]; button.style[key] = `${value}px`; }
	}
	if (projection.unordered) { const note = dom.append(canvas, dom.$('span.ade-sequence-message')); note.textContent = localize('ade.activity.partialOrder', "Arrows Show Only Declared Order · Other Events Have No Known Order"); note.classList.add('ade-sequence-message'); note.style.left = '24px'; note.style.top = `${projection.height - 32}px`; }
	svg.setAttribute('width', String(projection.width)); svg.setAttribute('height', String(projection.height)); return projection;
}
