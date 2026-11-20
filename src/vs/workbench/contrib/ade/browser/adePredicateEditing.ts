import { localize } from '../../../../nls.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { type IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { type ModelExpression, type ModelField, type ModelPredicate, type PredicateNode, type SemanticModelV4 } from '../common/modelTypes.js';
import { checkModelExpression, describeModelExpression, fieldValueType, resolveValueType } from '../common/modelValues.js';
import { pickAdeFormAction } from './adeFormActions.js';
import { adeTypedValues } from './adeTypedValues.js';
import { type VisualEdit } from '../common/visualEditing.js';

/** Native, bounded AST builder. A canceled dialog never publishes the detached graph. */
export async function editAdePredicate(quick: Pick<IQuickInputService, 'pick' | 'input'>, model: SemanticModelV4, elementId?: string): Promise<VisualEdit[] | undefined> {
	const operations = model.foundation.blueprint?.operations ?? [];
	const operation = await quick.pick(operations.map(operation => ({ label: operation.name, description: model.semantics.elements.find(element => element.id === operation.ownerId)?.name, picked: operation.ownerId === elementId, operation })), { title: localize('ade.predicate.operation', "Predicate Operation") });
	if (!operation) { return; }
	const existing = await quick.pick([{ label: localize('ade.predicate.create', "Create New Predicate"), predicate: undefined as ModelPredicate | undefined }, ...model.foundation.predicates?.filter(predicate => predicate.operationId === operation.operation.id).map(predicate => ({ label: predicate.phase === 'pre' ? localize('ade.predicate.preSummary', "Precondition: {0}", describeModelExpression(model, predicate)) : localize('ade.predicate.postSummary', "Postcondition: {0}", describeModelExpression(model, predicate)), detail: predicate.id, predicate })) ?? []], { title: localize('ade.predicate.select', "Pure Predicate") });
	if (!existing) { return; }
	const phases = [{ label: localize('ade.predicate.pre', "Precondition · Inputs Only"), value: 'pre' as const }, { label: localize('ade.predicate.post', "Postcondition · Inputs and Outputs"), value: 'post' as const }];
	const phase = await quick.pick(phases, { title: localize('ade.predicate.phase', "Variable Scope"), activeItem: phases.find(phase => phase.value === existing.predicate?.phase) });
	if (!phase) { return; }
	const predicate: ModelPredicate = existing.predicate ? structuredClone(existing.predicate) : { id: generateUuid(), version: 1, operationId: operation.operation.id, phase: phase.value, rootId: '', nodes: [] };
	predicate.phase = phase.value;
	const expression = await buildAdeExpression(quick, model, [...operation.operation.inputs, ...(phase.value === 'post' ? operation.operation.outputs : [])], predicate, true);
	return expression ? [{ kind: 'predicate', entry: { ...predicate, ...expression } }] : undefined;
}

/** Shared native graph builder for predicates, arguments, outputs, correlation and guards. */
export async function buildAdeExpression(quick: Pick<IQuickInputService, 'pick' | 'input'>, model: SemanticModelV4, fields: ModelField[], initial?: ModelExpression, booleanRoot = false): Promise<ModelExpression | undefined> {
	const predicate: ModelExpression = initial ? { version: 1, nodes: structuredClone(initial.nodes), rootId: initial.rootId } : { version: 1, nodes: [], rootId: '' };
	const scope = Object.fromEntries(fields.map(field => [field.id!, fieldValueType(field)]));
	const nodeType = (node: PredicateNode) => checkModelExpression(model, { ...predicate, rootId: node.id }, scope).type;
	const isBoolean = (node: PredicateNode) => { const type = nodeType(node); return type?.typeId === '$boolean' || !!type && resolveValueType(model, type.typeId)?.primitive === 'boolean'; };
	const isInteger = (node: PredicateNode) => { const type = nodeType(node); return !!type && resolveValueType(model, type.typeId)?.primitive === 'integer'; };
	const isCollection = (node: PredicateNode) => { const type = nodeType(node); return !!type && resolveValueType(model, type.typeId)?.kind === 'collection'; };
	const pickNode = async (filter: (node: PredicateNode) => boolean = () => true) => (await quick.pick(predicate.nodes.filter(filter).map(node => ({ label: describeModelExpression(model, { ...predicate, rootId: node.id }), detail: node.id, description: { literal: localize('ade.predicate.literalNode', "Literal"), reference: localize('ade.predicate.referenceNode', "Field Reference"), compare: localize('ade.predicate.comparisonNode', "Comparison"), logic: localize('ade.predicate.logicNode', "Boolean Logic"), check: localize('ade.predicate.checkNode', "Presence or Null Check"), arithmetic: localize('ade.predicate.arithmeticNode', "Exact Integer Arithmetic"), collection: localize('ade.predicate.collectionNode', "Collection Predicate") }[node.kind], node })), { title: localize('ade.predicate.operand', "Previously Defined Operand") }))?.node.id;
	while (predicate.nodes.length <= 128) {
		const actions = [
			{ label: localize('ade.predicate.reference', "Add Field Reference"), kind: 'reference' as const },
			{ label: localize('ade.predicate.literal', "Add Typed Literal"), kind: 'literal' as const },
			...(predicate.nodes.length ? [
				{ label: localize('ade.predicate.compare', "Add Comparison"), kind: 'compare' as const },
				{ label: localize('ade.predicate.logic', "Add Boolean Logic"), kind: 'logic' as const },
				{ label: localize('ade.predicate.check', "Add Presence or Null Check"), kind: 'check' as const },
				{ label: localize('ade.expression.arithmetic', "Add Exact Integer Arithmetic"), kind: 'arithmetic' as const },
				{ label: localize('ade.expression.collection', "Add Collection Operation"), kind: 'collection' as const },
				{ label: localize('ade.predicate.reset', "Clear Detached Expression"), kind: 'reset' as const },
				...(!booleanRoot || predicate.nodes.some(isBoolean) ? [{ label: localize('ade.predicate.finish', "Choose Result and Save"), kind: 'finish' as const }] : [])
			] : [])
		];
		const title = predicate.nodes.length === 1 ? localize('ade.predicate.oneNode', "Pure Predicate · 1 Node") : localize('ade.predicate.builder', "Pure Predicate · {0} Nodes", predicate.nodes.length);
		const selected = predicate.nodes.length ? await pickAdeFormAction(quick, title, [
			{ label: localize('ade.expression.values', "Add Value"), actions: actions.filter(action => ['reference', 'literal'].includes(action.kind)).map(action => ({ label: action.label, value: action.kind })) },
			{ label: localize('ade.expression.combine', "Combine Values"), actions: actions.filter(action => ['compare', 'logic', 'check', 'arithmetic', 'collection'].includes(action.kind) && (action.kind !== 'logic' || predicate.nodes.some(isBoolean)) && (action.kind !== 'arithmetic' || predicate.nodes.some(isInteger)) && (action.kind !== 'collection' || predicate.nodes.some(isCollection))).map(action => ({ label: action.label, value: action.kind })) }
		], actions.filter(action => ['finish', 'reset'].includes(action.kind)).map(action => ({ label: action.label, value: action.kind }))) : (await quick.pick(actions, { title }))?.kind;
		const action = actions.find(action => action.kind === selected);
		if (!action) { return; }
		if (action.kind === 'reset') { predicate.nodes = []; continue; }
		if (action.kind === 'finish') {
			const rootId = await pickNode(booleanRoot ? isBoolean : undefined); if (!rootId) { return; } predicate.rootId = rootId;
			const checked = checkModelExpression(model, predicate, Object.fromEntries(fields.map(field => [field.id!, fieldValueType(field)])));
			if (checked.errors.length || booleanRoot && checked.type?.typeId !== '$boolean' && model.foundation.types.find(type => type.id === checked.type?.typeId)?.primitive !== 'boolean') {
				const choice = await quick.pick([{ label: localize('ade.predicate.continueEditing', "Continue Editing"), keep: true }, { label: localize('ade.predicate.discardDetached', "Discard Detached Changes"), keep: false }], { title: localize('ade.predicate.correction', "Expression Needs Correction"), placeHolder: checked.errors.length ? localize('ade.predicate.invalidTypes', "Use compatible types and variables in the selected scope.") : localize('ade.predicate.booleanResult', "Choose a comparison, presence check or boolean condition as the true/false result.") });
				if (!choice?.keep) { return; }
				continue;
			}
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
			const choices = model.foundation.types.filter(type => type.kind === 'enum' || type.kind === 'primitive' && ['string', 'integer', 'boolean'].includes(type.primitive ?? '')).map(type => ({ label: type.name, description: type.kind, detail: model.foundation.types.filter(other => other.name === type.name).length > 1 ? type.id : undefined, domainType: type }));
			const choice = await quick.pick([...choices, { label: localize('ade.literal.null', "Null Value"), domainType: undefined }], { title: localize('ade.predicate.literalType', "Literal Domain Type") }); if (!choice) { return; }
			const type = choice.domainType ?? (await quick.pick(choices, { title: localize('ade.literal.nullType', "Domain Type of Null Value") }))?.domainType; if (!type) { return; }
			const value = choice.domainType ? await adeTypedValues(quick, model).scalar(type.id, type.name) : null;
			if (value === undefined) { return; }
			node = { id, kind: 'literal', typeId: type.id, value: value as string | number | boolean | null };
		} else if (action.kind === 'arithmetic') {
			const left = await pickNode(isInteger); if (!left) { return; } const right = await pickNode(isInteger); if (!right) { return; }
			const operator = await quick.pick((['add', 'subtract', 'multiply', 'divide', 'remainder'] as const).map(value => ({ label: value, value })), { title: localize('ade.expression.exact', "Exact Nominal Integer Operation") }); if (!operator) { return; }
			node = { id, kind: 'arithmetic', left, right, operator: operator.value };
		} else if (action.kind === 'collection') {
			const operand = await pickNode(isCollection); if (!operand) { return; }
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
			const first = await pickNode(isBoolean); if (!first) { return; } const operands = [first]; if (operator.value !== 'not') { const second = await pickNode(isBoolean); if (!second) { return; } operands.push(second); }
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
