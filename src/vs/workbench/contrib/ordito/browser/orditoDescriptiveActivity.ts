import * as dom from '../../../../base/browser/dom.js';
import { localize } from '../../../../nls.js';
import { type SemanticModelV4 } from '../common/modelTypes.js';
import { projectDescriptiveActivity } from '../common/descriptiveActivity.js';
import { type OrditoControls } from './orditoControls.js';

/** Reuse native controls and boundary styling; arrows come exclusively from the scenario. */
export function renderOrditoDescriptiveActivity(canvas: HTMLElement, model: SemanticModelV4, scenarioId: string, controls: OrditoControls, select: (id: string) => void, selectedId?: string): { width: number; height: number } {
	const projection = projectDescriptiveActivity(model, scenarioId), svg = canvas.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
	canvas.classList.add('ordito-sequence'); svg.setAttribute('aria-hidden', 'true'); canvas.appendChild(svg);
	for (const group of projection.groups) {
		const rect = canvas.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'rect'); rect.classList.add('ordito-sequence-frame');
		for (const key of ['x', 'y', 'width', 'height'] as const) { rect.setAttribute(key, String(group[key])); } svg.appendChild(rect);
		const heading = controls.button(canvas, group.operator, () => select(group.id), `activity-frame:${group.id}`);
		heading.classList.add('ordito-sequence-message', 'ordito-sequence-frame-label'); heading.style.left = `${group.x + 12}px`; heading.style.top = `${group.y + 4}px`;
		heading.setAttribute('aria-pressed', String(selectedId === group.id));
		for (const operand of group.operands) {
			const condition = operand.condition.state === 'known' ? localize('ordito.activity.condition', "Condition: {0}", String(operand.condition.value)) : localize('ordito.activity.unknownCondition', "Condition Is Unknown");
			const label = controls.button(canvas, condition, () => select(operand.id), `activity-operand:${operand.id}`);
			label.classList.add('ordito-sequence-message', 'ordito-sequence-operand'); label.style.left = `${operand.x + 8}px`; label.style.top = `${operand.y}px`; label.style.width = `${operand.width - 16}px`;
			label.setAttribute('aria-pressed', String(selectedId === operand.id));
		}
	}
	for (const edge of projection.edges) {
		const from = projection.nodes.find(node => node.occurrenceId === edge.before)!, to = projection.nodes.find(node => node.occurrenceId === edge.after)!;
		const x = to.x + to.width / 2, y = to.y, path = canvas.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute('d', `M ${from.x + from.width / 2} ${from.y + from.height} L ${x} ${y} m -6 -8 l 6 8 l 6 -8`);
		if (edge.basis === 'inferred') { path.setAttribute('stroke-dasharray', '6 4'); } svg.appendChild(path);
	}
	for (const node of projection.nodes) {
		const button = controls.button(canvas, localize('ordito.activity.occurrence', "{0}\n{1}", node.name, node.endpoints), () => select(node.occurrenceId), `activity:${node.occurrenceId}`);
		button.classList.add('ordito-node'); button.style.whiteSpace = 'pre-line'; button.dataset.occurrenceId = node.occurrenceId;
		button.setAttribute('aria-pressed', String(selectedId === node.occurrenceId));
		for (const key of ['left', 'top', 'width', 'height'] as const) { const value = key === 'left' ? node.x : key === 'top' ? node.y : node[key]; button.style[key] = `${value}px`; }
	}
	if (projection.unordered) { const note = dom.append(canvas, dom.$('span.ordito-sequence-message')); note.textContent = localize('ordito.activity.partialOrder', "Arrows Show Only Declared Order · Other Events Have No Known Order"); note.classList.add('ordito-sequence-message'); note.style.left = '24px'; note.style.top = `${projection.height - 32}px`; }
	svg.setAttribute('width', String(projection.width)); svg.setAttribute('height', String(projection.height)); return projection;
}
