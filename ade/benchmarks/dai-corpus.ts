/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { errorCode } from '../runtime/errors.ts';
import type { SemanticModelV4, LegacySemanticModel } from '../../src/vs/workbench/contrib/ade/common/modelTypes.ts';
import type { ModelTaskRequest } from '../../src/vs/workbench/contrib/ade/common/modelTaskContext.ts';
import type { StructuralSession } from '../ai/structuralProject.ts';
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

export interface DaiCorpusCase {
	id: string;
	requirements: string[];
	steps: string[];
	mandatory: boolean;
	operation: string;
	input: Record<string, unknown>;
	expected: Record<string, unknown>;
}
export interface DaiCorpus { cases: DaiCorpusCase[] }
export interface DaiCorpusResult {
	id: string;
	profileId: string;
	status: string;
	expected?: Record<string, unknown>;
	observation?: Record<string, unknown>;
	reason?: string;
	error?: string;
	evidence?: Record<string, unknown>;
}
interface AdapterResult { observation: Record<string, unknown>; evidence?: Record<string, unknown> }

// Frozen JSON still crosses an untyped I/O boundary. Check adapter fields before use.
function record(value: unknown): Record<string, unknown> { assert.ok(value && typeof value === 'object' && !Array.isArray(value)); return value as Record<string, unknown>; }
function text(value: unknown): string { assert.equal(typeof value, 'string'); return value as string; }
function number(value: unknown): number { assert.equal(typeof value, 'number'); return value as number; }
function strings(value: unknown): string[] { assert.ok(Array.isArray(value) && value.every(item => typeof item === 'string')); return value; }
function point(value: unknown): { x: number; y: number } { const p = record(value); return { x: number(p.x), y: number(p.y) }; }

function project(profileId: string) {
	let serial = 0;
	const value = createPureProject('Frozen corpus adapter', () => ids[serial++] ?? `identity.${serial}`);
	value.model = switchModelStack(value.model, profileId);
	return value;
}

function request(profileId: string): ModelTaskRequest {
	return { version: 1, target: { kind: 'operation', id: 'operation.confirm' }, mode: 'analysis', intent: { revision: '1', text: 'Validate the authored release case.', clarifications: [] }, profileId, provider: { id: 'local', model: 'none', configurationRevision: '1' }, baselineRevision: 'authored', delta: [], writeScope: { objects: [], files: [], createOperationsUnder: [] }, retrievalScope: { objects: [], files: [] }, sources: [], budget: { maxInputBytes: 196608, maxContextBytes: 262144, outputReserveBytes: 65536, overheadReserveBytes: 0 } };
}

async function rejection(action: () => unknown) {
	try { await action(); } catch (error) { return { message: error instanceof Error ? error.message : String(error), ...(errorCode(error) ? { code: errorCode(error) } : {}), ...(error && typeof error === 'object' && Object.hasOwn(error, 'details') ? { details: (error as { details: unknown }).details } : {}) }; }
	throw new Error('Expected the production boundary to reject the case');
}

async function blocked(model: SemanticModelV4, profileId: string, code: string, reason: string) {
	const before = structuredClone(model);
	const readiness = getModelReadiness(model, 'operation.confirm', getModelArchetype(profileId).profile);
	assert.ok(readiness.diagnostics.some(d => d.code === code), JSON.stringify(readiness));
	const diagnostic = await rejection(() => compileModelTaskContext(model, request(profileId)));
	assert.deepEqual(model, before);
	return { observation: { outcome: 'blocked', reason, draftPreserved: true, calls: 0, writes: 0 }, evidence: { readiness, diagnostic, boundary: 'compileModelTaskContext; no provider or publication adapter invoked' } };
}

async function inProject(profileId: string, action: (value: ReturnType<typeof project> & { directory: string; save: (model: SemanticModelV4) => Promise<void>; session: StructuralSession }) => Promise<AdapterResult>) {
	const directory = await mkdtemp(join(tmpdir(), 'ade-dai12-corpus-'));
	try {
		const value = project(profileId);
		await mkdir(join(directory, '.ade'));
		const save = async (model: SemanticModelV4) => writeFile(join(directory, '.ade/model.json'), JSON.stringify(model));
		await save(value.model);
		await writeFile(join(directory, '.ade/criteria.json'), JSON.stringify(value.criteria));
		const stage = await prepareStructuralProject(directory, 'forward');
		assert.equal(stage.status, 'staged');
		const session = stage.session;
		assert.ok(session);
		const verification = await verifyStructuralProject(directory, session.id, session.reviewId);
		assert.ok(verification.verification);
		assert.equal(verification.status, 'passed', verification.verification.output);
		await publishStructuralProject(directory, session.id, session.reviewId);
		const evidence = { boundary: 'actual prepare/verify/publish; emitted quantity fixture, not checkout application', policy: verification.verification.policy, generated: verification.verification.generated, independent: verification.verification.independent };
		return { ...await action({ ...value, directory, save, session }), evidence };
	} finally { await rm(directory, { recursive: true, force: true }); }
}

// Each adapter consumes the frozen input. Expected observations are compared only by the caller.
const adapters: Record<string, (input: Record<string, unknown>, profileId: string) => Promise<AdapterResult>> = {
	'invalid-reference': async (input, profileId) => {
		const { model } = project(profileId);
		const relation = record(input.relation);
		model.semantics.relations.push({ id: 'relation.missing', kind: 'dependency', name: 'Requires', from: text(relation.from), to: text(relation.to) });
		return blocked(model, profileId, 'missingReference', 'missing-reference');
	},
	'unknown-technology': async (input, profileId) => {
		const { model } = project(profileId);
		assert.equal(record(input.platform).knowledge, 'unknown');
		assert.ok(model.foundation.platform);
		model.foundation.platform.bindings[0].technology = { state: 'unknown', reason: 'Frozen case explicitly leaves technology unknown' };
		return blocked(model, profileId, 'unknownTechnology', 'required-technology-unknown');
	},
	'unsupported-type': async (input, profileId) => {
		const { model } = project(profileId);
		model.foundation.types[0].primitive = text(input.requiredType);
		return blocked(model, profileId, 'unsupportedType', 'unsupported-type');
	},
	'undeclared-external': async (input, profileId) => {
		const { model } = project(profileId);
		model.semantics.elements.push({ id: text(input.requiredExternal), kind: 'system', name: 'Payments Vendor', scope: 'external' });
		model.semantics.relations.push({ id: 'requires.vendor', kind: 'dependency', name: 'Requires Payments', from: 'component.checkout', to: text(input.requiredExternal) });
		assert.deepEqual(input.declaredExternals, model.foundation.integrations);
		return blocked(model, profileId, 'undeclaredExternal', 'undeclared-external');
	},
	'adr-conflict': async (input, profileId) => {
		const { model } = project(profileId);
		// Storage is a declarative binding fact here; no database is connected or migrated.
		assert.ok(Array.isArray(input.acceptedDecisions));
		const bindingId = model.foundation.platform!.bindings[0].id;
		model.foundation.decisions = input.acceptedDecisions.map(value => { const d = record(value); return { id: text(d.id), revision: '1', status: 'accepted', scopeIds: [text(d.scope)], constraints: [{ id: text(d.id) + '.storage', category: 'technology', subject: { kind: 'binding', id: bindingId }, field: '/technology/value', operator: 'equals', value: { state: 'known', value: text(d.storage) } }] }; });
		return blocked(model, profileId, 'contradictoryDecisions', 'contradictory-decisions');
	},
	'essential-omission': async (input, profileId) => {
		const { model } = project(profileId), r = request(profileId);
		for (const id of strings(input.available)) {
			if (id.startsWith('operation.')) {
				const op = structuredClone(model.foundation.blueprint!.operations[0]);
				op.id = id; op.name = 'charge'; op.inputs = []; op.outputs = []; op.acceptanceCriteria = [{ id: 'criterion.charge', given: 'An explicit call', when: 'Called', then: 'Contract remains available' }];
				model.foundation.blueprint!.operations.push(op);
			} else { model.foundation.types.push({ id, name: 'PaymentResult', kind: 'primitive', primitive: 'boolean', fields: [] }); }
		}
		r.additionalContext = strings(input.required).map(id => ({ kind: id.startsWith('operation.') ? 'operation' : id.startsWith('type.') ? 'type' : 'decision', id }));
		r.budget.maxInputBytes = number(input.inputBudgetBytes);
		const diagnostic = await rejection(() => compileModelTaskContext(model, r));
		assert.equal(diagnostic.code, 'missingContext');
		assert.match(diagnostic.message, /adr\.1/);
		return { observation: { outcome: 'blocked', reason: 'essential-context-missing', missing: strings(input.required).filter(id => !strings(input.available).includes(id)), calls: 0 }, evidence: { diagnostic, required: r.additionalContext } };
	},
	'layout-only': async (input, profileId) => {
		const { model } = project(profileId);
		model.views = [{ id: 'view.checkout', name: 'Checkout', kind: 'structure', featureId: 'feature.checkout', nodes: [{ elementId: text(input.elementId), ...point(input.from) }], relationIds: [] }];
		const before = await hashSemanticModel(model), packet = await compileModelTaskContext(model, request(profileId));
		const next = applyVisualEdit(model, { kind: 'position', viewId: 'view.checkout', id: text(input.elementId), ...point(input.to) });
		assert.ok(next.version === 4 || next.version === 5);
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
		const setGuard = (m: SemanticModelV4, guard: string) => {
			const match = /^amountMinor (>|>=) (\d+)$/.exec(guard); assert.ok(match);
			const nodes = m.foundation.predicates![0].nodes;
			const literal = nodes[1], comparison = nodes[2];
			assert.ok(literal.kind === 'literal' && comparison.kind === 'compare');
			literal.value = Number(match[2]);
			comparison.operator = match[1] === '>' ? 'gt' : 'ge';
		};
		setGuard(code, text(input.codeGuard)); setGuard(design, text(input.designGuard));
		const source = predicateRegion(code, code.foundation.predicates![0]);
		await writeFile(join(directory, artifact.file), source); await save(design);
		const diagnostic = await rejection(() => prepareStructuralProject(directory, 'reverse'));
		assert.match(diagnostic.message, /Conflict/);
		assert.equal(await readFile(join(directory, artifact.file), 'utf8'), source);
		assert.deepEqual(JSON.parse(await readFile(join(directory, '.ade/model.json'), 'utf8')), design);
		const original = session.next.model.foundation.predicates![0].nodes[1];
		assert.ok(original.kind === 'literal');
		assert.equal(original.value, Number(text(input.baselineGuard).split(' ').at(-1)));
		return { observation: { outcome: 'conflict', designGuard: input.designGuard, codeGuard: input.codeGuard, baselineGuard: input.baselineGuard, writes: 0 } };
	}),
	'undo-manual-change': async (input, profileId) => inProject(profileId, async ({ directory, session }) => {
		const path = join(directory, session.next.artifacts[0].file);
		await writeFile(path, text(input.current));
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
			assert.ok(session);
			const verified = await verifyStructuralProject(directory, session.id, session.reviewId); assert.equal(verified.status, 'passed');
			assert.ok(verified.verification);
			model.foundation.blueprint!.operations[0].name += 'Revised'; await writeFile(join(directory, '.ade/model.json'), JSON.stringify(model));
			const diagnostic = await rejection(() => publishStructuralProject(directory, session.id, session.reviewId)); assert.match(diagnostic.message, /stale/);
			await assert.rejects(readFile(join(directory, '.ade/structural/active.json')), { code: 'ENOENT' });
			await assert.rejects(readFile(join(directory, session.next.artifacts[0].file)), { code: 'ENOENT' });
			return { observation: { outcome: 'stale-review', writes: 0, baselineAdvanced: false }, evidence: { diagnostic, policy: verified.verification.policy } };
		} finally { await rm(directory, { recursive: true, force: true }); }
	},
	'conservative-migration': async input => {
		const reader = new URL('../runtime/test/fixtures/model-v2-v3-reader.ts', import.meta.url);
		const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
		const schemaHashes = await Promise.all([2, 3].map(async version => { const path = `ade/schema/model-v${version}.schema.json`; return { path, sha256: sha(await readFile(new URL(path, root))) }; }));
		const checks = [];
		assert.ok(Array.isArray(input.sourceVersions));
		for (const [index, path] of strings(input.fixtures).entries()) {
			const sourceBytes = await readFile(new URL(path, root)), source: unknown = JSON.parse(sourceBytes.toString('utf8')), before = structuredClone(source); let serial = 0;
			assert.equal(record(source).version, input.sourceVersions[index]);
			const migrated = migrateSemanticModelToV4(source, () => `migrated.${++serial}`);
			const { foundation, ...preserved } = structuredClone(migrated);
			assert.ok(foundation.migration);
			const legacy: LegacySemanticModel = { ...preserved, version: foundation.migration.sourceVersion };
			for (const e of legacy.semantics.elements) { if (e.behavior) { delete e.behavior.id; for (const f of [...e.behavior.inputs, ...e.behavior.outputs]) { delete f.id; } } for (const member of e.details?.members ?? []) { delete member.id; } }
			assert.deepEqual([source, legacy], [before, before]);
			assert.deepEqual([foundation.platform.bindings, foundation.assertions, foundation.occurrences, foundation.frames], [[], [], [], []]);
			assert.deepEqual(migrateSemanticModelToV4(migrated, () => { throw new Error('Second migration allocated an identity'); }), migrated);
			const directory = await mkdtemp(join(tmpdir(), 'ade-dai12-migration-'));
			try {
				const original = join(directory, 'legacy.json'), accepted = join(directory, 'accepted.json'), draft = join(directory, 'draft.json'), output = join(directory, 'output.json'), sentinel = join(directory, 'sentinel.json');
				const draftBytes = Buffer.from(JSON.stringify(migrated)), sentinelBytes = Buffer.from('Existing output must remain untouched\n');
				await writeFile(original, sourceBytes);
				// Positive controls prevent a broken fixture or an intentionally regressed
				// modern reader from satisfying the negative compatibility observation.
				const positive = spawnSync(process.execPath, [fileURLToPath(reader), original, accepted], { encoding: 'utf8', timeout: 10000 });
				assert.equal(positive.status, 0, positive.stderr);
				assert.deepEqual(JSON.parse(positive.stdout), { reader: 'schema-v2-v3-compatibility-fixture', version: input.sourceVersions[index] });
				assert.deepEqual(await readFile(accepted), sourceBytes);
				assert.deepEqual(await readFile(original), sourceBytes);
				await writeFile(draft, draftBytes);
				execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/migrate-model.mjs', import.meta.url)), draft, join(directory, 'modern.json')], { stdio: 'pipe', timeout: 10000 });
				assert.deepEqual(JSON.parse(await readFile(join(directory, 'modern.json'), 'utf8')), migrated);
				await writeFile(sentinel, sentinelBytes);
				const rejected = [];
				for (const destination of [output, sentinel]) {
					const result = spawnSync(process.execPath, [fileURLToPath(reader), draft, destination], { encoding: 'utf8', timeout: 10000 });
					assert.deepEqual([result.status, result.signal, result.error, result.stdout], [1, null, undefined, '']);
					const diagnostic = record(JSON.parse(result.stderr));
					assert.equal(diagnostic.reader, 'schema-v2-v3-compatibility-fixture');
					assert.equal(diagnostic.code, 'incompatible-model-version');
					assert.ok(Array.isArray(diagnostic.diagnostics));
					assert.deepEqual(diagnostic.diagnostics.map(value => { const error = record(value); return { version: error.version, instancePath: error.instancePath, keyword: error.keyword, allowedValue: record(error.params).allowedValue }; }), [2, 3].map(version => ({ version, instancePath: '/version', keyword: 'const', allowedValue: version })));
					rejected.push(diagnostic);
				}
				await assert.rejects(readFile(output), { code: 'ENOENT' });
				assert.deepEqual(await readFile(sentinel), sentinelBytes);
				assert.deepEqual(await readFile(draft), draftBytes);
				assert.deepEqual(await readFile(original), sourceBytes);
				assert.deepEqual(await readFile(new URL(path, root)), sourceBytes);
				checks.push({ fixture: path, version: input.sourceVersions[index], legacyAccepted: true, modernV4Preserved: true, incompatibleRejections: rejected, sourceBytesUnchanged: true, outputAbsent: true, sentinelUnchanged: true });
			} finally { await rm(directory, { recursive: true, force: true }); }
		}
		return { observation: { losses: [], inventedFacts: [], secondMigrationChanges: 0, oldReaderRejectsWithoutWrite: true }, evidence: { boundary: 'production migration and modern v4-preserving CLI; v2/v3 schema compatibility I/O fixture, not a historical application binary; profile-independent, executed on Node host', compatibilityReader: { path: 'ade/runtime/test/fixtures/model-v2-v3-reader.ts', sha256: sha(await readFile(reader)), schemas: schemaHashes }, checks } };
	}
};

function missingAdapter(item: DaiCorpusCase): string {
	if (item.operation === 'storage.migrate') { return 'Neither trusted runtime profile implements database schema/data migrations; checkpoint copying is not this oracle.'; }
	if (item.operation.startsWith('checkout.')) { return 'Existing executable examples do not implement the frozen checkout application with authorization, stock, persisted orders and request idempotency. Their narrower criteria cannot substitute for this oracle.'; }
	if (item.operation === 'order.transition') { return 'Existing state fixture has different states/actions and commit-after-entry semantics; no adapter for this exact ordered business observation.'; }
	if (['queue.consume', 'topic.publish', 'message.decode'].includes(item.operation)) { return 'Existing simulator/broker suites exercise delivery policies with another payload/topology. An exact frozen-corpus live acknowledgement/effect observer is still required.'; }
	if (item.operation === 'sync.publishAndRecover') { return 'Production journal is covered on owned generated regions; this frozen arbitrary-source move/create fixture has no exact import adapter.'; }
	return 'No exact production adapter for the frozen input and complete observation; related narrower tests are not credited as this case.';
}

/** Execute every frozen case or record its concrete open dependency; never count unavailable cases as passes. */
export async function runDaiCorpus(corpus: DaiCorpus, profiles = ['node.esm', 'bun.esm']): Promise<DaiCorpusResult[]> {
	const results: DaiCorpusResult[] = [];
	for (const profileId of profiles) {
		getModelArchetype(profileId);
		for (const item of corpus.cases) {
			const base = { id: item.id, profileId, requirements: item.requirements, steps: item.steps, mandatory: item.mandatory, input: item.input, expected: item.expected, host: 'Node; selected runtime used by structural verification', evidenceClass: item.id === 'conservative-migration' ? 'production-migration-and-compatibility-fixture' : 'local-production-api' };
			if (!adapters[item.id]) { results.push({ ...base, status: 'not-executed', reason: missingAdapter(item) }); continue; }
			try {
				const { observation, evidence } = await adapters[item.id](structuredClone(item.input), profileId);
				assert.deepEqual(observation, item.expected);
				results.push({ ...base, status: 'passed', observation, evidence });
			} catch (error) { results.push({ ...base, status: 'failed', error: error instanceof Error ? error.message : String(error) }); }
		}
	}
	return results;
}

/** A local test pass is independent of release acceptance. Missing or duplicate observations cannot satisfy the gate. */
export function daiCorpusGate(corpus: DaiCorpus, profiles: string[], results: DaiCorpusResult[]) {
	const required = corpus.cases.filter(item => item.mandatory);
	const keys = results.map(item => `${item.profileId}:${item.id}`);
	const matches = (result: DaiCorpusResult, item: DaiCorpusCase, profile: string) => {
		if (result.profileId !== profile || result.id !== item.id || result.status !== 'passed') { return false; }
		try { assert.deepEqual(result.observation, item.expected); assert.deepEqual(result.expected, item.expected); return true; } catch { return false; }
	};
	const complete = required.length > 0 && profiles.length > 0 && new Set(profiles).size === profiles.length && new Set(required.map(item => item.id)).size === required.length && keys.length === new Set(keys).size && results.length === required.length * profiles.length && profiles.every(profile => required.every(item => results.some(result => matches(result, item, profile))));
	return { accepted: complete, expectedExecutions: required.length * profiles.length, passed: results.filter(r => r.status === 'passed').length, failed: results.filter(r => r.status === 'failed').length, notExecuted: results.filter(r => r.status === 'not-executed').length };
}
