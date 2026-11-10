/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { type IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { type ModelExpression, type ModelField, type ModelPredicate, type PredicateNode, type SemanticModelV4 } from '../common/modelTypes.js';
import { checkModelExpression, fieldValueType } from '../common/modelValues.js';
import { type VisualEdit } from '../common/visualEditing.js';

/** Native, bounded AST builder. A canceled dialog never publishes the detached graph. */
export async function editAdePredicate(quick: Pick<IQuickInputService, 'pick' | 'input'>, model: SemanticModelV4, elementId?: string): Promise<VisualEdit[] | undefined> {
	const operations = model.foundation.blueprint?.operations ?? [];
	const operation = await quick.pick(operations.map(operation => ({ label: operation.name, description: model.semantics.elements.find(element => element.id === operation.ownerId)?.name, picked: operation.ownerId === elementId, operation })), { title: localize('ade.predicate.operation', "Predicate Operation") });
	if (!operation) { return; }
	const existing = await quick.pick([{ label: localize('ade.predicate.create', "Create New Predicate"), predicate: undefined as ModelPredicate | undefined }, ...model.foundation.predicates?.filter(predicate => predicate.operationId === operation.operation.id).map(predicate => ({ label: predicate.id, predicate })) ?? []], { title: localize('ade.predicate.select', "Pure Predicate") });
	if (!existing) { return; }
	const phase = await quick.pick([{ label: localize('ade.predicate.pre', "Precondition · Inputs Only"), value: 'pre' as const }, { label: localize('ade.predicate.post', "Postcondition · Inputs and Outputs"), value: 'post' as const }], { title: localize('ade.predicate.phase', "Variable Scope") });
	if (!phase) { return; }
	const predicate: ModelPredicate = existing.predicate ? structuredClone(existing.predicate) : { id: generateUuid(), version: 1, operationId: operation.operation.id, phase: phase.value, rootId: '', nodes: [] };
	predicate.phase = phase.value;
	const expression = await buildAdeExpression(quick, model, [...operation.operation.inputs, ...(phase.value === 'post' ? operation.operation.outputs : [])], predicate, true);
	return expression ? [{ kind: 'predicate', entry: { ...predicate, ...expression } }] : undefined;
}

/** Shared native graph builder for predicates, arguments, outputs, correlation and guards. */
export async function buildAdeExpression(quick: Pick<IQuickInputService, 'pick' | 'input'>, model: SemanticModelV4, fields: ModelField[], initial?: ModelExpression, booleanRoot = false): Promise<ModelExpression | undefined> {
	const predicate: ModelExpression = initial ? { version: 1, nodes: structuredClone(initial.nodes), rootId: initial.rootId } : { version: 1, nodes: [], rootId: '' };
	const pickNode = async () => (await quick.pick(predicate.nodes.map(node => ({ label: node.id, description: { literal: localize('ade.predicate.literalNode', "Literal"), reference: localize('ade.predicate.referenceNode', "Field Reference"), compare: localize('ade.predicate.comparisonNode', "Comparison"), logic: localize('ade.predicate.logicNode', "Boolean Logic"), check: localize('ade.predicate.checkNode', "Presence or Null Check"), arithmetic: localize('ade.predicate.arithmeticNode', "Exact Integer Arithmetic"), collection: localize('ade.predicate.collectionNode', "Collection Predicate") }[node.kind], node })), { title: localize('ade.predicate.operand', "Previously Defined Operand") }))?.node.id;
	while (predicate.nodes.length <= 128) {
		const action = await quick.pick([
			{ label: localize('ade.predicate.reference', "Add Field Reference"), kind: 'reference' as const },
			{ label: localize('ade.predicate.literal', "Add Typed Literal"), kind: 'literal' as const },
			{ label: localize('ade.predicate.compare', "Add Comparison"), kind: 'compare' as const },
			{ label: localize('ade.predicate.logic', "Add Boolean Logic"), kind: 'logic' as const },
			{ label: localize('ade.predicate.check', "Add Presence or Null Check"), kind: 'check' as const },
			{ label: localize('ade.expression.arithmetic', "Add Exact Integer Arithmetic"), kind: 'arithmetic' as const },
			{ label: localize('ade.expression.collection', "Add Collection Operation"), kind: 'collection' as const },
			{ label: localize('ade.predicate.reset', "Clear Detached Expression"), kind: 'reset' as const },
			{ label: localize('ade.predicate.finish', "Choose Result and Save"), kind: 'finish' as const }
		], { title: localize('ade.predicate.builder', "Pure Predicate · {0} Nodes", predicate.nodes.length) });
		if (!action) { return; }
		if (action.kind === 'reset') { predicate.nodes = []; continue; }
		if (action.kind === 'finish') {
			const rootId = await pickNode(); if (!rootId) { return; } predicate.rootId = rootId;
			const checked = checkModelExpression(model, predicate, Object.fromEntries(fields.map(field => [field.id!, fieldValueType(field)])));
			if (checked.errors.length || booleanRoot && checked.type?.typeId !== '$boolean' && model.foundation.types.find(type => type.id === checked.type?.typeId)?.primitive !== 'boolean') { throw new Error(localize('ade.predicate.invalid', "The expression must use compatible types, variables in scope, and a boolean result.")); }
			return predicate;
		}
		if (predicate.nodes.length === 128) { throw new Error(localize('ade.predicate.limit', "This Expression Reached the Supported Node Limit.")); }
		const id = generateUuid(); let node: PredicateNode;
		if (action.kind === 'reference') {
			const field = await quick.pick(fields.map(field => ({ label: field.name, field })), { title: localize('ade.predicate.field', "Parameter or Result") }); if (!field?.field.id) { return; }
			let typeId = field.field.typeId; const path: string[] = [];
			for (let depth = 0; depth < 16; depth++) {
				const type = model.foundation.types.find(type => type.id === typeId);
				if (type?.kind === 'reference') { typeId = type.targetTypeId; continue; }
				if (!type?.fields.length) { break; }
				const member = await quick.pick([{ label: localize('ade.expression.whole', "Use Whole Value"), field: undefined as ModelField | undefined }, ...type.fields.map(field => ({ label: field.name, field }))], { title: localize('ade.predicate.member', "Record Field") }); if (!member) { return; } if (!member.field) { break; } if (!member.field.id) { return; } path.push(member.field.id); typeId = member.field.typeId;
			}
			node = { id, kind: 'reference', fieldId: field.field.id, path };
		} else if (action.kind === 'literal') {
			const type = await quick.pick(model.foundation.types.filter(type => type.kind === 'enum' || type.kind === 'primitive' && ['string', 'integer', 'boolean'].includes(type.primitive ?? '')).map(type => ({ label: type.name, domainType: type })), { title: localize('ade.predicate.literalType', "Literal Domain Type") }); if (!type) { return; }
			const enumChoice = type.domainType.kind === 'enum' ? await quick.pick(type.domainType.values!.map(value => ({ label: value, value })), { title: localize('ade.expression.enum', "Declared Enum Value") }) : undefined;
			if (type.domainType.kind === 'enum') { if (!enumChoice) { return; } node = { id, kind: 'literal', typeId: type.domainType.id, value: enumChoice.value }; predicate.nodes.push(node); continue; }
			const value = await quick.input({ title: localize('ade.predicate.literalValue', "Literal Value (JSON Scalar)"), validateInput: async value => { try { const parsed: unknown = JSON.parse(value); if (parsed === null || typeof parsed === (type.domainType.primitive === 'integer' ? 'number' : type.domainType.primitive) && (typeof parsed !== 'number' || Number.isSafeInteger(parsed))) { return undefined; } } catch { /* Native validation message below. */ } return localize('ade.predicate.scalarRequired', "Enter a compatible JSON scalar; numbers must be safe integers."); } });
			if (value === undefined) { return; } node = { id, kind: 'literal', typeId: type.domainType.id, value: JSON.parse(value) as string | number | boolean | null };
		} else if (action.kind === 'arithmetic') {
			const left = await pickNode(); if (!left) { return; } const right = await pickNode(); if (!right) { return; }
			const operator = await quick.pick((['add', 'subtract', 'multiply', 'divide', 'remainder'] as const).map(value => ({ label: value, value })), { title: localize('ade.expression.exact', "Exact Nominal Integer Operation") }); if (!operator) { return; }
			node = { id, kind: 'arithmetic', left, right, operator: operator.value };
		} else if (action.kind === 'collection') {
			const operand = await pickNode(); if (!operand) { return; }
			const operator = await quick.pick((['count', 'any', 'every'] as const).map(value => ({ label: value, value })), { title: localize('ade.expression.collection', "Add Collection Operation") }); if (!operator) { return; }
			if (operator.value === 'count') {
				const type = await quick.pick(model.foundation.types.filter(type => type.primitive === 'integer').map(type => ({ label: type.name, id: type.id })), { title: localize('ade.expression.countType', "Count Domain Type") }); if (!type) { return; } node = { id, kind: 'collection', operand, operator: 'count', typeId: type.id };
			} else {
				const value = await pickNode(); if (!value) { return; } const comparison = await quick.pick((['eq', 'ne', 'lt', 'le', 'gt', 'ge'] as const).map(value => ({ label: value, value })), { title: localize('ade.predicate.operator', "Comparison") }); if (!comparison) { return; } node = { id, kind: 'collection', operand, operator: operator.value, value, comparison: comparison.value };
			}
		} else if (action.kind === 'compare') {
			const left = await pickNode(); if (!left) { return; } const right = await pickNode(); if (!right) { return; }
			const operator = await quick.pick((['eq', 'ne', 'lt', 'le', 'gt', 'ge'] as const).map(value => ({ label: { eq: '=', ne: '≠', lt: '<', le: '≤', gt: '>', ge: '≥' }[value], value })), { title: localize('ade.predicate.operator', "Comparison") }); if (!operator) { return; }
			node = { id, kind: 'compare', operator: operator.value, left, right };
		} else if (action.kind === 'logic') {
			const operator = await quick.pick([{ label: localize('ade.predicate.and', "All True"), value: 'and' as const }, { label: localize('ade.predicate.or', "Any True"), value: 'or' as const }, { label: localize('ade.predicate.not', "Negate"), value: 'not' as const }], { title: localize('ade.predicate.logic', "Add Boolean Logic") }); if (!operator) { return; }
			const first = await pickNode(); if (!first) { return; } const operands = [first]; if (operator.value !== 'not') { const second = await pickNode(); if (!second) { return; } operands.push(second); }
			node = { id, kind: 'logic', operator: operator.value, operands };
		} else {
			const operand = await pickNode(); if (!operand) { return; }
			const operator = await quick.pick([{ label: localize('ade.predicate.present', "Is Present"), value: 'present' as const }, { label: localize('ade.predicate.null', "Is Null"), value: 'isNull' as const }], { title: localize('ade.predicate.check', "Add Presence or Null Check") }); if (!operator) { return; }
			node = { id, kind: 'check', operator: operator.value, operand };
		}
		predicate.nodes.push(node);
	}
	return undefined;
}
