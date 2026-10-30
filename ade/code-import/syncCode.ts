/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isDeepStrictEqual } from 'node:util';
import { readSemanticModel, type SemanticModel, type ModelView } from '../../src/vs/workbench/contrib/ade/common/semanticModel.ts';
import { getModelImpact } from '../../src/vs/workbench/contrib/ade/common/modelImpact.ts';
import { validateProjection, type CodeImport } from './importCode.ts';

export interface SyncConflict {
	code: 'manualEdit' | 'identityAmbiguity' | 'incompleteSource' | 'invalidModel' | 'incompleteSemantic';
	path: string;
}

export interface SyncReport {
	fromRevision: string;
	toRevision: string;
	files: { added: string[]; changed: string[]; removed: string[]; unchanged: string[]; renamed: { from: string; to: string }[] };
	declarations: { added: string[]; changed: string[]; removed: string[] };
	dependencies: { added: string[]; changed: string[]; removed: string[] };
	analysis: CodeImport['analysis'];
	/** Review scope from declared model relationships, not resolved code dependencies. */
	impact: { elementIds: string[]; viewIds: string[] };
	conflicts: SyncConflict[];
}

/** Updates only source-owned fields whose previous value has not been edited by the user. */
function mergeFields<T extends object>(base: T, current: T, next: T, path: string, conflicts: SyncConflict[]): T {
	const result = { ...current };
	for (const key of new Set([...Object.keys(base), ...Object.keys(next)]) as Set<keyof T>) {
		if (isDeepStrictEqual(base[key], next[key])) { continue; }
		if (!isDeepStrictEqual(current[key], base[key]) && !isDeepStrictEqual(current[key], next[key])) {
			conflicts.push({ code: 'manualEdit', path: `${path}/${String(key)}` });
		} else if (Object.hasOwn(next, key)) { result[key] = next[key]; }
		else { delete result[key]; }
	}
	return result;
}

/** Keeps manual entries, detects edited deletions and preserves the user's ordering. */
function mergeList<T extends { id: string }>(base: T[], current: T[], next: T[], path: string, conflicts: SyncConflict[], merge = mergeFields<T>): T[] {
	const before = new Map(base.map(item => [item.id, item]));
	const after = new Map(next.map(item => [item.id, item]));
	const present = new Map(current.map(item => [item.id, item]));
	const result: T[] = [];
	for (const item of current) {
		const previous = before.get(item.id);
		const updated = after.get(item.id);
		if (!previous) {
			if (updated) { conflicts.push({ code: 'manualEdit', path: `${path}/${item.id}` }); }
			result.push(item);
		} else if (!updated) {
			if (!isDeepStrictEqual(item, previous)) { conflicts.push({ code: 'manualEdit', path: `${path}/${item.id}` }); }
		} else { result.push(merge(previous, item, updated, `${path}/${item.id}`, conflicts)); }
	}
	for (const item of next) {
		if (present.has(item.id)) { continue; }
		const previous = before.get(item.id);
		if (!previous) { result.push(item); }
		else if (!isDeepStrictEqual(item, previous)) { conflicts.push({ code: 'manualEdit', path: `${path}/${item.id}` }); }
	}
	return result;
}

/** Source diagram membership changes independently of user positions and hidden nodes. */
function mergeView(base: ModelView, current: ModelView, next: ModelView, path: string, conflicts: SyncConflict[]): ModelView {
	const result = mergeFields<ModelView>({ ...base, nodes: [] }, { ...current, nodes: [] }, { ...next, nodes: [] }, path, conflicts);
	const previousIds = new Set(base.nodes.map(node => node.elementId));
	const nextIds = new Set(next.nodes.map(node => node.elementId));
	result.nodes = current.nodes.filter(node => !previousIds.has(node.elementId) || nextIds.has(node.elementId));
	for (const node of next.nodes) {
		if (previousIds.has(node.elementId) || result.nodes.some(item => item.elementId === node.elementId)) { continue; }
		const position = { ...node };
		while (result.nodes.some(item => Math.abs(item.x - position.x) < 240 && Math.abs(item.y - position.y) < 120)) { position.y += 140; }
		result.nodes.push(position);
	}
	return result;
}

/** Prepares one code-to-model update. Conflicts return a report without a replacement model. */
export function prepareSync(previous: CodeImport, currentValue: SemanticModel, next: CodeImport): { report: SyncReport; model?: SemanticModel } {
	validateProjection(previous);
	validateProjection(next);
	const current = readSemanticModel(currentValue);
	if (current.id !== previous.projectId || next.projectId !== previous.projectId || next.sourceRoot !== previous.sourceRoot) { throw new Error('Sync inputs belong to different projects'); }
	const conflicts: SyncConflict[] = [];
	if (next.analysis.semanticInvalidated || (previous.semantic && !next.semantic)) { conflicts.push({ code: 'incompleteSemantic', path: '/semantic' }); }
	const oldFiles = new Map(previous.files.map(file => [file.file, file]));
	const nextFiles = new Map(next.files.map(file => [file.file, file]));
	const renamedFrom = new Set(next.analysis.renamed.map(item => item.from));
	const renamedTo = new Set(next.analysis.renamed.map(item => item.to));
	const oldDeclarations = new Map(previous.files.flatMap(file => file.declarations).map(item => [item.id, item]));
	const nextDeclarations = new Map(next.files.flatMap(file => file.declarations).map(item => [item.id, item]));
	const oldDependencies = new Map(previous.semantic?.dependencies.map(edge => [edge.id, edge]));
	const nextDependencies = new Map(next.semantic?.dependencies.map(edge => [edge.id, edge]));
	const dependencies = {
		added: [...nextDependencies.keys()].filter(id => !oldDependencies.has(id)),
		removed: [...oldDependencies.keys()].filter(id => !nextDependencies.has(id)),
		changed: [...nextDependencies.keys()].filter(id => oldDependencies.has(id) && !isDeepStrictEqual(oldDependencies.get(id), nextDependencies.get(id)))
	};
	const files: SyncReport['files'] = {
		added: next.files.filter(file => !oldFiles.has(file.file) && !renamedTo.has(file.file)).map(file => file.file),
		removed: previous.files.filter(file => !nextFiles.has(file.file) && !renamedFrom.has(file.file)).map(file => file.file),
		changed: next.files.filter(file => oldFiles.has(file.file) && !isDeepStrictEqual(oldFiles.get(file.file), file)).map(file => file.file),
		unchanged: next.files.filter(file => oldFiles.has(file.file) && isDeepStrictEqual(oldFiles.get(file.file), file)).map(file => file.file),
		renamed: next.analysis.renamed
	};
	for (const file of next.files) {
		if (file.status === 'partial' || (oldFiles.get(file.file)?.revision && !file.revision)) { conflicts.push({ code: 'incompleteSource', path: file.file }); }
		if (next.analysis.parsed.includes(file.file) && file.diagnostics.some(item => item.code === 'duplicateName')) { conflicts.push({ code: 'identityAmbiguity', path: file.file }); }
	}
	for (const match of next.analysis.ambiguousRenames) { conflicts.push({ code: 'identityAmbiguity', path: match.from.join(', ') }); }
	const impactElements = new Set<string>();
	const impactViews = new Set<string>();
	const currentIds = new Set(current.semantics.elements.map(element => element.id));
	const impactSeeds = new Set<string>();
	for (const path of [...files.changed, ...files.removed, ...files.renamed.map(item => item.from)]) {
		const file = oldFiles.get(path)!;
		const moduleId = previous.model.codeMappings.find(mapping => mapping.file === path && mapping.symbol === '<module>')?.elementId;
		if (!file.revision || !moduleId || !currentIds.has(moduleId)) { continue; }
		impactSeeds.add(moduleId);
	}
	for (const id of [...dependencies.added, ...dependencies.changed, ...dependencies.removed]) {
		const edge = oldDependencies.get(id) ?? nextDependencies.get(id)!;
		for (const subject of [edge.from, edge.to]) {
			if (!currentIds.has(subject)) { continue; }
			impactSeeds.add(subject);
		}
	}
	const parents = new Map(current.semantics.elements.map(element => [element.id, element.parentId]));
	for (const subject of impactSeeds) {
		let parent = parents.get(subject);
		while (parent && !impactSeeds.has(parent)) { parent = parents.get(parent); }
		if (parent) { continue; }
		const impact = getModelImpact(current, subject);
		for (const item of [...impact.scope, ...impact.dependents.map(entry => entry.element), ...impact.owners]) { impactElements.add(item.id); }
		for (const view of impact.views) { impactViews.add(view.id); }
	}
	const report: SyncReport = {
		fromRevision: previous.revision, toRevision: next.revision, files,
		declarations: {
			added: [...nextDeclarations.keys()].filter(key => !oldDeclarations.has(key)),
			removed: [...oldDeclarations.keys()].filter(key => !nextDeclarations.has(key)),
			changed: [...nextDeclarations.values()].filter(item => oldDeclarations.has(item.id) && !isDeepStrictEqual(oldDeclarations.get(item.id), item)).map(item => item.id)
		},
		dependencies, analysis: next.analysis, impact: { elementIds: [...impactElements], viewIds: [...impactViews] }, conflicts
	};
	if (conflicts.length) { return { report }; }
	const base = previous.model;
	const updated = next.model;
	const model: SemanticModel = {
		...current,
		semantics: {
			elements: mergeList(base.semantics.elements, current.semantics.elements, updated.semantics.elements, '/semantics/elements', conflicts),
			relations: mergeList(base.semantics.relations, current.semantics.relations, updated.semantics.relations, '/semantics/relations', conflicts)
		},
		views: mergeList(base.views, current.views, updated.views, '/views', conflicts, mergeView),
		codeMappings: mergeList(base.codeMappings, current.codeMappings, updated.codeMappings, '/codeMappings', conflicts)
	};
	try { readSemanticModel(model); }
	catch { conflicts.push({ code: 'invalidModel', path: '/' }); }
	return conflicts.length ? { report } : { report, model };
}
