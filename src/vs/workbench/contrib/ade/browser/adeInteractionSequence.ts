/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type SemanticModelV4 } from '../common/modelTypes.js';
import { type AdeControls } from './adeControls.js';
import { adeInteractionRows } from './adeInteractionContent.js';

/** Frames and operands follow the semantic hierarchy; measured text never changes execution order. */
export function renderAdeInteractionSequence(canvas: HTMLElement, model: SemanticModelV4, id: string, controls: AdeControls, select: (id: string) => void): { width: number; height: number } {
	const rows = adeInteractionRows(model, id), interaction = model.foundation.interactions.find(entry => entry.id === id)!;
	const calls = model.foundation.occurrences.filter(call => interaction.occurrenceIds.includes(call.id)), participants = [...new Set(calls.flatMap(call => [call.from, call.to]))];
	const width = Math.max(720, participants.length * 272), svg = canvas.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('aria-hidden', 'true'); canvas.appendChild(svg);
	const centers = new Map(participants.map((id, index) => [id, 136 + index * 272])); let top = 32;
	for (const id of participants) { const header = controls.button(canvas, model.semantics.elements.find(element => element.id === id)?.name ?? id, () => select(id), `participant:${id}`); header.classList.add('ade-node', 'ade-sequence-participant'); header.style.left = `${centers.get(id)! - 96}px`; header.style.top = '32px'; header.style.width = '192px'; top = Math.max(top, 48 + header.offsetHeight); }
	top += 40; const positions: { top: number; bottom: number }[] = [];
	for (const row of rows) {
		const label = controls.button(canvas, row.label, () => { const target = calls.find(call => call.id === row.id)?.to ?? interaction.ownerId ?? participants[0]; if (target) { select(target); } }, `interaction:${row.id}`); label.classList.add('ade-sequence-message'); label.dataset.interactionStepId = row.id; label.style.left = `${24 + row.depth * 20}px`; label.style.top = `${top}px`; label.style.width = `${width - 48 - row.depth * 40}px`; label.setAttribute('aria-label', row.text);
		const bottom = top + Math.max(32, label.offsetHeight); positions.push({ top, bottom }); top = bottom + 24;
		const call = calls.find(call => call.id === row.id);
		if (call) { const from = centers.get(call.from)!, to = centers.get(call.to)!, path = canvas.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path'); const y = top - 12; path.setAttribute('d', from === to ? `M ${from} ${y} h 48 v 8 h -48 m 8 -4 l -8 4 l 8 4` : `M ${from} ${y} H ${to} m ${to > from ? -8 : 8} -4 L ${to} ${y} l ${to > from ? -8 : 8} 4`); svg.appendChild(path); }
	}
	for (const [index, row] of rows.entries()) {
		if (['message', 'operand', 'invalid'].includes(row.kind)) { continue; }
		let end = index + 1; while (end < rows.length && rows[end].depth > row.depth) { end++; }
		const rect = canvas.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'rect'); rect.classList.add('ade-sequence-frame'); rect.dataset.frameId = row.id; rect.setAttribute('x', String(12 + row.depth * 20)); rect.setAttribute('y', String(positions[index].top - 8)); rect.setAttribute('width', String(width - 24 - row.depth * 40)); rect.setAttribute('height', String(positions[end - 1].bottom - positions[index].top + 24)); svg.insertBefore(rect, svg.firstChild);
	}
	svg.setAttribute('width', String(width)); svg.setAttribute('height', String(top + 24)); return { width, height: top + 24 };
}
