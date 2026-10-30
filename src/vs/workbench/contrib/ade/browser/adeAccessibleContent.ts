/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { ModelView, SemanticModel, SemanticRelation } from '../common/semanticModel.js';
import { getDiagramGroups } from '../common/visualNavigation.js';
import { getSystemMap } from '../common/systemMap.js';
import { elementLabels, relationLabels, viewLabels } from './adeLabels.js';

/** Presentation state only: reading the diagram never edits or saves its document. */
export interface AdeReadingState {
	readonly model: SemanticModel;
	readonly activeView: ModelView | undefined;
	readonly selectedId: string;
	readonly section: 'home' | 'diagram' | 'element' | 'map';
	readonly loading: boolean;
	readonly error: string | undefined;
	readonly saveError: string | undefined;
	readonly dirty: boolean;
	readonly editable: boolean;
	readonly diagnostics: readonly string[];
}

/** Describe visible semantic identities rather than SVG geometry or inferred runtime behavior. */
export function describeAdeDiagram(state: AdeReadingState): string {
	const title = localize('ade.reading.title', "A.D.E Visual Workbench");
	if (state.section === 'home') {
		return [title, localize('ade.reading.home', "Home. Create a project, open a project or model, or explore the read-only purchase example."),
			localize('ade.reading.planned', "Code import, Sync and AI collaboration are planned and are not available yet.")].join('\n');
	}
	if (state.loading) { return [title, localize('ade.reading.loading', "Loading model. No current diagram is available.")].join('\n'); }
	if (state.error) { return [title, state.error, localize('ade.reading.recovery', "Use Retry or Open Model to recover.")].join('\n'); }
	const model = state.model;
	const elements = new Map(model.semantics.elements.map(element => [element.id, element]));
	const view = state.section === 'element' || state.section === 'map' ? undefined : state.activeView;
	const lines = [title, localize('ade.reading.system', "System: {0}", model.name),
		state.editable ? (state.dirty ? localize('ade.reading.dirty', "Unsaved Changes") : localize('ade.reading.saved', "Saved")) : localize('ade.reading.readonly', "Read-only"),
		localize('ade.reading.intent', "Design intent. Conditions are declarations, not execution results.")];
	if (state.saveError) { lines.push(state.saveError); }
	lines.push(...state.diagnostics);
	const describeRelation = (relation: SemanticRelation): void => {
		lines.push(localize('ade.reading.relation', "{0} to {1}: {2}. {3}", elements.get(relation.from)!.name, elements.get(relation.to)!.name, relationLabels[relation.kind], relation.name));
		if (relation.condition) { lines.push(localize('ade.reading.condition', "Condition: {0}", relation.condition)); }
		if (relation.errorCode) { lines.push(localize('ade.reading.error', "Error: {0}", relation.errorCode)); }
	};
	if (state.section === 'map') {
		const overview = getSystemMap(model);
		lines.push(localize('ade.reading.map', "System Map. Groups follow semantic containment; connections summarize declared relationships."));
		if (!overview.branches.length) { lines.push(localize('ade.reading.emptyMap', "This system has no elements.")); }
		for (const branch of overview.branches) {
			lines.push('', localize('ade.reading.group', "Group: {0}", branch.root.name));
			for (const { element } of branch.members) {
				lines.push(localize('ade.reading.mapElement', "{0} ({1}), parent: {2}", element.name, elementLabels[element.kind], element.parentId ? elements.get(element.parentId)!.name : model.name));
			}
		}
		for (const group of getDiagramGroups(model)) {
			for (const diagram of group.views) { lines.push(localize('ade.reading.mapDiagram', "{0}: {1}", group.name, diagram.name)); }
		}
		for (const connection of overview.connections) {
			lines.push('', localize('ade.reading.mapConnection', "{0} to {1}: {2} relationships", elements.get(connection.from)!.name, elements.get(connection.to)!.name, connection.relations.length));
			for (const relation of connection.relations) { describeRelation(relation); }
		}
		return lines.join('\n');
	}
	if (!view && state.section !== 'element') {
		lines.push(localize('ade.reading.noDiagrams', "This project has no diagrams. Add a feature to begin."));
		return lines.join('\n');
	}
	const visible = new Set(view?.nodes.map(node => node.elementId) ?? []);
	if (view) {
		const group = getDiagramGroups(model).find(group => group.views.some(candidate => candidate.id === view.id));
		lines.push(localize('ade.reading.diagram', "Diagram: {0}", view.name), group?.featureId
			? localize('ade.reading.feature', "Feature: {0}", group.name) : localize('ade.reading.systemDiagram', "System Diagram"));
		lines.push(localize('ade.diagramType', "Diagram Type: {0}", viewLabels[view.kind]));
		lines.push('', localize('ade.reading.elements', "Elements in This Diagram: {0}", view.nodes.length));
		for (const [index, node] of view.nodes.entries()) {
			const element = elements.get(node.elementId)!;
			lines.push(localize('ade.reading.element', "{0}. {1} ({2})", index + 1, element.name, elementLabels[element.kind]));
			if (element.description) { lines.push(element.description); }
		}
		if (!view.nodes.length) { lines.push(localize('ade.reading.empty', "This diagram has no elements.")); }
	} else {
		const element = elements.get(state.selectedId);
		if (!element) { return lines.join('\n'); }
		lines.push(localize('ade.reading.details', "Element Details: {0}", element.name), elementLabels[element.kind]);
		if (element.description) { lines.push(element.description); }
		const children = model.semantics.elements.filter(child => child.parentId === element.id);
		if (children.length) { lines.push(localize('ade.reading.children', "Contained Elements: {0}", children.map(child => child.name).join(', '))); }
		if (element.kind === 'feature') {
			const owned = getDiagramGroups(model).find(group => group.featureId === element.id)?.views ?? [];
			lines.push(localize('ade.reading.featureDiagrams', "Feature Diagrams: {0}", owned.map(candidate => candidate.name).join(', ')));
		} else {
			const views = model.views.filter(candidate => candidate.nodes.some(node => node.elementId === element.id));
			if (views.length) { lines.push(localize('ade.reading.perspectives', "Diagrams Containing This Element: {0}", views.map(candidate => candidate.name).join(', '))); }
			else { lines.push(localize('ade.reading.unplaced', "This element is not placed in a diagram.")); }
		}
	}

	const relations = model.semantics.relations.filter(relation => view ? view.relationIds.includes(relation.id) : relation.from === state.selectedId || relation.to === state.selectedId);
	lines.push('', view ? localize('ade.reading.relations', "Relationships in This Diagram: {0}", relations.length) : localize('ade.reading.detailRelations', "Related Relationships: {0}", relations.length));
	for (const relation of relations) { describeRelation(relation); }
	const selected = state.section === 'element' || visible.has(state.selectedId) ? elements.get(state.selectedId) : undefined;
	if (selected) {
		lines.push('', localize('ade.reading.selected', "Selected Element: {0}", selected.name));
		if (selected.parentId) { lines.push(localize('ade.reading.parent', "Parent: {0}", elements.get(selected.parentId)!.name)); }
		if (selected.behavior) {
			for (const field of selected.behavior.inputs) { lines.push(localize('ade.reading.input', "Input: {0} ({1}), {2}", field.name, field.type, field.required ? localize('ade.reading.required', "Required") : localize('ade.reading.optional', "Optional"))); }
			for (const field of selected.behavior.outputs) { lines.push(localize('ade.reading.output', "Output: {0} ({1}), {2}", field.name, field.type, field.required ? localize('ade.reading.required', "Required") : localize('ade.reading.optional', "Optional"))); }
			for (const condition of selected.behavior.preconditions) { lines.push(localize('ade.reading.precondition', "Precondition: {0}", condition)); }
			for (const condition of selected.behavior.postconditions) { lines.push(localize('ade.reading.postcondition', "Postcondition: {0}", condition)); }
			for (const error of selected.behavior.errors) { lines.push(localize('ade.reading.behaviorError', "Error {0}: {1}", error.code, error.description)); }
			for (const permission of selected.behavior.permissions) { lines.push(localize('ade.reading.permission', "Authorization: {0}, {1}", elements.get(permission.actorId)!.name, permission.capability)); }
			for (const criterion of selected.behavior.acceptanceCriteria) { lines.push(localize('ade.reading.criterion', "Given {0}, when {1}, then {2}.", criterion.given, criterion.when, criterion.then)); }
		}
		const related = view ? model.semantics.relations.filter(relation => !view.relationIds.includes(relation.id) && (relation.from === selected.id || relation.to === selected.id)) : [];
		if (related.length) {
			lines.push(localize('ade.reading.otherRelations', "Other Relationships of the Selected Element, Not Shown in This Diagram:"));
			for (const relation of related) { describeRelation(relation); }
		}
		lines.push(localize('ade.reading.evidence', "Code mappings: {0}. Verification records: {1}.", model.codeMappings.filter(mapping => mapping.elementId === selected.id).length, model.verifications.filter(verification => verification.elementId === selected.id).length));
	}
	return lines.join('\n');
}

/** Keyboard guidance uses native keybinding placeholders, resolved by Accessible View. */
export function describeAdeHelp(state: AdeReadingState): string {
	return [localize('ade.help.title', "A.D.E Accessibility Help"),
		localize('ade.help.groups', "System and feature groups in the sidebar expand or collapse with Enter or Space on their summary. Their state is saved separately for each project document. Related Diagrams links to diagrams containing a feature's descendants without changing the diagram's owner. Choosing an element keeps the sidebar controls in place."),
		localize('ade.help.map', "System Map shows every element once, grouped by semantic containment, including elements not placed in diagrams. Open an element for details or a feature diagram to explore it. Connections Between Groups expands to show the original directed relationships, conditions and source and target buttons. The system breadcrumb opens this map. Read System Map opens its text equivalent; Back and Forward include the map."),
		localize('ade.help.semanticNavigation', "Search System filters elements and diagrams by type and searches names, ancestry and diagram names. Unplaced elements open Element Details. The Semantic Path opens ancestor details; Back and Forward restore navigation within the current project. Diagrams Containing This Element changes perspective while preserving the selected identity."),
		localize('ade.help.navigation', "Tab and Shift+Tab move between navigation, diagram controls, elements, properties and technical tools. Enter or Space activates a button or opens an options section."),
		localize('ade.help.behavior', "Edit Behavioral Contract in Properties edits inputs, outputs, preconditions, postconditions and errors through native choices. Escape cancels the current entry. Each completed change can be undone. Edit Relationship Error assigns or clears a declared source error; clear references before removing or renaming an error."),
		localize('ade.help.reading', "Use <keybinding:editor.action.accessibleView> to read the current diagram as text. The view includes elements, relationships, conditions and details of the selected element. Escape returns to the previous control."),
		state.section === 'home'
			? localize('ade.help.home', "On Home, choose Create Project, Open Project, Open Model or Explore Purchase Example. The purchase example is read-only.")
			: localize('ade.help.selection', "Focus an element and press Enter or Space to select it and update Properties. Each diagram keeps its own selection."),
		state.loading ? localize('ade.help.loading', "The model is loading. Wait for it to finish before selecting or editing elements.")
			: state.error ? localize('ade.help.invalid', "The model is unavailable or invalid. Use Retry or Open Model. The previous diagram is not current.")
			: state.section === 'element' ? localize('ade.help.details', "You are in Element Details. Follow relationships or contained elements, or choose a diagram containing this element. Writable projects allow renaming, description changes, behavioral contract editing and deletion from the Properties actions.")
			: state.editable
			? localize('ade.help.editing', "Arrow keys move the focused element. Shift increases the step. Focus the diagram background to pan with arrow keys. Add Element creates an element; Connect Selection creates a compatible relationship.")
			: localize('ade.help.readonly', "Editing is unavailable in the read-only example or a read-only file. Open a writable project to edit. Focus the diagram background to pan with arrow keys."),
		localize('ade.help.options', "Project Options contains Reload Project and Save Project Copy. Diagram Options contains diagram management and arrangement. Feature Options in the sidebar manages a feature. Fit Diagram adapts the diagram to the available area."),
		localize('ade.help.commands', "Open the Command Palette with <keybinding:workbench.action.showCommands> for all A.D.E commands. Save with <keybinding:workbench.action.files.save>, undo with <keybinding:undo>, and redo with <keybinding:redo>."),
		localize('ade.help.recovery', "Save Project Copy preserves the original file and visual context. Reload Project asks before discarding unsaved changes. Save errors remain visible; an invalid model hides the previous diagram until it is repaired."),
		localize('ade.help.tools', "Files, Terminal, Debug and Git open technical tools. Return to Model (<keybinding:ade.showDiagram>) returns to the same diagram, map or element details and selection."),
		localize('ade.help.limits', "The model describes design intent. Conditions do not execute code. Code import, Sync and AI collaboration are planned and are not available yet.")].join('\n\n');
}
