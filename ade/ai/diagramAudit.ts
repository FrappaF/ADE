/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { explorationPage, sourceRole } from '../code-import/explorationIndex.ts';
import type { CodeImport } from '../code-import/importCode.ts';
import { contentHash } from '../runtime/sourceChanges.ts';
import { canonicalJson, semanticContent } from '../../src/vs/workbench/contrib/ade/common/modelSerialization.ts';
import type { ModelPatch } from '../../src/vs/workbench/contrib/ade/common/modelProposals.ts';
import type { SemanticModelV4 } from '../../src/vs/workbench/contrib/ade/common/modelTypes.ts';

interface PageRequest { cursor?: string; limit?: number }

function viewContent(model: SemanticModelV4) {
	return model.views.map(({ spec, nodes, ...view }) => ({ ...view, elementIds: nodes.map(node => node.elementId), intent: spec?.intent ?? '' }));
}

/** Audit the diagram selections and intent as well as the semantic objects they reference. */
export function auditDraftRevision(model: SemanticModelV4): string {
	return contentHash(canonicalJson({ model: semanticContent(model), views: viewContent(model) }));
}

/** A correction must change the modeled content, not just its provenance or layout revisions. */
export function auditCorrectionContent(model: SemanticModelV4): string {
	const { ownership, memberships, interactions, occurrences, frames } = model.foundation;
	return canonicalJson({ semantics: model.semantics, views: viewContent(model), ownership, memberships, interactions, occurrences, frames });
}

/** Repairs can change a view directly or change objects projected into that view. */
export function auditTouchesViews(model: SemanticModelV4, patches: ModelPatch[], viewIds: string[]): boolean {
	const refs = new Set<string>(viewIds);
	for (const view of model.views.filter(view => viewIds.includes(view.id))) {
		for (const id of [...view.nodes.map(node => node.elementId), ...view.relationIds, ...view.contextIds ?? [], view.subjectId, view.featureId, view.interactionId]) { if (id) { refs.add(id); } }
		const interaction = model.foundation.interactions.find(entry => entry.id === view.interactionId);
		for (const id of [...interaction?.occurrenceIds ?? [], ...interaction?.frameIds ?? [], ...interaction?.description?.participantIds ?? []]) { refs.add(id); }
	}
	return patches.some(patch => {
		if (refs.has(patch.id)) { return true; }
		if (patch.collection !== 'ownership' && patch.collection !== 'memberships') { return false; }
		const entry = patch.value as { elementId: string; ownerId?: string; featureId?: string } | null;
		return !!entry && [entry.elementId, entry.ownerId, entry.featureId].some(id => id && refs.has(id));
	});
}

/** Give the reviewer a single inventory for comparing the generated set with imported source. */
export function auditInventory(state: CodeImport, model: SemanticModelV4, input: PageRequest) {
	const files = state.files.map(file => ({ file: file.file, revision: file.revision, status: file.status, role: sourceRole(file.file) }));
	return {
		files: explorationPage(files, state.revision, { audit: 'files' }, input.cursor, input.limit ?? 25),
		views: model.views.map(({ id, name, kind, featureId, interactionId }) => ({ id, name: name.slice(0, 250), kind, featureId, interactionId })),
	};
}

/** Include behavior and evidence alongside the view's canonical references. */
export function auditDiagram(model: SemanticModelV4, input: PageRequest & { viewId: string }) {
	const view = model.views.find(view => view.id === input.viewId);
	if (!view) { throw new Error('unknownAuditView:' + input.viewId); }
	const interaction = model.foundation.interactions.find(entry => entry.id === view.interactionId);
	const participants = new Set([...view.nodes.map(node => node.elementId), ...interaction?.description?.participantIds ?? []]);
	const elements = model.semantics.elements.filter(entry => participants.has(entry.id));
	const relations = model.semantics.relations.filter(entry => view.relationIds.includes(entry.id));
	const occurrences = model.foundation.occurrences.filter(entry => interaction?.occurrenceIds.includes(entry.id));
	const frames = model.foundation.frames.filter(entry => interaction?.frameIds.includes(entry.id));
	const objects = [...elements, ...relations, ...occurrences, ...frames];
	const subjectIds = new Set([view.id, interaction?.id, ...objects.map(entry => entry.id)]);
	const assertions = model.foundation.assertions.filter(entry => subjectIds.has(entry.subject.id));
	const evidenceIds = new Set([...(interaction?.description?.evidenceIds ?? []), ...occurrences.flatMap(entry => entry.evidenceIds ?? []), ...assertions.flatMap(entry => entry.evidenceIds ?? [])]);
	for (const frame of frames) {
		if (frame.kind === 'unspecified') { for (const operand of frame.description?.operands ?? []) { for (const id of operand.evidenceIds) { evidenceIds.add(id); } } }
	}
	const entries = [
		...elements.map(value => ({ collection: 'elements', value })), ...relations.map(value => ({ collection: 'relations', value })),
		...model.foundation.ownership.filter(entry => participants.has(entry.elementId)).map(value => ({ collection: 'ownership', value })),
		...model.foundation.memberships.filter(entry => participants.has(entry.elementId)).map(value => ({ collection: 'memberships', value })),
		...occurrences.map(value => ({ collection: 'occurrences', value })), ...frames.map(value => ({ collection: 'frames', value })),
		...(interaction?.description?.order ?? []).map(value => ({ collection: 'order', value })),
		...assertions.map(value => ({ collection: 'assertions', value })),
		...(model.foundation.evidence ?? []).filter(entry => evidenceIds.has(entry.id)).map(value => ({ collection: 'evidence', value })),
	];
	const description = interaction?.description;
	return { view, interaction: interaction && { id: interaction.id, profile: interaction.profile, trigger: description?.trigger, scope: description?.scope, participantIds: description?.participantIds, occurrenceIds: interaction.occurrenceIds, frameIds: interaction.frameIds }, objects: explorationPage(entries, contentHash(canonicalJson(entries)), { audit: 'diagram', viewId: view.id }, input.cursor, input.limit ?? 20) };
}

/** Show actual UUID reuse and possible duplicates, leaving equivalence to source review. */
export function auditReuse(model: SemanticModelV4, input: PageRequest) {
	const usage = new Map<string, Set<string>>();
	for (const view of model.views) {
		const interaction = model.foundation.interactions.find(entry => entry.id === view.interactionId);
		for (const id of [...view.nodes.map(node => node.elementId), ...view.relationIds, ...interaction?.description?.participantIds ?? []]) {
			let views = usage.get(id);
			if (!views) { usage.set(id, views = new Set()); }
			views.add(view.id);
		}
	}
	const evidence = Map.groupBy(model.foundation.assertions, entry => entry.subject.id);
	const describe = (entry: { id: string; name: string; kind: string }, collection: 'element' | 'relation') => ({
		id: entry.id, name: entry.name, kind: entry.kind, collection, viewIds: [...usage.get(entry.id) ?? []],
		evidenceIds: [...new Set(evidence.get(entry.id)?.flatMap(assertion => assertion.evidenceIds ?? []))].slice(0, 20),
	});
	const entries = [
		...model.semantics.elements.map(entry => ({ ...describe(entry, 'element') })),
		...model.semantics.relations.map(entry => ({ ...describe({ ...entry, name: entry.name ?? '' }, 'relation'), from: entry.from, to: entry.to })),
	];
	const names = Map.groupBy(entries, entry => `${entry.collection}:${entry.kind}:${entry.name.trim().toLowerCase()}`);
	const objects = entries.map(entry => ({ ...entry, sameNameIds: (names.get(`${entry.collection}:${entry.kind}:${entry.name.trim().toLowerCase()}`) ?? []).filter(other => other.id !== entry.id).map(other => other.id).slice(0, 20) }));
	return { sharedElements: objects.filter(entry => entry.collection === 'element' && entry.viewIds.length > 1).length, sharedRelations: objects.filter(entry => entry.collection === 'relation' && entry.viewIds.length > 1).length, objects: explorationPage(objects, contentHash(canonicalJson(objects)), { audit: 'reuse' }, input.cursor, input.limit ?? 25) };
}
