import { localize } from '../../../../nls.js';
import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ModelView, SemanticElement, SemanticModel, SemanticRelation } from '../common/modelTypes.js';
import { IOrditoCodeService } from './orditoCodeService.js';
import { renderModelTaskPreview } from './orditoTaskPreview.js';
import { specificationEditors } from './orditoSpecificationContent.js';
import { readinessDiagnosticMessage, readinessEditor } from './orditoDiagnostics.js';
import { OrditoProjectService } from './orditoProjectService.js';
import { renderBlueprintDetails, renderBlueprintOperation } from './orditoBlueprintDetails.js';
import { getEditableScenario, getProjectedInteraction, getViewSelectionIds } from '../common/visualNavigation.js';
import { getScenarioStepSiblings } from '../common/visualEditScenario.js';
import { orditoInteractionRows } from './orditoInteractionContent.js';
import { OrditoControls } from './orditoControls.js';
import { OrditoActionMenu } from './orditoActionMenu.js';
import { diagramIcon, elementIcon } from './orditoIcons.js';
import { elementLabels, relationLabels } from './orditoLabels.js';
import { getSequenceDiagram } from '../common/sequenceDiagram.js';
import { renderRecordedEvidence } from './orditoImpact.js';

interface OrditoInspectorHost {
	paragraph(parent: HTMLElement, content: string): void;
	button(parent: HTMLElement, label: string, action: () => void, id?: string): HTMLButtonElement;
	readonly root: HTMLElement;
	revealElement(id: string, viewId?: string): void;
	beginConnection?(id: string): Promise<void>;
	relationMenu(id: string, x: number, y: number): void;
}

/** Presents contextual facts, editing and navigation as a structured information sheet. */
export class OrditoInspector {
	private readonly menu: OrditoActionMenu;

	renderProperties(detail: HTMLElement, model: SemanticModel, view?: ModelView, close?: () => void): void {
		detail.setAttribute('aria-label', localize('ordito.properties', "Properties"));
		detail.classList.add('ordito-inspector-sheet');
		const interaction = view && getProjectedInteraction(model, view);
		const scenario = view && getEditableScenario(model, view);
		if (interaction && (model.version === 4 || model.version === 5)) {
			const row = orditoInteractionRows(model, interaction.id).find(row => row.id === this.project.selectedId);
			if (row) {
				const call = model.foundation.occurrences.find(call => call.id === row.id);
				const frame = model.foundation.frames.find(frame => frame.id === row.id);
				const referenced = frame?.kind === 'ref' ? model.foundation.interactions.find(entry => entry.id === frame.interactionId) : undefined;
				const operation = model.foundation.blueprint?.operations.find(operation => operation.id === (call?.operationId ?? referenced?.execution?.operationId));
				const contract = model.foundation.blueprint?.operations.find(operation => operation.id === interaction.execution?.operationId);
				this.menu.header(detail, call ? call.name ?? operation?.name ?? row.label : row.label, contract?.name ?? localize('ordito.inspector.interaction', "Interaction"), Codicon.symbolMethod);
				detail.classList.add('ordito-inspector-tabbed');
				const tabHost = dom.append(detail, dom.$('div.ordito-inspector-tabs'));
				const tabs = this.controls.tabs(tabHost, 'interaction-inspector', [
					{ id: 'properties', label: localize('ordito.properties', "Properties") },
					{ id: 'behavior', label: localize('ordito.inspector.behavior', "Behavior") },
					{ id: 'architecture', label: localize('ordito.properties.architecture', "Architecture") }
				]);
				const properties = tabs.panels.get('properties')!, behavior = tabs.panels.get('behavior')!, architecture = tabs.panels.get('architecture')!;
				for (const panel of tabs.panels.values()) { panel.classList.add('ordito-inspector-tab-content'); }
				if (this.project.editable && interaction.execution) { this.menu.action(behavior, localize('ordito.interaction.edit', "Edit Executable Interaction"), () => this.commandService.executeCommand('ordito.interaction', interaction.id), { icon: Codicon.edit, emphasis: 'primary' }); }
				if (this.project.editable && scenario && view && (call || frame || row.kind === 'operand')) {
					const label = call
						? view.kind === 'activity' ? localize('ordito.scenario.editStep', "Edit Step") : localize('ordito.scenario.editMessage', "Edit Message")
						: row.kind === 'operand' ? localize('ordito.scenario.editBranch', "Edit Branch") : localize('ordito.scenario.editFrame', "Edit Frame");
					this.menu.action(properties, label, () => this.commandService.executeCommand('ordito.editScenario', row.id), { id: `edit-scenario-step:${row.id}`, icon: Codicon.edit, emphasis: 'primary' });
					if (call) {
						const siblings = getScenarioStepSiblings(model, view, call.id);
						const index = siblings.indexOf(call.id);
						this.menu.action(behavior, localize('ordito.scenario.moveEarlier', "Move Earlier"), () => this.project.edit({ kind: 'sequenceOrder', viewId: view.id, id: call.id, target: 'message', direction: -1 }), { icon: Codicon.arrowUp }).disabled = index <= 0;
						this.menu.action(behavior, localize('ordito.scenario.moveLater', "Move Later"), () => this.project.edit({ kind: 'sequenceOrder', viewId: view.id, id: call.id, target: 'message', direction: 1 }), { icon: Codicon.arrowDown }).disabled = index < 0 || index >= siblings.length - 1;
						this.menu.action(behavior, localize('ordito.scenario.removeStep', "Remove Step from Scenario"), () => { this.project.edit({ kind: 'sequenceRemove', viewId: view.id, id: call.id, target: 'message' }); close?.(); }, { icon: Codicon.remove });
					}
				}
				this.menu.info(properties, localize('ordito.inspector.interaction', "Interaction"), contract?.name ?? interaction.id);
				if (call) {
					this.menu.info(properties, localize('ordito.inspector.source', "Source"), model.semantics.elements.find(element => element.id === call.from)?.name ?? call.from);
					this.menu.info(properties, localize('ordito.inspector.target', "Target"), model.semantics.elements.find(element => element.id === call.to)?.name ?? call.to);
					if (call.name || operation) { this.menu.info(properties, localize('ordito.name', "Name"), call.name ?? operation!.name); }
				} else if (frame) {
					this.menu.info(properties, localize('ordito.inspector.messages', "Messages"), String(frame.occurrenceIds.length));
					if (frame.kind === 'ref') { this.menu.info(properties, localize('ordito.inspector.revision', "Referenced Revision"), frame.revision); }
				} else { this.host.paragraph(properties, row.text); }
				this.host.paragraph(behavior, row.text);
				if (operation) { renderBlueprintOperation(behavior, model, operation, this.controls, id => this.project.inspectElement(id)); }
				if (operation) { this.menu.info(architecture, localize('ordito.inspector.operation', "Operation"), operation.name, Codicon.symbolMethod); }
				const owners = [...new Set([interaction.ownerId, operation?.ownerId].filter((id): id is string => !!id))];
				for (const id of owners) {
					const owner = model.semantics.elements.find(element => element.id === id);
					this.menu.action(architecture, owner?.name ?? id, () => this.project.inspectElement(id), { id: `interaction-owner:${id}`, kind: 'navigation', icon: owner ? elementIcon(owner.kind) : Codicon.organization, description: localize('ordito.inspector.operationOwner', "Interaction or Operation Owner") });
				}
				if (!owners.length && !operation) { dom.append(architecture, dom.$('p.ordito-inspector-empty')).textContent = localize('ordito.inspector.noInteractionArchitecture', "No operation or architectural owner declared for this step."); }
				const participants = [...new Set(call ? [call.from, call.to] : interaction.ownerId ? [interaction.ownerId] : [])];
				if (participants.length) {
					const footer = dom.append(detail, dom.$('footer.ordito-inspector-footer'));
					const explore = this.menu.section(footer, localize('ordito.inspector.explore', "Explore"), { compact: true });
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
			this.menu.header(detail, localize('ordito.properties', "Properties"), undefined, Codicon.info);
			this.host.paragraph(detail, localize('ordito.properties.noSelection', "Select an element or relationship in the diagram to view its properties.")); return;
		}
		const ownerId = element.parentId ?? ((model.version === 4 || model.version === 5) ? model.foundation.ownership.find(owner => owner.elementId === element.id)?.ownerId : undefined);
		const ownerName = model.semantics.elements.find(parent => parent.id === ownerId)?.name;
		const header = this.menu.header(detail, element.name, ownerName ? localize('ordito.inspector.elementContext', "{0} · {1}", elementLabels[element.kind], ownerName) : elementLabels[element.kind], elementIcon(element.kind));
		if (this.project.editable) {
			this.menu.headerAction(header, localize('ordito.menu.rename', "Rename"), () => this.commandService.executeCommand('ordito.renameElement'), Codicon.edit, `rename-element-header:${element.id}`);
		}
		detail.classList.add('ordito-inspector-tabbed');
		const tabHost = dom.append(detail, dom.$('div.ordito-inspector-tabs'));
		const tabs = this.controls.tabs(tabHost, 'element-inspector', [
			{ id: 'properties', label: localize('ordito.properties', "Properties") },
			{ id: 'behavior', label: localize('ordito.inspector.behavior', "Behavior") },
			{ id: 'architecture', label: localize('ordito.properties.architecture', "Architecture") }
		]);
		const properties = tabs.panels.get('properties')!, behavior = tabs.panels.get('behavior')!, architecture = tabs.panels.get('architecture')!;
		for (const panel of tabs.panels.values()) { panel.classList.add('ordito-inspector-tab-content'); }
		const canRemoveFromView = !!view && (!interaction || !!scenario) && view.subjectId !== element.id
			&& (scenario ? scenario.description.participantIds.includes(element.id) : view.nodes.some(node => node.elementId === element.id));
		const removeFromDiagram = localize('ordito.inspector.removeFromDiagram', "Remove from This Diagram");
		const excludeFromView = (viewId: string) => {
			this.project.edit({ kind: 'exclude', viewId, id: element.id, target: 'element' });
			close?.();
		};
		if (element.description) { dom.append(properties, dom.$('p.ordito-inspector-description')).textContent = element.description; }
		if (this.project.editable) {
			this.menu.action(properties, localize('ordito.notation.edit', "Edit Attributes and Technology"), () => this.commandService.executeCommand('ordito.notation', element.id), { icon: Codicon.symbolField, emphasis: 'primary' });
			if (canRemoveFromView && !scenario && view.kind !== 'state' && view.kind !== 'sequence') {
				this.menu.action(properties, removeFromDiagram, () => excludeFromView(view.id), { id: `remove-visible-element:${element.id}`, icon: Codicon.remove });
			}
		}
		if (element.details?.technology) { this.menu.info(properties, localize('ordito.notation.technology', "Technology"), element.details.technology, Codicon.code); }
		if (element.details?.environment) { this.menu.info(properties, localize('ordito.notation.environment', "Environment"), element.details.environment, Codicon.symbolProperty); }
		this.renderMembers(properties, element, model);
		this.renderBehavior(behavior, model, element);
		if (this.project.editable) {
			if (model.version === 4 || model.version === 5) { this.menu.action(architecture, localize('ordito.blueprint.edit', "Edit Blueprint"), () => this.commandService.executeCommand('ordito.blueprint', element.id), { icon: Codicon.edit, emphasis: 'primary' }); }
			else { this.menu.action(architecture, localize('ordito.notation.parent', "Change Boundary or Parent"), () => this.commandService.executeCommand('ordito.parent', element.id), { icon: Codicon.organization, emphasis: 'primary' }); }
		}
		this.menu.info(architecture, localize('ordito.inspector.parent', "Boundary / Parent"), ownerName ?? ownerId ?? localize('ordito.inspector.noParent', "Not Declared"), Codicon.organization);
		if (model.version === 4 || model.version === 5) {
			if (this.project.editable) {
				const edit = this.menu.disclosure(architecture, localize('ordito.inspector.editArchitecture', "Edit Architecture"), `element-architecture:${element.id}`, { icon: Codicon.edit });
				for (const property of specificationEditors(model, element.id)) { this.menu.action(edit, property.label, () => this.commandService.executeCommand('ordito.blueprint', element.id, property.mode), { id: `property:${property.mode}:${element.id}`, icon: Codicon.edit }); }
			}
			const generation = this.menu.disclosure(architecture, localize('ordito.properties.generation', "Code Generation"), `element-generation:${element.id}`, { icon: Codicon.code });
			if (this.project.editable) {
				this.menu.action(generation, localize('ordito.predicate.edit', "Edit Pure Predicate"), () => this.commandService.executeCommand('ordito.predicate', element.id), { icon: Codicon.symbolMethod });
				this.menu.action(generation, localize('ordito.task.preview', "Structural AI Context Preview"), () => this.commandService.executeCommand('ordito.prepareStructuralContext'), { icon: Codicon.search });
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
				const technical = this.menu.disclosure(architecture, localize('ordito.properties.technical', "Technical Details"), `element-technical:${element.id}`, { icon: Codicon.fileCode });
				this.menu.action(technical, localize('ordito.openModelSource', "Edit Model Specification"), () => this.commandService.executeCommand('ordito.openModelSource'), { icon: Codicon.fileCode });
			}
			renderBlueprintDetails(architecture, model, element.id, this.controls, (viewId, elementId) => { this.project.showDiagram(viewId); this.project.selectElement(elementId); }, id => this.project.inspectElement(id));
		}
		const relations = model.semantics.relations.filter(relation => relation.from === element.id || relation.to === element.id);
		const relationships = this.menu.section(architecture, localize('ordito.inspector.relationships', "Relationships"), { compact: true });
		if (!relations.length) { dom.append(relationships, dom.$('p.ordito-inspector-empty')).textContent = localize('ordito.inspector.noRelationships', "No relationships declared."); }
		for (const relation of relations) { this.renderElementRelation(relationships, model, element, relation, view, !!interaction, !!scenario); }
		const footer = dom.append(detail, dom.$('footer.ordito-inspector-footer'));
		const explore = this.menu.section(footer, localize('ordito.inspector.explore', "Explore"), { compact: true });
		if (this.code.context) { this.menu.action(explore, localize('ordito.openSource', "Open Source"), () => this.code.inspect(element.id), { id: `source:${element.id}`, kind: 'navigation', icon: Codicon.goToFile }).disabled = this.code.busy; }
		if (this.project.section !== 'impact') { this.menu.action(explore, localize('ordito.showImpact.button', "Show Change Impact"), () => this.project.showImpact(element.id), { id: 'show-impact', kind: 'navigation', icon: Codicon.references }); }
		if (this.project.section === 'diagram') { this.menu.action(explore, localize('ordito.elementDetails', "Element Details"), () => this.project.inspectElement(element.id), { kind: 'navigation', icon: Codicon.info }); }
		if (element.kind === 'state' && element.parentId) {
			const resource = model.semantics.elements.find(candidate => candidate.id === element.parentId && candidate.kind === 'resource');
			if (resource) { this.menu.action(explore, localize('ordito.state.resource', "Resource: {0}", resource.name), () => this.project.inspectElement(resource.id), { id: `state-owner:${resource.id}`, kind: 'navigation', icon: elementIcon(resource.kind) }); }
		}
		if (this.project.editable && this.host.beginConnection && view && !interaction && (view.kind !== 'state' || element.kind === 'state')) {
			this.menu.action(footer, localize('ordito.inspector.createOnCanvas', "Create Relationship on Canvas…"), () => this.host.beginConnection?.(element.id), { id: `canvas-connect:${element.id}`, icon: Codicon.link, description: localize('ordito.inspector.createOnCanvasHelp', "Choose the target directly in the diagram") });
		}
		const views = model.views.filter(candidate => getViewSelectionIds(model, candidate).includes(element.id));
		if (views.length) {
			const perspectives = this.menu.disclosure(footer, localize('ordito.elementViews', "Diagrams Containing This Element"), `element-views:${element.id}`, { icon: Codicon.graph });
			for (const candidate of views) { this.menu.action(perspectives, candidate.name, () => this.host.revealElement(element.id, candidate.id), { id: `element-view:${candidate.id}`, kind: 'navigation', current: candidate.id === view?.id, icon: diagramIcon(candidate.kind) }); }
		} else if (element.kind !== 'feature') { this.host.paragraph(explore, localize('ordito.notPlaced', "This element is not placed in a diagram.")); }
		if (this.project.editable) {
			if (view && !interaction && (view.kind !== 'state' || element.kind === 'state')) { this.menu.action(footer, localize('ordito.connectSelection', "Connect Selection"), () => this.commandService.executeCommand('ordito.connect'), { icon: Codicon.link, description: localize('ordito.inspector.connectFormHelp', "Choose the endpoints and details in a form") }); }
			if (canRemoveFromView && scenario) {
				this.menu.action(footer, view.kind === 'activity' ? localize('ordito.scenario.addStep', "Add Step") : localize('ordito.scenario.addMessage', "Add Message"), () => this.commandService.executeCommand('ordito.connect', element.id), { icon: Codicon.link });
			}
			const manage = this.manage(footer, `element-manage:${element.id}`, localize('ordito.inspector.moreElementActions', "More Element Actions"));
			const edit = this.menu.section(manage, localize('ordito.inspector.edit', "Edit"), { compact: true });
			this.menu.action(edit, localize('ordito.renameElement', "Rename Element"), () => this.commandService.executeCommand('ordito.renameElement'), { icon: Codicon.edit });
			this.menu.action(edit, localize('ordito.editDescription', "Edit Description"), () => this.commandService.executeCommand('ordito.description'), { icon: Codicon.info });
			if (view && (canRemoveFromView || !interaction && (view.kind === 'state' || view.kind === 'sequence'))) {
				const diagram = this.menu.section(manage, localize('ordito.inspector.inDiagram', "In This Diagram"), { compact: true });
				if (view.kind === 'sequence' || scenario) {
					const participants = scenario?.description.participantIds ?? view.nodes.map(node => node.elementId);
					const index = participants.indexOf(element.id);
					this.menu.action(diagram, localize('ordito.sequence.left', "Move Participant Left"), () => this.project.edit({ kind: 'sequenceOrder', viewId: view.id, id: element.id, target: 'participant', direction: -1 }), { icon: Codicon.arrowLeft }).disabled = index <= 0;
					this.menu.action(diagram, localize('ordito.sequence.right', "Move Participant Right"), () => this.project.edit({ kind: 'sequenceOrder', viewId: view.id, id: element.id, target: 'participant', direction: 1 }), { icon: Codicon.arrowRight }).disabled = index < 0 || index === participants.length - 1;
					this.menu.action(diagram, scenario ? localize('ordito.scenario.removeParticipantAction', "Remove Participant") : localize('ordito.sequence.removeParticipant', "Remove Participant from Diagram"), () => {
						if (scenario) { return this.commandService.executeCommand('ordito.removeElementFromDiagram', element.id); }
						this.project.edit({ kind: 'sequenceRemove', viewId: view.id, id: element.id, target: 'participant' });
						close?.();
						return undefined;
					}, { icon: Codicon.remove });
				} else {
					const label = view.kind === 'state' ? element.kind === 'state' ? localize('ordito.state.removeState', "Remove State from Diagram") : localize('ordito.state.removeContext', "Remove Element from Diagram") : removeFromDiagram;
					this.menu.action(diagram, label, () => excludeFromView(view.id), { icon: Codicon.remove });
				}
			}
			const danger = this.menu.section(manage, localize('ordito.inspector.deleteFromSystem', "Delete from System"), { tone: 'danger', compact: true, description: localize('ordito.inspector.deleteElementHelp', "Affects every diagram containing this element.") });
			this.menu.action(danger, localize('ordito.deleteElement', "Delete Element"), () => this.commandService.executeCommand('ordito.deleteElement'), { kind: 'destructive', icon: Codicon.trash });
		}
	}

	private manage(parent: HTMLElement, id: string, label: string): HTMLElement {
		const body = this.menu.disclosure(parent, localize('ordito.inspector.manage', "Manage"), id, { icon: Codicon.settingsGear });
		body.parentElement!.firstElementChild!.setAttribute('aria-label', label);
		return body;
	}

	private renderMembers(parent: HTMLElement, element: SemanticElement, model: SemanticModel): void {
		const members = element.details?.members ?? [];
		if (!members.length) { dom.append(parent, dom.$('p.ordito-inspector-empty')).textContent = localize('ordito.inspector.noMembers', "No attributes or methods declared."); return; }
		const table = dom.append(parent, dom.$<HTMLTableElement>('table.ordito-inspector-members', { 'aria-label': localize('ordito.notation.members', "Attributes and Methods") }));
		const heading = dom.append(dom.append(table, dom.$('thead')), dom.$('tr'));
		for (const label of [localize('ordito.name', "Name"), localize('ordito.inspector.type', "Type"), localize('ordito.properties', "Properties")]) { dom.append(heading, dom.$('th', { scope: 'col' })).textContent = label; }
		const body = dom.append(table, dom.$('tbody'));
		const keys = { none: '', primary: localize('ordito.notation.pk', "Primary Key"), foreign: localize('ordito.notation.fk', "Foreign Key"), unique: localize('ordito.notation.unique', "Unique Key") };
		for (const member of members) {
			const row = dom.append(body, dom.$('tr'));
			dom.append(row, dom.$('th', { scope: 'row' })).textContent = member.kind === 'method' ? localize('ordito.inspector.methodName', "{0}()", member.name) : member.name;
			const typeName = (model.version === 4 || model.version === 5) ? model.foundation.types.find(type => type.id === member.typeId)?.name : undefined;
			dom.append(row, dom.$('td')).textContent = typeName || member.type || localize('ordito.inspector.unspecified', "Not Specified");
			const metadata = dom.append(row, dom.$('td.ordito-inspector-member-properties'));
			if (member.key !== 'none') { dom.append(metadata, dom.$('span.ordito-inspector-member-key')).textContent = keys[member.key]; }
			dom.append(metadata, dom.$('span')).textContent = member.required ? localize('ordito.field.required', "Required") : localize('ordito.field.optional', "Optional");
			if (model.version >= 4) {
				dom.append(metadata, dom.$('span')).textContent = member.nullable?.state === 'known' ? member.nullable.value === true ? localize('ordito.notation.null', "Null Allowed") : localize('ordito.notation.notNull', "Non-null Value") : localize('ordito.inspector.nullabilityUnknown', "Nullability Unknown");
			}
		}
	}

	private renderBehavior(parent: HTMLElement, model: SemanticModel, element: SemanticElement): void {
		if (this.project.editable) { this.menu.action(parent, localize('ordito.editBehavior', "Edit Behavioral Contract"), () => this.commandService.executeCommand('ordito.behavior'), { icon: Codicon.symbolMethod, emphasis: 'primary' }); }
		const behavior = element.behavior;
		if (!behavior || ![behavior.inputs, behavior.outputs, behavior.preconditions, behavior.postconditions, behavior.errors, behavior.permissions, behavior.acceptanceCriteria].some(entries => entries.length)) {
			dom.append(parent, dom.$('p.ordito-inspector-empty')).textContent = localize('ordito.inspector.noBehavior', "No behavioral declarations yet.");
		} else {
			this.host.paragraph(parent, localize('ordito.behavior.intent', "Contract declarations describe expected behavior."));
			if (behavior.inputs.length) {
				const inputs = this.menu.section(parent, localize('ordito.behavior.inputs', "Inputs"), { compact: true });
				for (const field of behavior.inputs) { this.host.paragraph(inputs, localize('ordito.input', "Input: {0} ({1}), {2}", field.name, field.type, field.required ? localize('ordito.field.required', "Required") : localize('ordito.field.optional', "Optional"))); }
			}
			if (behavior.outputs.length) {
				const outputs = this.menu.section(parent, localize('ordito.behavior.outputs', "Outputs"), { compact: true });
				for (const field of behavior.outputs) { this.host.paragraph(outputs, localize('ordito.output', "Output: {0} ({1}), {2}", field.name, field.type, field.required ? localize('ordito.field.required', "Required") : localize('ordito.field.optional', "Optional"))); }
			}
			if (behavior.preconditions.length || behavior.postconditions.length) {
				const conditions = this.menu.section(parent, localize('ordito.inspector.conditions', "Conditions"), { compact: true });
				for (const condition of behavior.preconditions) { this.host.paragraph(conditions, localize('ordito.precondition', "Precondition: {0}", condition)); }
				for (const condition of behavior.postconditions) { this.host.paragraph(conditions, localize('ordito.postcondition', "Postcondition: {0}", condition)); }
			}
			if (behavior.errors.length) {
				const errors = this.menu.section(parent, localize('ordito.behavior.errors', "Errors"), { compact: true });
				for (const error of behavior.errors) { this.host.paragraph(errors, localize('ordito.behavior.error', "Error {0}: {1}", error.code, error.description)); }
			}
			if (behavior.permissions.length) {
				const permissions = this.menu.section(parent, localize('ordito.inspector.permissions', "Permissions"), { compact: true });
				for (const permission of behavior.permissions) { this.host.paragraph(permissions, localize('ordito.permission', "Authorization: {0} · {1}", model.semantics.elements.find(element => element.id === permission.actorId)?.name ?? permission.actorId, permission.capability)); }
			}
			if (behavior.acceptanceCriteria.length) {
				const criteria = this.menu.section(parent, localize('ordito.inspector.criteria', "Acceptance Criteria"), { compact: true });
				for (const criterion of behavior.acceptanceCriteria) { this.host.paragraph(criteria, localize('ordito.acceptance', "Given {0}, when {1}, then {2}.", criterion.given, criterion.when, criterion.then)); }
			}
		}
		renderRecordedEvidence(parent, model, element.id, this.controls);
	}

	private renderElementRelation(parent: HTMLElement, model: SemanticModel, element: SemanticElement, relation: SemanticRelation, view: ModelView | undefined, interaction: boolean, scenario: boolean): void {
		const from = model.semantics.elements.find(element => element.id === relation.from)!, to = model.semantics.elements.find(element => element.id === relation.to)!;
		const label = localize('ordito.relation', "{0} → {1}: {2}", from.name, to.name, relation.name || relation.kind);
		const detail = this.menu.disclosure(parent, relation.name || relationLabels[relation.kind], `relation-actions:${relation.id}`, { icon: Codicon.link, description: localize('ordito.inspector.relationEndpoints', "{0} → {1}", from.name, to.name) });
		if (this.project.editable) {
			const edit = this.menu.section(detail, localize('ordito.inspector.edit', "Edit"), { compact: true });
			if (relation.kind === 'transition') { this.menu.action(edit, localize('ordito.state.editEvent', "Edit Transition Event"), () => this.commandService.executeCommand('ordito.renameRelation', relation.id), { id: `event:${relation.id}`, icon: Codicon.symbolEvent }); }
			this.menu.action(edit, localize('ordito.editCondition', "Edit Condition"), () => this.commandService.executeCommand('ordito.condition', relation.id), { id: `condition:${relation.id}`, icon: Codicon.edit });
			this.menu.action(edit, localize('ordito.editRelationError', "Edit Relationship Error"), () => this.commandService.executeCommand('ordito.relationError', relation.id), { id: `error:${relation.id}`, icon: Codicon.warning });
		}
		this.menu.action(detail, label, () => this.host.revealElement(relation.from === element.id ? relation.to : relation.from), { id: `relation:${relation.id}`, kind: 'navigation', icon: Codicon.arrowRight });
		if (relation.condition) { this.menu.info(detail, localize('ordito.inspector.condition', "Condition"), relation.condition); }
		if (relation.errorCode) { this.menu.info(detail, localize('ordito.inspector.error', "Error"), relation.errorCode); }
		if (!this.project.editable) { return; }

		if (view && view.relationIds.includes(relation.id) && (scenario || !interaction && (view.kind === 'sequence' || view.kind === 'state'))) {
			const diagram = this.menu.section(detail, localize('ordito.inspector.inDiagram', "In This Diagram"), { compact: true });
			if (scenario) { this.menu.action(diagram, localize('ordito.state.removeTransition', "Remove Relationship from Diagram"), () => this.commandService.executeCommand('ordito.removeRelationFromDiagram', relation.id), { id: `exclude:${relation.id}`, icon: Codicon.remove }); }
			else { this.renderRelationDiagramActions(diagram, model, view, relation); }
		}
		const danger = this.menu.section(detail, localize('ordito.inspector.deleteFromSystem', "Delete from System"), { tone: 'danger', compact: true });
		this.menu.action(danger, localize('ordito.deleteRelationship', "Delete Relationship"), () => this.commandService.executeCommand('ordito.deleteRelation', relation.id), { id: `delete:${relation.id}`, kind: 'destructive', icon: Codicon.trash });
	}

	private renderRelationDiagramActions(parent: HTMLElement, model: SemanticModel, view: ModelView, relation: SemanticRelation): void {
		if (view.kind === 'sequence') {
			const messages = getSequenceDiagram(model, view).messages;
			const index = messages.findIndex(message => message.id === relation.id);
			this.menu.action(parent, localize('ordito.sequence.earlier', "Move Message Earlier"), () => this.project.edit({ kind: 'sequenceOrder', viewId: view.id, id: relation.id, target: 'message', direction: -1 }), { id: `earlier:${relation.id}`, icon: Codicon.arrowUp }).disabled = index <= 0;
			this.menu.action(parent, localize('ordito.sequence.later', "Move Message Later"), () => this.project.edit({ kind: 'sequenceOrder', viewId: view.id, id: relation.id, target: 'message', direction: 1 }), { id: `later:${relation.id}`, icon: Codicon.arrowDown }).disabled = index < 0 || index === messages.length - 1;
			this.menu.action(parent, localize('ordito.sequence.removeMessage', "Remove Message from Diagram"), () => this.project.edit({ kind: 'sequenceRemove', viewId: view.id, id: relation.id, target: 'message' }), { id: `remove-message:${relation.id}`, icon: Codicon.remove });
		} else {
			this.menu.action(parent, localize('ordito.state.removeTransition', "Remove Relationship from Diagram"), () => this.project.edit({ kind: 'exclude', viewId: view.id, id: relation.id, target: 'relation' }), { id: `exclude:${relation.id}`, icon: Codicon.remove });
		}
	}

	renderRelationProperties(parent: HTMLElement, id: string): void {
		const model = this.project.model;
		const relation = model.semantics.relations.find(relation => relation.id === id);
		if (!relation) { return; }
		parent.setAttribute('aria-label', localize('ordito.relationshipProperties', "Relationship Properties"));
		parent.classList.add('ordito-inspector-sheet', 'ordito-inspector-tabbed');
		this.menu.header(parent, relation.name || relationLabels[relation.kind], relationLabels[relation.kind], Codicon.link);
		const tabHost = dom.append(parent, dom.$('div.ordito-inspector-tabs'));
		const tabs = this.controls.tabs(tabHost, 'relation-inspector', [
			{ id: 'properties', label: localize('ordito.properties', "Properties") },
			{ id: 'behavior', label: localize('ordito.inspector.behavior', "Behavior") },
			{ id: 'architecture', label: localize('ordito.properties.architecture', "Architecture") }
		]);
		const properties = tabs.panels.get('properties')!, behavior = tabs.panels.get('behavior')!, architecture = tabs.panels.get('architecture')!;
		for (const panel of tabs.panels.values()) { panel.classList.add('ordito-inspector-tab-content'); }
		const from = model.semantics.elements.find(element => element.id === relation.from)!, to = model.semantics.elements.find(element => element.id === relation.to)!;
		if (this.project.editable) { this.menu.action(properties, localize('ordito.notation.editRelation', "Edit Cardinalities and Protocol"), () => this.commandService.executeCommand('ordito.relationNotation', id), { icon: Codicon.symbolProperty, emphasis: 'primary' }); }
		if (this.project.editable) { this.menu.action(architecture, localize('ordito.notation.editRelation', "Edit Cardinalities and Protocol"), () => this.commandService.executeCommand('ordito.relationNotation', id), { id: `relation-protocol:${id}`, icon: Codicon.symbolProperty, emphasis: 'primary' }); }
		this.menu.info(architecture, localize('ordito.inspector.source', "Source"), from.name, elementIcon(from.kind));
		this.menu.info(architecture, localize('ordito.inspector.target', "Target"), to.name, elementIcon(to.kind));
		if (this.project.editable) {
			if (relation.kind === 'transition') { this.menu.action(behavior, localize('ordito.state.editEvent', "Edit Transition Event"), () => this.commandService.executeCommand('ordito.renameRelation', id), { id: `event:${id}`, icon: Codicon.symbolEvent }); }
			this.menu.action(behavior, localize('ordito.editCondition', "Edit Condition"), () => this.commandService.executeCommand('ordito.condition', id), { id: `condition:${id}`, icon: Codicon.edit });
			this.menu.action(behavior, localize('ordito.editRelationError', "Edit Relationship Error"), () => this.commandService.executeCommand('ordito.relationError', id), { id: `error:${id}`, icon: Codicon.warning });
		}
		this.menu.info(behavior, localize('ordito.inspector.condition', "Condition"), relation.condition || localize('ordito.inspector.noCondition', "No Condition Declared"));
		this.menu.info(behavior, localize('ordito.inspector.error', "Error"), relation.errorCode || localize('ordito.inspector.noError', "No Error Assigned"));
		if (relation.kind === 'transition') { this.menu.info(behavior, localize('ordito.inspector.transitionEvent', "Transition Event"), relation.name || localize('ordito.inspector.unspecified', "Not Specified")); }

		if (relation.details) {
			for (const [key, label] of [
				['sourceMultiplicity', localize('ordito.notation.sourceMultiplicity', "Source Multiplicity")],
				['targetMultiplicity', localize('ordito.notation.targetMultiplicity', "Target Multiplicity")],
				['sourceMember', localize('ordito.notation.sourceColumn', "Source Attribute / Column")],
				['targetMember', localize('ordito.notation.targetColumn', "Target Attribute / Column")]
			] as const) { if (relation.details[key]) { this.menu.info(properties, label, relation.details[key]); } }
		} else { dom.append(properties, dom.$('p.ordito-inspector-empty')).textContent = localize('ordito.inspector.noRelationNotation', "No cardinalities or attribute mappings declared."); }
		this.menu.info(architecture, localize('ordito.notation.protocol', "Protocol / Transport"), relation.details?.protocol || localize('ordito.inspector.unspecified', "Not Specified"));
		if (model.version === 4 || model.version === 5) {
			for (const transport of model.foundation.blueprint?.transports.filter(transport => transport.relationId === id) ?? []) { this.host.paragraph(architecture, localize('ordito.blueprint.transportDetails', "Transport: {0} · Payload: {1} · Schema: {2} · Version: {3}", transport.protocol, transport.format, model.foundation.types.find(type => type.id === transport.schemaTypeId)?.name ?? '', transport.schemaVersion)); }
		}
		const footer = dom.append(parent, dom.$('footer.ordito-inspector-footer'));
		if (this.project.editable) { this.menu.action(footer, localize('ordito.context.editRelation', "Edit Relationship…"), () => this.commandService.executeCommand('ordito.editRelation', id), { icon: Codicon.edit, emphasis: 'primary' }); }
		const explore = this.menu.section(footer, localize('ordito.inspector.explore', "Explore"), { compact: true });
		for (const endpoint of [{ element: from, role: 'source', label: localize('ordito.inspector.source', "Source") }, { element: to, role: 'target', label: localize('ordito.inspector.target', "Target") }]) { this.menu.action(explore, endpoint.element.name, () => this.host.revealElement(endpoint.element.id), { id: `relationship-${endpoint.role}:${id}`, kind: 'navigation', icon: elementIcon(endpoint.element.kind), description: endpoint.label }); }
		if (this.project.editable) {
			const manage = this.manage(footer, `relation-manage:${id}`, localize('ordito.inspector.moreRelationActions', "More Relationship Actions"));
			const view = this.project.activeView;
			const scenario = view && getEditableScenario(model, view);
			if (view?.relationIds.includes(id) && (scenario || !getProjectedInteraction(model, view))) {
				const diagram = this.menu.section(manage, localize('ordito.inspector.inDiagram', "In This Diagram"), { compact: true });
				if (!scenario && (view.kind === 'sequence' || view.kind === 'state')) { this.renderRelationDiagramActions(diagram, model, view, relation); }
				else { this.menu.action(diagram, localize('ordito.state.removeTransition', "Remove Relationship from Diagram"), () => this.project.edit({ kind: 'exclude', viewId: view.id, id, target: 'relation' }), { id: `exclude:${id}`, icon: Codicon.remove }); }
			}
			const danger = this.menu.section(manage, localize('ordito.inspector.deleteFromSystem', "Delete from System"), { tone: 'danger', compact: true, description: localize('ordito.inspector.deleteRelationHelp', "Removes this relationship from every diagram.") });
			this.menu.action(danger, localize('ordito.deleteRelationship', "Delete Relationship"), () => this.commandService.executeCommand('ordito.deleteRelation', id), { id: `delete:${id}`, kind: 'destructive', icon: Codicon.trash });
		}
	}

	constructor(
		private readonly host: OrditoInspectorHost,
		private readonly controls: OrditoControls,
		private readonly project: OrditoProjectService,
		private readonly code: IOrditoCodeService,
		private readonly commandService: ICommandService
	) { this.menu = new OrditoActionMenu(controls); }
}
