/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderAdeInteractionSequence } from './adeInteractionSequence.js';
import { localize } from '../../../../nls.js';
import { ModelView, SemanticModel } from '../common/semanticModel.js';
import { getSequenceDiagram } from '../common/sequenceDiagram.js';
import { AdeControls } from './adeControls.js';
import { elementLabels, relationLabels } from './adeLabels.js';

/** Measured message rows keep labels apart; geometry never changes semantic or manual-layout data. */
export function renderAdeSequence(canvas: HTMLElement, model: SemanticModel, view: ModelView, controls: AdeControls, selectedId: string, select: (id: string) => void, context?: { selectRelation?(id: string): void; selectedRelation?: string; element(target: HTMLElement, id: string): void; relation(target: HTMLElement | SVGElement, id: string): void }): { width: number; height: number } {
	if ((model.version === 4 || model.version === 5) && view.interactionId && model.foundation.interactions.some(entry => entry.id === view.interactionId)) { canvas.classList.add('ade-sequence'); return renderAdeInteractionSequence(canvas, model, view.interactionId, controls, select); }
	const sequence = getSequenceDiagram(model, view);
	canvas.classList.add('ade-sequence');
	const svg = canvas.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('aria-hidden', 'true');
	canvas.appendChild(svg);
	const centers = new Map(sequence.participants.map((element, index) => [element.id, 128 + index * 272]));
	const headers = sequence.participants.map(element => {
		const header = controls.button(canvas, element.name, () => select(element.id), `node:${element.id}`);
		header.classList.add('ade-node', 'ade-sequence-participant');
		header.dataset.elementId = element.id;
		context?.element(header, element.id);
		header.style.left = `${centers.get(element.id)! - 96}px`;
		header.style.top = '32px';
		header.style.width = '192px';
		header.setAttribute('aria-pressed', String(selectedId === element.id));
		header.setAttribute('aria-description', elementLabels[element.kind]);
		return header;
	});
	const headerHeight = Math.max(88, ...headers.map(header => header.offsetHeight));
	for (const header of headers) { header.style.height = `${headerHeight}px`; }
	let top = headerHeight + 80;
	for (const [index, relation] of sequence.messages.entries()) {
		const from = centers.get(relation.from)!;
		const to = centers.get(relation.to)!;
		const source = sequence.participants.find(element => element.id === relation.from)!;
		const target = sequence.participants.find(element => element.id === relation.to)!;
		const parts = [localize('ade.sequence.message', "{0}. {1} → {2}: {3} ({4})", index + 1, source.name, target.name, relation.name, relationLabels[relation.kind])];
		if (relation.condition) { parts.push(localize('ade.sequence.condition', "Condition: {0}", relation.condition)); }
		if (relation.errorCode) { parts.push(localize('ade.sequence.error', "Error: {0}", relation.errorCode)); }
		const label = controls.button(canvas, parts.join('\n'), () => context?.selectRelation ? context.selectRelation(relation.id) : select(source.id), `message:${relation.id}`);
		label.classList.add('ade-sequence-message');
		label.dataset.relationId = relation.id;
		label.setAttribute('aria-pressed', String(context?.selectedRelation === relation.id));
		context?.relation(label, relation.id);
		const labelWidth = Math.max(192, Math.abs(to - from) - 24);
		label.style.width = `${labelWidth}px`;
		label.style.left = `${(from + to) / 2 - labelWidth / 2}px`;
		label.style.top = `${top}px`;
		const y = top + label.offsetHeight + 12;
		const path = canvas.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
		const self = from === to;
		const endY = self ? y + 24 : y;
		const direction = self || to < from ? -1 : 1;
		path.dataset.relationId = relation.id;
		path.setAttribute('d', `${self ? `M ${from} ${y} L ${from + 48} ${y} L ${from + 48} ${endY} L ${to} ${endY}` : `M ${from} ${y} L ${to} ${endY}`} M ${to - direction * 10} ${endY - 5} L ${to} ${endY} L ${to - direction * 10} ${endY + 5}`);
		svg.appendChild(path);
		const hit = path.cloneNode() as SVGPathElement;
		hit.setAttribute('class', 'ade-connection-hit');
		svg.appendChild(hit);
		context?.relation(hit, relation.id);
		top = endY + 40;
	}
	const width = Math.max(256, sequence.participants.length * 272 - 16);
	const height = top + 32;
	for (const center of centers.values()) {
		const line = canvas.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
		line.classList.add('ade-sequence-lifeline');
		line.setAttribute('d', `M ${center} ${headerHeight + 32} L ${center} ${height - 16}`);
		svg.insertBefore(line, svg.firstChild);
	}
	svg.setAttribute('width', String(width));
	svg.setAttribute('height', String(height));
	return { width, height };
}
