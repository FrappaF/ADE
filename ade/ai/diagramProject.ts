/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { applyDiagramProposal, type DiagramProposal, type ModelPatch } from '../../src/vs/workbench/contrib/ade/common/modelProposals.ts';
import { type ModelView, type SemanticModelV4 } from '../../src/vs/workbench/contrib/ade/common/modelTypes.ts';
import { canonicalJson } from '../../src/vs/workbench/contrib/ade/common/modelSerialization.ts';
import { contentHash } from '../runtime/sourceChanges.ts';

export interface DiagramPlanItem { id: string; name: string; viewKind: ModelView['kind']; intent: string; rationale: string; parentId?: string; dependsOn: string[] }
export interface DiagramPlan { revision: string; items: DiagramPlanItem[] }
export interface DiagramProjectTask { id: string; status: string; proposalId?: string; gaps: string[] }

/** Corrections occupy the original draft's position so later dependent views can be replayed. */
export function projectDrafts(proposals: DiagramProposal[]): DiagramProposal[] {
	const replacements = new Set(proposals.flatMap(proposal => proposal.supersededBy ? [proposal.supersededBy] : []));
	return proposals.filter(proposal => !replacements.has(proposal.id)).map(proposal => {
		for (let count = 0; proposal.supersededBy && count < proposals.length; count++) { proposal = proposals.find(entry => entry.id === proposal.supersededBy)!; }
		return proposal;
	}).filter(proposal => proposal.status !== 'applied' && !proposal.excludedByPlan);
}

/** Rebuild the unpublished model while keeping invalid/dependent drafts available for repair. */
export function stageDiagramProject(base: SemanticModelV4, proposals: DiagramProposal[], beforeId?: string) {
	let model = base;
	const blockers: string[] = [];
	for (const proposal of projectDrafts(proposals)) {
		if (proposal.id === beforeId) { break; }
		try { model = applyDiagramProposal(model, proposal); }
		catch (error) { blockers.push(`${proposal.id}: ${error instanceof Error ? error.message : String(error)}`); }
	}
	return { model, blockers };
}

/** Plans are bounded dependency graphs, ordered from context toward detail. */
export function validateDiagramPlan(items: DiagramPlanItem[]): DiagramPlan {
	if (!items.length || items.length > 40 || new Set(items.map(item => item.id)).size !== items.length) { throw new Error('invalidDiagramPlan'); }
	const visited = new Set<string>(), active = new Set<string>();
	const visit = (id: string) => {
		const item = items.find(item => item.id === id);
		if (!item) { throw new Error('unknownPlanDependency:' + id); }
		if (active.has(id)) { throw new Error('diagramPlanCycle:' + id); }
		if (visited.has(id)) { return; }
		active.add(id);
		for (const dependency of [...item.dependsOn, ...(item.parentId ? [item.parentId] : [])]) { visit(dependency); }
		active.delete(id); visited.add(id);
	};
	for (const item of items) { visit(item.id); }
	const ordered = [...visited].map(id => items.find(item => item.id === id)!);
	return { revision: contentHash(canonicalJson(ordered)), items: structuredClone(ordered) };
}

/** A final review includes every live draft and accounts for every planned view, including explicit exclusions. */
export function diagramProjectBlockers(plan: DiagramPlan | undefined, tasks: DiagramProjectTask[], proposals: DiagramProposal[]): string[] {
	if (!plan) { return ['diagramPlanRequired']; }
	const drafts = projectDrafts(proposals), blockers: string[] = [];
	if (!drafts.length && tasks.some(task => task.status === 'applied') && plan.items.every(item => tasks.some(task => task.id === item.id && ['applied', 'cancelled'].includes(task.status)))) { return []; }
	if (!drafts.length) { blockers.push('noDiagramDrafts'); }
	for (const item of plan.items) {
		const task = tasks.find(task => task.id === item.id);
		if (task?.status === 'cancelled' && task.gaps.length) { continue; }
		const proposal = drafts.find(proposal => proposal.id === task?.proposalId);
		if (!task || task.status !== 'ready' || !proposal || proposal.status !== 'ready' || !proposal.patch.some(patch => patch.collection === 'views' && (patch.value as ModelView | null)?.kind === item.viewKind && (patch.value as ModelView).name === item.name)) { blockers.push('plannedDiagramIncomplete:' + item.id); }
	}
	const assigned = tasks.filter(task => task.status === 'ready' && plan.items.some(item => item.id === task.id)).map(task => task.proposalId);
	if (new Set(assigned).size !== assigned.length) { blockers.push('duplicatePlannedProposal'); }
	for (const draft of drafts) {
		if (draft.status !== 'ready') { blockers.push('invalidDraft:' + draft.id); }
		if (!plan.items.some(item => tasks.some(task => task.id === item.id && task.proposalId === draft.id && task.status === 'ready'))) { blockers.push('unplannedDraft:' + draft.id); }
	}
	return blockers;
}

/** Collapse sequential writes into one review diff; publication still verifies/replays each original draft. */
export function diagramProjectProposal(baseRevision: string, plan: DiagramPlan | undefined, tasks: DiagramProjectTask[], proposals: DiagramProposal[], blockers: string[]): DiagramProposal {
	const drafts = projectDrafts(proposals), patches = new Map<string, ModelPatch>();
	for (const draft of drafts) {
		for (const patch of draft.patch) {
			const key = patch.collection + ':' + patch.id, previous = patches.get(key);
			patches.set(key, { ...patch, before: previous ? previous.before : patch.before });
		}
	}
	const seal = contentHash(canonicalJson({ baseRevision, plan: plan ?? null, tasks, drafts: drafts.map(draft => ({ id: draft.id, fingerprint: draft.fingerprint, status: draft.status, patch: draft.patch, readSet: draft.readSet, readEvidenceIds: draft.readEvidenceIds, queryIds: draft.queryIds })) }));
	return { version: 2, id: seal, fingerprint: seal, baseSemanticRevision: baseRevision, aliases: {}, readSet: [], readEvidenceIds: [...new Set(drafts.flatMap(draft => draft.readEvidenceIds))], queryIds: [...new Set(drafts.flatMap(draft => draft.queryIds))], patch: [...patches.values()], status: blockers.length ? 'invalid' : 'ready', diagnostics: blockers.map(code => ({ code: 'contract', severity: 'error', path: '/project', args: [code] })) };
}
