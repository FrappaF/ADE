import * as dom from '../../../../base/browser/dom.js';
import { status as announce } from '../../../../base/browser/ui/aria/aria.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { type DisposableStore } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { atlasTargetKey, getAtlasPage, resetAtlasPages, SystemAtlas, type AtlasTarget, type SystemAtlasState } from '../common/systemAtlas.js';
import { type SemanticElement } from '../common/modelTypes.js';
import { type OrditoControls } from './orditoControls.js';
import { diagramIcon, elementIcon, prependOrditoIcon } from './orditoIcons.js';
import { elementLabels, relationLabels, viewLabels } from './orditoLabels.js';

interface SystemMapActions {
	state: SystemAtlasState;
	change(state: SystemAtlasState): void;
	element(id: string): void;
	diagram(id: string): void;
}

type PageKey = 'actorPage' | 'centerPage' | 'sharedPage' | 'searchPage' | 'diagramPage' | 'relationPage';

/** A bounded, layered atlas. Selection filters; only separate arrow actions descend into a group. */
export function renderOrditoSystemMap(parent: HTMLElement, atlas: SystemAtlas, controls: OrditoControls, listeners: DisposableStore, actions: SystemMapActions): void {
	const state = atlas.normalizeState(actions.state);
	const projection = atlas.project(state.filters);
	const root = dom.append(parent, dom.$('section.ordito-system-atlas'));
	root.setAttribute('aria-label', localize('ordito.atlas.label', "System Atlas"));
	const areaName = (id: string) => atlas.elements.get(atlas.areas.get(id)?.elementId ?? '')?.name ?? localize('ordito.atlas.unassigned', "Features Without a Declared Area");
	const name = (target: AtlasTarget) => target.type === 'area' ? areaName(target.id) : atlas.elements.get(target.id)!.name;
	const kind = (target: AtlasTarget) => target.type === 'area' ? localize('ordito.atlas.area', "Area") : elementLabels[atlas.elements.get(target.id)!.kind];
	const targetIcon = (target: AtlasTarget) => target.type === 'area' ? Codicon.layers : elementIcon(atlas.elements.get(target.id)!.kind);
	const selected = (target: AtlasTarget) => state.filters.some(filter => atlasTargetKey(filter) === atlasTargetKey(target));
	const searchLabels = { ...elementLabels, ...viewLabels };
	const change = (next: SystemAtlasState, focus?: string) => {
		actions.change(next);
		if (focus) { controls.focusTarget(focus); }
		// The editor replaces the local live region during refresh; announce through the persistent workbench region.
		if (next.query.trim()) { announce(localize('ordito.atlas.searchCount', "{0} results. Click to add a filter; use the arrow to open a level.", atlas.search(next.query, searchLabels).length.toLocaleString())); }
		else if (next.filters.length > 1 && !atlas.project(next.filters)!.elementIds.size) { announce(localize('ordito.atlas.noIntersection', "No objects satisfy all filters in this level. Remove a filter with × to broaden the results.")); }
		else { announce(localize('ordito.atlas.changed', "Active filters: {0}. Level: {1}.", next.filters.length, next.level === 'feature' ? atlas.elements.get(next.featureId!)!.name : next.level === 'area' ? areaName(next.areaId!) : localize('ordito.atlas.wholeSystem', "Whole System"))); }
	};
	const filter = (target: AtlasTarget) => {
		change(atlas.addFilter(state, target));
		if (!controls.focusTarget(`atlas-filter:${atlasTargetKey(target)}`)) { controls.focusTarget(`atlas-remove:${atlasTargetKey(target)}`); }
	};
	const open = (target: AtlasTarget) => change(atlas.open(state, target), 'atlas-location');
	const status = dom.append(root, dom.$('p.ordito-atlas-status'));
	status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
	const stats = dom.append(root, dom.$('p.ordito-atlas-counts'));
	stats.textContent = localize('ordito.atlas.counts', "{0} actors · {1} features · {2} elements · {3} relationships", atlas.actors.length.toLocaleString(), atlas.features.length.toLocaleString(), atlas.elements.size.toLocaleString(), atlas.model.semantics.relations.length.toLocaleString());

	const search = dom.append(root, dom.$('div.ordito-atlas-search'));
	prependOrditoIcon(search, Codicon.search);
	const label = dom.append(search, dom.$<HTMLLabelElement>('label'));
	const searchId = `ordito-atlas-search-${generateUuid()}`;
	label.htmlFor = searchId; label.textContent = localize('ordito.atlas.search', "Search the Whole System");
	const input = dom.append(search, dom.$<HTMLInputElement>('input'));
	input.type = 'search'; input.id = searchId; input.value = state.query;
	input.placeholder = localize('ordito.atlas.searchHint', "Actors, areas, features, elements or diagrams");
	input.maxLength = 200;
	controls.trackFocus('map-search', input);
	listeners.add(dom.addDisposableListener(input, 'input', () => {
		const start = input.selectionStart, end = input.selectionEnd;
		change({ ...state, query: input.value, searchPage: 0 }, 'map-search');
		const replacement = dom.getActiveElement();
		if (dom.isHTMLInputElement(replacement) && replacement.type === 'search' && start !== null && end !== null) { replacement.setSelectionRange(start, end); }
	}));

	const breadcrumbs = dom.append(root, dom.$('nav.ordito-atlas-breadcrumbs'));
	breadcrumbs.setAttribute('aria-label', localize('ordito.atlas.location', "Atlas Level"));
	const crumb = (text: string, level: SystemAtlasState['level'], action: () => void) => {
		if (breadcrumbs.childElementCount) { const divider = dom.append(breadcrumbs, dom.$('span')); divider.textContent = '›'; divider.setAttribute('aria-hidden', 'true'); }
		const button = controls.button(breadcrumbs, text, action, state.level === level ? 'atlas-location' : `atlas-breadcrumb:${level}`);
		if (state.level === level) { button.setAttribute('aria-current', 'page'); }
	};
	crumb(localize('ordito.atlas.wholeSystem', "Whole System"), 'system', () => change(resetAtlasPages({ ...state, query: '', level: 'system', areaId: undefined, featureId: undefined }), 'atlas-location'));
	if (state.areaId && state.level !== 'system') { crumb(areaName(state.areaId), 'area', () => change(resetAtlasPages({ ...state, query: '', level: 'area', featureId: undefined }), 'atlas-location')); }
	if (state.featureId && state.level === 'feature') { crumb(atlas.elements.get(state.featureId)!.name, 'feature', () => {}); }

	if (state.filters.length) {
		const filters = dom.append(root, dom.$('div.ordito-atlas-filters'));
		filters.setAttribute('role', 'group'); filters.setAttribute('aria-label', localize('ordito.atlas.activeFilters', "Active Filters"));
		dom.append(filters, dom.$('span.ordito-atlas-muted')).textContent = state.filters.length === 1 ? localize('ordito.atlas.oneFilter', "1 active filter") : localize('ordito.atlas.filterCount', "{0} filters · all criteria", state.filters.length);
		for (const target of state.filters) {
			const button = controls.button(filters, '', () => {
				const next = atlas.removeFilter(state, target);
				change(next, next.filters.length ? `atlas-remove:${atlasTargetKey(next.filters[0])}` : 'map-search');
			}, `atlas-remove:${atlasTargetKey(target)}`);
			button.dataset.filterKey = atlasTargetKey(target);
			button.setAttribute('aria-label', localize('ordito.atlas.removeFilter', "Remove {0} Filter: {1} ({2})", kind(target), name(target), target.id));
			prependOrditoIcon(button, targetIcon(target));
			const text = dom.append(button, dom.$('span'));
			dom.append(text, dom.$('small')).textContent = localize('ordito.atlas.filterKind', "{0} · ", kind(target));
			dom.append(text, dom.$('span')).textContent = name(target);
			const close = dom.append(button, dom.$('span')); prependOrditoIcon(close, Codicon.close);
		}
	}

	const pager = <T>(container: HTMLElement, data: ReturnType<typeof getAtlasPage<T>>, key: PageKey, title: string) => {
		if (!data.total) { return; }
		const row = dom.append(container, dom.$('div.ordito-atlas-pager'));
		dom.append(row, dom.$('span')).textContent = localize('ordito.atlas.pageRange', "{0}–{1} of {2}", (data.start + 1).toLocaleString(), Math.min(data.start + data.items.length, data.total).toLocaleString(), data.total.toLocaleString());
		for (const delta of [-1, 1]) {
			const button = controls.button(row, '', () => change({ ...state, [key]: data.page + delta }), `atlas-page:${key}:${delta}`);
			button.dataset.page = key; button.dataset.delta = String(delta);
			button.disabled = delta < 0 ? data.page === 0 : data.page === data.pages - 1;
			button.setAttribute('aria-label', delta < 0 ? localize('ordito.atlas.previous', "Previous Page: {0}", title) : localize('ordito.atlas.next', "Next Page: {0}", title));
			prependOrditoIcon(button, delta < 0 ? Codicon.chevronLeft : Codicon.chevronRight);
		}
	};
	const endpoints = new Map<string, { element: HTMLElement; name: string }>();
	const node = (container: HTMLElement, target: AtlasTarget, metadata: string, arrow = target.type === 'area' || atlas.getElement(target)?.kind === 'feature') => {
		const row = dom.append(container, dom.$('div.ordito-atlas-node'));
		row.dataset.targetType = target.type; row.dataset.targetId = target.id;
		row.dataset.kind = target.type === 'area' ? 'area' : atlas.getElement(target)!.kind;
		row.classList.toggle('is-filtered', selected(target));
		const contextual = !!projection?.hasActorContext && target.type === 'element' && !projection.directElementIds.has(target.id);
		row.dataset.contextual = String(contextual);
		const button = controls.button(row, '', () => filter(target), `atlas-filter:${atlasTargetKey(target)}`);
		button.className = 'ordito-atlas-filter'; button.dataset.action = 'filter';
		button.setAttribute('aria-pressed', String(selected(target)));
		button.setAttribute('aria-label', localize('ordito.atlas.addFilter', "Filter by {0}: {1}", kind(target), name(target)));
		prependOrditoIcon(button, targetIcon(target));
		const copy = dom.append(button, dom.$('span.ordito-atlas-node-copy'));
		dom.append(copy, dom.$('strong')).textContent = name(target);
		dom.append(copy, dom.$('small')).textContent = metadata;
		if (arrow) {
			const action = controls.button(row, '', () => open(target), `atlas-open:${atlasTargetKey(target)}`);
			action.className = 'ordito-atlas-open'; action.dataset.action = 'open';
			action.setAttribute('aria-label', localize('ordito.atlas.open', "Open Level: {0}", name(target)));
			prependOrditoIcon(action, Codicon.chevronRight);
		}
		endpoints.set(atlasTargetKey(target), { element: row, name: name(target) });
	};

	if (state.query.trim()) {
		const results = atlas.search(state.query, searchLabels);
		const page = getAtlasPage(results, state.searchPage, 8);
		const section = dom.append(root, dom.$('section.ordito-atlas-results'));
		dom.append(section, dom.$('h2')).textContent = localize('ordito.atlas.globalResults', "Results in the Whole System");
		status.textContent = localize('ordito.atlas.searchCount', "{0} results. Click to add a filter; use the arrow to open a level.", results.length.toLocaleString());
		if (!results.length) { dom.append(section, dom.$('p.ordito-atlas-empty')).textContent = localize('ordito.atlas.noSearch', "No matching objects. Try another name or identity."); }
		for (const result of page.items) {
			if (result.type === 'diagram') {
				const view = atlas.views.get(result.id)!;
				const button = controls.button(section, '', () => actions.diagram(view.id), `atlas-view:${view.id}`);
				button.className = 'ordito-atlas-diagram'; prependOrditoIcon(button, diagramIcon(view.kind));
				const text = dom.append(button, dom.$('span')); dom.append(text, dom.$('strong')).textContent = view.name; dom.append(text, dom.$('small')).textContent = localize('ordito.atlas.diagramIdentity', "{0} · {1}", viewLabels[view.kind], view.id);
			} else {
				const target: AtlasTarget = { type: result.type, id: result.id };
				const element = atlas.getElement(target);
				node(section, target, localize('ordito.atlas.searchIdentity', "{0} · {1}", kind(target), element?.id ?? result.id), target.type === 'area' || element?.kind === 'feature' || (element?.kind !== 'actor' && !atlas.isShared(element?.id ?? '') && atlas.elementFeatures.get(element?.id ?? '')?.size === 1));
			}
		}
		pager(section, page, 'searchPage', localize('ordito.atlas.results', "Results"));
		return;
	}

	const scoped = atlas.scopeFeatures(state);
	const matched = new Set([...scoped].filter(id => !projection || projection.featureIds.has(id)));
	const allowed = (element: SemanticElement) => (!projection || projection.elementIds.has(element.id)) && atlas.inScope(element.id, state, scoped);
	const actors = atlas.actors.filter(allowed), shared = atlas.shared.filter(allowed);
	const relationInScope = (from: string, to: string) => state.level === 'system' || [from, to].some(id => [...atlas.elementFeatures.get(id) ?? []].some(fid => scoped.has(fid)));
	const relations = projection?.relations.filter(edge => relationInScope(edge.from, edge.to)) ?? [];
	const relationCounts = new Map<string, number>();
	for (const relation of relations) { for (const id of new Set([relation.from, relation.to])) { relationCounts.set(id, (relationCounts.get(id) ?? 0) + 1); } }
	const areaMetadata = (target: AtlasTarget) => {
		const all = atlas.areas.get(target.id)!.featureIds;
		const count = [...all].filter(id => !projection || projection.featureIds.has(id)).length;
		return localize('ordito.atlas.areaFeatures', "{0} of {1} features", count.toLocaleString(), all.size.toLocaleString());
	};
	const metadata = (target: AtlasTarget) => {
		if (target.type === 'area') { return areaMetadata(target); }
		const element = atlas.elements.get(target.id)!;
		if (element.kind === 'feature') {
			const members = atlas.internalMembers(element.id).filter(member => !projection || projection.elementIds.has(member.id));
			return localize('ordito.atlas.featureContents', "{0} internal elements · {1} diagrams", members.length.toLocaleString(), atlas.featureViews.get(element.id)!.size.toLocaleString());
		}
		const context = selected(target) ? localize('ordito.atlas.active', "Active Filter") : projection?.hasActorContext ? projection.directElementIds.has(element.id) ? localize('ordito.atlas.direct', "Direct") : localize('ordito.atlas.contextual', "In Feature Context") : '';
		const count = projection ? relationCounts.get(element.id) ?? 0 : (atlas.adjacency.get(element.id) ?? []).filter(edge => relationInScope(edge.from, edge.to)).length;
		return [elementLabels[element.kind], count === 1 ? localize('ordito.atlas.oneRelationship', "1 relationship") : localize('ordito.atlas.relationCount', "{0} relationships", count), context].filter(Boolean).join(' · ');
	};
	const targets: AtlasTarget[] = state.level === 'system' ? [...atlas.areas.values()].filter(area => !projection || projection.areaIds.has(area.id)).map(area => ({ type: 'area', id: area.id })) : state.level === 'area' ? atlas.features.filter(feature => matched.has(feature.id)).map(feature => ({ type: 'element', id: feature.id })) : atlas.internalMembers(state.featureId!).filter(allowed).map(element => ({ type: 'element', id: element.id }));
	const scope = dom.append(root, dom.$('div.ordito-atlas-scope'));
	dom.append(scope, dom.$('strong')).textContent = state.filters.length ? state.filters.length === 1 ? localize('ordito.atlas.filteredOne', "Filtered Relationships · 1 Criterion") : localize('ordito.atlas.filtered', "Filtered Relationships · {0} Criteria", state.filters.length) : state.level === 'feature' ? atlas.elements.get(state.featureId!)!.name : state.level === 'area' ? areaName(state.areaId!) : localize('ordito.atlas.overview', "System Overview");
	dom.append(scope, dom.$('span')).textContent = localize('ordito.atlas.interaction', "Click: add filter · Arrow: open level");
	const canvas = dom.append(root, dom.$('div.ordito-atlas-canvas'));
	const svg = root.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.classList.add('ordito-atlas-lines'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', localize('ordito.atlas.lines', "Declared relationships aggregated between the visible objects. Exact endpoints and conditions appear in Relationships below.")); canvas.append(svg);
	const column = (className: string, title: string, count: number) => {
		const section = dom.append(canvas, dom.$(`section.${className}.ordito-atlas-column`)); section.setAttribute('aria-label', title);
		const header = dom.append(section, dom.$('header'));
		dom.append(header, dom.$('h2')).textContent = title;
		dom.append(header, dom.$('span')).textContent = count.toLocaleString();
		return { section, list: dom.append(section, dom.$('div.ordito-atlas-node-list')) };
	};
	const leftTitle = localize('ordito.atlas.actors', "Actors"), centerTitle = state.level === 'system' ? localize('ordito.atlas.areas', "Areas") : state.level === 'area' ? localize('ordito.atlas.features', "Features") : localize('ordito.atlas.internals', "Internal Elements"), rightTitle = localize('ordito.atlas.shared', "Shared Elements");
	const left = column('ordito-atlas-actors', leftTitle, actors.length), center = column('ordito-atlas-center', centerTitle, targets.length), right = column('ordito-atlas-shared', rightTitle, shared.length);
	const actorPage = getAtlasPage(actors, state.actorPage), centerPage = getAtlasPage(targets, state.centerPage), sharedPage = getAtlasPage(shared, state.sharedPage);
	for (const [container, page, key, title, empty] of [[left, actorPage, 'actorPage', leftTitle, localize('ordito.atlas.noActors', "No related actors.")], [right, sharedPage, 'sharedPage', rightTitle, localize('ordito.atlas.noShared', "No related shared elements.")]] as const) {
		for (const element of page.items) { const target: AtlasTarget = { type: 'element', id: element.id }; node(container.list, target, metadata(target)); }
		if (!page.total) { dom.append(container.list, dom.$('p.ordito-atlas-empty')).textContent = empty; }
		pager(container.section, page, key, title);
	}
	for (const target of centerPage.items) { node(center.list, target, metadata(target)); }
	if (!targets.length) { dom.append(center.list, dom.$('p.ordito-atlas-empty')).textContent = state.filters.length > 1 ? localize('ordito.atlas.noIntersection', "No objects satisfy all filters in this level. Remove a filter with × to broaden the results.") : localize('ordito.atlas.noObjects', "No related objects in this level."); }
	pager(center.section, centerPage, 'centerPage', centerTitle);
	status.textContent = localize('ordito.atlas.visible', "{0} active filters. {1} actors, {2} {3}, {4} shared elements in this level.", state.filters.length, actors.length.toLocaleString(), targets.length.toLocaleString(), centerTitle, shared.length.toLocaleString());

	const legend = dom.append(root, dom.$('div.ordito-atlas-legend'));
	dom.append(legend, dom.$('span')).textContent = projection?.hasActorContext ? localize('ordito.atlas.contextLegend', "Solid: direct relationship · Dashed: feature context") : localize('ordito.atlas.groupedLegend', "Each line groups declared relationships between visible objects");
	const lineCount = dom.append(legend, dom.$('span'));
	const projectEndpoint = (id: string): AtlasTarget[] => {
		if (atlas.elements.get(id)?.kind === 'actor' || atlas.isShared(id)) { return [{ type: 'element', id }]; }
		if (state.level === 'feature') { return [{ type: 'element', id }]; }
		const features = atlas.elementFeatures.get(id) ?? new Set<string>();
		if (state.level === 'area') { return [...features].map(fid => ({ type: 'element', id: fid })); }
		const areas = new Set([...features].map(fid => atlas.featureAreas.get(fid)!));
		const area = atlas.areaForElement(id); if (area) { areas.add(area.id); }
		return [...areas].map(areaId => ({ type: 'area', id: areaId }));
	};
	const drawLines = () => {
		svg.replaceChildren();
		if (!projection) { lineCount.textContent = localize('ordito.atlas.choose', "Select an object to see its relationships"); return; }
		if (dom.getWindow(svg).getComputedStyle(svg).display === 'none') { lineCount.textContent = localize('ordito.atlas.stacked', "Relationships are available in object counts and details below"); return; }
		const bounds = canvas.getBoundingClientRect(); if (!bounds.width) { return; }
		svg.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
		const markerId = `ordito-atlas-arrow-${generateUuid()}`;
		const definitions = root.ownerDocument.createElementNS(svg.namespaceURI, 'defs');
		const marker = root.ownerDocument.createElementNS(svg.namespaceURI, 'marker');
		for (const [key, value] of Object.entries({ id: markerId, viewBox: '0 0 8 8', refX: '7', refY: '4', markerWidth: '6', markerHeight: '6', orient: 'auto-start-reverse' })) { marker.setAttribute(key, value); }
		const tip = root.ownerDocument.createElementNS(svg.namespaceURI, 'path'); tip.setAttribute('d', 'M1 1 L7 4 L1 7'); marker.append(tip); definitions.append(marker); svg.append(definitions);
		const pairs = new Map<string, { from: string; to: string; count: number; direct: boolean }>();
		const projected = new Map<string, AtlasTarget[]>();
		for (const id of new Set(relations.flatMap(edge => [edge.from, edge.to]))) { projected.set(id, projectEndpoint(id).filter(target => endpoints.has(atlasTargetKey(target)))); }
		for (const relation of relations) {
			for (const from of projected.get(relation.from) ?? []) { for (const to of projected.get(relation.to) ?? []) {
				const source = atlasTargetKey(from), target = atlasTargetKey(to); if (source === target) { continue; }
				const key = JSON.stringify([source, target]);
				const pair = pairs.get(key) ?? { from: source, to: target, count: 0, direct: false };
				pair.count++; pair.direct ||= !projection.hasActorContext || projection.directRelationIds.has(relation.id); pairs.set(key, pair);
			} }
		}
		const visible = [...pairs.values()].slice(0, 24);
		for (const pair of visible) {
			const a = endpoints.get(pair.from)!.element.getBoundingClientRect(), b = endpoints.get(pair.to)!.element.getBoundingClientRect();
			const y1 = a.top + a.height / 2 - bounds.top, y2 = b.top + b.height / 2 - bounds.top;
			const sameColumn = Math.abs(a.left - b.left) < 2, forward = a.left < b.left;
			const x1 = (sameColumn || forward ? a.right : a.left) - bounds.left, x2 = (sameColumn || !forward ? b.right : b.left) - bounds.left;
			const channel = sameColumn ? Math.max(x1, x2) + 16 : (x1 + x2) / 2;
			const path = root.ownerDocument.createElementNS(svg.namespaceURI, 'path');
			path.setAttribute('d', `M${x1},${y1} C${channel},${y1} ${channel},${y2} ${x2},${y2}`); path.setAttribute('marker-end', `url(#${markerId})`);
			path.setAttribute('data-contextual', String(!pair.direct)); path.setAttribute('data-from', pair.from); path.setAttribute('data-to', pair.to);
			const title = root.ownerDocument.createElementNS(svg.namespaceURI, 'title');
			title.textContent = localize('ordito.atlas.pathCount', "{0} → {1}: {2} declared relationships", endpoints.get(pair.from)!.name, endpoints.get(pair.to)!.name, pair.count);
			path.append(title); svg.append(path);
		}
		lineCount.textContent = localize('ordito.atlas.lineCount', "{0} of {1} visible connections shown", visible.length, pairs.size);
	};
	listeners.add(dom.scheduleAtNextAnimationFrame(dom.getWindow(root), drawLines));
	const observer = listeners.add(new dom.DisposableResizeObserver('orditoSystemAtlas', drawLines, dom.getWindow(root)));
	listeners.add(observer.observe(canvas));

	const context = dom.append(root, dom.$('section.ordito-atlas-context'));
	dom.append(context, dom.$('h2')).textContent = state.filters.length > 1 ? localize('ordito.atlas.combined', "Combined Filters") : state.filters.length ? name(state.filters[0]) : localize('ordito.atlas.navigationHint', "Explore the System");
	dom.append(context, dom.$('p')).textContent = state.filters.length > 1 ? localize('ordito.atlas.andHint', "Only the context common to all active filters is shown. Each × removes its own filter; the others stay active.") : projection?.hasActorContext ? localize('ordito.atlas.actorHint', "Internal and shared elements of the actor’s linked features stay available at every level. Dashed lines show feature context.") : localize('ordito.atlas.filterHint', "Click an object to add a filter. Use its arrow to open a lower level. Filters stay active when you change levels or pages.");
	const inspection = atlas.getElement(state.filters.at(-1) ?? { type: 'element', id: state.featureId ?? '' });
	if (inspection) { controls.button(context, localize('ordito.atlas.inspect', "Inspect {0}", inspection.name), () => actions.element(inspection.id), 'atlas-inspect'); }

	const diagrams = atlas.model.views.filter(view => {
		const owners = atlas.viewFeatures.get(view.id)!;
		return (!projection || [...owners].some(id => projection.featureIds.has(id)) || !owners.size && view.nodes.some(node => projection.elementIds.has(node.elementId))) && (state.level === 'system' || [...owners].some(id => scoped.has(id)));
	});
	const diagramSection = dom.append(root, dom.$('section.ordito-atlas-diagrams'));
	dom.append(diagramSection, dom.$('h2')).textContent = localize('ordito.atlas.diagrams', "Diagrams in This Context · {0}", diagrams.length.toLocaleString());
	const diagramPage = getAtlasPage(diagrams, state.diagramPage);
	for (const view of diagramPage.items) {
		const button = controls.button(diagramSection, '', () => actions.diagram(view.id), `atlas-view:${view.id}`);
		button.className = 'ordito-atlas-diagram'; prependOrditoIcon(button, diagramIcon(view.kind));
		const text = dom.append(button, dom.$('span')); dom.append(text, dom.$('strong')).textContent = view.name; dom.append(text, dom.$('small')).textContent = viewLabels[view.kind];
	}
	if (!diagrams.length) { dom.append(diagramSection, dom.$('p.ordito-atlas-empty')).textContent = localize('ordito.atlas.noDiagrams', "No diagrams in this context."); }
	pager(diagramSection, diagramPage, 'diagramPage', localize('ordito.atlas.diagramPages', "Diagrams"));
	if (projection) {
		const details = controls.details(root, localize('ordito.atlas.relationships', "Relationships · {0}", relations.length.toLocaleString()), 'atlas-relationships');
		details.classList.add('ordito-atlas-relationships');
		const relationPage = getAtlasPage(relations, state.relationPage);
		for (const relation of relationPage.items) {
			const row = dom.append(details, dom.$('article.ordito-atlas-relation'));
			dom.append(row, dom.$('h3')).textContent = relation.name || relationLabels[relation.kind];
			dom.append(row, dom.$('small')).textContent = relationLabels[relation.kind];
			for (const [text, id] of [[localize('ordito.atlas.source', "Source: {0}", atlas.elements.get(relation.from)!.name), relation.from], [localize('ordito.atlas.target', "Target: {0}", atlas.elements.get(relation.to)!.name), relation.to]]) { controls.button(row, text, () => actions.element(id), `atlas-relation:${relation.id}:${id}`); }
			if (relation.condition) { dom.append(row, dom.$('p')).textContent = localize('ordito.atlas.condition', "Condition: {0}", relation.condition); }
			if (relation.errorCode) { dom.append(row, dom.$('p')).textContent = localize('ordito.atlas.error', "Error: {0}", relation.errorCode); }
		}
		if (!relations.length) { dom.append(details, dom.$('p.ordito-atlas-empty')).textContent = localize('ordito.atlas.noRelations', "No declared relationships satisfy this context."); }
		pager(details, relationPage, 'relationPage', localize('ordito.atlas.relationPages', "Relationships"));
	}
}
