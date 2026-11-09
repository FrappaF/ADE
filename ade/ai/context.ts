/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { measureContextPayload } from '../../src/vs/workbench/contrib/ade/common/contextTransport.ts';
import { createHash } from 'node:crypto';
import { open, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { importCode } from '../code-import/importCode.ts';
import { readSnapshot } from '../code-import/snapshot.ts';
import { isDisclosableSource } from '../code-import/paths.ts';
export { isDisclosableSource } from '../code-import/paths.ts';
import { getModelImpact } from '../../src/vs/workbench/contrib/ade/common/modelImpact.ts';
import { planSchema, readImplementationRequest, readProviderConfig, type FeatureContext, type ImplementationRequest, type ProviderConfig } from './contracts.ts';
import { planningInstruction, providerEndpoints } from './protocol.ts';

export interface PreparedImplementation {
	version: 1;
	request: ImplementationRequest;
	config: ProviderConfig;
	snapshotHash: string;
	context: FeatureContext;
	disclosure: { endpoint: string; instruction: string; schema: object };
	/** Binds approval to the complete provider payload and connection settings. */
	reviewId: string;
}

export const hash = (value: string): string => createHash('sha256').update(value).digest('hex');

/** Reads bounded UTF-8 text through a canonical path, rejecting redirected and binary inputs. */
export async function readSource(root: string, file: string, signal?: AbortSignal): Promise<string> {
	signal?.throwIfAborted();
	if (!isDisclosableSource(file)) { throw new Error('Source path is not eligible for disclosure'); }
	const path = join(root, file);
	if (await realpath(path) !== path) { throw new Error('Source path cannot contain symlinks'); }
	const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
	try {
		const info = await handle.stat();
		if (!info.isFile() || info.size > 262144) { throw new Error('Selected source exceeds 256 KiB or is not a regular file'); }
		// A fixed-size read also bounds memory if the file grows after stat.
		const buffer = Buffer.alloc(262145);
		let length = 0;
		while (length < buffer.length) {
			const read = await handle.read(buffer, length, buffer.length - length, null);
			if (!read.bytesRead) { break; }
			length += read.bytesRead;
			signal?.throwIfAborted();
		}
		if (length > 262144 || buffer.subarray(0, length).includes(0)) { throw new Error('Selected source is oversized or binary'); }
		return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer.subarray(0, length));
	} finally { await handle.close(); }
}

/** Entire M4 manifest is checked without model calls, package installs or project execution. */
export async function prepareImplementation(requestValue: unknown, configValue: unknown, signal?: AbortSignal): Promise<PreparedImplementation> {
	const request = readImplementationRequest(requestValue);
	const config = readProviderConfig(configValue);
	signal?.throwIfAborted();
	const snapshot = await readSnapshot(request.snapshot);
	const { state, model } = snapshot;
	if (model.version === 4) { throw new Error('A registered diagram-driven generation profile is required for v4; legacy M5 cannot generate this model'); }
	if (state.analysis.semanticInvalidated) { throw new Error('Refresh the deterministic semantic index before planning'); }
	const feature = model.semantics.elements.find(element => element.id === request.featureId);
	if (feature?.kind !== 'feature') { throw new Error('Select a feature in the semantic model'); }
	const impact = getModelImpact(model, feature.id);
	const scope = new Set(impact.scope.map(element => element.id));
	const relations = impact.relationships;
	const ids = new Set([...scope, ...impact.dependents.map(entry => entry.element.id), ...impact.owners.map(element => element.id), ...relations.flatMap(relation => [relation.from, relation.to])]);
	const elements = model.semantics.elements.filter(element => ids.has(element.id));
	const mappings = model.codeMappings.filter(mapping => ids.has(mapping.elementId) && request.sourceFiles.includes(mapping.file));
	const root = await realpath(state.sourceRoot);
	const sources: FeatureContext['sources'] = [];
	for (const file of [...request.sourceFiles].sort()) {
		const indexed = state.files.find(item => item.file === file);
		if (!indexed?.revision || !['parsed', 'partial'].includes(indexed.status)) { throw new Error('Selected source is not indexed by M4'); }
		const content = await readSource(root, file, signal);
		if (hash(content) !== indexed.revision) { throw new Error('Source changed; run deterministic Sync before planning'); }
		sources.push({ file, revision: indexed.revision, language: indexed.language!, status: indexed.status, content, declarations: indexed.declarations, diagnostics: indexed.diagnostics });
	}
	const context: FeatureContext = {
		version: 1, projectId: model.id, sourceRevision: state.revision, modelRevision: hash(JSON.stringify(model)),
		featureId: feature.id, intent: request.intent, constraints: request.constraints, elements, relations, mappings,
		impact: { elementIds: [...new Set([...impact.scope.map(element => element.id), ...impact.dependents.map(entry => entry.element.id)])], viewIds: impact.views.map(view => view.id) },
		semantic: { providers: state.semantic?.providers ?? [], dependencies: state.semantic?.dependencies.filter(edge => ids.has(edge.from) || ids.has(edge.to)) ?? [], diagnostics: state.semantic?.diagnostics.filter(item => request.sourceFiles.includes(item.file)) ?? [] }, sources
	};
	if (measureContextPayload(planningInstruction + '\n' + JSON.stringify(context), planSchema).totalBytes > config.maxContextBytes) { throw new Error('Context exceeds configured byte budget; narrow the request'); }
	// Reuse the exact M4 scope and cached ASTs, including files not disclosed to the provider.
	const observed = await importCode(root, state.projectId, { previous: state, signal });
	if (observed.revision !== state.revision) { throw new Error('Source manifest changed; run deterministic Sync before planning'); }
	if ((await readSnapshot(snapshot.directory)).inputHash !== snapshot.inputHash) { throw new Error('Snapshot changed during context preparation'); }
	signal?.throwIfAborted();
	const disclosure = { endpoint: providerEndpoints[config.provider], instruction: planningInstruction, schema: planSchema };
	const payload = { version: 1 as const, request, config, snapshotHash: snapshot.inputHash, context, disclosure };
	return { ...payload, reviewId: hash(JSON.stringify(payload)) };
}

/** Rebuild from trusted M4 artifacts instead of trusting an edited review file. */
export async function assertPreparedCurrent(prepared: PreparedImplementation, reviewId: string, signal?: AbortSignal): Promise<void> {
	const current = await prepareImplementation(prepared.request, prepared.config, signal);
	if (current.reviewId !== reviewId || prepared.reviewId !== reviewId || JSON.stringify(current) !== JSON.stringify(prepared)) {
		throw new Error('Review does not match the current context and provider; prepare and review again');
	}
}
