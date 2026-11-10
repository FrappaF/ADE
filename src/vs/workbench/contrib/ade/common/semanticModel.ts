/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** The domain has no workbench, filesystem, Node or Electron dependencies. */
export const elementKinds = ['feature', 'actor', 'component', 'resource', 'view', 'controller', 'contract', 'action', 'state', 'system', 'container', 'entity', 'table', 'class', 'interface', 'package', 'deploymentNode', 'artifact', 'networkNode', 'useCase', 'process', 'dataStore', 'decision', 'start', 'end'] as const;
export const containmentKinds: readonly ElementKind[] = ['feature', 'component', 'resource', 'controller', 'action', 'system', 'container', 'entity', 'table', 'class', 'interface', 'package', 'deploymentNode', 'networkNode', 'process', 'dataStore'];
export const viewKinds = ['structure', 'activity', 'sequence', 'state', 'c4Context', 'c4Container', 'c4Component', 'erd', 'databaseSchema', 'deployment', 'class', 'useCase', 'component', 'package', 'dataFlow', 'network'] as const;
export type ElementKind = typeof elementKinds[number];
export const relationKinds = ['invocation', 'dependency', 'read', 'write', 'transition', 'realization', 'association', 'inheritance', 'composition', 'aggregation', 'implementation', 'hosting', 'communication', 'dataFlow', 'include', 'extend', 'controlFlow'] as const;
export type RelationKind = typeof relationKinds[number];

export interface ModelField {
	id?: string;
	typeId?: string;
	nullable?: Knowledge;
	name: string;
	type: string;
	required: boolean;
}

export interface ModelBehavior {
	id?: string;
	inputs: ModelField[];
	outputs: ModelField[];
	preconditions: string[];
	postconditions: string[];
	errors: { code: string; description: string }[];
	permissions: { actorId: string; capability: string }[];
	acceptanceCriteria: { id: string; given: string; when: string; then: string }[];
}

/** Language-neutral declarations shared by data, class and infrastructure views. */
export interface ElementDetails {
	technology: string;
	environment: string;
	members: { id?: string; typeId?: string; nullable?: Knowledge; name: string; type: string; kind: 'attribute' | 'method'; key: 'none' | 'primary' | 'foreign' | 'unique'; required: boolean }[];
}
export interface RelationDetails {
	sourceMultiplicity: string;
	sourceMember: string;
	targetMultiplicity: string;
	targetMember: string;
	protocol: string;
}

export interface SemanticElement {
	id: string;
	kind: ElementKind;
	name: string;
	description?: string;
	parentId?: string;
	behavior?: ModelBehavior;
	scope?: 'governed' | 'external';
	runtimeKind?: 'application' | 'service' | 'spa' | 'mobile' | 'store' | 'messaging';
	legacyKind?: 'class';
	details?: ElementDetails;
}

export interface SemanticRelation {
	id: string;
	kind: RelationKind;
	from: string;
	to: string;
	name: string;
	condition?: string;
	errorCode?: string;
	classification?: 'legacy-unclassified';
	details?: RelationDetails;
}

export interface ModelView {
	spec?: { revision: string; intent: string; projectionRevision: string; layoutRevision: string; manualIds: string[] };
	stateMachineId?: string;
	messagingId?: string;
	interactionId?: string;
	id: string;
	featureId?: string;
	/** C4 semantic scope; geometry and feature grouping never determine ownership. */
	subjectId?: string;
	contextIds?: string[];
	name: string;
	kind: typeof viewKinds[number];
	nodes: { elementId: string; x: number; y: number }[];
	relationIds: string[];
}

export interface CodeMapping {
	id: string;
	elementId: string;
	file: string;
	symbol: string;
	revision: string;
}

export interface Verification {
	id: string;
	elementId: string;
	criterionId: string;
	outcome: 'passed' | 'failed' | 'unknown';
	evidence: string;
	revision: string;
}

interface SemanticModelContent {
	id: string;
	name: string;
	semantics: { elements: SemanticElement[]; relations: SemanticRelation[] };
	views: ModelView[];
	codeMappings: CodeMapping[];
	verifications: Verification[];
}

export interface LegacySemanticModel extends SemanticModelContent { version: 2 | 3 }
export interface SemanticModelV4 extends SemanticModelContent { version: 4 | 5; foundation: ModelFoundation }
export interface SemanticModelV5 extends SemanticModelV4 { version: 5 }
export type SemanticModel = LegacySemanticModel | SemanticModelV4;

/** Codes and arguments are translated by UI adapters, never inside the domain. */
export interface ModelDiagnostic {
	code: 'shape' | 'duplicateId' | 'missingReference' | 'incompatibleRelation' | 'containmentCycle' | 'invalidParent' | 'missingCriterion' | 'missingError' | 'viewEndpoint' | 'legacyClassification' | 'ownership' | 'assertionConflict' | 'c4Scope' | 'contract' | 'decisionHistory';
	severity: 'error' | 'warning';
	path: string;
	args: string[];
}

export interface Schema {
	oneOf?: Schema[];
	maxLength?: number;
	maxItems?: number;
	type?: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'integer' | 'null';
	const?: number | string | boolean | null;
	anyOf?: Schema[];
	enum?: readonly string[];
	minLength?: number;
	minimum?: number;
	maximum?: number;
	pattern?: string;
	properties?: Record<string, Schema>;
	required?: string[];
	additionalProperties?: boolean;
	items?: Schema;
	$schema?: string;
	$id?: string;
	title?: string;
}

function object(properties: Record<string, Schema>, optional: string[] = []): Schema {
	return { type: 'object', properties, required: Object.keys(properties).filter(key => !optional.includes(key)), additionalProperties: false };
}

function array(items: Schema): Schema { return { type: 'array', items }; }
const text: Schema = { type: 'string' };
const nonempty: Schema = { type: 'string', minLength: 1, pattern: '\\S' };
const identifier: Schema = { type: 'string', minLength: 1, pattern: '^[A-Za-z0-9][A-Za-z0-9_.:-]*$' };
export function checkShape(value: unknown, schema: Schema, path: string, diagnostics: ModelDiagnostic[]): void {
	if (schema.anyOf) {
		if (!schema.anyOf.some(branch => { const errors: ModelDiagnostic[] = []; checkShape(value, branch, path, errors); return errors.length === 0; })) { diagnostics.push({ code: 'shape', severity: 'error', path, args: ['union'] }); }
		return;
	}
	if (schema.type === 'null') {
		if (value !== null) { diagnostics.push({ code: 'shape', severity: 'error', path, args: ['null'] }); }
		return;
	}
	const fail = (expected: string) => diagnostics.push({ code: 'shape', severity: 'error', path, args: [expected] });
	if (schema.type === 'object') {
		if (value === null || typeof value !== 'object' || Array.isArray(value)) {
			fail('object');
			return;
		}
		const record = value as Record<string, unknown>;
		for (const key of schema.required ?? []) {
			if (!Object.hasOwn(record, key)) {
				diagnostics.push({ code: 'shape', severity: 'error', path: `${path}/${key}`, args: ['required'] });
			}
		}
		for (const [key, child] of Object.entries(record)) {
			if (Object.hasOwn(schema.properties ?? {}, key)) {
				checkShape(child, schema.properties![key], `${path}/${key}`, diagnostics);
			} else if (schema.additionalProperties === false) {
				diagnostics.push({ code: 'shape', severity: 'error', path: `${path}/${key}`, args: ['unexpected property'] });
			}
		}
	} else if (schema.type === 'array') {
		if (!Array.isArray(value)) {
			fail('array');
			return;
		}
		value.forEach((child, index) => checkShape(child, schema.items!, `${path}/${index}`, diagnostics));
	} else {
		const expected = schema.type === 'integer' ? 'number' : schema.type;
		if (typeof value !== expected || (typeof value === 'number' && (!Number.isFinite(value) || (schema.type === 'integer' && !Number.isInteger(value))))) {
			fail(schema.type!);
			return;
		}
		if (typeof value === 'number' && (schema.minimum !== undefined && value < schema.minimum || schema.maximum !== undefined && value > schema.maximum)) { fail('range'); }
		if (schema.const !== undefined && value !== schema.const) {
			fail(String(schema.const));
		}
		if (schema.enum && !schema.enum.includes(value as string)) {
			fail(schema.enum.join(' | '));
		}
		if (typeof value === 'string' && ((schema.minLength !== undefined && value.length < schema.minLength) || (schema.pattern && !new RegExp(schema.pattern).test(value)))) {
			fail(schema.pattern ?? `minLength ${schema.minLength}`);
		}
	}
}


/** Absence is explicit in new contracts. A known null, empty string and false retain their meanings. */
export type Knowledge = { state: 'unknown'; reason: string } | { state: 'omitted' } | { state: 'known'; value: string | number | boolean | null };
export type ObjectKind = 'element' | 'relation' | 'field' | 'operation' | 'occurrence' | 'frame' | 'interaction' | 'type' | 'decision' | 'binding' | 'ownership' | 'membership' | 'integration' | 'interface' | 'port' | 'connection' | 'transport' | 'module' | 'fieldMapping' | 'error' | 'predicate' | 'stateMachine' | 'messaging';
export interface ModelReference { kind: ObjectKind; id: string }
/** Exact source anchors; offsets use UTF-16 and are never rebased implicitly. */
export interface EvidenceRecord {
	id: string; revision: string; file: string; start: number; end: number; encoding: 'utf-16';
	producer: string; producerVersion: string; nature: 'syntax' | 'reference' | 'text' | 'documentation' | 'runtime';
	factIds: string[];
}
export interface DescriptiveScenario {
	trigger: string; scope: string; participantIds: string[]; evidenceIds: string[];
	order: { before: string; after: string; evidenceIds: string[]; basis: 'extracted' | 'inferred' | 'observed' | 'authored' }[];
}
export interface ModelAssertion {
	evidenceIds?: string[];
	id: string;
	subject: ModelReference;
	field: string;
	value: Knowledge;
	provenance: { kind: 'authored' | 'extracted' | 'inferred' | 'observed'; producer: string; revision: string };
	acceptance: { status: 'proposed' | 'accepted' | 'rejected'; revision: string };
	verification?: { checkId: string; revision: string; outcome: 'passed' | 'failed' | 'unknown'; evidence: string };
}
/** Contract capabilities shared with validation and the provider grammar; these are not runtime semantics. */
export const blueprintRules = {
	operationOwners: ['component', 'interface', 'contract', 'class', 'controller'],
	portOwners: ['component', 'controller', 'container', 'system'],
	interfaceElements: ['interface', 'contract'],
	compatibility: { interfaceSatisfaction: 'one-explicit-provider-per-required-port', inputs: 'consumer-to-provider', outputs: 'provider-to-consumer', errors: 'provider-subset-of-consumer', effects: 'provider-subset-of-consumer', permissions: 'provider-subset-of-consumer', presence: 'required-target-needs-required-source', nullability: 'known-boolean-independent-of-presence', unknown: 'blocks' },
	decisions: { activeStatus: 'accepted', comparison: ['equals', 'notEquals'], precedence: 'none', supersession: 'explicit-accepted-replacement', revision: 'preserve-previous-complete-snapshot' },
	c4: { context: 'governed-system', container: 'governed-system', component: 'one-container', contract: 'shared-definition-only', external: 'context-only', foreignElements: 'explicit-context', sharedLibrary: 'one-nondeployable-package-with-consumer-bindings' }
} as const;

/** Shared declarations: projections and calls retain references to these definitions. */
export interface ModelType {
	id: string; name: string; fields: ModelField[];
	kind?: 'primitive' | 'record' | 'enum' | 'collection' | 'reference';
	primitive?: string; values?: string[]; itemTypeId?: string; targetTypeId?: string;
	constraints?: { id: string; kind: 'minimum' | 'maximum' | 'pattern' | 'minLength' | 'maxLength'; value: string | number }[];
}
export interface ModelOperation extends ModelBehavior {
	id: string; ownerId: string; name: string;
	errors: { id: string; code: string; description: string; typeId: string }[];
	effects: string[];
}
export interface ModelBlueprint {
	operations: ModelOperation[];
	interfaces: { id: string; elementId: string; version: string; operationIds: string[]; invariants: string[] }[];
	ports: { id: string; elementId: string; interfaceId: string; direction: 'provided' | 'required' }[];
	connections: { id: string; requiredPortId: string; providedPortId: string; operations: { requiredOperationId: string; providedOperationId: string }[] }[];
	transports: { id: string; relationId: string; protocol: string; format: string; schemaTypeId: string; schemaVersion: string }[];
	modules: { id: string; elementId: string; consumerIds: string[]; library: Knowledge; version: Knowledge }[];
	fieldMappings: { id: string; domainFieldId: string; targetFieldId: string; targetKind: 'column' | 'member' }[];
}
export type DecisionStatus = 'proposed' | 'accepted' | 'rejected' | 'deprecated' | 'superseded';
export interface DecisionConstraint {
	id: string; subject: ModelReference; field: string; value: Knowledge;
	category?: 'technology' | 'library' | 'protocol' | 'dependency' | 'persistence' | 'concurrency';
	operator?: 'equals' | 'notEquals';
}
export interface ModelDecision {
	id: string; revision: string; status: DecisionStatus; scopeIds: string[]; constraints: DecisionConstraint[];
	record?: {
		number: string; title: string; context: string; decision: string; consequences: string[];
		supersededById?: string;
		history: { revision: string; status: DecisionStatus; scopeIds: string[]; constraints: DecisionConstraint[]; number?: string; title?: string; context?: string; decision?: string; consequences?: string[]; supersededById?: string }[];
	};
}

/** Portable pure predicate graph. Node IDs are local to one predicate, with definition before use. */
export type PredicateNode =
	| { id: string; kind: 'literal'; typeId: string; value: string | number | boolean | null }
	| { id: string; kind: 'reference'; fieldId: string; path: string[] }
	| { id: string; kind: 'compare'; operator: 'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge'; left: string; right: string }
	| { id: string; kind: 'logic'; operator: 'and' | 'or' | 'not'; operands: string[] }
	| { id: string; kind: 'check'; operator: 'present' | 'isNull'; operand: string }
	| { id: string; kind: 'arithmetic'; operator: 'add' | 'subtract' | 'multiply' | 'divide' | 'remainder'; left: string; right: string }
	| { id: string; kind: 'collection'; operator: 'count'; operand: string; typeId: string }
	| { id: string; kind: 'collection'; operator: 'any' | 'every'; operand: string; value: string; comparison: 'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge' };
export interface ModelExpression { version: 1; rootId: string; nodes: PredicateNode[] }
export interface InteractionArgument { fieldId: string; expression: ModelExpression }
export interface MessageExecution {
	mode: 'sync' | 'async'; arguments: InteractionArgument[]; resultId: string;
	response: 'required'; failure: 'propagate'; timeoutMs: number; correlation: ModelExpression;
}
export interface ModelOccurrence { profile?: 'descriptive'; name?: string; evidenceIds?: string[]; messagingBindingId?: string; id: string; operationId?: string; from: string; to: string; errorId?: string; execution?: MessageExecution }
interface FrameBase { id: string; occurrenceIds: string[] }
export type ModelFrame = FrameBase & (
	| { kind: 'unspecified'; description?: { operator: 'alt' | 'opt' | 'par' | 'loop'; operands: { id: string; condition: Knowledge; steps: string[]; evidenceIds: string[] }[] } }
	| { kind: 'alt'; selection: 'exclusive'; operands: { id: string; guard: ModelExpression | null; steps: string[] }[] }
	| { kind: 'opt'; guard: ModelExpression; steps: string[] }
	| { kind: 'loop'; guard: ModelExpression; steps: string[]; iterationId: string; iterationTypeId: string; maxIterations: number; limit: 'error' }
	| { kind: 'par'; operands: { id: string; steps: string[] }[]; join: 'all'; failure: 'cancel' | 'collect'; resultOrder: 'declared'; resultId: string }
	| { kind: 'critical'; resource: string; scope: 'interaction'; steps: string[] }
	| { kind: 'ref'; interactionId: string; revision: string; arguments: InteractionArgument[]; resultId: string }
);
export interface ModelInteraction {
	profile?: 'descriptive' | 'executable'; description?: DescriptiveScenario;
	id: string; ownerId?: string; occurrenceIds: string[]; frameIds: string[]; legacyViewId?: string; legacyRelationOrder?: string[];
	execution?: { version: 1; revision: string; operationId: string; steps: string[]; outputs: InteractionArgument[] };
}
export interface ModelPredicate { id: string; version: 1; operationId: string; phase: 'pre' | 'post'; rootId: string; nodes: PredicateNode[] }

/** Flat executable lifecycle; legacy hierarchical diagrams are preserved independently. */
export interface ModelStateMachine {
	id: string; version: 1; revision: string; ownerId: string; operationId: string;
	profile: 'flat'; initialIds: string[]; finalIds: string[]; persistence: 'snapshot-v1';
	states: { elementId: string; entry: string[]; exit: string[]; doActionId?: string }[];
	events: { id: string; operationId: string; subscriptionId?: string }[];
	actions: { id: string; interactionId: string; revision: string; arguments: InteractionArgument[] }[];
	transitions: { id: string; from: string; to: string; eventId: string; kind: 'internal' | 'external'; priority: number; guard: ModelExpression | null; effects: string[] }[];
}

/** Explicit logical topology, separate from deployable broker containers. */
export interface ModelMessaging {
	id: string; version: 1; revision: string;
	brokers: { id: string; elementId: string; engine: 'nats-jetstream'; version: '2.11.9'; endpointRef: string; credentialRef: 'none' }[];
	messages: { id: string; name: string; version: string; payloadTypeId: string; compatibility: 'exact'; routingFieldId: string; correlationFieldId: string }[];
	channels: { id: string; name: string; brokerId: string; kind: 'queue' | 'topic'; messageId: string; subject: string; storage: 'file'; maxMessages: number; duplicateWindowMs: number }[];
	publishers: { id: string; channelId: string; ownerId: string; operationId: string }[];
	subscriptions: { id: string; channelId: string; ownerId: string; operationId: string; durable: string; delivery: 'at-least-once'; ack: 'explicit'; ackWaitMs: number; maxAttempts: number; backoffMs: number[]; deadLetter: { subject: string }; ordering: 'serial'; idempotency: 'none' | 'file-ledger-v1' }[];
}

/** User-authored task intent. Each revision keeps the preceding complete intent. */
export interface ModelTaskIntent {
	id: string; target: ModelReference; revision: string; text: string;
	clarifications: { question: string; answer: string }[];
	history: { revision: string; text: string; clarifications: { question: string; answer: string }[] }[];
}
export interface ModelFoundation {
	evidence?: EvidenceRecord[];
	tasks?: ModelTaskIntent[];
	messaging?: ModelMessaging[];
	stateMachines?: ModelStateMachine[];
	predicates?: ModelPredicate[];
	ownership: { id: string; elementId: string; ownerId: string; role: 'architecture' | 'lifecycle' }[];
	memberships: { id: string; elementId: string; featureId: string }[];
	integrations: { id: string; consumerId: string; externalId: string }[];
	types: ModelType[];
	blueprint?: ModelBlueprint;
	/** Calls refer to a shared behavior or method definition, never copy the operation. */
	occurrences: ModelOccurrence[];
	/** Legacy unspecified frames remain drafts; executable frames have explicit policies. */
	frames: ModelFrame[];
	interactions: ModelInteraction[];
	assertions: ModelAssertion[];
	platform: { bindings: { id: string; elementId: string; profileId: string; technology: Knowledge }[] };
	decisions: ModelDecision[];
	/** Legacy parentId is retained verbatim, never silently reinterpreted as architecture. */
	migration?: { sourceVersion: 2 | 3; unresolvedOwnershipIds: string[] };
}

export const knowledgeSchema: Schema = { anyOf: [
	object({ state: { type: 'string', enum: ['unknown'] }, reason: nonempty }),
	object({ state: { type: 'string', enum: ['omitted'] } }),
	object({ state: { type: 'string', enum: ['known'] }, value: { anyOf: [{ type: 'null' }, text, { type: 'number' }, { type: 'boolean' }] } })
] };
export const predicateSchema: Schema = object({ id: identifier, version: { type: 'integer', const: 1 }, operationId: identifier, phase: { type: 'string', enum: ['pre', 'post'] }, rootId: identifier, nodes: array({ anyOf: [
	object({ id: identifier, kind: { type: 'string', const: 'literal' }, typeId: identifier, value: { anyOf: [text, { type: 'number' }, { type: 'boolean' }, { type: 'null' }] } }),
	object({ id: identifier, kind: { type: 'string', const: 'reference' }, fieldId: identifier, path: array(identifier) }),
	object({ id: identifier, kind: { type: 'string', const: 'compare' }, operator: { type: 'string', enum: ['eq', 'ne', 'lt', 'le', 'gt', 'ge'] }, left: identifier, right: identifier }),
	object({ id: identifier, kind: { type: 'string', const: 'logic' }, operator: { type: 'string', enum: ['and', 'or', 'not'] }, operands: array(identifier) }),
	object({ id: identifier, kind: { type: 'string', const: 'check' }, operator: { type: 'string', enum: ['present', 'isNull'] }, operand: identifier }),
	object({ id: identifier, kind: { type: 'string', const: 'arithmetic' }, operator: { type: 'string', enum: ['add', 'subtract', 'multiply', 'divide', 'remainder'] }, left: identifier, right: identifier }),
	object({ id: identifier, kind: { type: 'string', const: 'collection' }, operator: { type: 'string', const: 'count' }, operand: identifier, typeId: identifier }),
	object({ id: identifier, kind: { type: 'string', const: 'collection' }, operator: { type: 'string', enum: ['any', 'every'] }, operand: identifier, value: identifier, comparison: { type: 'string', enum: ['eq', 'ne', 'lt', 'le', 'gt', 'ge'] } })
] }) });
export const expressionSchema: Schema = object({ version: { type: 'integer', const: 1 }, rootId: identifier, nodes: predicateSchema.properties!.nodes });
const argumentSchema = object({ fieldId: identifier, expression: expressionSchema });
const stepsSchema = array(identifier);
const frameFields = { id: identifier, occurrenceIds: array(identifier) };
const frameSchema: Schema = { anyOf: [
	object({ ...frameFields, kind: { type: 'string', const: 'unspecified' } }),
	object({ ...frameFields, kind: { type: 'string', const: 'alt' }, selection: { type: 'string', const: 'exclusive' }, operands: array(object({ id: identifier, guard: { anyOf: [expressionSchema, { type: 'null' }] }, steps: stepsSchema })) }),
	object({ ...frameFields, kind: { type: 'string', const: 'opt' }, guard: expressionSchema, steps: stepsSchema }),
	object({ ...frameFields, kind: { type: 'string', const: 'loop' }, guard: expressionSchema, steps: stepsSchema, iterationId: identifier, iterationTypeId: identifier, maxIterations: { type: 'integer', minimum: 1, maximum: 1000 }, limit: { type: 'string', const: 'error' } }),
	object({ ...frameFields, kind: { type: 'string', const: 'par' }, operands: array(object({ id: identifier, steps: stepsSchema })), join: { type: 'string', const: 'all' }, failure: { type: 'string', enum: ['cancel', 'collect'] }, resultOrder: { type: 'string', const: 'declared' }, resultId: identifier }),
	object({ ...frameFields, kind: { type: 'string', const: 'critical' }, resource: nonempty, scope: { type: 'string', const: 'interaction' }, steps: stepsSchema }),
	object({ ...frameFields, kind: { type: 'string', const: 'ref' }, interactionId: identifier, revision: nonempty, arguments: array(argumentSchema), resultId: identifier })
] };
const clarificationSchema = object({ question: nonempty, answer: nonempty });
const intentFields = { revision: nonempty, text: nonempty, clarifications: array(clarificationSchema) };
const referenceSchema = object({ kind: { type: 'string', enum: ['element', 'relation', 'field', 'operation', 'occurrence', 'frame', 'interaction', 'type', 'decision', 'binding', 'ownership', 'membership', 'integration', 'interface', 'port', 'connection', 'transport', 'module', 'fieldMapping', 'error', 'predicate', 'stateMachine', 'messaging'] }, id: identifier });
const pointer: Schema = { type: 'string', pattern: '^(?:/(?:[^~/]|~[01])*)+$' };
const constraintSchema = object({ id: identifier, subject: referenceSchema, field: pointer, value: knowledgeSchema, category: { type: 'string', enum: ['technology', 'library', 'protocol', 'dependency', 'persistence', 'concurrency'] }, operator: { type: 'string', enum: ['equals', 'notEquals'] } }, ['category', 'operator']);
const decisionStatus: Schema = { type: 'string', enum: ['proposed', 'accepted', 'rejected', 'deprecated', 'superseded'] };
const decisionRecord = { number: nonempty, title: nonempty, context: text, decision: text, consequences: array(text), supersededById: identifier };
const historySchema = object({ revision: nonempty, status: decisionStatus, scopeIds: array(identifier), constraints: array(constraintSchema), ...decisionRecord }, ['number', 'title', 'context', 'decision', 'consequences', 'supersededById']);

/** The same schema is exported, validated locally and included in the initial AI grammar. */
function createSemanticModelV4Schema(legacy: Schema): Schema {
	const schema = structuredClone(legacy);
	schema.$id = 'urn:ade:model:4'; schema.title = 'A.D.E semantic model v4';
	schema.properties!.version = { type: 'integer', const: 4 };
	const element = schema.properties!.semantics.properties!.elements.items!;
	element.properties!.runtimeKind = { type: 'string', enum: ['application', 'service', 'spa', 'mobile', 'store', 'messaging'] };
	element.properties!.scope = { type: 'string', enum: ['governed', 'external'] };
	const behavior = element.properties!.behavior;
	behavior.properties!.id = identifier; behavior.required!.push('id');
	for (const section of ['inputs', 'outputs']) { identifyField(behavior.properties![section].items!); }
	const member = element.properties!.details.properties!.members.items!;
	identifyField(member);
	const field = object({ id: identifier, name: nonempty, type: text, typeId: identifier, required: { type: 'boolean' }, nullable: knowledgeSchema }, ['typeId', 'nullable']);
	const operation = structuredClone(behavior);
	Object.assign(operation.properties!, { ownerId: identifier, name: nonempty, effects: array(text), errors: array(object({ id: identifier, code: nonempty, description: text, typeId: identifier })) });
	operation.required!.push('ownerId', 'name', 'effects');
	const view = schema.properties!.views.items!;
	Object.assign(view.properties!, { subjectId: identifier, contextIds: array(identifier), interactionId: identifier, stateMachineId: identifier, messagingId: identifier });
	schema.properties!.foundation = object({
		messaging: array(object({ id: identifier, version: { type: 'integer', const: 1 }, revision: nonempty,
			brokers: array(object({ id: identifier, elementId: identifier, engine: { type: 'string', const: 'nats-jetstream' }, version: { type: 'string', const: '2.11.9' }, endpointRef: nonempty, credentialRef: { type: 'string', const: 'none' } })),
			messages: array(object({ id: identifier, name: nonempty, version: nonempty, payloadTypeId: identifier, compatibility: { type: 'string', const: 'exact' }, routingFieldId: identifier, correlationFieldId: identifier })),
			channels: array(object({ id: identifier, name: nonempty, brokerId: identifier, kind: { type: 'string', enum: ['queue', 'topic'] }, messageId: identifier, subject: nonempty, storage: { type: 'string', const: 'file' }, maxMessages: { type: 'integer', minimum: 1, maximum: 100000 }, duplicateWindowMs: { type: 'integer', minimum: 100, maximum: 120000 } })),
			publishers: array(object({ id: identifier, channelId: identifier, ownerId: identifier, operationId: identifier })),
			subscriptions: array(object({ id: identifier, channelId: identifier, ownerId: identifier, operationId: identifier, durable: nonempty, delivery: { type: 'string', const: 'at-least-once' }, ack: { type: 'string', const: 'explicit' }, ackWaitMs: { type: 'integer', minimum: 100, maximum: 30000 }, maxAttempts: { type: 'integer', minimum: 1, maximum: 10 }, backoffMs: array({ type: 'integer', minimum: 100, maximum: 30000 }), deadLetter: object({ subject: nonempty }), ordering: { type: 'string', const: 'serial' }, idempotency: { type: 'string', enum: ['none', 'file-ledger-v1'] } }))
		})),
		stateMachines: array(object({ id: identifier, version: { type: 'integer', const: 1 }, revision: nonempty, ownerId: identifier, operationId: identifier, profile: { type: 'string', const: 'flat' }, initialIds: array(identifier), finalIds: array(identifier), persistence: { type: 'string', const: 'snapshot-v1' },
			states: array(object({ elementId: identifier, entry: array(identifier), exit: array(identifier), doActionId: identifier }, ['doActionId'])),
			events: array(object({ id: identifier, operationId: identifier, subscriptionId: identifier }, ['subscriptionId'])),
			actions: array(object({ id: identifier, interactionId: identifier, revision: nonempty, arguments: array(argumentSchema) })),
			transitions: array(object({ id: identifier, from: identifier, to: identifier, eventId: identifier, kind: { type: 'string', enum: ['internal', 'external'] }, priority: { type: 'integer', minimum: 0, maximum: 1000 }, guard: { anyOf: [expressionSchema, { type: 'null' }] }, effects: array(identifier) }))
		})),
	tasks: array(object({ id: identifier, target: referenceSchema, ...intentFields, history: array(object(intentFields)) })),
	predicates: array(predicateSchema),
		ownership: array(object({ id: identifier, elementId: identifier, ownerId: identifier, role: { type: 'string', enum: ['architecture', 'lifecycle'] } })),
		memberships: array(object({ id: identifier, elementId: identifier, featureId: identifier })),
		integrations: array(object({ id: identifier, consumerId: identifier, externalId: identifier })),
		types: array(object({ id: identifier, name: nonempty, fields: array(field), kind: { type: 'string', enum: ['primitive', 'record', 'enum', 'collection', 'reference'] }, primitive: nonempty, values: array(nonempty), itemTypeId: identifier, targetTypeId: identifier, constraints: array(object({ id: identifier, kind: { type: 'string', enum: ['minimum', 'maximum', 'pattern', 'minLength', 'maxLength'] }, value: { anyOf: [text, { type: 'number' }] } })) }, ['kind', 'primitive', 'values', 'itemTypeId', 'targetTypeId', 'constraints'])),
		blueprint: object({
			operations: array(operation),
			interfaces: array(object({ id: identifier, elementId: identifier, version: nonempty, operationIds: array(identifier), invariants: array(text) })),
			ports: array(object({ id: identifier, elementId: identifier, interfaceId: identifier, direction: { type: 'string', enum: ['provided', 'required'] } })),
			connections: array(object({ id: identifier, requiredPortId: identifier, providedPortId: identifier, operations: array(object({ requiredOperationId: identifier, providedOperationId: identifier })) })),
			transports: array(object({ id: identifier, relationId: identifier, protocol: nonempty, format: nonempty, schemaTypeId: identifier, schemaVersion: nonempty })),
			modules: array(object({ id: identifier, elementId: identifier, consumerIds: array(identifier), library: knowledgeSchema, version: knowledgeSchema })),
			fieldMappings: array(object({ id: identifier, domainFieldId: identifier, targetFieldId: identifier, targetKind: { type: 'string', enum: ['column', 'member'] } }))
		}),
		occurrences: array(object({ id: identifier, operationId: identifier, from: identifier, to: identifier, errorId: identifier, messagingBindingId: identifier, execution: object({ mode: { type: 'string', enum: ['sync', 'async'] }, arguments: array(argumentSchema), resultId: identifier, response: { type: 'string', const: 'required' }, failure: { type: 'string', const: 'propagate' }, timeoutMs: { type: 'integer', minimum: 1, maximum: 30000 }, correlation: expressionSchema }) }, ['errorId', 'execution', 'messagingBindingId'])),
		frames: array(frameSchema),
		interactions: array(object({ id: identifier, ownerId: identifier, occurrenceIds: array(identifier), frameIds: array(identifier), legacyViewId: identifier, legacyRelationOrder: array(identifier), execution: object({ version: { type: 'integer', const: 1 }, revision: nonempty, operationId: identifier, steps: stepsSchema, outputs: array(argumentSchema) }) }, ['ownerId', 'legacyViewId', 'legacyRelationOrder', 'execution'])),
		assertions: array(object({
			id: identifier, subject: referenceSchema, field: pointer, value: knowledgeSchema,
			provenance: object({ kind: { type: 'string', enum: ['authored', 'extracted', 'inferred', 'observed'] }, producer: nonempty, revision: nonempty }),
			acceptance: object({ status: { type: 'string', enum: ['proposed', 'accepted', 'rejected'] }, revision: nonempty }),
			verification: object({ checkId: identifier, revision: nonempty, outcome: { type: 'string', enum: ['passed', 'failed', 'unknown'] }, evidence: nonempty })
		}, ['verification'])),
		platform: object({ bindings: array(object({ id: identifier, elementId: identifier, profileId: identifier, technology: knowledgeSchema })) }),
		decisions: array(object({ id: identifier, revision: nonempty, status: decisionStatus, scopeIds: array(identifier), constraints: array(constraintSchema), record: object({ ...decisionRecord, history: array(historySchema) }, ['supersededById']) }, ['record'])),
		migration: object({ sourceVersion: { type: 'integer', anyOf: [{ type: 'integer', const: 2 }, { type: 'integer', const: 3 }] }, unresolvedOwnershipIds: array(identifier) })
	}, ['migration', 'blueprint', 'predicates', 'stateMachines', 'messaging', 'tasks']);
	schema.required!.push('foundation');
	return schema;
}

function identifyField(schema: Schema): void {
	schema.properties!.id = identifier;
	if (!schema.required!.includes('id')) { schema.required!.push('id'); }
	schema.properties!.typeId = identifier;
	schema.properties!.nullable = knowledgeSchema;
	// An unresolved type is a draft, not an invented primitive.
	schema.properties!.type = text;
}

/** A blueprint is opt-in: old v4 drafts do not receive invented contracts. */
export function emptyBlueprint(): ModelBlueprint { return { operations: [], interfaces: [], ports: [], connections: [], transports: [], modules: [], fieldMappings: [] }; }

/** New projects contain no default platform, external service, behavioral frame or verification. */
export function emptyFoundation(): ModelFoundation {
	return { ownership: [], memberships: [], integrations: [], types: [], occurrences: [], frames: [], interactions: [], assertions: [], platform: { bindings: [] }, decisions: [] };
}

/** A namespace-qualified index preserves all existing legacy IDs, including cross-namespace reuse. */
export function modelObjects(model: SemanticModelV4): Map<string, object> {
	const objects = new Map<string, object>();
	const add = (kind: ObjectKind, item: { id?: string }) => { if (item.id) { objects.set(`${kind}:${item.id}`, item); } };
	for (const element of model.semantics.elements) {
		add('element', element);
		if (element.behavior) {
			add('operation', element.behavior);
			for (const field of [...element.behavior.inputs, ...element.behavior.outputs]) { add('field', field); }
		}
		for (const member of element.details?.members ?? []) { add(member.kind === 'method' ? 'operation' : 'field', member); }
	}
	for (const relation of model.semantics.relations) { add('relation', relation); }
	for (const predicate of model.foundation.predicates ?? []) { add('predicate', predicate); }
	for (const machine of model.foundation.stateMachines ?? []) { add('stateMachine', machine); }
	for (const topology of model.foundation.messaging ?? []) { add('messaging', topology); }
	for (const [key, kind] of [['ownership', 'ownership'], ['memberships', 'membership'], ['integrations', 'integration'], ['types', 'type'], ['occurrences', 'occurrence'], ['frames', 'frame'], ['interactions', 'interaction'], ['decisions', 'decision']] as const) {
		for (const item of model.foundation[key]) { add(kind, item); }
	}
	const blueprint = model.foundation.blueprint;
	if (blueprint) {
		for (const [section, kind] of [['operations', 'operation'], ['interfaces', 'interface'], ['ports', 'port'], ['connections', 'connection'], ['transports', 'transport'], ['modules', 'module'], ['fieldMappings', 'fieldMapping']] as const) { for (const item of blueprint[section]) { add(kind, item); } }
		for (const operation of blueprint.operations) { for (const field of [...operation.inputs, ...operation.outputs]) { add('field', field); } for (const error of operation.errors) { add('error', error); } }
	}
	for (const type of model.foundation.types) { for (const field of type.fields) { add('field', field); } }
	for (const binding of model.foundation.platform.bindings) { add('binding', binding); }
	return objects;
}

/** Checks identity, references and ownership independently from target generation rules. */
function validateV4References(value: SemanticModel): ModelDiagnostic[] {
	const model = value as SemanticModelV4;
	const f = model.foundation;
	const diagnostics: ModelDiagnostic[] = [];
	const report = (code: ModelDiagnostic['code'], path: string, ...args: string[]) => diagnostics.push({ code, path, args, severity: 'error' });
	const elements = new Map(model.semantics.elements.map(element => [element.id, element]));
	const objects = modelObjects(model);
	const reference = (kind: ObjectKind, id: string, path: string) => { if (!objects.has(`${kind}:${id}`)) { report('missingReference', path, id); } };
	const unique = (items: { id?: string }[], path: string) => {
		const seen = new Set<string>();
		for (const item of items) { if (item.id && seen.has(item.id)) { report('duplicateId', path, item.id); } if (item.id) { seen.add(item.id); } }
	};
	for (const [key, items] of Object.entries(f)) { if (Array.isArray(items)) { unique(items, `/foundation/${key}`); } }
	unique(f.platform.bindings, '/foundation/platform/bindings');
	const fields: ModelField[] = f.types.flatMap(type => type.fields);
	const operations: { id?: string }[] = [];
	for (const [elementIndex, element] of model.semantics.elements.entries()) {
		const elementPath = `/semantics/elements/${elementIndex}`;
		if (element.scope && element.kind !== 'system') { report('ownership', `${elementPath}/scope`, element.id, 'systemScopeOnly'); }
		if (element.behavior) { operations.push(element.behavior); fields.push(...element.behavior.inputs, ...element.behavior.outputs); }
		for (const member of element.details?.members ?? []) { if (member.kind === 'method') { operations.push(member); } else { fields.push(member); } }
		for (const [section, members] of [['behavior/inputs', element.behavior?.inputs ?? []], ['behavior/outputs', element.behavior?.outputs ?? []], ['details/members', element.details?.members ?? []]] as const) {
			members.forEach((member, index) => { if (member.typeId) { reference('type', member.typeId, `${elementPath}/${section}/${index}/typeId`); } });
		}
	}
	unique(fields, '/fields'); unique(operations, '/operations');
	for (const type of f.types) { for (const field of type.fields) { if (field.typeId) { reference('type', field.typeId, `/foundation/types/${type.id}/fields/${field.id}/typeId`); } } }
	const ownership = new Map<string, string>();
	for (const entry of f.ownership) {
		const path = `/foundation/ownership/${entry.id}`;
		reference('element', entry.elementId, path + '/elementId'); reference('element', entry.ownerId, path + '/ownerId');
		if (ownership.has(entry.elementId)) { report('ownership', path, entry.elementId, 'multipleOwners'); }
		ownership.set(entry.elementId, entry.ownerId);
		const owner = elements.get(entry.ownerId); const child = elements.get(entry.elementId);
		const architecturalOwners: readonly ElementKind[] = ['system', 'container', 'component', 'package', 'class', 'interface'];
		if (owner && child && (entry.role === 'lifecycle' ? child.kind !== 'state' || !['resource', 'entity', 'class'].includes(owner.kind) : !architecturalOwners.includes(owner.kind) || ['feature', 'actor', 'state'].includes(child.kind))) { report('ownership', path, entry.elementId, 'invalidOwner'); }
	}
	for (const entry of f.ownership) {
		const seen = new Set([entry.elementId]); let owner: string | undefined = entry.ownerId;
		while (owner) { if (seen.has(owner)) { report('containmentCycle', `/foundation/ownership/${entry.id}`, entry.elementId); break; } seen.add(owner); owner = ownership.get(owner); }
	}
	const memberships = new Set<string>();
	for (const entry of f.memberships) {
		const path = `/foundation/memberships/${entry.id}`;
		reference('element', entry.elementId, path + '/elementId'); reference('element', entry.featureId, path + '/featureId');
		if (elements.get(entry.featureId)?.kind !== 'feature') { report('ownership', path, entry.featureId, 'expectedFeature'); }
		const key = `${entry.featureId}:${entry.elementId}`; if (memberships.has(key)) { report('ownership', path, entry.elementId, 'duplicateMembership'); } memberships.add(key);
	}
	for (const entry of f.integrations) {
		const path = `/foundation/integrations/${entry.id}`;
		reference('element', entry.consumerId, path + '/consumerId'); reference('element', entry.externalId, path + '/externalId');
		if (elements.get(entry.externalId)?.scope !== 'external') { report('ownership', path, entry.externalId, 'expectedExternal'); }
	}
	for (const topology of f.messaging ?? []) {
		const path = `/foundation/messaging/${topology.id}`;
		for (const broker of topology.brokers) { reference('element', broker.elementId, path + '/brokers'); }
		for (const message of topology.messages) { reference('type', message.payloadTypeId, path + '/messages'); }
		for (const binding of [...topology.publishers, ...topology.subscriptions]) { reference('element', binding.ownerId, path + '/bindings'); reference('operation', binding.operationId, path + '/bindings'); }
	}
	for (const view of model.views.filter(view => view.messagingId)) { reference('messaging', view.messagingId!, `/views/${view.id}/messagingId`); }
	for (const machine of f.stateMachines ?? []) { const path = `/foundation/stateMachines/${machine.id}`; reference('element', machine.ownerId, path + '/ownerId'); reference('operation', machine.operationId, path + '/operationId'); for (const state of machine.states) { reference('element', state.elementId, path + '/states'); } for (const event of machine.events) { reference('operation', event.operationId, path + '/events'); } for (const action of machine.actions) { reference('interaction', action.interactionId, path + '/actions'); } }
	for (const view of model.views.filter(view => view.stateMachineId)) { reference('stateMachine', view.stateMachineId!, `/views/${view.id}/stateMachineId`); if (view.kind !== 'state') { report('contract', `/views/${view.id}`, view.id, 'stateViewKind'); } }
	for (const view of model.views.filter(view => view.interactionId)) { reference('interaction', view.interactionId!, `/views/${view.id}/interactionId`); if (view.kind !== 'sequence' && !(model.version === 5 && view.kind === 'activity' && f.interactions.some(interaction => interaction.id === view.interactionId && interaction.profile === 'descriptive'))) { report('contract', `/views/${view.id}`, view.id, 'interactionViewKind'); } }
	for (const entry of f.occurrences) {
		const path = `/foundation/occurrences/${entry.id}`;
		if (entry.profile !== 'descriptive') { reference('operation', entry.operationId ?? '', path + '/operationId'); } reference('element', entry.from, path + '/from'); reference('element', entry.to, path + '/to');
		const target = elements.get(entry.to);
		if (target && entry.profile !== 'descriptive' && !entry.messagingBindingId && !f.blueprint?.operations.some(operation => operation.id === entry.operationId && (operation.ownerId === target.id || f.blueprint?.ports.some(port => port.elementId === target.id && port.direction === 'provided' && f.blueprint?.interfaces.some(contract => contract.id === port.interfaceId && contract.operationIds.includes(operation.id)))) ) && target.behavior?.id !== entry.operationId && !target.details?.members.some(member => member.kind === 'method' && member.id === entry.operationId)) { report('ownership', path, entry.operationId ?? '', 'operationOwner'); }
	}
	for (const occurrence of f.occurrences.filter(entry => entry.messagingBindingId)) {
		const publishers = (f.messaging ?? []).flatMap(topology => topology.publishers.filter(binding => binding.id === occurrence.messagingBindingId).map(binding => ({ topology, binding }))), subscriptions = (f.messaging ?? []).flatMap(topology => topology.subscriptions.filter(binding => binding.id === occurrence.messagingBindingId).map(binding => ({ topology, binding })));
		const matches = [...publishers, ...subscriptions];
		if (matches.length !== 1) { report('missingReference', `/foundation/occurrences/${occurrence.id}`, occurrence.messagingBindingId!); }
		else { const { topology, binding } = matches[0], broker = topology.brokers.find(broker => broker.id === topology.channels.find(channel => channel.id === binding.channelId)?.brokerId), publishing = publishers.length === 1; if (occurrence.operationId !== binding.operationId || occurrence.from !== (publishing ? binding.ownerId : broker?.elementId) || occurrence.to !== (publishing ? broker?.elementId : binding.ownerId) || occurrence.execution) { report('contract', `/foundation/occurrences/${occurrence.id}`, occurrence.id, 'messagingDirection'); } }
	}
	for (const machine of f.stateMachines ?? []) { for (const event of machine.events.filter(event => event.subscriptionId)) { const subscriptions = (f.messaging ?? []).flatMap(topology => topology.subscriptions.filter(sub => sub.id === event.subscriptionId)); if (subscriptions.length !== 1 || subscriptions[0].operationId !== event.operationId) { report('contract', `/foundation/stateMachines/${machine.id}`, event.id, 'messagingEventContract'); } } }
	for (const entry of f.frames) { for (const id of entry.occurrenceIds) { reference('occurrence', id, `/foundation/frames/${entry.id}/occurrenceIds`); } }
	for (const entry of f.interactions) {
		const path = `/foundation/interactions/${entry.id}`;
		if (entry.ownerId) { reference('element', entry.ownerId, path + '/ownerId'); }
		for (const id of entry.occurrenceIds) { reference('occurrence', id, path + '/occurrenceIds'); }
		for (const id of entry.frameIds) { reference('frame', id, path + '/frameIds'); }
		if (entry.legacyViewId && !model.views.some(view => view.id === entry.legacyViewId && view.kind === 'sequence')) { report('missingReference', path + '/legacyViewId', entry.legacyViewId); }
		for (const id of entry.legacyRelationOrder ?? []) { reference('relation', id, path + '/legacyRelationOrder'); }
	}
	for (const binding of f.platform.bindings) { reference('element', binding.elementId, `/foundation/platform/bindings/${binding.id}/elementId`); }
	for (const entry of f.migration?.unresolvedOwnershipIds ?? []) { reference('element', entry, '/foundation/migration/unresolvedOwnershipIds'); }
	unique(f.tasks ?? [], '/foundation/tasks');
	for (const task of f.tasks ?? []) {
		reference(task.target.kind, task.target.id, `/foundation/tasks/${task.id}/target`);
		const revisions = [task.revision, ...task.history.map(entry => entry.revision)];
		if (new Set(revisions).size !== revisions.length) { report('contract', `/foundation/tasks/${task.id}/revision`, task.id, 'duplicateIntentRevision'); }
	}
	const assertions = new Map<string, string>();
	for (const assertion of f.assertions) {
		const path = `/foundation/assertions/${assertion.id}`;
		reference(assertion.subject.kind, assertion.subject.id, path + '/subject');
		if (assertion.acceptance.status === 'accepted') {
			const key = `${assertion.subject.kind}:${assertion.subject.id}:${assertion.field}`; const serialized = JSON.stringify(assertion.value.state === 'known' ? ['known', assertion.value.value] : assertion.value.state === 'unknown' ? ['unknown', assertion.value.reason] : ['omitted']);
			if (assertions.has(key) && assertions.get(key) !== serialized) { report('assertionConflict', path, assertion.subject.id, assertion.field); } assertions.set(key, serialized);
		}
	}
	for (const decision of f.decisions) {
		const path = `/foundation/decisions/${decision.id}`;
		for (const id of decision.scopeIds) { reference('element', id, path + '/scopeIds'); }
		unique(decision.constraints, path + '/constraints');
		for (const constraint of decision.constraints) { reference(constraint.subject.kind, constraint.subject.id, path + `/constraints/${constraint.id}/subject`); }
	}
	diagnostics.push(...validateBlueprint(model));
	return diagnostics;
}

/** Conservative structural assignability; cycles are compared once, never expanded indefinitely. */
export function isContractFieldAssignable(model: SemanticModelV4, source: ModelField, target: ModelField): boolean {
	if (target.required && !source.required) { return false; }
	if (source.nullable?.state !== 'known' || target.nullable?.state !== 'known' || typeof source.nullable.value !== 'boolean' || typeof target.nullable.value !== 'boolean') { return false; }
	if (source.nullable.value && !target.nullable.value) { return false; }
	const seen = new Set<string>();
	const types = (fromId: string | undefined, fromName: string, toId: string | undefined, toName: string): boolean => {
		if (!fromId || !toId) { return !fromId && !toId && fromName !== '' && fromName === toName; }
		const from = model.foundation.types.find(type => type.id === fromId); const to = model.foundation.types.find(type => type.id === toId);
		if (!from || !to) { return false; }
		const key = `${fromId}/${toId}`; if (seen.has(key)) { return true; } seen.add(key);
		if (from.kind === 'reference') { return types(from.targetTypeId, '', toId, ''); }
		if (to.kind === 'reference') { return types(fromId, '', to.targetTypeId, ''); }
		if (from.kind !== to.kind || JSON.stringify(from.constraints ?? []) !== JSON.stringify(to.constraints ?? [])) { return false; }
		if (from.kind === 'primitive') { return from.primitive === to.primitive && !!from.primitive; }
		if (from.kind === 'enum') { return !!from.values?.length && from.values.every(value => to.values?.includes(value)); }
		if (from.kind === 'collection') { return types(from.itemTypeId, '', to.itemTypeId, ''); }
		return to.fields.every(field => {
			const match = from.fields.find(candidate => candidate.name === field.name);
			return !match ? !field.required : (!field.required || match.required) && match.nullable?.state === 'known' && field.nullable?.state === 'known' && (!match.nullable.value || !!field.nullable.value) && types(match.typeId, match.type, field.typeId, field.type);
		});
	};
	return types(source.typeId, source.type, target.typeId, target.type);
}

/** Shared signatures are checked by direction: consumer inputs and provider outputs/errors. */
export function areModelOperationsCompatible(model: SemanticModelV4, required: ModelOperation, provided: ModelOperation): boolean {
	const fields = (source: ModelField[], target: ModelField[]) => target.every(field => { const match = source.find(candidate => candidate.name === field.name); return match ? isContractFieldAssignable(model, match, field) : !field.required; });
	return fields(required.inputs, provided.inputs) && fields(provided.outputs, required.outputs)
		&& provided.errors.every(error => { const expected = required.errors.find(candidate => candidate.code === error.code); return expected && isContractFieldAssignable(model, { name: error.code, type: '', typeId: error.typeId, required: true, nullable: { state: 'known', value: false } }, { name: error.code, type: '', typeId: expected.typeId, required: true, nullable: { state: 'known', value: false } }); })
		&& provided.effects.every(effect => required.effects.includes(effect))
		&& provided.permissions.every(permission => required.permissions.some(expected => expected.actorId === permission.actorId && expected.capability === permission.capability));
}

/** Blueprint rules validate references and structure; natural-language behavior remains descriptive. */
function validateBlueprint(model: SemanticModelV4): ModelDiagnostic[] {
	const diagnostics: ModelDiagnostic[] = []; const f = model.foundation; const b = f.blueprint;
	const report = (code: ModelDiagnostic['code'], path: string, ...args: string[]) => diagnostics.push({ code, severity: 'error', path, args });
	const objects = modelObjects(model); const elements = new Map(model.semantics.elements.map(element => [element.id, element]));
	const reference = (kind: ObjectKind, id: string, path: string) => { if (!objects.has(`${kind}:${id}`)) { report('missingReference', path, id); } };
	const owner = (id: string) => f.ownership.find(entry => entry.elementId === id && entry.role === 'architecture')?.ownerId;
	const predicateIds = new Set<string>();
	for (const predicate of f.predicates ?? []) {
		if (predicateIds.has(predicate.id)) { report('duplicateId', `/foundation/predicates/${predicate.id}`, predicate.id); } predicateIds.add(predicate.id);
		reference('operation', predicate.operationId, `/foundation/predicates/${predicate.id}/operationId`);
		for (const node of predicate.nodes) { if (node.kind === 'literal') { reference('type', node.typeId, `/foundation/predicates/${predicate.id}`); } if (node.kind === 'reference') { reference('field', node.fieldId, `/foundation/predicates/${predicate.id}`); for (const id of node.path) { reference('field', id, `/foundation/predicates/${predicate.id}`); } } }
	}
	for (const type of f.types) {
		const path = `/foundation/types/${type.id}`;
		for (const id of [type.itemTypeId, type.targetTypeId]) { if (id) { reference('type', id, path); } }
		if (type.kind === 'primitive' && (!type.primitive || type.fields.length) || type.kind === 'enum' && (!type.values?.length || new Set(type.values).size !== type.values.length || type.fields.length) || type.kind === 'collection' && (!type.itemTypeId || type.fields.length) || type.kind === 'reference' && (!type.targetTypeId || type.fields.length)) { report('contract', path, type.id, 'typeDefinition'); }
		const definitionKeys = type.kind === 'primitive' ? ['primitive'] : type.kind === 'enum' ? ['values'] : type.kind === 'collection' ? ['itemTypeId'] : type.kind === 'reference' ? ['targetTypeId'] : [];
		if (type.kind && ['primitive', 'values', 'itemTypeId', 'targetTypeId'].some(key => Object.hasOwn(type, key) && !definitionKeys.includes(key))) { report('contract', path, type.id, 'ambiguousTypeDefinition'); }
		if (type.kind === 'reference') {
			const seen = new Set([type.id]); let target = f.types.find(entry => entry.id === type.targetTypeId);
			while (target?.kind === 'reference') { if (seen.has(target.id)) { report('contract', path, type.id, 'unproductiveTypeCycle'); break; } seen.add(target.id); target = f.types.find(entry => entry.id === target!.targetTypeId); }
		}
		for (const constraint of type.constraints ?? []) {
			if (constraint.kind === 'pattern') { try { if (typeof constraint.value !== 'string') { throw new Error(); } new RegExp(constraint.value); } catch { report('contract', path, type.id, 'typeConstraint'); } }
			else if (typeof constraint.value !== 'number' || constraint.kind.endsWith('Length') && (!Number.isInteger(constraint.value) || constraint.value < 0)) { report('contract', path, type.id, 'typeConstraint'); }
		}
		const names = type.fields.map(field => field.name); if (new Set(names).size !== names.length) { report('contract', path, type.id, 'duplicateField'); }
	}
	const numbers = new Set<string>();
	for (const decision of f.decisions) {
		const path = `/foundation/decisions/${decision.id}`; const record = decision.record;
		if (!record) { continue; }
		if (numbers.has(record.number)) { report('decisionHistory', path, decision.id, 'duplicateNumber'); } numbers.add(record.number);
		const revisions = [...record.history.map(entry => entry.revision), decision.revision];
		if (new Set(revisions).size !== revisions.length || !decision.scopeIds.length) { report('decisionHistory', path, decision.id, 'revisionOrScope'); }
		if (decision.status === 'superseded') {
			const replacement = f.decisions.find(entry => entry.id === record.supersededById);
			if (!replacement || replacement.id === decision.id || replacement.status !== 'accepted') { report('decisionHistory', path, decision.id, 'replacementMissing'); }
		} else if (record.supersededById) { report('decisionHistory', path, decision.id, 'replacementState'); }
		for (const constraint of decision.constraints) { if (constraint.category && constraint.value.state !== 'known' && decision.status === 'accepted') { report('contract', path, decision.id, 'unknownNormativeConstraint'); } }
	}
	if (!b) { return diagnostics; }
	const operationIds = [...model.semantics.elements.flatMap(element => [...(element.behavior?.id ? [element.behavior.id] : []), ...(element.details?.members.filter(member => member.kind === 'method').map(member => member.id!) ?? [])]), ...b.operations.map(operation => operation.id)];
	const fieldIds = [...f.types.flatMap(type => type.fields.map(field => field.id!)), ...model.semantics.elements.flatMap(element => [...(element.behavior?.inputs ?? []), ...(element.behavior?.outputs ?? []), ...(element.details?.members.filter(member => member.kind === 'attribute') ?? [])].map(field => field.id!)), ...b.operations.flatMap(operation => [...operation.inputs, ...operation.outputs].map(field => field.id!))];
	for (const [kind, ids] of [['operation', operationIds], ['field', fieldIds], ['error', b.operations.flatMap(operation => operation.errors.map(error => error.id))]] as const) { if (new Set(ids).size !== ids.length) { report('duplicateId', `/${kind}s`, kind); } }
	for (const [section, entries] of Object.entries(b)) { const ids = entries.map((entry: { id: string }) => entry.id); if (new Set(ids).size !== ids.length) { report('duplicateId', `/foundation/blueprint/${section}`, section); } }
	for (const entry of f.ownership.filter(entry => entry.role === 'architecture')) {
		const child = elements.get(entry.elementId); const parent = elements.get(entry.ownerId);
		if (parent?.scope === 'external' || child?.kind === 'system' || child?.kind === 'container' && parent?.kind !== 'system' || ['component', 'controller', 'dataStore'].includes(child?.kind ?? '') && parent?.kind !== 'container') { report('ownership', `/foundation/ownership/${entry.id}`, entry.elementId, 'c4Owner'); }
	}
	for (const occurrence of f.occurrences) { if (occurrence.errorId) { reference('error', occurrence.errorId, `/foundation/occurrences/${occurrence.id}/errorId`); if (!b.operations.find(operation => operation.id === occurrence.operationId)?.errors.some(error => error.id === occurrence.errorId)) { report('contract', `/foundation/occurrences/${occurrence.id}`, occurrence.id, 'undeclaredError'); } } }
	for (const operation of b.operations) {
		const path = `/foundation/blueprint/operations/${operation.id}`;
		reference('element', operation.ownerId, path + '/ownerId');
		if (!blueprintRules.operationOwners.some(kind => kind === elements.get(operation.ownerId)?.kind)) { report('contract', path, operation.id, 'operationOwner'); }
		for (const section of ['inputs', 'outputs'] as const) {
			const names = operation[section].map(field => field.name); if (new Set(names).size !== names.length) { report('contract', path, operation.id, 'duplicateParameter'); }
			for (const field of operation[section]) { if (field.typeId) { reference('type', field.typeId, path + `/${section}/${field.id}/typeId`); } }
		}
		for (const error of operation.errors) { reference('type', error.typeId, path + `/errors/${error.id}/typeId`); }
		if (new Set(operation.errors.map(error => error.code)).size !== operation.errors.length) { report('contract', path, operation.id, 'duplicateError'); }
		for (const permission of operation.permissions) { reference('element', permission.actorId, path + '/permissions'); if (elements.get(permission.actorId)?.kind !== 'actor') { report('contract', path, operation.id, 'permissionActor'); } }
	}
	for (const contract of b.interfaces) {
		const path = `/foundation/blueprint/interfaces/${contract.id}`; reference('element', contract.elementId, path + '/elementId');
		if (!blueprintRules.interfaceElements.some(kind => kind === elements.get(contract.elementId)?.kind)) { report('contract', path, contract.id, 'interfaceElement'); }
		const signatures = new Set<string>();
		for (const id of contract.operationIds) {
			reference('operation', id, path + '/operationIds'); const operation = b.operations.find(entry => entry.id === id);
			if (!operation || operation.ownerId !== contract.elementId) { report('contract', path, contract.id, 'operationOwner'); continue; }
			const signature = JSON.stringify([operation.name, operation.inputs.map(field => [field.name, field.typeId ?? field.type, field.required, field.nullable])]);
			if (signatures.has(signature)) { report('contract', path, contract.id, 'duplicateSignature'); } signatures.add(signature);
		}
	}
	for (const port of b.ports) {
		const path = `/foundation/blueprint/ports/${port.id}`; reference('element', port.elementId, path + '/elementId'); reference('interface', port.interfaceId, path + '/interfaceId');
		if (!blueprintRules.portOwners.some(kind => kind === elements.get(port.elementId)?.kind)) { report('contract', path, port.id, 'portOwner'); }
		if (port.direction === 'required' && b.connections.filter(connection => connection.requiredPortId === port.id).length > 1) { report('contract', path, port.id, 'multipleProviders'); }
		if (port.direction === 'required' && !b.connections.some(connection => connection.requiredPortId === port.id)) { report('contract', path, port.id, 'requiredInterfaceUnsatisfied'); }
	}
	for (const connection of b.connections) {
		const path = `/foundation/blueprint/connections/${connection.id}`;
		reference('port', connection.requiredPortId, path + '/requiredPortId'); reference('port', connection.providedPortId, path + '/providedPortId');
		const required = b.ports.find(port => port.id === connection.requiredPortId); const provided = b.ports.find(port => port.id === connection.providedPortId);
		if (required?.direction !== 'required' || provided?.direction !== 'provided') { report('contract', path, connection.id, 'portDirection'); continue; }
		const expected = b.interfaces.find(contract => contract.id === required.interfaceId); const offered = b.interfaces.find(contract => contract.id === provided.interfaceId);
		if (expected?.operationIds.some(id => connection.operations.filter(mapping => mapping.requiredOperationId === id).length !== 1)) { report('contract', path, connection.id, 'operationMapping'); }
		for (const mapping of connection.operations) {
			const wanted = b.operations.find(operation => operation.id === mapping.requiredOperationId); const actual = b.operations.find(operation => operation.id === mapping.providedOperationId);
			if (!wanted || !actual || !expected?.operationIds.includes(wanted.id) || !offered?.operationIds.includes(actual.id)) { report('missingReference', path, mapping.requiredOperationId, mapping.providedOperationId); }
			else if (!areModelOperationsCompatible(model, wanted, actual)) { report('contract', path, connection.id, 'incompatibleSignature', wanted.id, actual.id); }
		}
	}
	for (const transport of b.transports) { reference('relation', transport.relationId, `/foundation/blueprint/transports/${transport.id}`); reference('type', transport.schemaTypeId, `/foundation/blueprint/transports/${transport.id}`); }
	for (const module of b.modules) {
		const path = `/foundation/blueprint/modules/${module.id}`; reference('element', module.elementId, path);
		if (elements.get(module.elementId)?.kind !== 'package') { report('contract', path, module.id, 'nondeployableModule'); }
		for (const id of module.consumerIds) { reference('element', id, path + '/consumerIds'); }
	}
	for (const mapping of b.fieldMappings) {
		const path = `/foundation/blueprint/fieldMappings/${mapping.id}`;
		reference('field', mapping.domainFieldId, path); reference('field', mapping.targetFieldId, path);
		const target = model.semantics.elements.find(element => element.details?.members.some(member => member.id === mapping.targetFieldId));
		if (!target || (mapping.targetKind === 'column' ? target.kind !== 'table' : target.kind !== 'class')) { report('contract', path, mapping.id, 'fieldMappingKind'); }
	}
	for (const view of model.views.filter(view => ['c4Context', 'c4Container', 'c4Component'].includes(view.kind) || view.kind === 'class' && view.subjectId)) {
		const path = `/views/${model.views.indexOf(view)}`;
		if (!view.subjectId || !view.contextIds) { report('c4Scope', path, view.id, 'subjectAndScopeRequired'); continue; }
		if (!view.nodes.some(node => node.elementId === view.subjectId)) { report('c4Scope', path, view.id, 'subjectNotVisible'); }
		reference('element', view.subjectId, path + '/subjectId');
		const subject = elements.get(view.subjectId);
		if (view.kind === 'c4Context' || view.kind === 'c4Container') { if (subject?.kind !== 'system' || subject.scope !== 'governed') { report('c4Scope', path, view.id, 'governedSubject'); } }
		if (view.kind === 'c4Component' && subject?.kind !== 'container') { report('c4Scope', path, view.id, 'containerSubject'); }
		if (view.kind === 'class' && !['interface', 'contract', 'class'].includes(subject?.kind ?? '')) { report('c4Scope', path, view.id, 'contractSubject'); }
		for (const id of view.contextIds) { reference('element', id, path + '/contextIds'); }
		for (const node of view.nodes) {
			const element = elements.get(node.elementId); if (!element || node.elementId === view.subjectId || view.contextIds.includes(node.elementId)) { continue; }
			const allowed = view.kind === 'c4Context' ? element.kind === 'actor' || element.scope === 'external' : view.kind === 'class' ? false : owner(element.id) === view.subjectId;
			if (!allowed) { report('c4Scope', path, view.id, 'outsideOwner', element.id); }
		}
	}
	return diagnostics;
}

const field = object({ name: nonempty, type: nonempty, required: { type: 'boolean' } });
const behavior = object({
	inputs: array(field), outputs: array(field), preconditions: array(nonempty), postconditions: array(nonempty),
	errors: array(object({ code: identifier, description: nonempty })),
	permissions: array(object({ actorId: identifier, capability: nonempty })),
	acceptanceCriteria: array(object({ id: identifier, given: nonempty, when: nonempty, then: nonempty }))
});

export const elementDetailsSchema = object({ technology: text, environment: text, members: array(object({ name: nonempty, type: text, kind: { type: 'string', enum: ['attribute', 'method'] }, key: { type: 'string', enum: ['none', 'primary', 'foreign', 'unique'] }, required: { type: 'boolean' } })) });
export const relationDetailsSchema = object({ sourceMultiplicity: { ...text, pattern: '^(?:|\\*|[0-9]+(?:\\.\\.(?:[0-9]+|\\*))?)$' }, targetMultiplicity: { ...text, pattern: '^(?:|\\*|[0-9]+(?:\\.\\.(?:[0-9]+|\\*))?)$' }, sourceMember: text, targetMember: text, protocol: text });

/** Portable JSON Schema; the committed JSON artifact is checked against this source. */
function modelSchema(version: 2 | 3): Schema {
	return {
		$schema: 'https://json-schema.org/draft/2020-12/schema',
		$id: `urn:ade:model:${version}`,
		title: `A.D.E semantic model v${version}`,
		...object({
			version: { type: 'integer', const: version }, id: identifier, name: nonempty,
			semantics: object({
				elements: array(object({
					id: identifier, kind: { type: 'string', enum: elementKinds }, name: nonempty,
					description: text, parentId: identifier, behavior, details: elementDetailsSchema, legacyKind: { type: 'string', enum: ['class'] }
				}, ['description', 'parentId', 'behavior', 'legacyKind', 'details'])),
				relations: array(object({
					id: identifier, kind: { type: 'string', enum: relationKinds }, from: identifier, to: identifier, name: text,
					condition: nonempty, errorCode: identifier, details: relationDetailsSchema, classification: { type: 'string', enum: ['legacy-unclassified'] }
				}, ['condition', 'errorCode', 'classification', 'details']))
			}),
			views: array(object({
				...(version === 3 ? { featureId: identifier } : {}),
				id: identifier, name: nonempty, kind: { type: 'string', enum: viewKinds },
				nodes: array(object({ elementId: identifier, x: { type: 'number' }, y: { type: 'number' } })),
				relationIds: array(identifier)
			}, ['featureId'])),
			codeMappings: array(object({ id: identifier, elementId: identifier, file: nonempty, symbol: nonempty, revision: nonempty })),
			verifications: array(object({
				id: identifier, elementId: identifier, criterionId: identifier,
				outcome: { type: 'string', enum: ['passed', 'failed', 'unknown'] }, evidence: nonempty, revision: nonempty
			}))
		})
	};
}

export const semanticModelSchema = modelSchema(2);
export const semanticModelV3Schema = modelSchema(3);
export const semanticModelV4Schema = createSemanticModelV4Schema(semanticModelV3Schema);

/** V5 is additive: old executable contracts retain exactly their V4 grammar. */
export const semanticModelV5Schema = (() => {
	const schema = structuredClone(semanticModelV4Schema);
	schema.$id = 'urn:ade:model:5'; schema.title = 'A.D.E semantic model v5'; schema.properties!.version.const = 5;
	const foundation = schema.properties!.foundation.properties!;
	foundation.evidence = array(object({ id: identifier, revision: nonempty, file: nonempty, start: { type: 'integer', minimum: 0 }, end: { type: 'integer', minimum: 0 }, encoding: { type: 'string', const: 'utf-16' }, producer: nonempty, producerVersion: nonempty, nature: { type: 'string', enum: ['syntax', 'reference', 'text', 'documentation', 'runtime'] }, factIds: array(identifier) }));
	foundation.assertions.items!.properties!.evidenceIds = array(identifier);
	const occurrence = foundation.occurrences.items!;
	foundation.occurrences.items = { anyOf: [occurrence, object({ id: identifier, profile: { type: 'string', const: 'descriptive' }, name: nonempty, from: identifier, to: identifier, evidenceIds: array(identifier), operationId: identifier }, ['operationId'])] };
	const interaction = foundation.interactions.items!;
	interaction.properties!.profile = { type: 'string', const: 'executable' };
	foundation.interactions.items = { anyOf: [interaction, object({ id: identifier, profile: { type: 'string', const: 'descriptive' }, ownerId: identifier, occurrenceIds: array(identifier), frameIds: array(identifier), description: object({ trigger: nonempty, scope: nonempty, participantIds: array(identifier), evidenceIds: array(identifier), order: array(object({ before: identifier, after: identifier, evidenceIds: array(identifier), basis: { type: 'string', enum: ['extracted', 'inferred', 'observed', 'authored'] } })) }) }, ['ownerId'])] };
	foundation.frames.items!.anyOf!.push(object({ id: identifier, occurrenceIds: array(identifier), kind: { type: 'string', const: 'unspecified' }, description: object({ operator: { type: 'string', enum: ['alt', 'opt', 'par', 'loop'] }, operands: array(object({ id: identifier, condition: knowledgeSchema, steps: array(identifier), evidenceIds: array(identifier) })) }) }));
	schema.properties!.views.items!.properties!.spec = object({ revision: nonempty, intent: nonempty, projectionRevision: nonempty, layoutRevision: nonempty, manualIds: array(identifier) });
	return schema;
})();

/** Syntax is shared with the provider grammar; invalid references remain inspectable drafts. */
export function validateSemanticShape(value: unknown): ModelDiagnostic[] {
	const diagnostics: ModelDiagnostic[] = [];
	const version = value !== null && typeof value === 'object' && Object.hasOwn(value, 'version') ? (value as { version: number }).version : undefined;
	checkShape(value, version === 5 ? semanticModelV5Schema : version === 4 ? semanticModelV4Schema : version === 3 ? semanticModelV3Schema : semanticModelSchema, '', diagnostics);
	return diagnostics;
}

/** A draft may be incomplete or referentially invalid, but must retain an unambiguous JSON shape. */
export function readSemanticDraft(value: unknown): SemanticModel {
	const diagnostics = validateSemanticShape(value);
	if (diagnostics.length) { throw new InvalidSemanticModelError(diagnostics); }
	return structuredClone(value as SemanticModel);
}

const callers: readonly ElementKind[] = ['actor', 'view', 'component', 'controller', 'action', 'system', 'container', 'class', 'process'];
const executors: readonly ElementKind[] = ['component', 'controller', 'action', 'system', 'container', 'class', 'process'];

/** The compatibility matrix is shared by validation and future visual editors. */
export function isCompatibleRelation(kind: RelationKind, from: ElementKind, to: ElementKind): boolean {
	switch (kind) {
		case 'dependency': return true;
		case 'invocation': return callers.includes(from) && [...executors, 'contract', 'interface', 'view'].includes(to);
		case 'read':
		case 'write': return executors.includes(from) && ['resource', 'entity', 'table', 'dataStore'].includes(to);
		case 'transition': return from === 'state' && to === 'state';
		case 'realization': return ['component', 'controller', 'action', 'resource', 'view'].includes(from) && ['feature', 'contract', 'interface'].includes(to);
		case 'association': return ['entity', 'table', 'class', 'interface', 'actor', 'useCase', 'resource'].includes(from) && ['entity', 'table', 'class', 'interface', 'actor', 'useCase', 'resource'].includes(to);
		case 'inheritance': return ['class', 'interface'].includes(from) && ['class', 'interface'].includes(to);
		case 'composition':
		case 'aggregation': return ['class', 'entity', 'component', 'package', 'system', 'container'].includes(from) && ['class', 'entity', 'component', 'package', 'container', 'interface', 'resource'].includes(to);
		case 'implementation': return ['class', 'component', 'container'].includes(from) && ['interface', 'contract'].includes(to);
		case 'hosting': return ['deploymentNode', 'networkNode'].includes(from) && ['deploymentNode', 'networkNode', 'artifact', 'container', 'resource', 'dataStore'].includes(to);
		case 'communication': return ['actor', 'system', 'container', 'component', 'deploymentNode', 'networkNode', 'resource', 'dataStore'].includes(from) && ['actor', 'system', 'container', 'component', 'deploymentNode', 'networkNode', 'resource', 'dataStore'].includes(to);
		case 'controlFlow': return ['actor', 'view', 'controller', 'action', 'decision', 'process', 'start'].includes(from) && ['view', 'controller', 'action', 'decision', 'process', 'end'].includes(to);
		case 'dataFlow': return ['actor', 'system', 'process', 'dataStore', 'resource'].includes(from) && ['actor', 'system', 'process', 'dataStore', 'resource'].includes(to) && (from === 'process' || to === 'process');
		case 'include':
		case 'extend': return from === 'useCase' && to === 'useCase';
	}
}

/** Validates structure first, then graph references, containment and evidence. */
export function validateSemanticModel(value: unknown): ModelDiagnostic[] {
	const diagnostics = validateSemanticShape(value);
	if (diagnostics.length) {
		return diagnostics;
	}
	const model = value as SemanticModel;
	const { elements, relations } = model.semantics;
	const byId = new Map(elements.map(element => [element.id, element]));
	const relationById = new Map(relations.map(relation => [relation.id, relation]));
	const report = (code: ModelDiagnostic['code'], path: string, ...args: string[]) => diagnostics.push({ code, severity: 'error', path, args });
	const unique = (ids: string[], path: string) => {
		const seen = new Set<string>();
		ids.forEach((id, index) => {
			if (seen.has(id)) {
				report('duplicateId', `${path}/${index}`, id);
			}
			seen.add(id);
		});
	};
	// Entity namespaces are separate; references always declare their namespace.
	unique(elements.map(item => item.id), '/semantics/elements');
	unique(relations.map(item => item.id), '/semantics/relations');
	unique(model.views.map(item => item.id), '/views');
	unique(model.codeMappings.map(item => item.id), '/codeMappings');
	unique(model.verifications.map(item => item.id), '/verifications');
	const reference = (id: string, path: string) => {
		const element = byId.get(id);
		if (!element) {
			report('missingReference', path, id);
		}
		return element;
	};
	elements.forEach((element, index) => {
		const path = `/semantics/elements/${index}`;
		if (element.parentId) {
			const parent = reference(element.parentId, `${path}/parentId`);
			if (parent && !containmentKinds.includes(parent.kind)) {
				report('invalidParent', `${path}/parentId`, parent.id, parent.kind);
			}
			const seen = new Set([element.id]);
			let current: SemanticElement | undefined = element;
			while (current?.parentId) {
				if (seen.has(current.parentId)) {
					report('containmentCycle', `${path}/parentId`, element.id);
					break;
				}
				seen.add(current.parentId);
				current = byId.get(current.parentId);
			}
		}
		if (element.details) {
			unique(element.details.members.map(member => `${member.kind}:${member.name}:${member.kind === 'method' ? member.type : ''}`), `${path}/details/members`);
			for (const member of element.details.members) { if (member.kind === 'method' && member.key !== 'none' || element.kind === 'table' && member.kind !== 'attribute') { report('shape', `${path}/details/members`, 'Keys describe attributes; physical tables contain columns, not methods'); } }
		}
		if (element.behavior) {
			const behavior = element.behavior;
			unique(behavior.inputs.map(field => field.name), `${path}/behavior/inputs`);
			unique(behavior.outputs.map(field => field.name), `${path}/behavior/outputs`);
			unique(behavior.errors.map(error => error.code), `${path}/behavior/errors`);
			unique(behavior.acceptanceCriteria.map(criterion => criterion.id), `${path}/behavior/acceptanceCriteria`);
			behavior.permissions.forEach((permission, permissionIndex) => {
				const actor = reference(permission.actorId, `${path}/behavior/permissions/${permissionIndex}/actorId`);
				if (actor && actor.kind !== 'actor') {
					report('invalidParent', `${path}/behavior/permissions/${permissionIndex}/actorId`, actor.id, actor.kind);
				}
			});
		}
	});
	relations.forEach((relation, index) => {
		const path = `/semantics/relations/${index}`;
		const from = reference(relation.from, `${path}/from`);
		const to = reference(relation.to, `${path}/to`);
		if (from && to && (!isCompatibleRelation(relation.kind, from.kind, to.kind) || (relation.kind === 'transition' && from.parentId !== to.parentId))) {
			report('incompatibleRelation', path, relation.kind, from.kind, to.kind);
		}
		if (relation.details && from && to) {
			for (const [endpoint, member] of [[from, relation.details.sourceMember], [to, relation.details.targetMember]] as const) { if (member && !endpoint.details?.members.some(item => item.name === member)) { report('missingReference', `${path}/details`, endpoint.id, member); } }
		}
		if (from && relation.errorCode && !from.behavior?.errors.some(error => error.code === relation.errorCode)) {
			report('missingError', `${path}/errorCode`, relation.errorCode, from.id);
		}
		if (relation.classification) {
			diagnostics.push({ code: 'legacyClassification', severity: 'warning', path, args: [relation.id] });
		}
	});
	model.views.forEach((view, index) => {
		const path = `/views/${index}`;
		for (const node of view.nodes) { const element = byId.get(node.elementId); if (element && !(model.version === 5 && view.kind === 'activity' && view.interactionId) && !((model.version === 4 || model.version === 5) && (view.contextIds?.includes(element.id) || view.subjectId === element.id)) && !acceptsNotationElement(view.kind, element)) { report('shape', path, `Unsupported ${element.kind} in ${view.kind}`); } }
		for (const id of view.relationIds) { const relation = relationById.get(id); if (relation && !((model.version === 4 || model.version === 5) && view.subjectId && ['invocation', 'dependency', 'communication'].includes(relation.kind)) && !acceptsNotationRelation(view.kind, relation)) { report('shape', path, `Unsupported ${relation.kind} in ${view.kind}`); } }
		if (view.featureId) {
			const feature = reference(view.featureId, `${path}/featureId`);
			if (feature && feature.kind !== 'feature') { report('invalidParent', `${path}/featureId`, feature.id, feature.kind); }
		}
		unique(view.nodes.map(node => node.elementId), `${path}/nodes`);
		unique(view.relationIds, `${path}/relationIds`);
		const nodeIds = new Set(view.nodes.map(node => node.elementId));
		view.nodes.forEach((node, nodeIndex) => reference(node.elementId, `${path}/nodes/${nodeIndex}/elementId`));
		view.relationIds.forEach((id, relationIndex) => {
			const relation = relationById.get(id);
			if (!relation) {
				report('missingReference', `${path}/relationIds/${relationIndex}`, id);
			} else if (!nodeIds.has(relation.from) || !nodeIds.has(relation.to)) {
				report('viewEndpoint', `${path}/relationIds/${relationIndex}`, id);
			}
		});
	});
	model.codeMappings.forEach((mapping, index) => reference(mapping.elementId, `/codeMappings/${index}/elementId`));
	model.verifications.forEach((verification, index) => {
		const path = `/verifications/${index}`;
		const element = reference(verification.elementId, `${path}/elementId`);
		if (element && !element.behavior?.acceptanceCriteria.some(criterion => criterion.id === verification.criterionId)) {
			report('missingCriterion', `${path}/criterionId`, verification.criterionId, element.id);
		}
	});
	if ((model.version === 4 || model.version === 5)) { diagnostics.push(...validateV4References(model), ...validateExploration(model)); }
	return diagnostics;
}

export class InvalidSemanticModelError extends Error {
	readonly diagnostics: ModelDiagnostic[];
	constructor(diagnostics: ModelDiagnostic[]) {
		super('Invalid A.D.E semantic model');
		this.diagnostics = diagnostics;
	}
}

/** A validating boundary; successful return always yields a detached snapshot. */
export function readSemanticModel(value: unknown): SemanticModel {
	const diagnostics = validateSemanticModel(value);
	if (diagnostics.some(diagnostic => diagnostic.severity === 'error')) {
		throw new InvalidSemanticModelError(diagnostics);
	}
	return structuredClone(value as SemanticModel);
}

interface LegacyModel {
	version: 1;
	name: string;
	nodes: { id: string; kind: 'actor' | 'component' | 'class' | 'state' | 'action'; label: string }[];
	edges: { from: string; to: string; label: string }[];
}

const legacySchema = object({
	version: { type: 'integer', const: 1 }, name: nonempty,
	nodes: array(object({ id: identifier, kind: { type: 'string', enum: ['actor', 'component', 'class', 'state', 'action'] }, label: nonempty })),
	edges: array(object({ from: identifier, to: identifier, label: text }))
});

/** Pure, explicit migration. Never writes files or infers behavior from labels. */
export function migrateSemanticModel(value: unknown, modelId = 'legacy-model'): { model: SemanticModel; diagnostics: ModelDiagnostic[] } {
	if (typeof value === 'object' && value !== null && Object.hasOwn(value, 'version') && [2, 3, 4, 5].includes((value as { version: number }).version)) {
		const model = readSemanticModel(value);
		return { model, diagnostics: validateSemanticModel(model) };
	}
	const diagnostics: ModelDiagnostic[] = [];
	checkShape(value, legacySchema, '', diagnostics);
	if (diagnostics.length) {
		throw new InvalidSemanticModelError(diagnostics);
	}
	const legacy = value as LegacyModel;
	const model = readSemanticModel({
		version: 2, id: modelId, name: legacy.name,
		semantics: {
			elements: legacy.nodes.map(node => ({
				id: node.id, kind: node.kind === 'class' ? 'resource' : node.kind, name: node.label,
				...(node.kind === 'class' ? { legacyKind: 'class' } : {})
			})),
			relations: legacy.edges.map((edge, index) => ({
				id: `legacy-relation-${index + 1}`, kind: 'dependency', from: edge.from, to: edge.to,
				name: edge.label, classification: 'legacy-unclassified'
			}))
		},
		views: [{
			id: 'structure', name: legacy.name, kind: 'structure',
			nodes: legacy.nodes.map((node, index) => ({ elementId: node.id, x: 35 + (index % 3) * 295, y: 40 + Math.floor(index / 3) * 180 })),
			relationIds: legacy.edges.map((_, index) => `legacy-relation-${index + 1}`)
		}],
		codeMappings: [], verifications: []
	});
	return { model, diagnostics: validateSemanticModel(model) };
}

/** In-memory service consumed by the workbench; persistence belongs to file/editor services. */
export class SemanticModelService {
	private model: SemanticModel;

	constructor(value: unknown) { this.model = this.read(value); }

	private read(value: unknown): SemanticModel {
		const draft = readSemanticDraft(value);
		return (draft.version === 4 || draft.version === 5) ? draft : readSemanticModel(draft);
	}

	getSnapshot(): SemanticModel { return structuredClone(this.model); }

	getElement(id: string): SemanticElement | undefined {
		const element = this.model.semantics.elements.find(element => element.id === id);
		return element && structuredClone(element);
	}

	getRelations(id: string): SemanticRelation[] {
		return structuredClone(this.model.semantics.relations.filter(relation => relation.from === id || relation.to === id));
	}

	/** Validate the whole candidate before atomically replacing the previous snapshot. */
	replace(value: unknown): void { this.model = this.read(value); }

	renameElement(id: string, name: string): void {
		this.editElement(id, element => { element.name = name; });
	}

	moveElement(id: string, parentId: string | undefined): void {
		if ((this.model.version === 4 || this.model.version === 5)) { throw new InvalidSemanticModelError([{ code: 'ownership', severity: 'error', path: '/foundation/ownership', args: [id, 'separateOwnershipAndMembership'] }]); }
		this.editElement(id, element => {
			if (parentId === undefined) {
				delete element.parentId;
			} else {
				element.parentId = parentId;
			}
		});
	}

	setPosition(viewId: string, elementId: string, x: number, y: number): void {
		const candidate = this.getSnapshot();
		const node = candidate.views.find(view => view.id === viewId)?.nodes.find(node => node.elementId === elementId);
		if (!node) {
			throw new InvalidSemanticModelError([{ code: 'missingReference', severity: 'error', path: '/views', args: [viewId, elementId] }]);
		}
		node.x = x;
		node.y = y;
		this.replace(candidate);
	}

	private editElement(id: string, edit: (element: SemanticElement) => void): void {
		const candidate = this.getSnapshot();
		const element = candidate.semantics.elements.find(element => element.id === id);
		if (!element) {
			throw new InvalidSemanticModelError([{ code: 'missingReference', severity: 'error', path: '/semantics/elements', args: [id] }]);
		}
		edit(element);
		this.replace(candidate);
	}
}

/** A deterministic source index is evidence for AI, never the user-facing diagram model. */
export function isSourceEvidenceModel(model: SemanticModel): boolean {
	return model.version !== 5 && model.id.startsWith('code:') && !model.semantics.elements.some(element => element.kind === 'feature');
}

interface NotationRule { core: readonly ElementKind[]; elements: readonly ElementKind[]; relations: readonly RelationKind[]; purpose: string }
/** Rules describe notation, never infer source semantics. Structure remains a cross-perspective overview. */
export const notationRules: Partial<Record<ModelView['kind'], NotationRule>> = {
	c4Context: { core: ['system'], elements: ['actor', 'system'], relations: ['communication', 'dependency'], purpose: 'System boundary, people and external systems; no implementation details.' },
	c4Container: { core: ['container', 'dataStore', 'resource'], elements: ['actor', 'system', 'container', 'resource', 'dataStore'], relations: ['communication', 'dependency'], purpose: 'Deployable applications, APIs, services and data stores inside a software system; name evidenced technologies and protocols.' },
	c4Component: { core: ['component', 'controller'], elements: ['container', 'component', 'controller', 'interface', 'contract', 'resource'], relations: ['dependency', 'communication', 'implementation', 'realization'], purpose: 'Internal responsibilities of one container and their interfaces; retain the container boundary.' },
	erd: { core: ['entity', 'resource'], elements: ['entity', 'resource'], relations: ['association', 'composition', 'aggregation'], purpose: 'Logical domain entities, attributes and explicitly known cardinalities; no fabricated keys.' },
	databaseSchema: { core: ['table'], elements: ['table', 'dataStore', 'resource'], relations: ['association'], purpose: 'Physical tables, columns, data types, primary/foreign/unique keys and nullability supported by schema/migrations.' },
	deployment: { core: ['deploymentNode', 'networkNode'], elements: ['system', 'deploymentNode', 'networkNode', 'artifact', 'container', 'resource', 'dataStore'], relations: ['hosting', 'communication', 'dependency'], purpose: 'Execution environments host deployable artifacts; distinguish declared deployment from observed running infrastructure.' },
	class: { core: ['class', 'interface'], elements: ['class', 'interface'], relations: ['association', 'inheritance', 'composition', 'aggregation', 'implementation', 'dependency'], purpose: 'Language-neutral class/interface members and OO relationships supported by declarations.' },
	useCase: { core: ['useCase'], elements: ['actor', 'useCase', 'system'], relations: ['association', 'include', 'extend'], purpose: 'Actors use system capabilities; include/extend only when supported. Keep a system boundary.' },
	component: { core: ['component', 'container'], elements: ['component', 'interface', 'contract', 'container'], relations: ['dependency', 'implementation', 'realization', 'communication'], purpose: 'UML components and their provided/required interfaces, with explicit dependency directions.' },
	package: { core: ['package'], elements: ['package'], relations: ['dependency'], purpose: 'Architectural packages/layers and inter-package dependencies, rather than a file inventory.' },
	dataFlow: { core: ['process'], elements: ['actor', 'system', 'process', 'dataStore', 'resource'], relations: ['dataFlow'], purpose: 'Named data moves through processes, stores and external entities; arrows describe payloads, not control calls.' },
	network: { core: ['networkNode', 'deploymentNode'], elements: ['networkNode', 'deploymentNode', 'container', 'system'], relations: ['communication', 'hosting'], purpose: 'Declared network boundaries, subnets, gateways and connections/protocols; never infer production infrastructure from application code.' }
};

export function acceptsNotationElement(kind: ModelView['kind'], element: Pick<SemanticElement, 'kind'>): boolean {
	return !notationRules[kind] || notationRules[kind]!.elements.includes(element.kind);
}
export function acceptsNotationRelation(kind: ModelView['kind'], relation: Pick<SemanticRelation, 'kind'>): boolean {
	return !notationRules[kind] || notationRules[kind]!.relations.includes(relation.kind);
}


export function notationRelationLabel(relation: SemanticRelation): string {
	return [relation.details?.sourceMultiplicity, relation.details?.sourceMember, relation.name, relation.details?.targetMember, relation.details?.targetMultiplicity, relation.details?.protocol].filter(Boolean).join(' · ');
}

/** A partial order produces layers; peers have no implied temporal relationship. */
export function scenarioLayers(interaction: ModelInteraction): string[][] {
	const remaining = new Set(interaction.occurrenceIds), layers: string[][] = [];
	const order = interaction.description?.order ?? [];
	while (remaining.size) {
		const layer = [...remaining].filter(id => !order.some(edge => edge.after === id && remaining.has(edge.before)));
		if (!layer.length) { return []; }
		layers.push(layer); for (const id of layer) { remaining.delete(id); }
	}
	return layers;
}

/** Exclusive or parallel operands are explicit; peers within one operand still need order evidence. */
export function areSeparateScenarioBranches(model: SemanticModelV4, scenarioId: string, first: string, second: string): boolean {
	const scenario = model.foundation.interactions.find(entry => entry.id === scenarioId);
	return model.foundation.frames.some(frame => {
		if (!scenario?.frameIds.includes(frame.id) || frame.kind !== 'unspecified' || !frame.description || !['alt', 'par'].includes(frame.description.operator)) { return false; }
		const left = frame.description.operands.find(operand => operand.steps.includes(first)), right = frame.description.operands.find(operand => operand.steps.includes(second));
		return !!left && !!right && left.id !== right.id;
	});
}

/** Reachability distinguishes topological display layers from semantic temporal order. */
function scenarioReachability(interaction: ModelInteraction): Map<string, Set<string>> {
	const edges = interaction.description?.order ?? [], result = new Map<string, Set<string>>();
	for (const id of interaction.occurrenceIds) {
		const reached = new Set<string>(), pending = edges.filter(edge => edge.before === id).map(edge => edge.after);
		while (pending.length) { const next = pending.pop()!; if (reached.has(next)) { continue; } reached.add(next); pending.push(...edges.filter(edge => edge.before === next).map(edge => edge.after)); }
		result.set(id, reached);
	}
	return result;
}

/** Incomparable occurrences remain uncertain even when drawn on different topological layers. */
export function scenarioUnorderedOccurrences(model: SemanticModelV4, scenarioId: string): Set<string> {
	const scenario = model.foundation.interactions.find(entry => entry.id === scenarioId), unknown = new Set<string>();
	if (!scenario) { return unknown; }
	const reachability = scenarioReachability(scenario);
	for (const [index, first] of scenario.occurrenceIds.entries()) {
		for (const second of scenario.occurrenceIds.slice(index + 1)) {
			if (!reachability.get(first)?.has(second) && !reachability.get(second)?.has(first) && !areSeparateScenarioBranches(model, scenarioId, first, second)) { unknown.add(first); unknown.add(second); }
		}
	}
	return unknown;
}

/** Integrity and descriptive fidelity are independent of executable readiness. */
export function validateExploration(model: SemanticModelV4): ModelDiagnostic[] {
	if (model.version !== 5) { return []; }
	const diagnostics: ModelDiagnostic[] = [];
	const report = (code: ModelDiagnostic['code'], path: string, ...args: string[]) => diagnostics.push({ code, severity: 'error', path, args });
	const evidence = new Map((model.foundation.evidence ?? []).map(entry => [entry.id, entry]));
	if (evidence.size !== (model.foundation.evidence ?? []).length) { report('duplicateId', '/foundation/evidence', 'evidence'); }
	const anchors = (ids: string[], path: string) => { for (const id of ids) { if (!evidence.has(id)) { report('missingReference', path, id); } } };
	for (const entry of evidence.values()) {
		if (entry.start > entry.end || !/^[a-f0-9]{64}$/.test(entry.revision) || /[\\\x00]/.test(entry.file) || entry.file.startsWith('/') || entry.file.split('/').some(part => !part || part === '..' || part === '.')) { report('contract', '/foundation/evidence/' + entry.id, 'sourceAnchor'); }
	}
	for (const assertion of model.foundation.assertions) { anchors(assertion.evidenceIds ?? [], '/foundation/assertions/' + assertion.id); }
	const elements = new Set(model.semantics.elements.map(entry => entry.id));
	const occurrences = new Map(model.foundation.occurrences.map(entry => [entry.id, entry]));
	const ownership = new Set<string>();
	for (const interaction of model.foundation.interactions.filter(entry => entry.profile === 'descriptive')) {
		const path = '/foundation/interactions/' + interaction.id, description = interaction.description;
		if (!description || interaction.execution) { report('contract', path, 'descriptiveProfile'); continue; }
		anchors(description.evidenceIds, path);
		for (const id of description.participantIds) { if (!elements.has(id)) { report('missingReference', path, id); } }
		const local = new Set(interaction.occurrenceIds);
		if (local.size !== interaction.occurrenceIds.length) { report('duplicateId', path, 'occurrence'); }
		for (const id of local) {
			const call = occurrences.get(id);
			if (ownership.has(id)) { report('ownership', path, id); } ownership.add(id);
			if (!call || call.profile !== 'descriptive' || call.execution || !description.participantIds.includes(call.from) || !description.participantIds.includes(call.to)) { report('contract', path, id, 'descriptiveOccurrence'); }
			if (call) { anchors(call.evidenceIds ?? [], path + '/' + id); }
		}
		for (const edge of description.order) {
			if (!local.has(edge.before) || !local.has(edge.after) || edge.before === edge.after) { report('missingReference', path + '/order', edge.before, edge.after); }
			anchors(edge.evidenceIds, path + '/order');
			if (edge.basis !== 'authored' && !edge.evidenceIds.length) { report('contract', path + '/order', 'orderEvidenceRequired'); }
		}
		if (local.size && !scenarioLayers(interaction).length) { report('containmentCycle', path + '/order', interaction.id); }
		const reachability = scenarioReachability(interaction), framed = new Set<string>();
		for (const id of interaction.frameIds) {
			const frame = model.foundation.frames.find(entry => entry.id === id);
			if (!frame || frame.kind !== 'unspecified' || !frame.description) { report('contract', path + '/frames', id, 'descriptiveFrame'); continue; }
			const frameSteps = new Set<string>();
			if (frame.description.operands.length < (['alt', 'par'].includes(frame.description.operator) ? 2 : 1)) { report('contract', path + '/frames/' + id, 'descriptiveFrameArity'); }
			for (const operand of frame.description.operands) {
				anchors(operand.evidenceIds, path + '/frames/' + id);
				for (const step of operand.steps) { if (!local.has(step) || framed.has(step)) { report('contract', path + '/frames/' + id, step, 'operandOwnership'); } framed.add(step); frameSteps.add(step); }
			}
			if (frame.description.operator === 'alt') {
				for (const operand of frame.description.operands) {
					const others = frame.description.operands.filter(other => other.id !== operand.id).flatMap(other => other.steps);
					if (operand.steps.some(step => others.some(other => reachability.get(step)?.has(other)))) { report('contract', path + '/order', 'exclusiveBranchesCannotBeOrdered'); }
				}
			}
			if (frame.occurrenceIds.length !== frameSteps.size || frame.occurrenceIds.some(id => !frameSteps.has(id))) { report('contract', path + '/frames/' + id, 'frameCoverage'); }
		}
	}
	for (const view of model.views) {
		if (['sequence', 'activity'].includes(view.kind) && view.spec && !view.interactionId) { report('contract', '/views/' + view.id, 'scenarioRequired'); }
		if (!view.interactionId) { continue; }
		const scenario = model.foundation.interactions.find(entry => entry.id === view.interactionId);
		if (scenario?.profile !== 'descriptive') { continue; }
		const visible = new Set(view.nodes.map(node => node.elementId));
		for (const id of scenario.description?.participantIds ?? []) { if (!visible.has(id)) { report('viewEndpoint', '/views/' + view.id, id); } }
	}
	return diagnostics;
}
