/** Positional rows avoid repeating paths, languages, hashes and property names for every symbol. */
export interface DiagramEvidenceUnit { ref: string; id?: string; file: string; language: string; name: string; start: number; end: number; text?: string }
export type DiagramEvidenceRow = [ref: string, file: number, indexed: number, name: string | null, start: number, end: number];
export interface DiagramEvidencePack {
	files: { path: string; language: string; fragments: { start: number; text: string }[] }[];
	units: DiagramEvidenceRow[];
}

/** Merge overlapping disclosed windows without broadening the source ranges sent to the provider. */
export function packDiagramEvidence(units: DiagramEvidenceUnit[]): DiagramEvidencePack {
	const files: DiagramEvidencePack['files'] = [];
	const indexes = new Map<string, number>();
	const rows: DiagramEvidenceRow[] = [];
	for (const unit of units) {
		let index = indexes.get(unit.file);
		if (index === undefined) { index = files.length; indexes.set(unit.file, index); files.push({ path: unit.file, language: unit.language, fragments: [] }); }
		if (unit.text === undefined) { throw new Error('Missing sealed source excerpt'); }
		if (!Number.isSafeInteger(unit.start) || !Number.isSafeInteger(unit.end) || unit.start < 0 || unit.end < unit.start || unit.text.length > unit.end - unit.start) { throw new Error('Invalid sealed source range'); }
		files[index].fragments.push({ start: unit.start, text: unit.text });
		rows.push([unit.ref, index, unit.id ? 1 : 0, unit.name === unit.file ? null : unit.name, unit.start, unit.end]);
	}
	for (const file of files) { file.fragments = mergeSourceWindows(file.fragments); }
	return { files, units: rows };
}

export interface SourceWindow { start: number; text: string }

/** Merge exactly disclosed UTF-16 ranges. Conflicting overlapping data is never repaired by guessing. */
export function mergeSourceWindows(windows: readonly SourceWindow[]): SourceWindow[] {
	const result: SourceWindow[] = [];
	for (const window of [...windows].sort((a, b) => a.start - b.start)) {
		if (!Number.isSafeInteger(window.start) || window.start < 0 || typeof window.text !== 'string') { throw new Error('Invalid source window'); }
		const previous = result.at(-1);
		if (!previous || previous.start + previous.text.length < window.start) { result.push({ ...window }); continue; }
		const offset = window.start - previous.start, overlap = Math.min(previous.text.length - offset, window.text.length);
		if (previous.text.slice(offset, offset + overlap) !== window.text.slice(0, overlap)) { throw new Error('Conflicting sealed source excerpts'); }
		previous.text += window.text.slice(overlap);
	}
	return result;
}

/** Shared accounting for M5, M6, diagram import and structural tasks. Tokens remain estimates. */
export function measureContextPayload(prompt: string, schema: object): { inputBytes: number; schemaBytes: number; totalBytes: number; estimatedTokens: number } {
	const encoder = new TextEncoder(); const inputBytes = encoder.encode(prompt).length, schemaBytes = encoder.encode(JSON.stringify(schema)).length;
	return { inputBytes, schemaBytes, totalBytes: inputBytes + schemaBytes, estimatedTokens: Math.ceil((inputBytes + schemaBytes) / 4) };
}
