import { type SemanticModelV4 } from '../common/modelTypes.js';
import { type AdeControls } from './adeControls.js';
import { adeInteractionRows } from './adeInteractionContent.js';

/** Frames and operands follow the semantic hierarchy; measured text never changes execution order. */
export function renderAdeInteractionSequence(canvas: HTMLElement, model: SemanticModelV4, id: string, controls: AdeControls, select: (id: string) => void, selectedId?: string): { width: number; height: number } {
	const rows = adeInteractionRows(model, id), interaction = model.foundation.interactions.find(entry => entry.id === id)!;
	const calls = model.foundation.occurrences.filter(call => interaction.occurrenceIds.includes(call.id));
	const participants = [...new Set([...(interaction.description?.participantIds ?? []), ...calls.flatMap(call => [call.from, call.to])])];
	const centers = new Map(participants.map((id, index) => [id, 136 + index * 272]));
	const width = Math.max(720, participants.length * 272, ...calls.filter(call => call.from === call.to).map(call => centers.get(call.from)! + 224));
	const svg = canvas.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('aria-hidden', 'true'); canvas.appendChild(svg);
	const headers = participants.map(id => {
		const header = controls.button(canvas, model.semantics.elements.find(element => element.id === id)?.name ?? id, () => select(id), `participant:${id}`);
		header.classList.add('ade-node', 'ade-sequence-participant'); header.dataset.elementId = id;
		header.setAttribute('aria-pressed', String(selectedId === id));
		header.style.left = `${centers.get(id)! - 96}px`; header.style.top = '32px'; header.style.width = '192px';
		return header;
	});
	const headerHeight = Math.max(88, ...headers.map(header => header.offsetHeight));
	for (const header of headers) { header.style.height = `${headerHeight}px`; }
	let top = headerHeight + 80;
	const positions: { top: number; bottom: number }[] = [];
	for (const row of rows) {
		const call = calls.find(call => call.id === row.id);
		const frame = model.foundation.frames.find(frame => frame.id === row.id);
		const operand = model.foundation.frames.flatMap(frame => frame.kind === 'unspecified' && frame.description ? frame.description.operands : []).find(operand => operand.id === row.id);
		const text = call?.profile === 'descriptive' ? call.name ?? call.id : frame?.kind === 'unspecified' && frame.description ? frame.description.operator : operand ? `[${operand.condition.state === 'known' ? String(operand.condition.value) : '?'}]` : row.label;
		const label = controls.button(canvas, text, () => select(row.id), `interaction:${row.id}`);
		label.classList.add('ade-sequence-message'); label.dataset.interactionStepId = row.id; label.dataset.sequenceKind = row.kind;
		label.setAttribute('aria-pressed', String(selectedId === row.id));
		label.style.left = `${24 + row.depth * 20}px`; label.style.top = `${top}px`; label.style.width = `${width - 48 - row.depth * 40}px`; label.setAttribute('aria-label', row.text);
		if (frame || row.kind === 'operand') { label.style.maxWidth = label.style.width; label.style.width = 'max-content'; }
		if (frame) { label.classList.add('ade-sequence-frame-label'); }
		if (row.kind === 'operand') { label.classList.add('ade-sequence-operand'); }
		if (call) {
			const from = centers.get(call.from)!, to = centers.get(call.to)!;
			const labelWidth = from === to ? 192 : Math.max(192, Math.abs(to - from) - 24);
			label.style.width = `${labelWidth}px`; label.style.left = `${from === to ? from + 12 : (from + to) / 2 - labelWidth / 2}px`;
		}
		const rowTop = top;
		let bottom = top + Math.max(32, label.offsetHeight);
		if (call) {
			const from = centers.get(call.from)!, to = centers.get(call.to)!, path = canvas.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
			const y = bottom + 12, endY = from === to ? y + 24 : y, direction = from === to || to < from ? -1 : 1;
			path.dataset.occurrenceId = call.id;
			path.setAttribute('d', `${from === to ? `M ${from} ${y} h 48 v 24 H ${to}` : `M ${from} ${y} H ${to}`} M ${to - direction * 8} ${endY - 4} L ${to} ${endY} L ${to - direction * 8} ${endY + 4}`);
			svg.appendChild(path); bottom = endY;
		}
		positions.push({ top: rowTop, bottom }); top = bottom + 24;
	}
	const height = top + 24;
	for (const [id, center] of centers) {
		const line = canvas.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path'); line.classList.add('ade-sequence-lifeline'); line.dataset.elementId = id;
		line.setAttribute('d', `M ${center} ${32 + headerHeight} V ${height - 16}`); svg.insertBefore(line, svg.firstChild);
	}
	for (const [index, row] of rows.entries()) {
		if (['message', 'operand', 'invalid', 'unordered'].includes(row.kind)) { continue; }
		let end = index + 1; while (end < rows.length && rows[end].depth > row.depth) { end++; }
		const left = 12 + row.depth * 20, right = width - 12 - row.depth * 20;
		const rect = canvas.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'rect'); rect.classList.add('ade-sequence-frame'); rect.dataset.frameId = row.id;
		rect.setAttribute('x', String(left)); rect.setAttribute('y', String(positions[index].top - 8)); rect.setAttribute('width', String(right - left)); rect.setAttribute('height', String(positions[end - 1].bottom - positions[index].top + 24)); svg.insertBefore(rect, svg.firstChild);
		const operands = rows.slice(index + 1, end).map((operand, offset) => ({ operand, position: positions[index + 1 + offset] })).filter(({ operand }) => operand.kind === 'operand' && operand.depth === row.depth + 1);
		for (const { operand, position } of operands.slice(1)) {
			const separator = canvas.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path'); separator.classList.add('ade-sequence-operand-separator'); separator.dataset.operandId = operand.id;
			separator.setAttribute('d', `M ${left} ${position.top - 12} H ${right}`); svg.insertBefore(separator, svg.firstChild);
		}
	}
	svg.setAttribute('width', String(width)); svg.setAttribute('height', String(height)); return { width, height };
}
