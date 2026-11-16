/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ModelView, type SemanticElement, type SemanticModel, type SemanticRelation } from './modelTypes.js';

export interface AtlasTarget { type: 'area' | 'element'; id: string }
export interface AtlasArea { id: string; elementId?: string; featureIds: Set<string> }
export interface SystemAtlasState {
	level: 'system' | 'area' | 'feature';
	areaId?: string;
	featureId?: string;
	filters: AtlasTarget[];
	query: string;
	actorPage: number;
	centerPage: number;
	sharedPage: number;
	searchPage: number;
	diagramPage: number;
	relationPage: number;
}
export interface AtlasProjection {
	elementIds: Set<string>;
	featureIds: Set<string>;
	areaIds: Set<string>;
	relations: SemanticRelation[];
	directRelationIds: Set<string>;
	directElementIds: Set<string>;
	hasActorContext: boolean;
}
export interface AtlasSearchResult { type: 'area' | 'element' | 'diagram'; id: string; name: string; kind: string }

/** Identity includes the role: an area and its underlying semantic element are distinct criteria. */
export function atlasTargetKey(target: AtlasTarget): string { return JSON.stringify([target.type, target.id]); }

export function createSystemAtlasState(): SystemAtlasState {
	return { level: 'system', filters: [], query: '', actorPage: 0, centerPage: 0, sharedPage: 0, searchPage: 0, diagramPage: 0, relationPage: 0 };
}

export function resetAtlasPages(state: SystemAtlasState): SystemAtlasState {
	return { ...state, actorPage: 0, centerPage: 0, sharedPage: 0, searchPage: 0, diagramPage: 0, relationPage: 0 };
}

/** Bound presentation work independently of the size of the semantic graph. */
export function getAtlasPage<T>(items: readonly T[], requested: number, size = 6): { items: T[]; page: number; start: number; total: number; pages: number } {
	const pages = Math.max(1, Math.ceil(items.length / size));
	const page = Math.max(0, Math.min(Number.isFinite(requested) ? Math.floor(requested) : 0, pages - 1));
	return { items: items.slice(page * size, (page + 1) * size), page, start: page * size, total: items.length, pages };
}

const normalized = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();

/** Indexed, read-only atlas of real ownership, feature memberships and declared relationships. */
export class SystemAtlas {
	readonly elements: Map<string, SemanticElement>;
	readonly features: SemanticElement[];
	readonly actors: SemanticElement[];
	readonly shared: SemanticElement[];
	readonly areas = new Map<string, AtlasArea>();
	readonly featureAreas = new Map<string, string>();
	readonly featureMembers = new Map<string, Set<string>>();
	readonly elementFeatures = new Map<string, Set<string>>();
	readonly adjacency = new Map<string, SemanticRelation[]>();
	readonly featureViews = new Map<string, Set<string>>();
	readonly viewFeatures = new Map<string, Set<string>>();
	readonly views: Map<string, ModelView>;
	private readonly sharedIds: Set<string>;
	private readonly areaElements = new Map<string, AtlasArea>();
	private readonly projections = new Map<string, AtlasProjection>();
	private readonly searchIndex: { result: AtlasSearchResult; name: string; identity: string; text: string }[] = [];

	readonly model: SemanticModel;

	constructor(model: SemanticModel) {
		this.model = model;
		this.elements = new Map(model.semantics.elements.map(element => [element.id, element]));
		this.features = model.semantics.elements.filter(element => element.kind === 'feature');
		this.actors = model.semantics.elements.filter(element => element.kind === 'actor');
		this.views = new Map(model.views.map(view => [view.id, view]));
		const parents = new Map(model.version === 4 || model.version === 5 ? model.foundation.ownership.map(entry => [entry.elementId, entry.ownerId]) : model.semantics.elements.flatMap(element => element.parentId ? [[element.id, element.parentId] as const] : []));
		const children = new Map<string, string[]>();
		for (const [id, parent] of parents) {
			const siblings = children.get(parent) ?? []; siblings.push(id); children.set(parent, siblings);
		}
		for (const feature of this.features) {
			const elementId = parents.get(feature.id);
			const areaId = JSON.stringify([elementId ?? null]);
			const area = this.areas.get(areaId) ?? { id: areaId, ...(elementId && this.elements.has(elementId) ? { elementId } : {}), featureIds: new Set<string>() };
			area.featureIds.add(feature.id); this.areas.set(areaId, area); this.featureAreas.set(feature.id, areaId);
			if (area.elementId) { this.areaElements.set(area.elementId, area); }
			this.featureMembers.set(feature.id, new Set([feature.id]));
			this.featureViews.set(feature.id, new Set());
		}
		const membershipRoots = new Map<string, string[]>();
		if (model.version === 4 || model.version === 5) {
			for (const entry of model.foundation.memberships) {
				const roots = membershipRoots.get(entry.featureId) ?? []; roots.push(entry.elementId); membershipRoots.set(entry.featureId, roots);
			}
		}
		for (const feature of this.features) {
			const members = this.featureMembers.get(feature.id)!;
			const pending = [...children.get(feature.id) ?? [], ...membershipRoots.get(feature.id) ?? []].reverse();
			const visited = new Set<string>();
			while (pending.length) {
				const id = pending.pop()!;
				const element = this.elements.get(id);
				if (!element || visited.has(id) || element.kind === 'feature') { continue; }
				visited.add(id); members.add(id);
				for (const child of [...children.get(id) ?? []].reverse()) { pending.push(child); }
			}
			for (const id of members) {
				const features = this.elementFeatures.get(id) ?? new Set<string>(); features.add(feature.id); this.elementFeatures.set(id, features);
			}
		}
		this.shared = model.semantics.elements.filter(element => element.kind !== 'actor' && element.kind !== 'feature' && !this.areaElements.has(element.id) && this.elementFeatures.get(element.id)?.size !== 1);
		this.sharedIds = new Set(this.shared.map(element => element.id));
		for (const relation of model.semantics.relations) {
			if (!this.elements.has(relation.from) || !this.elements.has(relation.to)) { continue; }
			for (const id of new Set([relation.from, relation.to])) {
				const edges = this.adjacency.get(id) ?? []; edges.push(relation); this.adjacency.set(id, edges);
			}
		}
		for (const view of model.views) {
			const features = new Set<string>();
			if (view.featureId && this.featureMembers.has(view.featureId)) { features.add(view.featureId); }
			for (const node of view.nodes) { for (const id of this.elementFeatures.get(node.elementId) ?? []) { features.add(id); } }
			this.viewFeatures.set(view.id, features);
			for (const id of features) { this.featureViews.get(id)!.add(view.id); }
		}
		for (const element of this.elements.values()) {
			const area = this.areaElements.get(element.id);
			const result: AtlasSearchResult = { type: area && element.kind !== 'feature' ? 'area' : 'element', id: area && element.kind !== 'feature' ? area.id : element.id, name: element.name, kind: element.kind };
			const context = [...this.elementFeatures.get(element.id) ?? []].flatMap(id => [this.elements.get(id)!.name, this.elements.get(this.areas.get(this.featureAreas.get(id)!)?.elementId ?? '')?.name ?? '']);
			this.searchIndex.push({ result, name: normalized(element.name), identity: normalized(element.id), text: normalized([element.name, element.id, element.kind, ...context].join(' ')) });
		}
		for (const view of model.views) { this.searchIndex.push({ result: { type: 'diagram', id: view.id, name: view.name, kind: view.kind }, name: normalized(view.name), identity: normalized(view.id), text: normalized([view.name, view.id, view.kind, ...[...this.viewFeatures.get(view.id)!].map(id => this.elements.get(id)!.name)].join(' ')) }); }
	}

	normalizeState(state: SystemAtlasState): SystemAtlasState {
		const result = { ...state, filters: state.filters.filter((target, index, all) => this.hasTarget(target) && all.findIndex(other => atlasTargetKey(other) === atlasTargetKey(target)) === index) };
		if (result.level === 'feature' && result.featureId && this.featureMembers.has(result.featureId)) { result.areaId = this.featureAreas.get(result.featureId); }
		else if (result.level === 'area' && result.areaId && this.areas.has(result.areaId)) { result.featureId = undefined; }
		else { result.level = 'system'; result.areaId = undefined; result.featureId = undefined; }
		return result;
	}

	hasTarget(target: AtlasTarget): boolean { return target.type === 'area' ? this.areas.has(target.id) : this.elements.has(target.id); }
	getElement(target: AtlasTarget): SemanticElement | undefined { return this.elements.get(target.type === 'area' ? this.areas.get(target.id)?.elementId ?? '' : target.id); }
	isShared(id: string): boolean { return this.sharedIds.has(id); }
	areaForElement(id: string): AtlasArea | undefined { return this.areaElements.get(id); }

	/** Filtering adds an AND criterion; only the chip removal action removes one. */
	addFilter(state: SystemAtlasState, target: AtlasTarget): SystemAtlasState {
		return this.hasTarget(target) && !state.filters.some(filter => atlasTargetKey(filter) === atlasTargetKey(target)) ? resetAtlasPages({ ...state, query: '', filters: [...state.filters, { ...target }] }) : { ...state, query: '' };
	}
	removeFilter(state: SystemAtlasState, target: AtlasTarget): SystemAtlasState {
		return resetAtlasPages({ ...state, filters: state.filters.filter(filter => atlasTargetKey(filter) !== atlasTargetKey(target)) });
	}

	/** Navigation is explicit and leaves every criterion intact, including incompatible ones. */
	open(state: SystemAtlasState, target: AtlasTarget): SystemAtlasState {
		if (!this.hasTarget(target)) { return state; }
		if (target.type === 'area') { return resetAtlasPages({ ...state, query: '', level: 'area', areaId: target.id, featureId: undefined }); }
		const element = this.elements.get(target.id)!;
		const features = element.kind === 'feature' ? new Set([element.id]) : this.elementFeatures.get(element.id);
		if (features?.size !== 1) { return state; }
		const featureId = [...features][0];
		const result = resetAtlasPages({ ...state, query: '', level: 'feature', featureId, areaId: this.featureAreas.get(featureId) });
		if (element.kind !== 'feature') {
			const projection = this.project(state.filters);
			const members = this.internalMembers(featureId).filter(member => !projection || projection.elementIds.has(member.id));
			result.centerPage = Math.max(0, Math.floor(members.findIndex(member => member.id === element.id) / 6));
		}
		return result;
	}
	internalMembers(featureId: string): SemanticElement[] {
		return [...this.featureMembers.get(featureId) ?? []].map(id => this.elements.get(id)!).filter(element => element.kind !== 'feature' && element.kind !== 'actor' && !this.sharedIds.has(element.id) && !this.areaElements.has(element.id));
	}
	scopeFeatures(state: SystemAtlasState): Set<string> {
		return state.level === 'feature' ? new Set(state.featureId ? [state.featureId] : []) : state.level === 'area' ? this.areas.get(state.areaId ?? '')?.featureIds ?? new Set() : new Set(this.features.map(feature => feature.id));
	}
	inScope(id: string, state: SystemAtlasState, scope = this.scopeFeatures(state)): boolean {
		if (state.level === 'system') { return true; }
		if ([...this.elementFeatures.get(id) ?? []].some(fid => scope.has(fid))) { return true; }
		return (this.adjacency.get(id) ?? []).some(edge => [...this.elementFeatures.get(edge.from === id ? edge.to : edge.from) ?? []].some(fid => scope.has(fid)));
	}
	private areaIds(features: Set<string>): Set<string> { return new Set([...features].map(id => this.featureAreas.get(id)!).filter(Boolean)); }

	private single(target: AtlasTarget): AtlasProjection {
		const key = atlasTargetKey(target);
		const cached = this.projections.get(key); if (cached) { return cached; }
		const element = this.getElement(target);
		const hasActorContext = target.type === 'element' && element?.kind === 'actor';
		const group = new Set<string>(element ? [element.id] : []);
		const seedFeatures = new Set<string>(target.type === 'area' ? this.areas.get(target.id)!.featureIds : element?.kind === 'feature' ? [element.id] : []);
		const direct = element ? this.adjacency.get(element.id) ?? [] : [];
		const directRelationIds = new Set(direct.map(edge => edge.id)), directElementIds = new Set(group);
		for (const edge of direct) { directElementIds.add(edge.from); directElementIds.add(edge.to); }
		if (hasActorContext) {
			for (const id of directElementIds) {
				for (const featureId of this.elementFeatures.get(id) ?? []) { seedFeatures.add(featureId); }
				for (const featureId of this.areaElements.get(id)?.featureIds ?? []) { seedFeatures.add(featureId); }
			}
		}
		for (const id of seedFeatures) { for (const member of this.featureMembers.get(id)!) { group.add(member); } }
		const elementIds = new Set(group), relations = new Map<string, SemanticRelation>();
		for (const id of group) { for (const edge of this.adjacency.get(id) ?? []) {
			if (hasActorContext && !directRelationIds.has(edge.id) && [edge.from, edge.to].some(endpoint => this.elements.get(endpoint)?.kind === 'actor' && endpoint !== element!.id)) { continue; }
			relations.set(edge.id, edge); elementIds.add(edge.from); elementIds.add(edge.to);
		} }
		// Membership does not turn contextual co-actors into selected actors.
		if (hasActorContext) { for (const id of elementIds) { if (this.elements.get(id)?.kind === 'actor' && id !== element!.id && !directElementIds.has(id)) { elementIds.delete(id); } } }
		const featureIds = new Set(seedFeatures);
		if (!hasActorContext) {
			for (const id of elementIds) { if (!this.sharedIds.has(id) || id === element?.id) { for (const fid of this.elementFeatures.get(id) ?? []) { featureIds.add(fid); } } }
		}
		const areaIds = this.areaIds(featureIds); if (target.type === 'area') { areaIds.add(target.id); }
		const result = { elementIds, featureIds, areaIds, relations: [...relations.values()].filter(edge => elementIds.has(edge.from) && elementIds.has(edge.to)), directRelationIds, directElementIds, hasActorContext };
		this.cache(key, result); return result;
	}

	private cache(key: string, value: AtlasProjection): void {
		if (this.projections.size >= 32) { this.projections.delete(this.projections.keys().next().value!); }
		this.projections.set(key, value);
	}

	/** Intersection uses a common feature witness, preventing unrelated users of a shared resource from leaking through. */
	project(filters: readonly AtlasTarget[]): AtlasProjection | undefined {
		if (!filters.length) { return undefined; }
		if (filters.length === 1) { return this.single(filters[0]); }
		const key = JSON.stringify(filters.map(atlasTargetKey));
		const cached = this.projections.get(key); if (cached) { return cached; }
		const parts = filters.map(target => this.single(target));
		const featureIds = new Set([...parts[0].featureIds].filter(id => parts.every(part => part.featureIds.has(id))));
		const common = new Set([...parts[0].elementIds].filter(id => parts.every(part => part.elementIds.has(id))));
		const owned = new Set([...common].filter(id => this.elements.get(id)?.kind !== 'actor' && [...this.elementFeatures.get(id) ?? []].some(fid => featureIds.has(fid))));
		const elementIds = new Set(owned);
		const connected = (id: string) => (this.adjacency.get(id) ?? []).some(edge => owned.has(edge.from === id ? edge.to : edge.from));
		for (const id of common) { if (connected(id)) { elementIds.add(id); } }
		for (const target of filters) {
			const element = this.getElement(target);
			if (element && target.type === 'element' && element.kind !== 'feature' && (connected(element.id) || (element.kind === 'actor' && [...this.elementFeatures.get(element.id) ?? []].some(id => featureIds.has(id))))) { elementIds.add(element.id); }
		}
		if (!parts.some(part => part.featureIds.size)) { for (const id of common) { elementIds.add(id); } }
		for (const fid of featureIds) { if (![...this.featureMembers.get(fid)!].some(id => owned.has(id))) { featureIds.delete(fid); } }
		const relationMap = new Map(parts.flatMap(part => part.relations).filter(edge => elementIds.has(edge.from) && elementIds.has(edge.to)).map(edge => [edge.id, edge]));
		const actorParts = parts.filter(part => part.hasActorContext);
		const result = { elementIds, featureIds, areaIds: this.areaIds(featureIds), relations: [...relationMap.values()], directRelationIds: new Set(actorParts.flatMap(part => [...part.directRelationIds])), directElementIds: new Set(actorParts.flatMap(part => [...part.directElementIds])), hasActorContext: !!actorParts.length };
		this.cache(key, result); return result;
	}

	search(query: string, labels: Readonly<Record<string, string>> = {}): AtlasSearchResult[] {
		const phrase = normalized(query.trim()); if (!phrase) { return []; }
		const terms = phrase.split(/\s+/), buckets: AtlasSearchResult[][] = [[], [], [], []];
		for (const entry of this.searchIndex) {
			const text = `${entry.text} ${normalized(labels[entry.result.kind] ?? '')}`;
			if (!terms.every(term => text.includes(term))) { continue; }
			buckets[entry.name === phrase ? 0 : entry.identity === phrase ? 1 : entry.name.includes(phrase) ? 2 : 3].push(entry.result);
		}
		return buckets.flat();
	}
}
