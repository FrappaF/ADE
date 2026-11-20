import { type DescriptiveScenario, type ModelInteraction, type ModelView, type SemanticElement, type SemanticModel } from './modelTypes.js';
import { describeModelInteraction } from './modelInteractions.js';

/** A linked behavior owns its participants and steps independently of manual diagram nodes. */
export function getProjectedInteraction(model: SemanticModel, view: ModelView) {
	if ((model.version !== 4 && model.version !== 5) || view.kind !== 'sequence' && !(model.version === 5 && view.kind === 'activity')) { return undefined; }
	return model.foundation.interactions.find(interaction => interaction.id === view.interactionId);
}

/** Imported descriptive behavior uses the same model for manual and generated edits. */
export function getEditableScenario(model: SemanticModel, view: ModelView): (ModelInteraction & { description: DescriptiveScenario }) | undefined {
	const interaction = model.version === 5 ? getProjectedInteraction(model, view) : undefined;
	return interaction?.profile === 'descriptive' && interaction.description && !interaction.execution
		? interaction as ModelInteraction & { description: DescriptiveScenario }
		: undefined;
}

export function getViewSelectionIds(model: SemanticModel, view: ModelView): string[] {
	const ids = view.nodes.map(node => node.elementId);
	const interaction = getProjectedInteraction(model, view);
	if (interaction && (model.version === 4 || model.version === 5)) {
		ids.push(...(interaction.description?.participantIds ?? []));
		for (const call of model.foundation.occurrences.filter(call => interaction.occurrenceIds.includes(call.id))) { ids.push(call.from, call.to); }
		ids.push(...describeModelInteraction(model, interaction.id).map(row => row.id));
	}
	return [...new Set(ids)];
}

export interface DiagramGroup {
	featureId?: string;
	name: string;
	views: ModelView[];
}

/** Feature references include descendants and explicitly owned empty diagrams, without changing ownership. */
export function getFeatureViews(model: SemanticModel, feature: SemanticElement): ModelView[] {
	if ((model.version === 4 || model.version === 5)) {
		const ids = new Set([feature.id]);
		for (const entry of model.foundation.memberships) {
			if (entry.featureId === feature.id) { ids.add(entry.elementId); }
		}
		const children = Map.groupBy(model.foundation.ownership, entry => entry.ownerId);
		for (const id of ids) {
			for (const entry of children.get(id) ?? []) { ids.add(entry.elementId); }
		}
		return model.views.filter(view => view.featureId === feature.id || getViewSelectionIds(model, view).some(id => ids.has(id)));
	}
	const elements = new Map(model.semantics.elements.map(element => [element.id, element]));
	return model.views.filter(view => view.featureId === feature.id || view.nodes.some(node => {
		let element = elements.get(node.elementId);
		const visited = new Set<string>();
		while (element && !visited.has(element.id)) {
			if (element.id === feature.id) { return true; }
			visited.add(element.id);
			element = element.parentId ? elements.get(element.parentId) : undefined;
		}
		return false;
	}));
}

/** Infer navigation from semantic identity, keeping shared or unowned views at system level. */
export function getDiagramGroups(model: SemanticModel): DiagramGroup[] {
	const elements = new Map(model.semantics.elements.map(element => [element.id, element]));
	const system: DiagramGroup = { name: model.name, views: [] };
	const features = new Map<string, DiagramGroup>(model.semantics.elements.filter(element => element.kind === 'feature')
		.map(element => [element.id, { featureId: element.id, name: element.name, views: [] }]));
	for (const view of model.views) {
		if (view.featureId && features.has(view.featureId)) {
			features.get(view.featureId)!.views.push(view);
			continue;
		}
		const owners = new Set<string>();
		for (const node of view.nodes) {
			let element = elements.get(node.elementId);
			const visited = new Set<string>();
			while (element && !visited.has(element.id)) {
				visited.add(element.id);
				if (element.kind === 'feature') {
					owners.add(element.id);
					break;
				}
				const parentId = (model.version === 4 || model.version === 5) ? model.foundation.ownership.find(entry => entry.elementId === element!.id)?.ownerId : element.parentId;
		element = parentId ? elements.get(parentId) : undefined;
			}
		}
		const owner = owners.size === 1 ? features.get([...owners][0]) : undefined;
		(owner ?? system).views.push(view);
	}
	return [system, ...features.values()];
}

export interface DiagramContext {
	viewId: string;
	selections: Record<string, string>;
}

/** Restore only existing identities, including after external deletion or switching documents. */
export function normalizeDiagramContext(model: SemanticModel, context: DiagramContext): DiagramContext {
	const selections: Record<string, string> = {};
	for (const view of model.views) {
		const saved = context.selections[view.id];
		const ids = getViewSelectionIds(model, view);
		selections[view.id] = ids.includes(saved) ? saved : ids[0] ?? '';
	}
	return {
		viewId: model.views.some(view => view.id === context.viewId) ? context.viewId : model.views[0]?.id ?? '',
		selections
	};
}

export type SemanticLocation = { section: 'home' } | { section: 'map' } | { section: 'diagram'; viewId: string; elementId?: string } | { section: 'element'; elementId: string } | { section: 'impact'; elementId: string };

/** Semantic ancestry is independent of file names and diagram placement. */
export function getElementPath(model: SemanticModel, id: string): SemanticElement[] {
	const elements = new Map(model.semantics.elements.map(element => [element.id, element]));
	const parents = new Map((model.version === 4 || model.version === 5) ? model.foundation.ownership.map(entry => [entry.elementId, entry.ownerId]) : []);
	const result: SemanticElement[] = [];
	const visited = new Set<string>();
	let element = elements.get(id);
	while (element && !visited.has(element.id)) {
		result.unshift(element);
		visited.add(element.id);
		const parentId = (model.version === 4 || model.version === 5) ? parents.get(element.id) : element.parentId;
		element = parentId ? elements.get(parentId) : undefined;
	}
	return result;
}

/** Keep the current perspective where possible; unplaced elements have a real detail destination. */
export function resolveElementLocation(model: SemanticModel, elementId: string, preferredViewId?: string): SemanticLocation | undefined {
	if (!model.semantics.elements.some(element => element.id === elementId)) { return undefined; }
	const views = model.views.filter(view => getViewSelectionIds(model, view).includes(elementId));
	const view = views.find(view => view.id === preferredViewId) ?? views[0];
	return view ? { section: 'diagram', viewId: view.id, elementId } : { section: 'element', elementId };
}

function normalizeLocation(model: SemanticModel, location: SemanticLocation): SemanticLocation | undefined {
	if (location.section === 'home' || location.section === 'map') { return location; }
	if (location.section === 'element' || location.section === 'impact') { return model.semantics.elements.some(element => element.id === location.elementId) ? location : undefined; }
	const view = model.views.find(view => view.id === location.viewId);
	if (!view) { return undefined; }
	const ids = getViewSelectionIds(model, view);
	const elementId = location.elementId && ids.includes(location.elementId) ? location.elementId : ids[0];
	return { section: 'diagram', viewId: view.id, ...(elementId ? { elementId } : {}) };
}

function sameLocation(left: SemanticLocation | undefined, right: SemanticLocation | undefined): boolean {
	if (!left || !right || left.section !== right.section) { return left === right; }
	if (left.section === 'home' || left.section === 'map') { return true; }
	if (left.section === 'element') { return right.section === 'element' && left.elementId === right.elementId; }
	if (left.section === 'impact') { return right.section === 'impact' && left.elementId === right.elementId; }
	return right.section === 'diagram' && left.viewId === right.viewId && left.elementId === right.elementId;
}

/** Bounded session history stores identities, skips deleted destinations, and discards forward branches. */
export class SemanticNavigationHistory {
	private entries: SemanticLocation[] = [];
	private index = -1;

	reset(location: SemanticLocation): void { this.entries = [{ ...location }]; this.index = 0; }
	replace(location: SemanticLocation): void {
		if (this.index < 0) { this.reset(location); } else { this.entries[this.index] = { ...location }; }
	}
	push(location: SemanticLocation): void {
		if (sameLocation(this.entries[this.index], location)) { return; }
		this.entries.splice(this.index + 1);
		this.entries.push({ ...location });
		if (this.entries.length > 100) { this.entries.shift(); }
		this.index = this.entries.length - 1;
	}
	private find(model: SemanticModel, direction: -1 | 1): { index: number; location: SemanticLocation } | undefined {
		const current = normalizeLocation(model, this.entries[this.index] ?? { section: 'home' });
		for (let index = this.index + direction; index >= 0 && index < this.entries.length; index += direction) {
			const location = normalizeLocation(model, this.entries[index]);
			if (location && !sameLocation(location, current)) { return { index, location }; }
		}
		return undefined;
	}
	canGo(model: SemanticModel, direction: -1 | 1): boolean { return !!this.find(model, direction); }
	go(model: SemanticModel, direction: -1 | 1): SemanticLocation | undefined {
		const result = this.find(model, direction);
		if (result) { this.index = result.index; this.replace(result.location); }
		return result?.location;
	}
}
