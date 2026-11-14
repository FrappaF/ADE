/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { blueprintRules, type ModelDiagnostic, type ModelField, type ModelOperation, type ObjectKind, type SemanticModelV4 } from './modelTypes.js';
import { modelObjects } from './modelFoundation.js';

/** Conservative structural assignability; cycles are compared once, never expanded indefinitely. */
function isContractFieldAssignable(model: SemanticModelV4, source: ModelField, target: ModelField): boolean {
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
export function validateBlueprint(model: SemanticModelV4): ModelDiagnostic[] {
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
		if (parent?.scope === 'external' || child?.kind === 'system' || child?.kind === 'container' && parent?.kind !== 'system' || ['component', 'controller'].includes(child?.kind ?? '') && parent?.kind !== 'container' || child?.kind === 'dataStore' && parent?.kind !== 'container' && parent?.kind !== 'system') { report('ownership', `/foundation/ownership/${entry.id}`, entry.elementId, 'c4Owner'); }
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
