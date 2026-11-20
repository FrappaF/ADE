import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { getDiagramGroups, getElementPath } from '../common/visualNavigation.js';
import { AdeInput } from './adeInput.js';
import { elementLabels } from './adeLabels.js';
import { IAdeProjectService } from './adeProjectService.js';
import { AdeEditor } from './adeEditor.js';

interface SearchItem extends IQuickPickItem { elementId?: string; viewId?: string }

registerAction2(class extends Action2 {
	constructor() { super({ id: 'ade.showImpact', title: localize2('ade.showImpact', "A.D.E: Show Change Impact"), f1: true }); }
	async run(accessor: ServicesAccessor): Promise<void> {
		const project = accessor.get(IAdeProjectService);
		const quickInput = accessor.get(IQuickInputService);
		const editors = accessor.get(IEditorService);
		if (project.loading || project.error) { return; }
		let id = project.selectedId;
		if (!id || project.section === 'map' || project.section === 'home') {
			const version = project.documentVersion;
			const picked = await quickInput.pick(project.model.semantics.elements.map(element => ({ label: element.name, description: elementLabels[element.kind], id: element.id })), { title: localize('ade.impact.choose', "Change Impact of Element") });
			if (!picked || version !== project.documentVersion) { return; }
			id = picked.id;
		}
		project.showImpact(id);
		await editors.openEditor({ resource: AdeInput.RESOURCE, options: { pinned: true, revealIfOpened: true } });
	}
});

registerAction2(class extends Action2 {
	constructor() { super({ id: 'ade.search', title: localize2('ade.search', "A.D.E: Search System"), f1: true }); }
	async run(accessor: ServicesAccessor): Promise<void> {
		const project = accessor.get(IAdeProjectService);
		const quickInput = accessor.get(IQuickInputService);
		const editors = accessor.get(IEditorService);
		const notifications = accessor.get(INotificationService);
		if (project.loading || project.error) { return; }
		const resource = project.modelUri?.toString();
		const model = project.model;

		const items: SearchItem[] = [];
		{
			for (const element of model.semantics.elements) {
				const views = model.views.filter(view => view.nodes.some(node => node.elementId === element.id));
				items.push({ label: element.name, elementId: element.id, description: elementLabels[element.kind],
					detail: localize('ade.search.context', "{0} · {1}", [model.name, ...getElementPath(model, element.id).slice(0, -1).map(parent => parent.name)].join(' / '),
						views.length ? views.map(view => view.name).join(', ') : localize('ade.search.unplaced', "Element Details — Not in a Diagram")) });
			}
		}
		{
			for (const group of getDiagramGroups(model)) {
				for (const view of group.views) { items.push({ label: view.name, viewId: view.id, description: localize('ade.search.diagramKind', "Diagram"), detail: group.name }); }
			}
		}
		const item = await quickInput.pick(items, { title: localize('ade.search.title', "Search System"), placeHolder: localize('ade.search.placeholder', "Search names, types, features and diagrams"), matchOnDescription: true, matchOnDetail: true });
		if (!item) { return; }
		if (resource !== project.modelUri?.toString() || model.id !== project.model.id) {
			notifications.info(localize('ade.search.changed', "The project changed while search was open. Search the current project again."));
			return;
		}
		if (item.elementId) { project.revealElement(item.elementId); }
		else if (item.viewId) { project.showDiagram(item.viewId); }
		const pane = await editors.openEditor({ resource: AdeInput.RESOURCE, options: { pinned: true, revealIfOpened: true } });
		if (pane instanceof AdeEditor) { pane.focusSelection(); }
	}
});

for (const [id, title] of [
	['showSystemMap', localize2('ade.showSystemMap', "A.D.E: Show System Map")],
	['goBack', localize2('ade.goBack', "A.D.E: Go Back")],
	['goForward', localize2('ade.goForward', "A.D.E: Go Forward")]
] as const) {
	registerAction2(class extends Action2 {
		constructor() { super({ id: `ade.${id}`, title, f1: true }); }
		async run(accessor: ServicesAccessor): Promise<void> {
			const project = accessor.get(IAdeProjectService);
			if (id === 'showSystemMap') { project.showSystemMap(); }
			else if (id === 'goBack') { project.goBack(); } else { project.goForward(); }
			const pane = await accessor.get(IEditorService).openEditor({ resource: AdeInput.RESOURCE, options: { pinned: true, revealIfOpened: true } });
			if (pane instanceof AdeEditor) { pane.showWorkspace(); }
		}
	});
}
