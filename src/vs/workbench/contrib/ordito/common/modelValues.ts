import { expressionSchema, checkShape } from './modelSchema.js';
import { type ModelDiagnostic, type ModelExpression, type ModelField, type ModelType, type SemanticModelV4 } from './modelTypes.js';

export type ModelValue = string | number | boolean | null | ModelValue[] | { [id: string]: ModelValue };
export interface ExpressionValueType { typeId: string; nullable: boolean; optional: boolean }
export interface ExpressionScope { [id: string]: ExpressionValueType }
const booleanType: ExpressionValueType = { typeId: '$boolean', nullable: false, optional: false };

/** References preserve nominal identity even when the storage primitive is shared. */
export function resolveValueType(model: SemanticModelV4, id: string): ModelType | undefined {
	const visited = new Set<string>(); let type = model.foundation.types.find(type => type.id === id);
	while (type?.kind === 'reference') { if (visited.has(type.id)) { return; } visited.add(type.id); type = model.foundation.types.find(entry => entry.id === type!.targetTypeId); }
	return type;
}
export function fieldValueType(field: ModelField): ExpressionValueType { return { typeId: field.nullable?.state === 'known' && typeof field.nullable.value === 'boolean' ? field.typeId ?? '' : '', nullable: field.nullable?.state === 'known' && field.nullable.value === true, optional: !field.required }; }
function pathType(model: SemanticModelV4, scope: ExpressionScope, id: string, path: string[]): ExpressionValueType | undefined {
	let value = Object.hasOwn(scope, id) ? scope[id] : undefined;
	for (const key of path) {
		const field = resolveValueType(model, value?.typeId ?? '')?.fields.find(field => field.id === key);
		if (!field) { return; } const next = fieldValueType(field); value = { ...next, optional: !!value?.optional || !!value?.nullable || next.optional };
	}
	return value;
}
function primitive(model: SemanticModelV4, value?: ExpressionValueType): string { return value?.typeId === '$boolean' ? 'boolean' : resolveValueType(model, value?.typeId ?? '')?.primitive ?? ''; }
function comparable(model: SemanticModelV4, a: ExpressionValueType, b: ExpressionValueType, operator: string): boolean {
	return a.typeId === b.typeId && (['eq', 'ne'].includes(operator) ? ['integer', 'boolean', 'string'].includes(primitive(model, a)) || resolveValueType(model, a.typeId)?.kind === 'enum' : primitive(model, a) === 'integer');
}

/** Bounded expression checker shared by predicates, message arguments and frame guards. */
export function checkModelExpression(model: SemanticModelV4, expression: ModelExpression, scope: ExpressionScope): { errors: string[]; type?: ExpressionValueType } {
	const shape: ModelDiagnostic[] = []; checkShape(expression, expressionSchema, '', shape);
	if (shape.length) { return { errors: ['expressionShape'] }; }
	const errors: string[] = [], types = new Map<string, ExpressionValueType>();
	if (!expression.nodes.length || expression.nodes.length > 128) { errors.push('nodeBudget'); }
	for (const node of expression.nodes) {
		if (types.has(node.id)) { errors.push('duplicateNode'); }
		let value: ExpressionValueType = { ...booleanType };
		const get = (id: string) => { const entry = types.get(id); if (!entry) { errors.push('definitionBeforeUse'); } return entry; };
		if (node.kind === 'literal') {
			const type = resolveValueType(model, node.typeId);
			if (!type || !['primitive', 'enum'].includes(type.kind ?? '') || node.value !== null && !isModelValue(model, node.typeId, node.value, false)) { errors.push('literalType'); }
			value = { typeId: node.typeId, nullable: node.value === null, optional: false };
		} else if (node.kind === 'reference') {
			const entry = pathType(model, scope, node.fieldId, node.path);
			if (!entry || !resolveValueType(model, entry.typeId) || node.path.length > 16) { errors.push('referenceScopeOrType'); }
			value = entry ?? { typeId: '', nullable: false, optional: true };
		} else if (node.kind === 'compare' || node.kind === 'arithmetic') {
			const a = get(node.left), b = get(node.right);
			if (a && b) {
				if (node.kind === 'compare' ? !comparable(model, a, b, node.operator) : a.typeId !== b.typeId || primitive(model, a) !== 'integer') { errors.push(node.kind === 'compare' ? 'comparisonType' : 'arithmeticType'); }
				if (node.kind === 'compare') { value = { ...booleanType, nullable: a.optional || b.optional || !['eq', 'ne'].includes(node.operator) && (a.nullable || b.nullable) }; }
				if (node.kind === 'arithmetic') { value = { ...a, nullable: a.nullable || b.nullable, optional: a.optional || b.optional }; }
			}
		} else if (node.kind === 'logic') {
			if (node.operator === 'not' ? node.operands.length !== 1 : node.operands.length < 2) { errors.push('logicArity'); }
			for (const id of node.operands) { const operand = get(id); if (primitive(model, operand) !== 'boolean') { errors.push('booleanOperand'); } if (operand?.nullable || operand?.optional) { value.nullable = true; } }
		} else if (node.kind === 'collection') {
			const source = get(node.operand), type = resolveValueType(model, source?.typeId ?? '');
			if (type?.kind !== 'collection') { errors.push('collectionType'); }
			if (node.operator === 'count') {
				value = { typeId: node.typeId, nullable: !!source?.nullable || !!source?.optional, optional: false };
				if (primitive(model, value) !== 'integer') { errors.push('countType'); }
			} else {
				const target = get(node.value); value.nullable = !!source?.nullable || !!source?.optional || !!target?.optional || !!target?.nullable;
				if (target && !comparable(model, { typeId: type?.itemTypeId ?? '', nullable: false, optional: false }, target, node.comparison)) { errors.push('collectionComparisonType'); }
			}
		} else { get(node.operand); }
		types.set(node.id, value);
	}
	if (!types.has(expression.rootId)) { errors.push('rootMissing'); }
	return { errors: [...new Set(errors)], type: types.get(expression.rootId) };
}

/** Strict JSON domain values. Optionality is handled by the caller, independently of null. */
export function isModelValue(model: SemanticModelV4, id: string, value: ModelValue, nullable: boolean, depth = 0): boolean {
	if (depth > 32) { return false; } if (value === null) { return nullable; }
	const type = resolveValueType(model, id); if (!type) { return false; }
	if (type.kind === 'primitive') { return typeof value === (type.primitive === 'integer' ? 'number' : type.primitive) && (typeof value !== 'number' || Number.isSafeInteger(value)); }
	if (type.kind === 'enum') { return typeof value === 'string' && !!type.values?.includes(value); }
	if (type.kind === 'collection') { return Array.isArray(value) && value.length <= 10000 && value.every(item => isModelValue(model, type.itemTypeId!, item, false, depth + 1)); }
	return type.kind === 'record' && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => type.fields.some(field => field.id === key)) && type.fields.every(field => Object.hasOwn(value, field.id!) ? isModelValue(model, field.typeId!, value[field.id!], field.nullable?.state === 'known' && field.nullable.value === true, depth + 1) : !field.required);
}
function compare(operator: string, a: ModelValue | undefined, b: ModelValue | undefined): boolean | null {
	if (a === undefined || b === undefined || (a === null || b === null) && !['eq', 'ne'].includes(operator)) { return null; }
	return operator === 'eq' ? a === b : operator === 'ne' ? a !== b : operator === 'lt' ? a! < b! : operator === 'le' ? a! <= b! : operator === 'gt' ? a! > b! : a! >= b!;
}

/** Deterministic interpreter; no eval, callbacks, ambient variables or implicit conversion. */
export function evaluateModelExpression(model: SemanticModelV4, expression: ModelExpression, scope: ExpressionScope, input: Record<string, ModelValue>): ModelValue | undefined {
	const checked = checkModelExpression(model, expression, scope); if (checked.errors.length) { throw new Error('Invalid expression: ' + checked.errors.join(', ')); }
	const values = new Map<string, ModelValue | undefined>();
	for (const node of expression.nodes) {
		let value: ModelValue | undefined;
		if (node.kind === 'literal') { value = node.value; }
		else if (node.kind === 'reference') {
			value = input;
			for (const key of [node.fieldId, ...node.path]) { value = value && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(value, key) ? value[key] : undefined; }
			const type = pathType(model, scope, node.fieldId, node.path)!;
			if (value !== undefined && !isModelValue(model, type.typeId, value, type.nullable)) { throw new Error('Predicate input type mismatch'); }
		} else if (node.kind === 'check') { value = node.operator === 'present' ? values.get(node.operand) !== undefined : values.get(node.operand) === null; }
		else if (node.kind === 'compare') { value = compare(node.operator, values.get(node.left), values.get(node.right)); }
		else if (node.kind === 'logic') {
			const operands = node.operands.map(id => values.get(id));
			value = node.operator === 'not' ? typeof operands[0] === 'boolean' ? !operands[0] : null : node.operator === 'and' ? operands.includes(false) ? false : operands.every(value => value === true) ? true : null : operands.includes(true) ? true : operands.every(value => value === false) ? false : null;
		} else if (node.kind === 'arithmetic') {
			const a = values.get(node.left), b = values.get(node.right);
			if (a === undefined || b === undefined) { value = undefined; } else if (a === null || b === null) { value = null; }
			else {
				const left = a as number, right = b as number;
				if (['divide', 'remainder'].includes(node.operator) && right === 0) { throw new Error('arithmeticZero'); }
				value = node.operator === 'add' ? left + right : node.operator === 'subtract' ? left - right : node.operator === 'multiply' ? left * right : node.operator === 'divide' ? left / right : left % right;
				if (!Number.isSafeInteger(value)) { throw new Error('arithmeticPrecision'); }
			}
		} else {
			const items = values.get(node.operand);
			if (items === undefined || items === null) { value = null; }
			else if (node.operator === 'count') { value = (items as ModelValue[]).length; }
			else {
				const results = (items as ModelValue[]).map(item => compare(node.comparison, item, values.get(node.value)));
				value = node.operator === 'any' ? results.includes(true) ? true : results.every(value => value === false) ? false : null : results.includes(false) ? false : results.every(value => value === true) ? true : null;
			}
		}
		values.set(node.id, value);
	}
	return values.get(expression.rootId);
}

/** Fixed JavaScript support, independent of TS transpilation/bundling and function.toString(). */
export const valueRuntime = String.raw`
function valueType(id){const seen=new Set();let t=types.find(t=>t.id===id);while(t?.kind==='reference'){if(seen.has(t.id))return;seen.add(t.id);t=types.find(v=>v.id===t.targetTypeId);}return t;}
function valid(id,v,n,d=0){if(d>32)return false;if(v===null)return n;const t=valueType(id);if(!t)return false;if(t.kind==='primitive')return typeof v===(t.primitive==='integer'?'number':t.primitive)&&(typeof v!=='number'||Number.isSafeInteger(v));if(t.kind==='enum')return typeof v==='string'&&t.values.includes(v);if(t.kind==='collection')return Array.isArray(v)&&v.length<=10000&&v.every(x=>valid(t.itemTypeId,x,false,d+1));return t.kind==='record'&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>t.fields.some(f=>f.id===k))&&t.fields.every(f=>Object.hasOwn(v,f.id)?valid(f.typeId,v[f.id],f.nullable?.state==='known'&&f.nullable.value===true,d+1):!f.required);}
function cmp(op,a,b){if(a===undefined||b===undefined||(a===null||b===null)&&!['eq','ne'].includes(op))return null;return op==='eq'?a===b:op==='ne'?a!==b:op==='lt'?a<b:op==='le'?a<=b:op==='gt'?a>b:a>=b;}
function expr(g,input,scope){const v=new Map();for(const n of g.nodes){let x;if(n.kind==='literal')x=n.value;else if(n.kind==='reference'){let t=scope[n.fieldId];x=input;for(const k of [n.fieldId,...n.path])x=x&&typeof x==='object'&&!Array.isArray(x)&&Object.hasOwn(x,k)?x[k]:undefined;for(const k of n.path){const f=valueType(t.typeId).fields.find(f=>f.id===k);t={typeId:f.typeId,nullable:f.nullable?.state==='known'&&f.nullable.value===true};}if(x!==undefined&&!valid(t.typeId,x,t.nullable))throw Error('Predicate input type mismatch');}else if(n.kind==='check')x=n.operator==='present'?v.get(n.operand)!==undefined:v.get(n.operand)===null;else if(n.kind==='compare')x=cmp(n.operator,v.get(n.left),v.get(n.right));else if(n.kind==='logic'){const a=n.operands.map(id=>v.get(id));x=n.operator==='not'?(typeof a[0]==='boolean'?!a[0]:null):n.operator==='and'?(a.includes(false)?false:a.every(x=>x===true)?true:null):(a.includes(true)?true:a.every(x=>x===false)?false:null);}else if(n.kind==='arithmetic'){const a=v.get(n.left),b=v.get(n.right);if(a===undefined||b===undefined)x=undefined;else if(a===null||b===null)x=null;else{if(['divide','remainder'].includes(n.operator)&&b===0)throw Error('arithmeticZero');x=n.operator==='add'?a+b:n.operator==='subtract'?a-b:n.operator==='multiply'?a*b:n.operator==='divide'?a/b:a%b;if(!Number.isSafeInteger(x))throw Error('arithmeticPrecision');}}else{const a=v.get(n.operand);if(a===undefined||a===null)x=null;else if(n.operator==='count')x=a.length;else{const r=a.map(x=>cmp(n.comparison,x,v.get(n.value)));x=n.operator==='any'?(r.includes(true)?true:r.every(x=>x===false)?false:null):(r.includes(false)?false:r.every(x=>x===true)?true:null);}}v.set(n.id,x);}return v.get(g.rootId);}
`;

export function emitModelExpression(model: SemanticModelV4, expression: ModelExpression, scope: ExpressionScope, booleanResult = false): string {
	const result = checkModelExpression(model, expression, scope); if (result.errors.length) { throw new Error('Invalid expression: ' + result.errors.join(', ')); }
	return `const types=${JSON.stringify(model.foundation.types)};\n${valueRuntime}\nexport default input=>{const result=expr(${JSON.stringify(expression)},input,${JSON.stringify(scope)});return ${booleanResult ? "typeof result==='boolean'?result:null" : 'result'};};\n`;
}

/** Result aliases use operation names and occurrence numbers; stable IDs remain in the semantic model. */
export function describeModelVariable(model: SemanticModelV4, id: string): string {
	const call = model.foundation.occurrences.find(call => call.execution?.resultId === id);
	if (call) { const operation = model.foundation.blueprint?.operations.find(operation => operation.id === call.operationId); return `${operation?.name ?? call.operationId}() #${model.foundation.occurrences.filter(entry => entry.operationId === call.operationId).indexOf(call) + 1}`; }
	const loops = model.foundation.frames.filter(frame => frame.kind === 'loop');
	const loopIndex = loops.findIndex(frame => frame.kind === 'loop' && frame.iterationId === id);
	if (loopIndex >= 0) { return `Loop ${loopIndex + 1} Counter`; }
	return [...model.foundation.types.flatMap(type => type.fields), ...model.foundation.blueprint?.operations.flatMap(operation => [...operation.inputs, ...operation.outputs]) ?? []].find(field => field.id === id)?.name ?? id;
}

/** Presentation is derived from the AST; labels never become code or hidden predicates. */
export function describeModelExpression(model: SemanticModelV4, expression: ModelExpression): string {
	const operators = { eq: '=', ne: '≠', lt: '<', le: '≤', gt: '>', ge: '≥', add: '+', subtract: '−', multiply: '×', divide: '÷', remainder: '%' };
	const values = new Map<string, string>();
	for (const node of expression.nodes) {
		const operand = (id: string) => values.get(id) ?? id;
		const text = node.kind === 'literal' ? JSON.stringify(node.value) : node.kind === 'reference' ? [node.fieldId, ...node.path].map(id => describeModelVariable(model, id)).join('.') : node.kind === 'compare' || node.kind === 'arithmetic' ? `(${operand(node.left)} ${operators[node.operator]} ${operand(node.right)})` : node.kind === 'logic' ? `${node.operator}(${node.operands.map(operand).join(', ')})` : node.kind === 'collection' && node.operator !== 'count' ? `${node.operator}(${operand(node.operand)} ${operators[node.comparison]} ${operand(node.value)})` : `${node.operator}(${operand(node.operand)})`;
		values.set(node.id, text);
	}
	return values.get(expression.rootId) ?? expression.rootId;
}
