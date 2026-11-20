import '../scripts/source-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { SystemAtlas, createSystemAtlasState, atlasTargetKey, getAtlasPage } = await import('../../src/vs/workbench/contrib/ade/common/systemAtlas.ts');
const { createAtlasFixture } = await import('../../src/vs/workbench/contrib/ade/test/common/systemAtlasFixture.ts');
const element = id => ({ type: 'element', id });
const area = id => ({ type: 'area', id: JSON.stringify([id]) });
const sorted = ids => [...ids].sort();

test('actor + area + feature are cumulative AND criteria; arrows and pages do not remove them', () => {
	const model = createAtlasFixture(), before = JSON.stringify(model), atlas = new SystemAtlas(model);
	let state = atlas.addFilter(createSystemAtlasState(), element('actor-0'));
	state = atlas.addFilter(state, area('area-0'));
	const filtered = atlas.project(state.filters);
	assert.deepEqual(sorted(filtered.featureIds), ['feature-0']);
	state = atlas.open(state, area('area-0'));
	state = atlas.addFilter(state, element('feature-0'));
	state = atlas.open(state, element('feature-0'));
	const projection = atlas.project(state.filters);
	assert.deepEqual({ level: state.level, filters: state.filters, internals: atlas.internalMembers('feature-0').filter(member => projection.elementIds.has(member.id)).length, actors: atlas.actors.filter(actor => projection.elementIds.has(actor.id)).map(actor => actor.id), shared: atlas.shared.filter(item => projection.elementIds.has(item.id)).length }, { level: 'feature', filters: [element('actor-0'), area('area-0'), element('feature-0')], internals: 20, actors: ['actor-0'], shared: 6 });
	assert.equal(JSON.stringify(model), before);
});

test('clicking an active object is idempotent; removal changes only that criterion', () => {
	const atlas = new SystemAtlas(createAtlasFixture());
	let state = createSystemAtlasState();
	for (const target of [element('actor-0'), area('area-0'), element('feature-0'), element('actor-0')]) { state = atlas.addFilter(state, target); }
	state = atlas.removeFilter(state, area('area-0'));
	assert.deepEqual(state.filters, [element('actor-0'), element('feature-0')]);
	state = atlas.removeFilter(state, element('actor-0'));
	assert.deepEqual({ filters: state.filters, actors: atlas.actors.filter(actor => atlas.project(state.filters).elementIds.has(actor.id)).length }, { filters: [element('feature-0')], actors: 4 });
});

test('intersections commute and do not let shared resources bridge unrelated features in the same area', () => {
	const atlas = new SystemAtlas(createAtlasFixture());
	const a = atlas.project([element('actor-0'), area('area-0')]), b = atlas.project([area('area-0'), element('actor-0')]);
	assert.deepEqual({ elements: sorted(a.elementIds), features: sorted(a.featureIds) }, { elements: sorted(b.elementIds), features: sorted(b.featureIds) });
	const empty = atlas.project([element('actor-0'), area('area-0'), element('feature-12')]);
	assert.deepEqual({ elements: [...empty.elementIds], features: [...empty.featureIds], relations: empty.relations }, { elements: [], features: [], relations: [] });
});

test('an internal or shared filter narrows the actor context and can be removed independently', () => {
	const atlas = new SystemAtlas(createAtlasFixture());
	const base = [element('actor-0'), area('area-0'), element('feature-0')];
	const internal = atlas.project([...base, element('element-0-0')]);
	const shared = atlas.project([...base, element('shared-0')]);
	assert.deepEqual({ internal: sorted([...internal.elementIds].filter(id => id.startsWith('element-'))), sharedInternals: sorted([...shared.elementIds].filter(id => id.startsWith('element-'))), sharedResources: sorted([...shared.elementIds].filter(id => id.startsWith('shared-'))), actor: shared.elementIds.has('actor-0') }, { internal: ['element-0-0', 'element-0-1'], sharedInternals: ['element-0-0'], sharedResources: ['shared-0'], actor: true });
	assert.equal(atlas.internalMembers('feature-0').filter(member => atlas.project(base).elementIds.has(member.id)).length, 20);
});

test('multiple actor criteria retain both anchors and only the feature context they share', () => {
	const atlas = new SystemAtlas(createAtlasFixture()), projection = atlas.project([element('actor-0'), element('actor-5')]);
	assert.deepEqual(atlas.actors.filter(actor => projection.elementIds.has(actor.id)).map(actor => actor.id), ['actor-0', 'actor-5']);
	assert.ok(projection.featureIds.has('feature-0'));
	assert.ok(!projection.featureIds.has('feature-1'));
});

test('version 4 uses ownership and memberships, including descendants and shared membership, without inventing areas', () => {
	const model = createAtlasFixture({ version: 4 });
	model.semantics.elements.push({ id: 'nested', kind: 'action', name: 'Nested', parentId: 'feature-12' });
	model.foundation.ownership.push({ id: 'owns-nested', ownerId: 'element-0-0', elementId: 'nested', role: 'architecture' });
	model.foundation.memberships.push({ id: 'shared-first', elementId: 'shared-0', featureId: 'feature-0' }, { id: 'shared-second', elementId: 'shared-0', featureId: 'feature-2' });
	const atlas = new SystemAtlas(model), projection = atlas.project([element('actor-0'), element('feature-0')]);
	assert.deepEqual({ areas: [...atlas.areas.values()].map(area => area.elementId), nested: projection.elementIds.has('nested'), staleParent: atlas.featureMembers.get('feature-12').has('nested'), shared: atlas.isShared('shared-0'), duplicateInternal: atlas.internalMembers('feature-0').some(item => item.id === 'shared-0') }, { areas: [undefined], nested: true, staleParent: false, shared: true, duplicateInternal: false });
});

test('restoration retains valid filters and navigation, removing only deleted identities', () => {
	const atlas = new SystemAtlas(createAtlasFixture());
	const restored = atlas.normalizeState({ ...createSystemAtlasState(), level: 'feature', areaId: 'stale', featureId: 'feature-0', filters: [element('actor-0'), area('area-0'), element('missing'), element('actor-0')] });
	assert.deepEqual({ level: restored.level, area: restored.areaId, filters: restored.filters }, { level: 'feature', area: JSON.stringify(['area-0']), filters: [element('actor-0'), area('area-0')] });
	const model = createAtlasFixture(); model.semantics.elements = model.semantics.elements.filter(element => element.id !== 'actor-0');
	assert.deepEqual(new SystemAtlas(model).normalizeState(restored).filters, [area('area-0')]);
});

test('global search reaches hidden and same-name objects, exact identities and empty feature diagrams', () => {
	const atlas = new SystemAtlas(createAtlasFixture({ features: 48 }));
	assert.deepEqual(atlas.search('Verifica disponibilita').slice(0, 2).map(result => result.id), ['feature-17', 'feature-29']);
	assert.equal(atlas.search('element-47-19')[0].id, 'element-47-19');
	assert.deepEqual([...atlas.featureViews.get('feature-47')], ['diagram-47']);
	const state = atlas.open(createSystemAtlasState(), element('element-47-19'));
	assert.deepEqual({ level: state.level, feature: state.featureId, page: state.centerPage }, { level: 'feature', feature: 'feature-47', page: 3 });
	assert.notEqual(atlasTargetKey(element('[null]')), atlasTargetKey({ type: 'area', id: '[null]' }));
});

test('unconnected actors and models without features stay honest and reachable', () => {
	const atlas = new SystemAtlas(createAtlasFixture({ features: 12, actors: 1000, areas: 0 }));
	assert.deepEqual({ actor: [...atlas.project([element('actor-999')]).elementIds], areas: [...atlas.project([element('actor-999')]).areaIds], firstArea: [...atlas.areas.values()][0].elementId }, { actor: ['actor-999'], areas: [], firstArea: undefined });
	const empty = new SystemAtlas(createAtlasFixture({ features: 0, areas: 0 }));
	assert.deepEqual({ areas: empty.areas.size, shared: empty.shared.length, actors: empty.actors.length }, { areas: 0, shared: 48, actors: 8 });
});

test('the 60,000-object hub preserves all 5,000 internal elements with bounded pages', () => {
	const atlas = new SystemAtlas(createAtlasFixture({ actors: 240, features: 2400, shared: 4800, hub: true }));
	const projection = atlas.project([element('actor-0'), area('area-0'), element('feature-0')]);
	const internals = atlas.internalMembers('feature-0').filter(member => projection.elementIds.has(member.id));
	assert.deepEqual({ objects: atlas.elements.size, internals: internals.length, page: getAtlasPage(internals, 833).items.map(element => element.id), invalidPage: getAtlasPage(internals, 999999).page, actors: atlas.actors.filter(actor => projection.elementIds.has(actor.id)).length, shared: atlas.shared.filter(item => projection.elementIds.has(item.id)).length }, { objects: 60432, internals: 5000, page: ['element-0-4998', 'element-0-4999'], invalidPage: 833, actors: 1, shared: 4800 });
});
