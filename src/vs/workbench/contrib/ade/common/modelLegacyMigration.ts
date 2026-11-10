/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { array, checkShape, identifier, nonempty, object, text } from './modelSchema.js';
import { type ModelDiagnostic, type SemanticModel } from './modelTypes.js';
import { InvalidSemanticModelError, readSemanticModel, validateSemanticModel } from './modelValidation.js';

interface LegacyModel {
	version: 1;
	name: string;
	nodes: { id: string; kind: 'actor' | 'component' | 'class' | 'state' | 'action'; label: string }[];
	edges: { from: string; to: string; label: string }[];
}

const legacySchema = object({
	version: { type: 'integer', const: 1 }, name: nonempty,
	nodes: array(object({ id: identifier, kind: { type: 'string', enum: ['actor', 'component', 'class', 'state', 'action'] }, label: nonempty })),
	edges: array(object({ from: identifier, to: identifier, label: text }))
});

/** Pure, explicit migration. Never writes files or infers behavior from labels. */
export function migrateSemanticModel(value: unknown, modelId = 'legacy-model'): { model: SemanticModel; diagnostics: ModelDiagnostic[] } {
	if (typeof value === 'object' && value !== null && Object.hasOwn(value, 'version') && [2, 3, 4, 5].includes((value as { version: number }).version)) {
		const model = readSemanticModel(value);
		return { model, diagnostics: validateSemanticModel(model) };
	}
	const diagnostics: ModelDiagnostic[] = [];
	checkShape(value, legacySchema, '', diagnostics);
	if (diagnostics.length) {
		throw new InvalidSemanticModelError(diagnostics);
	}
	const legacy = value as LegacyModel;
	const model = readSemanticModel({
		version: 2, id: modelId, name: legacy.name,
		semantics: {
			elements: legacy.nodes.map(node => ({
				id: node.id, kind: node.kind === 'class' ? 'resource' : node.kind, name: node.label,
				...(node.kind === 'class' ? { legacyKind: 'class' } : {})
			})),
			relations: legacy.edges.map((edge, index) => ({
				id: `legacy-relation-${index + 1}`, kind: 'dependency', from: edge.from, to: edge.to,
				name: edge.label, classification: 'legacy-unclassified'
			}))
		},
		views: [{
			id: 'structure', name: legacy.name, kind: 'structure',
			nodes: legacy.nodes.map((node, index) => ({ elementId: node.id, x: 35 + (index % 3) * 295, y: 40 + Math.floor(index / 3) * 180 })),
			relationIds: legacy.edges.map((_, index) => `legacy-relation-${index + 1}`)
		}],
		codeMappings: [], verifications: []
	});
	return { model, diagnostics: validateSemanticModel(model) };
}
