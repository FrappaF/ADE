import { localize } from '../../../../nls.js';
import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ModelView, SemanticElement, SemanticModel, SemanticRelation } from '../common/modelTypes.js';
import { IAdeCodeService } from './adeCodeService.js';
import { renderModelTaskPreview } from './adeTaskPreview.js';
import { specificationEditors } from './adeSpecificationContent.js';
import { readinessDiagnosticMessage, readinessEditor } from './adeDiagnostics.js';
import { AdeProjectService } from './adeProjectService.js';
import { renderBlueprintDetails, renderBlueprintOperation } from './adeBlueprintDetails.js';
import { getEditableScenario, getProjectedInteraction, getViewSelectionIds } from '../common/visualNavigation.js';
import { getScenarioStepSiblings } from '../common/visualEditScenario.js';
import { adeInteractionRows } from './adeInteractionContent.js';
import { AdeControls } from './adeControls.js';
import { AdeActionMenu } from './adeActionMenu.js';
import { diagramIcon, elementIcon } from './adeIcons.js';
import { elementLabels, relationLabels } from './adeLabels.js';
import { getSequenceDiagram } from '../common/sequenceDiagram.js';
import { renderRecordedEvidence } from './adeImpact.js';

interface AdeInspectorHost {
	paragraph(parent: HTMLElement, content: string): void;
	button(parent: HTMLElement, label: string, action: () => void, id?: string): HTMLButtonElement;
	readonly root: HTMLElement;
	revealElement(id: string, viewId?: string): void;
	beginConnection?(id: string): Promise<void>;
	relationMenu(id: string, x: number, y: number): void;
}

/** Presents contextual facts, editing and navigation as a structured information sheet. */
export class AdeInspector {
	private readonly menu: AdeActionMenu;

	renderProperties(detail: HTMLElement, model: SemanticModel, view?: ModelView, close?: () => void): void {
		detail.setAttribute('aria-label', localize('ade.properties', "Properties"));
		detail.classList.add('ade-inspector-sheet');
		const interaction = view && getProjectedInteraction(model, view);
		const scenario = view && getEditableScenario(model, view);
		if (interaction && (model.version === 4 || model.version === 5)) {
			const row = adeInteractionRows(model, interaction.id).find(row => row.id === this.project.selectedId);
			if (row) {
				const call = model.foundation.occurrences.find(call => call.id === row.id);
				const frame = model.foundation.frames.find(frame => frame.id === row.id);
				const referenced = frame?.kind === 'ref' ? model.foundation.interactions.find(entry => entry.id === frame.interactionId) : undefined;
				const operation = model.foundation.blueprint?.operations.find(operation => operation.id === (call?.operationId ?? referenced?.execution?.operationId));
				const contract = model.foundation.blueprint?.operations.find(operation => operation.id === interaction.execution?.operationId);
				this.menu.header(detail, call ? call.name ?? operation?.name ?? row.label : row.label, contract?.name ?? localize('ade.inspector.interaction', "Interaction"), Codicon.symbolMethod);
				detail.classList.add('ade-inspector-tabbed');
				const tabHost = dom.append(detail, dom.$('div.ade-inspector-tabs'));
				const tabs = this.controls.tabs(tabHost, 'interaction-inspector', [
					{ id: 'properties', label: localize('ade.properties', "Properties") },
					{ id: 'behavior', label: localize('ade.inspector.behavior', "Behavior") },
					{ id: 'architecture', label: localize('ade.properties.architecture', "Architecture") }
				]);
				const properties = tabs.panels.get('properties')!, behavior = tabs.panels.get('behavior')!, architecture = tabs.panels.get('architecture')!;
				for (const panel of tabs.panels.values()) { panel.classList.add('ade-inspector-tab-content'); }
				if (this.project.editable && interaction.execution) { this.menu.action(behavior, localize('ade.interaction.edit', "Edit Executable Interaction"), () => this.commandService.executeCommand('ade.interaction', interaction.id), { icon: Codicon.edit, emphasis: 'primary' }); }
				if (this.project.editable && scenario && view && (call || frame || row.kind === 'operand')) {
					const label = call
						? view.kind === 'activity' ? localize('ade.scenario.editStep', "Edit Step") : localize('ade.scenario.editMessage', "Edit Message")
						: row.kind === 'operand' ? localize('ade.scenario.editBranch', "Edit Branch") : localize('ade.scenario.editFrame', "Edit Frame");
					this.menu.action(properties, label, () => this.commandService.executeCommand('ade.editScenario', row.id), { id: `edit-scenario-step:${row.id}`, icon: Codicon.edit, emphasis: 'primary' });
					if (call) {
						const siblings = getScenarioStepSiblings(model, view, call.id);
						const index = siblings.indexOf(call.id);
						this.menu.action(behavior, localize('ade.scenario.moveEarlier', "Move Earlier"), () => this.project.edit({ kind: 'sequenceOrder', viewId: view.id, id: call.id, target: 'message', direction: -1 }), { icon: Codicon.arrowUp }).disabled = index <= 0;
						this.menu.action(behavior, localize('ade.scenario.moveLater', "Move Later"), () => this.project.edit({ kind: 'sequenceOrder', viewId: view.id, id: call.id, target: 'message', direction: 1 }), { icon: Codicon.arrowDown }).disabled = index < 0 || index >= siblings.length - 1;
						this.menu.action(behavior, localize('ade.scenario.removeStep', "Remove Step from Scenario"), () => { this.project.edit({ kind: 'sequenceRemove', viewId: view.id, id: call.id, target: 'message' }); close?.(); }, { icon: Codicon.remove });
					}
				}
				this.menu.info(properties, localize('ade.inspector.interaction', "Interaction"), contract?.name ?? interaction.id);
				if (call) {
					this.menu.info(properties, localize('ade.inspector.source', "Source"), model.semantics.elements.find(element => element.id === call.from)?.name ?? call.from);
					this.menu.info(properties, localize('ade.inspector.target', "Target"), model.semantics.elements.find(element => element.id === call.to)?.name ?? call.to);
					if (call.name || operation) { this.menu.info(properties, localize('ade.name', "Name"), call.name ?? operation!.name); }
				} else if (frame) {
					this.menu.info(properties, localize('ade.inspector.messages', "Messages"), String(frame.occurrenceIds.length));
					if (frame.kind === 'ref') { this.menu.info(properties, localize('ade.inspector.revision', "Referenced Revision"), frame.revision); }
				} else { this.host.paragraph(properties, row.text); }
				this.host.paragraph(behavior, row.text);
				if (operation) { renderBlueprintOperation(behavior, model, operation, this.controls, id => this.project.inspectElement(id)); }
				if (operation) { this.menu.info(architecture, localize('ade.inspector.operation', "Operation"), operation.name, Codicon.symbolMethod); }
				const owners = [...new Set([interaction.ownerId, operation?.ownerId].filter((id): id is string => !!id))];
				for (const id of owners) {
					const owner = model.semantics.elements.find(element => element.id === id);
					this.menu.action(architecture, owner?.name ?? id, () => this.project.inspectElement(id), { id: `interaction-owner:${id}`, kind: 'navigation', icon: owner ? elementIcon(owner.kind) : Codicon.organization, description: localize('ade.inspector.operationOwner', "Interaction or Operation Owner") });
				}
				if (!owners.length && !operation) { dom.append(architecture, dom.$('p.ade-inspector-empty')).textContent = localize('ade.inspector.noInteractionArchitecture', "No operation or architectural owner declared for this step."); }
				const participants = [...new Set(call ? [call.from, call.to] : interaction.ownerId ? [interaction.ownerId] : [])];
				if (participants.length) {
					const footer = dom.append(detail, dom.$('footer.ade-inspector-footer'));
					const explore = this.menu.section(footer, localize('ade.inspector.explore', "Explore"), { compact: true });
					for (const id of participants) {
						const participant = model.semantics.elements.find(element => element.id === id);
						this.menu.action(explore, participant?.name ?? id, () => this.project.selectElement(id), { id: `participant:${id}`, kind: 'navigation', icon: participant ? elementIcon(participant.kind) : Codicon.symbolClass });
					}
				}
				return;
			}
		}
		const element = model.semantics.elements.find(element => element.id === this.project.selectedId);
		if (!element) {
			this.menu.header(detail, localize('ade.properties', "Properties"), undefined, Codicon.info);
			this.host.paragraph(detail, localize('ade.properties.noSelection', "Select an element or relationship in the diagram to view its properties.")); return;
		}
		const ownerId = element.parentId ?? ((model.version === 4 || model.version === 5) ? model.foundation.ownership.find(owner => owner.elementId === element.id)?.ownerId : undefined);
		const ownerName = model.semantics.elements.find(parent => parent.id === ownerId)?.name;
		const header = this.menu.header(detail, element.name, ownerName ? localize('ade.inspector.elementContext', "{0} · {1}", elementLabels[element.kind], ownerName) : elementLabels[element.kind], elementIcon(element.kind));
		if (this.project.editable) {
			this.menu.headerAction(header, localize('ade.menu.rename', "Rename"), () => this.commandService.executeCommand('ade.renameElement'), Codicon.edit, `rename-element-header:${element.id}`);
		}
		detail.classList.add('ade-inspector-tabbed');
		const tabHost = dom.append(detail, dom.$('div.ade-inspector-tabs'));
		const tabs = this.controls.tabs(tabHost, 'element-inspector', [
			{ id: 'properties', label: localize('ade.properties', "Properties") },
			{ id: 'behavior', label: localize('ade.inspector.behavior', "Behavior") },
			{ id: 'architecture', label: localize('ade.properties.architecture', "Architecture") }
		]);
		const properties = tabs.panels.get('properties')!, behavior = tabs.panels.get('behavior')!, architecture = tabs.panels.get('architecture')!;
		for (const panel of tabs.panels.values()) { panel.classList.add('ade-inspector-tab-content'); }
		const canRemoveFromView = !!view && (!interaction || !!scenario) && view.subjectId !== element.id
			&& (scenario ? scenario.description.participantIds.includes(element.id) : view.nodes.some(node => node.elementId === element.id));
		const removeFromDiagram = localize('ade.inspector.removeFromDiagram', "Remove from This Diagram");
		const excludeFromView = (viewId: string) => {
			this.project.edit({ kind: 'exclude', viewId, id: element.id, target: 'element' });
			close?.();
		};
		if (element.description) { dom.append(properties, dom.$('p.ade-inspector-description')).textContent = element.description; }
		if (this.project.editable) {
			this.menu.action(properties, localize('ade.notation.edit', "Edit Attributes and Technology"), () => this.commandService.executeCommand('ade.notation', element.id), { icon: Codicon.symbolField, emphasis: 'primary' });
			if (canRemoveFromView && !scenario && view.kind !== 'state' && view.kind !== 'sequence') {
				this.menu.action(properties, removeFromDiagram, () => excludeFromView(view.id), { id: `remove-visible-element:${element.id}`, icon: Codicon.remove });
			}
		}
		if (element.details?.technology) { this.menu.info(properties, localize('ade.notation.technology', "Technology"), element.details.technology, Codicon.code); }
		if (element.details?.environment) { this.menu.info(properties, localize('ade.notation.environment', "Environment"), element.details.environment, Codicon.symbolProperty); }
		this.renderMembers(properties, element, model);
		this.renderBehavior(behavior, model, element);
		if (this.project.editable) {
			if (model.version === 4 || model.version === 5) { this.menu.action(architecture, localize('ade.blueprint.edit', "Edit Blueprint"), () => this.commandService.executeCommand('ade.blueprint', element.id), { icon: Codicon.edit, emphasis: 'primary' }); }
			else { this.menu.action(architecture, localize('ade.notation.parent', "Change Boundary or Parent"), () => this.commandService.executeCommand('ade.parent', element.id), { icon: Codicon.organization, emphasis: 'primary' }); }
		}
		this.menu.info(architecture, localize('ade.inspector.parent', "Boundary / Parent"), ownerName ?? ownerId ?? localize('ade.inspector.noParent', "Not Declared"), Codicon.organization);
		if (model.version === 4 || model.version === 5) {
			if (this.project.editable) {
				const edit = this.menu.disclosure(architecture, localize('ade.inspector.editArchitecture', "Edit Architecture"), `element-architecture:${element.id}`, { icon: Codicon.edit });
				for (const property of specificationEditors(model, element.id)) { this.menu.action(edit, property.label, () => this.commandService.executeCommand('ade.blueprint', element.id, property.mode), { id: `property:${property.mode}:${element.id}`, icon: Codicon.edit }); }
			}
			const generation = this.menu.disclosure(architecture, localize('ade.properties.generation', "Code Generation"), `element-generation:${element.id}`, { icon: Codicon.code });
			if (this.project.editable) {
				this.menu.action(generation, localize('ade.predicate.edit', "Edit Pure Predicate"), () => this.commandService.executeCommand('ade.predicate', element.id), { icon: Codicon.symbolMethod });
				this.menu.action(generation, localize('ade.task.preview', "Structural AI Context Preview"), () => this.commandService.executeCommand('ade.prepareStructuralContext'), { icon: Codicon.search });
			}
			if (this.project.taskPreview) { renderModelTaskPreview(generation, this.project.taskPreview, this.controls); }
			for (const diagnostic of this.project.readiness(element.id).diagnostics) {
				const label = readinessDiagnosticMessage(model, diagnostic);
				if (this.project.editable) {
					const route = readinessEditor(diagnostic);
					this.menu.action(generation, label, () => this.commandService.executeCommand(route.command, diagnostic.object?.id ?? element.id, route.mode), { id: `readiness:${diagnostic.code}:${diagnostic.object?.id}:${diagnostic.field}`, icon: Codicon.warning });
				} else { this.host.paragraph(generation, label); }
			}
			if (this.project.editable) {
				const technical = this.menu.disclosure(architecture, localize('ade.properties.technical', "Technical Details"), `element-technical:${element.id}`, { icon: Codicon.fileCode });
				this.menu.action(technical, localize('ade.openModelSource', "Edit Model Specification"), () => this.commandService.executeCommand('ade.openModelSource'), { icon: Codicon.fileCode });
			}
			renderBlueprintDetails(architecture, model, element.id, this.controls, (viewId, elementId) => { this.project.showDiagram(viewId); this.project.selectElement(elementId); }, id => this.project.inspectElement(id));
		}
		const relations = model.semantics.relations.filter(relation => relation.from === element.id || relation.to === element.id);
		const relationships = this.menu.section(architecture, localize('ade.inspector.relationships', "Relationships"), { compact: true });
		if (!relations.length) { dom.append(relationships, dom.$('p.ade-inspector-empty')).textContent = localize('ade.inspector.noRelationships', "No relationships declared."); }
		for (const relation of relations) { this.renderElementRelation(relationships, model, element, relation, view, !!interaction, !!scenario); }
		const footer = dom.append(detail, dom.$('footer.ade-inspector-footer'));
		const explore = this.menu.section(footer, localize('ade.inspector.explore', "Explore"), { compact: true });
		if (this.code.context) { this.menu.action(explore, localize('ade.openSource', "Open Source"), () => this.code.inspect(element.id), { id: `source:${element.id}`, kind: 'navigation', icon: Codicon.goToFile }).disabled = this.code.busy; }
		if (this.project.section !== 'impact') { this.menu.action(explore, localize('ade.showImpact.button', "Show Change Impact"), () => this.project.showImpact(element.id), { id: 'show-impact', kind: 'navigation', icon: Codicon.references }); }
		if (this.project.section === 'diagram') { this.menu.action(explore, localize('ade.elementDetails', "Element Details"), () => this.project.inspectElement(element.id), { kind: 'navigation', icon: Codicon.info }); }
		if (element.kind === 'state' && element.parentId) {
			const resource = model.semantics.elements.find(candidate => candidate.id === element.parentId && candidate.kind === 'resource');
			if (resource) { this.menu.action(explore, localize('ade.state.resource', "Resource: {0}", resource.name), () => this.project.inspectElement(resource.id), { id: `state-owner:${resource.id}`, kind: 'navigation', icon: elementIcon(resource.kind) }); }
		}
		if (this.project.editable && this.host.beginConnection && view && !interaction && (view.kind !== 'state' || element.kind === 'state')) {
			this.menu.action(footer, localize('ade.inspector.createOnCanvas', "Create Relationship on Canvas…"), () => this.host.beginConnection?.(element.id), { id: `canvas-connect:${element.id}`, icon: Codicon.link, description: localize('ade.inspector.createOnCanvasHelp', "Choose the target directly in the diagram") });
		}
		const views = model.views.filter(candidate => getViewSelectionIds(model, candidate).includes(element.id));
		if (views.length) {
			const perspectives = this.menu.disclosure(footer, localize('ade.elementViews', "Diagrams Containing This Element"), `element-views:${element.id}`, { icon: Codicon.graph });
			for (const candidate of views) { this.menu.action(perspectives, candidate.name, () => this.host.revealElement(element.id, candidate.id), { id: `element-view:${candidate.id}`, kind: 'navigation', current: candidate.id === view?.id, icon: diagramIcon(candidate.kind) }); }
		} else if (element.kind !== 'feature') { this.host.paragraph(explore, localize('ade.notPlaced', "This element is not placed in a diagram.")); }
		if (this.project.editable) {
			if (view && !interaction && (view.kind !== 'state' || element.kind === 'state')) { this.menu.action(footer, localize('ade.connectSelection', "Connect Selection"), () => this.commandService.executeCommand('ade.connect'), { icon: Codicon.link, description: localize('ade.inspector.connectFormHelp', "Choose the endpoints and details in a form") }); }
			if (canRemoveFromView && scenario) {
				this.menu.action(footer, view.kind === 'activity' ? localize('ade.scenario.addStep', "Add Step") : localize('ade.scenario.addMessage', "Add Message"), () => this.commandService.executeCommand('ade.connect', element.id), { icon: Codicon.link });
			}
			const manage = this.manage(footer, `element-manage:${element.id}`, localize('ade.inspector.moreElementActions', "More Element Actions"));
			const edit = this.menu.section(manage, localize('ade.inspector.edit', "Edit"), { compact: true });
			this.menu.action(edit, localize('ade.renameElement', "Rename Element"), () => this.commandService.executeCommand('ade.renameElement'), { icon: Codicon.edit });
			this.menu.action(edit, localize('ade.editDescription', "Edit Description"), () => this.commandService.executeCommand('ade.description'), { icon: Codicon.info });
			if (view && (canRemoveFromView || !interaction && (view.kind === 'state' || view.kind === 'sequence'))) {
				const diagram = this.menu.section(manage, localize('ade.inspector.inDiagram', "In This Diagram"), { compact: true });
				if (view.kind === 'sequence' || scenario) {
					const participants = scenario?.description.participantIds ?? view.nodes.map(node => node.elementId);
					const index = participants.indexOf(element.id);
					this.menu.action(diagram, localize('ade.sequence.left', "Move Participant Left"), () => this.project.edit({ kind: 'sequenceOrder', viewId: view.id, id: element.id, target: 'participant', direction: -1 }), { icon: Codicon.arrowLeft }).disabled = index <= 0;
					this.menu.action(diagram, localize('ade.sequence.right', "Move Participant Right"), () => this.project.edit({ kind: 'sequenceOrder', viewId: view.id, id: element.id, target: 'participant', direction: 1 }), { icon: Codicon.arrowRight }).disabled = index < 0 || index === participants.length - 1;
					this.menu.action(diagram, scenario ? localize('ade.scenario.removeParticipantAction', "Remove Participant") : localize('ade.sequence.removeParticipant', "Remove Participant from Diagram"), () => {
						if (scenario) { return this.commandService.executeCommand('ade.removeElementFromDiagram', element.id); }
						this.project.edit({ kind: 'sequenceRemove', viewId: view.id, id: element.id, target: 'participant' });
						close?.();
						return undefined;
					}, { icon: Codicon.remove });
				} else {
					const label = view.kind === 'state' ? element.kind === 'state' ? localize('ade.state.removeState', "Remove State from Diagram") : localize('ade.state.removeContext', "Remove Element from Diagram") : removeFromDiagram;
					this.menu.action(diagram, label, () => excludeFromView(view.id), { icon: Codicon.remove });
				}
			}
			const danger = this.menu.section(manage, localize('ade.inspector.deleteFromSystem', "Delete from System"), { tone: 'danger', compact: true, description: localize('ade.inspector.deleteElementHelp', "Affects every diagram containing this element.") });
			this.menu.action(danger, localize('ade.deleteElement', "Delete Element"), () => this.commandService.executeCommand('ade.deleteElement'), { kind: 'destructive', icon: Codicon.trash });
		}
	}

	private manage(parent: HTMLElement, id: string, label: string): HTMLElement {
		const body = this.menu.disclosure(parent, localize('ade.inspector.manage', "Manage"), id, { icon: Codicon.settingsGear });
		body.parentElement!.firstElementChild!.setAttribute('aria-label', label);
		return body;
	}

	private renderMembers(parent: HTMLElement, element: SemanticElement, model: SemanticModel): void {
		const members = element.details?.members ?? [];
		if (!members.length) { dom.append(parent, dom.$('p.ade-inspector-empty')).textContent = localize('ade.inspector.noMembers', "No attributes or methods declared."); return; }
		const table = dom.append(parent, dom.$<HTMLTableElement>('table.ade-inspector-members', { 'aria-label': localize('ade.notation.members', "Attributes and Methods") }));
		const heading = dom.append(dom.append(table, dom.$('thead')), dom.$('tr'));
		for (const label of [localize('ade.name', "Name"), localize('ade.inspector.type', "Type"), localize('ade.properties', "Properties")]) { dom.append(heading, dom.$('th', { scope: 'col' })).textContent = label; }
		const body = dom.append(table, dom.$('tbody'));
		const keys = { none: '', primary: localize('ade.notation.pk', "Primary Key"), foreign: localize('ade.notation.fk', "Foreign Key"), unique: localize('ade.notation.unique', "Unique Key") };
		for (const member of members) {
			const row = dom.append(body, dom.$('tr'));
			dom.append(row, dom.$('th', { scope: 'row' })).textContent = member.kind === 'method' ? localize('ade.inspector.methodName', "{0}()", member.name) : member.name;
			const typeName = (model.version === 4 || model.version === 5) ? model.foundation.types.find(type => type.id === member.typeId)?.name : undefined;
			dom.append(row, dom.$('td')).textContent = typeName || member.type || localize('ade.inspector.unspecified', "Not Specified");
			const metadata = dom.append(row, dom.$('td.ade-inspector-member-properties'));
			if (member.key !== 'none') { dom.append(metadata, dom.$('span.ade-inspector-member-key')).textContent = keys[member.key]; }
			dom.append(metadata, dom.$('span')).textContent = member.required ? localize('ade.field.required', "Required") : localize('ade.field.optional', "Optional");
			if (model.version >= 4) {
				dom.append(metadata, dom.$('span')).textContent = member.nullable?.state === 'known' ? member.nullable.value === true ? localize('ade.notation.null', "Null Allowed") : localize('ade.notation.notNull', "Non-null Value") : localize('ade.inspector.nullabilityUnknown', "Nullability Unknown");
			}
		}
	}

	private renderBehavior(parent: HTMLElement, model: SemanticModel, element: SemanticElement): void {
		if (this.project.editable) { this.menu.action(parent, localize('ade.editBehavior', "Edit Behavioral Contract"), () => this.commandService.executeCommand('ade.behavior'), { icon: Codicon.symbolMethod, emphasis: 'primary' }); }
		const behavior = element.behavior;
		if (!behavior || ![behavior.inputs, behavior.outputs, behavior.preconditions, behavior.postconditions, behavior.errors, behavior.permissions, behavior.acceptanceCriteria].some(entries => entries.length)) {
			dom.append(parent, dom.$('p.ade-inspector-empty')).textContent = localize('ade.inspector.noBehavior', "No behavioral declarations yet.");
		} else {
			this.host.paragraph(parent, localize('ade.behavior.intent', "Contract declarations describe expected behavior."));
			if (behavior.inputs.length) {
				const inputs = this.menu.section(parent, localize('ade.behavior.inputs', "Inputs"), { compact: true });
				for (const field of behavior.inputs) { this.host.paragraph(inputs, localize('ade.input', "Input: {0} ({1}), {2}", field.name, field.type, field.required ? localize('ade.field.required', "Required") : localize('ade.field.optional', "Optional"))); }
			}
			if (behavior.outputs.length) {
				const outputs = this.menu.section(parent, localize('ade.behavior.outputs', "Outputs"), { compact: true });
				for (const field of behavior.outputs) { this.host.paragraph(outputs, localize('ade.output', "Output: {0} ({1}), {2}", field.name, field.type, field.required ? localize('ade.field.required', "Required") : localize('ade.field.optional', "Optional"))); }
			}
			if (behavior.preconditions.length || behavior.postconditions.length) {
				const conditions = this.menu.section(parent, localize('ade.inspector.conditions', "Conditions"), { compact: true });
				for (const condition of behavior.preconditions) { this.host.paragraph(conditions, localize('ade.precondition', "Precondition: {0}", condition)); }
				for (const condition of behavior.postconditions) { this.host.paragraph(conditions, localize('ade.postcondition', "Postcondition: {0}", condition)); }
			}
			if (behavior.errors.length) {
				const errors = this.menu.section(parent, localize('ade.behavior.errors', "Errors"), { compact: true });
				for (const error of behavior.errors) { this.host.paragraph(errors, localize('ade.behavior.error', "Error {0}: {1}", error.code, error.description)); }
			}
			if (behavior.permissions.length) {
				const permissions = this.menu.section(parent, localize('ade.inspector.permissions', "Permissions"), { compact: true });
				for (const permission of behavior.permissions) { this.host.paragraph(permissions, localize('ade.permission', "Authorization: {0} · {1}", model.semantics.elements.find(element => element.id === permission.actorId)?.name ?? permission.actorId, permission.capability)); }
			}
			if (behavior.acceptanceCriteria.length) {
				const criteria = this.menu.section(parent, localize('ade.inspector.criteria', "Acceptance Criteria"), { compact: true });
				for (const criterion of behavior.acceptanceCriteria) { this.host.paragraph(criteria, localize('ade.acceptance', "Given {0}, when {1}, then {2}.", criterion.given, criterion.when, criterion.then)); }
			}
		}
		renderRecordedEvidence(parent, model, element.id, this.controls);
	}

	private renderElementRelation(parent: HTMLElement, model: SemanticModel, element: SemanticElement, relation: SemanticRelation, view: ModelView | undefined, interaction: boolean, scenario: boolean): void {
		const from = model.semantics.elements.find(element => element.id === relation.from)!, to = model.semantics.elements.find(element => element.id === relation.to)!;
		const label = localize('ade.relation', "{0} → {1}: {2}", from.name, to.name, relation.name || relation.kind);
		const detail = this.menu.disclosure(parent, relation.name || relationLabels[relation.kind], `relation-actions:${relation.id}`, { icon: Codicon.link, description: localize('ade.inspector.relationEndpoints', "{0} → {1}", from.name, to.name) });
		if (this.project.editable) {
			const edit = this.menu.section(detail, localize('ade.inspector.edit', "Edit"), { compact: true });
			if (relation.kind === 'transition') { this.menu.action(edit, localize('ade.state.editEvent', "Edit Transition Event"), () => this.commandService.executeCommand('ade.renameRelation', relation.id), { id: `event:${relation.id}`, icon: Codicon.symbolEvent }); }
			this.menu.action(edit, localize('ade.editCondition', "Edit Condition"), () => this.commandService.executeCommand('ade.condition', relation.id), { id: `condition:${relation.id}`, icon: Codicon.edit });
			this.menu.action(edit, localize('ade.editRelationError', "Edit Relationship Error"), () => this.commandService.executeCommand('ade.relationError', relation.id), { id: `error:${relation.id}`, icon: Codicon.warning });
		}
		this.menu.action(detail, label, () => this.host.revealElement(relation.from === element.id ? relation.to : relation.from), { id: `relation:${relation.id}`, kind: 'navigation', icon: Codicon.arrowRight });
		if (relation.condition) { this.menu.info(detail, localize('ade.inspector.condition', "Condition"), relation.condition); }
		if (relation.errorCode) { this.menu.info(detail, localize('ade.inspector.error', "Error"), relation.errorCode); }
		if (!this.project.editable) { return; }

		if (view && view.relationIds.includes(relation.id) && (scenario || !interaction && (view.kind === 'sequence' || view.kind === 'state'))) {
			const diagram = this.menu.section(detail, localize('ade.inspector.inDiagram', "In This Diagram"), { compact: true });
			if (scenario) { this.menu.action(diagram, localize('ade.state.removeTransition', "Remove Relationship from Diagram"), () => this.commandService.executeCommand('ade.removeRelationFromDiagram', relation.id), { id: `exclude:${relation.id}`, icon: Codicon.remove }); }
			else { this.renderRelationDiagramActions(diagram, model, view, relation); }
		}
		const danger = this.menu.section(detail, localize('ade.inspector.deleteFromSystem', "Delete from System"), { tone: 'danger', compact: true });
		this.menu.action(danger, localize('ade.deleteRelationship', "Delete Relationship"), () => this.commandService.executeCommand('ade.deleteRelation', relation.id), { id: `delete:${relation.id}`, kind: 'destructive', icon: Codicon.trash });
	}

	private renderRelationDiagramActions(parent: HTMLElement, model: SemanticModel, view: ModelView, relation: SemanticRelation): void {
		if (view.kind === 'sequence') {
			const messages = getSequenceDiagram(model, view).messages;
			const index = messages.findIndex(message => message.id === relation.id);
			this.menu.action(parent, localize('ade.sequence.earlier', "Move Message Earlier"), () => this.project.edit({ kind: 'sequenceOrder', viewId: view.id, id: relation.id, target: 'message', direction: -1 }), { id: `earlier:${relation.id}`, icon: Codicon.arrowUp }).disabled = index <= 0;
			this.menu.action(parent, localize('ade.sequence.later', "Move Message Later"), () => this.project.edit({ kind: 'sequenceOrder', viewId: view.id, id: relation.id, target: 'message', direction: 1 }), { id: `later:${relation.id}`, icon: Codicon.arrowDown }).disabled = index < 0 || index === messages.length - 1;
			this.menu.action(parent, localize('ade.sequence.removeMessage', "Remove Message from Diagram"), () => this.project.edit({ kind: 'sequenceRemove', viewId: view.id, id: relation.id, target: 'message' }), { id: `remove-message:${relation.id}`, icon: Codicon.remove });
		} else {
			this.menu.action(parent, localize('ade.state.removeTransition', "Remove Relationship from Diagram"), () => this.project.edit({ kind: 'exclude', viewId: view.id, id: relation.id, target: 'relation' }), { id: `exclude:${relation.id}`, icon: Codicon.remove });
		}
	}

	renderRelationProperties(parent: HTMLElement, id: string): void {
		const model = this.project.model;
		const relation = model.semantics.relations.find(relation => relation.id === id);
		if (!relation) { return; }
		parent.setAttribute('aria-label', localize('ade.relationshipProperties', "Relationship Properties"));
		parent.classList.add('ade-inspector-sheet', 'ade-inspector-tabbed');
		this.menu.header(parent, relation.name || relationLabels[relation.kind], relationLabels[relation.kind], Codicon.link);
		const tabHost = dom.append(parent, dom.$('div.ade-inspector-tabs'));
		const tabs = this.controls.tabs(tabHost, 'relation-inspector', [
			{ id: 'properties', label: localize('ade.properties', "Properties") },
			{ id: 'behavior', label: localize('ade.inspector.behavior', "Behavior") },
			{ id: 'architecture', label: localize('ade.properties.architecture', "Architecture") }
		]);
		const properties = tabs.panels.get('properties')!, behavior = tabs.panels.get('behavior')!, architecture = tabs.panels.get('architecture')!;
		for (const panel of tabs.panels.values()) { panel.classList.add('ade-inspector-tab-content'); }
		const from = model.semantics.elements.find(element => element.id === relation.from)!, to = model.semantics.elements.find(element => element.id === relation.to)!;
		if (this.project.editable) { this.menu.action(properties, localize('ade.notation.editRelation', "Edit Cardinalities and Protocol"), () => this.commandService.executeCommand('ade.relationNotation', id), { icon: Codicon.symbolProperty, emphasis: 'primary' }); }
		if (this.project.editable) { this.menu.action(architecture, localize('ade.notation.editRelation', "Edit Cardinalities and Protocol"), () => this.commandService.executeCommand('ade.relationNotation', id), { id: `relation-protocol:${id}`, icon: Codicon.symbolProperty, emphasis: 'primary' }); }
		this.menu.info(architecture, localize('ade.inspector.source', "Source"), from.name, elementIcon(from.kind));
		this.menu.info(architecture, localize('ade.inspector.target', "Target"), to.name, elementIcon(to.kind));
		if (this.project.editable) {
			if (relation.kind === 'transition') { this.menu.action(behavior, localize('ade.state.editEvent', "Edit Transition Event"), () => this.commandService.executeCommand('ade.renameRelation', id), { id: `event:${id}`, icon: Codicon.symbolEvent }); }
			this.menu.action(behavior, localize('ade.editCondition', "Edit Condition"), () => this.commandService.executeCommand('ade.condition', id), { id: `condition:${id}`, icon: Codicon.edit });
			this.menu.action(behavior, localize('ade.editRelationError', "Edit Relationship Error"), () => this.commandService.executeCommand('ade.relationError', id), { id: `error:${id}`, icon: Codicon.warning });
		}
		this.menu.info(behavior, localize('ade.inspector.condition', "Condition"), relation.condition || localize('ade.inspector.noCondition', "No Condition Declared"));
		this.menu.info(behavior, localize('ade.inspector.error', "Error"), relation.errorCode || localize('ade.inspector.noError', "No Error Assigned"));
		if (relation.kind === 'transition') { this.menu.info(behavior, localize('ade.inspector.transitionEvent', "Transition Event"), relation.name || localize('ade.inspector.unspecified', "Not Specified")); }

		if (relation.details) {
			for (const [key, label] of [
				['sourceMultiplicity', localize('ade.notation.sourceMultiplicity', "Source Multiplicity")],
				['targetMultiplicity', localize('ade.notation.targetMultiplicity', "Target Multiplicity")],
				['sourceMember', localize('ade.notation.sourceColumn', "Source Attribute / Column")],
				['targetMember', localize('ade.notation.targetColumn', "Target Attribute / Column")]
			] as const) { if (relation.details[key]) { this.menu.info(properties, label, relation.details[key]); } }
		} else { dom.append(properties, dom.$('p.ade-inspector-empty')).textContent = localize('ade.inspector.noRelationNotation', "No cardinalities or attribute mappings declared."); }
		this.menu.info(architecture, localize('ade.notation.protocol', "Protocol / Transport"), relation.details?.protocol || localize('ade.inspector.unspecified', "Not Specified"));
		if (model.version === 4 || model.version === 5) {
			for (const transport of model.foundation.blueprint?.transports.filter(transport => transport.relationId === id) ?? []) { this.host.paragraph(architecture, localize('ade.blueprint.transportDetails', "Transport: {0} · Payload: {1} · Schema: {2} · Version: {3}", transport.protocol, transport.format, model.foundation.types.find(type => type.id === transport.schemaTypeId)?.name ?? '', transport.schemaVersion)); }
		}
		const footer = dom.append(parent, dom.$('footer.ade-inspector-footer'));
		if (this.project.editable) { this.menu.action(footer, localize('ade.context.editRelation', "Edit Relationship…"), () => this.commandService.executeCommand('ade.editRelation', id), { icon: Codicon.edit, emphasis: 'primary' }); }
		const explore = this.menu.section(footer, localize('ade.inspector.explore', "Explore"), { compact: true });
		for (const endpoint of [{ element: from, role: 'source', label: localize('ade.inspector.source', "Source") }, { element: to, role: 'target', label: localize('ade.inspector.target', "Target") }]) { this.menu.action(explore, endpoint.element.name, () => this.host.revealElement(endpoint.element.id), { id: `relationship-${endpoint.role}:${id}`, kind: 'navigation', icon: elementIcon(endpoint.element.kind), description: endpoint.label }); }
		if (this.project.editable) {
			const manage = this.manage(footer, `relation-manage:${id}`, localize('ade.inspector.moreRelationActions', "More Relationship Actions"));
			const view = this.project.activeView;
			const scenario = view && getEditableScenario(model, view);
			if (view?.relationIds.includes(id) && (scenario || !getProjectedInteraction(model, view))) {
				const diagram = this.menu.section(manage, localize('ade.inspector.inDiagram', "In This Diagram"), { compact: true });
				if (!scenario && (view.kind === 'sequence' || view.kind === 'state')) { this.renderRelationDiagramActions(diagram, model, view, relation); }
				else { this.menu.action(diagram, localize('ade.state.removeTransition', "Remove Relationship from Diagram"), () => this.project.edit({ kind: 'exclude', viewId: view.id, id, target: 'relation' }), { id: `exclude:${id}`, icon: Codicon.remove }); }
			}
			const danger = this.menu.section(manage, localize('ade.inspector.deleteFromSystem', "Delete from System"), { tone: 'danger', compact: true, description: localize('ade.inspector.deleteRelationHelp', "Removes this relationship from every diagram.") });
			this.menu.action(danger, localize('ade.deleteRelationship', "Delete Relationship"), () => this.commandService.executeCommand('ade.deleteRelation', id), { id: `delete:${id}`, kind: 'destructive', icon: Codicon.trash });
		}
	}

	constructor(
		private readonly host: AdeInspectorHost,
		private readonly controls: AdeControls,
		private readonly project: AdeProjectService,
		private readonly code: IAdeCodeService,
		private readonly commandService: ICommandService
	) { this.menu = new AdeActionMenu(controls); }
}
