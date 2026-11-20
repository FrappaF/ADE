import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import '../scripts/source-loader.mjs';
import { fixtureProfile } from './fixtures/dai-profile.mjs';
const { readSemanticModel, readSemanticDraft, validateSemanticModel, semanticModelV4Schema, SemanticModelService } = await import('../../src/vs/workbench/contrib/ordito/common/semanticModel.ts');
const { migrateSemanticModelToV4 } = await import('../../src/vs/workbench/contrib/ordito/common/modelMigration.ts');
const { getModelReadiness } = await import('../../src/vs/workbench/contrib/ordito/common/modelReadiness.ts');
const { decodeProviderKnowledge } = await import('../../src/vs/workbench/contrib/ordito/common/modelKnowledge.ts');
const { modelDigest, canonicalJson, serializeSemanticModel, hashSemanticModel } = await import('../../src/vs/workbench/contrib/ordito/common/modelSerialization.ts');
const { compileModelContext, assertModelContextCurrent, ModelContextBlockedError } = await import('../../src/vs/workbench/contrib/ordito/common/modelContext.ts');
const { applyVisualEdit } = await import('../../src/vs/workbench/contrib/ordito/common/visualEditing.ts');
const { createDiagramDrivenAdapter } = await import('../ai/diagramDriven.ts');
const run = promisify(execFile);
const json = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const base = await json('../examples/dai-foundation.ordito.json');
const corpus = await json('../benchmarks/corpus.v1.json');
const budgets = await json('../benchmarks/budgets.v1.json');
const request = { targetId: 'operation.confirm', profile: fixtureProfile, maxInputBytes: budgets.release.contextInputMaxBytes };
const sha = text => createHash('sha256').update(text).digest('hex');
const copy = () => structuredClone(base);
const codes = (model, target = 'operation.confirm') => getModelReadiness(model, target, fixtureProfile).diagnostics.map(item => item.code);
const stripMigration = model => {
	const { foundation, ...legacy } = structuredClone(model);
	legacy.version = foundation.migration.sourceVersion;
	for (const element of legacy.semantics.elements) {
		if (element.behavior) { delete element.behavior.id; for (const field of [...element.behavior.inputs, ...element.behavior.outputs]) { delete field.id; } }
		for (const member of element.details?.members ?? []) { delete member.id; }
	}
	return legacy;
};

test('v4 runtime, generated artifact and authored draft agree without changing the legacy schemas', async () => {
	assert.deepEqual(await json('../schema/model-v4.schema.json'), semanticModelV4Schema);
	assert.deepEqual(validateSemanticModel(base), []);
	const before = await Promise.all([2, 3, 4].map(version => readFile(new URL(`../schema/model-v${version}.schema.json`, import.meta.url), 'utf8')));
	await run(process.execPath, [new URL('../scripts/export-schema.mjs', import.meta.url).pathname]);
	assert.deepEqual(await Promise.all([2, 3, 4].map(version => readFile(new URL(`../schema/model-v${version}.schema.json`, import.meta.url), 'utf8'))), before);
});

test('frozen conservative-migration cases preserve every original value, and v4 re-entry allocates no identity', async () => {
	const fixture = corpus.cases.find(item => item.id === 'conservative-migration');
	for (const [index, path] of fixture.input.fixtures.entries()) {
		const source = await json('../../' + path); const before = structuredClone(source); let allocations = 0;
		const result = migrateSemanticModelToV4(source, () => `fresh:${++allocations}`);
		assert.deepEqual([source, stripMigration(result), result.foundation.occurrences, result.foundation.frames], [before, before, [], []]);
		assert.equal(source.version, fixture.input.sourceVersions[index]);
		assert.ok(allocations > 0);
		assert.deepEqual(migrateSemanticModelToV4(result, () => { throw new Error('Identity must be retained'); }), result);
		const checkedIn = await json(index ? '../examples/checkout-designed.v4.ordito.json' : '../examples/checkout.v4.ordito.json');
		assert.deepEqual(stripMigration(checkedIn), source);
		assert.deepEqual(result.foundation.interactions.map(item => item.legacyRelationOrder), source.views.filter(view => view.kind === 'sequence').map(view => view.relationIds));
	}
});

test('migration retains uncertain classification and never derives ownership, nullability, technology or provenance', async () => {
	const source = await json('../examples/checkout-designed.ordito.json');
	source.semantics.relations[0].classification = 'legacy-unclassified';
	source.semantics.elements[0].description = 'Manual annotation € · false/null are different';
	const component = source.semantics.elements.find(element => element.kind === 'controller');
	component.parentId = source.semantics.elements.find(element => element.kind === 'resource').id;
	component.details = { technology: '', environment: '', members: [{ name: 'optional', type: '', kind: 'attribute', required: false, key: 'none' }] };
	const result = migrateSemanticModelToV4(source);
	assert.deepEqual(stripMigration(result), source);
	assert.deepEqual([result.foundation.platform.bindings, result.foundation.assertions], [[], []]);
	assert.ok(validateSemanticModel(result).some(item => item.code === 'legacyClassification'));
	assert.ok(result.foundation.migration.unresolvedOwnershipIds.length);
	assert.throws(() => migrateSemanticModelToV4(source, () => source.semantics.elements[0].id), /fresh valid identity/);
});

test('both migration CLIs preserve v4 and never overwrite an existing output', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'ordito-v4-'));
	try {
		const input = join(directory, 'draft.json'); const output = join(directory, 'new.json');
		const text = serializeSemanticModel(base); await writeFile(input, text);
		const cli = new URL('../scripts/dai-model.mjs', import.meta.url).pathname;
		for (const args of [[new URL('../scripts/migrate-model.mjs', import.meta.url).pathname], [cli, 'migrate']]) {
			await run(process.execPath, [...args, input, output]);
			await assert.rejects(run(process.execPath, [...args, input, output]));
			assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), base);
			assert.equal(await readFile(input, 'utf8'), text);
			await rm(output);
		}
		const inspection = JSON.parse((await run(process.execPath, [cli, 'inspect', input, 'operation.confirm'])).stdout);
		assert.ok(inspection.diagnostics.some(item => item.code === 'profileMissing'));
	} finally { await rm(directory, { recursive: true, force: true }); }
});

test('canonical JSON preserves empty, null, false and array order, rejects silent JSON losses', () => {
	assert.equal(canonicalJson({ z: false, a: null, b: '', sequence: [2, 1] }), '{"a":null,"b":"","sequence":[2,1],"z":false}');
	for (const value of [{ value: undefined }, { value: Infinity }, { value: NaN }, { list: Array(2) }, new Date()]) { assert.throws(() => canonicalJson(value)); }
	assert.deepEqual(readSemanticModel(JSON.parse(serializeSemanticModel(base))), base);
});

test('renaming and editing shared fields preserve IDs, mappings, assertions and repeated occurrence references', async () => {
	let model = copy();
	model.foundation.occurrences = [{ id: 'call.1', operationId: 'operation.confirm', from: 'component.checkout', to: 'component.checkout' }, { id: 'call.2', operationId: 'operation.confirm', from: 'component.checkout', to: 'component.checkout' }];
	model.foundation.interactions = [{ id: 'interaction.checkout', ownerId: 'component.checkout', occurrenceIds: ['call.1', 'call.2'], frameIds: [] }];
	model.codeMappings = [{ id: 'mapping.confirm', elementId: 'component.checkout', file: 'src/confirm.ts', symbol: 'confirm', revision: 'source.1' }];
	const original = structuredClone(model);
	model = applyVisualEdit(model, { kind: 'rename', target: 'element', id: 'component.checkout', name: 'Finalizza' });
	const behavior = structuredClone(model.semantics.elements[3].behavior); behavior.inputs[0].name = 'correlationId';
	model = applyVisualEdit(model, { kind: 'behavior', id: 'component.checkout', behavior });
	assert.deepEqual([model.foundation, model.codeMappings, model.views], [original.foundation, original.codeMappings, original.views]);
	assert.equal(model.semantics.elements[3].behavior.inputs[0].id, 'field.requestId');
	assert.deepEqual(validateSemanticModel(model), []);
	assert.notEqual(await hashSemanticModel(model), await hashSemanticModel(original));
});

test('layout and visual grouping never alter semantic hashes, but legacy sequence order does', async () => {
	const moved = applyVisualEdit(base, { kind: 'position', viewId: 'view.checkout', id: 'component.checkout', x: 200, y: 100 });
	moved.views[0].name = 'Altro raggruppamento'; moved.views[0].featureId = 'feature.draft';
	assert.equal(await hashSemanticModel(moved), await hashSemanticModel(base));
	const legacy = await json('../examples/checkout-designed.ordito.json'); const model = migrateSemanticModelToV4(legacy);
	const sequence = model.views.find(view => view.kind === 'sequence');
	if (sequence && sequence.relationIds.length > 1) { const before = await hashSemanticModel(model); sequence.relationIds.reverse(); assert.notEqual(await hashSemanticModel(model), before); }
});

test('provider transport conventions preserve unknown, omitted, null, empty and false explicitly', () => {
	const policy = { nullMeans: 'unknown', unknownReason: 'No evidence' };
	const cases = [
		[{ state: 'known', value: false, reason: null }, { state: 'known', value: false }],
		[{ state: 'known', value: '', reason: null }, { state: 'known', value: '' }],
		[{ state: 'known', value: null, reason: null }, { state: 'known', value: null }],
		[{ state: 'unknown', value: null, reason: 'Missing' }, { state: 'unknown', reason: 'Missing' }],
		[{ state: 'omitted', value: null, reason: null }, { state: 'omitted' }]
	];
	for (const [wire, expected] of cases) { assert.deepEqual(decodeProviderKnowledge('codex', wire, policy), expected); assert.deepEqual(decodeProviderKnowledge('claude', expected, policy), expected); }
	assert.deepEqual([decodeProviderKnowledge('claude', undefined, policy), decodeProviderKnowledge('claude', null, policy), decodeProviderKnowledge('claude', false, policy), decodeProviderKnowledge('claude', '', policy), decodeProviderKnowledge('claude', null, { ...policy, nullMeans: 'known-null' })], [{ state: 'omitted' }, { state: 'unknown', reason: 'No evidence' }, { state: 'known', value: false }, { state: 'known', value: '' }, { state: 'known', value: null }]);
	for (const wire of [{ state: 'unknown', value: false, reason: 'Missing' }, { state: 'known', value: false }, { state: 'omitted', value: null, reason: 'Guess' }]) { assert.throws(() => decodeProviderKnowledge('codex', wire, policy)); }
});

test('provenance and acceptance never fabricate verification, which requires a named check and revision', () => {
	for (const kind of ['authored', 'extracted', 'inferred', 'observed']) {
		const model = copy(); const assertion = model.foundation.assertions[0]; assertion.provenance.kind = kind;
		assert.deepEqual(validateSemanticModel(model), []);
		assert.equal(assertion.verification, undefined);
		assertion.acceptance.status = 'proposed'; assert.ok(codes(model).includes('unacceptedAssertion'));
		assertion.verification = { checkId: 'check.1', revision: 'source.2', outcome: 'passed', evidence: 'reports/check.1.json' };
		assert.ok(codes(model).includes('unacceptedAssertion'));
		delete assertion.verification.checkId;
		assert.equal(getModelReadiness(model, 'operation.confirm', fixtureProfile).state, 'draft');
	}
});

test('stable field/operation IDs, occurrence ownership, cycles and feature membership are checked', () => {
	const mutations = [
		[model => { model.semantics.elements[3].behavior.outputs[0].id = 'field.requestId'; }, 'duplicateId'],
		[model => { model.foundation.ownership.push({ ...model.foundation.ownership[1], id: 'ownership.extra' }); }, 'ownership'],
		[model => { model.foundation.ownership[0].ownerId = 'component.checkout'; }, 'containmentCycle'],
		[model => { model.foundation.memberships[0].featureId = 'container.api'; }, 'ownership'],
		[model => { model.foundation.occurrences.push({ id: 'call.1', operationId: 'operation.confirm', from: 'component.checkout', to: 'container.api' }); }, 'ownership'],
		[model => { model.foundation.assertions.push({ ...structuredClone(model.foundation.assertions[0]), id: 'assertion.conflict', value: { state: 'known', value: true } }); }, 'assertionConflict']
	];
	for (const [mutate, code] of mutations) { const model = copy(); mutate(model); assert.ok(validateSemanticModel(model).some(item => item.code === code), code); }
});

test('generation maturity is target-specific, supports operation targets and leaves an independent draft intact', () => {
	assert.equal(getModelReadiness(base, 'operation.confirm', fixtureProfile).state, 'generationReady');
	assert.equal(getModelReadiness(base, 'feature.checkout', fixtureProfile).state, 'generationReady');
	assert.equal(getModelReadiness(base, 'feature.draft', fixtureProfile).state, 'structurallyValid');
	assert.equal(getModelReadiness(base, 'operation.confirm').state, 'structurallyValid');
	const model = copy(); model.semantics.elements[5].behavior = { id: 'operation.draft', inputs: [], outputs: [], preconditions: [], postconditions: [], errors: [], permissions: [{ actorId: 'missing.actor', capability: 'draft' }], acceptanceCriteria: [] };
	const report = getModelReadiness(model, 'operation.confirm', fixtureProfile);
	assert.equal(report.state, 'generationReady');
	assert.ok(report.projectDiagnostics.some(item => item.phase === 'reference'));
	assert.equal(getModelReadiness(model, 'operation.draft', fixtureProfile).state, 'draft');
});

const negativeAdapters = {
	'invalid-reference': (model, input) => { model.semantics.relations.push({ id: 'relation.invented', kind: 'dependency', name: '', ...input.relation }); return ['missingReference', 'missing-reference']; },
	'unknown-technology': model => { model.foundation.platform.bindings[0].technology = { state: 'unknown', reason: 'Missing stack' }; return ['unknownTechnology', 'required-technology-unknown']; },
	'undeclared-external': (model, input) => { model.semantics.elements.push({ id: input.requiredExternal, kind: 'system', name: 'Pagamenti', scope: 'external' }); model.semantics.relations.push({ id: 'relation.vendor', kind: 'dependency', from: input.target, to: input.requiredExternal, name: '' }); return ['undeclaredExternal', 'undeclared-external']; },
	'unsupported-type': (model, input) => { model.semantics.elements[3].behavior.inputs[0].type = input.requiredType; return ['unsupportedType', 'unsupported-type']; },
	'adr-conflict': (model, input) => { model.foundation.decisions = input.acceptedDecisions.map(item => ({ id: item.id, revision: 'fixture.1', status: 'accepted', scopeIds: [item.scope], constraints: [{ id: 'constraint.storage', subject: { kind: 'element', id: item.scope }, field: '/storage', value: { state: 'known', value: item.storage } }] })); return ['contradictoryDecisions', 'contradictory-decisions']; }
};
for (const [id, adapt] of Object.entries(negativeAdapters)) {
	test(`independent frozen corpus ${id} blocks its target and preserves the recoverable draft`, async () => {
		const fixture = corpus.cases.find(item => item.id === id); const model = copy();
		const [code, reason] = adapt(model, fixture.input); const original = structuredClone(model);
		const report = getModelReadiness(model, fixture.input.target, fixtureProfile);
		assert.notEqual(report.state, 'generationReady');
		const diagnostic = report.diagnostics.find(item => item.code === code);
		assert.ok(diagnostic?.field && diagnostic.action, JSON.stringify(report));
		assert.equal(reason, fixture.expected.reason);
		const adapter = createDiagramDrivenAdapter([fixtureProfile]);
		await assert.rejects(adapter.prepare(model, fixture.input.target, fixtureProfile.id, request.maxInputBytes), ModelContextBlockedError);
		const service = new SemanticModelService(model);
		service.renameElement('component.checkout', 'Bozza recuperabile');
		assert.deepEqual(readSemanticDraft(JSON.parse(serializeSemanticModel(service.getSnapshot()))), service.getSnapshot());
		assert.deepEqual(model, original);
	});
}

test('sealed packets resolve every included identity, preserve UTF-8 bytes and exclude the independent draft', async () => {
	const first = await compileModelContext(base, request); const second = await compileModelContext(copy(), request);
	const historical = await json('./fixtures/dai/dai-02-sealed-context.json');
	assert.equal(historical.seal, await modelDigest(historical.bytes));
	assert.equal(historical.byteLength, Buffer.byteLength(historical.bytes));
	assert.equal(JSON.parse(historical.bytes).grammar.schema.properties.version.const, 4);
	assert.deepEqual(first, second); assert.equal(first.seal, sha(first.bytes)); assert.equal(first.byteLength, Buffer.byteLength(first.bytes));
	const payload = JSON.parse(first.bytes);
	assert.deepEqual(payload.grammar.schema, semanticModelV4Schema);
	assert.equal(payload.model.views, undefined);
	assert.ok(!payload.model.semantics.elements.some(element => element.id === 'container.draft'));
	assert.deepEqual(payload.identities.map(entry => `${entry.kind}:${entry.id}`).sort(), [...new Set(payload.identities.map(entry => `${entry.kind}:${entry.id}`))].sort());
	assert.ok(payload.identities.some(entry => entry.kind === 'operation' && entry.id === 'operation.confirm'));
	assert.ok(payload.identities.some(entry => entry.kind === 'field' && entry.id === 'field.confirmed'));
	await compileModelContext(base, { ...request, maxInputBytes: first.byteLength });
	await assert.rejects(compileModelContext(base, { ...request, maxInputBytes: first.byteLength - 1 }), error => error.reason === 'inputBudget');
});

test('packet freshness accepts layout moves, rejects semantic/profile edits and rejects modified review bytes', async () => {
	const packet = await compileModelContext(base, request);
	const layout = applyVisualEdit(base, { kind: 'position', viewId: 'view.checkout', id: 'component.checkout', x: 200, y: 100 });
	await assertModelContextCurrent(packet, layout, request);
	const renamed = applyVisualEdit(base, { kind: 'rename', target: 'element', id: 'component.checkout', name: 'Differente' });
	await assert.rejects(assertModelContextCurrent(packet, renamed, request), /stale or modified/);
	await assert.rejects(assertModelContextCurrent({ ...packet, bytes: packet.bytes + ' ' }, base, request), /stale or modified/);
	await assert.rejects(assertModelContextCurrent(packet, base, { ...request, profile: { ...fixtureProfile, revision: 'fixture.2' } }), /stale or modified/);
	const adapter = createDiagramDrivenAdapter([]);
	await assert.rejects(adapter.prepare(base, 'operation.confirm', fixtureProfile.id, request.maxInputBytes), /Unknown generation profile/);
});

test('recursive types and required missing definitions close the packet or block before serialization', async () => {
	const model = copy(); model.semantics.elements[3].behavior.inputs[0].typeId = 'type.request';
	model.foundation.types = [{ id: 'type.request', name: 'Request', fields: [{ id: 'field.next', name: 'next', type: 'Request', typeId: 'type.request', required: false }] }];
	const packet = await compileModelContext(model, request);
	assert.ok(JSON.parse(packet.bytes).identities.some(item => item.kind === 'type' && item.id === 'type.request'));
	model.foundation.types = [];
	await assert.rejects(compileModelContext(model, request), ModelContextBlockedError);
});

test('v4 visual creation and ownership edits separate shared feature membership from architectural parents', async () => {
	let model = copy();
	model = applyVisualEdit(model, { kind: 'diagram', id: 'view.other', name: 'Altra prospettiva', featureId: 'feature.checkout', viewKind: 'structure' });
	model = applyVisualEdit(model, { kind: 'element', id: 'component.new', name: 'Responsabilità', elementKind: 'component', viewId: 'view.other' });
	assert.equal(model.semantics.elements.at(-1).parentId, undefined);
	assert.ok(model.foundation.memberships.some(entry => entry.elementId === 'component.new' && entry.featureId === 'feature.checkout'));
	model = applyVisualEdit(model, { kind: 'ownership', entry: { id: 'ownership.new', elementId: 'component.new', ownerId: 'container.api', role: 'architecture' } });
	model = applyVisualEdit(model, { kind: 'membership', entry: { id: 'membership.shared', elementId: 'component.new', featureId: 'feature.draft' }, included: true });
	assert.deepEqual(validateSemanticModel(model), []);
	const { getFeatureViews } = await import('../../src/vs/workbench/contrib/ordito/common/visualNavigation.ts');
	const { getModelImpact } = await import('../../src/vs/workbench/contrib/ordito/common/modelImpact.ts');
	assert.ok(getFeatureViews(model, model.semantics.elements.find(item => item.id === 'feature.draft')).some(view => view.id === 'view.other'));
	assert.ok(getModelImpact(model, 'feature.checkout').scope.some(item => item.id === 'component.new'));
	const withoutFeature = applyVisualEdit(model, { kind: 'deleteElement', id: 'feature.draft' });
	assert.ok(withoutFeature.semantics.elements.some(item => item.id === 'component.new'));
	assert.deepEqual(validateSemanticModel(withoutFeature), []);
	assert.throws(() => applyVisualEdit(model, { kind: 'parent', id: 'component.new', parentId: 'feature.draft' }), /separately/);
});

test('ownerless legacy sequence declarations remain visible to readiness and cannot certify generation', async () => {
	const source = await json('../examples/checkout.ordito.json');
	source.views.push({ id: 'legacy.sequence', kind: 'sequence', name: 'Declared Order', nodes: source.semantics.elements.map((element, index) => ({ elementId: element.id, x: index * 100, y: 0 })), relationIds: source.semantics.relations.filter(edge => edge.from === 'checkout-controller' || edge.to === 'checkout-controller').map(edge => edge.id) });
	const migrated = migrateSemanticModelToV4(source);
	const profile = { ...fixtureProfile, elementKinds: [...new Set(migrated.semantics.elements.map(item => item.kind))], primitiveTypes: [...new Set(migrated.semantics.elements.flatMap(item => [...(item.behavior?.inputs ?? []), ...(item.behavior?.outputs ?? [])].map(field => field.type)))], requiredOwnershipKinds: [], requiredTechnologyKinds: [] };
	assert.ok(getModelReadiness(migrated, 'checkout-controller', profile).diagnostics.some(item => item.code === 'incompleteBehavior'));
});

test('identity ambiguity blocks every affected read and equivalent fact property ordering never creates a conflict', () => {
	const duplicate = copy(); duplicate.foundation.ownership[2].id = duplicate.foundation.ownership[0].id;
	assert.equal(getModelReadiness(duplicate, 'operation.confirm', fixtureProfile).state, 'draft');
	const equivalent = copy(); const assertion = equivalent.foundation.assertions[0];
	equivalent.foundation.assertions.push({ ...structuredClone(assertion), id: 'assertion.equivalent', value: { value: false, state: 'known' } });
	assert.equal(getModelReadiness(equivalent, 'operation.confirm', fixtureProfile).state, 'generationReady');
});
