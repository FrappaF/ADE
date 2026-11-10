/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { containmentKinds } from '../common/modelTypes.js';
import { elementLabels } from './adeLabels.js';
import { editAdeElementNotation, editAdeRelationNotation } from './adeNotationEditing.js';
import { editAdeBehavior } from './adeBehaviorEditing.js';
import { getElementPath } from '../common/visualNavigation.js';
import { type AdeEditingContext } from './adeEditingContext.js';
import { type AdeEditingCommand } from './adeEditingCommands.js';

/** Collects structure intent; domain mutation remains in the project service. */
export async function runAdeStructureCommand(ui: AdeEditingContext, command: Extract<AdeEditingCommand, 'addFeature' | 'parent' | 'notation' | 'relationNotation' | 'renameFeature' | 'deleteFeature' | 'renameElement' | 'description' | 'behavior' | 'deleteElement'>, id?: string): Promise<void> {
	const model = ui.project.model;
	const selected = model.semantics.elements.find(element => element.id === ui.project.selectedId);
	if (command === 'addFeature') {
		const name = await ui.name();
		if (!name) { return; }
		const featureId = generateUuid();
		const structureId = generateUuid();
		ui.edit([
			{ kind: 'feature', id: featureId, name },
			{ kind: 'diagram', id: structureId, featureId, name: localize('ade.structureName', "{0} · Structure", name), viewKind: 'structure' },
			{ kind: 'diagram', id: generateUuid(), featureId, name: localize('ade.activityName', "{0} · Flow", name), viewKind: 'activity' }
		]);
		ui.project.showDiagram(structureId);
	}
	if (command === 'parent' && selected) {
		const eligible = model.semantics.elements.filter(element => containmentKinds.includes(element.kind) && !getElementPath(model, element.id).some(parent => parent.id === selected.id) && (selected.kind !== 'state' || element.kind === 'resource'));
		const parent = await ui.quickInput.pick([
			...eligible.map(element => ({ label: element.name, description: elementLabels[element.kind], parentId: element.id })),
			...(selected.kind !== 'state' ? [{ label: localize('ade.notation.noParent', "No Parent / System Root"), parentId: undefined }] : [])
		], { title: localize('ade.notation.parent', "Choose Boundary or Parent") });
		if (parent) { ui.edit({ kind: 'parent', id: selected.id, parentId: parent.parentId }); }
	}
	if (command === 'notation' && selected) {
		const details = await editAdeElementNotation(ui.quickInput, selected, model.version);
		if (details) { ui.edit({ kind: 'elementDetails', id: selected.id, details }); }
	}
	if (command === 'relationNotation' && id) {
		const relation = model.semantics.relations.find(relation => relation.id === id);
		if (relation) { const details = await editAdeRelationNotation(ui.quickInput, relation); if (details) { ui.edit({ kind: 'relationDetails', id, details }); } }
	}
	if (command === 'renameFeature' || command === 'deleteFeature') {
		const feature = await ui.feature(id);
		if (!feature) { return; }
		if (command === 'deleteFeature') { await ui.deleteElement(feature); } else {
			const name = await ui.name(feature.name);
			if (name) { ui.edit({ kind: 'rename', target: 'element', id: feature.id, name }); }
		}
	}
	if (command === 'renameElement' && selected) {
		const name = await ui.name(selected.name);
		if (name) { ui.edit({ kind: 'rename', target: 'element', id: selected.id, name }); }
	}
	if (command === 'description' && selected) {
		const description = await ui.quickInput.input({ title: localize('ade.description', "Description"), value: selected.description });
		if (description !== undefined) { ui.edit({ kind: 'description', id: selected.id, description }); }
	}
	if (command === 'behavior' && selected) {
		const behavior = await editAdeBehavior(ui.quickInput, model, selected);
		if (behavior) { ui.edit({ kind: 'behavior', id: selected.id, behavior }); }
	}
	if (command === 'deleteElement' && selected) {
		await ui.deleteElement(selected);
	}
}
