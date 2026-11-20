import type { DiagramEvidenceUnit } from './diagramEvidence.ts';
import type { DiagramInterpretation } from './diagramImport.ts';

export interface ColumnConstraint { source: string; file: string; table: string; column: string; notNull: true | null; primary: true | null }
/** Conservative evidence for complete, unquoted CREATE TABLE statements. Never executes SQL or claims a general SQL parser. */
export function diagramColumnConstraints(units: DiagramEvidenceUnit[]): ColumnConstraint[] {
	const facts: ColumnConstraint[] = [];
	for (const unit of units) {
		if (!/\.sql$/i.test(unit.file) || !unit.text || /['"`\[\]]|--|\/\*/.test(unit.text)) { continue; }
		for (const match of unit.text.matchAll(/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?<table>[A-Za-z_][\w]*)\s*\((?<body>[\s\S]*?)\)\s*;/gi)) {
			const { table, body } = match.groups!;
			const columns: string[] = []; let depth = 0, column = '';
			for (const character of body) {
				if (character === '(') { depth++; }
				if (character === ')') { depth--; }
				if (character === ',' && depth === 0) { columns.push(column); column = ''; }
				else if (depth === 0 && character !== ')') { column += character; }
			}
			if (depth !== 0) { continue; }
			columns.push(column);
			for (const declaration of columns) {
				const name = /^\s*(?<name>[A-Za-z_][\w]*)\s+/i.exec(declaration)?.groups?.name;
				if (!name || /^(?:CONSTRAINT|PRIMARY|FOREIGN|UNIQUE|CHECK|EXCLUDE)$/i.test(name)) { continue; }
				const notNull = /\bNOT\s+NULL\b/i.test(declaration), primary = /\bPRIMARY\s+KEY\b/i.test(declaration);
				facts.push({ source: unit.ref, file: unit.file, table, column: name, notNull: notNull ? true : null, primary: primary ? true : null });
			}
		}
	}
	return facts;
}

/** Checks explicit source facts after AI has chosen table identities and members; never creates design objects. */
export function validateDiagramColumnConstraints(result: DiagramInterpretation, facts: ColumnConstraint[]): void {
	for (const entry of result.notation?.elements ?? []) {
		const element = result.concepts.find(item => 'c:' + item.key === entry.ref) ?? result.elements.find(item => item.symbol === entry.ref);
		if (element?.kind !== 'table') { continue; }
		for (const member of entry.details?.members ?? []) {
			const matches = facts.filter(fact => fact.table.toLowerCase() === element.name.toLowerCase() && fact.column.toLowerCase() === member.name.toLowerCase());
			if (matches.length !== 1) { continue; }
			if (matches.some(fact => fact.notNull) && !member.required) { throw new Error(`AI table ${element.name}.${member.name} contradicts explicit NOT NULL source evidence; required must be true`); }
		}
	}
}
