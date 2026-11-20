import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import '../scripts/source-loader.mjs';
const { checkoutModel } = await import('../../src/vs/workbench/contrib/ade/common/checkoutModel.ts');
const { semanticModelSchema } = await import('../../src/vs/workbench/contrib/ade/common/modelSchema.ts');
const { validateSemanticModel, readSemanticModel, InvalidSemanticModelError } = await import('../../src/vs/workbench/contrib/ade/common/modelValidation.ts');
const { migrateSemanticModel } = await import('../../src/vs/workbench/contrib/ade/common/modelLegacyMigration.ts');
const { SemanticModelService } = await import('../../src/vs/workbench/contrib/ade/common/semanticModelService.ts');
const { migrateSemanticModelToV4, migrateSemanticModelToV5 } = await import('../../src/vs/workbench/contrib/ade/common/modelMigration.ts');

const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const codes = model => validateSemanticModel(model).map(({ code }) => code);
const run = promisify(execFile);

test('current semantic formats pass through migration without legacy interpretation or mutation', () => {
	for (const model of [migrateSemanticModelToV4(checkoutModel), migrateSemanticModelToV5(checkoutModel)]) {
		const original = JSON.stringify(model);
		const migrated = migrateSemanticModel(model);
		assert.deepEqual(migrated, { model, diagnostics: [] });
		assert.notEqual(migrated.model, model);
		assert.equal(JSON.stringify(model), original);
	}
	assert.throws(() => migrateSemanticModel({ version: 5, semantics: null }), InvalidSemanticModelError);
});

test('published schema and checkout example stay identical to their runtime sources', async () => {
	assert.deepEqual(await Promise.all([
		readJson('../schema/model-v2.schema.json'), readJson('../examples/checkout.ade.json')
	]), [semanticModelSchema, checkoutModel]);
	assert.deepEqual(validateSemanticModel(checkoutModel), []);
});

test('rename, containment move, layout move and serialization preserve identity and references', () => {
	const service = new SemanticModelService(checkoutModel);
	service.renameElement('checkout-controller', 'Completa acquisto');
	service.moveElement('checkout-controller', 'gateway');
	service.setPosition('purchase-structure', 'checkout-controller', -24, 500);
	const result = readSemanticModel(JSON.parse(JSON.stringify(service.getSnapshot())));
	assert.deepEqual({
		element: result.semantics.elements.find(element => element.id === 'checkout-controller'),
		relations: result.semantics.relations,
		position: result.views[0].nodes.find(node => node.elementId === 'checkout-controller')
	}, {
		element: { ...checkoutModel.semantics.elements[3], name: 'Completa acquisto', parentId: 'gateway' },
		relations: checkoutModel.semantics.relations,
		position: { elementId: 'checkout-controller', x: -24, y: 500 }
	});
});

test('invalid edits are atomic, detached snapshots cannot mutate service state', () => {
	const service = new SemanticModelService(checkoutModel);
	assert.throws(() => service.moveElement('purchase', 'checkout-controller'), InvalidSemanticModelError);
	assert.throws(() => service.renameElement('customer', '  '), InvalidSemanticModelError);
	assert.throws(() => service.setPosition('missing', 'customer', 1, 1), InvalidSemanticModelError);
	const snapshot = service.getSnapshot();
	snapshot.semantics.elements[0].name = 'mutated';
	const element = service.getElement('customer');
	element.name = 'mutated';
	assert.deepEqual(service.getSnapshot(), checkoutModel);
});

test('model revisions advance only after a snapshot is successfully replaced', () => {
	const service = new SemanticModelService(checkoutModel);
	const revisions = [service.revision];
	service.getSnapshot(); revisions.push(service.revision);
	service.renameElement('checkout-controller', 'Confirm Order'); revisions.push(service.revision);
	assert.throws(() => service.renameElement('customer', '  '), InvalidSemanticModelError); revisions.push(service.revision);
	service.replace(checkoutModel); revisions.push(service.revision);
	assert.deepEqual(revisions, [0, 0, 1, 1, 2]);
});

test('layout updates do not alter domain, code mappings or verification evidence', () => {
	const service = new SemanticModelService(checkoutModel);
	service.setPosition('purchase-structure', 'checkout', 999, 250);
	const { views: before, ...domainBefore } = checkoutModel;
	const { views: after, ...domainAfter } = service.getSnapshot();
	assert.deepEqual(domainAfter, domainBefore);
	assert.notDeepEqual(before, after);
});

test('missing endpoints and incompatible relationships yield useful paths and codes', () => {
	const model = structuredClone(checkoutModel);
	model.semantics.relations = [
		{ id: 'bad-read', kind: 'read', from: 'customer', to: 'order', name: '' },
		{ id: 'dangling', kind: 'dependency', from: 'missing', to: 'order', name: '' }
	];
	model.views = [];
	assert.deepEqual(validateSemanticModel(model), [
		{ code: 'incompatibleRelation', severity: 'error', path: '/semantics/relations/0', args: ['read', 'actor', 'resource'] },
		{ code: 'missingReference', severity: 'error', path: '/semantics/relations/1/from', args: ['missing'] }
	]);
});

test('checks duplicate IDs, cycles, actors, error codes, view references and state ownership', () => {
	const model = structuredClone(checkoutModel);
	model.semantics.elements[0].parentId = 'checkout-controller';
	model.semantics.elements[3].behavior.permissions[0].actorId = 'order';
	model.semantics.elements.push(structuredClone(model.semantics.elements[1]));
	model.semantics.relations[11].errorCode = 'unknown';
	model.semantics.elements.find(element => element.id === 'declined').parentId = 'cart';
	model.views[0].nodes = model.views[0].nodes.filter(node => node.elementId !== 'customer');
	model.views[0].relationIds.push('missing');
	assert.deepEqual([...new Set(codes(model))].sort(), ['containmentCycle', 'duplicateId', 'incompatibleRelation', 'invalidParent', 'missingError', 'missingReference', 'viewEndpoint']);
});

test('implementation evidence and verification remain separate from design intent', () => {
	const model = structuredClone(checkoutModel);
	model.codeMappings.push({ id: 'mapping', elementId: 'checkout-controller', file: 'src/checkout.ts', symbol: 'confirm', revision: 'abc123' });
	model.verifications.push({ id: 'verification', elementId: 'checkout-controller', criterionId: 'purchase-declined', outcome: 'failed', evidence: 'test-results/checkout.json', revision: 'abc123' });
	assert.deepEqual(validateSemanticModel(model), []);
	model.verifications[0].criterionId = 'missing';
	assert.deepEqual(codes(model), ['missingCriterion']);
});

test('malformed and future documents never crash validation or get silently normalized', () => {
	for (const value of [null, [], '', { version: 99 }, { ...checkoutModel, views: null }, { ...checkoutModel, unknown: true }]) {
		assert.ok(codes(value).includes('shape'));
		assert.throws(() => readSemanticModel(value), InvalidSemanticModelError);
	}
	const model = structuredClone(checkoutModel);
	model.views[0].nodes[0].x = Infinity;
	assert.deepEqual(codes(model), ['shape']);
});

test('legacy migration preserves IDs, labels and edges and reports uncertain classification', async () => {
	const legacy = await readJson('../prototype/examples/checkout.diagram.json');
	const result = migrateSemanticModel(legacy, 'checkout');
	assert.deepEqual(result.model, await readJson('../examples/checkout.migrated.ade.json'));
	assert.deepEqual(result.model.semantics.elements.map(element => element.id), legacy.nodes.map(node => node.id));
	assert.equal(result.diagnostics.filter(diagnostic => diagnostic.code === 'legacyClassification').length, legacy.edges.length);
	assert.deepEqual(migrateSemanticModel(result.model), result);
	assert.equal(legacy.version, 1);
	assert.throws(() => migrateSemanticModel({ ...legacy, nodes: [legacy.nodes[0], legacy.nodes[0]] }), InvalidSemanticModelError);
});

test('every checked-in invalid example is rejected with its documented diagnostic', async () => {
	for (const file of await readdir(new URL('../examples/invalid/', import.meta.url))) {
		if (!file.endsWith('.json')) { continue; }
		const { model, expectedCode } = await readJson(`../examples/invalid/${file}`);
		assert.ok(codes(model).includes(expectedCode), file);
	}
});

test('migration CLI refuses overwrites and leaves the source intact', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'ade-migrate-'));
	try {
		const source = join(directory, 'legacy.json');
		const destination = join(directory, 'model.json');
		const original = await readFile(new URL('../prototype/examples/checkout.diagram.json', import.meta.url), 'utf8');
		await writeFile(source, original);
		const script = new URL('../scripts/migrate-model.mjs', import.meta.url).pathname;
		await run(process.execPath, [script, source, destination]);
		const before = await readFile(destination, 'utf8');
		await assert.rejects(run(process.execPath, [script, source, destination]), { code: 1 });
		assert.deepEqual([await readFile(source, 'utf8'), await readFile(destination, 'utf8')], [original, before]);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
