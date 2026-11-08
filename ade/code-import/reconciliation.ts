/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isDeepStrictEqual } from 'node:util';
import type { SemanticModel } from '../../src/vs/workbench/contrib/ade/common/semanticModel.ts';
import type { CodeImport } from './importCode.ts';
import type { ImportSnapshot } from './snapshot.ts';
import { prepareSync, type SyncResolution } from './syncCode.ts';
import type { SourceMutation } from './sourceChanges.ts';
import { getModelImpact } from '../../src/vs/workbench/contrib/ade/common/modelImpact.ts';

/** Language-neutral reconciliation state. Deterministic tools supply evidence, never an implementation. */
export interface Reconciliation {
	report: ReturnType<typeof prepareSync>['report'];
	model?: SemanticModel;
	mutations: SourceMutation[];
	status: 'aligned' | 'pending' | 'conflict' | 'verificationFailed';
	origin: 'model' | 'code' | 'both' | 'none';
	diagnostics: string[];
	aiReviewed: boolean;
}

/** Layout and serialization changes do not request a model call or rewrite source. */
export function prepareReconciliation(previous: ImportSnapshot, next: CodeImport, resolutions: SyncResolution[] = []): Reconciliation {
	const modelChanged = !isDeepStrictEqual(previous.commonModel.semantics, previous.model.semantics);
	const codeChanged = next.revision !== previous.state.revision;
	const prepared = prepareSync(previous.state, previous.model, next, resolutions);
	// Source-owned lists are compared with a raw index by prepareSync. An AI-selected
	// semantic baseline may intentionally omit those entries or assign different roles.
	// Only edits relative to that semantic baseline are manual conflicts.
	prepared.report.conflicts = prepared.report.conflicts.filter(conflict => {
		if (conflict.code !== 'manualEdit') { return true; }
		const parts = conflict.path.split('/').slice(1);
		const collection = parts[0] === 'semantics' ? parts[1] : parts[0];
		if (!['elements', 'relations', 'views', 'codeMappings'].includes(collection)) { return true; }
		const offset = parts[0] === 'semantics' ? 2 : 1, id = parts[offset];
		const list = (model: SemanticModel): { id: string }[] => collection === 'elements' || collection === 'relations' ? model.semantics[collection] : collection === 'views' ? model.views : model.codeMappings;
		const raw = list(previous.state.model).find(item => item.id === id), common = list(previous.commonModel).find(item => item.id === id), current = list(previous.model).find(item => item.id === id);
		const field = (value: unknown): unknown => parts.slice(offset + 1).reduce<unknown>((value, part) => value && typeof value === 'object' ? Reflect.get(value, part) : undefined, value);
		return !raw || isDeepStrictEqual(raw, common) || !isDeepStrictEqual(field(current), field(common));
	});
	const declarations = new Map(next.files.flatMap(file => file.declarations.map(item => [item.id, item])));
	for (const before of previous.state.files.flatMap(file => file.declarations)) {
		const common = previous.commonModel.semantics.elements.find(item => item.id === before.id);
		const model = previous.model.semantics.elements.find(item => item.id === before.id);
		const code = declarations.get(before.id);
		if (!common || !model || !code) { continue; }
		const behaviorChanged = !isDeepStrictEqual(common.behavior, model.behavior);
		if (behaviorChanged && before.evidence.revision !== code.evidence.revision) {
			prepared.report.conflicts.push({ code: 'concurrentContract', path: `/semantics/elements/${before.id}/behavior`, base: JSON.stringify({ behavior: common.behavior, header: before.header }), current: JSON.stringify(model.behavior), incoming: code.header, choices: ['model', 'code'] });
		}
	}
	if (modelChanged) {
		const elements = new Set(prepared.report.impact.elementIds), views = new Set(prepared.report.impact.viewIds);
		for (const element of previous.model.semantics.elements.filter(item => !isDeepStrictEqual(item, previous.commonModel.semantics.elements.find(old => old.id === item.id)))) {
			const report = getModelImpact(previous.model, element.id);
			for (const item of [...report.scope, ...report.dependents.map(entry => entry.element)]) { elements.add(item.id); }
			for (const item of report.views) { views.add(item.id); }
		}
		prepared.report.impact = { elementIds: [...elements], viewIds: [...views] };
	}
	const origin = modelChanged ? codeChanged ? 'both' : 'model' : codeChanged ? 'code' : 'none';
	return { report: prepared.report, mutations: [], status: origin === 'none' ? 'aligned' : prepared.report.conflicts.length ? 'conflict' : 'pending', origin, diagnostics: [], aiReviewed: false };
}
