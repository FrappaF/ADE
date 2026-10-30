/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { CodeImport, IndexedFile, CodeDeclaration } from './importCode.ts';

export interface RenameHint { fromId: string; toSourceId: string }
const valid = new Ajv2020().compile<RenameHint[]>({ type: 'array', maxItems: 1000, items: { type: 'object', additionalProperties: false, required: ['fromId', 'toSourceId'], properties: { fromId: { type: 'string', minLength: 1 }, toSourceId: { type: 'string', minLength: 1 } } } });

/** A rename is an explicit identity assertion, never a similarity score. */
export function readRenameHints(value: unknown): RenameHint[] {
	if (!valid(value)) { throw new Error('Invalid rename hints'); }
	return structuredClone(value);
}

/** Preserves selected identities and their unambiguous named descendants after a user-confirmed rename. */
export function applyRenameHints(previous: CodeImport, files: IndexedFile[], analysis: CodeImport['analysis'], input: RenameHint[]): void {
	const hints = readRenameHints(input);
	const before = new Map(previous.files.flatMap(file => file.declarations.map(declaration => [declaration.id, { declaration, file: file.file }] as const)));
	const after = new Map(files.flatMap(file => file.declarations.map(declaration => [declaration.sourceId!, { declaration, file: file.file }] as const)));
	const currentIds = new Set(files.flatMap(file => file.declarations.map(declaration => declaration.id)));
	const remap = new Map<string, string>();
	const used = new Set<string>();
	const matches: NonNullable<CodeImport['analysis']['symbolRenames']> = [];
	for (const hint of hints) {
		const old = before.get(hint.fromId);
		const next = after.get(hint.toSourceId);
		if (!old || !next || used.has(hint.fromId) || remap.has(next.declaration.id) || old.declaration.kind !== next.declaration.kind || old.declaration.syntaxKind !== next.declaration.syntaxKind || (currentIds.has(hint.fromId) && next.declaration.id !== hint.fromId)) { throw new Error('Rename hint is stale, ambiguous or incompatible'); }
		used.add(hint.fromId);
		remap.set(next.declaration.id, hint.fromId);
		matches.push({ fromId: hint.fromId, toSourceId: hint.toSourceId, fromName: old.declaration.name, toName: next.declaration.name, fromFile: old.file, toFile: next.file });
	}
	const allDeclarations = files.flatMap(file => file.declarations);
	const newChildren = new Map<string, CodeDeclaration[]>();
	for (const declaration of allDeclarations) { newChildren.set(declaration.parentId, [...(newChildren.get(declaration.parentId) ?? []), declaration]); }
	const oldChildren = new Map<string, CodeDeclaration[]>();
	for (const { declaration } of before.values()) { oldChildren.set(declaration.parentId, [...(oldChildren.get(declaration.parentId) ?? []), declaration]); }
	for (const declaration of allDeclarations) {
		const oldParent = remap.get(declaration.parentId);
		if (!oldParent || remap.has(declaration.id)) { continue; }
		const candidates = (oldChildren.get(oldParent) ?? []).filter(item => item.syntaxKind === declaration.syntaxKind && item.name === declaration.name);
		const siblings = (newChildren.get(declaration.parentId) ?? []).filter(item => item.syntaxKind === declaration.syntaxKind && item.name === declaration.name);
		if (candidates.length === 1 && siblings.length === 1 && !currentIds.has(candidates[0].id) && !used.has(candidates[0].id)) { remap.set(declaration.id, candidates[0].id); used.add(candidates[0].id); }
	}
	for (const declaration of allDeclarations) {
		declaration.id = remap.get(declaration.id) ?? declaration.id;
		declaration.parentId = remap.get(declaration.parentId) ?? declaration.parentId;
	}
	if (matches.length) { analysis.symbolRenames = matches; }
}
