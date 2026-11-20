import { specificationRows } from './orditoSpecificationContent.js';
import * as dom from '../../../../base/browser/dom.js';
import { describeModelPredicate, validateModelPredicate } from '../common/modelExpressions.js';
import { localize } from '../../../../nls.js';
import { getC4DrillDown, getContractImpact, getContractProjection } from '../common/modelBlueprint.js';
import { getGenerationScope } from '../common/modelReadiness.js';
import { type SemanticModelV4 } from '../common/modelTypes.js';
import { blueprintFieldLabel, blueprintPlatformLabels } from './orditoBlueprintContent.js';
import { OrditoControls } from './orditoControls.js';

/** Quiet secondary disclosures preserve all contract and ADR metadata, including on dense diagrams. */
export function renderBlueprintDetails(parent: HTMLElement, model: SemanticModelV4, elementId: string, controls: OrditoControls, show: (viewId: string, elementId: string) => void, inspect: (id: string) => void): void {
	const statuses = { proposed: localize('ordito.blueprint.proposed', "Proposed"), accepted: localize('ordito.blueprint.accepted', "Accepted"), rejected: localize('ordito.blueprint.rejected', "Rejected"), deprecated: localize('ordito.blueprint.deprecated', "Deprecated"), superseded: localize('ordito.blueprint.superseded', "Superseded") };
	const text = (container: HTMLElement, value: string) => { dom.append(container, dom.$('p')).textContent = value; };
	for (const view of getC4DrillDown(model, elementId)) { controls.button(parent, localize('ordito.blueprint.drill', "Open {0}", view.name), () => show(view.id, elementId), `drill:${view.id}`); }
	const element = model.semantics.elements.find(element => element.id === elementId);
	if (element?.scope === 'external') { text(parent, localize('ordito.blueprint.externalContext', "External system · Context only. Its implementation belongs outside this project.")); }
	if (element?.runtimeKind) { text(parent, localize('ordito.blueprint.runtime', "Container role: {0}", element.runtimeKind)); }
	const owner = model.foundation.ownership.find(entry => entry.elementId === elementId);
	if (owner) { controls.button(parent, localize('ordito.blueprint.ownedBy', "Owner: {0}", model.semantics.elements.find(element => element.id === owner.ownerId)?.name ?? ''), () => inspect(owner.ownerId), `owner:${owner.id}`); }
	for (const membership of model.foundation.memberships.filter(entry => entry.elementId === elementId)) { controls.button(parent, localize('ordito.blueprint.feature', "Feature: {0}", model.semantics.elements.find(element => element.id === membership.featureId)?.name ?? ''), () => inspect(membership.featureId), `membership:${membership.id}`); }
	for (const label of blueprintPlatformLabels(model, elementId)) { text(parent, label); }
	for (const module of model.foundation.blueprint?.modules.filter(module => module.elementId === elementId || module.consumerIds.includes(elementId)) ?? []) {
		text(parent, localize('ordito.blueprint.libraryBindingText', "Shared Library: {0} · {1}", module.library.state === 'known' ? String(module.library.value) : localize('ordito.blueprint.libraryPending', "To Be Chosen"), module.version.state === 'known' ? String(module.version.value) : localize('ordito.blueprint.libraryPending', "To Be Chosen")));
		controls.button(parent, localize('ordito.blueprint.sharedModuleText', "Module: {0}", model.semantics.elements.find(element => element.id === module.elementId)?.name ?? ''), () => inspect(module.elementId), `module:${module.id}`);
	}
	for (const predicate of model.foundation.predicates?.filter(predicate => model.foundation.blueprint?.operations.some(operation => operation.id === predicate.operationId && operation.ownerId === elementId)) ?? []) { text(parent, localize('ordito.predicate.read', "Pure Predicate: {0}", validateModelPredicate(model, predicate).length ? localize('ordito.predicate.incomplete', "Incomplete Expression") : describeModelPredicate(model, predicate))); }
	for (const row of specificationRows(model, elementId, { includeOwner: !owner })) { text(parent, row); }
	const projection = getContractProjection(model, elementId);

	for (const port of projection.ports) {
		const contract = model.foundation.blueprint?.interfaces.find(contract => contract.id === port.interfaceId);
		const label = model.semantics.elements.find(element => element.id === contract?.elementId)?.name ?? '';
		controls.button(parent, port.direction === 'provided' ? localize('ordito.blueprint.providedContract', "Provides: {0}", label) : localize('ordito.blueprint.requiredContract', "Requires: {0}", label), () => { if (contract) { inspect(contract.elementId); } }, `port:${port.id}`);
	}
	if (projection.operations.length) {
		const contracts = controls.details(parent, localize('ordito.blueprint.sharedContracts', "Shared Contract Definitions"), `contracts:${elementId}`);
		for (const contract of projection.contracts) { text(contracts, localize('ordito.blueprint.contractRevision', "Contract Version: {0}", contract.version)); for (const invariant of contract.invariants) { text(contracts, localize('ordito.blueprint.invariantText', "Invariant (descriptive): {0}", invariant)); } }
		for (const operation of projection.operations) { renderBlueprintOperation(contracts, model, operation, controls, inspect); }
		for (const type of projection.types) { const detail = controls.details(contracts, type.name, `type:${type.id}`); for (const field of type.fields) { text(detail, blueprintFieldLabel(model, field)); } if (type.values) { text(detail, type.values.join(', ')); } if (type.primitive) { text(detail, type.primitive); } for (const constraint of type.constraints ?? []) { text(detail, localize('ordito.blueprint.typeConstraintText', "Constraint: {0} · {1}", constraint.kind, String(constraint.value))); } }
	}
	const scope = getGenerationScope(model, elementId);
	const decisions = model.foundation.decisions.filter(decision => decision.scopeIds.some(id => scope.has(id)));
	if (decisions.length) {
		const panel = controls.details(parent, localize('ordito.blueprint.decisionPanel', "Project Architecture Decisions"), `decisions:${elementId}`);
		for (const decision of decisions) {
			const record = decision.record; const detail = controls.details(panel, record ? `${record.number} · ${record.title}` : decision.id, `decision:${decision.id}`);
			text(detail, localize('ordito.blueprint.decisionState', "Status: {0} · Revision: {1}", statuses[decision.status], decision.revision));
			if (record) { text(detail, record.context); text(detail, record.decision); for (const consequence of record.consequences) { text(detail, consequence); } for (const history of record.history) { const previous = controls.details(detail, localize('ordito.blueprint.previousRevision', "Previous Revision: {0} · {1}", history.revision, statuses[history.status]), `decision-history:${decision.id}:${history.revision}`); text(previous, history.title ?? ''); text(previous, history.context ?? ''); text(previous, history.decision ?? ''); for (const consequence of history.consequences ?? []) { text(previous, consequence); } } }
			for (const constraint of decision.constraints) { text(detail, localize('ordito.blueprint.normativeText', "Normative constraint: {0} · {1} · {2} · {3}", constraint.category ?? '', constraint.field, constraint.operator === 'notEquals' ? localize('ordito.blueprint.forbiddenValue', "Forbidden Value") : localize('ordito.blueprint.requiredValue', "Required Value"), constraint.value.state === 'known' ? String(constraint.value.value) : localize('ordito.blueprint.constraintUnknown', "Unknown"))); }
			text(detail, localize('ordito.blueprint.proseReview', "Structured constraints are checked automatically. Prose requires review."));
		}
	}
}

/** Render the shared definition for one selected call without copying or narrowing the model. */
export function renderBlueprintOperation(parent: HTMLElement, model: SemanticModelV4, operation: NonNullable<SemanticModelV4['foundation']['blueprint']>['operations'][number], controls: OrditoControls, inspect: (id: string) => void): void {
	const text = (container: HTMLElement, value: string) => { dom.append(container, dom.$('p')).textContent = value; };
	const detail = controls.details(parent, operation.name, `operation:${operation.id}`);
	for (const field of operation.inputs) { text(detail, localize('ordito.blueprint.inputField', "Input · {0}", blueprintFieldLabel(model, field))); }
	for (const field of operation.outputs) { text(detail, localize('ordito.blueprint.outputField', "Result · {0}", blueprintFieldLabel(model, field))); }
	for (const error of operation.errors) { text(detail, localize('ordito.blueprint.typedError', "Error {0}: {1} · {2}", error.code, model.foundation.types.find(type => type.id === error.typeId)?.name ?? '', error.description)); }
	for (const effect of operation.effects) { text(detail, localize('ordito.blueprint.effectText', "Declared Effect: {0}", effect)); }
	for (const condition of operation.preconditions) { text(detail, localize('ordito.blueprint.preText', "Precondition (descriptive): {0}", condition)); }
	for (const condition of operation.postconditions) { text(detail, localize('ordito.blueprint.postText', "Postcondition (descriptive): {0}", condition)); }
	for (const permission of operation.permissions) { text(detail, localize('ordito.blueprint.permissionText', "Permission: {0} · {1}", model.semantics.elements.find(element => element.id === permission.actorId)?.name ?? '', permission.capability)); }
	for (const criterion of operation.acceptanceCriteria) { text(detail, localize('ordito.blueprint.criterionText', "Given {0}; when {1}; then {2}", criterion.given, criterion.when, criterion.then)); }
	const impact = getContractImpact(model, operation.id);
	for (const consumerId of impact.consumerIds) { controls.button(detail, localize('ordito.blueprint.consumerText', "Consumer: {0}", model.semantics.elements.find(element => element.id === consumerId)?.name ?? ''), () => inspect(consumerId), `contract-consumer:${operation.id}:${consumerId}`); }
	if (impact.occurrenceIds.length) { text(detail, impact.occurrenceIds.length === 1 ? localize('ordito.blueprint.oneScenarioImpact', "Referenced by 1 call occurrence. A signature change requires checking this scenario.") : localize('ordito.blueprint.scenarioImpact', "Referenced by {0} call occurrences. A signature change requires checking these scenarios.", impact.occurrenceIds.length)); }
}
