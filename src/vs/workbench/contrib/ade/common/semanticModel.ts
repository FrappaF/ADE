/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** The domain has no workbench, filesystem, Node or Electron dependencies. */
export const elementKinds = ['feature', 'actor', 'component', 'resource', 'view', 'controller', 'contract', 'action', 'state'] as const;
export type ElementKind = typeof elementKinds[number];
export const relationKinds = ['invocation', 'dependency', 'read', 'write', 'transition', 'realization'] as const;
export type RelationKind = typeof relationKinds[number];

export interface ModelField {
	name: string;
	type: string;
	required: boolean;
}

export interface ModelBehavior {
	inputs: ModelField[];
	outputs: ModelField[];
	preconditions: string[];
	postconditions: string[];
	errors: { code: string; description: string }[];
	permissions: { actorId: string; capability: string }[];
	acceptanceCriteria: { id: string; given: string; when: string; then: string }[];
}

export interface SemanticElement {
	id: string;
	kind: ElementKind;
	name: string;
	description?: string;
	parentId?: string;
	behavior?: ModelBehavior;
	legacyKind?: 'class';
}

export interface SemanticRelation {
	id: string;
	kind: RelationKind;
	from: string;
	to: string;
	name: string;
	condition?: string;
	errorCode?: string;
	classification?: 'legacy-unclassified';
}

export interface ModelView {
	id: string;
	featureId?: string;
	name: string;
	kind: 'structure' | 'activity' | 'sequence' | 'state';
	nodes: { elementId: string; x: number; y: number }[];
	relationIds: string[];
}

export interface CodeMapping {
	id: string;
	elementId: string;
	file: string;
	symbol: string;
	revision: string;
}

export interface Verification {
	id: string;
	elementId: string;
	criterionId: string;
	outcome: 'passed' | 'failed' | 'unknown';
	evidence: string;
	revision: string;
}

export interface SemanticModel {
	version: 2 | 3;
	id: string;
	name: string;
	semantics: { elements: SemanticElement[]; relations: SemanticRelation[] };
	views: ModelView[];
	codeMappings: CodeMapping[];
	verifications: Verification[];
}

/** Codes and arguments are translated by UI adapters, never inside the domain. */
export interface ModelDiagnostic {
	code: 'shape' | 'duplicateId' | 'missingReference' | 'incompatibleRelation' | 'containmentCycle' | 'invalidParent' | 'missingCriterion' | 'missingError' | 'viewEndpoint' | 'legacyClassification';
	severity: 'error' | 'warning';
	path: string;
	args: string[];
}

interface Schema {
	type?: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'integer';
	const?: number;
	enum?: readonly string[];
	minLength?: number;
	pattern?: string;
	properties?: Record<string, Schema>;
	required?: string[];
	additionalProperties?: boolean;
	items?: Schema;
	$schema?: string;
	$id?: string;
	title?: string;
}

function object(properties: Record<string, Schema>, optional: string[] = []): Schema {
	return { type: 'object', properties, required: Object.keys(properties).filter(key => !optional.includes(key)), additionalProperties: false };
}

function array(items: Schema): Schema { return { type: 'array', items }; }
const text: Schema = { type: 'string' };
const nonempty: Schema = { type: 'string', minLength: 1, pattern: '\\S' };
const identifier: Schema = { type: 'string', minLength: 1, pattern: '^[A-Za-z0-9][A-Za-z0-9_.:-]*$' };
const field = object({ name: nonempty, type: nonempty, required: { type: 'boolean' } });
const behavior = object({
	inputs: array(field), outputs: array(field), preconditions: array(nonempty), postconditions: array(nonempty),
	errors: array(object({ code: identifier, description: nonempty })),
	permissions: array(object({ actorId: identifier, capability: nonempty })),
	acceptanceCriteria: array(object({ id: identifier, given: nonempty, when: nonempty, then: nonempty }))
});

/** Portable JSON Schema; the committed JSON artifact is checked against this source. */
function modelSchema(version: 2 | 3): Schema {
	return {
		$schema: 'https://json-schema.org/draft/2020-12/schema',
		$id: `urn:ade:model:${version}`,
		title: `A.D.E semantic model v${version}`,
		...object({
			version: { type: 'integer', const: version }, id: identifier, name: nonempty,
			semantics: object({
				elements: array(object({
					id: identifier, kind: { type: 'string', enum: elementKinds }, name: nonempty,
					description: text, parentId: identifier, behavior, legacyKind: { type: 'string', enum: ['class'] }
				}, ['description', 'parentId', 'behavior', 'legacyKind'])),
				relations: array(object({
					id: identifier, kind: { type: 'string', enum: relationKinds }, from: identifier, to: identifier, name: text,
					condition: nonempty, errorCode: identifier, classification: { type: 'string', enum: ['legacy-unclassified'] }
				}, ['condition', 'errorCode', 'classification']))
			}),
			views: array(object({
				...(version === 3 ? { featureId: identifier } : {}),
				id: identifier, name: nonempty, kind: { type: 'string', enum: ['structure', 'activity', 'sequence', 'state'] },
				nodes: array(object({ elementId: identifier, x: { type: 'number' }, y: { type: 'number' } })),
				relationIds: array(identifier)
			}, ['featureId'])),
			codeMappings: array(object({ id: identifier, elementId: identifier, file: nonempty, symbol: nonempty, revision: nonempty })),
			verifications: array(object({
				id: identifier, elementId: identifier, criterionId: identifier,
				outcome: { type: 'string', enum: ['passed', 'failed', 'unknown'] }, evidence: nonempty, revision: nonempty
			}))
		})
	};
}

export const semanticModelSchema = modelSchema(2);
export const semanticModelV3Schema = modelSchema(3);

function checkShape(value: unknown, schema: Schema, path: string, diagnostics: ModelDiagnostic[]): void {
	const fail = (expected: string) => diagnostics.push({ code: 'shape', severity: 'error', path, args: [expected] });
	if (schema.type === 'object') {
		if (value === null || typeof value !== 'object' || Array.isArray(value)) {
			fail('object');
			return;
		}
		const record = value as Record<string, unknown>;
		for (const key of schema.required ?? []) {
			if (!Object.hasOwn(record, key)) {
				diagnostics.push({ code: 'shape', severity: 'error', path: `${path}/${key}`, args: ['required'] });
			}
		}
		for (const [key, child] of Object.entries(record)) {
			if (Object.hasOwn(schema.properties ?? {}, key)) {
				checkShape(child, schema.properties![key], `${path}/${key}`, diagnostics);
			} else if (schema.additionalProperties === false) {
				diagnostics.push({ code: 'shape', severity: 'error', path: `${path}/${key}`, args: ['unexpected property'] });
			}
		}
	} else if (schema.type === 'array') {
		if (!Array.isArray(value)) {
			fail('array');
			return;
		}
		value.forEach((child, index) => checkShape(child, schema.items!, `${path}/${index}`, diagnostics));
	} else {
		const expected = schema.type === 'integer' ? 'number' : schema.type;
		if (typeof value !== expected || (typeof value === 'number' && (!Number.isFinite(value) || (schema.type === 'integer' && !Number.isInteger(value))))) {
			fail(schema.type!);
			return;
		}
		if (schema.const !== undefined && value !== schema.const) {
			fail(String(schema.const));
		}
		if (schema.enum && !schema.enum.includes(value as string)) {
			fail(schema.enum.join(' | '));
		}
		if (typeof value === 'string' && ((schema.minLength !== undefined && value.length < schema.minLength) || (schema.pattern && !new RegExp(schema.pattern).test(value)))) {
			fail(schema.pattern ?? `minLength ${schema.minLength}`);
		}
	}
}

const callers: readonly ElementKind[] = ['actor', 'view', 'component', 'controller', 'action'];
const executors: readonly ElementKind[] = ['component', 'controller', 'action'];

/** The compatibility matrix is shared by validation and future visual editors. */
export function isCompatibleRelation(kind: RelationKind, from: ElementKind, to: ElementKind): boolean {
	switch (kind) {
		case 'dependency': return true;
		case 'invocation': return callers.includes(from) && [...executors, 'contract', 'view'].includes(to);
		case 'read':
		case 'write': return executors.includes(from) && to === 'resource';
		case 'transition': return from === 'state' && to === 'state';
		case 'realization': return ['component', 'controller', 'action', 'resource', 'view'].includes(from) && ['feature', 'contract'].includes(to);
	}
}

/** Validates structure first, then graph references, containment and evidence. */
export function validateSemanticModel(value: unknown): ModelDiagnostic[] {
	const diagnostics: ModelDiagnostic[] = [];
	checkShape(value, value !== null && typeof value === 'object' && Object.hasOwn(value, 'version') && (value as { version: number }).version === 3 ? semanticModelV3Schema : semanticModelSchema, '', diagnostics);
	if (diagnostics.length) {
		return diagnostics;
	}
	const model = value as SemanticModel;
	const { elements, relations } = model.semantics;
	const byId = new Map(elements.map(element => [element.id, element]));
	const relationById = new Map(relations.map(relation => [relation.id, relation]));
	const report = (code: ModelDiagnostic['code'], path: string, ...args: string[]) => diagnostics.push({ code, severity: 'error', path, args });
	const unique = (ids: string[], path: string) => {
		const seen = new Set<string>();
		ids.forEach((id, index) => {
			if (seen.has(id)) {
				report('duplicateId', `${path}/${index}`, id);
			}
			seen.add(id);
		});
	};
	// Entity namespaces are separate; references always declare their namespace.
	unique(elements.map(item => item.id), '/semantics/elements');
	unique(relations.map(item => item.id), '/semantics/relations');
	unique(model.views.map(item => item.id), '/views');
	unique(model.codeMappings.map(item => item.id), '/codeMappings');
	unique(model.verifications.map(item => item.id), '/verifications');
	const reference = (id: string, path: string) => {
		const element = byId.get(id);
		if (!element) {
			report('missingReference', path, id);
		}
		return element;
	};
	elements.forEach((element, index) => {
		const path = `/semantics/elements/${index}`;
		if (element.parentId) {
			const parent = reference(element.parentId, `${path}/parentId`);
			if (parent && !['feature', 'component', 'resource', 'controller', 'action'].includes(parent.kind)) {
				report('invalidParent', `${path}/parentId`, parent.id, parent.kind);
			}
			const seen = new Set([element.id]);
			let current: SemanticElement | undefined = element;
			while (current?.parentId) {
				if (seen.has(current.parentId)) {
					report('containmentCycle', `${path}/parentId`, element.id);
					break;
				}
				seen.add(current.parentId);
				current = byId.get(current.parentId);
			}
		}
		if (element.behavior) {
			const behavior = element.behavior;
			unique(behavior.inputs.map(field => field.name), `${path}/behavior/inputs`);
			unique(behavior.outputs.map(field => field.name), `${path}/behavior/outputs`);
			unique(behavior.errors.map(error => error.code), `${path}/behavior/errors`);
			unique(behavior.acceptanceCriteria.map(criterion => criterion.id), `${path}/behavior/acceptanceCriteria`);
			behavior.permissions.forEach((permission, permissionIndex) => {
				const actor = reference(permission.actorId, `${path}/behavior/permissions/${permissionIndex}/actorId`);
				if (actor && actor.kind !== 'actor') {
					report('invalidParent', `${path}/behavior/permissions/${permissionIndex}/actorId`, actor.id, actor.kind);
				}
			});
		}
	});
	relations.forEach((relation, index) => {
		const path = `/semantics/relations/${index}`;
		const from = reference(relation.from, `${path}/from`);
		const to = reference(relation.to, `${path}/to`);
		if (from && to && (!isCompatibleRelation(relation.kind, from.kind, to.kind) || (relation.kind === 'transition' && from.parentId !== to.parentId))) {
			report('incompatibleRelation', path, relation.kind, from.kind, to.kind);
		}
		if (from && relation.errorCode && !from.behavior?.errors.some(error => error.code === relation.errorCode)) {
			report('missingError', `${path}/errorCode`, relation.errorCode, from.id);
		}
		if (relation.classification) {
			diagnostics.push({ code: 'legacyClassification', severity: 'warning', path, args: [relation.id] });
		}
	});
	model.views.forEach((view, index) => {
		const path = `/views/${index}`;
		if (view.featureId) {
			const feature = reference(view.featureId, `${path}/featureId`);
			if (feature && feature.kind !== 'feature') { report('invalidParent', `${path}/featureId`, feature.id, feature.kind); }
		}
		unique(view.nodes.map(node => node.elementId), `${path}/nodes`);
		unique(view.relationIds, `${path}/relationIds`);
		const nodeIds = new Set(view.nodes.map(node => node.elementId));
		view.nodes.forEach((node, nodeIndex) => reference(node.elementId, `${path}/nodes/${nodeIndex}/elementId`));
		view.relationIds.forEach((id, relationIndex) => {
			const relation = relationById.get(id);
			if (!relation) {
				report('missingReference', `${path}/relationIds/${relationIndex}`, id);
			} else if (!nodeIds.has(relation.from) || !nodeIds.has(relation.to)) {
				report('viewEndpoint', `${path}/relationIds/${relationIndex}`, id);
			}
		});
	});
	model.codeMappings.forEach((mapping, index) => reference(mapping.elementId, `/codeMappings/${index}/elementId`));
	model.verifications.forEach((verification, index) => {
		const path = `/verifications/${index}`;
		const element = reference(verification.elementId, `${path}/elementId`);
		if (element && !element.behavior?.acceptanceCriteria.some(criterion => criterion.id === verification.criterionId)) {
			report('missingCriterion', `${path}/criterionId`, verification.criterionId, element.id);
		}
	});
	return diagnostics;
}

export class InvalidSemanticModelError extends Error {
	readonly diagnostics: ModelDiagnostic[];
	constructor(diagnostics: ModelDiagnostic[]) {
		super('Invalid A.D.E semantic model');
		this.diagnostics = diagnostics;
	}
}

/** A validating boundary; successful return always yields a detached snapshot. */
export function readSemanticModel(value: unknown): SemanticModel {
	const diagnostics = validateSemanticModel(value);
	if (diagnostics.some(diagnostic => diagnostic.severity === 'error')) {
		throw new InvalidSemanticModelError(diagnostics);
	}
	return structuredClone(value as SemanticModel);
}

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
	if (typeof value === 'object' && value !== null && Object.hasOwn(value, 'version') && [2, 3].includes((value as { version: number }).version)) {
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

/** In-memory service consumed by the workbench; persistence belongs to file/editor services. */
export class SemanticModelService {
	private model: SemanticModel;

	constructor(value: unknown) { this.model = readSemanticModel(value); }

	getSnapshot(): SemanticModel { return structuredClone(this.model); }

	getElement(id: string): SemanticElement | undefined {
		const element = this.model.semantics.elements.find(element => element.id === id);
		return element && structuredClone(element);
	}

	getRelations(id: string): SemanticRelation[] {
		return structuredClone(this.model.semantics.relations.filter(relation => relation.from === id || relation.to === id));
	}

	/** Validate the whole candidate before atomically replacing the previous snapshot. */
	replace(value: unknown): void { this.model = readSemanticModel(value); }

	renameElement(id: string, name: string): void {
		this.editElement(id, element => { element.name = name; });
	}

	moveElement(id: string, parentId: string | undefined): void {
		this.editElement(id, element => {
			if (parentId === undefined) {
				delete element.parentId;
			} else {
				element.parentId = parentId;
			}
		});
	}

	setPosition(viewId: string, elementId: string, x: number, y: number): void {
		const candidate = this.getSnapshot();
		const node = candidate.views.find(view => view.id === viewId)?.nodes.find(node => node.elementId === elementId);
		if (!node) {
			throw new InvalidSemanticModelError([{ code: 'missingReference', severity: 'error', path: '/views', args: [viewId, elementId] }]);
		}
		node.x = x;
		node.y = y;
		this.replace(candidate);
	}

	private editElement(id: string, edit: (element: SemanticElement) => void): void {
		const candidate = this.getSnapshot();
		const element = candidate.semantics.elements.find(element => element.id === id);
		if (!element) {
			throw new InvalidSemanticModelError([{ code: 'missingReference', severity: 'error', path: '/semantics/elements', args: [id] }]);
		}
		edit(element);
		this.replace(candidate);
	}
}

/** A deterministic source index is evidence for AI, never the user-facing diagram model. */
export function isSourceEvidenceModel(model: SemanticModel): boolean {
	return model.id.startsWith('code:') && !model.semantics.elements.some(element => element.kind === 'feature');
}
