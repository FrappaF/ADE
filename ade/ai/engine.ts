/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Ajv2020 } from 'ajv/dist/2020.js';
import { realpath } from 'node:fs/promises';
import { object, text } from '../runtime/schemas.ts';
import { prepareImplementation, type PreparedImplementation } from './context.ts';
import { proposeImplementation } from './collaboration.ts';
import { interpretResiduals } from './interpretation.ts';
import { benchmarkModels, type BenchmarkCandidate } from './benchmark.ts';
import { benchmarkReconciliation } from './reconciliationBenchmark.ts';
import { applyImplementation, planReviewId, readSession, recoverImplementation, stageImplementation, verifyImplementation } from './implementation.ts';

interface CollaborationRequest {
	maxInputBytes?: number; direction?: 'forward' | 'reverse'; paths?: Record<string, string>;
	operation: 'structuralPrepare' | 'structuralVerify' | 'structuralApply' | 'structuralUndo' | 'structuralSession' | 'structuralRecover' | 'prepare' | 'plan' | 'interpret' | 'stage' | 'session' | 'verify' | 'apply' | 'undo' | 'recover' | 'benchmark' | 'reconciliationBenchmark';
	candidates?: BenchmarkCandidate[];
	request?: object; config?: object; prepared?: PreparedImplementation; plan?: object;
	reviewId?: string; root?: string; id?: string;
}
const valid = new Ajv2020().compile<CollaborationRequest>({ oneOf: [
	object({ operation: { const: 'structuralPrepare' }, root: text, direction: { enum: ['forward', 'reverse'] }, paths: { type: 'object', additionalProperties: text }, maxInputBytes: { type: 'integer', minimum: 1, maximum: 196608 } }, ['direction', 'paths', 'maxInputBytes']),
	object({ operation: { enum: ['structuralVerify', 'structuralApply', 'structuralUndo', 'structuralSession', 'structuralRecover'] }, root: text, id: text, reviewId: text }, ['reviewId']),
	object({ operation: { const: 'prepare' }, request: { type: 'object' }, config: { type: 'object' } }),
	object({ operation: { enum: ['plan', 'interpret'] }, prepared: { type: 'object' }, reviewId: text }),
	object({ operation: { const: 'stage' }, prepared: { type: 'object' }, plan: { type: 'object' }, reviewId: text }),
	object({ operation: { enum: ['benchmark', 'reconciliationBenchmark'] }, candidates: { type: 'array', minItems: 2, maxItems: 3, items: { type: 'object', additionalProperties: false, required: ['config'], properties: { config: { type: 'object' }, rates: { type: 'object' } } } } }),
	object({ operation: { enum: ['session', 'verify', 'apply', 'undo', 'recover'] }, root: text, id: text, reviewId: text }, ['reviewId'])
] });

/** Shared by the native utility process, CLI and integration tests. */
export async function executeCollaboration(input: string, signal?: AbortSignal): Promise<string> {
	if (Buffer.byteLength(input) > 4 * 1024 * 1024) { throw new Error('Collaboration request exceeds 4 MiB'); }
	const request: unknown = JSON.parse(input);
	if (!valid(request)) { throw new Error('Invalid collaboration request'); }
	signal?.throwIfAborted();
	let result: object;
	switch (request.operation) {
		case 'structuralPrepare': case 'structuralVerify': case 'structuralApply': case 'structuralUndo': case 'structuralSession': case 'structuralRecover': {
			const adapter = await import('./structuralProject.ts');
			const root = await realpath(request.root!);
			if (request.operation === 'structuralPrepare') { result = await adapter.prepareStructuralProject(root, request.direction, request.paths, request.maxInputBytes, signal); }
			else if (request.operation === 'structuralVerify') { result = await adapter.verifyStructuralProject(root, request.id!, request.reviewId ?? '', signal); }
			else if (request.operation === 'structuralSession') { result = await adapter.readStructuralSession(root, request.id!); }
			else if (request.operation === 'structuralRecover') { result = await adapter.recoverStructuralProject(root, request.id!); }
			else { result = await adapter.publishStructuralProject(root, request.id!, request.reviewId ?? '', request.operation === 'structuralUndo'); }
			break;
		}
		case 'prepare': result = await prepareImplementation(request.request, request.config, signal); break;
		case 'benchmark': result = await benchmarkModels(request.candidates!, signal); break;
		case 'reconciliationBenchmark': result = await benchmarkReconciliation(request.candidates!, signal); break;
		case 'interpret': result = await interpretResiduals(request.prepared!, request.reviewId!, signal); break;
		case 'plan': {
			const proposal = await proposeImplementation(request.prepared!, request.reviewId!, signal);
			result = { ...proposal, planId: planReviewId(request.prepared!, proposal.plan) };
			break;
		}
		case 'stage': result = await stageImplementation(request.prepared!, request.plan!, request.reviewId!, signal); break;
		case 'verify': result = await verifyImplementation(request.root!, request.id!, request.reviewId ?? '', signal); break;
		case 'apply': result = await applyImplementation(request.root!, request.id!, request.reviewId ?? ''); break;
		case 'undo': result = await applyImplementation(request.root!, request.id!, request.reviewId ?? '', true); break;
		case 'session': result = await readSession(request.root!, request.id!); break;
		case 'recover': result = await recoverImplementation(request.root!, request.id!); break;
	}
	return JSON.stringify(result);
}
