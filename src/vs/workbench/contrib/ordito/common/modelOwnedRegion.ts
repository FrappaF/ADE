type RegionKind = 'pure-v1' | 'interaction-v1' | 'state-v1' | 'messaging-v1';

function markers(kind: RegionKind, brand: 'ordito' | 'ade'): readonly [string, string] {
	return [`// <${brand}:${kind}>\n`, `// </${brand}:${kind}>\n`];
}

export function modelOwnedRegion(kind: RegionKind, content: string): string {
	const [begin, end] = markers(kind, 'ordito');
	return begin + content + end;
}

export function readModelOwnedRegion(source: string, kind: RegionKind, error: string): { region: string; content: string } {
	const current = markers(kind, 'ordito');
	const legacy = markers(kind, 'ade');
	const [begin, end] = source.includes(current[0]) ? current : legacy;
	const other = begin === current[0] ? legacy : current;
	const from = source.indexOf(begin);
	const to = source.indexOf(end);
	if (from < 0 || to < from || source.includes(begin, from + begin.length) || source.includes(end, to + end.length) || other.some(marker => source.includes(marker))) {
		throw new Error(error);
	}
	return { region: source.slice(from, to + end.length), content: source.slice(from + begin.length, to) };
}

/** Compare the complete generated region, allowing either version of its ownership markers. */
export function matchesModelOwnedRegion(region: string, kind: RegionKind, content: string): boolean {
	if (region === modelOwnedRegion(kind, content)) { return true; }
	const [begin, end] = markers(kind, 'ade');
	return region === begin + content + end;
}
