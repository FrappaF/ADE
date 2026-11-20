import { isDisclosableSource } from './context.ts';
import { validPlan, type FeatureContext, type ImplementationPlan } from './contracts.ts';

/** Rejects invented identities, out-of-scope modifications and ungrounded acceptance tests. */
export function readImplementationPlan(value: unknown, context: FeatureContext): ImplementationPlan {
	if (!validPlan(value)) { throw new Error('Provider returned an invalid implementation plan'); }
	const elements = new Set([...context.elements.map(element => element.id), ...context.sources.flatMap(source => source.declarations.map(declaration => declaration.id))]);
	const files = new Set(context.sources.map(source => source.file));
	const changed = new Set<string>();
	for (const change of value.changes) {
		if (!isDisclosableSource(change.file) || changed.has(change.file) || (change.kind === 'create' ? files.has(change.file) : !files.has(change.file))) {
			throw new Error('Plan changes are duplicated or outside the reviewed source scope');
		}
		changed.add(change.file);
		if (change.elementIds.some(id => !elements.has(id))) { throw new Error('Plan references an unknown element'); }
	}
	const stepIds = new Set<string>();
	for (const step of value.steps) {
		if (stepIds.has(step.id)) { throw new Error('Plan step IDs must be unique'); }
		stepIds.add(step.id);
		if (step.elementIds.some(id => !elements.has(id)) || step.sourceFiles.some(file => !files.has(file) && !changed.has(file))) {
			throw new Error('Plan step references an unknown element or source file');
		}
	}
	for (const test of value.tests) {
		if (!context.elements.find(element => element.id === test.elementId)?.behavior?.acceptanceCriteria.some(criterion => criterion.id === test.criterionId)) {
			throw new Error('Plan test references an unknown acceptance criterion');
		}
	}
	if (!value.questions.length && !value.tests.length) { throw new Error('An actionable plan must include acceptance tests'); }
	// Open questions are a valid proposal, but never an executable or successful implementation.
	return structuredClone(value);
}
