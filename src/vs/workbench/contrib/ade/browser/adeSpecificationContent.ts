/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { type SemanticModelV4 } from '../common/modelTypes.js';
import { modelProjectProfile } from '../common/modelProfiles.js';
import { getGenerationScope, getModelReadiness } from '../common/modelReadiness.js';
import { type BlueprintEditMode } from './adeBlueprintEditing.js';

/** Metadata shared by visual Properties and Read Diagram; unknown facts retain their reason. */
export function specificationRows(model: SemanticModelV4, elementId: string, options: { includeOwner?: boolean } = {}): string[] {
	const scope = getGenerationScope(model, elementId), lines: string[] = [];
	let profile; try { profile = modelProjectProfile(model).profile; } catch { /* Incomplete bindings remain visible below. */ }
	const readiness = getModelReadiness(model, elementId, profile);
	lines.push(readiness.state === 'generationReady' ? localize('ade.spec.ready', "Specification: Ready for the Selected Profile") : readiness.state === 'draft' ? localize('ade.spec.draft', "Specification: Draft") : localize('ade.spec.structured', "Specification: Structurally Valid"));
	for (const binding of model.foundation.platform.bindings.filter(binding => scope.has(binding.elementId) && binding.technology.state === 'unknown')) { if (binding.technology.state === 'unknown') { lines.push(localize('ade.spec.technologyUnknown', "Technology Unknown: {0}", binding.technology.reason)); } }
	const owner = model.foundation.ownership.find(entry => entry.elementId === elementId);
	if (options.includeOwner !== false) { lines.push(owner ? localize('ade.spec.owner', "Owner: {0}", model.semantics.elements.find(element => element.id === owner.ownerId)?.name ?? '') : localize('ade.spec.noOwner', "Owner: Not Declared")); }
	const operations = new Set(model.foundation.blueprint?.operations.filter(operation => scope.has(operation.ownerId)).map(operation => operation.id));
	const relevant = (id: string) => scope.has(id) || operations.has(id) || model.foundation.interactions.some(entry => entry.id === id && entry.ownerId && scope.has(entry.ownerId)) || model.foundation.stateMachines?.some(entry => entry.id === id && scope.has(entry.ownerId)) || model.foundation.messaging?.some(entry => entry.id === id && [...entry.publishers, ...entry.subscriptions].some(binding => scope.has(binding.ownerId)));
	for (const assertion of model.foundation.assertions.filter(assertion => relevant(assertion.subject.id))) {
		const value = assertion.value.state === 'known' ? String(assertion.value.value) : assertion.value.state === 'unknown' ? localize('ade.spec.unknown', "Unknown: {0}", assertion.value.reason) : localize('ade.spec.omitted', "Explicitly Omitted");
		lines.push(localize('ade.spec.assertion', "{0}: {1} · Acceptance: {2} · Provenance: {3} / {4}", assertion.field, value, assertion.acceptance.status, assertion.provenance.kind, assertion.provenance.producer));
	}
	for (const task of model.foundation.tasks?.filter(task => relevant(task.target.id)) ?? []) {
		lines.push(localize('ade.spec.task', "Task Intent: {0}", task.text));
		for (const clarification of task.clarifications) { lines.push(localize('ade.task.questionAnswer', "Question: {0}\nAnswer: {1}", clarification.question, clarification.answer)); }
		for (const previous of task.history) { lines.push(localize('ade.spec.previous', "Previous Intent: {0} · {1} Clarifications", previous.text, previous.clarifications.length)); }
	}
	return lines;
}

/** Context-specific entry points avoid offering irrelevant architectural fields at every level. */
export function specificationEditors(model: SemanticModelV4, elementId: string): { label: string; mode: BlueprintEditMode }[] {
	const element = model.semantics.elements.find(element => element.id === elementId); if (!element) { return []; }
	const result: { label: string; mode: BlueprintEditMode }[] = [];
	if (element.kind === 'system' || element.kind === 'container') { result.push({ label: localize('ade.spec.responsibility', "Scope and Responsibility"), mode: 'scope' }); }
	if (element.kind === 'container') { result.push({ label: localize('ade.spec.platform', "Technology Binding"), mode: 'binding' }); }
	if (['container', 'component', 'class', 'contract', 'interface', 'package', 'entity', 'state'].includes(element.kind)) { result.push({ label: localize('ade.spec.ownership', "Architectural or Lifecycle Owner"), mode: 'owner' }); }
	if (['component', 'container', 'system'].includes(element.kind)) { result.push({ label: localize('ade.spec.ports', "Provided or Required Interface"), mode: 'ports' }); }
	if (['contract', 'interface', 'component', 'class', 'controller'].includes(element.kind)) { result.push({ label: localize('ade.spec.operations', "Operation Signatures and Criteria"), mode: 'operations' }); }
	if (['contract', 'interface', 'class', 'entity'].includes(element.kind)) { result.push({ label: localize('ade.spec.types', "Shared Types and Constraints"), mode: 'types' }); }
	result.push({ label: localize('ade.spec.knowledge', "Knowledge and Provenance"), mode: 'assertion' }, { label: localize('ade.spec.decisions', "Applicable Architecture Decisions"), mode: 'decision' });
	return result;
}
