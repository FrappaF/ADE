/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { readSemanticModel, validateSemanticModel } from './modelValidation.js';
import { type CodeMapping, type EvidenceRecord, type Knowledge, type ModelAssertion, type ModelDiagnostic, type ModelFrame, type ModelInteraction, type ModelOccurrence, type ModelView, type SemanticElement, type SemanticModelV4, type SemanticRelation } from './modelTypes.js';
import { canonicalJson, modelDigest, semanticContent } from './modelSerialization.js';
import { arrangeExplorationView, inspectDiagramQuality } from './diagramPreview.js';

/** Temporary references start with @ and are resolved only inside one transaction. */
export type DiagramCommand =
	| { kind: 'merge'; ref: string; sourceId: string; evidenceIds: string[] }
	| { kind: 'element'; ref: string; evidenceIds: string[]; element: Omit<SemanticElement, 'id' | 'parentId' | 'behavior'> }
	| { kind: 'relation'; ref: string; relation: Omit<SemanticRelation, 'id'>; evidenceIds: string[] }
	| { kind: 'membership'; ref: string; elementId: string; featureId: string }
	| { kind: 'ownership'; ref: string; elementId: string; ownerId: string; role: 'architecture' | 'lifecycle' }
	| { kind: 'assertion'; ref: string; assertion: Omit<ModelAssertion, 'id'> }
	| { kind: 'scenario'; ref: string; trigger: string; scope: string; participantIds: string[]; evidenceIds: string[]; occurrences: { ref: string; from: string; to: string; name: string; evidenceIds: string[] }[]; order: { before: string; after: string; evidenceIds: string[]; basis: 'extracted' | 'inferred' | 'observed' | 'authored' }[]; alternatives: { ref: string; operator: 'alt' | 'opt' | 'par' | 'loop'; operands: { ref: string; condition: Knowledge; steps: string[]; evidenceIds: string[] }[] }[] }
	| { kind: 'view'; ref: string; name: string; viewKind: ModelView['kind']; intent: string; elementIds: string[]; relationIds: string[]; featureId?: string; subjectId?: string; contextIds?: string[]; scenarioId?: string };
export interface DiagramProposalRequest {
	proposalId: string; baseSemanticRevision: string; supersedes?: string; commands: DiagramCommand[];
	/** Explicit reads include negative query IDs, checked by the session service. */
	readEvidenceIds: string[]; readObjectIds: string[]; queryIds: string[];
}
type Collection = 'elements' | 'relations' | 'ownership' | 'assertions' | 'occurrences' | 'frames' | 'interactions' | 'views' | 'evidence' | 'memberships' | 'integrations' | 'codeMappings';
type Entry = CodeMapping | SemanticModelV4['foundation']['memberships'][number] | SemanticModelV4['foundation']['integrations'][number] | SemanticElement | SemanticRelation | ModelAssertion | ModelOccurrence | ModelFrame | ModelInteraction | ModelView | EvidenceRecord | SemanticModelV4['foundation']['ownership'][number];
export interface ModelPatch { collection: Collection; id: string; before: string | null; value: Entry | null }
export interface DiagramProposal {
	version: 2; id: string; fingerprint: string; baseSemanticRevision: string; aliases: Record<string, string>; redirects?: Record<string, string>;
	supersededBy?: string;
	readSet: { collection: Collection; id: string; revision: string }[]; readEvidenceIds: string[]; queryIds: string[];
	patch: ModelPatch[]; diagnostics: ModelDiagnostic[]; status: 'invalid' | 'ready' | 'applied';
}
const collections: Collection[] = ['elements', 'relations', 'ownership', 'assertions', 'occurrences', 'frames', 'interactions', 'views', 'evidence', 'memberships', 'integrations', 'codeMappings'];
function entries(model: SemanticModelV4, key: Collection): Entry[] {
	if (key === 'views') { return model.views; }
	if (key === 'codeMappings') { return model.codeMappings; }
	if (key === 'elements' || key === 'relations') { return model.semantics[key]; }
	return model.foundation[key] ?? [];
}
function replace(model: SemanticModelV4, key: Collection, value: Entry): void {
	const values = entries(model, key), index = values.findIndex(entry => entry.id === value.id);
	if (index < 0) { values.push(value); } else { values[index] = value; }
	if (key === 'evidence') { model.foundation.evidence = values as EvidenceRecord[]; }
}

/** Merge only descriptive responsibilities; executable contracts need their dedicated editors. */
function mergeElements(model: SemanticModelV4, sourceId: string, targetId: string, revision: string): void {
	const source = model.semantics.elements.find(entry => entry.id === sourceId), target = model.semantics.elements.find(entry => entry.id === targetId), f = model.foundation;
	if (!source || !target || sourceId === targetId || source.kind !== target.kind) { throw new Error('incompatibleMerge'); }
	if (source.behavior || target.behavior || source.details?.members.length || target.details?.members.length || f.blueprint && [...f.blueprint.operations.map(entry => entry.ownerId), ...f.blueprint.interfaces.map(entry => entry.elementId), ...f.blueprint.ports.map(entry => entry.elementId), ...f.blueprint.modules.flatMap(entry => [entry.elementId, ...entry.consumerIds])].some(id => id === sourceId || id === targetId) || f.stateMachines?.some(entry => entry.ownerId === sourceId) || f.messaging?.some(entry => entry.publishers.some(binding => binding.ownerId === sourceId) || entry.subscriptions.some(binding => binding.ownerId === sourceId)) || f.platform.bindings.some(entry => entry.elementId === sourceId) || f.tasks?.some(entry => entry.target.id === sourceId) || f.decisions.some(entry => entry.scopeIds.includes(sourceId) || entry.constraints.some(constraint => constraint.subject.id === sourceId)) || model.verifications.some(entry => entry.elementId === sourceId)) { throw new Error('mergeRequiresExecutableEditor'); }
	if (source.runtimeKind && target.runtimeKind && source.runtimeKind !== target.runtimeKind || source.scope && target.scope && source.scope !== target.scope || source.description && target.description && source.description !== target.description || source.parentId && target.parentId && source.parentId !== target.parentId) { throw new Error('mergeAnnotationConflict'); }
	if (source.details && target.details && (source.details.technology !== target.details.technology || source.details.environment !== target.details.environment)) { throw new Error('mergeDetailConflict'); }
	const sourceOwner = f.ownership.find(entry => entry.elementId === sourceId), targetOwner = f.ownership.find(entry => entry.elementId === targetId);
	if (sourceOwner && targetOwner && (sourceOwner.ownerId !== targetOwner.ownerId || sourceOwner.role !== targetOwner.role)) { throw new Error('mergeOwnershipConflict'); }
	target.runtimeKind ??= source.runtimeKind; target.description ??= source.description; target.scope ??= source.scope; target.parentId ??= source.parentId; target.details ??= source.details;
	// Optional fields remain absent, not undefined values in canonical JSON.
	for (const key of ['description', 'scope', 'parentId', 'details', 'runtimeKind'] as const) { if (target[key] === undefined) { delete target[key]; } }
	const redirect = (id: string): string => id === sourceId ? targetId : id;
	model.semantics.elements = model.semantics.elements.filter(entry => entry.id !== sourceId);
	for (const element of model.semantics.elements) { if (element.parentId === sourceId) { element.parentId = targetId; } }
	const collapsed = new Set<string>();
	for (const relation of model.semantics.relations) { const beforeSelf = relation.from === relation.to; relation.from = redirect(relation.from); relation.to = redirect(relation.to); if (!beforeSelf && relation.from === relation.to) { collapsed.add(relation.id); } }
	if (f.assertions.some(assertion => collapsed.has(assertion.subject.id) && assertion.provenance.kind === 'authored' && assertion.acceptance.status === 'accepted')) { throw new Error('mergeManualRelationConflict'); }
	model.semantics.relations = model.semantics.relations.filter(entry => !collapsed.has(entry.id));
	f.assertions = f.assertions.filter(entry => !collapsed.has(entry.subject.id));
	for (const assertion of f.assertions) { if (assertion.subject.kind === 'element') { assertion.subject.id = redirect(assertion.subject.id); } }
	f.ownership = f.ownership.filter(entry => !(sourceOwner && targetOwner && entry.id === sourceOwner.id));
	for (const entry of f.ownership) { entry.elementId = redirect(entry.elementId); entry.ownerId = redirect(entry.ownerId); }
	for (const entry of f.memberships) { entry.elementId = redirect(entry.elementId); entry.featureId = redirect(entry.featureId); }
	for (const entry of f.integrations) { entry.consumerId = redirect(entry.consumerId); entry.externalId = redirect(entry.externalId); }
	for (const call of f.occurrences) { call.from = redirect(call.from); call.to = redirect(call.to); }
	for (const scenario of f.interactions) { if (scenario.ownerId) { scenario.ownerId = redirect(scenario.ownerId); } if (scenario.description) { scenario.description.participantIds = [...new Set(scenario.description.participantIds.map(redirect))]; } }
	for (const mapping of model.codeMappings) { mapping.elementId = redirect(mapping.elementId); }
	for (const view of model.views) {
		const affected = view.nodes.some(node => node.elementId === sourceId) || view.relationIds.some(id => collapsed.has(id));
		if (view.spec && affected) { view.spec.projectionRevision = revision; view.spec.manualIds = [...new Set(view.spec.manualIds.map(redirect))]; }
		if (view.subjectId) { view.subjectId = redirect(view.subjectId); } if (view.featureId) { view.featureId = redirect(view.featureId); } if (view.contextIds) { view.contextIds = [...new Set(view.contextIds.map(redirect))]; }
		const targetNode = view.nodes.find(node => node.elementId === targetId), seen = new Set<string>();
		view.nodes = view.nodes.flatMap(node => { const elementId = redirect(node.elementId); if (seen.has(elementId)) { return []; } seen.add(elementId); return [{ ...(elementId === targetId ? targetNode ?? node : node), elementId }]; });
		view.relationIds = view.relationIds.filter(id => !collapsed.has(id));
	}
}
/** View selectors are guarded separately from layout so a hand-moved node can survive review. */
function entryRevision(collection: Collection, entry: Entry): string {
	if (collection !== 'views') { return canonicalJson(entry); }
	const view = entry as ModelView, spec = view.spec;
	return canonicalJson({ ...view, nodes: view.nodes.map(node => ({ elementId: node.elementId })), ...(spec ? { spec: { revision: spec.revision, intent: spec.intent, projectionRevision: spec.projectionRevision } } : {}) });
}
export function diagramModelRevision(model: SemanticModelV4): Promise<string> { return modelDigest(canonicalJson(semanticContent(model))); }

/** Resolve stable IDs once and validate the whole candidate before offering a preview. */
export async function proposeDiagramModel(model: SemanticModelV4, request: DiagramProposalRequest, evidence: EvidenceRecord[], allocate: () => string = () => globalThis.crypto.randomUUID(), reserved?: DiagramProposal): Promise<DiagramProposal> {
	if (model.version !== 5 || await diagramModelRevision(model) !== request.baseSemanticRevision) { throw new Error('staleSemanticRevision'); }
	if (request.commands.filter(command => command.kind === 'view').length > 1) { throw new Error('oneViewPerProposal:saveIndependentDrafts'); }
	if (!request.commands.length || request.commands.length > 48 || request.proposalId.length > 100) { throw new Error('transactionLimit'); }
	const aliases: Record<string, string> = {}, redirects: Record<string, string> = {}, baseIds = new Set(collections.flatMap(key => entries(model, key).map(entry => entry.id))), existingIds = new Set([...baseIds, ...Object.values(reserved?.aliases ?? {})]);
	for (const frame of model.foundation.frames) { if (frame.kind === 'unspecified' && frame.description) { for (const operand of frame.description.operands) { existingIds.add(operand.id); } } }
	const refs = request.commands.flatMap(command => command.kind === 'scenario' ? [command.ref, ...command.occurrences.map(call => call.ref), ...command.alternatives.flatMap(frame => [frame.ref, ...frame.operands.map(operand => operand.ref)])] : [command.ref]);
	for (const ref of refs) {
		if (!ref.startsWith('@')) { if (!existingIds.has(ref)) { throw new Error('unknownObject:' + ref); } continue; }
		if (!/^@[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(ref) || aliases[ref]) { throw new Error('duplicateAlias:' + ref); }
		const reservation = reserved?.aliases[ref], id = reservation ?? allocate(); if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(id) || (reservation ? baseIds.has(id) : existingIds.has(id))) { throw new Error('invalidAllocatedId'); } existingIds.add(id); aliases[ref] = id;
	}
	const resolve = (ref: string): string => { if (ref.startsWith('@')) { if (!aliases[ref]) { throw new Error('unresolvedAlias:' + ref); } return aliases[ref]; } return ref; };
	const candidate = structuredClone(model), reads = new Set(request.readObjectIds), usedEvidence = new Set(request.readEvidenceIds);
	const read = (ref: string): string => { const id = resolve(ref); if (!existingIds.has(id)) { throw new Error('unknownObject:' + id); } if (!ref.startsWith('@') && baseIds.has(id)) { reads.add(id); } return id; };
	const cite = (ids: string[]): string[] => { for (const id of ids) { usedEvidence.add(id); } return [...ids]; };
	const rank: Record<DiagramCommand['kind'], number> = { element: 0, relation: 1, ownership: 2, membership: 2, assertion: 3, merge: 4, scenario: 5, view: 6 };
	for (const command of [...request.commands].sort((a, b) => rank[a.kind] - rank[b.kind])) {
		const id = resolve(command.ref); if (!command.ref.startsWith('@') && baseIds.has(id)) { reads.add(id); }
		if (command.kind === 'merge') { const source = read(command.sourceId), target = read(command.ref); if (!command.evidenceIds.length) { throw new Error('mergeEvidenceRequired'); } cite(command.evidenceIds); mergeElements(candidate, source, target, request.proposalId); redirects[source] = target; }
		else if (command.kind === 'element') {
			const previous = candidate.semantics.elements.find(entry => entry.id === id);
			replace(candidate, 'elements', { ...previous, ...command.element, id });
			if (!command.evidenceIds.length) { throw new Error('elementEvidenceRequired'); }
			for (const field of ['name', 'kind'] as const) {
				if (candidate.foundation.assertions.some(assertion => assertion.subject.id === id && assertion.field === '/' + field && assertion.acceptance.status === 'accepted' && assertion.provenance.kind === 'authored' && assertion.value.state === 'known' && assertion.value.value !== command.element[field])) { throw new Error('manualAssertionConflict:' + id + ':' + field); }
				replace(candidate, 'assertions', { id: allocate(), subject: { kind: 'element', id }, field: '/' + field, value: { state: 'known', value: command.element[field] }, provenance: { kind: 'inferred', producer: 'ade-exploration', revision: request.proposalId }, acceptance: { status: 'proposed', revision: request.proposalId }, evidenceIds: cite(command.evidenceIds) });
			}
		}
		else if (command.kind === 'relation') {
			const value = { ...command.relation, id, from: read(command.relation.from), to: read(command.relation.to) };
			replace(candidate, 'relations', value);
			const assertion: ModelAssertion = { id: allocate(), subject: { kind: 'relation', id }, field: '/name', value: { state: 'known', value: value.name }, provenance: { kind: 'inferred', producer: 'ade-exploration', revision: request.proposalId }, acceptance: { status: 'proposed', revision: request.proposalId }, evidenceIds: cite(command.evidenceIds) };
			replace(candidate, 'assertions', assertion);
		} else if (command.kind === 'ownership') { replace(candidate, 'ownership', { id, elementId: read(command.elementId), ownerId: read(command.ownerId), role: command.role }); }
		else if (command.kind === 'membership') { replace(candidate, 'memberships', { id, elementId: read(command.elementId), featureId: read(command.featureId) }); }
		else if (command.kind === 'assertion') { replace(candidate, 'assertions', { ...command.assertion, id, subject: { ...command.assertion.subject, id: read(command.assertion.subject.id) }, evidenceIds: cite(command.assertion.evidenceIds ?? []) }); }
		else if (command.kind === 'scenario') {
			const occurrenceIds = command.occurrences.map(call => resolve(call.ref)), frameIds = command.alternatives.map(frame => resolve(frame.ref));
			const old = candidate.foundation.interactions.find(entry => entry.id === id);
			if (old?.execution || old?.legacyRelationOrder) { throw new Error('executableScenarioRequiresDedicatedEditor'); }
			for (const call of command.occurrences) { replace(candidate, 'occurrences', { id: resolve(call.ref), profile: 'descriptive', from: read(call.from), to: read(call.to), name: call.name, evidenceIds: cite(call.evidenceIds) }); }
			for (const frame of command.alternatives) {
				const operands = frame.operands.map(operand => ({ id: resolve(operand.ref), condition: operand.condition, steps: operand.steps.map(resolve), evidenceIds: cite(operand.evidenceIds) }));
				replace(candidate, 'frames', { id: resolve(frame.ref), kind: 'unspecified', occurrenceIds: operands.flatMap(operand => operand.steps), description: { operator: frame.operator, operands } });
			}
			replace(candidate, 'interactions', { id, profile: 'descriptive', occurrenceIds, frameIds, description: { trigger: command.trigger, scope: command.scope, participantIds: command.participantIds.map(read), evidenceIds: cite(command.evidenceIds), order: command.order.map(edge => ({ ...edge, before: resolve(edge.before), after: resolve(edge.after), evidenceIds: cite(edge.evidenceIds) })) } });
		} else {
			if (command.viewKind === 'state') { throw new Error('unsupportedNotation:useStructureOrDescriptiveSequence'); }
			const previous = candidate.views.find(view => view.id === id), nodes = command.elementIds.map(read);
			if (!nodes.length || nodes.length > 80) { throw new Error('viewNodeLimit'); }
			const revision = request.proposalId;
			const retainedSubject = command.subjectId ?? (previous?.kind === command.viewKind ? previous.subjectId : undefined), retainedContext = command.contextIds ?? (previous?.kind === command.viewKind ? previous.contextIds : undefined), retainedScenario = command.scenarioId ?? (['sequence', 'activity'].includes(command.viewKind) ? previous?.interactionId : undefined), featureId = command.featureId ?? previous?.featureId;
			const view: ModelView = { id, ...(featureId ? { featureId: read(featureId) } : {}), name: command.name, kind: command.viewKind, nodes: nodes.map(elementId => previous?.nodes.find(node => node.elementId === elementId) ?? { elementId, x: 0, y: 0 }), relationIds: command.relationIds.map(read), spec: { revision, intent: command.intent, projectionRevision: revision, layoutRevision: previous?.spec?.layoutRevision ?? revision, manualIds: previous?.nodes.filter(node => nodes.includes(node.elementId)).map(node => node.elementId) ?? [] }, ...(retainedSubject ? { subjectId: read(retainedSubject) } : {}), ...(retainedContext ? { contextIds: retainedContext.map(read) } : {}), ...(retainedScenario ? { interactionId: read(retainedScenario) } : {}) };
			if (['sequence', 'activity'].includes(command.viewKind) && !view.interactionId) { throw new Error('scenarioRequired'); }
			if (command.viewKind === 'activity' && view.relationIds.length) { throw new Error('activityOrderMustComeFromScenario'); }
			if (view.nodes.some(node => !candidate.semantics.elements.some(element => element.id === node.elementId))) { throw new Error('missingViewElement'); }
			replace(candidate, 'views', view);
			const arranged = arrangeExplorationView(candidate, view);
			view.nodes = arranged.map(node => previous?.nodes.find(old => old.elementId === node.elementId) ?? node);
		}
	}
	for (const id of usedEvidence) {
		const record = evidence.find(entry => entry.id === id) ?? model.foundation.evidence?.find(entry => entry.id === id);
		if (!record) { throw new Error('unknownEvidence:' + id); } replace(candidate, 'evidence', structuredClone(record));
	}
	const patch: ModelPatch[] = [];
	for (const collection of collections) {
		for (const entry of entries(model, collection).filter(entry => !entries(candidate, collection).some(value => value.id === entry.id))) { patch.push({ collection, id: entry.id, before: entryRevision(collection, entry), value: null }); }
		for (const entry of entries(candidate, collection)) {
			const previous = entries(model, collection).find(value => value.id === entry.id);
			if (canonicalJson(entry) !== (previous ? canonicalJson(previous) : null)) { patch.push({ collection, id: entry.id, before: previous ? entryRevision(collection, previous) : null, value: entry }); }
		}
	}
	const readSet: DiagramProposal['readSet'] = [];
	for (const id of reads) {
		let found = false;
		for (const collection of collections) { const entry = entries(model, collection).find(entry => entry.id === id); if (entry) { found = true; readSet.push({ collection, id, revision: entryRevision(collection, entry) }); } }
		if (!found) { throw new Error('unknownReadObject:' + id); }
	}
	const diagnostics = validateSemanticModel(candidate);
	if (!diagnostics.some(diagnostic => diagnostic.severity === 'error')) { for (const view of candidate.views.filter(view => patch.some(patch => patch.collection === 'views' && patch.id === view.id))) { for (const quality of inspectDiagramQuality(candidate, view)) { diagnostics.push({ code: 'contract', severity: quality.severity, path: '/views/' + view.id, args: [quality.level, quality.code, quality.objectId] }); } } }
	return { version: 2, id: request.proposalId, fingerprint: await modelDigest(canonicalJson(request)), baseSemanticRevision: request.baseSemanticRevision, aliases, redirects, readSet, readEvidenceIds: [...usedEvidence], queryIds: [...request.queryIds], patch, diagnostics, status: diagnostics.some(entry => entry.severity === 'error') ? 'invalid' : 'ready' };
}

/** Optimistic checks allow disjoint proposals while preserving every unrelated manual edit. */
export function applyDiagramProposal(model: SemanticModelV4, proposal: DiagramProposal): SemanticModelV4 {
	if (proposal.status === 'invalid') { throw new Error('invalidProposal'); }
	for (const read of proposal.readSet) { const entry = entries(model, read.collection).find(entry => entry.id === read.id); if (!entry || entryRevision(read.collection, entry) !== read.revision) { throw new Error('readConflict:' + read.id); } }
	const candidate = structuredClone(model);
	for (const patch of proposal.patch) {
		const previous = entries(candidate, patch.collection).find(entry => entry.id === patch.id);
		if ((previous ? entryRevision(patch.collection, previous) : null) !== patch.before) { throw new Error('writeConflict:' + patch.id); }
		if (patch.value === null) { const values = entries(candidate, patch.collection), index = values.findIndex(entry => entry.id === patch.id); if (index >= 0) { values.splice(index, 1); } continue; }
		const value = structuredClone(patch.value);
		if (patch.collection === 'views' && previous) {
			const view = value as ModelView, live = previous as ModelView;
			const redirect = (id: string): string => { for (let count = 0; proposal.redirects?.[id] && count < 48; count++) { id = proposal.redirects[id]; } return id; };
			view.nodes = view.nodes.map(node => live.nodes.find(old => old.elementId === node.elementId) ?? (() => { const source = live.nodes.find(old => redirect(old.elementId) === node.elementId); return source ? { ...source, elementId: node.elementId } : node; })());
			if (view.spec && live.spec) { view.spec.layoutRevision = live.spec.layoutRevision; view.spec.manualIds = [...new Set([...view.spec.manualIds, ...live.spec.manualIds.map(redirect)])].filter(id => view.nodes.some(node => node.elementId === id)); }
		}
		replace(candidate, patch.collection, value);
	}
	return readSemanticModel(candidate) as SemanticModelV4;
}
