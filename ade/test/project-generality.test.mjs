/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import '../scripts/source-loader.mjs';
const { libraryModel, observatoryModel } = await import('../../src/vs/workbench/contrib/ade/test/common/independentProjects.ts');
const { readSemanticModel, validateSemanticModel } = await import('../../src/vs/workbench/contrib/ade/common/modelValidation.ts');

const { applyVisualEdit } = await import('../../src/vs/workbench/contrib/ade/common/visualEditing.ts');
const { getStateDiagram } = await import('../../src/vs/workbench/contrib/ade/common/stateDiagram.ts');
const { getSequenceDiagram } = await import('../../src/vs/workbench/contrib/ade/common/sequenceDiagram.ts');
const { getModelImpact, getElementEvidence } = await import('../../src/vs/workbench/contrib/ade/common/modelImpact.ts');
const { getSystemMap } = await import('../../src/vs/workbench/contrib/ade/common/systemMap.ts');
const { getDiagramGroups, normalizeDiagramContext } = await import('../../src/vs/workbench/contrib/ade/common/visualNavigation.ts');

test('independent library and observatory examples validate without demo data and preserve different project structures', async () => {
	for (const [file, model] of [['library', libraryModel], ['observatory', observatoryModel]]) {
		assert.deepEqual(JSON.parse(await readFile(new URL(`../examples/${file}.ade.json`, import.meta.url))), model);
		assert.deepEqual(validateSemanticModel(model), []);
		const map = getSystemMap(model);
		assert.deepEqual(map.branches.flatMap(branch => branch.members.map(member => member.element.id)).sort(), model.semantics.elements.map(element => element.id).sort());
		assert.deepEqual(map.connections.flatMap(connection => connection.relations.map(relation => relation.id)).sort(), model.semantics.relations.map(relation => relation.id).sort());
	}
	assert.deepEqual(getDiagramGroups(libraryModel).map(group => [group.name, group.views.map(view => view.id)]), [['Biblioteca civica', []], ['Prestiti', ['structure']], ['Catalogo', ['states', 'empty']]]);
	assert.deepEqual(normalizeDiagramContext(observatoryModel, { viewId: 'states', selections: { states: 'active' } }), { viewId: '', selections: {} });
});

test('shared resources, unplaced contracts, multiple lifecycles and dependency cycles work in independent domains', () => {
	for (const [source, expected] of [[libraryModel, ['worker', 'catalog-service', 'interface', 'agent']], [observatoryModel, ['scheduler', 'agent', 'worker']]]) {
		const before = structuredClone(source);
		let model = applyVisualEdit(source, { kind: 'stateDiagram', id: 'new-states', name: 'Ciclo indipendente', resourceId: 'resource', featureId: 'feature' });
		model = applyVisualEdit(model, { kind: 'stateLifecycle', viewId: 'new-states', resourceId: 'resource' });
		assert.deepEqual(getStateDiagram(model, model.views.at(-1)).groups[0].states.map(element => element.id), ['idle', 'active']);
		assert.deepEqual(getModelImpact(model, 'resource').dependents.map(entry => entry.element.id), expected);
		model = applyVisualEdit(model, { kind: 'diagram', id: 'new-sequence', name: 'Interazioni', featureId: 'feature', viewKind: 'sequence' });
		model = applyVisualEdit(model, { kind: 'sequenceMessage', viewId: 'new-sequence', id: 'request' });
		model = applyVisualEdit(model, { kind: 'exclude', viewId: 'new-states', id: 'idle', target: 'element' });
		model = readSemanticModel(JSON.parse(JSON.stringify(model)));
		assert.deepEqual({ semantics: model.semantics, sequence: getSequenceDiagram(model, model.views.at(-1)).messages.map(relation => relation.id), source }, { semantics: source.semantics, sequence: ['request'], source: before });
		const removed = applyVisualEdit(model, { kind: 'deleteElement', id: 'resource' });
		assert.deepEqual(validateSemanticModel(removed), []);
		assert.equal(removed.semantics.elements.some(element => ['resource', 'idle', 'active'].includes(element.id)), false);
		assert.ok(removed.semantics.elements.some(element => element.id === (source === libraryModel ? 'member' : 'isolated')));
	}
});

test('independent projects retain their own recorded evidence and criterion outcomes', () => {
	for (const source of [libraryModel, observatoryModel]) {
		const model = structuredClone(source);
		model.semantics.elements.find(element => element.id === 'worker').behavior = {
			inputs: [], outputs: [], preconditions: [], postconditions: [], errors: [], permissions: [],
			acceptanceCriteria: [{ id: 'criterion', given: 'Dati pronti', when: 'Richiesta', then: 'Dato registrato' }, { id: 'missing', given: 'Errore', when: 'Richiesta', then: 'Segnalazione' }]
		};
		model.codeMappings.push({ id: 'mapping', elementId: 'worker', file: `${model.id}/source.ts`, symbol: 'record', revision: 'fixture-a' });
		model.verifications.push(
			{ id: 'record-a', elementId: 'worker', criterionId: 'criterion', outcome: 'passed', evidence: 'Synthetic fixture A', revision: 'fixture-a' },
			{ id: 'record-b', elementId: 'worker', criterionId: 'criterion', outcome: 'failed', evidence: 'Synthetic fixture B', revision: 'fixture-b' });
		const evidence = getElementEvidence(readSemanticModel(JSON.parse(JSON.stringify(model))), 'worker');
		assert.deepEqual({ mappings: evidence.mappings, records: evidence.verifications, outcomes: evidence.outcomes, mixed: evidence.criteriaWithMixedOutcomes.map(criterion => criterion.id), missing: evidence.criteriaWithoutRecords.map(criterion => criterion.id) },
			{ mappings: model.codeMappings, records: model.verifications, outcomes: { passed: 1, failed: 1, unknown: 0 }, mixed: ['criterion'], missing: ['missing'] });
		assert.deepEqual(getElementEvidence(model, 'contract').verifications, []);
		assert.deepEqual([source.codeMappings, source.verifications], [[], []]);
	}
});

test('complete design operations start from empty systems with arbitrary names and identities', () => {
	for (const [index, name] of ['Laboratorio marino', 'Μετεωρολογία', 'Archivio <locale>'].entries()) {
		let model = { version: 3, id: `system-${index}`, name, semantics: { elements: [], relations: [] }, views: [], codeMappings: [], verifications: [] };
		model = applyVisualEdit(model, { kind: 'feature', id: 'hasOwnProperty', name: 'Acquisizione' });
		model = applyVisualEdit(model, { kind: 'diagram', id: 'constructor', name: 'Struttura', featureId: 'hasOwnProperty', viewKind: 'structure' });
		for (const [id, elementKind] of [['source', 'actor'], ['screen', 'view'], ['processor', 'controller'], ['record', 'resource']]) {
			model = applyVisualEdit(model, { kind: 'element', viewId: 'constructor', id, name: id, elementKind });
		}
		for (const [id, from, to, relationKind] of [['r1', 'source', 'screen', 'invocation'], ['r2', 'screen', 'processor', 'invocation'], ['r3', 'processor', 'record', 'write']]) {
			model = applyVisualEdit(model, { kind: 'relation', id, from, to, relationKind, name: id, viewId: 'constructor' });
		}
		model = applyVisualEdit(model, { kind: 'behavior', id: 'processor', behavior: { inputs: [{ name: 'sample', type: 'Measurement', required: true }], outputs: [], preconditions: ['Campione valido'], postconditions: [], errors: [], permissions: [], acceptanceCriteria: [] } });
		model = applyVisualEdit(model, { kind: 'stateDiagram', id: 'states', name: 'Stati', featureId: 'hasOwnProperty', resourceId: 'record' });
		for (const id of ['new', 'stored']) { model = applyVisualEdit(model, { kind: 'element', id, name: id, elementKind: 'state', parentId: 'record', viewId: 'states' }); }
		model = applyVisualEdit(model, { kind: 'relation', id: 'transition', from: 'new', to: 'stored', relationKind: 'transition', name: 'Registra', condition: 'Validato', viewId: 'states' });
		model = applyVisualEdit(model, { kind: 'diagram', id: 'sequence', name: 'Sequenza', featureId: 'hasOwnProperty', viewKind: 'sequence' });
		for (const id of ['r1', 'r2', 'r3']) { model = applyVisualEdit(model, { kind: 'sequenceMessage', viewId: 'sequence', id }); }
		model = applyVisualEdit(model, { kind: 'sequenceOrder', viewId: 'sequence', id: 'r3', target: 'message', direction: -1 });
		model = readSemanticModel(JSON.parse(JSON.stringify(model)));
		assert.deepEqual({ name: model.name, dependents: getModelImpact(model, 'record').dependents.map(entry => entry.element.id), messages: getSequenceDiagram(model, model.views.at(-1)).messages.map(relation => relation.id), selected: normalizeDiagramContext(model, { viewId: 'constructor', selections: {} }).selections.constructor },
			{ name, dependents: ['processor', 'screen', 'source'], messages: ['r1', 'r3', 'r2'], selected: 'source' });
	}
});

test('twenty-four generated graphs retain impact under ID replacement, order permutations and layout changes', () => {
	for (let seed = 0; seed < 24; seed++) {
		const count = 4 + seed;
		const elements = [{ id: 'constructor', kind: 'contract', name: 'Κοινό' }, { id: 'feature', kind: 'feature', name: 'Progetto' }, { id: 'isolate', kind: 'component', name: 'Κοινό' }];
		const relations = [];
		for (let index = 1; index <= count; index++) {
			elements.push({ id: `n:${index}`, kind: 'component', name: 'Κοινό', parentId: 'feature' });
			relations.push({ id: `r:${index}`, kind: 'dependency', from: `n:${index}`, to: index === 1 ? 'constructor' : `n:${index - 1}`, name: 'Riferimento' });
		}
		relations.push({ id: 'cycle', kind: 'dependency', from: 'constructor', to: `n:${count}`, name: 'Ciclo' });
		const model = readSemanticModel({ version: 3, id: `generated-${seed}`, name: `Grafo ${seed}`, semantics: { elements, relations }, views: [{ id: 'toString', kind: 'structure', name: 'Vista', featureId: 'feature', nodes: elements.map((element, index) => ({ elementId: element.id, x: index * 260, y: 0 })), relationIds: relations.map(relation => relation.id) }], codeMappings: [], verifications: [] });
		const renamed = structuredClone(model);
		for (const element of renamed.semantics.elements) { element.id = `e:${element.id}`; if (element.parentId) { element.parentId = `e:${element.parentId}`; } }
		for (const relation of renamed.semantics.relations) { relation.id = `r:${relation.id}`; relation.from = `e:${relation.from}`; relation.to = `e:${relation.to}`; }
		for (const view of renamed.views) { view.id = `v:${view.id}`; view.featureId = `e:${view.featureId}`; view.relationIds = view.relationIds.map(id => `r:${id}`); for (const node of view.nodes) { node.elementId = `e:${node.elementId}`; node.x = -node.x; node.y = seed * 40; } }
		renamed.semantics.elements.reverse();
		renamed.semantics.relations.reverse();
		assert.deepEqual(getModelImpact(readSemanticModel(renamed), 'e:constructor').dependents.map(entry => [entry.element.id.slice(2), entry.distance]), Array.from({ length: count }, (_, index) => [`n:${index + 1}`, index + 1]));
		assert.equal(getModelImpact(model, 'constructor').dependents.length, count);
	}
});
