/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { compileModelContext, assertModelContextCurrent, type SealedModelContext } from '../../src/vs/workbench/contrib/ade/common/modelContext.ts';
import { assertModelProposalAllowed, getModelReadiness, type GenerationProfile } from '../../src/vs/workbench/contrib/ade/common/modelReadiness.ts';
import type { SemanticModel, SemanticModelV4 } from '../../src/vs/workbench/contrib/ade/common/semanticModel.ts';

/** Tool-owned registry. No production archetype is registered until S10 supplies an actual adapter. */
export function createDiagramDrivenAdapter(profiles: readonly GenerationProfile[]) {
	const registry = new Map(profiles.map(profile => [profile.id, structuredClone(profile)]));
	if (registry.size !== profiles.length) { throw new Error('Duplicate generation profile'); }
	return {
		readiness(model: SemanticModel, targetId: string, profileId: string) { return getModelReadiness(model, targetId, registry.get(profileId)); },
		async prepare(model: SemanticModel, targetId: string, profileId: string, maxInputBytes: number): Promise<SealedModelContext> {
			const profile = registry.get(profileId);
			if (!profile) { throw new Error('Unknown generation profile; no provider call is permitted'); }
			return compileModelContext(model, { targetId, profile, maxInputBytes });
		},
		async assertProposal(packet: SealedModelContext, baseline: SemanticModelV4, candidate: SemanticModel, profileId: string, maxInputBytes: number): Promise<void> {
			const profile = registry.get(profileId);
			if (!profile) { throw new Error('Unknown generation profile'); }
			await assertModelContextCurrent(packet, baseline, { targetId: packet.targetId, profile, maxInputBytes });
			assertModelProposalAllowed(baseline, candidate, packet.targetId, profile);
		},
		async assertCurrent(packet: SealedModelContext, model: SemanticModel, profileId: string, maxInputBytes: number): Promise<void> {
			const profile = registry.get(profileId);
			if (!profile) { throw new Error('Unknown generation profile'); }
			return assertModelContextCurrent(packet, model, { targetId: packet.targetId, profile, maxInputBytes });
		}
	};
}

/** The structural task adapter is shared with the workbench; it cannot publish or invoke providers. */
export { compileModelTaskContext, assertModelTaskCurrent, clarifyModelTask, modelTaskOutputSchema } from '../../src/vs/workbench/contrib/ade/common/modelTaskContext.ts';
export { readModelTaskResponse, validateModelTaskProposal, authorizeModelTaskRetrieval, expandModelTaskContext, ModelTaskCache } from '../../src/vs/workbench/contrib/ade/common/modelTaskResponse.ts';
