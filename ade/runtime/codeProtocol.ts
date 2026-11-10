/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Ajv2020 } from 'ajv/dist/2020.js';
import { adeCodeProtocolVersion, type CodeBridgeProtocol, type CodeRequest } from '../../src/vs/workbench/contrib/ade/common/codeBridge.ts';

const nonempty = { type: 'string', minLength: 1 };

const requestSchemas = [
	{ type: 'object', additionalProperties: false, required: ['operation', 'snapshot', 'request'], properties: { operation: { const: 'exploration' }, snapshot: nonempty, request: nonempty } },
	{ type: 'object', additionalProperties: false, required: ['operation', 'root'], properties: { operation: { const: 'import' }, root: nonempty, scope: { type: 'object' }, syntaxOnly: { type: 'boolean' }, bundles: { type: 'array', items: nonempty, maxItems: 20 } } },
	{ type: 'object', additionalProperties: false, required: ['operation', 'snapshot'], properties: { operation: { enum: ['inspect', 'preview', 'history'] }, snapshot: nonempty, scope: { type: 'object' }, renames: { type: 'array' }, resolutions: { type: 'array', maxItems: 1000, items: { type: 'object', additionalProperties: false, required: ['path', 'choice'], properties: { path: nonempty, choice: { enum: ['model', 'code'] } } } }, bundles: { type: 'array', items: nonempty, maxItems: 20 } } },
	{ type: 'object', additionalProperties: false, required: ['operation', 'snapshot', 'id'], properties: { operation: { enum: ['undoSync', 'recoverSync'] }, snapshot: nonempty, id: nonempty } },
	{ type: 'object', additionalProperties: false, required: ['operation', 'token'], properties: { operation: { const: 'apply' }, token: nonempty } },
	{ type: 'object', additionalProperties: false, required: ['operation', 'token', 'config', 'sourceFiles'], properties: { operation: { const: 'reconciliationPrepare' }, token: nonempty, config: nonempty, clarification: { type: 'string', maxLength: 8000 }, sourceFiles: { type: 'array', uniqueItems: true, items: nonempty }, resolutions: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['path', 'choice'], properties: { path: nonempty, choice: { enum: ['model', 'code'] } } } } } },
	{ type: 'object', additionalProperties: false, required: ['operation', 'token', 'reviewId'], properties: { operation: { const: 'reconciliationPropose' }, token: nonempty, reviewId: nonempty } },
	{ type: 'object', additionalProperties: false, required: ['operation', 'snapshot', 'config'], properties: { operation: { const: 'diagramPrepare' }, snapshot: nonempty, config: nonempty, resume: nonempty, clarification: { type: 'string', maxLength: 8000 } } },
	{ type: 'object', additionalProperties: false, required: ['operation', 'snapshot', 'id', 'reviewId'], properties: { operation: { enum: ['diagramStep', 'diagramApprovePlan'] }, snapshot: nonempty, id: nonempty, reviewId: nonempty } },
	{ type: 'object', additionalProperties: false, required: ['operation', 'snapshot', 'target'], properties: { operation: { const: 'restore' }, snapshot: nonempty, target: nonempty } },
	{ type: 'object', additionalProperties: false, required: ['operation', 'snapshot', 'file', 'revision', 'start', 'end'], properties: { operation: { const: 'source' }, snapshot: nonempty, file: nonempty, revision: nonempty, start: { type: 'integer', minimum: 0 }, end: { type: 'integer', minimum: 0 } } }
];

const ajv = new Ajv2020();

const valid = ajv.compile<Exclude<CodeRequest, { operation: 'collaboration' }>>({ oneOf: requestSchemas });

const requestValidators = requestSchemas.map(schema => ({ operations: schema.properties.operation.enum ?? [schema.properties.operation.const!], validate: ajv.compile(schema) }));

export const codeBridgeProtocol: CodeBridgeProtocol = { version: adeCodeProtocolVersion, operations: ['collaboration', ...requestValidators.flatMap(item => item.operations)] };

function invalidRequest(request: unknown): Error {
	const operation = request && typeof request === 'object' && 'operation' in request ? request.operation : undefined;
	const validator = requestValidators.find(item => item.operations.includes(operation as string));
	if (!validator) { return new Error('Invalid code bridge request: missing or unsupported operation. Rebuild ADE and restart the application if it was updated.'); }
	validator.validate(request);
	// Schema diagnostics contain field names and constraints, never source/configuration values.
	return new Error(`Invalid code bridge request (${operation}): ${ajv.errorsText(validator.validate.errors, { dataVar: 'request' }).slice(0, 500)}`);
}

/** Validate untrusted transport data before dispatching a typed engine request. */
export function validateCodeRequest(value: unknown): asserts value is Exclude<CodeRequest, { operation: 'collaboration' }> {
	if (!valid(value)) { throw invalidRequest(value); }
}
