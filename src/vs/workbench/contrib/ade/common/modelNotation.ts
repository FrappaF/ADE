/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ModelView, type NotationRule, type SemanticElement, type SemanticRelation } from './modelTypes.js';

/** Rules describe notation, never infer source semantics. Structure remains a cross-perspective overview. */
export const notationRules: Partial<Record<ModelView['kind'], NotationRule>> = {
	c4Context: { core: ['system'], elements: ['actor', 'system'], relations: ['communication', 'dependency'], purpose: 'System boundary, people and external systems; no implementation details.' },
	c4Container: { core: ['container', 'dataStore', 'resource'], elements: ['actor', 'system', 'container', 'resource', 'dataStore'], relations: ['communication', 'dependency'], purpose: 'Deployable applications, APIs, services and data stores inside a software system; name evidenced technologies and protocols.' },
	c4Component: { core: ['component', 'controller'], elements: ['container', 'component', 'controller', 'interface', 'contract', 'resource'], relations: ['dependency', 'communication', 'implementation', 'realization'], purpose: 'Internal responsibilities of one container and their interfaces; retain the container boundary.' },
	erd: { core: ['entity', 'resource'], elements: ['entity', 'resource'], relations: ['association', 'composition', 'aggregation'], purpose: 'Logical domain entities, attributes and explicitly known cardinalities; no fabricated keys.' },
	databaseSchema: { core: ['table'], elements: ['table', 'dataStore', 'resource'], relations: ['association'], purpose: 'Physical tables, columns, data types, primary/foreign/unique keys and nullability supported by schema/migrations.' },
	deployment: { core: ['deploymentNode', 'networkNode'], elements: ['system', 'deploymentNode', 'networkNode', 'artifact', 'container', 'resource', 'dataStore'], relations: ['hosting', 'communication', 'dependency'], purpose: 'Execution environments host deployable artifacts; distinguish declared deployment from observed running infrastructure.' },
	class: { core: ['class', 'interface'], elements: ['class', 'interface'], relations: ['association', 'inheritance', 'composition', 'aggregation', 'implementation', 'dependency'], purpose: 'Language-neutral class/interface members and OO relationships supported by declarations.' },
	useCase: { core: ['useCase'], elements: ['actor', 'useCase', 'system'], relations: ['association', 'include', 'extend'], purpose: 'Actors use system capabilities; include/extend only when supported. Keep a system boundary.' },
	component: { core: ['component', 'container'], elements: ['component', 'interface', 'contract', 'container'], relations: ['dependency', 'implementation', 'realization', 'communication'], purpose: 'UML components and their provided/required interfaces, with explicit dependency directions.' },
	package: { core: ['package'], elements: ['package'], relations: ['dependency'], purpose: 'Architectural packages/layers and inter-package dependencies, rather than a file inventory.' },
	dataFlow: { core: ['process'], elements: ['actor', 'system', 'process', 'dataStore', 'resource'], relations: ['dataFlow'], purpose: 'Named data moves through processes, stores and external entities; arrows describe payloads, not control calls.' },
	network: { core: ['networkNode', 'deploymentNode'], elements: ['networkNode', 'deploymentNode', 'container', 'system'], relations: ['communication', 'hosting'], purpose: 'Declared network boundaries, subnets, gateways and connections/protocols; never infer production infrastructure from application code.' }
};

export function acceptsNotationElement(kind: ModelView['kind'], element: Pick<SemanticElement, 'kind'>): boolean {
	return !notationRules[kind] || notationRules[kind]!.elements.includes(element.kind);
}

export function acceptsNotationRelation(kind: ModelView['kind'], relation: Pick<SemanticRelation, 'kind'>): boolean {
	return !notationRules[kind] || notationRules[kind]!.relations.includes(relation.kind);
}

export function notationRelationLabel(relation: SemanticRelation): string {
	return [relation.details?.sourceMultiplicity, relation.details?.sourceMember, relation.name, relation.details?.targetMember, relation.details?.targetMultiplicity, relation.details?.protocol].filter(Boolean).join(' · ');
}
