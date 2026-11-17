/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import * as dom from '../../../../base/browser/dom.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { acceptsNotationRelation, notationRelationLabel, notationRules } from '../common/modelNotation.js';
import { isCompatibleRelation } from '../common/modelValidation.js';
import { ModelView, RelationKind, SemanticModel } from '../common/modelTypes.js';
import { AdeProjectService } from './adeProjectService.js';
import { AdeControls } from './adeControls.js';
import { elementLabels, relationLabels } from './adeLabels.js';
import { DiagramBox, placeConnectionLabel, routeDiagramConnections } from '../common/diagramRouting.js';
import { getSequenceDiagram } from '../common/sequenceDiagram.js';
import { renderAdeDescriptiveActivity } from './adeDescriptiveActivity.js';
import { renderAdeSequence } from './adeSequence.js';
import { renderAdeMessaging } from './adeMessaging.js';
import { renderAdeState, stateTransitionLabel } from './adeState.js';
import { notationBoundaries, notationLines, notationNodeSize } from '../common/diagramLayout.js';
import { IAction, Separator, toAction } from '../../../../base/common/actions.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { AdeCanvasController } from './adeCanvasController.js';
import { getProjectedInteraction } from '../common/visualNavigation.js';


interface AdeCanvasSurfaceHost {
	button(parent: HTMLElement, label: string, action: () => void, id?: string): HTMLButtonElement;
	chooseDiagram(): Promise<void>;
	focusSelection(): void;
	renderBreadcrumbs(parent: HTMLElement): void;
	renderNavigation(parent: HTMLElement, canvas?: boolean): void;
	renderPrimaryActions(parent: HTMLElement): void;
	documentStatus(): string;
	render(): void;
	iconButton(parent: HTMLElement, label: string, icon: ThemeIcon, action: () => void, id?: string): HTMLButtonElement;
	paragraph(parent: HTMLElement, content: string): void;
	readonly root: HTMLElement;
	revealElement(id: string, viewId?: string): void;
}

/** Draws the diagram surface and coordinates node/connection actions for the ADE editor. */
export class AdeCanvasSurface {
	showRelationshipLabels: boolean | undefined;

	inspectorOpen = false;

	relationSelection: string | undefined;

	pendingConnection: { from: string; kind: RelationKind; viewId: string; version: string } | undefined;

	renderCanvasMenus(parent: HTMLElement, view: ModelView): void {
		const menu = this.canvas.floatingMenu = dom.append(parent, dom.$('nav.ade-floating-menu'));
		menu.setAttribute('aria-label', localize('ade.canvasActions', "Canvas Actions"));
		const interaction = getProjectedInteraction(this.project.model, view);
		if (this.project.editable) {
			if (interaction?.execution) {
				this.host.button(menu, localize('ade.interaction.edit', "Edit Executable Interaction"), () => { void this.commandService.executeCommand('ade.interaction', interaction.id); });
			} else if (!interaction) {
				this.host.button(menu, view.kind === 'state' ? localize('ade.state.addState', "Add State") : localize('ade.addElement', "Add Element"), () => { void this.commandService.executeCommand('ade.addElement'); }).classList.add('ade-primary-action');
				if (view.nodes.some(node => node.elementId === this.project.selectedId)) {
					this.host.button(menu, localize('ade.canvas.connect', "Connect"), () => { void this.beginConnection(this.project.selectedId); });
				}
			}
		}
		const actions = this.controls.details(menu, localize('ade.canvas.diagramMenu', "Diagram"), 'canvas-actions', { popup: true });
		const content = this.controls.details(actions, localize('ade.canvas.contents', "Contents"), 'canvas-contents');
		if (this.project.editable) {
			for (const [label, command] of [
				...(!interaction ? [[localize('ade.addExisting', "Add Existing Element"), 'ade.addExisting']] : []),
				...(!interaction && view.kind !== 'state' && view.kind !== 'sequence' ? [[localize('ade.addExistingRelation', "Add Existing Relationship"), 'ade.addExistingRelation']] : []),
				...(view.kind === 'state' ? [[localize('ade.state.addExisting', "Add Existing State"), 'ade.addExistingState'], [localize('ade.state.addTransition', "Add Existing Transition"), 'ade.addTransition'], [localize('ade.state.includeLifecycle', "Include Resource Lifecycle"), 'ade.includeLifecycle']] : []),
				...(view.kind === 'sequence' && !interaction ? [[localize('ade.sequence.addMessage', "Add Existing Message"), 'ade.addSequenceMessage']] : []),
				[localize('ade.renameDiagram', "Rename Diagram"), 'ade.renameDiagram'],
				[localize('ade.deleteDiagram', "Delete Diagram"), 'ade.deleteDiagram']
			]) { this.host.button(content, label, () => { void this.commandService.executeCommand(command); }); }
		}
		this.host.button(content, localize('ade.properties', "Properties"), () => { this.controls.setExpanded('canvas-actions', false); this.inspectorOpen = !this.inspectorOpen; this.host.render(); });
		const display = this.controls.details(actions, localize('ade.canvas.display', "Layout and Display"), 'canvas-display');
		if (view.kind !== 'sequence' && !(view.kind === 'activity' && view.interactionId)) {
			this.host.button(display, localize('ade.layout', "Arrange Diagram"), () => { void this.commandService.executeCommand('ade.layout'); }).disabled = !this.project.editable;
			const labels = this.host.button(display, localize('ade.showRelationshipLabels', "Show Relationship Labels"), () => { this.showRelationshipLabels = !(this.showRelationshipLabels ?? !!notationRules[view.kind]); this.host.render(); });
			labels.setAttribute('aria-pressed', String(this.showRelationshipLabels ?? !!notationRules[view.kind]));
		}
		this.host.button(display, localize('ade.zoomReset', "Reset Zoom"), () => { this.canvas.zoom = 1; this.canvas.applyCamera(); });
		this.host.button(actions, localize('ade.readDiagram', "Read Diagram"), () => { void this.commandService.executeCommand('ade.readContext'); });
		const zoom = dom.append(parent, dom.$('nav.ade-floating-zoom'));
		zoom.setAttribute('aria-label', localize('ade.canvasZoom', "Canvas Zoom"));
		this.host.iconButton(zoom, localize('ade.zoomOut', "Zoom Out"), Codicon.remove, () => { this.canvas.zoom /= 1.2; this.canvas.applyCamera(); }, 'canvas-zoom-out');
		this.canvas.zoomReadout = dom.append(zoom, dom.$('span.ade-zoom-readout'));
		this.host.iconButton(zoom, localize('ade.zoomIn', "Zoom In"), Codicon.add, () => { this.canvas.zoom *= 1.2; this.canvas.applyCamera(); }, 'canvas-zoom-in');
		this.host.button(zoom, localize('ade.fitDiagram', "Fit Diagram"), () => this.canvas.fitDiagram(), 'canvas-fit');
		const history = dom.append(zoom, dom.$('div.ade-canvas-history'));
		history.setAttribute('role', 'group'); history.setAttribute('aria-label', localize('ade.editing.history', "Save and History"));
		this.host.iconButton(history, localize('ade.undo', "Undo"), Codicon.discard, () => { void this.project.undo(); }).disabled = !this.project.canUndo;
		this.host.iconButton(history, localize('ade.redo', "Redo"), Codicon.redo, () => { void this.project.redo(); }).disabled = !this.project.canRedo;
		if ((this.project.model.version === 4 || this.project.model.version === 5) && view.messagingId) { renderAdeMessaging(this.controls.details(actions, localize('ade.messaging.details', "Messaging Details"), 'canvas-messaging'), this.project.model, view.messagingId, this.controls, id => this.project.inspectElement(id)); }
		if (view.kind === 'state') { renderAdeState(this.controls.details(actions, localize('ade.state.lifecycle', "Lifecycle Details"), 'canvas-lifecycle'), this.project.model, view, this.controls, id => this.project.inspectElement(id), id => { this.inspectorOpen = true; this.project.selectElement(id); this.host.render(); this.host.focusSelection(); }); }
		if (this.project.model.version === 5 && view.interactionId) { this.host.paragraph(this.controls.details(actions, localize('ade.scenario.details', "Scenario Details"), 'canvas-scenario'), localize('ade.scenario.editHelp', "This View Projects an Explicit Scenario. Revise Its Occurrences, Branches and Known Order in the Conversation; Layout Is Derived from That Scenario.")); }
		if (view.kind === 'sequence') {
			const interaction = getProjectedInteraction(this.project.model, view);
			const intent = interaction?.execution ? localize('ade.sequence.executableIntent', "Executable sequence: calls, frames and their declared order come from the linked interaction. Verify independent cases before applying its code.") : interaction ? localize('ade.sequence.scenarioIntent', "Scenario sequence: calls, branches and known order come from the linked scenario. They do not establish observed execution.") : localize('ade.sequence.intent', "Declared sequence: invocations, reads and writes, one occurrence per relationship. Order is local to this diagram, not observed execution.");
			this.host.paragraph(this.controls.details(actions, localize('ade.sequence.info', "Sequence Details"), 'canvas-sequence'), intent);
		}
		if (view.id.startsWith('semantic:')) { this.host.paragraph(this.controls.details(actions, localize('ade.ai.info', "Interpretation Details"), 'canvas-interpretation'), localize('ade.ai.interpretationHint', "AI Interpretation · Review Inferred Responsibilities and Flows Against the Source.")); }
		const help = this.controls.details(actions, localize('ade.canvasHelpMenu', "Canvas Help"), 'canvas-help-menu');
		this.host.paragraph(help, localize('ade.relation.legend', "Relationships: solid arrow = invocation; dashed arrow = dependency; dashed triangle = realization. Read, write and transition types are named on each connection."));
		this.host.paragraph(help, localize('ade.infiniteCanvasHelp', "Drag the background to pan. Scroll to move; Ctrl or Command + scroll to zoom at the pointer. Arrow keys pan when the canvas is focused. Home fits the diagram. Select an element or connection for floating details."));
	}

	renderCanvas(parent: HTMLElement, model: SemanticModel, view: ModelView): void {
		this.canvas.canvasViewport = parent;
		parent.tabIndex = 0;
		this.controls.trackFocus('canvas', parent);
		parent.setAttribute('role', 'region');
		parent.setAttribute('aria-describedby', 'ade-canvas-help');
		parent.setAttribute('aria-label', localize('ade.canvas', "Diagram: {0}", view.name));
		parent.setAttribute('aria-roledescription', localize('ade.infiniteCanvas', "Infinite Diagram Canvas"));
		this.canvas.installPan(parent);
		const interaction = getProjectedInteraction(model, view);
		if (!view.nodes.length && !interaction) {
			this.canvas.canvasContent = dom.append(dom.append(parent, dom.$('.ade-canvas')), dom.$('.ade-canvas-content'));
			this.canvas.worldBounds = { x: 0, y: 0, width: 1, height: 1 };
			const empty = dom.append(parent, dom.$('p.ade-empty-canvas')); empty.textContent = localize('ade.emptyDiagram', "This diagram has no elements.");
			return;
		}
		if (model.version === 5 && view.kind === 'activity' && view.interactionId) {
			const frame = dom.append(parent, dom.$('.ade-canvas')), canvas = dom.append(frame, dom.$('.ade-canvas-content'));
			this.canvas.canvasContent = canvas;
			const size = renderAdeDescriptiveActivity(canvas, model, view.interactionId, this.controls, id => { this.inspectorOpen = true; this.project.selectElement(id); this.host.render(); });
			dom.size(canvas, size.width, size.height); dom.size(frame, 1, 1);
			this.canvas.worldBounds = { x: 0, y: 0, width: size.width, height: size.height }; canvas.style.transformOrigin = '0 0'; canvas.style.transform = `scale(${this.canvas.zoom})`;
			return;
		}
		if (view.kind === 'sequence') {
			const frame = dom.append(parent, dom.$('.ade-canvas'));
			const canvas = dom.append(frame, dom.$('.ade-canvas-content'));
			this.canvas.canvasContent = canvas;
			const selectRelation = (id: string) => { this.inspectorOpen = true; this.relationSelection = id; this.host.render(); };
			const size = renderAdeSequence(canvas, model, view, this.controls, this.project.selectedId, id => { if (this.pendingConnection) { void this.finishConnection(id); } else { this.inspectorOpen = true; this.relationSelection = undefined; this.project.selectElement(id); this.host.render(); } }, {
				selectRelation, selectedRelation: this.relationSelection,
				element: (target, id) => this.installContextMenu(target, (x, y) => this.elementMenu(id, x, y)),
				relation: (target, id) => {
					this.installContextMenu(target, (x, y) => this.relationMenu(id, x, y));
					if (dom.isSVGElement(target)) { this.canvas.interactions.add(dom.addDisposableListener(target, 'click', () => selectRelation(id))); }
				}
			});
			dom.size(canvas, size.width, size.height);
			dom.size(frame, 1, 1);
			this.canvas.worldBounds = { x: 0, y: 0, width: size.width, height: size.height };
			canvas.style.transformOrigin = '0 0';
			canvas.style.transform = `scale(${this.canvas.zoom})`;
			const sequence = getSequenceDiagram(model, view);
			if (!sequence.messages.length && (!interaction || !interaction.occurrenceIds.length && !interaction.frameIds.length)) { this.host.paragraph(parent, interaction?.execution ? localize('ade.sequence.emptyExecutable', "No messages in the linked interaction. Use Edit Executable Interaction in Project to add behavior.") : interaction ? localize('ade.sequence.emptyScenario', "The linked scenario has no calls yet. Revise its declared behavior to populate this view.") : localize('ade.sequence.empty', "No messages. Add an existing interaction or connect participants.")); }
			if (sequence.unsupported.length) {
				this.host.paragraph(parent, localize('ade.sequence.unsupported', "Not rendered as sequence messages: {0}. These relationships remain in Properties and Read Diagram.", sequence.unsupported.map(relation => relation.name || relationLabels[relation.kind]).join(', ')));
			}
			return;
		}

		const frame = dom.append(parent, dom.$('.ade-canvas'));
		const canvas = dom.append(frame, dom.$('.ade-canvas-content'));
		this.canvas.canvasContent = canvas;
		canvas.style.transformOrigin = '0 0';
		const svg = parent.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('role', 'group');
		svg.setAttribute('aria-label', localize('ade.connections', "Diagram Relationships"));
		canvas.appendChild(svg);
		const boundaries = parent.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g');
		boundaries.setAttribute('aria-hidden', 'true');
		svg.appendChild(boundaries);
		const boundaryBoxes = notationBoundaries(model, view);
		for (const box of boundaryBoxes) {
			const rect = parent.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'rect');
			rect.setAttribute('class', 'ade-notation-boundary');
			for (const key of ['x', 'y', 'width', 'height'] as const) { rect.setAttribute(key, String(box[key])); }
			const label = parent.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'text');
			label.setAttribute('class', 'ade-notation-boundary-label'); label.setAttribute('x', String(box.x + 12)); label.setAttribute('y', String(box.y + 24)); label.textContent = box.name;
			boundaries.append(rect);
			if (!view.nodes.some(node => node.elementId === box.elementId)) { boundaries.append(label); }
		}
		const paths = parent.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g');
		const labels = parent.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g');
		svg.append(paths, labels);
		const boxes = view.nodes.map(node => {
			const boundary = boundaryBoxes.find(box => box.elementId === node.elementId);
			return { id: node.elementId, ...notationNodeSize(model.semantics.elements.find(element => element.id === node.elementId)!), ...(boundary ? { x: boundary.x + 12, y: boundary.y + 6, height: 32 } : { x: node.x, y: node.y }) };
		});
		const relationships = model.semantics.relations.filter(relation => view.relationIds.includes(relation.id));
		const routes = routeDiagramConnections(boxes, relationships);
		const connections = relationships.map(relation => ({ relation, route: routes.get(relation.id) }));
		const points = [...connections.flatMap(connection => connection.route ?? []), ...boundaryBoxes.flatMap(box => [{ x: box.x, y: box.y }, { x: box.x + box.width, y: box.y + box.height }])];

		const occupied: DiagramBox[] = [...boxes];
		for (const { relation, route } of connections) {
			if (!route || route.length < 2) { continue; }
			const end = route[route.length - 1];
			const previous = route[route.length - 2];
			const angle = Math.atan2(end.y - previous.y, end.x - previous.x);
			const path = parent.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
			path.setAttribute('data-relation-id', relation.id);
			path.setAttribute('d', `${route.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')} M ${end.x - 10 * Math.cos(angle - 0.5)} ${end.y - 10 * Math.sin(angle - 0.5)} L ${end.x} ${end.y} L ${end.x - 10 * Math.cos(angle + 0.5)} ${end.y - 10 * Math.sin(angle + 0.5)}`);
			const related = this.relationSelection === relation.id || this.inspectorOpen && (relation.from === this.project.selectedId || relation.to === this.project.selectedId);
			const visibleCaption = (this.showRelationshipLabels ?? !!notationRules[view.kind]) || related;
			const group = parent.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g');
			group.setAttribute('class', `ade-connection${this.relationSelection === relation.id ? ' selected' : ''}${related ? ' is-related' : ''}`);
			group.setAttribute('tabindex', '0'); group.setAttribute('role', 'button');
			group.setAttribute('data-relation-id', relation.id);
			const fromName = model.semantics.elements.find(element => element.id === relation.from)!.name;
			const toName = model.semantics.elements.find(element => element.id === relation.to)!.name;
			group.setAttribute('aria-label', localize('ade.relation.accessible', "{0} · {1} → {2} · {3}", relationLabels[relation.kind], fromName, toName, relation.name));
			group.setAttribute('aria-description', [relation.condition, relation.errorCode].filter(Boolean).join(' · '));
			this.controls.trackFocus(`edge:${relation.id}`, group);
			if (['dependency', 'realization', 'implementation', 'include', 'extend'].includes(relation.kind)) { path.setAttribute('stroke-dasharray', '6 4'); }
			if (['realization', 'inheritance', 'implementation'].includes(relation.kind)) { path.setAttribute('d', path.getAttribute('d')! + ' Z'); }
			if (['association', 'composition', 'aggregation'].includes(relation.kind)) {
				path.setAttribute('d', route.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' '));
				if (relation.kind !== 'association') {
					const start = route[0], next = route[1], dx = Math.sign(next.x - start.x), dy = Math.sign(next.y - start.y);
					path.setAttribute('d', path.getAttribute('d')! + ` M ${start.x} ${start.y} l ${dx * 9 - dy * 5} ${dy * 9 + dx * 5} l ${dx * 9 + dy * 5} ${dy * 9 - dx * 5} l ${-dx * 9 + dy * 5} ${-dy * 9 - dx * 5} Z`);
					if (relation.kind === 'composition') { path.classList.add('ade-composition'); }
				}
			}
			group.appendChild(path); paths.appendChild(group);
			const hit = path.cloneNode() as SVGPathElement;
			hit.setAttribute('class', 'ade-connection-hit'); hit.removeAttribute('data-relation-id'); hit.removeAttribute('stroke-dasharray');
			group.appendChild(hit);
			const candidatesAt = (x: number, y: number) => {
				const bounds = svg.getBoundingClientRect();
				const point = { x: (x - bounds.left) / this.canvas.zoom, y: (y - bounds.top) / this.canvas.zoom };
				return connections.filter(connection => connection.route?.slice(1).some((end, index) => {
					const start = connection.route![index];
					return point.x >= Math.min(start.x, end.x) - 8 / this.canvas.zoom && point.x <= Math.max(start.x, end.x) + 8 / this.canvas.zoom && point.y >= Math.min(start.y, end.y) - 8 / this.canvas.zoom && point.y <= Math.max(start.y, end.y) + 8 / this.canvas.zoom;
				})).map(connection => connection.relation);
			};
			const select = async (event?: MouseEvent) => {
				const candidates = event?.detail ? candidatesAt(event.clientX, event.clientY) : [];
				const chosen = candidates.length > 1 ? (await this.quick.pick(candidates.map(relation => ({ label: relation.name || relationLabels[relation.kind], description: relationLabels[relation.kind], relation })), { title: localize('ade.relation.chooseOverlap', "Choose a Relationship at This Point") }))?.relation : relation;
				if (chosen) { this.inspectorOpen = true; this.relationSelection = chosen.id; group.focus(); this.host.render(); }
			};
			const context = (x: number, y: number) => {
				const candidates = candidatesAt(x, y);
				if (candidates.length > 1) { this.showMenu(x, y, candidates.map(relation => toAction({ id: `ade.overlap.${relation.id}`, label: `${relationLabels[relation.kind]} · ${relation.name}`, run: () => this.relationMenu(relation.id, x, y) }))); }
				else { this.relationMenu(relation.id, x, y); }
			};
			this.canvas.interactions.add(dom.addDisposableListener(group, 'click', (event: MouseEvent) => { void select(event); }));
			this.canvas.interactions.add(dom.addDisposableListener(group, 'keydown', (event: KeyboardEvent) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void select(); } }));
			this.installContextMenu(group, context);
			const caption = parent.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g');
			caption.setAttribute('class', `ade-edge-caption${visibleCaption ? ' is-visible' : ''}`); labels.appendChild(caption);
			const reveal = () => caption.classList.add('is-hovered');
			const conceal = () => caption.classList.remove('is-hovered');
			for (const target of [group, caption]) {
				this.canvas.interactions.add(dom.addDisposableListener(target, 'pointerenter', reveal));
				this.canvas.interactions.add(dom.addDisposableListener(target, 'pointerleave', conceal));
				this.canvas.interactions.add(dom.addDisposableListener(target, 'focus', reveal));
				this.canvas.interactions.add(dom.addDisposableListener(target, 'blur', conceal));
			}
			const label = parent.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'text');
			label.setAttribute('class', 'ade-connection-label');
			label.textContent = view.kind === 'state' && relation.kind === 'transition' ? stateTransitionLabel(relation) : [relationLabels[relation.kind], notationRelationLabel(relation), relation.condition ? `[${relation.condition}]` : '', relation.errorCode].filter(Boolean).join(' · ');
			label.setAttribute('data-relation-id', relation.id);
			this.canvas.interactions.add(dom.addDisposableListener(label, 'click', (event: MouseEvent) => { void select(event); }));
			this.installContextMenu(label, context);
			caption.appendChild(label);
			const placement = placeConnectionLabel(route, label.getComputedTextLength() + 12, occupied);
			if (visibleCaption) { occupied.push(placement.box); }
			const { x, y, width: labelWidth } = placement.box;
			const background = parent.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'rect');
			background.setAttribute('class', 'ade-connection-background');
			background.setAttribute('x', String(x)); background.setAttribute('y', String(y));
			background.setAttribute('width', String(labelWidth)); background.setAttribute('height', String(placement.box.height));
			caption.insertBefore(background, label);
			label.setAttribute('x', String(x + 6)); label.setAttribute('y', String(y + 14));
			if (placement.detached) {
				const leader = parent.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
				leader.setAttribute('class', 'ade-connection-leader');
				const attachmentX = Math.max(x, Math.min(placement.anchor.x, x + labelWidth));
				const attachmentY = Math.max(y, Math.min(placement.anchor.y, y + placement.box.height));
				leader.setAttribute('d', `M ${placement.anchor.x} ${placement.anchor.y} L ${attachmentX} ${attachmentY}`);
				caption.insertBefore(leader, background);
			}
		}
		const minX = Math.min(...occupied.map(box => box.x), ...points.map(point => point.x));
		const minY = Math.min(...occupied.map(box => box.y), ...points.map(point => point.y));
		const canvasWidth = Math.max(...occupied.map(box => box.x + box.width), ...points.map(point => point.x)) + 32;
		const canvasHeight = Math.max(...occupied.map(box => box.y + box.height), ...points.map(point => point.y)) + 32;
		this.canvas.worldBounds = { x: minX, y: minY, width: canvasWidth - minX, height: canvasHeight - minY };
		canvas.classList.toggle('is-focusing', this.inspectorOpen);
		dom.size(frame, 1, 1);
		dom.size(canvas, 1, 1);
		svg.setAttribute('width', '1'); svg.setAttribute('height', '1');
		// Measure labels at their logical size before applying the viewport zoom.
		canvas.style.transform = `scale(${this.canvas.zoom})`;
		const positions = new Map(boxes.map(box => [box.id, box]));
		const blocked = connections.filter(connection => !connection.route).length;
		if (blocked) {
			this.host.paragraph(parent, localize('ade.routing.blocked', "{0} connections cannot be routed through overlapping nodes. Move the nodes apart; all relationships remain available in Properties and Read Diagram.", blocked));
		}
		for (const node of view.nodes) {
			const element = model.semantics.elements.find(element => element.id === node.elementId)!;
			const position = positions.get(element.id)!;
			const button = this.host.button(canvas, element.name, () => { if (this.pendingConnection) { void this.finishConnection(element.id); } else { this.inspectorOpen = true; this.relationSelection = undefined; this.project.selectElement(element.id); this.host.render(); } }, `node:${element.id}`);
			button.classList.add('ade-node');
			button.classList.toggle('is-boundary', boundaryBoxes.some(box => box.elementId === element.id));
			button.dataset.kind = elementLabels[element.kind];
			button.setAttribute('aria-label', element.name);
			const selectedRelation = model.semantics.relations.find(relation => relation.id === this.relationSelection);
			button.classList.toggle('ade-related-node', selectedRelation?.from === element.id || selectedRelation?.to === element.id);
			button.style.left = `${position.x}px`;
			button.style.top = `${position.y}px`;
			button.style.width = `${position.width}px`;
			button.style.height = `${position.height}px`;
			button.dataset.notationKind = element.kind;
			if (element.kind === 'useCase') {
				button.textContent = '';
				dom.append(button, dom.$('span.ade-node-name')).textContent = element.name;
			}
			for (const line of boundaryBoxes.some(box => box.elementId === element.id) ? [] : notationLines(element)) { dom.append(button, dom.$('span.ade-node-member')).textContent = line; }
			button.setAttribute('aria-pressed', String(!this.relationSelection && element.id === this.project.selectedId));
			button.setAttribute('aria-description', [elementLabels[element.kind], ...notationLines(element)].join(' · '));
			this.installContextMenu(button, (x, y) => this.elementMenu(element.id, x, y));
			if (this.project.editable) { this.canvas.installNodeEditing(button, view, element.id, model, boundaryBoxes.some(box => box.elementId === element.id)); }
		}
		// Keep the historical node-first tab order, followed by keyboard-accessible connections.
		canvas.appendChild(svg);
	}

	renderEditingToolbar(parent: HTMLElement): void {
		const toolbar = dom.append(parent, dom.$('nav.ade-editing'));
		toolbar.setAttribute('aria-label', localize('ade.editing', "Diagram Editing"));
		if (this.project.modelUri) {
			const history = dom.append(toolbar, dom.$('div.ade-editing-history'));
			history.setAttribute('role', 'group'); history.setAttribute('aria-label', localize('ade.editing.history', "Save and History"));
			this.host.iconButton(history, localize('ade.save', "Save"), Codicon.save, () => { void this.project.save(true); }).disabled = !this.project.dirty;
			this.host.iconButton(history, localize('ade.undo', "Undo"), Codicon.discard, () => { void this.project.undo(); }).disabled = !this.project.canUndo;
			this.host.iconButton(history, localize('ade.redo', "Redo"), Codicon.redo, () => { void this.project.redo(); }).disabled = !this.project.canRedo;
		}
		let diagramActions: HTMLElement | undefined;
		const interaction = this.project.activeView && getProjectedInteraction(this.project.model, this.project.activeView);
		if (this.project.editable && this.project.section !== 'element' && this.project.section !== 'impact') {
			if (this.project.section === 'map') {
				this.host.button(toolbar, localize('ade.addFeature', "Add Feature"), () => { void this.commandService.executeCommand('ade.addFeature'); });
			} else {
				if (interaction?.execution) { this.host.button(toolbar, localize('ade.interaction.edit', "Edit Executable Interaction"), () => { void this.commandService.executeCommand('ade.interaction', interaction.id); }); }
				if (!interaction) { this.host.button(toolbar, this.project.activeView?.kind === 'state' ? localize('ade.state.addState', "Add State") : localize('ade.addElement', "Add Element"), () => { void this.commandService.executeCommand('ade.addElement'); }).disabled = !this.project.activeView; }
				const actions = diagramActions = this.controls.details(toolbar, localize('ade.diagramOptions', "Diagram Options"), 'diagram-options');
				for (const [label, command] of [
					[localize('ade.addExisting', "Add Existing Element"), 'ade.addExisting'],
					[localize('ade.renameDiagram', "Rename Diagram"), 'ade.renameDiagram'],
					[localize('ade.deleteDiagram', "Delete Diagram"), 'ade.deleteDiagram']
				]) {
					if (!interaction || command !== 'ade.addExisting') { this.host.button(actions, label, () => { void this.commandService.executeCommand(command); }); }
				}
				if (this.project.activeView?.kind === 'sequence' && !interaction) {
					this.host.button(toolbar, localize('ade.sequence.addMessage', "Add Existing Message"), () => { void this.commandService.executeCommand('ade.addSequenceMessage'); });
				}
				if (this.project.activeView?.kind === 'state') {
					this.host.button(toolbar, localize('ade.state.addExisting', "Add Existing State"), () => { void this.commandService.executeCommand('ade.addExistingState'); });
					this.host.button(toolbar, localize('ade.state.addTransition', "Add Existing Transition"), () => { void this.commandService.executeCommand('ade.addTransition'); });
					this.host.button(actions, localize('ade.state.includeLifecycle', "Include Resource Lifecycle"), () => { void this.commandService.executeCommand('ade.includeLifecycle'); });
				}
				if (this.project.activeView) {
					this.host.button(actions, localize('ade.addFeature', "Add Feature"), () => { void this.commandService.executeCommand('ade.addFeature'); });
				}
				if (!this.project.activeView) {
					this.host.button(toolbar, localize('ade.addFeature', "Add Feature"), () => { void this.commandService.executeCommand('ade.addFeature'); });
				}
			}
		}
		if (this.project.activeView) {
			const options = diagramActions ?? this.controls.details(toolbar, localize('ade.diagramOptions', "Diagram Options"), 'diagram-options');
			this.host.button(toolbar, localize('ade.properties', "Properties"), () => { this.inspectorOpen = !this.inspectorOpen; this.host.render(); }).setAttribute('aria-pressed', String(this.inspectorOpen));
			if (this.project.editable && this.project.activeView.kind !== 'sequence' && !(this.project.activeView.kind === 'activity' && this.project.activeView.interactionId)) { this.host.button(options, localize('ade.layout', "Arrange Diagram"), () => { void this.commandService.executeCommand('ade.layout'); }); }
			if (!interaction) { this.host.button(toolbar, localize('ade.createRelationship', "Create Relationship…"), () => { void this.beginConnection(this.project.selectedId); }).disabled = !this.project.editable; }
			this.host.button(options, localize('ade.readDiagram', "Read Diagram"), () => { void this.commandService.executeCommand('ade.readContext'); });
			if (!this.host.root.classList.contains('ade-canvas-mode')) { this.host.button(toolbar, localize('ade.fitDiagram', "Fit Diagram"), () => this.canvas.fitDiagram()); }
			this.host.iconButton(options, localize('ade.zoomOut', "Zoom Out"), Codicon.remove, () => { this.canvas.zoom = Math.max(0.4, this.canvas.zoom - 0.2); this.host.render(); });
			this.host.iconButton(options, localize('ade.zoomReset', "Reset Zoom"), Codicon.screenNormal, () => { this.canvas.zoom = 1; this.host.render(); });
			this.host.iconButton(options, localize('ade.zoomIn', "Zoom In"), Codicon.add, () => { this.canvas.zoom = Math.min(2, this.canvas.zoom + 0.2); this.host.render(); });
		} else if (this.project.section === 'element') {
			this.host.button(toolbar, localize('ade.readElement', "Read Element Details"), () => { void this.commandService.executeCommand('ade.readContext'); });
		} else if (this.project.section === 'impact') {
			this.host.button(toolbar, localize('ade.readImpact', "Read Change Impact"), () => { void this.commandService.executeCommand('ade.readContext'); });
		} else if (this.project.section === 'map') {
			this.host.button(toolbar, localize('ade.readMap', "Read System Map"), () => { void this.commandService.executeCommand('ade.readContext'); });
		}
	}

	installContextMenu(target: HTMLElement | SVGElement, show: (x: number, y: number) => void): void {
		this.canvas.interactions.add(dom.addDisposableListener(target, 'contextmenu', (event: MouseEvent) => { event.preventDefault(); event.stopPropagation(); show(event.clientX, event.clientY); }));
		this.canvas.interactions.add(dom.addDisposableListener(target, 'keydown', (event: KeyboardEvent) => {
			if (event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10') { event.preventDefault(); event.stopPropagation(); const box = target.getBoundingClientRect(); show(box.left, box.bottom); }
		}));
	}

	showMenu(x: number, y: number, actions: IAction[]): void {
		const restore = this.controls.captureFocus(this.host.root);
		this.contextMenus.showContextMenu({ getAnchor: () => ({ x, y }), getActions: () => actions, autoSelectItem: true, onHide: cancelled => { if (cancelled) { restore(); } } });
	}

	elementMenu(id: string, x: number, y: number): void {
		this.controls.setExpanded('ai-collaboration', false);
		this.relationSelection = undefined;
		this.project.selectElement(id);
		const command = (name: string, label: string) => toAction({ id: `ade.context.${name}`, label, run: () => this.commandService.executeCommand(`ade.${name}`) });
		const actions: IAction[] = [];
		if (this.project.editable) {
			actions.push(toAction({ id: 'ade.connectCanvas', label: localize('ade.context.connectCanvas', "Create Relationship on Canvas…"), run: () => this.beginConnection(id) }),
				command('connect', localize('ade.context.connect', "Create Relationship from List…")),
				command('renameElement', localize('ade.context.rename', "Rename…")), command('description', localize('ade.context.description', "Edit Description…")),
				command('behavior', localize('ade.context.behavior', "Edit Behavioral Contract…")), new Separator());
		}
		actions.push(toAction({ id: 'ade.context.details', label: localize('ade.elementDetails', "Element Details"), run: () => this.project.inspectElement(id) }),
			toAction({
				id: 'ade.context.perspectives', label: localize('ade.context.perspectives', "Show in Another Diagram…"), run: async () => {
					const choices = this.project.model.views.filter(view => view.nodes.some(node => node.elementId === id));
					const picked = await this.quick.pick(choices.map(view => ({ label: view.name, view })), { title: localize('ade.elementViews', "Diagrams Containing This Element") });
					if (picked) { this.host.revealElement(id, picked.view.id); }
				}
			}), toAction({ id: 'ade.context.impact', label: localize('ade.showImpact.button', "Show Change Impact"), run: () => this.project.showImpact(id) }));
		if (this.project.editable) { actions.push(new Separator(), command('removeElementFromDiagram', localize('ade.context.remove', "Remove from This Diagram")), command('deleteElement', localize('ade.context.delete', "Delete from the System…"))); }
		this.showMenu(x, y, actions);
	}

	relationMenu(id: string, x: number, y: number): void {
		const relation = this.project.model.semantics.relations.find(relation => relation.id === id);
		if (!relation) { return; }
		this.controls.setExpanded('ai-collaboration', false);
		this.inspectorOpen = true; this.relationSelection = id; this.host.render();
		const command = (name: string, label: string) => toAction({ id: `ade.context.${name}`, label, run: () => this.commandService.executeCommand(`ade.${name}`, id) });
		const actions: IAction[] = [];
		if (this.project.editable) { actions.push(command('editRelation', localize('ade.context.editRelation', "Edit Relationship…")), command('condition', localize('ade.editCondition', "Edit Condition")), command('relationError', localize('ade.editRelationError', "Edit Relationship Error")), new Separator()); }
		actions.push(toAction({ id: 'ade.context.source', label: localize('ade.context.source', "Go to Source"), run: () => this.host.revealElement(relation.from) }),
			toAction({ id: 'ade.context.target', label: localize('ade.context.target', "Go to Target"), run: () => this.host.revealElement(relation.to) }));
		if (this.project.editable) { actions.push(new Separator(), command('removeRelationFromDiagram', localize('ade.context.removeRelation', "Remove from This Diagram")), command('deleteRelation', localize('ade.context.deleteRelation', "Delete from All Diagrams…"))); }
		this.showMenu(x, y, actions);
	}

	async beginConnection(id: string): Promise<void> {
		const view = this.project.activeView;
		const source = this.project.model.semantics.elements.find(element => element.id === id);
		if (!view || !source) { this.notifications.info(localize('ade.context.selectSource', "Select a Source Element Before Creating a Relationship.")); return; }
		const version = this.project.documentVersion;
		const kind = await this.quick.pick((Object.keys(relationLabels) as RelationKind[]).filter(kind => acceptsNotationRelation(view.kind, { kind }) && (view.kind !== 'state' || kind === 'transition') && (view.kind !== 'sequence' || ['invocation', 'read', 'write'].includes(kind))
			&& view.nodes.some(node => { const target = this.project.model.semantics.elements.find(element => element.id === node.elementId)!; return isCompatibleRelation(kind, source.kind, target.kind) && (kind !== 'transition' || source.parentId === target.parentId); })).map(kind => ({ label: relationLabels[kind], kind })), { title: localize('ade.relationType', "Relationship Type") });
		if (!kind || version !== this.project.documentVersion) { return; }
		this.controls.setExpanded('canvas-actions', false);
		this.controls.setExpanded('canvas-code-unavailable', false);
		this.inspectorOpen = false;
		this.pendingConnection = { from: id, kind: kind.kind, viewId: view.id, version }; this.host.render();
		this.controls.focusTarget('canvas');
	}

	async finishConnection(id: string): Promise<void> {
		const pending = this.pendingConnection;
		if (!pending) { return; }
		const from = this.project.model.semantics.elements.find(element => element.id === pending.from)!;
		const to = this.project.model.semantics.elements.find(element => element.id === id)!;
		if (!isCompatibleRelation(pending.kind, from.kind, to.kind) || pending.kind === 'transition' && from.parentId !== to.parentId) { this.notifications.info(localize('ade.context.incompatible', "This Target Is Incompatible with the Selected Relationship Type. Choose Another Target or Press Escape.")); return; }
		this.pendingConnection = undefined;
		const name = await this.quick.input({ title: localize('ade.relationName', "Relationship Name") });
		if (name === undefined) { this.host.render(); return; }
		const condition = await this.quick.input({ title: localize('ade.conditionInput', "Condition (Optional)") });
		if (condition === undefined) { this.host.render(); return; }
		if (pending.version !== this.project.documentVersion) { this.notifications.info(localize('ade.context.staleConnection', "The Project Changed. Create the Relationship Again from the Current Diagram.")); return; }
		this.project.edit({ kind: 'relation', id: generateUuid(), viewId: pending.viewId, from: pending.from, to: id, relationKind: pending.kind, name, condition });
	}

	constructor(
		private readonly host: AdeCanvasSurfaceHost,
		private readonly canvas: AdeCanvasController,
		private readonly controls: AdeControls,
		private readonly project: AdeProjectService,
		private readonly commandService: ICommandService,
		private readonly quick: IQuickInputService,
		private readonly contextMenus: IContextMenuService,
		private readonly notifications: INotificationService
	) {
	}
}
