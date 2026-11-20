import { array, object, text, identifier, digest } from '../runtime/schemas.ts';

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
