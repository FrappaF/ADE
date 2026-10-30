/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const text = { type: 'string', minLength: 1 };
export const identifier = { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9_.:-]*$' };
export const digest = { type: 'string', pattern: '^[a-f0-9]{64}$' };

/** Small schema constructors shared by persisted state and external-index validation. */
export function array(items: object): object { return { type: 'array', items }; }
export function object(properties: Record<string, object>, optional: string[] = []): object {
	return { type: 'object', properties, required: Object.keys(properties).filter(key => !optional.includes(key)), additionalProperties: false };
}

export const evidence = object({ file: text, revision: digest, start: { type: 'integer', minimum: 0 }, end: { type: 'integer', minimum: 0 }, line: { type: 'integer', minimum: 1 }, endLine: { type: 'integer', minimum: 1 } });
const provider = { type: 'integer', minimum: 0 };
export const semanticGraphSchema = object({
	version: { const: 1 }, sourceRevision: digest,
	providers: array(object({ name: text, version: { type: 'string' }, digest })),
	indexedFiles: array(text),
	bindings: array(object({ symbol: text, elementId: identifier, provider, evidence })),
	dependencies: array(object({ id: identifier, from: identifier, to: identifier, references: array(object({ symbol: text, roles: { type: 'integer', minimum: 0 }, provider, source: evidence, target: evidence })) })),
	diagnostics: array(object({ code: { enum: ['outsideScope', 'missingDocument', 'missingDefinition', 'unboundDefinition', 'unboundReference', 'ambiguousSymbol', 'unresolvedRelationship'] }, file: text, symbol: { type: 'string' }, provider, evidence }, ['evidence']))
});
