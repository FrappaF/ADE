/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Ajv2020 } from 'ajv/dist/2020.js';
import { object, text } from '../code-import/schemas.ts';
import { prepareImplementation, type PreparedImplementation } from './context.ts';
import { proposeImplementation } from './collaboration.ts';
import { interpretResiduals } from './interpretation.ts';
import { benchmarkModels, type BenchmarkCandidate } from './benchmark.ts';
import { applyImplementation, planReviewId, readSession, recoverImplementation, stageImplementation, verifyImplementation } from './implementation.ts';

interface CollaborationRequest {
	operation: 'prepare' | 'plan' | 'interpret' | 'stage' | 'session' | 'verify' | 'apply' | 'undo' | 'recover' | 'benchmark';
	candidates?: BenchmarkCandidate[];
	request?: object; config?: object; prepared?: PreparedImplementation; plan?: object;
	reviewId?: string; root?: string; id?: string;
}
const valid = new Ajv2020().compile<CollaborationRequest>({ oneOf: [
	object({ operation: { const: 'prepare' }, request: { type: 'object' }, config: { type: 'object' } }),
	object({ operation: { enum: ['plan', 'interpret'] }, prepared: { type: 'object' }, reviewId: text }),
	object({ operation: { const: 'stage' }, prepared: { type: 'object' }, plan: { type: 'object' }, reviewId: text }),
	object({ operation: { const: 'benchmark' }, candidates: { type: 'array', minItems: 2, maxItems: 3, items: { type: 'object', additionalProperties: false, required: ['config'], properties: { config: { type: 'object' }, rates: { type: 'object' } } } } }),
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
		case 'prepare': result = await prepareImplementation(request.request, request.config, signal); break;
		case 'benchmark': result = await benchmarkModels(request.candidates!, signal); break;
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
