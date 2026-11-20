import * as dom from '../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { acceptsNotationElement, notationRules } from '../common/modelNotation.js';
import { ElementKind, ModelView, SemanticModel } from '../common/modelTypes.js';
import { getStateDiagram } from '../common/stateDiagram.js';
import { getElementPath } from '../common/visualNavigation.js';
import { VisualEdit } from '../common/visualEditing.js';
import { OrditoFormDialog } from './orditoFormDialog.js';
import { elementLabels, viewLabels } from './orditoLabels.js';

/** Collects a diagram and its optional resource as one detached, atomic change. */
export async function createOrditoDiagramForm(parent: HTMLElement, model: SemanticModel, featureId?: string): Promise<VisualEdit[] | undefined> {
	const features = model.semantics.elements.filter(element => element.kind === 'feature');
	if (featureId && !features.some(feature => feature.id === featureId)) { return; }
	const dialog = new OrditoFormDialog(parent, { title: localize('ordito.form.createDiagram', "Create Diagram"), description: model.name, confirmLabel: localize('ordito.form.create', "Create") });
	const listeners = new DisposableStore();
	try {
		const name = dialog.text(dialog.body, localize('ordito.name', "Name"), '', { required: true });
		const labels: Partial<typeof viewLabels> = { structure: localize('ordito.structure', "Structure Diagram"), activity: localize('ordito.activity', "Activity Flow"), sequence: localize('ordito.sequence', "Sequence Diagram"), state: localize('ordito.stateDiagram', "State Diagram") };
		const kind = dialog.select(dialog.body, localize('ordito.diagramType', "Diagram Type"), 'structure', (Object.keys(viewLabels) as ModelView['kind'][]).map(value => ({ value, label: labels[value] ?? viewLabels[value] })));
		const feature = features.length ? dialog.select(dialog.body, localize('ordito.pickFeature', "Choose Feature"), featureId ?? features[0].id, features.map(feature => ({ value: feature.id, label: feature.name })), { required: true }) : undefined;
		const state = dom.append(dialog.body, dom.$<HTMLFieldSetElement>('fieldset.ordito-form-group'));
		dom.append(state, dom.$('legend')).textContent = localize('ordito.state.pickResource', "Resource Lifecycle");
		const resources = model.semantics.elements.filter(element => element.kind === 'resource');
		const resource = dialog.select(state, localize('ordito.stateOwner', "Resource Whose State Is Represented"), resources[0]?.id ?? '', [
			...resources.map(resource => ({ value: resource.id, label: localize('ordito.form.resourceContext', "{0} · {1}", resource.name, [model.name, ...getElementPath(model, resource.id).slice(0, -1).map(parent => parent.name)].join(' / ')) })),
			{ value: '', label: localize('ordito.state.createResource', "Create New Resource") }
		]);
		const resourceName = dialog.text(state, localize('ordito.state.resourceName', "Resource Name"), '', { required: true });
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
export async function createOrditoElementForm(parent: HTMLElement, model: SemanticModel, view: ModelView): Promise<{ kind: ElementKind; name: string; parentId?: string } | undefined> {
	const scopedC4 = (model.version === 4 || model.version === 5) && !!view.subjectId && ['c4Context', 'c4Container', 'c4Component'].includes(view.kind);
	const candidates = (Object.keys(elementLabels) as ElementKind[]).filter(kind => kind !== 'feature' && acceptsNotationElement(view.kind, { kind }) && (view.kind !== 'state' || kind === 'state'));
	if (!candidates.length) { return; }
	const defaultKind = view.kind === 'activity' ? 'action' : notationRules[view.kind]?.core.find(kind => candidates.includes(kind)) ?? candidates[0];
	const dialog = new OrditoFormDialog(parent, { title: view.kind === 'state' ? localize('ordito.state.addState', "Add State") : localize('ordito.addElement', "Add Element"), description: view.name, confirmLabel: localize('ordito.form.create', "Create") });
	const listeners = new DisposableStore();
	try {
		const name = dialog.text(dialog.body, localize('ordito.name', "Name"), '', { required: true });
		const kind = dialog.select(dialog.body, localize('ordito.elementType', "Element Type"), defaultKind, candidates.map(value => ({
			value,
			label: value === 'system' && scopedC4 ? localize('ordito.externalSystemElement', "External Software System") : value === 'container' && scopedC4 && view.kind === 'c4Component' ? localize('ordito.contextContainerElement', "Context Container") : elementLabels[value]
		})));
		const hint = dom.append(dialog.body, dom.$('p.ordito-form-hint'));
		const state = dom.append(dialog.body, dom.$<HTMLFieldSetElement>('fieldset.ordito-form-group'));
		const resources = view.kind === 'state' ? getStateDiagram(model, view).groups.map(group => group.resource) : model.semantics.elements.filter(element => element.kind === 'resource');
		const resource = dialog.select(state, localize('ordito.stateOwner', "Resource Whose State Is Represented"), resources[0]?.id ?? '', resources.map(resource => ({
			value: resource.id,
			label: localize('ordito.form.resourceContext', "{0} · {1}", resource.name, [model.name, ...getElementPath(model, resource.id).slice(0, -1).map(parent => parent.name)].join(' / '))
		})), { required: true });
		const update = () => {
			state.hidden = state.disabled = kind.value !== 'state';
			hint.textContent = kind.value === 'container' && scopedC4 && view.kind === 'c4Component' ? localize('ordito.contextContainerElement', "Context Container") : (model.version === 4 || model.version === 5) && view.kind === 'class' && view.subjectId ? localize('ordito.contractContextElement', "Contract Diagram Context") : '';
			hint.hidden = !hint.textContent;
		};
		listeners.add(dom.addDisposableListener(kind, 'change', update));
		update();
		return await dialog.open(() => ({ kind: kind.value as ElementKind, name: name.value.trim(), ...(kind.value === 'state' ? { parentId: resource.value } : {}) }), () => kind.value === 'state' && !resources.some(entry => entry.id === resource.value) ? localize('ordito.form.stateResourceRequired', "Choose a resource before creating a state.") : undefined);
	} finally { listeners.dispose(); dialog.dispose(); }
}
