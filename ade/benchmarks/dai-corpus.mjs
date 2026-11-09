/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import '../scripts/source-loader.mjs';
const { createPureProject, predicateRegion } = await import('../../src/vs/workbench/contrib/ade/common/modelProject.ts');
const { switchModelStack } = await import('../../src/vs/workbench/contrib/ade/common/modelStack.ts');
const { getModelArchetype } = await import('../../src/vs/workbench/contrib/ade/common/modelProfiles.ts');
const { getModelReadiness } = await import('../../src/vs/workbench/contrib/ade/common/modelReadiness.ts');
const { compileModelTaskContext } = await import('../../src/vs/workbench/contrib/ade/common/modelTaskContext.ts');
const { hashSemanticModel } = await import('../../src/vs/workbench/contrib/ade/common/modelSerialization.ts');
const { migrateSemanticModelToV4 } = await import('../../src/vs/workbench/contrib/ade/common/modelMigration.ts');
const { applyVisualEdit } = await import('../../src/vs/workbench/contrib/ade/common/visualEditing.ts');
const { prepareStructuralProject, verifyStructuralProject, publishStructuralProject } = await import('../ai/structuralProject.ts');

const root = new URL('../../', import.meta.url);
const ids = ['project', 'system.shop', 'container.api', 'component.checkout', 'feature.checkout', 'operation.confirm', 'input.amountMinor', 'output.accepted', 'type.quantity', 'type.boolean', 'predicate.quantity', 'criterion.quantity'];

function project(profileId) {
	let serial = 0;
	const value = createPureProject('Frozen corpus adapter', () => ids[serial++] ?? `identity.${serial}`);
	value.model = switchModelStack(value.model, profileId);
	return value;
}

function request(profileId) {
	return { version: 1, target: { kind: 'operation', id: 'operation.confirm' }, mode: 'analysis', intent: { revision: '1', text: 'Validate the authored release case.', clarifications: [] }, profileId, provider: { id: 'local', model: 'none', configurationRevision: '1' }, baselineRevision: 'authored', delta: [], writeScope: { objects: [], files: [], createOperationsUnder: [] }, retrievalScope: { objects: [], files: [] }, sources: [], budget: { maxInputBytes: 196608, maxContextBytes: 262144, outputReserveBytes: 65536, overheadReserveBytes: 0 } };
}

async function rejection(action) {
	try { await action(); } catch (error) { return { message: error.message, ...(error.code ? { code: error.code } : {}), ...(error.details ? { details: error.details } : {}) }; }
	throw new Error('Expected the production boundary to reject the case');
}

async function blocked(model, profileId, code, reason) {
	const before = structuredClone(model);
	const readiness = getModelReadiness(model, 'operation.confirm', getModelArchetype(profileId).profile);
	assert.ok(readiness.diagnostics.some(d => d.code === code), JSON.stringify(readiness));
	const diagnostic = await rejection(() => compileModelTaskContext(model, request(profileId)));
	assert.deepEqual(model, before);
	return { observation: { outcome: 'blocked', reason, draftPreserved: true, calls: 0, writes: 0 }, evidence: { readiness, diagnostic, boundary: 'compileModelTaskContext; no provider or publication adapter invoked' } };
}

async function inProject(profileId, action) {
	const directory = await mkdtemp(join(tmpdir(), 'ade-dai12-corpus-'));
	try {
		const value = project(profileId);
		await mkdir(join(directory, '.ade'));
		const save = async model => writeFile(join(directory, '.ade/model.json'), JSON.stringify(model));
		await save(value.model);
		await writeFile(join(directory, '.ade/criteria.json'), JSON.stringify(value.criteria));
		const stage = await prepareStructuralProject(directory, 'forward');
		assert.equal(stage.status, 'staged');
		const session = stage.session;
		const verification = await verifyStructuralProject(directory, session.id, session.reviewId);
		assert.equal(verification.status, 'passed', verification.verification.output);
		await publishStructuralProject(directory, session.id, session.reviewId);
		const evidence = { boundary: 'actual prepare/verify/publish; emitted quantity fixture, not checkout application', policy: verification.verification.policy, generated: verification.verification.generated, independent: verification.verification.independent };
		return { ...await action({ ...value, directory, save, session }), evidence };
	} finally { await rm(directory, { recursive: true, force: true }); }
}

// Each adapter consumes the frozen input. Expected observations are compared only by the caller.
const adapters = {
	'invalid-reference': async (input, profileId) => {
		const { model } = project(profileId);
		model.semantics.relations.push({ id: 'relation.missing', kind: 'dependency', name: 'Requires', ...input.relation });
		return blocked(model, profileId, 'missingReference', 'missing-reference');
	},
	'unknown-technology': async (input, profileId) => {
		const { model } = project(profileId);
		assert.equal(input.platform.knowledge, 'unknown');
		model.foundation.platform.bindings[0].technology = { state: 'unknown', reason: 'Frozen case explicitly leaves technology unknown' };
		return blocked(model, profileId, 'unknownTechnology', 'required-technology-unknown');
	},
	'unsupported-type': async (input, profileId) => {
		const { model } = project(profileId);
		model.foundation.types[0].primitive = input.requiredType;
		return blocked(model, profileId, 'unsupportedType', 'unsupported-type');
	},
	'undeclared-external': async (input, profileId) => {
		const { model } = project(profileId);
		model.semantics.elements.push({ id: input.requiredExternal, kind: 'system', name: 'Payments Vendor', scope: 'external' });
		model.semantics.relations.push({ id: 'requires.vendor', kind: 'dependency', name: 'Requires Payments', from: 'component.checkout', to: input.requiredExternal });
		assert.deepEqual(input.declaredExternals, model.foundation.integrations);
		return blocked(model, profileId, 'undeclaredExternal', 'undeclared-external');
	},
	'adr-conflict': async (input, profileId) => {
		const { model } = project(profileId);
		// Storage is a declarative binding fact here; no database is connected or migrated.
		model.foundation.decisions = input.acceptedDecisions.map(d => ({ id: d.id, revision: '1', status: 'accepted', scopeIds: [d.scope], constraints: [{ id: d.id + '.storage', category: 'technology', subject: { kind: 'binding', id: model.foundation.platform.bindings[0].id }, field: '/technology/value', operator: 'equals', value: { state: 'known', value: d.storage } }] }));
		return blocked(model, profileId, 'contradictoryDecisions', 'contradictory-decisions');
	},
	'essential-omission': async (input, profileId) => {
		const { model } = project(profileId), r = request(profileId);
		for (const id of input.available) {
			if (id.startsWith('operation.')) {
				const op = structuredClone(model.foundation.blueprint.operations[0]);
				op.id = id; op.name = 'charge'; op.inputs = []; op.outputs = []; op.acceptanceCriteria = [{ id: 'criterion.charge', given: 'An explicit call', when: 'Called', then: 'Contract remains available' }];
				model.foundation.blueprint.operations.push(op);
			} else { model.foundation.types.push({ id, name: 'PaymentResult', kind: 'primitive', primitive: 'boolean', fields: [] }); }
		}
		r.additionalContext = input.required.map(id => ({ kind: id.startsWith('operation.') ? 'operation' : id.startsWith('type.') ? 'type' : 'decision', id }));
		r.budget.maxInputBytes = input.inputBudgetBytes;
		const diagnostic = await rejection(() => compileModelTaskContext(model, r));
		assert.equal(diagnostic.code, 'missingContext');
		assert.match(diagnostic.message, /adr\.1/);
		return { observation: { outcome: 'blocked', reason: 'essential-context-missing', missing: input.required.filter(id => !input.available.includes(id)), calls: 0 }, evidence: { diagnostic, required: r.additionalContext } };
	},
	'layout-only': async (input, profileId) => {
		const { model } = project(profileId);
		model.views = [{ id: 'view.checkout', name: 'Checkout', kind: 'structure', featureId: 'feature.checkout', nodes: [{ elementId: input.elementId, ...input.from }], relationIds: [] }];
		const before = await hashSemanticModel(model), packet = await compileModelTaskContext(model, request(profileId));
		const next = applyVisualEdit(model, { kind: 'position', viewId: 'view.checkout', id: input.elementId, ...input.to });
		assert.equal((await compileModelTaskContext(next, request(profileId))).seal, packet.seal);
		const node = next.views[0].nodes[0];
		return { observation: { semanticHashChanged: await hashSemanticModel(next) !== before, calls: 0, sourceWrites: 0, position: { x: node.x, y: node.y } }, evidence: { boundary: 'domain hash/context; continuous queue separately tested by workflow-project/second-stack suites' } };
	},
	'aligned-noop': async (input, profileId) => {
		assert.equal(input.baseline, input.design); assert.equal(input.design, input.code);
		return inProject(profileId, async ({ directory }) => {
			const before = await readFile(join(directory, '.ade/structural/active.json'), 'utf8');
			const result = await prepareStructuralProject(directory, 'forward');
			assert.equal(await readFile(join(directory, '.ade/structural/active.json'), 'utf8'), before);
			assert.deepEqual(result, { status: 'aligned', calls: 0 });
			return { observation: { outcome: result.status, calls: result.calls, writes: 0, proposals: Number(!!result.session) } };
		});
	},
	'concurrent-guard': async (input, profileId) => inProject(profileId, async ({ directory, model, save, session }) => {
		const artifact = session.next.artifacts[0], code = structuredClone(model), design = structuredClone(model);
		const setGuard = (m, guard) => {
			const match = /^amountMinor (>|>=) (\d+)$/.exec(guard); assert.ok(match);
			m.foundation.predicates[0].nodes[1].value = Number(match[2]);
			m.foundation.predicates[0].nodes[2].operator = match[1] === '>' ? 'gt' : 'ge';
		};
		setGuard(code, input.codeGuard); setGuard(design, input.designGuard);
		const source = predicateRegion(code, code.foundation.predicates[0]);
		await writeFile(join(directory, artifact.file), source); await save(design);
		const diagnostic = await rejection(() => prepareStructuralProject(directory, 'reverse'));
		assert.match(diagnostic.message, /Conflict/);
		assert.equal(await readFile(join(directory, artifact.file), 'utf8'), source);
		assert.deepEqual(JSON.parse(await readFile(join(directory, '.ade/model.json'))), design);
		assert.equal(session.next.model.foundation.predicates[0].nodes[1].value, Number(input.baselineGuard.split(' ').at(-1)));
		return { observation: { outcome: 'conflict', designGuard: input.designGuard, codeGuard: input.codeGuard, baselineGuard: input.baselineGuard, writes: 0 } };
	}),
	'undo-manual-change': async (input, profileId) => inProject(profileId, async ({ directory, session }) => {
		const path = join(directory, session.next.artifacts[0].file);
		await writeFile(path, input.current);
		const diagnostic = await rejection(() => publishStructuralProject(directory, session.id, session.reviewId, true));
		assert.match(diagnostic.message, /Manual/);
		return { observation: { outcome: 'conflict', current: await readFile(path, 'utf8'), writes: 0 } };
	}),
	'stale-review': async (input, profileId) => {
		assert.notEqual(input.currentRevision, input.reviewedRevision); assert.equal(input.proposalRevision, input.reviewedRevision);
		const directory = await mkdtemp(join(tmpdir(), 'ade-dai12-stale-'));
		try {
			const { model, criteria } = project(profileId);
			await mkdir(join(directory, '.ade')); await writeFile(join(directory, '.ade/model.json'), JSON.stringify(model)); await writeFile(join(directory, '.ade/criteria.json'), JSON.stringify(criteria));
			const { session } = await prepareStructuralProject(directory, 'forward');
			const verified = await verifyStructuralProject(directory, session.id, session.reviewId); assert.equal(verified.status, 'passed');
			model.foundation.blueprint.operations[0].name += 'Revised'; await writeFile(join(directory, '.ade/model.json'), JSON.stringify(model));
			const diagnostic = await rejection(() => publishStructuralProject(directory, session.id, session.reviewId)); assert.match(diagnostic.message, /stale/);
			await assert.rejects(readFile(join(directory, '.ade/structural/active.json')), { code: 'ENOENT' });
			await assert.rejects(readFile(join(directory, session.next.artifacts[0].file)), { code: 'ENOENT' });
			return { observation: { outcome: 'stale-review', writes: 0, baselineAdvanced: false }, evidence: { diagnostic, policy: verified.verification.policy } };
		} finally { await rm(directory, { recursive: true, force: true }); }
	},
	'conservative-migration': async input => {
		for (const [index, path] of input.fixtures.entries()) {
			const source = JSON.parse(await readFile(new URL(path, root))), before = structuredClone(source); let serial = 0;
			assert.equal(source.version, input.sourceVersions[index]);
			const migrated = migrateSemanticModelToV4(source, () => `migrated.${++serial}`);
			const { foundation, ...legacy } = structuredClone(migrated); legacy.version = foundation.migration.sourceVersion;
			for (const e of legacy.semantics.elements) { if (e.behavior) { delete e.behavior.id; for (const f of [...e.behavior.inputs, ...e.behavior.outputs]) { delete f.id; } } for (const member of e.details?.members ?? []) { delete member.id; } }
			assert.deepEqual([source, legacy], [before, before]);
			assert.deepEqual([foundation.platform.bindings, foundation.assertions, foundation.occurrences, foundation.frames], [[], [], [], []]);
			assert.deepEqual(migrateSemanticModelToV4(migrated, () => { throw new Error('Second migration allocated an identity'); }), migrated);
			const directory = await mkdtemp(join(tmpdir(), 'ade-dai12-migration-'));
			try {
				await writeFile(join(directory, 'draft.json'), JSON.stringify(migrated));
				assert.throws(() => execFileSync(process.execPath, [new URL('../scripts/migrate-model.mjs', import.meta.url).pathname, join(directory, 'draft.json'), join(directory, 'output.json')], { stdio: 'pipe' }));
				await assert.rejects(readFile(join(directory, 'output.json')), { code: 'ENOENT' });
				assert.deepEqual(JSON.parse(await readFile(join(directory, 'draft.json'))), migrated);
			} finally { await rm(directory, { recursive: true, force: true }); }
		}
		return { observation: { losses: [], inventedFacts: [], secondMigrationChanges: 0, oldReaderRejectsWithoutWrite: true }, evidence: { boundary: 'actual migration and legacy migration CLI; profile-independent, executed on Node host' } };
	}
};

function missingAdapter(item) {
	if (item.operation === 'storage.migrate') { return 'Neither trusted runtime profile implements database schema/data migrations; checkpoint copying is not this oracle.'; }
	if (item.operation.startsWith('checkout.')) { return 'Existing executable examples do not implement the frozen checkout application with authorization, stock, persisted orders and request idempotency. Their narrower criteria cannot substitute for this oracle.'; }
	if (item.operation === 'order.transition') { return 'Existing state fixture has different states/actions and commit-after-entry semantics; no adapter for this exact ordered business observation.'; }
	if (['queue.consume', 'topic.publish', 'message.decode'].includes(item.operation)) { return 'Existing simulator/broker suites exercise delivery policies with another payload/topology. An exact frozen-corpus live acknowledgement/effect observer is still required.'; }
	if (item.operation === 'sync.publishAndRecover') { return 'Production journal is covered on owned generated regions; this frozen arbitrary-source move/create fixture has no exact import adapter.'; }
	return 'No exact production adapter for the frozen input and complete observation; related narrower tests are not credited as this case.';
}

/** Execute every frozen case or record its concrete open dependency; never count unavailable cases as passes. */
export async function runDaiCorpus(corpus, profiles = ['node.esm', 'bun.esm']) {
	const results = [];
	for (const profileId of profiles) {
		getModelArchetype(profileId);
		for (const item of corpus.cases) {
			const base = { id: item.id, profileId, requirements: item.requirements, steps: item.steps, mandatory: item.mandatory, input: item.input, expected: item.expected, host: 'Node; selected runtime used by structural verification', evidenceClass: 'local-production-api' };
			if (!adapters[item.id]) { results.push({ ...base, status: 'not-executed', reason: missingAdapter(item) }); continue; }
			try {
				const { observation, evidence } = await adapters[item.id](structuredClone(item.input), profileId);
				assert.deepEqual(observation, item.expected);
				results.push({ ...base, status: 'passed', observation, evidence });
			} catch (error) { results.push({ ...base, status: 'failed', error: error.message }); }
		}
	}
	return results;
}

/** A local test pass is independent of release acceptance. Missing or duplicate observations cannot satisfy the gate. */
export function daiCorpusGate(corpus, profiles, results) {
	const required = corpus.cases.filter(item => item.mandatory);
	const keys = results.map(item => `${item.profileId}:${item.id}`);
	const matches = (result, item, profile) => {
		if (result.profileId !== profile || result.id !== item.id || result.status !== 'passed') { return false; }
		try { assert.deepEqual(result.observation, item.expected); assert.deepEqual(result.expected, item.expected); return true; } catch { return false; }
	};
	const complete = required.length > 0 && profiles.length > 0 && new Set(profiles).size === profiles.length && new Set(required.map(item => item.id)).size === required.length && keys.length === new Set(keys).size && results.length === required.length * profiles.length && profiles.every(profile => required.every(item => results.some(result => matches(result, item, profile))));
	return { accepted: complete, expectedExecutions: required.length * profiles.length, passed: results.filter(r => r.status === 'passed').length, failed: results.filter(r => r.status === 'failed').length, notExecuted: results.filter(r => r.status === 'not-executed').length };
}
