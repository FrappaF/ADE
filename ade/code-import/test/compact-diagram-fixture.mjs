/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Test-only adapters keep existing domain oracles independent of the optimized wire representation.
export function expandDiagramContext(context) {
	if (context.format !== 'compact-v4') { return context; }
	const symbols = context.units.map(([ref, fileIndex, indexed, name, start, end]) => {
		const file = context.files[fileIndex];
		return { ref, file: file.path, language: file.language, name: name ?? file.path, sourceId: indexed ? undefined : null, content: file.fragments.map(fragment => ({ start: Math.max(start, fragment.start), end: Math.min(end, fragment.start + fragment.text.length), fragment })).filter(item => item.end > item.start).map(item => item.fragment.text.slice(item.start - item.fragment.start, item.end - item.fragment.start)).join('') };
	});
	return { ...context, compact: context, project: { ...context.project, files: context.catalogFiles.length ? context.catalogFiles : context.files.map(file => file.path) }, required: context.units.map(([ref, , indexed]) => ({ ref, indexed: !!indexed })), symbols, sourceCatalog: context.catalog.map(([ref, file, indexed, name]) => ({ ref, file: context.catalogFiles[file], indexed: !!indexed, name: name ?? context.catalogFiles[file] })) };
}

export function compactDiagramReply(context, value) {
	const result = compactReply(context, value);
	if (context.workflow !== 'planned-v1') { return result; }
	const refs = [...result.elements.map(item => item.symbol), ...result.concepts.map(item => 'c:' + item.key)];
	const focus = refs.length ? refs : context.responsibilities.map(item => item.ref);
	const first = { ...result.overview, kind: 'structure', feature: null, focus: (focus.length ? focus : [context.required[0]?.ref ?? 'u0']).slice(0, 24) };
	return { notation: { elements: [], relations: [] }, ...result, diagrams: [], plan: [first, ...result.diagrams.filter(item => item.nodes.length > 1 || item.relations.length).map(({ nodes, relations, ...item }) => ({ ...item, focus: nodes.slice(0, 24) }))] };
}

/** Simulated view construction is deliberately separate from real-model replay. */
export function plannedDiagramReply(context) {
	const connected = new Set(context.graph.relations.flatMap(item => [item.from, item.to]));
	return { ...(context.notationRule ? { connections: [] } : {}), questions: [], nodes: context.graph.elements.filter(item => !connected.size || connected.has(item.ref)).map(item => item.ref).slice(0, 24), relations: context.graph.relations.map(item => item.key) };
}

function compactReply(context, value) {
	if (!context.step) { return value; }
	if (value.coverage) {
		if (value.overview) { return value; }
		const first = value.diagrams[0] ?? { key: 'overview', name: 'System Overview', intent: 'AI-declared responsibilities' };
		return { ...value, overview: { key: first.key, name: first.name, intent: first.intent }, diagrams: value.diagrams.slice(1) };
	}
	const rows = context.step === 'overview' ? context.sourceCatalog : context.required;
	const entries = rows.map(row => {
		const omission = value.omissions?.find(item => item.symbol === row.ref);
		const source = value.concepts.find(item => item.source === row.ref);
		let target = value.elements.some(item => item.symbol === row.ref) ? row.ref : omission ? omission.representedBy : source ? 'c:' + source.key : undefined;
		let reason = omission?.reason;
		if (target === undefined && context.step === 'overview') { target = context.priorCoverage.targets[row.ref]; reason = undefined; }
		if (target?.startsWith('x:')) { return [row.ref, target]; }
		if (target === null && reason) { return [row.ref, 'x:framework']; }
		return [row.ref, target ?? 'x:unexplained'];
	});
	const { omissions, ...rest } = value;
	const first = value.diagrams[0] ?? { key: 'overview', name: 'System Overview', intent: 'AI-declared responsibilities' };
	const overview = { key: first.key, name: first.name, intent: first.intent };
	rest.diagrams = value.diagrams.slice(1);
	return { ...rest, overview, coverage: { targets: Object.fromEntries(entries) } };
}
