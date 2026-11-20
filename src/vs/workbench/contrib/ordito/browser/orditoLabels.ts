import { localize } from '../../../../nls.js';
import { ElementKind, ModelView, RelationKind } from '../common/modelTypes.js';

export const elementLabels: Record<ElementKind, string> = {
	feature: localize('ordito.kind.feature', "Feature"), actor: localize('ordito.kind.actor', "Actor"),
	component: localize('ordito.kind.component', "Component"), resource: localize('ordito.kind.resource', "Resource"),
	view: localize('ordito.kind.view', "Interface"), controller: localize('ordito.kind.controller', "Controller"),
	contract: localize('ordito.kind.contract', "Contract"), action: localize('ordito.kind.action', "Action"), state: localize('ordito.kind.state', "State"),
	system: localize('ordito.kind.system', "Software System"),
	container: localize('ordito.kind.container', "Application / Container"),
	entity: localize('ordito.kind.entity', "Entity"),
	table: localize('ordito.kind.table', "Table"),
	class: localize('ordito.kind.class', "Class"),
	interface: localize('ordito.kind.interface', "Interface Contract"),
	package: localize('ordito.kind.package', "Package"),
	deploymentNode: localize('ordito.kind.deploymentNode', "Deployment Node"),
	artifact: localize('ordito.kind.artifact', "Artifact"),
	networkNode: localize('ordito.kind.networkNode', "Network Node"),
	useCase: localize('ordito.kind.useCase', "Use Case"),
	process: localize('ordito.kind.process', "Process"),
	dataStore: localize('ordito.kind.dataStore', "Data Store"),
	decision: localize('ordito.kind.decision', "Decision"),
	start: localize('ordito.kind.start', "Start"), end: localize('ordito.kind.end', "End")
};

export const relationLabels: Record<RelationKind, string> = {
	invocation: localize('ordito.relation.invocation', "Invocation"), dependency: localize('ordito.relation.dependency', "Dependency"),
	read: localize('ordito.relation.read', "Read"), write: localize('ordito.relation.write', "Write"),
	transition: localize('ordito.relation.transition', "Transition"), realization: localize('ordito.relation.realization', "Realization"),
	association: localize('ordito.relation.association', "Association"),
	inheritance: localize('ordito.relation.inheritance', "Inheritance"),
	composition: localize('ordito.relation.composition', "Composition"),
	aggregation: localize('ordito.relation.aggregation', "Aggregation"),
	implementation: localize('ordito.relation.implementation', "Implementation"),
	hosting: localize('ordito.relation.hosting', "Hosts"),
	communication: localize('ordito.relation.communication', "Communication"),
	dataFlow: localize('ordito.relation.dataFlow', "Data Flow"),
	include: localize('ordito.relation.include', "Include"),
	extend: localize('ordito.relation.extend', "Extend"), controlFlow: localize('ordito.relation.controlFlow', "Control Flow")
};

export const viewLabels: Record<ModelView['kind'], string> = {
	structure: localize('ordito.view.structure', "Structure"), activity: localize('ordito.view.activity', "Activity"),
	sequence: localize('ordito.view.sequence', "Sequence"), state: localize('ordito.view.state', "State"),
	c4Context: localize('ordito.view.c4Context', "C4 · System Context"),
	c4Container: localize('ordito.view.c4Container', "C4 · Containers"),
	c4Component: localize('ordito.view.c4Component', "C4 · Components"),
	erd: localize('ordito.view.erd', "Entity–Relationship"),
	databaseSchema: localize('ordito.view.databaseSchema', "Database Schema"),
	deployment: localize('ordito.view.deployment', "Deployment"),
	class: localize('ordito.view.class', "Class"),
	useCase: localize('ordito.view.useCase', "Use Case"),
	component: localize('ordito.view.component', "UML Component"),
	package: localize('ordito.view.package', "Package"),
	dataFlow: localize('ordito.view.dataFlow', "Data Flow"),
	network: localize('ordito.view.network', "Network / Infrastructure")
};
