/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
		files[index].fragments.push({ start: unit.start, text: unit.text });
		rows.push([unit.ref, index, unit.id ? 1 : 0, unit.name === unit.file ? null : unit.name, unit.start, unit.end]);
	}
	for (const file of files) {
		const merged: typeof file.fragments = [];
		for (const fragment of file.fragments.sort((a, b) => a.start - b.start)) {
			const previous = merged.at(-1);
			if (!previous || previous.start + previous.text.length < fragment.start) { merged.push({ ...fragment }); continue; }
			const offset = fragment.start - previous.start;
			const overlap = Math.min(previous.text.length - offset, fragment.text.length);
			if (previous.text.slice(offset, offset + overlap) !== fragment.text.slice(0, overlap)) { throw new Error('Conflicting sealed source excerpts'); }
			previous.text += fragment.text.slice(overlap);
		}
		file.fragments = merged;
	}
	return { files, units: rows };
}
