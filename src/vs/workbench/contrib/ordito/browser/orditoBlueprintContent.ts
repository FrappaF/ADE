import { specificationRows } from './orditoSpecificationContent.js';
import { resolveModelPlatform } from '../common/modelProfiles.js';
import { describeModelPredicate, validateModelPredicate } from '../common/modelExpressions.js';
import { localize } from '../../../../nls.js';
import { getContractProjection } from '../common/modelBlueprint.js';
import { getGenerationScope } from '../common/modelReadiness.js';
import { type ModelField, type SemanticModelV4 } from '../common/modelTypes.js';

/** Presence and nullability are separate in both visual and accessible contract projections. */
export function blueprintFieldLabel(model: SemanticModelV4, field: ModelField): string {
	return localize('ordito.blueprint.fieldLabel', "{0}: {1} · {2} · {3}", field.name, model.foundation.types.find(type => type.id === field.typeId)?.name ?? field.type, field.required ? localize('ordito.blueprint.present', "Required") : localize('ordito.blueprint.absent', "Optional"), field.nullable?.state === 'known' ? field.nullable.value === true ? localize('ordito.blueprint.nullAllowed', "Null Allowed") : localize('ordito.blueprint.nullForbidden', "Non-null") : localize('ordito.blueprint.nullUnresolved', "Nullability Unknown"));
}

/** Read Diagram keeps required blueprint metadata available without relying on canvas density. */
export function describeBlueprint(model: SemanticModelV4, elementId: string): string[] {
	const lines: string[] = specificationRows(model, elementId); const projection = getContractProjection(model, elementId);
	lines.push(...blueprintPlatformLabels(model, elementId));
	for (const contract of projection.contracts) { lines.push(localize('ordito.blueprint.contractRevision', "Contract Version: {0}", contract.version), ...contract.invariants.map(value => localize('ordito.blueprint.invariantText', "Invariant (descriptive): {0}", value))); }
	for (const operation of projection.operations) {
		lines.push(operation.name, ...operation.inputs.map(field => localize('ordito.blueprint.inputField', "Input · {0}", blueprintFieldLabel(model, field))), ...operation.outputs.map(field => localize('ordito.blueprint.outputField', "Result · {0}", blueprintFieldLabel(model, field))));
		for (const error of operation.errors) { lines.push(localize('ordito.blueprint.typedError', "Error {0}: {1} · {2}", error.code, model.foundation.types.find(type => type.id === error.typeId)?.name ?? '', error.description)); }
		for (const effect of operation.effects) { lines.push(localize('ordito.blueprint.effectText', "Declared Effect: {0}", effect)); }
		for (const value of operation.preconditions) { lines.push(localize('ordito.blueprint.preText', "Precondition (descriptive): {0}", value)); }
		for (const value of operation.postconditions) { lines.push(localize('ordito.blueprint.postText', "Postcondition (descriptive): {0}", value)); }
		for (const permission of operation.permissions) { lines.push(localize('ordito.blueprint.permissionText', "Permission: {0} · {1}", model.semantics.elements.find(element => element.id === permission.actorId)?.name ?? '', permission.capability)); }
		for (const criterion of operation.acceptanceCriteria) { lines.push(localize('ordito.blueprint.criterionText', "Given {0}; when {1}; then {2}", criterion.given, criterion.when, criterion.then)); }
	}
	for (const type of projection.types) { lines.push(type.name, ...type.fields.map(field => blueprintFieldLabel(model, field)), ...(type.values ?? [])); }
	const scope = getGenerationScope(model, elementId);
	for (const decision of model.foundation.decisions.filter(decision => decision.scopeIds.some(id => scope.has(id)))) {
		lines.push(localize('ordito.blueprint.decisionStatusReading', "Decision Status: {0} · Scope: {1}", decision.status, decision.scopeIds.map(id => model.semantics.elements.find(element => element.id === id)?.name ?? '').join(', ')));
		if (decision.record) {
			lines.push(decision.record.title, decision.record.context, decision.record.decision, ...decision.record.consequences);
			for (const previous of decision.record.history) { lines.push(localize('ordito.blueprint.previousDecisionReading', "Previous Decision: {0} · {1}", previous.title ?? '', previous.status), previous.context ?? '', previous.decision ?? '', ...previous.consequences ?? []); }
		}
		for (const constraint of decision.constraints) { lines.push(localize('ordito.blueprint.constraintReading', "Constraint {0}: {1} · {2}", constraint.field, constraint.operator === 'notEquals' ? localize('ordito.blueprint.forbiddenValue', "Forbidden Value") : localize('ordito.blueprint.requiredValue', "Required Value"), constraint.value.state === 'known' ? String(constraint.value.value) : localize('ordito.blueprint.constraintUnknown', "Unknown"))); }
	}
	for (const predicate of model.foundation.predicates?.filter(predicate => model.foundation.blueprint?.operations.some(operation => operation.id === predicate.operationId && operation.ownerId === elementId)) ?? []) { lines.push(localize('ordito.predicate.read', "Pure Predicate: {0}", validateModelPredicate(model, predicate).length ? localize('ordito.predicate.incomplete', "Incomplete Expression") : describeModelPredicate(model, predicate))); }
	return lines;
}

/** Resolve trusted PSM values for the selected L2 container, also used by accessible reading. */
export function blueprintPlatformLabels(model: SemanticModelV4, elementId: string): string[] {
	return model.foundation.platform.bindings.filter(binding => binding.elementId === elementId).map(binding => {
		if (binding.profileId === 'node.esm' || binding.profileId === 'bun.esm') {
			try { const platform = resolveModelPlatform(model, elementId, binding.profileId); return platform.technology === 'nats-jetstream' ? localize('ordito.blueprint.resolvedBroker', "Technology: NATS JetStream {0}", platform.version) : localize('ordito.blueprint.resolvedRuntime', "Technology: {0} {1} · ECMAScript Modules · Framework: None", platform.runtime === 'bun' ? 'Bun' : 'Node', platform.version); }
			catch { return localize('ordito.blueprint.unresolvedRuntime', "Runtime Platform Binding Needs Review"); }
		}
		return binding.technology.state === 'known' ? localize('ordito.blueprint.boundTechnology', "Technology: {0} · {1}", String(binding.technology.value), binding.profileId) : localize('ordito.blueprint.chooseTechnology', "Technology: To Be Chosen · {0}", binding.profileId);
	});
}
