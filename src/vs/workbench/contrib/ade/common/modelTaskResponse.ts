/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { modelObjects, readSemanticDraft, type ModelOperation, type ModelReference, type SemanticModelV4 } from './semanticModel.js';
import { assertModelProposalAllowed } from './modelReadiness.js';
import { getModelArchetype } from './modelProfiles.js';
import { assertModelTaskCurrent, compileModelTaskContext, type ModelTaskPacket, type ModelTaskRequest, type TaskSource } from './modelTaskContext.js';
import { mergeSourceWindows } from './contextTransport.js';
import { canonicalJson } from './modelSerialization.js';

export type ModelTaskResponse =
	| { kind: 'proposal'; reason: string; criteria: string[]; evidence: string[]; temporaryKeys: string[]; operations: { handle: string; value: ModelOperation }[]; sourceEdits: { file: string; revision: string; start: number; end: number; search: string; replace: string }[] }
	| { kind: 'needsClarification'; questions: string[] }
	| { kind: 'needContext'; reason: string; objects: string[]; windows: { file: string; start: number; end: number }[] }
	| { kind: 'unsupported'; capability: string; reason: string };

function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function keys(value: Record<string, unknown>, expected: string[]): void { if (Object.keys(value).sort().join(',') !== expected.sort().join(',')) { throw new Error('Unexpected or missing response property'); } }
function text(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function strings(value: unknown): value is string[] { return Array.isArray(value) && value.every(text); }

/** Strict discriminated boundary. Results cannot contain commands, test outcomes or undeclared edits. */
export function readModelTaskResponse(value: unknown): ModelTaskResponse {
	if (!record(value)) { throw new Error('Structured task response required'); }
	if (value.kind === 'needsClarification') { keys(value, ['kind', 'questions']); if (!strings(value.questions) || !value.questions.length) { throw new Error('Explicit questions required'); } }
	else if (value.kind === 'unsupported') { keys(value, ['kind', 'capability', 'reason']); if (!text(value.capability) || !text(value.reason)) { throw new Error('Capability and reason required'); } }
	else if (value.kind === 'needContext') {
		keys(value, ['kind', 'reason', 'objects', 'windows']);
		if (!text(value.reason) || !strings(value.objects) || !Array.isArray(value.windows) || !value.objects.length && !value.windows.length) { throw new Error('Precise context request required'); }
		for (const window of value.windows) { if (!record(window)) { throw new Error('Invalid retrieval window'); } keys(window, ['file', 'start', 'end']); if (!text(window.file) || !Number.isSafeInteger(window.start) || !Number.isSafeInteger(window.end) || (window.start as number) < 0 || (window.end as number) <= (window.start as number)) { throw new Error('Invalid retrieval range'); } }
	} else if (value.kind === 'proposal') {
		keys(value, ['kind', 'reason', 'criteria', 'evidence', 'temporaryKeys', 'operations', 'sourceEdits']);
		if (!text(value.reason) || !strings(value.criteria) || !value.criteria.length || !strings(value.evidence) || !strings(value.temporaryKeys) || !Array.isArray(value.operations) || !Array.isArray(value.sourceEdits) || !value.operations.length && !value.sourceEdits.length) { throw new Error('Complete bounded proposal required'); }
		for (const operation of value.operations) { if (!record(operation)) { throw new Error('Invalid operation change'); } keys(operation, ['handle', 'value']); if (!text(operation.handle) || !record(operation.value)) { throw new Error('Invalid operation change'); } }
		for (const edit of value.sourceEdits) { if (!record(edit)) { throw new Error('Invalid source edit'); } keys(edit, ['file', 'revision', 'start', 'end', 'search', 'replace']); if (!text(edit.file) || !text(edit.revision) || !text(edit.search) || typeof edit.replace !== 'string' || !Number.isSafeInteger(edit.start) || !Number.isSafeInteger(edit.end) || (edit.start as number) < 0 || (edit.end as number) <= (edit.start as number)) { throw new Error('Invalid source anchor'); } }
	} else { throw new Error('Unknown task outcome'); }
	return structuredClone(value) as ModelTaskResponse;
}

/** Validate a reviewable candidate on a copy. Publication and project runners belong to DAI-05. */
export async function validateModelTaskProposal(packet: ModelTaskPacket, model: SemanticModelV4, request: ModelTaskRequest, value: unknown, nextId: () => string = () => globalThis.crypto.randomUUID()): Promise<{ response: Extract<ModelTaskResponse, { kind: 'proposal' }>; candidate: SemanticModelV4; identities: Record<string, string> }> {
	await assertModelTaskCurrent(packet, model, request);
	const response = readModelTaskResponse(value); if (response.kind !== 'proposal') { throw new Error('Proposal outcome required'); }
	const dictionary = [...packet.definitions, ...packet.boundaries]; const refs = new Map(dictionary.map(item => [item.handle, item.ref]));
	const allowed = new Set(request.writeScope.objects.map(ref => `${ref.kind}:${ref.id}`));
	const criteria = new Set(packet.definitions.flatMap(definition => definition.ref.kind === 'operation' ? (definition.value as ModelOperation).acceptanceCriteria.map(criterion => criterion.id) : []));
	if (response.criteria.some(id => !criteria.has(id))) { throw new Error('Unknown acceptance criterion'); }
	const payload = JSON.parse(packet.bytes) as { evidence: { units: [string, ...object[]][] } };
	const evidence = new Set(payload.evidence.units.map(unit => unit[0]));
	if (response.evidence.some(id => !evidence.has(id))) { throw new Error('Unknown evidence reference'); }
	// Check operation shape before traversing untrusted child records.
	for (const change of response.operations) { const check = structuredClone(model); check.foundation.blueprint!.operations = [change.value]; readSemanticDraft(check); }
	const declarations = response.operations.flatMap(change => [change.value.id, ...change.value.inputs.map(field => field.id), ...change.value.outputs.map(field => field.id), ...change.value.errors.map(error => error.id)]).filter((id): id is string => typeof id === 'string' && id.startsWith('tmp:'));
	if (new Set(response.temporaryKeys).size !== response.temporaryKeys.length || canonicalJson([...declarations].sort()) !== canonicalJson([...response.temporaryKeys].sort())) { throw new Error('Temporary identity declarations must be exact and unique'); }
	const identities: Record<string, string> = Object.create(null); const objects = modelObjects(model); const allocated = new Set<string>();
	for (const temporary of declarations) {
		if (!/^tmp:[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(temporary)) { throw new Error('Invalid temporary identity'); }
		const id = nextId(); if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(id) || allocated.has(id) || [...objects.keys()].some(key => key.endsWith(`:${id}`))) { throw new Error('Tool identity collision'); } allocated.add(id); identities[temporary] = id;
	}

	const candidate = structuredClone(model); const changed = new Set<string>();
	for (const change of response.operations) {
		const operation = structuredClone(change.value);
		if (Object.hasOwn(identities, operation.id)) { operation.id = identities[operation.id]; }
		for (const field of [...operation.inputs, ...operation.outputs, ...operation.errors]) { if (field.id && Object.hasOwn(identities, field.id)) { field.id = identities[field.id]; } }
		const ref = refs.get(change.handle);
		if (changed.has(operation.id)) { throw new Error('Repeated operation edit'); } changed.add(operation.id);
		const existing = model.foundation.blueprint?.operations.find(entry => entry.id === operation.id);
		if (existing) {
			if (ref?.kind !== 'operation' || ref.id !== operation.id || !allowed.has(`operation:${operation.id}`) || operation.ownerId !== existing.ownerId) { throw new Error('Operation edit outside write scope or ownership'); }
			const known = new Set([existing.id, ...existing.inputs.map(field => field.id), ...existing.outputs.map(field => field.id), ...existing.errors.map(error => error.id)]);
			for (const id of [...operation.inputs, ...operation.outputs, ...operation.errors].map(item => item.id)) { if (!known.has(id) && !allocated.has(id!)) { throw new Error('Invented operation member identity'); } }
		} else if (!response.temporaryKeys.includes(change.value.id) || !request.writeScope.createOperationsUnder.includes(operation.ownerId) || change.handle !== change.value.id) { throw new Error('New operation outside explicit creation scope'); }
		const knownTypes = new Set(packet.definitions.filter(item => item.ref.kind === 'type').map(item => item.ref.id));
		for (const field of [...operation.inputs, ...operation.outputs, ...operation.errors]) { if (!field.typeId || !knownTypes.has(field.typeId)) { throw new Error('Type outside disclosed definitions'); } }
		candidate.foundation.blueprint!.operations = existing ? candidate.foundation.blueprint!.operations.map(entry => entry.id === operation.id ? operation : entry) : [...candidate.foundation.blueprint!.operations, operation];
	}
	for (const edit of response.sourceEdits) {
		const source = request.sources.find(source => source.file === edit.file);
		if (!request.writeScope.files.includes(edit.file) || !source || source.revision !== edit.revision || edit.end - edit.start !== edit.search.length) { throw new Error('Source edit outside scope or stale'); }
		const window = source.windows.find(window => window.start <= edit.start && window.start + window.text.length >= edit.end);
		if (!window || window.text.slice(edit.start - window.start, edit.end - window.start) !== edit.search) { throw new Error('Source anchor not disclosed'); }
		const occurrences = mergeSourceWindows(source.windows).reduce((sum, window) => sum + window.text.split(edit.search).length - 1, 0);
		if (occurrences !== 1) { throw new Error('Source anchor ambiguous'); }
	}
	const sortedEdits = [...response.sourceEdits].sort((a, b) => a.file.localeCompare(b.file) || a.start - b.start);
	for (let index = 1; index < sortedEdits.length; index++) { const before = sortedEdits[index - 1], after = sortedEdits[index]; if (before.file === after.file && before.end > after.start) { throw new Error('Overlapping source edits'); } }
	readSemanticDraft(candidate); assertModelProposalAllowed(model, candidate, request.target.kind === 'predicate' ? model.foundation.predicates!.find(predicate => predicate.id === request.target.id)!.operationId : request.target.id, getModelArchetype(request.profileId).profile);
	return { response, candidate, identities };
}

/** Authorize retrieval without reading anything. Caller obtains only these sealed files/ranges. */
export function authorizeModelTaskRetrieval(packet: ModelTaskPacket, request: ModelTaskRequest, value: unknown): { objects: ModelReference[]; windows: { file: string; start: number; end: number }[] } {
	const response = readModelTaskResponse(value); if (response.kind !== 'needContext') { throw new Error('needContext outcome required'); }
	const objects = response.objects.map(handle => {
		const ref = [...packet.definitions, ...packet.boundaries, ...packet.retrievalCatalog].find(item => item.handle === handle)?.ref;
		if (!ref || !request.retrievalScope.objects.some(allowed => allowed.kind === ref.kind && allowed.id === ref.id)) { throw new Error('Retrieval identity outside scope'); }
		return ref;
	});
	for (const window of response.windows) { if (!request.retrievalScope.files.some(file => file.file === window.file && file.ranges.some(range => window.start >= range.start && window.end <= range.end))) { throw new Error('Retrieval window outside scope'); } }
	return { objects, windows: response.windows };
}

/** A larger disclosure always gets a new exact packet and seal; no invisible filesystem/tool access. */
export async function expandModelTaskContext(packet: ModelTaskPacket, model: SemanticModelV4, request: ModelTaskRequest, response: unknown, acquired: TaskSource[]): Promise<{ request: ModelTaskRequest; packet: ModelTaskPacket }> {
	await assertModelTaskCurrent(packet, model, request); const authorized = authorizeModelTaskRetrieval(packet, request, response);
	const next = structuredClone(request);
	for (const source of acquired) {
		if (!source.windows.length || source.windows.some(window => !authorized.windows.some(range => range.file === source.file && window.start >= range.start && window.start + window.text.length <= range.end))) { throw new Error('Acquired context outside authorized retrieval'); }
		const previous = next.sources.find(entry => entry.file === source.file);
		if (previous) { if (previous.revision !== source.revision || previous.length !== source.length || previous.producer !== source.producer) { throw new Error('Retrieval source revision changed'); } previous.windows.push(...source.windows); }
		else { next.sources.push(source); }
	}
	for (const ref of authorized.objects) { const additional = next.additionalContext ??= []; if (!additional.some(entry => entry.id === ref.id && entry.kind === ref.kind)) { additional.push(ref); } }
	const prepared = await compileModelTaskContext(model, next);
	if (prepared.seal === packet.seal) { throw new Error('Retrieval disclosed no new context'); }
	return { request: next, packet: prepared };
}

/** Content cache stores proposals only as reviewable data; every lookup revalidates current dependencies. */
export class ModelTaskCache {
	private readonly entries = new Map<string, unknown>();
	async get(packet: ModelTaskPacket, model: SemanticModelV4, request: ModelTaskRequest): Promise<{ value: unknown; reused: true; calls: 0 } | undefined> {
		await assertModelTaskCurrent(packet, model, request); if (!this.entries.has(packet.cacheKey)) { return undefined; }
		return { value: structuredClone(this.entries.get(packet.cacheKey)), reused: true, calls: 0 };
	}
	async put(packet: ModelTaskPacket, model: SemanticModelV4, request: ModelTaskRequest, value: unknown): Promise<void> {
		await assertModelTaskCurrent(packet, model, request); const response = readModelTaskResponse(value);
		if (response.kind === 'proposal') { await validateModelTaskProposal(packet, model, request, response); }
		if (response.kind === 'needContext') { authorizeModelTaskRetrieval(packet, request, response); }
		this.entries.set(packet.cacheKey, response);
	}
}
