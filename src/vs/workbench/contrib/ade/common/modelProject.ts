/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { validateModelMessaging, type MessagingScenario, type MessagingObservation } from './modelMessaging.js';
import { validateModelStateMachine, type StateScenario, type StateObservation } from './modelStates.js';
import { validateModelInteraction, type InteractionReplies } from './modelInteractions.js';
import type { ModelValue } from './modelValues.js';
import type { ModelTaskPacket, ModelTaskRequest } from './modelTaskContext.js';
import { emitModelPredicate, validateModelPredicate, type PredicateInput } from './modelExpressions.js';
import { modelProjectProfile } from './modelProfiles.js';
import { canonicalJson, hashSemanticModel } from './modelSerialization.js';
import { getModelReadiness } from './modelReadiness.js';
import { emptyFoundation, type ModelPredicate, type SemanticModelV4 } from './semanticModel.js';

export interface PredicateCase { id: string; predicateId: string; criterionId: string; input: Record<string, PredicateInput>; expected: boolean | null | 'typeError' | 'arithmeticZero' | 'arithmeticPrecision' }
export interface InteractionCase { id: string; interactionId: string; criterionId: string; input: Record<string, ModelValue>; replies: InteractionReplies; expected: { outcome: 'completed' | 'failed'; calls: string[]; outputs: Record<string, ModelValue>; error?: string } }
export interface StateCase { id: string; machineId: string; criterionId: string; scenario: StateScenario; expected: StateObservation }
export interface MessagingCase { id: string; messagingId: string; criterionId: string; scenario: MessagingScenario; expected: MessagingObservation }
export interface ProjectCriteria { version: 1; revision: string; cases: PredicateCase[]; interactions?: InteractionCase[]; states?: StateCase[]; messaging?: MessagingCase[] }
// predicateId is the v1 journal binding key, retained for old snapshots; interactionId identifies the extended artifact kind.
export interface PredicateArtifact { predicateId: string; interactionId?: string; stateMachineId?: string; messagingId?: string; operationId: string; file: string; region: string }
/** Coverage is deliberately per construct: a preserved contract is not reconstructed implementation intent. */
export const projectRoundTripMatrix = [
	{ construct: 'contracts/types', forward: 'validated closure in emitted plans', reverse: 'preserved; incompatible source contract is partial', identity: 'stable model IDs' },
	{ construct: 'predicate expressions', forward: 'full declared expression grammar', reverse: 'partial: existing literals and comparisons with exact re-emission', identity: 'existing node IDs' },
	{ construct: 'interaction frames', forward: 'alt/opt/loop/par/critical/ref plans', reverse: 'partial: existing plan identities and supported execution fields', identity: 'existing frame/occurrence IDs' },
	{ construct: 'flat state machines', forward: 'declared flat state plan', reverse: 'partial: existing state/transition/action identities', identity: 'existing state/transition IDs' },
	{ construct: 'messaging', forward: 'versioned configuration and simulation', reverse: 'partial: ackWait/maxAttempts/backoff only', identity: 'existing topology/binding IDs' },
	{ construct: 'architecture decisions', forward: 'normative validation and context', reverse: 'preserved; never inferred from source', identity: 'model decision IDs/history' },
	{ construct: 'platform bindings', forward: 'explicit profile resolution', reverse: 'preserved; unsupported platform is blocking', identity: 'model binding IDs' },
	{ construct: 'views/custom text', forward: 'preserved outside executable regions', reverse: 'preserved without semantic inference', identity: 'model IDs and exact physical text' }
] as const;
export const projectCoverage = { forward: 'pure expressions v1 and structured interactions v1 and flat states v1 and JetStream messaging plans v1', reverse: 'verified predicate template and existing interaction/state data-plan identities and messaging retry policies', preserved: 'custom text outside owned region, IDs, views, descriptions, ADRs', constructs: projectRoundTripMatrix, physical: 'bounded nested src ESM; create/rename/move/delete with exact images and modes; compiler-derived source index is reconstructible', unsupported: ['arbitrary operation bodies', 'live broker publication', 'storage', 'external dependencies', 'runtime protocols'] } as const;
const start = '// <ade:pure-v1>\n', end = '// </ade:pure-v1>\n';

/** A complete authored feature, created through one undoable native edit; never imported from source. */
export function createPureProject(name: string, identity: () => string): { model: SemanticModelV4; criteria: ProjectCriteria } {
	const [project, system, container, component, feature, operation, input, output, quantity, boolean, predicate, criterion] = Array.from({ length: 12 }, identity);
	const foundation = emptyFoundation();
	foundation.types = [{ id: quantity, name: 'Quantity', kind: 'primitive', primitive: 'integer', fields: [] }, { id: boolean, name: 'Boolean', kind: 'primitive', primitive: 'boolean', fields: [] }];
	foundation.ownership = [{ id: identity(), elementId: container, ownerId: system, role: 'architecture' }, { id: identity(), elementId: component, ownerId: container, role: 'architecture' }];
	foundation.memberships = [{ id: identity(), elementId: component, featureId: feature }];
	foundation.platform.bindings = [{ id: identity(), elementId: container, profileId: 'node.esm', technology: { state: 'known', value: 'node-esm' } }];
	foundation.blueprint = { operations: [{ id: operation, ownerId: component, name: 'validateQuantity', inputs: [{ id: input, name: 'quantity', type: '', typeId: quantity, required: true, nullable: { state: 'known', value: false } }], outputs: [{ id: output, name: 'accepted', type: '', typeId: boolean, required: true, nullable: { state: 'known', value: false } }], errors: [], effects: [], permissions: [], preconditions: [], postconditions: [], acceptanceCriteria: [{ id: criterion, given: 'A safe integer quantity', when: 'The precondition is checked', then: 'Only positive quantities satisfy the precondition' }] }], interfaces: [], ports: [], connections: [], transports: [], modules: [], fieldMappings: [] };
	foundation.predicates = [{ id: predicate, version: 1, operationId: operation, phase: 'pre', rootId: 'positive', nodes: [{ id: 'quantity', kind: 'reference', fieldId: input, path: [] }, { id: 'zero', kind: 'literal', typeId: quantity, value: 0 }, { id: 'positive', kind: 'compare', operator: 'gt', left: 'quantity', right: 'zero' }] }];
	const model: SemanticModelV4 = { version: 4, id: project, name, semantics: { elements: [{ id: system, name, kind: 'system', scope: 'governed' }, { id: container, name: 'Domain', kind: 'container', runtimeKind: 'application', description: 'Evaluate pure quantity rules' }, { id: component, name: 'Quantity Validation', kind: 'component', description: 'Validate submitted quantities' }, { id: feature, name: 'Validate Quantity', kind: 'feature' }], relations: [] }, foundation, views: [], codeMappings: [], verifications: [] };
	const cases: PredicateCase[] = ([[-1, false], [0, false], [1, true], [Number.MAX_SAFE_INTEGER, true]] as const).map(([value, expected], index) => ({ id: `quantity.${index}`, predicateId: predicate, criterionId: criterion, input: { [input]: value }, expected }));
	cases.push({ id: 'absent', predicateId: predicate, criterionId: criterion, input: {}, expected: null }, ...[null, '1', Number.MAX_SAFE_INTEGER + 1].map((value, index): PredicateCase => ({ id: `invalid.${index}`, predicateId: predicate, criterionId: criterion, input: { [input]: value }, expected: 'typeError' })));
	return { model, criteria: { version: 1, revision: '1', cases } };
}

/** Productive scope is narrower than structural context readiness. Nothing is silently approximated. */
export function assertPureProject(model: SemanticModelV4): void {
	const profile = modelProjectProfile(model).profile;
	const predicates = model.foundation.predicates ?? [], interactions = model.foundation.interactions.filter(entry => entry.execution);
	if (!predicates.length && !interactions.length && !model.foundation.stateMachines?.length && !model.foundation.messaging?.length) { throw new Error('At least one complete pure predicate is required'); }
	if (model.foundation.frames.some(frame => frame.kind === 'unspecified') || model.foundation.integrations.length || model.foundation.blueprint?.connections.length || model.foundation.blueprint?.transports.length || model.semantics.elements.some(element => element.kind === 'container' && !['application', 'service', ...(model.foundation.messaging?.length ? ['messaging'] : [])].includes(element.runtimeKind ?? ''))) { throw new Error('Unsupported project effects, transport or persistence'); }
	for (const topology of model.foundation.messaging ?? []) { const reasons = validateModelMessaging(model, topology.id), readiness = getModelReadiness(model, topology.id, profile); if (reasons.length || readiness.state !== 'generationReady') { throw new Error('Messaging target incomplete: ' + [...reasons, ...readiness.diagnostics.map(item => item.code + ':' + item.args.join(','))].join(';')); } }
	for (const machine of model.foundation.stateMachines ?? []) { const reasons = validateModelStateMachine(model, machine.id), readiness = getModelReadiness(model, machine.operationId, profile); if (reasons.length || readiness.state !== 'generationReady') { throw new Error('State machine target is incomplete or unsupported: ' + [...reasons, ...readiness.diagnostics.map(item => item.code + ':' + item.args.join(','))].join(';')); } }
	for (const interaction of interactions) { const readiness = getModelReadiness(model, interaction.execution!.operationId, profile); if (validateModelInteraction(model, interaction.id).length || readiness.state !== 'generationReady') { throw new Error('Structured interaction target is incomplete or unsupported: ' + readiness.diagnostics.map(item => item.code + ':' + item.args.join(',')).join(';')); } }
	for (const predicate of predicates) {
		const readiness = getModelReadiness(model, predicate.operationId, profile);
		const operation = model.foundation.blueprint?.operations.find(operation => operation.id === predicate.operationId);
		if (readiness.state !== 'generationReady' || validateModelPredicate(model, predicate).length || operation?.effects.length || operation?.permissions.length || operation?.errors.length) { throw new Error('Pure predicate target is incomplete or unsupported'); }
	}
}

export function predicateFile(id: string): string { const key = Array.from(new TextEncoder().encode(id), byte => byte.toString(16).padStart(2, '0')).join(''); if (key.length > 200) { throw new Error('Tool-assigned predicate identity exceeds physical filename budget'); } return `src/predicate-${key}.mjs`; }

/** Owned code is emitted from the typed domain. Metadata alone never proves executable semantics. */
export function predicateRegion(model: SemanticModelV4, predicate: ModelPredicate): string {
	return start + '// ' + canonicalJson(predicate) + '\n' + emitModelPredicate(model, predicate) + end;
}
export function readPredicateRegion(source: string): { region: string; predicate: ModelPredicate } {
	const a = source.indexOf(start), b = source.indexOf(end);
	if (a < 0 || b < a || source.indexOf(start, a + 1) >= 0 || source.indexOf(end, b + 1) >= 0) { throw new Error('Partial mapping: missing or ambiguous owned region'); }
	const region = source.slice(a, b + end.length); const line = region.slice(start.length).split('\n')[0];
	if (!line.startsWith('// ')) { throw new Error('Partial mapping: missing identity metadata'); }
	return { region, predicate: JSON.parse(line.slice(3)) as ModelPredicate };
}

/** Infer only the small grammar proved by complete re-emission; arbitrary code remains partial. */
export function reversePredicate(model: SemanticModelV4, source: string, baseline: ModelPredicate): ModelPredicate {
	const { region, predicate } = readPredicateRegion(source);
	if (canonicalJson(predicate) !== canonicalJson(baseline)) { throw new Error('Partial mapping: identity metadata changed'); }
	const candidate = structuredClone(baseline);
	for (let index = 0; index < candidate.nodes.length; index++) {
		const node = candidate.nodes[index];
		const prefix = `const v${index}=`; const offset = region.indexOf(prefix);
		if (offset < 0) { throw new Error('Partial mapping: generated declaration missing'); }
		const expression = region.slice(offset + prefix.length).split(';')[0];
		if (node.kind === 'literal') { try { node.value = JSON.parse(expression); } catch { throw new Error('Partial mapping: literal is not JSON'); } }
		if (node.kind === 'compare') {
			const match = /\?null:\(v\d+(===|!==|<=|>=|<|>)v\d+\)$/.exec(expression);
			if (!match) { throw new Error('Partial mapping: comparison changed outside supported grammar'); }
			node.operator = ({ '===': 'eq', '!==': 'ne', '<': 'lt', '<=': 'le', '>': 'gt', '>=': 'ge' } as const)[match[1] as '==='];
		}
	}
	if (validateModelPredicate(model, candidate).length) { throw new Error('Invalid reverse predicate'); }
	// Refresh metadata for this comparison only; executable bytes must match the trusted emitter exactly.
	const oldMetadata = '// ' + canonicalJson(baseline) + '\n', nextMetadata = '// ' + canonicalJson(candidate) + '\n';
	if (region.replace(oldMetadata, nextMetadata) !== predicateRegion(model, candidate)) { throw new Error('Partial mapping: executable code is outside supported grammar'); }
	return candidate;
}

export async function pureProjectRevision(model: SemanticModelV4): Promise<string> { return hashSemanticModel(model); }

export interface MigrationArtifact { version: 1; id: string; from: string; to: string; preconditions: string[]; dataStrategy: string; recovery: string; destructive: boolean; execution: 'manual-only'; deploy: false }
export function migrationArtifact(value: MigrationArtifact): MigrationArtifact {
	if (value.version !== 1 || !value.id || !value.from || !value.to || !value.preconditions.length || value.preconditions.some(entry => !entry.trim()) || !value.dataStrategy.trim() || !value.recovery.trim() || typeof value.destructive !== 'boolean' || value.execution !== 'manual-only' || value.deploy !== false) { throw new Error('Incomplete migration artifact'); }
	return structuredClone(value);
}

export interface ProjectFileImage { content: string; mode: number }
export interface ProjectPhysicalMutation { file: string; before: ProjectFileImage | null; after: ProjectFileImage | null }
export interface ProjectSnapshot { version: 1; id: string; model: SemanticModelV4; artifacts: PredicateArtifact[]; criteriaHash: string; profileHash: string; tests: Record<string, string> }
export interface StructuralProjectSession {
	version: 1; id: string; root: string; worktree: string; baseCommit: string; created: string;
	direction: 'forward' | 'reverse'; status: 'staged' | 'passed' | 'failed' | 'publishing' | 'applied' | 'undoing' | 'undone' | 'rolledBack';
	base: ProjectSnapshot | null; next: ProjectSnapshot; mutations: ProjectPhysicalMutation[]; observed: { file: string; value: ProjectFileImage | null }[];
	modelHash: string; criteria: ProjectCriteria; criteriaHash: string; profileHash: string;
	packets: { request: ModelTaskRequest; packet: ModelTaskPacket }[];
	reviewId: string; calls: 0; cost: null;
	coverage: typeof projectCoverage;
	stackPlan?: import('./modelStack.js').ModelStackPlan;
	sourceInventory?: { file: string; hash: string; mode: number }[];
	verification?: { code: number; output: string; durationMs: number; generated: number; independent: number; revision: string; policy: string };
}
