/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { projectDescriptiveActivity } from './descriptiveActivity.js';
import { notationRelationLabel } from './modelNotation.js';
import { scenarioUnorderedOccurrences } from './modelScenario.js';
import { type ModelView, type SemanticModelV4 } from './modelTypes.js';
import { arrangeDiagram, notationLines, notationBoundaries, notationGroupMembers, notationNodeSize, wrapDiagramText } from './diagramLayout.js';
import { describeModelInteraction } from './modelInteractions.js';
import { routeDiagramConnections, placeConnectionLabel, type DiagramBox } from './diagramRouting.js';

/** A conservative local layout: ownership groups occupy separate bands, unrelated views are untouched. */
export function arrangeExplorationView(model: SemanticModelV4, view: ModelView): ModelView['nodes'] {
	const nodes = arrangeDiagram(model, view), boundaries = notationBoundaries(model, { ...view, nodes });
	if (!boundaries.length) { return nodes; }
	const assigned = new Set<string>(); let x = 0;
	const ordered = [...boundaries].sort((a, b) => notationGroupMembers(model, view, b.elementId).size - notationGroupMembers(model, view, a.elementId).size);
	for (const boundary of ordered) {
		if (assigned.has(boundary.elementId)) { continue; }
		const members = notationGroupMembers(model, view, boundary.elementId), group = nodes.filter(node => members.has(node.elementId));
		const shift = x - Math.min(...group.map(node => node.x));
		for (const node of group) { node.x += shift; assigned.add(node.elementId); }
		x = Math.max(...group.map(node => node.x + notationNodeSize(model.semantics.elements.find(element => element.id === node.elementId)!).width)) + 160;
	}
	for (const node of nodes.filter(node => !assigned.has(node.elementId))) { node.x = x; x += notationNodeSize(model.semantics.elements.find(element => element.id === node.elementId)!).width + 160; }
	return nodes;
}
export interface DiagramQualityDiagnostic { level: 'integrity' | 'domain' | 'fidelity' | 'readability'; code: string; objectId: string; severity: 'error' | 'warning' }
/** Geometry and evidence warnings remain distinct from shape/domain checks. */
export function inspectDiagramQuality(model: SemanticModelV4, view: ModelView): DiagramQualityDiagnostic[] {
	if (view.kind === 'activity' && view.interactionId) {
		const projection = projectDescriptiveActivity(model, view.interactionId), diagnostics: DiagramQualityDiagnostic[] = projection.unordered ? [{ level: 'fidelity', code: 'partialOrderOnly', objectId: view.interactionId, severity: 'warning' }] : [];
		for (const edge of projection.edges) { if (edge.basis === 'inferred') { diagnostics.push({ level: 'fidelity', code: 'inferredOrder', objectId: edge.after, severity: 'warning' }); } }
		return diagnostics;
	}
	const diagnostics: DiagramQualityDiagnostic[] = [], boundaries = notationBoundaries(model, view), boundaryIds = new Set(boundaries.map(boundary => boundary.elementId));
	const boxes = view.nodes.filter(node => !boundaryIds.has(node.elementId)).map(node => ({ ...node, ...notationNodeSize(model.semantics.elements.find(element => element.id === node.elementId)!) }));
	const overlaps = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
	if (view.kind !== 'sequence') {
		for (const [index, box] of boxes.entries()) { for (const other of boxes.slice(index + 1)) { if (overlaps(box, other)) { diagnostics.push({ level: 'readability', code: 'nodeOverlap', objectId: box.elementId, severity: 'warning' }); } } }
		for (const boundary of boundaries) {
			const members = notationGroupMembers(model, view, boundary.elementId);
			for (const box of boxes.filter(box => !members.has(box.elementId))) { if (overlaps(boundary, box)) { diagnostics.push({ level: 'readability', code: 'foreignElementInsideBoundary', objectId: box.elementId, severity: 'error' }); } }
		}
		const routingBoxes = view.nodes.map(node => {
			const boundary = boundaries.find(boundary => boundary.elementId === node.elementId);
			return { id: node.elementId, ...notationNodeSize(model.semantics.elements.find(element => element.id === node.elementId)!), ...(boundary ? { x: boundary.x + 12, y: boundary.y + 6, height: 32 } : { x: node.x, y: node.y }) };
		});
		const relations = model.semantics.relations.filter(relation => view.relationIds.includes(relation.id)), routes = routeDiagramConnections(routingBoxes, relations);
		for (const relation of relations) { if (!routes.get(relation.id)?.length) { diagnostics.push({ level: 'readability', code: 'unroutableRelation', objectId: relation.id, severity: 'error' }); } }
	}
	const scenario = model.foundation.interactions.find(entry => entry.id === view.interactionId);
	if (scenario?.profile === 'descriptive') {
		if (scenarioUnorderedOccurrences(model, scenario.id).size > 0) { diagnostics.push({ level: 'fidelity', code: 'partialOrderOnly', objectId: scenario.id, severity: 'warning' }); }
		for (const edge of scenario.description?.order ?? []) { if (edge.basis === 'inferred') { diagnostics.push({ level: 'fidelity', code: 'inferredOrder', objectId: edge.after, severity: 'warning' }); } }
	}
	return diagnostics;
}
const escape = (value: string): string => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
/** A standalone deterministic preview uses the same model and dimensions as the canvas. */
export function renderDiagramPreview(model: SemanticModelV4, view: ModelView): string {
	const elements = new Map(model.semantics.elements.map(element => [element.id, element]));
	const text = (x: number, y: number, value: string) => `<text x="${x}" y="${y}">${escape(value)}</text>`;
	const box = (x: number, y: number, width: number, height: number, label: string, boundary = false, details: string[] = []) => {
		const columns = Math.max(1, Math.floor((width - 32) / 8)), lines = [label, ...details].flatMap(line => wrapDiagramText(line, columns));
		return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="6" fill="${boundary ? '#f3f6fa' : '#ffffff'}" stroke="#53657b"/>` + lines.map((line, index) => text(x + 12, y + 24 + index * 22, line)).join('');
	};
	const scenario = model.foundation.interactions.find(entry => entry.id === view.interactionId);
	let body = '', width = 800, height = 200;
	if (scenario?.profile === 'descriptive' && view.kind === 'activity') {
		const projection = projectDescriptiveActivity(model, scenario.id); width = projection.width; height = projection.height;
		for (const group of projection.groups) {
			body += `<rect x="${group.x}" y="${group.y}" width="${group.width}" height="${group.height}" fill="none" stroke="#53657b"/>` + text(group.x + 12, group.y + 20, group.operator);
			for (const operand of group.operands) { const label = operand.condition.state === 'known' ? String(operand.condition.value) : '?', columns = Math.max(1, Math.floor((operand.width - 32) / 8)); for (const [index, line] of wrapDiagramText(label, columns).entries()) { body += text(operand.x + 12, operand.y + 20 + index * 22, line); } }
		}
		for (const edge of projection.edges) {
			const from = projection.nodes.find(node => node.occurrenceId === edge.before)!, to = projection.nodes.find(node => node.occurrenceId === edge.after)!;
			body += `<path d="M ${from.x + from.width / 2} ${from.y + from.height} L ${to.x + to.width / 2} ${to.y}" stroke="#53657b" ${edge.basis === 'inferred' ? 'stroke-dasharray="6 4"' : ''} marker-end="url(#arrow)"/>`;
		}
		for (const node of projection.nodes) { body += box(node.x, node.y, node.width, node.height, node.name, false, [node.endpoints]); }
	} else if (scenario?.profile === 'descriptive') {
		const participants = scenario.description!.participantIds, centers = new Map(participants.map((id, index) => [id, 170 + index * 300]));
		width = Math.max(width, participants.length * 300 + 40); let y = 140;
		const rows = describeModelInteraction(model, scenario.id), positions: { top: number; bottom: number }[] = [], unordered = scenarioUnorderedOccurrences(model, scenario.id);
		const framed = rows.some(row => ['alt', 'opt', 'par', 'loop'].includes(row.kind));
		for (const id of participants) { body += box(centers.get(id)! - 130, 32, 260, 64, elements.get(id)!.name); }
		for (const row of rows) {
			const top = y - 20;
			const call = model.foundation.occurrences.find(call => call.id === row.id);
			if (call) {
				const from = centers.get(call.from)!, to = centers.get(call.to)!;
				const conditions = framed ? [] : model.foundation.frames.flatMap(frame => scenario.frameIds.includes(frame.id) && frame.kind === 'unspecified' && frame.description ? frame.description.operands.filter(operand => operand.steps.includes(call.id)).map(operand => operand.condition.state === 'known' ? String(operand.condition.value) : '?') : []);
				const label = (call.name ?? call.id) + (conditions.length ? ' [' + conditions.join(' | ') + ']' : '') + (unordered.has(call.id) ? ' [?]' : '');
				const columns = Math.max(24, Math.floor((Math.max(260, Math.abs(to - from)) - 16) / 8)), lines = wrapDiagramText(label, columns), lineY = y + lines.length * 20;
				body += `<path d="${from === to ? `M ${from} ${lineY} h 48 v 16 h -48` : `M ${from} ${lineY} H ${to}`}" fill="none" stroke="#53657b" marker-end="url(#arrow)"/>`;
				for (const [index, line] of lines.entries()) { body += text(Math.min(from, to) + 8, y + index * 20, line); }
				y = lineY + 40;
			} else {
				const label = row.kind === 'unordered' ? '[?]' : row.kind === 'operand' ? `[${row.text}]` : row.text;
				for (const line of wrapDiagramText(label, Math.floor((width - 112) / 8))) { body += text(32 + row.depth * 20, y, line); y += 22; }
				y += 18;
			}
			positions.push({ top, bottom: y - 16 });
		}
		let frames = '';
		for (const [index, row] of rows.entries()) {
			if (!['alt', 'opt', 'par', 'loop'].includes(row.kind)) { continue; }
			let end = index + 1; while (end < rows.length && rows[end].depth > row.depth) { end++; }
			const top = positions[index].top, bottom = positions[end - 1].bottom + 16;
			frames += `<rect x="24" y="${top}" width="${width - 48}" height="${bottom - top}" fill="none" stroke="#53657b"/>`;
			let first = true;
			for (let operand = index + 1; operand < end; operand++) {
				if (rows[operand].kind !== 'operand') { continue; }
				if (!first) { frames += `<path d="M 24 ${positions[operand].top} H ${width - 24}" fill="none" stroke="#53657b" stroke-dasharray="6 4"/>`; } first = false;
			}
		}
		body = frames + body;
		height = y + 40;
		for (const center of centers.values()) { body = `<path d="M ${center} 96 V ${height - 24}" fill="none" stroke="#53657b" stroke-dasharray="5 5"/>` + body; }
	} else {
		const boundaries = notationBoundaries(model, view), boundaryIds = new Set(boundaries.map(boundary => boundary.elementId));
		const nodes = view.nodes.map(node => ({ ...node, ...notationNodeSize(elements.get(node.elementId)!) }));
		const minX = Math.min(0, ...nodes.map(node => node.x), ...boundaries.map(boundary => boundary.x)) - 32, minY = Math.min(0, ...nodes.map(node => node.y), ...boundaries.map(boundary => boundary.y)) - 32;
		width = Math.max(width, ...nodes.map(node => node.x + node.width - minX + 32)); height = Math.max(height, ...nodes.map(node => node.y + node.height - minY + 32));
		for (const boundary of boundaries) { body += box(boundary.x - minX, boundary.y - minY, boundary.width, boundary.height, boundary.name, true); }
		const boxes = nodes.map(node => {
			const boundary = boundaries.find(boundary => boundary.elementId === node.elementId);
			return { id: node.elementId, ...node, x: (boundary ? boundary.x + 12 : node.x) - minX, y: (boundary ? boundary.y + 6 : node.y) - minY, ...(boundary ? { height: 32 } : {}) };
		});
		const relations = model.semantics.relations.filter(relation => view.relationIds.includes(relation.id)), routes = routeDiagramConnections(boxes, relations), occupied: DiagramBox[] = [...boxes];
		let captions = '';
		for (const relation of relations) {
			const route = routes.get(relation.id);
			if (!route?.length) { continue; }
			body += `<path data-relation-id="${escape(relation.id)}" d="${route.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')}" fill="none" stroke="#53657b" marker-end="url(#arrow)"/>`;
			const label = [relation.kind, notationRelationLabel(relation), relation.condition ? `[${relation.condition}]` : '', relation.errorCode].filter(Boolean).join(' · ');
			const placement = placeConnectionLabel(route, label.length * 8 + 16, occupied), bounds = placement.box; occupied.push(bounds);
			width = Math.max(width, bounds.x + bounds.width + 32, ...route.map(point => point.x + 32)); height = Math.max(height, bounds.y + bounds.height + 32, ...route.map(point => point.y + 32));
			if (placement.detached) { captions += `<path d="M ${placement.anchor.x} ${placement.anchor.y} L ${bounds.x + bounds.width / 2} ${bounds.y + bounds.height / 2}" fill="none" stroke="#53657b" stroke-dasharray="3 3"/>`; }
			captions += `<rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="#ffffff"/>` + text(bounds.x + 6, bounds.y + 15, label);
		}
		for (const node of nodes.filter(node => !boundaryIds.has(node.elementId))) { body += box(node.x - minX, node.y - minY, node.width, node.height, elements.get(node.elementId)!.name, false, notationLines(elements.get(node.elementId)!)); }
		body += captions;
	}
	return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escape(view.name)}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>${escape(view.name)}</title><defs><marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#53657b"/></marker></defs><rect width="100%" height="100%" fill="#ffffff"/><g font-family="sans-serif" font-size="14" fill="#17283b">${body}</g></svg>`;
}
