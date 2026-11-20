import { localize } from '../../../../nls.js';
import { SemanticModel, Verification } from '../common/modelTypes.js';
import { getElementEvidence, getModelImpact } from '../common/modelImpact.js';
import { relationLabels } from './adeLabels.js';

export const impactScopeDescription = localize('ade.impact.scopeDescription', "Review the scope defined by model containment and incoming references, regardless of relationship conditions.");

export function evidenceSummary(evidence: ReturnType<typeof getElementEvidence>): string {
	return localize('ade.evidence.summary', "Design Declaration · Code References: {0} · Verification Records: {1}", evidence.mappings.length, evidence.verifications.length);
}

/** Keep every recorded outcome and revision; array position does not establish recency. */
export function describeRecordedEvidence(model: SemanticModel, id: string): string[] {
	const evidence = getElementEvidence(model, id);
	const outcomes: Record<Verification['outcome'], string> = {
		passed: localize('ade.evidence.passed', "Passed"), failed: localize('ade.evidence.failed', "Failed"), unknown: localize('ade.evidence.unknown', "Unknown")
	};
	const lines = [localize('ade.evidence.element', "Evidence for {0}", evidence.element.name), evidenceSummary(evidence),
		localize('ade.evidence.limits', "Records do not establish the current implementation, freshness or latest result. No tests are run by this view.")];
	for (const mapping of evidence.mappings) { lines.push(localize('ade.evidence.mapping', "Code Reference: {0} · Symbol: {1} · Revision: {2}", mapping.file, mapping.symbol, mapping.revision)); }
	for (const record of evidence.verifications) { lines.push(localize('ade.evidence.record', "Recorded {0} · Criterion: {1} · Evidence: {2} · Revision: {3}", outcomes[record.outcome], record.criterionId, record.evidence, record.revision)); }
	lines.push(localize('ade.evidence.outcomes', "Recorded Outcomes: {0} passed, {1} failed, {2} unknown", evidence.outcomes.passed, evidence.outcomes.failed, evidence.outcomes.unknown));
	for (const criterion of evidence.criteriaWithoutRecords) { lines.push(localize('ade.evidence.uncovered', "No Records for Criterion {0}: Given {1}, when {2}, then {3}.", criterion.id, criterion.given, criterion.when, criterion.then)); }
	if (evidence.criteriaWithMixedOutcomes.length) { lines.push(localize('ade.evidence.mixed', "Different Outcomes Recorded for Criteria: {0}. Review each revision; no latest result is inferred.", evidence.criteriaWithMixedOutcomes.map(criterion => criterion.id).join(', '))); }
	return lines;
}

/** Explain a concrete reverse-reference step, keeping ownership context separate from dependents. */
export function impactReason(model: SemanticModel, entry: ReturnType<typeof getModelImpact>['dependents'][number]): string {
	const target = model.semantics.elements.find(element => element.id === entry.via.targetId)!;
	if (entry.via.kind === 'contract') { return localize('ade.impact.contractReference', "Shared contract reference to {0}", target.name); }
	if (entry.via.kind === 'module') { return localize('ade.impact.moduleReference', "Shared module reference to {0}", target.name); }
	if (entry.via.kind === 'authorization') { return localize('ade.impact.authorizationReference', "Authorization reference to {0} · {1}", target.name, entry.via.capability); }
	const { kind, name } = entry.via.relation;
	return name
		? localize('ade.impact.namedRelationReason', "{0} to {1} · {2}", relationLabels[kind], target.name, name)
		: localize('ade.impact.unnamedRelationReason', "{0} to {1}", relationLabels[kind], target.name);
}

export function describeChangeImpact(model: SemanticModel, id: string): string[] {
	const impact = getModelImpact(model, id);
	const elements = new Map(model.semantics.elements.map(element => [element.id, element]));
	const lines = [localize('ade.impact.title', "Change Impact: {0}", impact.subject.name),
		impactScopeDescription,
		localize('ade.impact.scope', "Selected Scope: {0}", impact.scope.map(element => element.name).join(', ')),
		localize('ade.impact.dependents', "Potential Dependents: {0}", impact.dependents.length)];
	for (const entry of impact.dependents) { lines.push(localize('ade.impact.dependentWithDistance', "{0} · {1} · Reference Distance: {2}", entry.element.name, impactReason(model, entry), entry.distance)); }
	lines.push(localize('ade.impact.owners', "Ownership Context: {0}", impact.owners.map(element => element.name).join(', ')),
		localize('ade.impact.views', "Diagrams to Review: {0}", impact.views.map(view => view.name).join(', ')),
		localize('ade.impact.uncertain', "Unclassified Relationships Not Propagated: {0}", impact.unclassified.length));
	for (const relation of impact.relationships) {
		lines.push(localize('ade.impact.relationship', "{0} → {1}: {2} · {3}", elements.get(relation.from)!.name, elements.get(relation.to)!.name, relationLabels[relation.kind], relation.name));
		if (relation.classification) { lines.push(localize('ade.impact.unclassifiedRelation', "Unclassified relationship: excluded from propagation.")); }
		if (relation.condition) { lines.push(localize('ade.impact.condition', "Condition: {0}", relation.condition)); }
		if (relation.errorCode) { lines.push(localize('ade.impact.error', "Error: {0}", relation.errorCode)); }
	}
	for (const evidence of impact.evidence) { lines.push('', ...describeRecordedEvidence(model, evidence.element.id)); }
	return lines;
}
