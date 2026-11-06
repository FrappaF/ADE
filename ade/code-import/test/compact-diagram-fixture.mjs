/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Test-only adapters keep existing domain oracles independent of the optimized wire representation.
export function expandDiagramContext(context) {
	if (context.format !== 'compact-v3') { return context; }
	const symbols = context.units.map(([ref, fileIndex, indexed, name, start, end]) => {
		const file = context.files[fileIndex];
		return { ref, file: file.path, language: file.language, name: name ?? file.path, sourceId: indexed ? undefined : null, content: file.fragments.map(fragment => ({ start: Math.max(start, fragment.start), end: Math.min(end, fragment.start + fragment.text.length), fragment })).filter(item => item.end > item.start).map(item => item.fragment.text.slice(item.start - item.fragment.start, item.end - item.fragment.start)).join('') };
	});
	return { ...context, compact: context, project: { ...context.project, files: context.catalogFiles.length ? context.catalogFiles : context.files.map(file => file.path) }, required: context.units.map(([ref, , indexed]) => ({ ref, indexed: !!indexed })), symbols, sourceCatalog: context.catalog.map(([ref, file, indexed, name]) => ({ ref, file: context.catalogFiles[file], indexed: !!indexed, name: name ?? context.catalogFiles[file] })) };
}

export function compactDiagramReply(context, value) {
	if (!context.step || value.coverage) { return value; }
	const rows = context.step === 'overview' ? context.sourceCatalog : context.required;
	const groups = new Map();
	const targets = rows.map((row, index) => {
		const omission = value.omissions?.find(item => item.symbol === row.ref);
		const source = value.concepts.find(item => item.source === row.ref);
		let target = value.elements.some(item => item.symbol === row.ref) ? row.ref : omission ? omission.representedBy : source ? 'c:' + source.key : undefined;
		let reason = omission?.reason;
		if (target === undefined && context.step === 'overview') { target = context.priorCoverage.targets[index]; reason = undefined; }
		if (target?.startsWith('x:')) { const existing = context.priorCoverage?.exclusions.find(item => 'x:' + item.key === target); if (existing) { groups.set(existing.reason, existing.key); } return target; }
		if (target === null && reason) { let key = groups.get(reason); if (!key) { key = 'excluded-' + groups.size; groups.set(reason, key); } return 'x:' + key; }
		return target ?? 'x:unexplained';
	});
	const { omissions, ...rest } = value;
	return { ...rest, coverage: { targets, exclusions: [...groups].map(([reason, key]) => ({ reason, key })) } };
}
