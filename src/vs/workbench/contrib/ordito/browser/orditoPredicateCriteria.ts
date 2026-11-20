import { localize } from '../../../../nls.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { type IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { type ProjectCriteria, type PredicateCase } from '../common/modelProject.js';
import { type SemanticModelV4 } from '../common/modelTypes.js';
import { type ModelValue } from '../common/modelValues.js';
import { canonicalJson } from '../common/modelSerialization.js';
import { orditoTypedValues } from './orditoTypedValues.js';

type Dialogs = Pick<IQuickInputService, 'pick' | 'input'>;
const outcomes: { label: string; value: PredicateCase['expected'] }[] = [
	{ label: localize('ordito.pure.true', "Satisfied"), value: true },
	{ label: localize('ordito.pure.false', "Not Satisfied"), value: false },
	{ label: localize('ordito.pure.unknown', "Indeterminate"), value: null },
	{ label: localize('ordito.pure.error', "Input Type Error"), value: 'typeError' },
	{ label: localize('ordito.expression.zero', "Division by Zero"), value: 'arithmeticZero' },
	{ label: localize('ordito.expression.precision', "Nonintegral Result or Integer Overflow"), value: 'arithmeticPrecision' }
];

/** Inputs and expected outcomes are authored independently; this editor never executes the predicate. */
export async function editOrditoPredicateCriteria(quick: Dialogs, model: SemanticModelV4, previous: ProjectCriteria): Promise<ProjectCriteria | undefined> {
	const names = new Map([...model.foundation.blueprint?.operations.flatMap(operation => [...operation.inputs, ...operation.outputs]) ?? [], ...model.foundation.types.flatMap(type => type.fields)].map(field => [field.id ?? field.name, field.name]));
	const describe = (value: ModelValue): string => Array.isArray(value) ? value.map(describe).join(', ') : value && typeof value === 'object' ? Object.entries(value).map(([id, child]) => `${names.get(id) ?? id}: ${describe(child)}`).join(' · ') : value === null ? localize('ordito.criteria.null', "Null") : value === true ? localize('ordito.criteria.true', "True") : value === false ? localize('ordito.criteria.false', "False") : String(value);
	const chosen = await quick.pick([{ label: localize('ordito.criteria.addPredicate', "Add Predicate Test Case"), entry: undefined }, ...previous.cases.map(entry => ({ label: entry.id, description: describe(entry.input), entry: entry as PredicateCase | undefined }))], { title: localize('ordito.pure.criteria', "Independent Business Expectations") }); if (!chosen) { return; }
	let entry = chosen.entry ? structuredClone(chosen.entry) : undefined;
	let change: 'input' | 'expected' | 'new' = 'new';
	if (entry) {
		const action = await quick.pick([{ label: localize('ordito.criteria.inputs', "Edit Inputs"), value: 'input' as const }, { label: localize('ordito.criteria.expectedEdit', "Edit Expected Result"), value: 'expected' as const }, { label: localize('ordito.criteria.delete', "Delete Case"), value: 'delete' as const }], { title: entry.id }); if (!action) { return; }
		if (action.value === 'delete') {
			const choices = [{ label: localize('ordito.criteria.keep', "Keep Case"), remove: false }, { label: localize('ordito.criteria.delete', "Delete Case"), remove: true }];
			if (!(await quick.pick(choices, { title: localize('ordito.criteria.deleteConfirm', "Delete Case: {0}?", entry.id), activeItem: choices[0] }))?.remove) { return; }
			const id = entry.id;
			return { ...structuredClone(previous), cases: previous.cases.filter(current => current.id !== id), revision: generateUuid() };
		}
		change = action.value;
	} else {
		const candidates = (model.foundation.predicates ?? []).flatMap(predicate => {
			const operation = model.foundation.blueprint?.operations.find(operation => operation.id === predicate.operationId);
			return operation?.acceptanceCriteria.length ? [{ label: operation.name, description: predicate.phase === 'pre' ? localize('ordito.predicate.pre', "Precondition · Inputs Only") : localize('ordito.predicate.post', "Postcondition · Inputs and Outputs"), predicate, operation }] : [];
		});
		if (!candidates.length) { throw new Error(localize('ordito.criteria.prerequisite', "Add a Predicate and an Acceptance Criterion to the Operation Before Creating a Test Case.")); }
		const target = candidates.length === 1 ? candidates[0] : await quick.pick(candidates, { title: localize('ordito.criteria.predicateTarget', "Predicate to Test") });
		if (!target) { return; }
		const criteria = target.operation.acceptanceCriteria;
		const criterion = criteria.length === 1 ? criteria[0] : (await quick.pick(criteria.map(criterion => ({ label: criterion.then, criterion })), { title: localize('ordito.criteria.criterion', "Business Criterion") }))?.criterion;
		if (!criterion) { return; }
		const name = await quick.input({
			title: localize('ordito.criteria.name', "Independent Case Name"),
			prompt: localize('ordito.criteria.nameScope', "Case for {0} · {1}", target.operation.name, criterion.then),
			showConfirmButton: true,
			validateInput: async value => !value.trim() ? localize('ordito.criteria.nameRequired', "Enter a case name.") : previous.cases.some(entry => entry.id === value.trim()) ? localize('ordito.criteria.duplicateName', "A case with this name already exists.") : undefined
		});
		if (name === undefined) { return; }
		entry = { id: name.trim(), predicateId: target.predicate.id, criterionId: criterion.id, input: {}, expected: null };
	}
	if (change === 'new' || change === 'input') {
		const predicate = model.foundation.predicates?.find(predicate => predicate.id === entry.predicateId);
		const operation = model.foundation.blueprint?.operations.find(operation => operation.id === predicate?.operationId);
		if (!predicate || !operation) { throw new Error(localize('ordito.criteria.missingTarget', "The Predicate or Operation Is No Longer Available. Reopen the Current Model.")); }
		const input = await orditoTypedValues(quick, model, { negativeCases: true }).fields([...operation.inputs, ...(predicate.phase === 'post' ? operation.outputs : [])], 0, change === 'new' ? undefined : entry.input); if (!input) { return; } entry.input = input;
	}
	if (change === 'new' || change === 'expected') {
		const current = change === 'new' ? undefined : outcomes.find(outcome => outcome.value === entry.expected);
		const expected = await quick.pick(outcomes, { title: localize('ordito.pure.expected', "Expected Result · Independent of the Generator"), activeItem: current, placeHolder: current ? localize('ordito.pure.currentExpected', "Current expectation: {0}", current.label) : undefined }); if (!expected) { return; } entry.expected = expected.value;
	}
	const cases = chosen.entry ? previous.cases.map(current => current.id === entry.id ? entry : current) : [...previous.cases, entry];
	return canonicalJson(cases) === canonicalJson(previous.cases) ? undefined : { ...structuredClone(previous), cases, revision: generateUuid() };
}
