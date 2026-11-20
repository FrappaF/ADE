import { emptyBlueprint } from './modelFoundation.js';
import { readSemanticDraft, validateSemanticModel } from './modelValidation.js';
import { type ModelBlueprint, type ModelDecision, type ModelView, type SemanticModelV4 } from './modelTypes.js';

/** Semantic C4 navigation is separate from geometric zoom; every destination keeps its subject identity. */
export function getC4DrillDown(model: SemanticModelV4, elementId: string): ModelView[] {
	const element = model.semantics.elements.find(element => element.id === elementId);
	const kind = element?.kind === 'system' && element.scope === 'governed' ? 'c4Container' : element?.kind === 'container' ? 'c4Component' : ['interface', 'contract', 'class'].includes(element?.kind ?? '') ? 'class' : undefined;
	if (!kind) { return []; }
	return model.views.filter(view => view.subjectId === elementId && view.kind === kind);
}

/** A projection reads shared declarations. External context never acquires internal implementation. */
export function getContractProjection(model: SemanticModelV4, elementId: string) {
	const b = model.foundation.blueprint ?? emptyBlueprint();
	const contracts = b.interfaces.filter(contract => contract.elementId === elementId || b.ports.some(port => port.elementId === elementId && port.interfaceId === contract.id));
	const ids = new Set(contracts.flatMap(contract => contract.operationIds));
	const operations = b.operations.filter(operation => ids.has(operation.id) || operation.ownerId === elementId);
	const typeIds = new Set(operations.flatMap(operation => [...operation.inputs, ...operation.outputs, ...operation.errors].flatMap(field => field.typeId ? [field.typeId] : [])));
	for (const id of typeIds) { const type = model.foundation.types.find(type => type.id === id); for (const child of [...(type?.fields.flatMap(field => field.typeId ? [field.typeId] : []) ?? []), ...(type?.itemTypeId ? [type.itemTypeId] : []), ...(type?.targetTypeId ? [type.targetTypeId] : [])]) { typeIds.add(child); } }
	return { contracts, operations, types: model.foundation.types.filter(type => typeIds.has(type.id)), ports: b.ports.filter(port => port.elementId === elementId) };
}

/** Includes consumers and repeated occurrences when a signature changes; no alternate operation is created. */
export function getContractImpact(model: SemanticModelV4, operationId: string) {
	const b = model.foundation.blueprint ?? emptyBlueprint();
	const interfaces = b.interfaces.filter(contract => contract.operationIds.includes(operationId)).map(contract => contract.id);
	const ports = b.ports.filter(port => interfaces.includes(port.interfaceId));
	const connections = b.connections.filter(connection => connection.operations.some(mapping => mapping.requiredOperationId === operationId || mapping.providedOperationId === operationId));
	const relatedPorts = b.ports.filter(port => connections.some(connection => connection.requiredPortId === port.id || connection.providedPortId === port.id));
	return { operationId, interfaceIds: interfaces, consumerIds: [...new Set([...ports, ...relatedPorts].map(port => port.elementId))].sort(), occurrenceIds: model.foundation.occurrences.filter(occurrence => occurrence.operationId === operationId).map(occurrence => occurrence.id).sort() };
}

/** Applies one optimistic ADR revision and preserves the previous complete normative snapshot. */
export function reviseModelDecision(model: SemanticModelV4, next: ModelDecision, expectedRevision?: string): SemanticModelV4 {
	const candidate = readSemanticDraft(model) as SemanticModelV4;
	const previous = candidate.foundation.decisions.find(decision => decision.id === next.id);
	if ((previous?.revision ?? undefined) !== expectedRevision) { throw new Error('Decision revision is stale'); }
	if (previous && (previous.revision === next.revision || !next.record)) { throw new Error('A new revision and a complete decision record are required'); }
	const entry = structuredClone(next);
	if (!entry.record) { throw new Error('A complete decision record is required'); }
	if (previous?.record) {
		const { history, ...record } = previous.record;
		entry.record.history = [...history, { revision: previous.revision, status: previous.status, scopeIds: previous.scopeIds, constraints: previous.constraints, ...record }];
	} else if (previous) { entry.record.history = [{ revision: previous.revision, status: previous.status, scopeIds: previous.scopeIds, constraints: previous.constraints }]; } else if (entry.record.history.length) { throw new Error('New decisions cannot invent revision history'); }
	candidate.foundation.decisions = [...candidate.foundation.decisions.filter(decision => decision.id !== entry.id), entry];
	const errors = validateSemanticModel(candidate).filter(item => item.code === 'decisionHistory' && item.path === `/foundation/decisions/${entry.id}` || item.code === 'shape');
	if (errors.length) { throw new Error('Invalid decision revision or replacement'); }
	return readSemanticDraft(candidate) as SemanticModelV4;
}

/** A proposed transformation must satisfy the same normative checks as the current target. */
export function setBlueprintRecord<K extends keyof ModelBlueprint>(model: SemanticModelV4, section: K, entry: ModelBlueprint[K][number]): SemanticModelV4 {
	const candidate = structuredClone(model); const b = candidate.foundation.blueprint ??= emptyBlueprint();
	const index = b[section].findIndex(item => item.id === entry.id);
	Object.assign(b, { [section]: index < 0 ? [...b[section], structuredClone(entry)] : b[section].map(item => item.id === entry.id ? structuredClone(entry) : item) });
	return readSemanticDraft(candidate) as SemanticModelV4;
}
