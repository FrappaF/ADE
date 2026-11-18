/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DiagramBox, DiagramPoint } from '../../src/vs/workbench/contrib/ade/common/diagramRouting.ts';
import type { ModelView, SemanticElement, SemanticModel, SemanticRelation } from '../../src/vs/workbench/contrib/ade/common/modelTypes.ts';
import '../scripts/source-loader.mjs';
const { arrangeDiagram, diagramNodeWidth, diagramNodeHeight, notationBoundaries, notationGroupMembers, notationNodeSize } = await import('../../src/vs/workbench/contrib/ade/common/diagramLayout.ts');
const { routeDiagramConnections } = await import('../../src/vs/workbench/contrib/ade/common/diagramRouting.ts');
const { applyVisualEdit } = await import('../../src/vs/workbench/contrib/ade/common/visualEditing.ts');

test('group traversal preserves ownership/hosting closure, including cycles and hidden descendants', () => {
	for (const version of [3, 4, 5]) {
		const model = fixture(8); model.version = version;
		for (let i = 1; i < 8; i++) { model.semantics.elements[i].parentId = model.semantics.elements[i - 1].id; }
		model.foundation = { ownership: model.semantics.elements.slice(1).map(element => ({ elementId: element.id, ownerId: element.parentId, role: 'architecture' })) };
		model.semantics.relations = [{ id: 'cycle', kind: 'hosting', from: 'n07', to: 'n00' }, { id: 'excluded', kind: 'hosting', from: 'n00', to: 'outside' }];
		model.views[0].relationIds = ['cycle']; model.views[0].nodes = model.views[0].nodes.slice(0, 2);
		assert.deepEqual([...notationGroupMembers(model, model.views[0], 'n00')].sort(), model.semantics.elements.map(element => element.id));
	}
});

function fixture(count) {
	const elements = Array.from({ length: count }, (_, i) => ({ id: `n${String(i).padStart(2, '0')}`, kind: 'component', name: `Component ${i} with a long descriptive name` }));
	const relations = elements.slice(1, -1).map((element, i) => ({ id: `r${i}`, kind: 'dependency', from: elements[i].id, to: element.id, name: '' }));
	if (count > 4) { relations.push({ id: 'cycle', kind: 'dependency', from: elements[3].id, to: elements[1].id, name: '' }); }
	const view = { id: 'view', kind: 'structure', name: 'Structure', nodes: elements.map(element => ({ elementId: element.id, x: 0, y: 0 })), relationIds: relations.map(relation => relation.id) };
	return { version: 3, id: 'layout', name: 'Layout', semantics: { elements, relations }, views: [view, { ...structuredClone(view), id: 'other' }], codeMappings: [], verifications: [] };
}

for (const count of [5, 15, 30]) {
	test(`layout separates ${count} long-named nodes, including cycles and a disconnected component`, () => {
		const model = fixture(count), view = model.views[0];
		const positions = arrangeDiagram(model, view);
		assert.deepEqual(arrangeDiagram(model, view), positions);
		const boxes = positions.map(node => ({ ...node, width: diagramNodeWidth(model.semantics.elements.find(element => element.id === node.elementId).name) }));
		assert.ok(boxes.every((box, i) => boxes.slice(i + 1).every(other => box.x + box.width <= other.x || other.x + other.width <= box.x || box.y + diagramNodeHeight <= other.y || other.y + diagramNodeHeight <= box.y)));
		const updated = applyVisualEdit(model, { kind: 'layout', viewId: view.id });
		assert.deepEqual({ semantics: updated.semantics, other: updated.views[1] }, { semantics: model.semantics, other: model.views[1] });
	});
}

test('density increases spacing without changing semantic identities or node membership', () => {
	const model = fixture(8);
	const layouts = ['compact', 'balanced', 'spacious'].map(density => arrangeDiagram(model, model.views[0], density));
	const extents = layouts.map(nodes => Math.max(...nodes.map(node => node.x)) + Math.max(...nodes.map(node => node.y)));
	assert.ok(extents[0] < extents[1] && extents[1] < extents[2]);
	assert.deepEqual(layouts.map(nodes => nodes.map(node => node.elementId)), Array(3).fill(model.views[0].nodes.map(node => node.elementId)));
});

test('a large dependency cycle spreads over multiple rows and columns', () => {
	const model = fixture(17), view = model.views[0];
	model.semantics.relations = model.semantics.elements.map((element, i, elements) => ({ id: `cycle-${i}`, kind: 'dependency', from: element.id, to: elements[(i + 1) % elements.length].id, name: '' }));
	view.relationIds = model.semantics.relations.map(relation => relation.id);
	const nodes = arrangeDiagram(model, view);
	assert.ok(new Set(nodes.map(node => node.x)).size >= 4);
	assert.ok(new Set(nodes.map(node => node.y)).size >= 4);
});

test('a linear behavior flow wraps into readable bands instead of one long horizontal strip', () => {
	const model = fixture(7), view = model.views[0];
	model.semantics.relations = model.semantics.elements.slice(1).map((element, i) => ({ id: `flow-${i}`, kind: 'dependency', from: model.semantics.elements[i].id, to: element.id, name: '' }));
	view.relationIds = model.semantics.relations.map(item => item.id);
	const nodes = arrangeDiagram(model, view, 'balanced');
	assert.ok(Math.max(...nodes.map(node => node.x)) < 1500);
	assert.ok(Math.max(...nodes.map(node => node.y)) > 0);
	assert.deepEqual(model.semantics.elements.map(item => item.id), nodes.map(node => node.elementId));
});

test('arranging a deployment encloses nested hosts and separates unrelated hosts and shared artifacts', () => {
	const elements: SemanticElement[] = [
		...['web', 'api', 'data', 'runtime'].map(id => ({ id, kind: 'deploymentNode' as const, name: id })),
		...['bundle', 'server', 'database', 'shared'].map(id => ({ id, kind: 'artifact' as const, name: id })),
		{ id: 'application', kind: 'container', name: 'Application', parentId: 'data' }
	];
	const relations: SemanticRelation[] = [
		['web', 'bundle'], ['api', 'runtime'], ['runtime', 'server'], ['api', 'application'],
		['data', 'database'], ['web', 'shared'], ['data', 'shared']
	].map(([from, to]) => ({ id: `${from}-${to}`, name: 'Hosts', kind: 'hosting', from, to }));
	const view: ModelView = {
		id: 'deployment', kind: 'deployment', name: 'Deployment',
		nodes: elements.map(({ id }) => ({ elementId: id, x: 0, y: 0 })),
		relationIds: relations.map(relation => relation.id)
	};
	const model: SemanticModel = {
		version: 3, id: 'layout', name: 'Layout', semantics: { elements, relations }, views: [view], codeMappings: [], verifications: []
	};
	const byId = new Map(elements.map(element => [element.id, element]));
	const overlaps = (a: DiagramBox, b: DiagramBox) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
	const contains = (outer: DiagramBox, inner: DiagramBox) => outer.x < inner.x && outer.y < inner.y && inner.x + inner.width < outer.x + outer.width && inner.y + inner.height < outer.y + outer.height;
	for (const density of ['compact', 'balanced', 'spacious'] as const) {
		const updated = applyVisualEdit(model, { kind: 'layout', viewId: view.id, density });
		const arranged = updated.views[0];
		const boundaries = notationBoundaries(updated, arranged);
		const boxes = arranged.nodes.map(node => boundaries.find(boundary => boundary.elementId === node.elementId) ?? { ...node, ...notationNodeSize(byId.get(node.elementId)!) });
		const membership = Object.fromEntries(boundaries.map(boundary => [boundary.elementId, [...notationGroupMembers(updated, arranged, boundary.elementId)].sort()]));
		const conflicts = boundaries.flatMap(boundary => boxes.flatMap(box => {
			if (box.elementId === boundary.elementId || membership[box.elementId]?.includes(boundary.elementId)) { return []; }
			const valid = membership[boundary.elementId].includes(box.elementId) ? contains(boundary, box) : !overlaps(boundary, box);
			return valid ? [] : [[boundary.elementId, box.elementId]];
		}));
		assert.deepEqual({ membership, conflicts, relationIds: arranged.relationIds, semantics: updated.semantics }, {
			membership: { web: ['bundle', 'web'], api: ['api', 'application', 'runtime', 'server'], runtime: ['runtime', 'server'], data: ['data', 'database'] },
			conflicts: [], relationIds: view.relationIds, semantics: model.semantics
		});
	}
});

test('off-center flow connections meet the outlines of sized decision and end nodes', () => {
	const decision = { id: 'decision', x: 0, y: 0, outline: 'diamond' as const, ...notationNodeSize({ id: 'decision', kind: 'decision', name: 'Scorte disponibili?' }) };
	const end = { id: 'end', x: 360, y: 0, outline: 'ellipse' as const, ...notationNodeSize({ id: 'end', kind: 'end', name: 'Fine' }) };
	const routes = routeDiagramConnections([decision, end], [
		{ id: 'first', from: decision.id, to: end.id },
		{ id: 'second', from: decision.id, to: end.id }
	]);
	const normalizedOffset = (point: DiagramPoint, box: DiagramBox) => ({
		x: Math.abs(2 * (point.x - box.x) / box.width - 1),
		y: Math.abs(2 * (point.y - box.y) / box.height - 1)
	});
	for (const route of routes.values()) {
		assert.ok(route);
		const first = normalizedOffset(route[0], decision);
		const last = normalizedOffset(route[route.length - 1], end);
		assert.deepEqual([(first.x + first.y).toFixed(6), (last.x ** 2 + last.y ** 2).toFixed(6)], ['1.000000', '1.000000']);
	}
});
