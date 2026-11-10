/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { ElementKind, ModelView, RelationKind } from '../common/modelTypes.js';

export const elementLabels: Record<ElementKind, string> = {
	feature: localize('ade.kind.feature', "Feature"), actor: localize('ade.kind.actor', "Actor"),
	component: localize('ade.kind.component', "Component"), resource: localize('ade.kind.resource', "Resource"),
	view: localize('ade.kind.view', "Interface"), controller: localize('ade.kind.controller', "Controller"),
	contract: localize('ade.kind.contract', "Contract"), action: localize('ade.kind.action', "Action"), state: localize('ade.kind.state', "State"),
	system: localize('ade.kind.system', "Software System"),
	container: localize('ade.kind.container', "Application / Container"),
	entity: localize('ade.kind.entity', "Entity"),
	table: localize('ade.kind.table', "Table"),
	class: localize('ade.kind.class', "Class"),
	interface: localize('ade.kind.interface', "Interface Contract"),
	package: localize('ade.kind.package', "Package"),
	deploymentNode: localize('ade.kind.deploymentNode', "Deployment Node"),
	artifact: localize('ade.kind.artifact', "Artifact"),
	networkNode: localize('ade.kind.networkNode', "Network Node"),
	useCase: localize('ade.kind.useCase', "Use Case"),
	process: localize('ade.kind.process', "Process"),
	dataStore: localize('ade.kind.dataStore', "Data Store"),
	decision: localize('ade.kind.decision', "Decision"),
	start: localize('ade.kind.start', "Start"), end: localize('ade.kind.end', "End")
};

export const relationLabels: Record<RelationKind, string> = {
	invocation: localize('ade.relation.invocation', "Invocation"), dependency: localize('ade.relation.dependency', "Dependency"),
	read: localize('ade.relation.read', "Read"), write: localize('ade.relation.write', "Write"),
	transition: localize('ade.relation.transition', "Transition"), realization: localize('ade.relation.realization', "Realization"),
	association: localize('ade.relation.association', "Association"),
	inheritance: localize('ade.relation.inheritance', "Inheritance"),
	composition: localize('ade.relation.composition', "Composition"),
	aggregation: localize('ade.relation.aggregation', "Aggregation"),
	implementation: localize('ade.relation.implementation', "Implementation"),
	hosting: localize('ade.relation.hosting', "Hosts"),
	communication: localize('ade.relation.communication', "Communication"),
	dataFlow: localize('ade.relation.dataFlow', "Data Flow"),
	include: localize('ade.relation.include', "Include"),
	extend: localize('ade.relation.extend', "Extend"), controlFlow: localize('ade.relation.controlFlow', "Control Flow")
};

export const viewLabels: Record<ModelView['kind'], string> = {
	structure: localize('ade.view.structure', "Structure"), activity: localize('ade.view.activity', "Activity"),
	sequence: localize('ade.view.sequence', "Sequence"), state: localize('ade.view.state', "State"),
	c4Context: localize('ade.view.c4Context', "C4 · System Context"),
	c4Container: localize('ade.view.c4Container', "C4 · Containers"),
	c4Component: localize('ade.view.c4Component', "C4 · Components"),
	erd: localize('ade.view.erd', "Entity–Relationship"),
	databaseSchema: localize('ade.view.databaseSchema', "Database Schema"),
	deployment: localize('ade.view.deployment', "Deployment"),
	class: localize('ade.view.class', "Class"),
	useCase: localize('ade.view.useCase', "Use Case"),
	component: localize('ade.view.component', "UML Component"),
	package: localize('ade.view.package', "Package"),
	dataFlow: localize('ade.view.dataFlow', "Data Flow"),
	network: localize('ade.view.network', "Network / Infrastructure")
};
