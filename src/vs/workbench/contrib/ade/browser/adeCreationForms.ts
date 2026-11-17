/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { acceptsNotationElement } from '../common/modelNotation.js';
import { ElementKind, ModelView, SemanticModel } from '../common/modelTypes.js';
import { getStateDiagram } from '../common/stateDiagram.js';
import { getElementPath } from '../common/visualNavigation.js';
import { VisualEdit } from '../common/visualEditing.js';
import { AdeFormDialog } from './adeFormDialog.js';
import { elementLabels, viewLabels } from './adeLabels.js';

/** Collects a diagram and its optional resource as one detached, atomic change. */
export async function createAdeDiagramForm(parent: HTMLElement, model: SemanticModel, featureId?: string): Promise<VisualEdit[] | undefined> {
	const features = model.semantics.elements.filter(element => element.kind === 'feature');
	if (featureId && !features.some(feature => feature.id === featureId)) { return; }
	const dialog = new AdeFormDialog(parent, { title: localize('ade.form.createDiagram', "Create Diagram"), description: model.name, confirmLabel: localize('ade.form.create', "Create") });
	const listeners = new DisposableStore();
	try {
		const name = dialog.text(dialog.body, localize('ade.name', "Name"), '', { required: true });
		const labels: Partial<typeof viewLabels> = { structure: localize('ade.structure', "Structure Diagram"), activity: localize('ade.activity', "Activity Flow"), sequence: localize('ade.sequence', "Sequence Diagram"), state: localize('ade.stateDiagram', "State Diagram") };
		const kind = dialog.select(dialog.body, localize('ade.diagramType', "Diagram Type"), 'structure', (Object.keys(viewLabels) as ModelView['kind'][]).map(value => ({ value, label: labels[value] ?? viewLabels[value] })));
		const feature = features.length ? dialog.select(dialog.body, localize('ade.pickFeature', "Choose Feature"), featureId ?? features[0].id, features.map(feature => ({ value: feature.id, label: feature.name })), { required: true }) : undefined;
		const state = dom.append(dialog.body, dom.$<HTMLFieldSetElement>('fieldset.ade-form-group'));
		dom.append(state, dom.$('legend')).textContent = localize('ade.state.pickResource', "Resource Lifecycle");
		const resources = model.semantics.elements.filter(element => element.kind === 'resource');
		const resource = dialog.select(state, localize('ade.stateOwner', "Resource Whose State Is Represented"), resources[0]?.id ?? '', [
			...resources.map(resource => ({ value: resource.id, label: localize('ade.form.resourceContext', "{0} · {1}", resource.name, [model.name, ...getElementPath(model, resource.id).slice(0, -1).map(parent => parent.name)].join(' / ')) })),
			{ value: '', label: localize('ade.state.createResource', "Create New Resource") }
		]);
		const resourceName = dialog.text(state, localize('ade.state.resourceName', "Resource Name"), '', { required: true });
		const update = () => {
			state.hidden = state.disabled = kind.value !== 'state';
			resourceName.disabled = resource.value !== '';
			resourceName.closest('label')!.hidden = resourceName.disabled;
		};
		listeners.add(dom.addDisposableListener(kind, 'change', update));
		listeners.add(dom.addDisposableListener(resource, 'change', update));
		update();
		return await dialog.open(() => {
			const edits: VisualEdit[] = [];
			const ownerId = feature?.value || undefined;
			const viewId = generateUuid();
			if (kind.value === 'state') {
				const resourceId = resource.value || generateUuid();
				if (!resource.value) { edits.push({ kind: 'resource', id: resourceId, name: resourceName.value.trim(), parentId: ownerId }); }
				edits.push({ kind: 'stateDiagram', id: viewId, name: name.value.trim(), featureId: ownerId, resourceId });
			} else {
				edits.push({ kind: 'diagram', id: viewId, name: name.value.trim(), featureId: ownerId, viewKind: kind.value as Exclude<ModelView['kind'], 'state'> });
			}
			return edits;
		});
	} finally { listeners.dispose(); dialog.dispose(); }
}

/** Keeps type, name and state ownership visible together while creating an element. */
export async function createAdeElementForm(parent: HTMLElement, model: SemanticModel, view: ModelView): Promise<{ kind: ElementKind; name: string; parentId?: string } | undefined> {
	const scopedC4 = (model.version === 4 || model.version === 5) && !!view.subjectId && ['c4Context', 'c4Container', 'c4Component'].includes(view.kind);
	const candidates = (Object.keys(elementLabels) as ElementKind[]).filter(kind => kind !== 'feature' && acceptsNotationElement(view.kind, { kind }) && (view.kind !== 'state' || kind === 'state'));
	if (!candidates.length) { return; }
	const dialog = new AdeFormDialog(parent, { title: view.kind === 'state' ? localize('ade.state.addState', "Add State") : localize('ade.addElement', "Add Element"), description: view.name, confirmLabel: localize('ade.form.create', "Create") });
	const listeners = new DisposableStore();
	try {
		const name = dialog.text(dialog.body, localize('ade.name', "Name"), '', { required: true });
		const kind = dialog.select(dialog.body, localize('ade.elementType', "Element Type"), candidates[0], candidates.map(value => ({
			value,
			label: value === 'system' && scopedC4 ? localize('ade.externalSystemElement', "External Software System") : value === 'container' && scopedC4 && view.kind === 'c4Component' ? localize('ade.contextContainerElement', "Context Container") : elementLabels[value]
		})));
		const hint = dom.append(dialog.body, dom.$('p.ade-form-hint'));
		const state = dom.append(dialog.body, dom.$<HTMLFieldSetElement>('fieldset.ade-form-group'));
		const resources = view.kind === 'state' ? getStateDiagram(model, view).groups.map(group => group.resource) : model.semantics.elements.filter(element => element.kind === 'resource');
		const resource = dialog.select(state, localize('ade.stateOwner', "Resource Whose State Is Represented"), resources[0]?.id ?? '', resources.map(resource => ({
			value: resource.id,
			label: localize('ade.form.resourceContext', "{0} · {1}", resource.name, [model.name, ...getElementPath(model, resource.id).slice(0, -1).map(parent => parent.name)].join(' / '))
		})), { required: true });
		const update = () => {
			state.hidden = state.disabled = kind.value !== 'state';
			hint.textContent = kind.value === 'container' && scopedC4 && view.kind === 'c4Component' ? localize('ade.contextContainerElement', "Context Container") : (model.version === 4 || model.version === 5) && view.kind === 'class' && view.subjectId ? localize('ade.contractContextElement', "Contract Diagram Context") : '';
			hint.hidden = !hint.textContent;
		};
		listeners.add(dom.addDisposableListener(kind, 'change', update));
		update();
		return await dialog.open(() => ({ kind: kind.value as ElementKind, name: name.value.trim(), ...(kind.value === 'state' ? { parentId: resource.value } : {}) }), () => kind.value === 'state' && !resources.some(entry => entry.id === resource.value) ? localize('ade.form.stateResourceRequired', "Choose a resource before creating a state.") : undefined);
	} finally { listeners.dispose(); dialog.dispose(); }
}
