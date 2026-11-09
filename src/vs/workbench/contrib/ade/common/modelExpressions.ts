/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { checkShape, predicateSchema, type ModelDiagnostic, type ModelField, type ModelPredicate, type SemanticModelV4 } from './semanticModel.js';
import { checkModelExpression, evaluateModelExpression, emitModelExpression, fieldValueType, type ExpressionScope } from './modelValues.js';

export const expressionRules = {
	version: 1, maxNodes: 128,
	numeric: 'Nominal integer types; safe integers only. Exact nominal integer arithmetic; overflow, zero division and nonintegral division fail. No decimals, time or implicit conversion.',
	scope: 'Preconditions read inputs only; postconditions read inputs and outputs. Nested paths use stable record field IDs.',
	null: 'Absence and null are distinct. Comparison with absence or ordered comparison with null is indeterminate. Guards never default indeterminate to true or false.',
	purity: 'No calls or effects; operations carry separate declared effects. Free text is descriptive.',
	logic: 'Three-valued short-circuit truth tables: false and unknown=false; true or unknown=true; not unknown=unknown.'
} as const;

type Scalar = string | number | boolean | null;
export type PredicateInput = Scalar | PredicateInput[] | { [fieldId: string]: PredicateInput };

function primitive(model: SemanticModelV4, id: string, seen = new Set<string>()): string {
	if (seen.has(id)) { return ''; } seen.add(id);
	const type = model.foundation.types.find(type => type.id === id);
	return type?.kind === 'reference' ? primitive(model, type.targetTypeId!, seen) : type?.kind === 'primitive' ? type.primitive ?? '' : '';
}

/** Resolve only fields available at this operation/phase; no ambient variables or name lookup. */
function referenceField(model: SemanticModelV4, predicate: ModelPredicate, fieldId: string, path: string[]): ModelField | undefined {
	const operation = model.foundation.blueprint?.operations.find(operation => operation.id === predicate.operationId);
	let field = [...(operation?.inputs ?? []), ...(predicate.phase === 'post' ? operation?.outputs ?? [] : [])].find(field => field.id === fieldId);
	const seen = new Set<string>();
	for (const id of path) {
		let type = model.foundation.types.find(type => type.id === field?.typeId);
		while (type?.kind === 'reference' && !seen.has(type.id)) { seen.add(type.id); type = model.foundation.types.find(entry => entry.id === type!.targetTypeId); }
		field = type?.fields.find(field => field.id === id);
	}
	return field;
}

/** Type checks the bounded, ordered graph; returns stable reasons rather than executing invalid ASTs. */
export function predicateScope(model: SemanticModelV4, predicate: ModelPredicate): ExpressionScope {
	const operation = model.foundation.blueprint?.operations.find(operation => operation.id === predicate.operationId);
	return Object.fromEntries([...(operation?.inputs ?? []), ...(predicate.phase === 'post' ? operation?.outputs ?? [] : [])].map(field => [field.id!, fieldValueType(field)]));
}
export function validateModelPredicate(model: SemanticModelV4, predicate: ModelPredicate): string[] {
	const shape: ModelDiagnostic[] = []; checkShape(predicate, predicateSchema, '', shape); if (shape.length) { return ['predicateShape']; }
	const result = checkModelExpression(model, { version: predicate.version, nodes: predicate.nodes, rootId: predicate.rootId }, predicateScope(model, predicate));
	if (!model.foundation.blueprint?.operations.some(operation => operation.id === predicate.operationId)) { result.errors.push('operationMissing'); }
	if (result.type?.typeId !== '$boolean' && model.foundation.types.find(type => type.id === result.type?.typeId)?.primitive !== 'boolean') { result.errors.push('booleanRoot'); }
	return [...new Set(result.errors.map(error => error === 'expressionShape' ? 'predicateShape' : error))];
}

function assertPredicate(model: SemanticModelV4, predicate: ModelPredicate): void {
	const errors = validateModelPredicate(model, predicate); if (errors.length) { throw new Error(`Invalid predicate: ${errors.join(', ')}`); }
}

/** Pure expressions share presence, nominal types and precision rules with executable frames. */
export function evaluateModelPredicate(model: SemanticModelV4, predicate: ModelPredicate, inputs: Record<string, PredicateInput>): boolean | null {
	assertPredicate(model, predicate);
	const value = evaluateModelExpression(model, { version: predicate.version, nodes: predicate.nodes, rootId: predicate.rootId }, predicateScope(model, predicate), inputs);
	return typeof value === 'boolean' ? value : null;
}

/** Generate an ESM pure function using only fixed operators and JSON-escaped data, never source snippets. */
export function emitModelPredicate(model: SemanticModelV4, predicate: ModelPredicate): string {
	assertPredicate(model, predicate);
	if (predicate.nodes.some(node => ['arithmetic', 'collection'].includes(node.kind) || node.kind === 'reference' && !primitive(model, referenceField(model, predicate, node.fieldId, node.path)?.typeId ?? '') || node.kind === 'literal' && !primitive(model, node.typeId))) { return emitModelExpression(model, { version: 1, nodes: predicate.nodes, rootId: predicate.rootId }, predicateScope(model, predicate), true); }
	const names = new Map(predicate.nodes.map((node, index) => [node.id, `v${index}`]));
	const ref = (id: string) => names.get(id)!;
	const lines = predicate.nodes.map(node => {
		let code: string;
		if (node.kind === 'literal') { code = JSON.stringify(node.value); }
		else if (node.kind === 'reference') { const field = referenceField(model, predicate, node.fieldId, node.path)!; code = `read(input,${JSON.stringify([node.fieldId, ...node.path])},${JSON.stringify(primitive(model, field.typeId!))},${field.nullable?.state === 'known' && field.nullable.value === true})`; }
		else if (node.kind === 'check') { code = node.operator === 'present' ? `${ref(node.operand)}!==undefined` : `${ref(node.operand)}===null`; }
		else if (node.kind === 'logic') { code = `logic(${JSON.stringify(node.operator)},[${node.operands.map(ref).join(',')}])`; }
		else if (node.kind === 'compare') { const operator = { eq: '===', ne: '!==', lt: '<', le: '<=', gt: '>', ge: '>=' }[node.operator]; const a = ref(node.left), b = ref(node.right); code = `${a}===undefined||${b}===undefined${['eq', 'ne'].includes(node.operator) ? '' : `||${a}===null||${b}===null`}?null:(${a}${operator}${b})`; }
		else { throw new Error('Unsupported legacy emitter node'); }
		return `const ${ref(node.id)}=${code};`;
	});
	return `// Generated pure predicate v1. No ambient reads or effects.\nfunction read(input,path,type,nullable){let value=input;for(const key of path){value=value&&typeof value==='object'&&!Array.isArray(value)&&Object.hasOwn(value,key)?value[key]:undefined;}if(value!==undefined&&(value===null?!nullable:typeof value!==(type==='integer'?'number':type)||typeof value==='number'&&!Number.isSafeInteger(value))){throw new Error('Predicate input type mismatch');}return value;}\nfunction logic(op,values){if(op==='not'){return typeof values[0]==='boolean'?!values[0]:null;}return op==='and'?(values.includes(false)?false:values.every(v=>v===true)?true:null):(values.includes(true)?true:values.every(v=>v===false)?false:null);}\nexport default function(input){${lines.join('')}return typeof ${ref(predicate.rootId)}==='boolean'?${ref(predicate.rootId)}:null;}\n`;
}

/** Readable rendering derives solely from the AST and stable field definitions. */
export function describeModelPredicate(model: SemanticModelV4, predicate: ModelPredicate): string {
	assertPredicate(model, predicate); const descriptions = new Map<string, string>();
	for (const node of predicate.nodes) {
		const text = node.kind === 'arithmetic' ? `(${descriptions.get(node.left)} ${node.operator} ${descriptions.get(node.right)})` : node.kind === 'collection' ? `${node.operator}(${descriptions.get(node.operand)}${node.operator === 'count' ? '' : ', ' + descriptions.get(node.value)})` : node.kind === 'literal' ? JSON.stringify(node.value) : node.kind === 'reference' ? referenceField(model, predicate, node.fieldId, node.path)!.name : node.kind === 'compare' ? `(${descriptions.get(node.left)} ${{ eq: '=', ne: '≠', lt: '<', le: '≤', gt: '>', ge: '≥' }[node.operator]} ${descriptions.get(node.right)})` : node.kind === 'check' ? `${node.operator}(${descriptions.get(node.operand)})` : `${node.operator}(${node.operands.map(id => descriptions.get(id)).join(', ')})`;
		descriptions.set(node.id, text);
	}
	return descriptions.get(predicate.rootId)!;
}
