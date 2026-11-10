/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import * as dom from '../../../../base/browser/dom.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { notationRelationLabel } from '../common/modelNotation.js';
import { ModelView, SemanticModel } from '../common/modelTypes.js';
import { IAdeCodeService } from './adeCodeService.js';
import { renderModelTaskPreview } from './adeTaskPreview.js';
import { specificationEditors } from './adeSpecificationContent.js';
import { readinessDiagnosticMessage, readinessEditor } from './adeDiagnostics.js';
import { AdeProjectService } from './adeProjectService.js';
import { renderBlueprintDetails } from './adeBlueprintDetails.js';
import { AdeControls } from './adeControls.js';
import { elementLabels, relationLabels } from './adeLabels.js';
import { getSequenceDiagram } from '../common/sequenceDiagram.js';
import { notationLines } from '../common/diagramLayout.js';
import { renderRecordedEvidence } from './adeImpact.js';

interface AdeInspectorHost {
	paragraph(parent: HTMLElement, content: string): void;
	button(parent: HTMLElement, label: string, action: () => void, id?: string): HTMLButtonElement;
	readonly root: HTMLElement;
	revealElement(id: string, viewId?: string): void;
	relationMenu(id: string, x: number, y: number): void;
}

/** Renders contextual element and relationship properties for the ADE editor. */
export class AdeInspector {
	renderProperties(detail: HTMLElement, model: SemanticModel, view?: ModelView): void {
		detail.setAttribute('aria-label', localize('ade.properties', "Properties"));
		dom.append(detail, dom.$('h2')).textContent = localize('ade.properties', "Properties");
		const element = model.semantics.elements.find(element => element.id === this.project.selectedId);
		if (!element) { return; }
		dom.append(detail, dom.$('h3')).textContent = element.name;
		this.host.paragraph(detail, localize('ade.elementKind', "Type: {0}", elementLabels[element.kind]));
		if (this.code.context) { this.host.button(detail, localize('ade.openSource', "Open Source"), () => { void this.code.inspect(element.id); }, `source:${element.id}`).disabled = this.code.busy; }
		if ((model.version === 4 || model.version === 5)) {
			renderBlueprintDetails(detail, model, element.id, this.controls, (viewId, elementId) => { this.project.showDiagram(viewId); this.project.selectElement(elementId); }, id => this.project.inspectElement(id));
			if (this.project.editable) { for (const property of specificationEditors(model, element.id)) { this.host.button(detail, property.label, () => { void this.commandService.executeCommand('ade.blueprint', element.id, property.mode); }, `property:${property.mode}:${element.id}`); } }
			if (this.project.editable) { this.host.button(detail, localize('ade.blueprint.edit', "Edit Blueprint"), () => { void this.commandService.executeCommand('ade.blueprint', element.id); }); }
			this.host.button(detail, localize('ade.predicate.edit', "Edit Pure Predicate"), () => { void this.commandService.executeCommand('ade.predicate', element.id); });
			this.host.button(detail, localize('ade.task.preview', "Structural AI Context Preview"), () => { void this.commandService.executeCommand('ade.prepareStructuralContext'); });
			if (this.project.taskPreview) { renderModelTaskPreview(detail, this.project.taskPreview, this.controls); }
			const readiness = this.project.readiness(element.id);
			this.host.paragraph(detail, readiness.state === 'draft' ? localize('ade.ready.draft', "Specification: Draft") : readiness.state === 'generationReady' ? localize('ade.ready.ready', "Specification: Ready for the Selected Profile") : localize('ade.ready.structured', "Specification: Structurally Valid"));
			for (const diagnostic of readiness.diagnostics) { const route = readinessEditor(diagnostic); this.host.button(detail, readinessDiagnosticMessage(model, diagnostic), () => { void this.commandService.executeCommand(route.command, diagnostic.object?.id ?? element.id, route.mode); }, `readiness:${diagnostic.code}:${diagnostic.object?.id}:${diagnostic.field}`); }
		}
		const floating = this.host.root.classList.contains('ade-canvas-mode') && !!view;
		if (floating) {
			if (element.description) { this.host.paragraph(detail, element.description); }
			if (this.project.editable) {
				for (const [label, command] of [[localize('ade.renameElement', "Rename Element"), 'ade.renameElement'], [localize('ade.editDescription', "Edit Description"), 'ade.description'], [localize('ade.connectSelection', "Connect Selection"), 'ade.connect']]) { this.host.button(detail, label, () => { void this.commandService.executeCommand(command); }).disabled = command === 'ade.connect' && view?.kind === 'state' && element.kind !== 'state'; }
			}
			detail = this.controls.details(detail, localize('ade.elementMore', "Details and Actions"), `element-more:${element.id}`);
		}
		if (this.project.section !== 'impact') { this.host.button(detail, localize('ade.showImpact.button', "Show Change Impact"), () => this.project.showImpact(element.id), 'show-impact'); }
		if (element.kind === 'state' && element.parentId) {
			const resource = model.semantics.elements.find(candidate => candidate.id === element.parentId && candidate.kind === 'resource');
			if (resource) { this.host.button(detail, localize('ade.state.resource', "Resource: {0}", resource.name), () => this.project.inspectElement(resource.id), `state-owner:${resource.id}`); }
		}
		if (this.project.section === 'diagram') {
			this.host.button(detail, localize('ade.elementDetails', "Element Details"), () => this.project.inspectElement(element.id));
		}
		const views = model.views.filter(candidate => candidate.nodes.some(node => node.elementId === element.id));
		if (views.length) {
			const perspectives = dom.append(detail, dom.$('section'));
			dom.append(perspectives, dom.$('h3')).textContent = localize('ade.elementViews', "Diagrams Containing This Element");
			for (const candidate of views) {
				this.host.button(perspectives, candidate.name, () => this.host.revealElement(element.id, candidate.id), `element-view:${candidate.id}`).disabled = candidate.id === view?.id;
			}
		} else if (element.kind !== 'feature') { this.host.paragraph(detail, localize('ade.notPlaced', "This element is not placed in a diagram.")); }
		if (this.project.editable) {
			if (view?.kind === 'state') {
				this.host.button(detail, element.kind === 'state' ? localize('ade.state.removeState', "Remove State from Diagram") : localize('ade.state.removeContext', "Remove Element from Diagram"), () => this.project.edit({ kind: 'exclude', viewId: view.id, id: element.id, target: 'element' }));
			}
			if (view?.kind === 'sequence') {
				const index = view.nodes.findIndex(node => node.elementId === element.id);
				this.host.button(detail, localize('ade.sequence.left', "Move Participant Left"), () => this.project.edit({ kind: 'sequenceOrder', viewId: view.id, id: element.id, target: 'participant', direction: -1 })).disabled = index <= 0;
				this.host.button(detail, localize('ade.sequence.right', "Move Participant Right"), () => this.project.edit({ kind: 'sequenceOrder', viewId: view.id, id: element.id, target: 'participant', direction: 1 })).disabled = index === view.nodes.length - 1;
				this.host.button(detail, localize('ade.sequence.removeParticipant', "Remove Participant from Diagram"), () => this.project.edit({ kind: 'sequenceRemove', viewId: view.id, id: element.id, target: 'participant' }));
			}
			for (const [label, command] of [
				[localize('ade.renameElement', "Rename Element"), 'ade.renameElement'],
				[localize('ade.editDescription', "Edit Description"), 'ade.description'],
				[localize('ade.editBehavior', "Edit Behavioral Contract"), 'ade.behavior'],
				[localize('ade.connectSelection', "Connect Selection"), 'ade.connect'],
				[localize('ade.deleteElement', "Delete Element"), 'ade.deleteElement']
			]) {
				if (command === 'ade.connect' && !view || floating && ['ade.renameElement', 'ade.description', 'ade.connect'].includes(command)) { continue; }
				this.host.button(detail, label, () => { void this.commandService.executeCommand(command); }).disabled = command === 'ade.connect' && view?.kind === 'state' && element.kind !== 'state';
			}
		}
		for (const line of notationLines(element)) { this.host.paragraph(detail, line); }
		if (this.project.editable) { this.host.button(detail, localize('ade.notation.edit', "Edit Attributes and Technology"), () => { void this.commandService.executeCommand('ade.notation', element.id); }); }
		if (this.project.editable && (model.version !== 4 && model.version !== 5)) { this.host.button(detail, localize('ade.notation.parent', "Change Boundary or Parent"), () => { void this.commandService.executeCommand('ade.parent', element.id); }); }
		if (this.project.editable && (model.version === 4 || model.version === 5)) { this.host.button(detail, localize('ade.openModelSource', "Edit Model Specification"), () => { void this.commandService.executeCommand('ade.openModelSource'); }); }
		if (element.parentId) { this.host.paragraph(detail, localize('ade.notation.parentName', "Boundary / Parent: {0}", model.semantics.elements.find(parent => parent.id === element.parentId)?.name ?? element.parentId)); }
		if (element.description && !floating) { this.host.paragraph(detail, element.description); }
		if (element.behavior) {
			dom.append(detail, dom.$('h3')).textContent = localize('ade.behavior.heading', "Behavioral Contract");
			this.host.paragraph(detail, localize('ade.behavior.intent', "Contract declarations describe expected behavior."));
			for (const field of element.behavior.inputs) { this.host.paragraph(detail, localize('ade.input', "Input: {0} ({1}), {2}", field.name, field.type, field.required ? localize('ade.field.required', "Required") : localize('ade.field.optional', "Optional"))); }
			for (const field of element.behavior.outputs) { this.host.paragraph(detail, localize('ade.output', "Output: {0} ({1}), {2}", field.name, field.type, field.required ? localize('ade.field.required', "Required") : localize('ade.field.optional', "Optional"))); }
			for (const condition of element.behavior.preconditions) { this.host.paragraph(detail, localize('ade.precondition', "Precondition: {0}", condition)); }
			for (const condition of element.behavior.postconditions) { this.host.paragraph(detail, localize('ade.postcondition', "Postcondition: {0}", condition)); }
			for (const error of element.behavior.errors) { this.host.paragraph(detail, localize('ade.behavior.error', "Error {0}: {1}", error.code, error.description)); }
			for (const permission of element.behavior.permissions) {
				this.host.paragraph(detail, localize('ade.permission', "Authorization: {0} · {1}", model.semantics.elements.find(element => element.id === permission.actorId)!.name, permission.capability));
			}
			for (const criterion of element.behavior.acceptanceCriteria) {
				this.host.paragraph(detail, localize('ade.acceptance', "Given {0}, when {1}, then {2}.", criterion.given, criterion.when, criterion.then));
			}
		}
		for (const relation of model.semantics.relations.filter(relation => relation.from === element.id || relation.to === element.id)) {
			const targetId = relation.from === element.id ? relation.to : relation.from;
			const from = model.semantics.elements.find(element => element.id === relation.from)!;
			const to = model.semantics.elements.find(element => element.id === relation.to)!;
			const label = localize('ade.relation', "{0} → {1}: {2}", from.name, to.name, relation.name || relation.kind);
			this.host.button(detail, label, () => this.host.revealElement(targetId), `relation:${relation.id}`);
			if (this.project.editable && view?.kind === 'sequence' && view.relationIds.includes(relation.id)) {
				const messages = getSequenceDiagram(model, view).messages;
				const index = messages.findIndex(message => message.id === relation.id);
				const actions = this.controls.details(detail, localize('ade.sequence.messageOptions', "Sequence Message Options: {0}", relation.name || relationLabels[relation.kind]), `sequence-options:${relation.id}`);
				this.host.button(actions, localize('ade.sequence.earlier', "Move Message Earlier"), () => this.project.edit({ kind: 'sequenceOrder', viewId: view.id, id: relation.id, target: 'message', direction: -1 }), `earlier:${relation.id}`).disabled = index <= 0;
				this.host.button(actions, localize('ade.sequence.later', "Move Message Later"), () => this.project.edit({ kind: 'sequenceOrder', viewId: view.id, id: relation.id, target: 'message', direction: 1 }), `later:${relation.id}`).disabled = index < 0 || index === messages.length - 1;
				this.host.button(actions, localize('ade.sequence.removeMessage', "Remove Message from Diagram"), () => this.project.edit({ kind: 'sequenceRemove', viewId: view.id, id: relation.id, target: 'message' }), `remove-message:${relation.id}`);
			}
			if (this.project.editable) {
				if (relation.kind === 'transition') {
					this.host.button(detail, localize('ade.state.editEvent', "Edit Transition Event"), () => { void this.commandService.executeCommand('ade.renameRelation', relation.id); }, `event:${relation.id}`);
				}
				if (view?.kind === 'state' && view.relationIds.includes(relation.id)) {
					this.host.button(detail, localize('ade.state.removeTransition', "Remove Relationship from Diagram"), () => this.project.edit({ kind: 'exclude', viewId: view.id, id: relation.id, target: 'relation' }), `exclude:${relation.id}`);
				}
				this.host.button(detail, localize('ade.editCondition', "Edit Condition"), () => { void this.commandService.executeCommand('ade.condition', relation.id); }, `condition:${relation.id}`);
				this.host.button(detail, localize('ade.editRelationError', "Edit Relationship Error"), () => { void this.commandService.executeCommand('ade.relationError', relation.id); }, `error:${relation.id}`);
				this.host.button(detail, localize('ade.deleteRelationship', "Delete Relationship"), () => { void this.commandService.executeCommand('ade.deleteRelation', relation.id); }, `delete:${relation.id}`);
			}
			if (relation.condition) { this.host.paragraph(detail, localize('ade.condition', "Condition: {0}", relation.condition)); }
			if (relation.errorCode) { this.host.paragraph(detail, localize('ade.errorCodeLabel', "Error: {0}", relation.errorCode)); }
		}
		renderRecordedEvidence(detail, model, element.id, this.controls);
	}

	renderRelationProperties(parent: HTMLElement, id: string): void {
		const relation = this.project.model.semantics.relations.find(relation => relation.id === id);
		if (!relation) { return; }
		dom.append(parent, dom.$('h2')).textContent = localize('ade.relationshipProperties', "Relationship Properties");
		this.host.paragraph(parent, relation.name || relationLabels[relation.kind]);
		this.host.paragraph(parent, relationLabels[relation.kind]);
		if (relation.details) { this.host.paragraph(parent, notationRelationLabel(relation)); }
		if ((this.project.model.version === 4 || this.project.model.version === 5)) {
			for (const transport of this.project.model.foundation.blueprint?.transports.filter(transport => transport.relationId === id) ?? []) { this.host.paragraph(parent, localize('ade.blueprint.transportDetails', "Transport: {0} · Payload: {1} · Schema: {2} · Version: {3}", transport.protocol, transport.format, this.project.model.foundation.types.find(type => type.id === transport.schemaTypeId)?.name ?? '', transport.schemaVersion)); }
		}
		if (this.project.editable) { this.host.button(parent, localize('ade.notation.editRelation', "Edit Cardinalities and Protocol"), () => { void this.commandService.executeCommand('ade.relationNotation', id); }); }
		for (const target of [relation.from, relation.to]) {
			this.host.button(parent, this.project.model.semantics.elements.find(element => element.id === target)!.name, () => this.host.revealElement(target));
		}
		if (relation.condition) { this.host.paragraph(parent, localize('ade.condition', "Condition: {0}", relation.condition)); }
		if (relation.errorCode) { this.host.paragraph(parent, localize('ade.errorCodeLabel', "Error: {0}", relation.errorCode)); }
		if (this.project.editable) { this.host.button(parent, localize('ade.context.editRelation', "Edit Relationship…"), () => { void this.commandService.executeCommand('ade.editRelation', id); }); }
		this.host.button(parent, localize('ade.context.moreRelation', "More Relationship Actions…"), () => { const box = parent.getBoundingClientRect(); this.host.relationMenu(id, box.left, box.top); });
	}

	constructor(
		private readonly host: AdeInspectorHost,
		private readonly controls: AdeControls,
		private readonly project: AdeProjectService,
		private readonly code: IAdeCodeService,
		private readonly commandService: ICommandService
	) {
	}
}
