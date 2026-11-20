import { type ModelBlueprint, type ModelFoundation, type ObjectKind, type SemanticModel, type SemanticModelV4 } from './modelTypes.js';

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

/** A deterministic source index is evidence for AI, never the user-facing diagram model. */
export function isSourceEvidenceModel(model: SemanticModel): boolean {
	return model.version !== 5 && model.id.startsWith('code:') && !model.semantics.elements.some(element => element.kind === 'feature');
}
