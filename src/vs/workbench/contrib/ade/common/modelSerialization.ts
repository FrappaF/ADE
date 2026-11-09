/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SemanticModel } from './semanticModel.js';

/** JSON boundary type; undefined, non-finite numbers and sparse arrays are rejected, never normalized. */
export type ModelJson = null | boolean | number | string | ModelJson[] | { [key: string]: ModelJson };

/** Sort object keys only. Array order may express behavior and must never be guessed away. */
export function canonicalJson(value: object | ModelJson): string {
	const encode = (entry: unknown): string => {
		if (entry === null || typeof entry === 'string' || typeof entry === 'boolean') { return JSON.stringify(entry); }
		if (typeof entry === 'number' && Number.isFinite(entry)) { return JSON.stringify(entry); }
		if (Array.isArray(entry)) { return '[' + Array.from(entry, child => encode(child)).join(',') + ']'; }
		if (entry && typeof entry === 'object' && Object.getPrototypeOf(entry) === Object.prototype) {
			const record = entry as Record<string, unknown>;
			return '{' + Object.keys(record).sort().map(key => JSON.stringify(key) + ':' + encode(record[key])).join(',') + '}';
		}
		throw new Error('Canonical model content must be lossless JSON');
	};
	return encode(value);
}

/** Full persistence includes layout. This serialization never modifies its input. */
export function serializeSemanticModel(model: SemanticModel): string { return canonicalJson(model) + '\n'; }

/** Pure semantic projection excludes visual grouping/geometry but retains legacy sequence declarations. */
export function semanticContent(model: SemanticModel): object {
	const { views, ...content } = structuredClone(model);
	return { ...content, ...(model.version === 4 && views.some(view => view.subjectId) ? { c4Scopes: views.filter(view => view.subjectId).map(view => ({ viewId: view.id, kind: view.kind, subjectId: view.subjectId!, contextIds: view.contextIds ?? [] })) } : {}), legacySequenceOrders: views.filter(view => view.kind === 'sequence').map(view => ({ viewId: view.id, relationIds: view.relationIds })) };
}

/** WebCrypto is available in both the worker/CLI and workbench; no Node or browser module is imported. */
export async function modelDigest(content: string): Promise<string> {
	const bytes = new TextEncoder().encode(content);
	return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Layout and navigation never invalidate a semantic review. */
export function hashSemanticModel(model: SemanticModel): Promise<string> { return modelDigest(canonicalJson(semanticContent(model))); }
