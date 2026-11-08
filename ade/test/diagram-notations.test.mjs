/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSemanticModel, validateSemanticModel, viewKinds, notationRules, InvalidSemanticModelError } from '../../src/vs/workbench/contrib/ade/common/semanticModel.ts';
import { applyVisualEdit } from '../../src/vs/workbench/contrib/ade/common/visualEditing.ts';
import { notationNodeSize, notationBoundaries, notationGroupMembers, arrangeDiagram } from '../../src/vs/workbench/contrib/ade/common/diagramLayout.ts';
import { notationAnalysis } from '../code-import/test/notation-fixture.mjs';

const analysis = notationAnalysis({ units: [['u0']] });
function model() {
	return readSemanticModel({ version: 3, id: 'notations', name: 'Task Architecture', semantics: {
		elements: [{ id: 'tasks', name: 'Tasks', kind: 'feature' }, ...analysis.concepts.map(item => ({ id: 'c:' + item.key, name: item.name, kind: item.kind, parentId: item.parent ?? 'tasks', ...(analysis.notation.elements.find(entry => entry.ref === 'c:' + item.key) ? { details: analysis.notation.elements.find(entry => entry.ref === 'c:' + item.key).details } : {}) }))],
		relations: analysis.relations.map(item => ({ id: item.key, from: item.from, to: item.to, name: item.name, kind: item.kind, ...(analysis.notation.relations.find(entry => entry.key === item.key) ? { details: analysis.notation.relations.find(entry => entry.key === item.key).details } : {}) }))
	}, views: [], codeMappings: [], verifications: [] });
}
for (const kind of Object.keys(notationRules)) {
	test(`${kind}: native creation, membership and serialization enforce notation roles`, () => {
		const plan = analysis.plan.find(item => item.kind === kind), base = model();
		let edited = applyVisualEdit(base, { kind: 'diagram', id: kind, name: plan.name, featureId: 'tasks', viewKind: kind });
		for (const id of plan.focus) { edited = applyVisualEdit(edited, { kind: 'include', id, viewId: kind }); }
		const compatible = base.semantics.relations.filter(item => plan.focus.includes(item.from) && plan.focus.includes(item.to) && notationRules[kind].relations.includes(item.kind));
		for (const edge of compatible) { edited = applyVisualEdit(edited, { kind: 'relation', viewId: kind, id: 'local-' + edge.id, from: edge.from, to: edge.to, relationKind: edge.kind, name: edge.name }); }
		assert.deepEqual(validateSemanticModel(JSON.parse(JSON.stringify(edited))), []);
		assert.throws(() => applyVisualEdit(edited, { kind: 'include', viewId: kind, id: 'c:done' }), /shape|semantic/i);
		assert.equal(base.views.length, 0, 'invalid or detached edits never mutate the input');
	});
}
test('all fifteen requested notations and the generic overview have distinct native types', () => {
	assert.deepEqual(new Set(analysis.plan.map(item => item.kind)), new Set(viewKinds));
});
test('table keys, types, nullability and FK endpoints survive shared edits and reject missing columns', () => {
	const base = model();
	const details = structuredClone(base.semantics.elements.find(item => item.id === 'c:tasks').details);
	details.members.push({ name: 'completed', type: 'BOOLEAN', kind: 'attribute', key: 'none', required: true });
	const changed = applyVisualEdit(base, { kind: 'elementDetails', id: 'c:tasks', details });
	assert.deepEqual(readSemanticModel(JSON.parse(JSON.stringify(changed))).semantics.elements.find(item => item.id === 'c:tasks').details, details);
	assert.throws(() => applyVisualEdit(changed, { kind: 'relationDetails', id: 'fk', details: { ...base.semantics.relations.find(item => item.id === 'fk').details, targetMember: 'missing' } }), error => error instanceof InvalidSemanticModelError && error.diagnostics.some(item => item.code === 'missingReference'));
	assert.throws(() => applyVisualEdit(changed, { kind: 'relationDetails', id: 'fk', details: { ...base.semantics.relations.find(item => item.id === 'fk').details, sourceMultiplicity: 'many maybe' } }), error => error instanceof InvalidSemanticModelError && error.diagnostics.some(item => item.code === 'shape'));
});
test('layout and native geometry reserve enough room for table and class compartments', () => {
	const document = model();
	const view = { id: 'schema', name: 'Schema', kind: 'databaseSchema', relationIds: ['fk'], nodes: [{ elementId: 'c:tasks', x: 0, y: 0 }, { elementId: 'c:users', x: 0, y: 0 }] };
	const positions = arrangeDiagram(document, view, 'compact');
	const boxes = positions.map(node => ({ ...node, ...notationNodeSize(document.semantics.elements.find(item => item.id === node.elementId)) }));
	assert.ok(boxes[0].height > 96 && boxes[0].x + boxes[0].width < boxes[1].x);
});

test('flowcharts support explicit decisions, guarded branches and start/end roles', () => {
	let document = applyVisualEdit(model(), { kind: 'diagram', id: 'flow', name: 'Completion Flow', featureId: 'tasks', viewKind: 'activity' });
	for (const [id, elementKind, name] of [['start', 'start', 'Start'], ['choice', 'decision', 'Already Complete?'], ['end', 'end', 'End']]) { document = applyVisualEdit(document, { kind: 'element', viewId: 'flow', id, elementKind, name }); }
	document = applyVisualEdit(document, { kind: 'relation', viewId: 'flow', id: 'begin', from: 'start', to: 'choice', relationKind: 'controlFlow', name: 'Check Status' });
	document = applyVisualEdit(document, { kind: 'relation', viewId: 'flow', id: 'finish-flow', from: 'choice', to: 'end', relationKind: 'controlFlow', name: 'Already Done', condition: 'completed = true' });
	assert.deepEqual(validateSemanticModel(document), []);
	assert.throws(() => applyVisualEdit(document, { kind: 'relation', viewId: 'flow', id: 'invalid-flow', from: 'end', to: 'start', relationKind: 'controlFlow', name: 'Invalid' }), InvalidSemanticModelError);
});

test('C4 and deployment boundaries include descendants and move the same declared group', () => {
	const document = model();
	const view = { id: 'containers', name: 'Containers', kind: 'c4Container', relationIds: ['http', 'sql'], nodes: ['c:person', 'c:system', 'c:api', 'c:db'].map((elementId, index) => ({ elementId, x: index * 400, y: 100 })) };
	const boundary = notationBoundaries(document, view).find(item => item.elementId === 'c:system');
	const members = notationGroupMembers(document, view, 'c:system');
	assert.ok(members.has('c:api') && members.has('c:db') && !members.has('c:person'));
	assert.ok(boundary.x < 800 && boundary.x + boundary.width > 1200);
});

test('class members support overloaded method signatures across OO languages', () => {
	const details = { technology: 'Java', environment: '', members: [
		{ name: 'find', type: '(long id): Task', kind: 'method', key: 'none', required: true },
		{ name: 'find', type: '(String title): Task', kind: 'method', key: 'none', required: true }
	] };
	const document = applyVisualEdit(model(), { kind: 'elementDetails', id: 'c:task-class', details });
	assert.equal(document.semantics.elements.find(item => item.id === 'c:task-class').details.members.length, 2);
	assert.throws(() => applyVisualEdit(document, { kind: 'elementDetails', id: 'c:task-class', details: { ...details, members: [...details.members, details.members[0]] } }), InvalidSemanticModelError);
});

test('architecture communication can return information to an external actor', () => {
	let document = applyVisualEdit(model(), { kind: 'diagram', id: 'context', name: 'Task Notifications', featureId: 'tasks', viewKind: 'c4Context' });
	for (const id of ['c:person', 'c:system']) { document = applyVisualEdit(document, { kind: 'include', viewId: 'context', id }); }
	document = applyVisualEdit(document, { kind: 'relation', viewId: 'context', id: 'notify', relationKind: 'communication', from: 'c:system', to: 'c:person', name: 'Sends task notifications' });
	assert.deepEqual(validateSemanticModel(document), []);
});
