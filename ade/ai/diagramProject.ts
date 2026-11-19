/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { applyDiagramProposal, type DiagramProposal, type ModelPatch } from '../../src/vs/workbench/contrib/ade/common/modelProposals.ts';
import { type ModelView, type SemanticModelV4 } from '../../src/vs/workbench/contrib/ade/common/modelTypes.ts';
import { canonicalJson } from '../../src/vs/workbench/contrib/ade/common/modelSerialization.ts';
import { contentHash } from '../runtime/sourceChanges.ts';

export interface DiagramFeature { id: string; name: string; description: string; evidenceIds: string[]; dependsOn: string[]; elementId?: string }
export interface DiagramFeatureCatalog { revision: string; features: DiagramFeature[] }
export interface DiagramFeaturePlan { featureId?: string; gaps: string[] }
export interface DiagramPlanItem { id: string; name: string; viewKind: ModelView['kind']; intent: string; rationale: string; parentId?: string; dependsOn: string[]; featureId?: string }
export interface DiagramPlan { revision: string; items: DiagramPlanItem[] }
export interface DiagramProjectTask { id: string; status: string; proposalId?: string; gaps: string[] }

/** The catalog's order is deterministic and puts each dependency before its consumers. */
export function diagramFeatureCatalog(features: DiagramFeature[]): DiagramFeatureCatalog {
	const byId = new Map(features.map(feature => [feature.id, feature]));
	const names = new Set(features.map(feature => feature.name.trim().toLowerCase()));
	const elements = features.flatMap(feature => feature.elementId ? [feature.elementId] : []);
	if (features.length > 40 || byId.size !== features.length || names.size !== features.length || new Set(elements).size !== elements.length || features.some(feature => !feature.name.trim() || !feature.description.trim() || !feature.evidenceIds.length)) { throw new Error('invalidFeatureCatalog'); }
	const ordered: DiagramFeature[] = [], visiting = new Set<string>(), visited = new Set<string>();
	const visit = (id: string) => {
		if (visited.has(id)) { return; }
		const feature = byId.get(id);
		if (!feature) { throw new Error('unknownFeatureDependency:' + id); }
		if (visiting.has(id)) { throw new Error('featureCatalogCycle:' + id); }
		visiting.add(id);
		for (const dependency of feature.dependsOn) { visit(dependency); }
		visiting.delete(id);
		visited.add(id);
		ordered.push(feature);
	};
	for (const feature of features) { visit(feature.id); }
	return { revision: contentHash(canonicalJson(ordered)), features: structuredClone(ordered) };
}

/** Each feature finishes its plan and diagrams before the next feature is opened. */
export function diagramFeatureStage(catalog: DiagramFeatureCatalog | undefined, featurePlans: DiagramFeaturePlan[], plan: DiagramPlan | undefined, tasks: DiagramProjectTask[]): { phase: 'discovery' | 'planning' | 'diagrams' | 'review'; nextFeatureId?: string; nextTaskId?: string } {
	if (!catalog) { return { phase: 'discovery' }; }
	for (const featureId of [undefined, ...catalog.features.map(feature => feature.id)]) {
		const feature = featureId ? { nextFeatureId: featureId } : {};
		if (!featurePlans.some(item => item.featureId === featureId)) { return { phase: 'planning', ...feature }; }
		const next = plan?.items.find(item => item.featureId === featureId && !tasks.some(task => task.id === item.id && ['ready', 'applied', 'cancelled'].includes(task.status)));
		if (next) { return { phase: 'diagrams', ...feature, nextTaskId: next.id }; }
	}
	return { phase: 'review' };
}

/** Corrections occupy the original draft's position so later dependent views can be replayed. */
export function projectDrafts(proposals: DiagramProposal[]): DiagramProposal[] {
	const replacements = new Set(proposals.flatMap(proposal => proposal.supersededBy ? [proposal.supersededBy] : []));
	return proposals.filter(proposal => !replacements.has(proposal.id)).map(proposal => {
		for (let count = 0; proposal.supersededBy && count < proposals.length; count++) { proposal = proposals.find(entry => entry.id === proposal.supersededBy)!; }
		return proposal;
	}).filter(proposal => proposal.status !== 'applied' && !proposal.excludedByPlan && !proposal.discardedReason);
}

/** Rebuild the unpublished model while keeping invalid/dependent drafts available for repair. */
export function stageDiagramProject(base: SemanticModelV4, proposals: DiagramProposal[], beforeId?: string) {
	let model = base;
	const blockers: string[] = [];
	const blockedProposalIds: string[] = [];
	for (const proposal of projectDrafts(proposals)) {
		if (proposal.id === beforeId) { break; }
		try { model = applyDiagramProposal(model, proposal); }
		catch (error) { blockers.push(`${proposal.id}: ${error instanceof Error ? error.message : String(error)}`); blockedProposalIds.push(proposal.id); }
	}
	return { model, blockers, blockedProposalIds };
}

/** Plans are bounded dependency graphs, ordered from context toward detail. */
export function validateDiagramPlan(items: DiagramPlanItem[], catalog?: DiagramFeatureCatalog): DiagramPlan {
	if ((!catalog && !items.length) || items.length > (catalog ? 100 : 40) || new Set(items.map(item => item.id)).size !== items.length) { throw new Error('invalidDiagramPlan'); }
	const groups = new Map([undefined, ...catalog?.features.map(feature => feature.id) ?? []].map((id, index) => [id, index]));
	if (items.some(item => !groups.has(item.featureId))) { throw new Error('unknownPlannedFeature'); }
	const byId = new Map(items.map(item => [item.id, item]));
	const visited = new Set<string>(), active = new Set<string>();
	const visit = (id: string) => {
		const item = byId.get(id);
		if (!item) { throw new Error('unknownPlanDependency:' + id); }
		if (active.has(id)) { throw new Error('diagramPlanCycle:' + id); }
		if (visited.has(id)) { return; }
		active.add(id);
		for (const dependency of [...item.dependsOn, ...(item.parentId ? [item.parentId] : [])]) {
			const prerequisite = byId.get(dependency);
			if (prerequisite && groups.get(prerequisite.featureId)! > groups.get(item.featureId)!) { throw new Error('diagramDependencyOrder:' + dependency); }
			visit(dependency);
		}
		active.delete(id); visited.add(id);
	};
	for (const item of [...items].sort((a, b) => groups.get(a.featureId)! - groups.get(b.featureId)!)) { visit(item.id); }
	const ordered = [...visited].map(id => byId.get(id)!);
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
		if (task?.status === 'applied') { continue; }
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
export function diagramProjectProposal(baseRevision: string, plan: DiagramPlan | undefined, tasks: DiagramProjectTask[], proposals: DiagramProposal[], blockers: string[], featureState?: object): DiagramProposal {
	const drafts = projectDrafts(proposals), patches = new Map<string, ModelPatch>();
	for (const draft of drafts) {
		for (const patch of draft.patch) {
			const key = patch.collection + ':' + patch.id, previous = patches.get(key);
			patches.set(key, { ...patch, before: previous ? previous.before : patch.before });
		}
	}
	const seal = contentHash(canonicalJson({ baseRevision, plan: plan ?? null, tasks, ...(featureState ? { featureState } : {}), drafts: drafts.map(draft => ({ id: draft.id, fingerprint: draft.fingerprint, status: draft.status, patch: draft.patch, readSet: draft.readSet, readEvidenceIds: draft.readEvidenceIds, queryIds: draft.queryIds })) }));
	return { version: 2, id: seal, fingerprint: seal, baseSemanticRevision: baseRevision, aliases: {}, readSet: [], readEvidenceIds: [...new Set(drafts.flatMap(draft => draft.readEvidenceIds))], queryIds: [...new Set(drafts.flatMap(draft => draft.queryIds))], patch: [...patches.values()], status: blockers.length ? 'invalid' : 'ready', diagnostics: blockers.map(code => ({ code: 'contract', severity: 'error', path: '/project', args: [code] })) };
}
