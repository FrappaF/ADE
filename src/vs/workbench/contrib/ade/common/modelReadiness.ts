/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { modelObjects } from './modelFoundation.js';
import { validateSemanticModel, validateSemanticShape } from './modelValidation.js';
import { type ElementKind, type ModelDiagnostic, type ModelFoundation, type ModelReference, type SemanticModel, type SemanticModelV4 } from './modelTypes.js';
import { validateModelMessaging } from './modelMessaging.js';
import { validateModelStateMachine } from './modelStates.js';
import { validateModelInteraction } from './modelInteractions.js';
import { validateModelPredicate } from './modelExpressions.js';
import { canonicalJson } from './modelSerialization.js';

/** Capabilities come from a trusted tool adapter, never from provider output or the model being generated. */
export interface GenerationProfile {
	id: string;
	revision: string;
	archetype: string;
	elementKinds: readonly ElementKind[];
	primitiveTypes: readonly string[];
	technologies: readonly string[];
	requiredTechnologyKinds: readonly ElementKind[];
	requiredOwnershipKinds: readonly ElementKind[];
	/** False until an adapter implements structured interactions; fixtures may supply their own adapter. */
	structuredInteractions: boolean;
	flatStates?: boolean;
	messaging?: boolean;
	interactionContractsOnly?: boolean;
	runtimeKinds?: readonly string[];
}
export interface ReadinessDiagnostic {
	code: string;
	severity: 'error' | 'warning';
	phase: 'syntax' | 'reference' | 'domain' | 'generation';
	object?: ModelReference;
	field: string;
	args: string[];
	action: 'repairShape' | 'resolveReference' | 'classifyLegacy' | 'chooseTechnology' | 'declareExternal' | 'resolveOwnership' | 'chooseProfile' | 'resolveType' | 'resolveDecision' | 'completeBehavior' | 'acceptAssertion';
}
export interface ModelReadiness {
	targetId: string;
	profileId: string | null;
	state: 'draft' | 'structurallyValid' | 'generationReady';
	scopeIds: string[];
	diagnostics: ReadinessDiagnostic[];
	/** Unrelated draft errors remain visible but do not block an independent target. */
	projectDiagnostics: ReadinessDiagnostic[];
}

/** Declarative rule/action catalog is also supplied to the provider grammar. */
export const generationRules = {
	missingTarget: { action: 'resolveReference', requirement: 'The target must resolve to a declared element, operation or field.' },
	migrationRequired: { action: 'repairShape', requirement: 'Generation requires an explicit version 4 model.' },
	profileMissing: { action: 'chooseProfile', requirement: 'A trusted implemented profile must be selected.' },
	unsupportedElement: { action: 'chooseProfile', requirement: 'Every required element kind must be supported by the selected profile.' },
	externalTarget: { action: 'declareExternal', requirement: 'External systems are context dependencies and cannot be implementation targets.' },
	systemScopeMissing: { action: 'declareExternal', requirement: 'Every required system declares governed or external scope.' },
	undeclaredExternal: { action: 'declareExternal', requirement: 'Every external dependency has a declaration for its consumer and external system.' },
	ownershipMissing: { action: 'resolveOwnership', requirement: 'Kinds required by the profile have exactly one valid owner.' },
	legacyOwnership: { action: 'resolveOwnership', requirement: 'Ambiguous legacy parents require explicit classification.' },
	unknownTechnology: { action: 'chooseTechnology', requirement: 'Required technology has exactly one profile binding with a known nonempty string.' },
	unsupportedTechnology: { action: 'chooseTechnology', requirement: 'Known required technologies are supported by the selected profile.' },
	unsupportedType: { action: 'resolveType', requirement: 'Every required type resolves to a declared record or a supported primitive, recursively.' },
	legacyRelation: { action: 'classifyLegacy', requirement: 'Unclassified legacy relations cannot specify executable behavior.' },
	incompleteBehavior: { action: 'completeBehavior', requirement: 'Legacy orders and unspecified frames need supported structured behavior.' },
	assertionUnsatisfied: { action: 'acceptAssertion', requirement: 'An accepted fact must resolve to the same explicitly known model value; unknown assertions cannot become defaults.' },
	unacceptedAssertion: { action: 'acceptAssertion', requirement: 'Required proposed assertions need explicit acceptance; verification never implies acceptance.' },
	contradictoryDecisions: { action: 'resolveDecision', requirement: 'Applicable accepted constraints on the same subject/field must agree without implicit precedence.' },
	incompleteContract: { action: 'resolveType', requirement: 'Shared operation fields declare type and nullable independently of presence; typed errors and required interfaces must resolve.' },
	incompleteC4: { action: 'resolveOwnership', requirement: 'C4 subjects, responsibilities, runtime roles and external integrations are explicit; modules are not deployable containers.' },
	decisionUnsatisfied: { action: 'resolveDecision', requirement: 'Every applicable accepted constraint must match an explicitly known model value.' }
} as const;

/** Syntax errors are distinguished from identity/reference and domain errors before target selection. */
function validateModelLayers(value: unknown): { syntax: ReadinessDiagnostic[]; reference: ReadinessDiagnostic[]; domain: ReadinessDiagnostic[] } {
	const syntax: ReadinessDiagnostic[] = validateSemanticShape(value).map(item => ({ code: item.code, severity: item.severity, phase: 'syntax', field: item.path, args: item.args, action: 'repairShape' }));
	if (syntax.length) { return { syntax, reference: [], domain: [] }; }
	const diagnostics = validateSemanticModel(value).map(item => adaptDiagnostic(value as SemanticModel, item));
	const model = value as SemanticModel;
	if ((model.version === 4 || model.version === 5)) {
		const ids = new Set<string>();
		for (const predicate of model.foundation.predicates ?? []) {
			const reasons = validateModelPredicate(model, predicate); if (ids.has(predicate.id)) { reasons.push('duplicatePredicate'); } ids.add(predicate.id);
			for (const reason of reasons) { diagnostics.push({ code: 'invalidPredicate', severity: 'error', phase: 'domain', object: { kind: 'operation', id: predicate.operationId }, field: `/foundation/predicates/${predicate.id}`, args: [reason], action: 'completeBehavior' }); }
		}
		for (const topology of model.foundation.messaging ?? []) { for (const reason of validateModelMessaging(model, topology.id)) { diagnostics.push({ code: 'invalidMessaging', severity: 'error', phase: 'domain', object: { kind: 'messaging', id: topology.id }, field: `/foundation/messaging/${topology.id}`, args: [reason], action: 'completeBehavior' }); } }
		for (const machine of model.foundation.stateMachines ?? []) { for (const reason of validateModelStateMachine(model, machine.id)) { diagnostics.push({ code: 'invalidStateMachine', severity: 'error', phase: 'domain', object: { kind: 'operation', id: machine.operationId }, field: `/foundation/stateMachines/${machine.id}`, args: [reason], action: 'completeBehavior' }); } }
		for (const interaction of model.foundation.interactions.filter(entry => entry.execution)) { for (const reason of validateModelInteraction(model, interaction.id)) { diagnostics.push({ code: 'invalidInteraction', severity: 'error', phase: 'domain', object: { kind: 'interaction', id: interaction.id }, field: `/foundation/interactions/${interaction.id}`, args: [reason], action: 'completeBehavior' }); } }
	}
	return { syntax, reference: diagnostics.filter(item => item.phase === 'reference'), domain: diagnostics.filter(item => item.phase === 'domain') };
}

function adaptDiagnostic(model: SemanticModel, diagnostic: ModelDiagnostic): ReadinessDiagnostic {
	const path = diagnostic.path.split('/');
	let subject: ModelReference | undefined;
	if (path[1] === 'semantics' && path[2] === 'elements') { const item = model.semantics.elements[Number(path[3])] ?? model.semantics.elements.find(item => item.id === path[3]); if (item) { subject = { kind: 'element', id: item.id }; } }
	else if (path[1] === 'semantics' && path[2] === 'relations') { const item = model.semantics.relations[Number(path[3])] ?? model.semantics.relations.find(item => item.id === path[3]); if (item) { subject = { kind: 'relation', id: item.id }; } }
	else if (path[1] === 'foundation') {
		const kinds: Record<string, ModelReference['kind']> = { ownership: 'ownership', memberships: 'membership', integrations: 'integration', types: 'type', occurrences: 'occurrence', frames: 'frame', interactions: 'interaction', decisions: 'decision', bindings: 'binding', operations: 'operation', interfaces: 'interface', ports: 'port', connections: 'connection', transports: 'transport', modules: 'module', fieldMappings: 'fieldMapping' };
		if (path[2] === 'blueprint' && kinds[path[3]]) { subject = { kind: kinds[path[3]], id: path[4] }; }
		if (kinds[path[2]]) { subject = { kind: kinds[path[2]], id: path[3] }; }
		if (path[2] === 'platform') { subject = { kind: 'binding', id: path[4] }; }
		if (path[2] === 'assertions' && (model.version === 4 || model.version === 5)) { subject = model.foundation.assertions.find(item => item.id === path[3])?.subject; }
	}
	if (diagnostic.code === 'duplicateId') { subject = undefined; }
	const phase = ['missingReference', 'duplicateId', 'missingCriterion', 'missingError', 'viewEndpoint'].includes(diagnostic.code) ? 'reference' : 'domain';
	return { code: diagnostic.code, severity: diagnostic.severity, phase, ...(subject ? { object: subject } : {}), field: diagnostic.path, args: diagnostic.args,
		action: diagnostic.code === 'legacyClassification' ? 'classifyLegacy' : diagnostic.code === 'ownership' || diagnostic.code === 'containmentCycle' ? 'resolveOwnership' : diagnostic.code === 'assertionConflict' || diagnostic.code === 'decisionHistory' ? 'resolveDecision' : diagnostic.code === 'contract' ? 'resolveType' : diagnostic.code === 'c4Scope' ? 'resolveOwnership' : phase === 'reference' ? 'resolveReference' : 'repairShape' };
}

/** Conservative cycle-safe closure. Ancestors provide scope, without dragging in their independent children. */
export function getGenerationScope(model: SemanticModelV4, targetId: string): Set<string> {
	const ids = new Set<string>(); const queue: string[] = [];
	const add = (id: string) => { if (!ids.has(id)) { ids.add(id); queue.push(id); } };
	const f = model.foundation;
	for (const topology of f.messaging?.filter(topology => topology.id === targetId) ?? []) { for (const broker of topology.brokers) { add(broker.elementId); } for (const binding of [...topology.publishers, ...topology.subscriptions]) { add(binding.ownerId); } }
	for (const machine of f.stateMachines?.filter(machine => machine.id === targetId || machine.operationId === targetId) ?? []) { add(machine.ownerId); for (const state of machine.states) { add(state.elementId); } for (const action of machine.actions) { const interaction = f.interactions.find(entry => entry.id === action.interactionId); if (interaction?.ownerId) { add(interaction.ownerId); } } }
	const rootId = generationTargetElement(model, targetId)?.id ?? targetId;
	add(rootId);
	const owned = new Set([rootId]); const ownedQueue = [rootId];
	for (let index = 0; index < ownedQueue.length; index++) {
		const parent = ownedQueue[index];
		for (const entry of f.ownership.filter(entry => entry.ownerId === parent)) { if (!owned.has(entry.elementId)) { owned.add(entry.elementId); ownedQueue.push(entry.elementId); } }
		for (const entry of f.memberships.filter(entry => entry.featureId === parent)) { if (!owned.has(entry.elementId)) { owned.add(entry.elementId); ownedQueue.push(entry.elementId); } }
	}
	for (const id of owned) { add(id); }
	for (let index = 0; index < queue.length; index++) {
		const id = queue[index];
		for (const occurrence of f.occurrences.filter(occurrence => occurrence.from === id || occurrence.to === id)) { add(occurrence.from); add(occurrence.to); const operation = f.blueprint?.operations.find(operation => operation.id === occurrence.operationId); if (operation) { add(operation.ownerId); } }
		for (const relation of model.semantics.relations.filter(relation => relation.from === id)) { add(relation.to); }
		for (const entry of f.ownership.filter(entry => entry.elementId === id)) { add(entry.ownerId); }
		for (const entry of f.memberships.filter(entry => entry.elementId === id)) { add(entry.featureId); }
		for (const integration of f.integrations.filter(entry => entry.consumerId === id)) { add(integration.externalId); }
		const b = f.blueprint;
		if (b) {
			for (const port of b.ports.filter(port => port.elementId === id)) {
				const contract = b.interfaces.find(contract => contract.id === port.interfaceId); if (contract) { add(contract.elementId); }
				for (const connection of b.connections.filter(connection => connection.requiredPortId === port.id || connection.providedPortId === port.id)) { const consumer = b.ports.find(port => port.id === connection.requiredPortId); if (consumer) { add(consumer.elementId); const wanted = b.interfaces.find(contract => contract.id === consumer.interfaceId); if (wanted) { add(wanted.elementId); } } const provided = b.ports.find(port => port.id === connection.providedPortId); if (provided) { add(provided.elementId); const offered = b.interfaces.find(contract => contract.id === provided.interfaceId); if (offered) { add(offered.elementId); } } }
			}
			for (const module of b.modules.filter(module => module.consumerIds.includes(id) || module.elementId === id)) { add(module.elementId); for (const consumerId of module.consumerIds) { add(consumerId); } }
			for (const operation of b.operations.filter(operation => operation.ownerId === id)) { for (const permission of operation.permissions) { add(permission.actorId); } }
		}
		for (const permission of model.semantics.elements.find(element => element.id === id)?.behavior?.permissions ?? []) { add(permission.actorId); }
		for (const decision of f.decisions.filter(entry => entry.status === 'accepted' && entry.scopeIds.includes(id))) {
			for (const scopeId of decision.scopeIds) { add(scopeId); }
			for (const constraint of decision.constraints) {
				const subject = constraint.subject;
				for (const elementId of referenceElementIds(model, subject)) { add(elementId); }
			}
		}
		for (const interaction of f.interactions.filter(entry => interactionInScope(model, entry, ids))) {
			const occurrenceIds = new Set([...interaction.occurrenceIds, ...f.frames.filter(frame => interaction.frameIds.includes(frame.id)).flatMap(frame => frame.occurrenceIds)]);
			for (const occurrence of f.occurrences.filter(entry => occurrenceIds.has(entry.id))) { add(occurrence.from); add(occurrence.to); }
			for (const relation of model.semantics.relations.filter(entry => interaction.legacyRelationOrder?.includes(entry.id))) { add(relation.from); add(relation.to); }
		}
	}
	return ids;
}

/** No default profile or technology: PIM validity and PSM generation readiness are different results. */
export function getModelReadiness(value: unknown, targetId: string, profile?: GenerationProfile): ModelReadiness {
	const layers = validateModelLayers(value);
	if (layers.syntax.length) {
		const diagnostics = layers.syntax;
		return { targetId, profileId: profile?.id ?? null, state: 'draft', scopeIds: [], diagnostics, projectDiagnostics: diagnostics };
	}
	const model = value as SemanticModel;
	const projectDiagnostics = [...layers.reference, ...layers.domain];
	const scope = (model.version === 4 || model.version === 5) ? getGenerationScope(model as SemanticModelV4, targetId) : new Set([targetId]);
	const target = generationTargetElement(model, targetId);
	const diagnostics: ReadinessDiagnostic[] = [];
	const add = (code: keyof typeof generationRules, id: string, field: string, ...args: string[]) => diagnostics.push({ code, severity: 'error', phase: 'generation', object: { kind: 'element', id: generationTargetElement(model, id)?.id ?? id }, field, action: generationRules[code].action, args });
	const scopedObjects = (model.version === 4 || model.version === 5) ? getScopeObjectKeys(model as SemanticModelV4, scope) : new Set([`element:${targetId}`]);
	for (const item of projectDiagnostics) {
		// Global identity ambiguity cannot safely be assigned to a different target.
		if (item.field.startsWith('/views/')) {
			const view = model.views[Number(item.field.split('/')[2])];
			if (!view || !view.nodes.some(node => scope.has(node.elementId)) && !scope.has(view.featureId ?? '')) { continue; }
		}
		if (!item.object || scopedObjects.has(`${item.object.kind}:${item.object.id}`)) { diagnostics.push(item); }
	}
	if (!target) { add('missingTarget', targetId, '/targetId', targetId); }
	if ((model.version !== 4 && model.version !== 5)) { add('migrationRequired', targetId, '/version', String(model.version)); }
	if (!profile) { add('profileMissing', targetId, '/profileId'); }
	if ((model.version === 4 || model.version === 5)) {
		const m = model as SemanticModelV4; const f = m.foundation;
		for (const scenario of f.interactions.filter(entry => entry.profile === 'descriptive' && entry.description?.participantIds.some(id => scope.has(id)))) { add('incompleteBehavior', targetId, '/foundation/interactions/' + scenario.id, 'descriptiveScenarioIsNotExecutable'); }
		for (const topology of f.messaging?.filter(topology => topology.id === targetId) ?? []) { if (!profile?.messaging) { add('incompleteBehavior', topology.brokers[0]?.elementId ?? topology.id, '/messaging', 'messaging'); } }
		for (const machine of f.stateMachines?.filter(machine => machine.id === targetId || machine.operationId === targetId) ?? []) { if (!profile?.flatStates) { add('incompleteBehavior', machine.ownerId, '/stateMachines', 'flatStates'); } }
		for (const element of m.semantics.elements.filter(element => scope.has(element.id))) {
			if (profile && !profile.elementKinds.includes(element.kind)) { add('unsupportedElement', element.id, '/kind', element.kind); }
			if (element.kind === 'system' && !element.scope) { add('systemScopeMissing', element.id, '/scope'); }
			if (element.scope === 'external') {
				if (target?.id === element.id) { add('externalTarget', element.id, '/scope'); }
				const consumers = new Set([
					...m.semantics.relations.filter(edge => edge.to === element.id && scope.has(edge.from)).map(edge => edge.from),
					...f.occurrences.filter(call => call.to === element.id && scope.has(call.from)).map(call => call.from),
					...(f.blueprint?.connections.filter(connection => f.blueprint!.ports.some(port => port.id === connection.providedPortId && port.elementId === element.id)).flatMap(connection => f.blueprint!.ports.filter(port => port.id === connection.requiredPortId && scope.has(port.elementId)).map(port => port.elementId)) ?? [])
				]);
				for (const consumerId of consumers) {
					if (!f.integrations.some(entry => entry.externalId === element.id && entry.consumerId === consumerId) || f.blueprint && !m.views.some(view => view.kind === 'c4Context' && scope.has(view.subjectId ?? '') && view.contextIds?.includes(element.id) && view.nodes.some(node => node.elementId === element.id))) { add('undeclaredExternal', consumerId, '/integrations', element.id); }
				}
			}
			if (profile?.requiredOwnershipKinds.includes(element.kind) && !f.ownership.some(entry => entry.elementId === element.id)) { add('ownershipMissing', element.id, '/ownership'); }
			if (f.migration?.unresolvedOwnershipIds.includes(element.id) && !f.ownership.some(entry => entry.elementId === element.id)) { add('legacyOwnership', element.id, '/parentId'); }
			if (profile?.requiredTechnologyKinds.includes(element.kind) && element.scope !== 'external') {
				const bindings = f.platform.bindings.filter(entry => entry.elementId === element.id && entry.profileId === profile.id);
				if (bindings.length !== 1 || bindings[0].technology.state !== 'known' || typeof bindings[0].technology.value !== 'string' || !bindings[0].technology.value.trim()) { add('unknownTechnology', element.id, '/platform/technology'); }
				else if (!profile.technologies.includes(bindings[0].technology.value)) { add('unsupportedTechnology', element.id, '/platform/technology', bindings[0].technology.value); }
			}
			if (profile) {
				for (const field of [...(element.behavior?.inputs ?? []), ...(element.behavior?.outputs ?? []), ...(element.details?.members ?? [])]) {
					if (!field.typeId && !profile.primitiveTypes.includes(field.type)) { add('unsupportedType', element.id, `/fields/${field.id}/type`, field.type); }
				}
			}
		}
		if (f.blueprint) {
			for (const element of m.semantics.elements.filter(element => scope.has(element.id))) {
				if (element.kind === 'container' && profile?.runtimeKinds && !profile.runtimeKinds.includes(element.runtimeKind ?? '')) { add('unsupportedElement', element.id, '/runtimeKind', element.runtimeKind ?? 'unknown'); }
				if (element.kind === 'container' && (!element.runtimeKind || !element.description?.trim())) { add('incompleteC4', element.id, '/runtimeKind'); }
				if (element.kind === 'component' && !element.description?.trim()) { add('incompleteC4', element.id, '/description'); }
			}
			for (const operation of f.blueprint.operations.filter(operation => scopedObjects.has(`operation:${operation.id}`))) {
				for (const field of [...operation.inputs, ...operation.outputs]) {
					if (!field.typeId && (!profile || !profile.primitiveTypes.includes(field.type)) || field.nullable?.state !== 'known' || typeof field.nullable.value !== 'boolean') { add('incompleteContract', operation.ownerId, `/operations/${operation.id}/fields/${field.id}`); }
				}
			}
			for (const module of f.blueprint.modules.filter(module => scopedObjects.has(`module:${module.id}`))) { if (module.library.state !== 'known' || module.version.state !== 'known') { add('incompleteC4', module.elementId, '/modules', module.id); } }
		}
		if (profile) {
			for (const type of f.types.filter(type => scopedObjects.has(`type:${type.id}`))) {
				if (type.kind === 'primitive' && !profile.primitiveTypes.includes(type.primitive ?? '')) { add('unsupportedType', targetId, `/types/${type.id}/primitive`, type.primitive ?? ''); }
				for (const field of type.fields) { if (f.blueprint && (field.nullable?.state !== 'known' || typeof field.nullable.value !== 'boolean')) { add('incompleteContract', targetId, `/types/${type.id}/fields/${field.id}/nullable`); } if (!field.typeId && !profile.primitiveTypes.includes(field.type)) { add('unsupportedType', targetId, `/types/${type.id}/fields/${field.id}/type`, field.type); } }
			}
		}
		for (const relation of m.semantics.relations.filter(relation => scope.has(relation.from))) { if (relation.classification) { add('legacyRelation', relation.from, '/classification', relation.id); } }
		for (const frame of f.frames.filter(entry => scopedObjects.has(`frame:${entry.id}`))) { if (frame.kind === 'unspecified' || !profile?.structuredInteractions) { add('incompleteBehavior', targetId, '/frames', frame.id); } }
		for (const interaction of f.interactions.filter(entry => interactionInScope(m, entry, scope))) {
			if (interaction.legacyRelationOrder?.length || interaction.frameIds.length && (!profile?.structuredInteractions || !interaction.execution) || !profile?.structuredInteractions && !profile?.interactionContractsOnly) { add('incompleteBehavior', interaction.ownerId ?? targetId, '/interactions', interaction.id); }
		}
		const assertionObjects = modelObjects(m);
		for (const assertion of f.assertions.filter(item => scopedObjects.has(`${item.subject.kind}:${item.subject.id}`))) {
			if (assertion.acceptance.status === 'proposed') { add('unacceptedAssertion', targetId, assertion.field, assertion.id); }
			if (assertion.acceptance.status === 'accepted') {
				const actual = readModelField(assertionObjects.get(`${assertion.subject.kind}:${assertion.subject.id}`), assertion.field);
				if (assertion.value.state !== 'known' || actual === undefined || canonicalJson(actual) !== canonicalJson(assertion.value.value)) { add('assertionUnsatisfied', targetId, assertion.field, assertion.id); }
			}
		}
		const constraints = new Map<string, { value: string; operator: string }[]>(); const objects = modelObjects(m);
		for (const decision of f.decisions.filter(entry => entry.status === 'accepted' && entry.scopeIds.some(id => scope.has(id)))) {
			for (const constraint of decision.constraints) {
				const key = `${constraint.subject.kind}:${constraint.subject.id}:${constraint.field}`;
				const expected = canonicalJson(constraint.value); const operator = constraint.operator ?? 'equals';
				const previous = constraints.get(key) ?? [];
				if (previous.some(item => operator === 'equals' && item.operator === 'equals' ? item.value !== expected : operator !== item.operator && item.value === expected)) { add('contradictoryDecisions', targetId, constraint.field, decision.id, constraint.subject.id); }
				previous.push({ value: expected, operator }); constraints.set(key, previous);
				const actual = readModelField(objects.get(`${constraint.subject.kind}:${constraint.subject.id}`), constraint.field);
				const matches = constraint.value.state === 'known' && actual !== undefined && canonicalJson(actual) === canonicalJson(constraint.value.value);
				if (constraint.value.state !== 'known' || actual === undefined || (operator === 'equals' ? !matches : matches)) { add('decisionUnsatisfied', targetId, constraint.field, decision.id, constraint.subject.id); }
			}
		}
	}
	const structuralError = diagnostics.some(item => item.phase !== 'generation' && item.severity === 'error') || !target;
	return { targetId, profileId: profile?.id ?? null, state: structuralError ? 'draft' : diagnostics.some(item => item.severity === 'error') ? 'structurallyValid' : 'generationReady', scopeIds: [...scope].sort(), diagnostics, projectDiagnostics };
}

/** All included object identities, with recursive type dependencies and no view/layout identities. */
export function getScopeObjectKeys(model: SemanticModelV4, scope: Set<string>): Set<string> {
	const keys = new Set<string>(); const f = model.foundation;
	const add = (kind: ModelReference['kind'], id?: string) => { if (id) { keys.add(`${kind}:${id}`); } };
	const typeIds = new Set<string>();
	for (const element of model.semantics.elements.filter(item => scope.has(item.id))) {
		add('element', element.id); add('operation', element.behavior?.id);
		for (const field of [...(element.behavior?.inputs ?? []), ...(element.behavior?.outputs ?? [])]) { add('field', field.id); if (field.typeId) { typeIds.add(field.typeId); } }
		for (const member of element.details?.members ?? []) { add(member.kind === 'method' ? 'operation' : 'field', member.id); if (member.typeId) { typeIds.add(member.typeId); } }
	}
	for (const relation of model.semantics.relations.filter(item => scope.has(item.from))) { add('relation', relation.id); }
	for (const typeId of typeIds) { add('type', typeId); for (const field of f.types.find(item => item.id === typeId)?.fields ?? []) { add('field', field.id); if (field.typeId) { typeIds.add(field.typeId); } } }
	for (const entry of f.ownership.filter(item => scope.has(item.elementId))) { add('ownership', entry.id); }
	for (const entry of f.memberships.filter(item => scope.has(item.elementId))) { add('membership', entry.id); }
	for (const entry of f.integrations.filter(item => scope.has(item.consumerId))) { add('integration', entry.id); }
	for (const entry of f.platform.bindings.filter(item => scope.has(item.elementId))) { add('binding', entry.id); }
	for (const entry of f.decisions.filter(item => item.status === 'accepted' && item.scopeIds.some(id => scope.has(id)))) { add('decision', entry.id); }
	for (const occurrence of f.occurrences.filter(item => scope.has(item.from) || scope.has(item.to))) { add('occurrence', occurrence.id); if (occurrence.operationId) { add('operation', occurrence.operationId); } if (occurrence.errorId) { add('error', occurrence.errorId); } }
	for (const entry of f.interactions.filter(item => interactionInScope(model, item, scope))) {
		add('interaction', entry.id);
		for (const id of entry.frameIds) { add('frame', id); for (const occurrenceId of f.frames.find(item => item.id === id)?.occurrenceIds ?? []) { add('occurrence', occurrenceId); } }
		for (const id of entry.occurrenceIds) { add('occurrence', id); }
	}
	const b = f.blueprint;
	if (b) {
		for (const operation of b.operations.filter(operation => scope.has(operation.ownerId))) {
			add('operation', operation.id);
			for (const field of [...operation.inputs, ...operation.outputs]) { add('field', field.id); if (field.typeId) { add('type', field.typeId); } }
			for (const error of operation.errors) { add('error', error.id); add('type', error.typeId); }
		}
		for (const contract of b.interfaces.filter(contract => scope.has(contract.elementId))) { add('interface', contract.id); for (const id of contract.operationIds) { add('operation', id); } }
		for (const port of b.ports.filter(port => scope.has(port.elementId))) { add('port', port.id); }
		for (const connection of b.connections.filter(connection => keys.has(`port:${connection.requiredPortId}`))) { add('connection', connection.id); add('port', connection.providedPortId); }
		for (const transport of b.transports.filter(transport => keys.has(`relation:${transport.relationId}`))) { add('transport', transport.id); add('type', transport.schemaTypeId); }
		for (const module of b.modules.filter(module => module.consumerIds.some(id => scope.has(id)))) { add('module', module.id); }
		for (const mapping of b.fieldMappings.filter(mapping => keys.has(`field:${mapping.domainFieldId}`) || keys.has(`field:${mapping.targetFieldId}`))) { add('fieldMapping', mapping.id); add('field', mapping.domainFieldId); add('field', mapping.targetFieldId); }
	}
	for (const predicate of f.predicates ?? []) { if (keys.has(`operation:${predicate.operationId}`)) { add('predicate', predicate.id); for (const node of predicate.nodes) { if ('typeId' in node) { add('type', node.typeId); } if (node.kind === 'reference') { add('field', node.fieldId); for (const id of node.path) { add('field', id); } } } } }
	const objects = modelObjects(model);
	for (const decision of f.decisions.filter(item => keys.has(`decision:${item.id}`))) { for (const constraint of decision.constraints) { add(constraint.subject.kind, constraint.subject.id); } }
	for (const key of keys) {
		const item = objects.get(key);
		if (!item) { continue; }
		if ('typeId' in item && typeof item.typeId === 'string') { add('type', item.typeId); }
		if (key.startsWith('field:')) { for (const type of f.types.filter(type => type.fields.some(field => `field:${field.id}` === key))) { add('type', type.id); } }
		if (key.startsWith('type:')) { const type = f.types.find(type => `type:${type.id}` === key); for (const field of type?.fields ?? []) { add('field', field.id); if (field.typeId) { add('type', field.typeId); } } if (type?.itemTypeId) { add('type', type.itemTypeId); } if (type?.targetTypeId) { add('type', type.targetTypeId); } }
	}
	return keys;
}

/** JSON Pointer traversal uses own properties and never interprets labels as instructions. */
function readModelField(value: object | undefined, pointer: string): object | string | number | boolean | null | undefined {
	let current: unknown = value;
	for (const token of pointer.slice(1).split('/').map(token => token.replaceAll('~1', '/').replaceAll('~0', '~'))) {
		if (!current || typeof current !== 'object' || !Object.hasOwn(current, token)) { return undefined; }
		current = (current as Record<string, unknown>)[token];
	}
	return current as object | string | number | boolean | null | undefined;
}

/** Operations and fields are valid generation targets without becoming duplicate element definitions. */
function generationTargetElement(model: SemanticModel, id: string) {
	const topology = (model.version === 4 || model.version === 5) ? model.foundation.messaging?.find(topology => topology.id === id) : undefined;
	if (topology) { return model.semantics.elements.find(element => element.id === topology.publishers[0]?.ownerId); }
	const machine = (model.version === 4 || model.version === 5) ? model.foundation.stateMachines?.find(machine => machine.id === id) : undefined;
	const operation = (model.version === 4 || model.version === 5) ? model.foundation.blueprint?.operations.find(operation => operation.id === id || [...operation.inputs, ...operation.outputs].some(field => field.id === id)) : undefined;
	return model.semantics.elements.find(element => element.id === machine?.ownerId || element.id === operation?.ownerId || element.id === id || element.behavior?.id === id || [...(element.behavior?.inputs ?? []), ...(element.behavior?.outputs ?? []), ...(element.details?.members ?? [])].some(field => field.id === id));
}

/** Legacy ownerless sequences still constrain the endpoints they mention; they cannot disappear from readiness. */
function interactionInScope(model: SemanticModelV4, interaction: ModelFoundation['interactions'][number], scope: Set<string>): boolean {
	if (interaction.ownerId) { return scope.has(interaction.ownerId); }
	const ids = new Set([...interaction.occurrenceIds, ...model.foundation.frames.filter(frame => interaction.frameIds.includes(frame.id)).flatMap(frame => frame.occurrenceIds)]);
	return model.foundation.occurrences.some(entry => ids.has(entry.id) && (scope.has(entry.from) || scope.has(entry.to)))
		|| model.semantics.relations.some(entry => interaction.legacyRelationOrder?.includes(entry.id) && (scope.has(entry.from) || scope.has(entry.to)));
}

/** Constraint subjects retain the elements necessary to resolve their namespace-qualified identity. */
function referenceElementIds(model: SemanticModelV4, subject: ModelReference): string[] {
	const f = model.foundation;
	switch (subject.kind) {
		case 'element': return [subject.id];
		case 'messaging': return f.messaging?.filter(topology => topology.id === subject.id).flatMap(topology => [...topology.brokers.map(broker => broker.elementId), ...topology.publishers.map(binding => binding.ownerId), ...topology.subscriptions.map(binding => binding.ownerId)]) ?? [];
		case 'stateMachine': return f.stateMachines?.filter(machine => machine.id === subject.id).map(machine => machine.ownerId) ?? [];
		case 'field':
		case 'operation': return [...(f.blueprint?.operations.filter(operation => operation.id === subject.id || [...operation.inputs, ...operation.outputs].some(field => field.id === subject.id)).map(operation => operation.ownerId) ?? []), ...model.semantics.elements.filter(element => element.behavior?.id === subject.id || [...(element.behavior?.inputs ?? []), ...(element.behavior?.outputs ?? []), ...(element.details?.members ?? [])].some(member => member.id === subject.id)).map(element => element.id)];
		case 'relation': return model.semantics.relations.filter(item => item.id === subject.id).flatMap(item => [item.from, item.to]);
		case 'binding': return f.platform.bindings.filter(item => item.id === subject.id).map(item => item.elementId);
		case 'ownership': return f.ownership.filter(item => item.id === subject.id).flatMap(item => [item.elementId, item.ownerId]);
		case 'membership': return f.memberships.filter(item => item.id === subject.id).flatMap(item => [item.elementId, item.featureId]);
		case 'integration': return f.integrations.filter(item => item.id === subject.id).flatMap(item => [item.consumerId, item.externalId]);
		case 'occurrence': return f.occurrences.filter(item => item.id === subject.id).flatMap(item => [item.from, item.to]);
		case 'frame': return f.frames.filter(item => item.id === subject.id).flatMap(item => f.occurrences.filter(occurrence => item.occurrenceIds.includes(occurrence.id)).flatMap(occurrence => [occurrence.from, occurrence.to]));
		case 'interaction': return f.interactions.filter(item => item.id === subject.id).flatMap(item => [...(item.ownerId ? [item.ownerId] : []), ...f.occurrences.filter(occurrence => item.occurrenceIds.includes(occurrence.id)).flatMap(occurrence => [occurrence.from, occurrence.to])]);
		case 'decision': return f.decisions.filter(item => item.id === subject.id).flatMap(item => item.scopeIds);
		case 'interface': return f.blueprint?.interfaces.filter(item => item.id === subject.id).map(item => item.elementId) ?? [];
		case 'port': return f.blueprint?.ports.filter(item => item.id === subject.id).map(item => item.elementId) ?? [];
		case 'module': return f.blueprint?.modules.filter(item => item.id === subject.id).flatMap(item => [item.elementId, ...item.consumerIds]) ?? [];
		case 'transport': return f.blueprint?.transports.filter(item => item.id === subject.id).flatMap(item => model.semantics.relations.filter(relation => relation.id === item.relationId).flatMap(relation => [relation.from, relation.to])) ?? [];
		case 'connection': return f.blueprint?.connections.filter(item => item.id === subject.id).flatMap(item => f.blueprint!.ports.filter(port => port.id === item.requiredPortId || port.id === item.providedPortId).map(port => port.elementId)) ?? [];
		case 'fieldMapping': return f.blueprint?.fieldMappings.filter(item => item.id === subject.id).flatMap(item => [...referenceElementIds(model, { kind: 'field', id: item.domainFieldId }), ...referenceElementIds(model, { kind: 'field', id: item.targetFieldId })]) ?? [];
		case 'error': return f.blueprint?.operations.filter(operation => operation.errors.some(error => error.id === subject.id)).map(operation => operation.ownerId) ?? [];
		case 'predicate': return f.predicates?.filter(predicate => predicate.id === subject.id).flatMap(predicate => referenceElementIds(model, { kind: 'operation', id: predicate.operationId })) ?? [];
		case 'type': return [];
	}
}

/** Reject a transformation before any provider result can authorize publication. */
export function assertModelProposalAllowed(baseline: SemanticModelV4, candidate: SemanticModel, targetId: string, profile: GenerationProfile): void {
	const result = getModelReadiness(candidate, targetId, profile);
	if (result.state !== 'generationReady') { throw new Error(`Model proposal blocked: ${result.diagnostics.map(item => item.code).join(', ')}`); }
	if ((candidate.version !== 4 && candidate.version !== 5) || canonicalJson(candidate.foundation.decisions) !== canonicalJson(baseline.foundation.decisions)) { throw new Error('Model proposal blocked: normativeDecisionMutation; revise project decisions through the tracked editor first'); }
}
