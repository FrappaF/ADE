/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { specificationRows } from './adeSpecificationContent.js';
import * as dom from '../../../../base/browser/dom.js';
import { describeModelPredicate, validateModelPredicate } from '../common/modelExpressions.js';
import { localize } from '../../../../nls.js';
import { getC4DrillDown, getContractImpact, getContractProjection } from '../common/modelBlueprint.js';
import { getGenerationScope } from '../common/modelReadiness.js';
import type { SemanticModelV4 } from '../common/semanticModel.js';
import { blueprintFieldLabel, blueprintPlatformLabels } from './adeBlueprintContent.js';
import { AdeControls } from './adeControls.js';

/** Quiet secondary disclosures preserve all contract and ADR metadata, including on dense diagrams. */
export function renderBlueprintDetails(parent: HTMLElement, model: SemanticModelV4, elementId: string, controls: AdeControls, show: (viewId: string, elementId: string) => void, inspect: (id: string) => void): void {
	const statuses = { proposed: localize('ade.blueprint.proposed', "Proposed"), accepted: localize('ade.blueprint.accepted', "Accepted"), rejected: localize('ade.blueprint.rejected', "Rejected"), deprecated: localize('ade.blueprint.deprecated', "Deprecated"), superseded: localize('ade.blueprint.superseded', "Superseded") };
	const text = (container: HTMLElement, value: string) => { dom.append(container, dom.$('p')).textContent = value; };
	for (const view of getC4DrillDown(model, elementId)) { controls.button(parent, localize('ade.blueprint.drill', "Open {0}", view.name), () => show(view.id, elementId), `drill:${view.id}`); }
	const element = model.semantics.elements.find(element => element.id === elementId);
	if (element?.scope === 'external') { text(parent, localize('ade.blueprint.externalContext', "External system · Context only. Its implementation belongs outside this project.")); }
	if (element?.runtimeKind) { text(parent, localize('ade.blueprint.runtime', "Container role: {0}", element.runtimeKind)); }
	const owner = model.foundation.ownership.find(entry => entry.elementId === elementId);
	if (owner) { controls.button(parent, localize('ade.blueprint.ownedBy', "Owner: {0}", model.semantics.elements.find(element => element.id === owner.ownerId)?.name ?? ''), () => inspect(owner.ownerId), `owner:${owner.id}`); }
	for (const membership of model.foundation.memberships.filter(entry => entry.elementId === elementId)) { controls.button(parent, localize('ade.blueprint.feature', "Feature: {0}", model.semantics.elements.find(element => element.id === membership.featureId)?.name ?? ''), () => inspect(membership.featureId), `membership:${membership.id}`); }
	for (const label of blueprintPlatformLabels(model, elementId)) { text(parent, label); }
	for (const module of model.foundation.blueprint?.modules.filter(module => module.elementId === elementId || module.consumerIds.includes(elementId)) ?? []) {
		text(parent, localize('ade.blueprint.libraryBindingText', "Shared Library: {0} · {1}", module.library.state === 'known' ? String(module.library.value) : localize('ade.blueprint.libraryPending', "To Be Chosen"), module.version.state === 'known' ? String(module.version.value) : localize('ade.blueprint.libraryPending', "To Be Chosen")));
		controls.button(parent, localize('ade.blueprint.sharedModuleText', "Module: {0}", model.semantics.elements.find(element => element.id === module.elementId)?.name ?? ''), () => inspect(module.elementId), `module:${module.id}`);
	}
	for (const predicate of model.foundation.predicates?.filter(predicate => model.foundation.blueprint?.operations.some(operation => operation.id === predicate.operationId && operation.ownerId === elementId)) ?? []) { text(parent, localize('ade.predicate.read', "Pure Predicate: {0}", validateModelPredicate(model, predicate).length ? localize('ade.predicate.incomplete', "Incomplete Expression") : describeModelPredicate(model, predicate))); }
	for (const row of specificationRows(model, elementId)) { text(parent, row); }
	const projection = getContractProjection(model, elementId);

	for (const port of projection.ports) {
		const contract = model.foundation.blueprint?.interfaces.find(contract => contract.id === port.interfaceId);
		const label = model.semantics.elements.find(element => element.id === contract?.elementId)?.name ?? '';
		controls.button(parent, port.direction === 'provided' ? localize('ade.blueprint.providedContract', "Provides: {0}", label) : localize('ade.blueprint.requiredContract', "Requires: {0}", label), () => { if (contract) { inspect(contract.elementId); } }, `port:${port.id}`);
	}
	if (projection.operations.length) {
		const contracts = controls.details(parent, localize('ade.blueprint.sharedContracts', "Shared Contract Definitions"), `contracts:${elementId}`);
		for (const contract of projection.contracts) { text(contracts, localize('ade.blueprint.contractRevision', "Contract Version: {0}", contract.version)); for (const invariant of contract.invariants) { text(contracts, localize('ade.blueprint.invariantText', "Invariant (descriptive): {0}", invariant)); } }
		for (const operation of projection.operations) {
			const detail = controls.details(contracts, operation.name, `operation:${operation.id}`);
			for (const field of operation.inputs) { text(detail, localize('ade.blueprint.inputField', "Input · {0}", blueprintFieldLabel(model, field))); }
			for (const field of operation.outputs) { text(detail, localize('ade.blueprint.outputField', "Result · {0}", blueprintFieldLabel(model, field))); }
			for (const error of operation.errors) { text(detail, localize('ade.blueprint.typedError', "Error {0}: {1} · {2}", error.code, model.foundation.types.find(type => type.id === error.typeId)?.name ?? '', error.description)); }
			for (const effect of operation.effects) { text(detail, localize('ade.blueprint.effectText', "Declared Effect: {0}", effect)); }
			for (const condition of operation.preconditions) { text(detail, localize('ade.blueprint.preText', "Precondition (descriptive): {0}", condition)); }
			for (const condition of operation.postconditions) { text(detail, localize('ade.blueprint.postText', "Postcondition (descriptive): {0}", condition)); }
			for (const permission of operation.permissions) { text(detail, localize('ade.blueprint.permissionText', "Permission: {0} · {1}", model.semantics.elements.find(element => element.id === permission.actorId)?.name ?? '', permission.capability)); }
			for (const criterion of operation.acceptanceCriteria) { text(detail, localize('ade.blueprint.criterionText', "Given {0}; when {1}; then {2}", criterion.given, criterion.when, criterion.then)); }
			const impact = getContractImpact(model, operation.id);
			for (const consumerId of impact.consumerIds) { controls.button(detail, localize('ade.blueprint.consumerText', "Consumer: {0}", model.semantics.elements.find(element => element.id === consumerId)?.name ?? ''), () => inspect(consumerId), `contract-consumer:${operation.id}:${consumerId}`); }
			if (impact.occurrenceIds.length) { text(detail, localize('ade.blueprint.scenarioImpact', "Referenced by {0} call occurrences. A signature change requires checking these scenarios.", impact.occurrenceIds.length)); }
		}
		for (const type of projection.types) { const detail = controls.details(contracts, type.name, `type:${type.id}`); for (const field of type.fields) { text(detail, blueprintFieldLabel(model, field)); } if (type.values) { text(detail, type.values.join(', ')); } if (type.primitive) { text(detail, type.primitive); } for (const constraint of type.constraints ?? []) { text(detail, localize('ade.blueprint.typeConstraintText', "Constraint: {0} · {1}", constraint.kind, String(constraint.value))); } }
	}
	const scope = getGenerationScope(model, elementId);
	const decisions = model.foundation.decisions.filter(decision => decision.scopeIds.some(id => scope.has(id)));
	if (decisions.length) {
		const panel = controls.details(parent, localize('ade.blueprint.decisionPanel', "Project Architecture Decisions"), `decisions:${elementId}`);
		for (const decision of decisions) {
			const record = decision.record; const detail = controls.details(panel, record ? `${record.number} · ${record.title}` : decision.id, `decision:${decision.id}`);
			text(detail, localize('ade.blueprint.decisionState', "Status: {0} · Revision: {1}", statuses[decision.status], decision.revision));
			if (record) { text(detail, record.context); text(detail, record.decision); for (const consequence of record.consequences) { text(detail, consequence); } for (const history of record.history) { const previous = controls.details(detail, localize('ade.blueprint.previousRevision', "Previous Revision: {0} · {1}", history.revision, statuses[history.status]), `decision-history:${decision.id}:${history.revision}`); text(previous, history.title ?? ''); text(previous, history.context ?? ''); text(previous, history.decision ?? ''); for (const consequence of history.consequences ?? []) { text(previous, consequence); } } }
			for (const constraint of decision.constraints) { text(detail, localize('ade.blueprint.normativeText', "Normative constraint: {0} · {1} · {2} · {3}", constraint.category ?? '', constraint.field, constraint.operator === 'notEquals' ? localize('ade.blueprint.forbiddenValue', "Forbidden Value") : localize('ade.blueprint.requiredValue', "Required Value"), constraint.value.state === 'known' ? String(constraint.value.value) : localize('ade.blueprint.constraintUnknown', "Unknown"))); }
			text(detail, localize('ade.blueprint.proseReview', "Structured constraints are checked automatically. Prose requires review."));
		}
	}
}
