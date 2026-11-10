/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { projectModel, validateProjection, type CodeImport } from './importCode.ts';
import { semanticDependencyId } from './semanticGraph.ts';
import { type SemanticModel } from '../../src/vs/workbench/contrib/ade/common/modelTypes.ts';
import type { ImportSnapshot } from './snapshot.ts';

/** AI proposes identity continuity; deterministic evidence must identify exactly one compatible declaration. */
export function bindReconciliationIdentities(input: CodeImport, model: SemanticModel, bindings: { elementId: string; file: string; name: string; syntaxKind: string }[]): CodeImport {
	const state = structuredClone(input);
	const remap = new Map<string, string>();
	const all = state.files.flatMap(file => file.declarations);
	for (const binding of bindings) {
		const candidates = state.files.find(file => file.file === binding.file)?.declarations.filter(item => item.name === binding.name && item.syntaxKind === binding.syntaxKind) ?? [];
		const designed = model.semantics.elements.find(item => item.id === binding.elementId);
		if (candidates.length !== 1 || !designed || remap.has(candidates[0].id) || [...remap.values()].includes(binding.elementId) || all.some(item => item.id === binding.elementId && item.id !== candidates[0].id)) { throw new Error('AI identity binding is ambiguous or incompatible'); }
		remap.set(candidates[0].id, binding.elementId);
	}
	for (const declaration of all) { declaration.id = remap.get(declaration.id) ?? declaration.id; declaration.parentId = remap.get(declaration.parentId) ?? declaration.parentId; }
	if (state.semantic) {
		for (const binding of state.semantic.bindings) { binding.elementId = remap.get(binding.elementId) ?? binding.elementId; }
		for (const edge of state.semantic.dependencies) { edge.from = remap.get(edge.from) ?? edge.from; edge.to = remap.get(edge.to) ?? edge.to; edge.id = semanticDependencyId(state.projectId, edge.from, edge.to); }
	}
	state.model = projectModel(state.projectId, state.model.name, state.files, state.semantic);
	validateProjection(state);
	return state;
}

/** Syntax does not dictate semantic responsibility or display labels. An explicit binding proves continuity. */
export function verifyReconciliationStructure(state: CodeImport, model: SemanticModel, previous: ImportSnapshot, bindings: { elementId: string }[]): void {
	for (const fact of state.model.semantics.elements) {
		const element = model.semantics.elements.find(item => item.id === fact.id);
		if (!element) {
			// A sealed semantic baseline already accounted for omitted/aggregated implementation details.
			if (!previous.commonModel.semantics.elements.some(item => item.id === fact.id) && previous.state.model.semantics.elements.some(item => item.id === fact.id)) { continue; }
			throw new Error('AI model proposal does not account for new deterministic source structure');
		}
		if (element.name === fact.name && element.kind === fact.kind || bindings.some(item => item.elementId === fact.id)) { continue; }
		const common = previous.commonModel.semantics.elements.find(item => item.id === fact.id);
		const before = previous.state.model.semantics.elements.find(item => item.id === fact.id);
		if (!common || !before || element.name !== common.name || element.kind !== common.kind || fact.name !== before.name || fact.kind !== before.kind) { throw new Error('A semantic label or role needs an explicit AI source binding'); }
	}
}
