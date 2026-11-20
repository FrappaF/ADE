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
	/** Manual behavior is authoritative when later source evidence is refreshed. */
	authored?: true;
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

export interface NotationRule { core: readonly ElementKind[]; elements: readonly ElementKind[]; relations: readonly RelationKind[]; purpose: string }
