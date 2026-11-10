/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { compileModelStateMachine, executeStateProgram, type StateSnapshot } from './modelStates.js';
import { getModelArchetype, modelProjectProfile } from './modelProfiles.js';
import { canonicalJson, modelDigest } from './modelSerialization.js';
import { type SemanticModelV4 } from './modelTypes.js';

export interface ModelStackPlan {
	version: 1; from: string; to: string; pimRevision: string;
	implementation: string; dependencies: string; storage: string; tests: string; deployment: string; recovery: string;
}

/** PSM is the only editable part of a runtime switch; all semantic IDs and authored intent survive. */
export function switchModelStack(model: SemanticModelV4, profileId: string): SemanticModelV4 {
	const current = modelProjectProfile(model), target = getModelArchetype(profileId), next = structuredClone(model);
	next.foundation.platform.bindings = next.foundation.platform.bindings.map(binding => {
		if (binding.profileId !== current.profile.id) { return binding; }
		return { ...binding, profileId, technology: binding.technology.state === 'known' && binding.technology.value === 'nats-jetstream' ? binding.technology : { state: 'known' as const, value: target.toolchain.runtime === 'bun' ? 'bun-esm' : 'node-esm' } };
	});
	modelProjectProfile(next);
	return next;
}

/** Reject scope expansion and retain a fingerprint independent of technology and presentation. */
export async function modelStackPlan(before: SemanticModelV4, after: SemanticModelV4): Promise<ModelStackPlan> {
	const from = modelProjectProfile(before), to = modelProjectProfile(after);
	const strip = (model: SemanticModelV4) => { const value = structuredClone(model); value.foundation.platform = { bindings: [] }; value.views = []; return value; };
	if (canonicalJson(strip(before)) !== canonicalJson(strip(after)) || canonicalJson(switchModelStack(before, to.profile.id).foundation.platform) !== canonicalJson(after.foundation.platform)) { throw new Error('Stack switch must preserve the complete PIM and binding identities'); }
	return {
		version: 1, from: `${from.profile.id}@${from.profile.revision}`, to: `${to.profile.id}@${to.profile.revision}`, pimRevision: await modelDigest(canonicalJson(strip(before))),
		implementation: 'Same owned ESM emitters and bounded reverse grammar; custom text preserved and excluded from execution.',
		dependencies: `Runtime ${to.toolchain.runtime} ${to.toolchain.version}; no project runner dependencies; isolated broker adapter nats 2.29.3 / JetStream 2.11.9 unchanged.`,
		storage: 'Quiescent snapshot-v1 and local ledger JSON format unchanged. Stop/drain all writers; back up files; verify exact semantic program digest on restore. No DB or live-data migration is performed by publication.',
		tests: 'Rerun all derived checks and the unchanged independent business criteria under the target runtime before publication.',
		deployment: 'Manual runtime installation and service restart only after verified checkpoint restore. No provisioning, broker rewrite or automatic deployment.',
		recovery: 'Keep the source runtime and exact checkpoint/ledger backup. Stop/drain target before restoring original files and runtime; undo code publication separately. Never rewind a live ledger after new effects.'
	};
}

export interface CheckpointTransfer {
	version: 1; execution: 'offline-only'; sourceHash: string; targetHash: string;
	plan: ModelStackPlan; checkpoint: StateSnapshot;
}

/** Explicit offline copy; caller must stop/drain writers and retain source bytes. No live store is mutated. */
export async function transferModelCheckpoint(before: SemanticModelV4, after: SemanticModelV4, snapshot: StateSnapshot): Promise<CheckpointTransfer> {
	const plan = await modelStackPlan(before, after);
	const source = compileModelStateMachine(before, snapshot.machineId), target = compileModelStateMachine(after, snapshot.machineId);
	if (canonicalJson(source) !== canonicalJson(target)) { throw new Error('Checkpoint transfer requires an unchanged semantic program'); }
	const sourceHash = await modelDigest(canonicalJson(snapshot));
	// Restore validates exact keys, program digest, contracts, delivery IDs/payloads, state and sequence.
	const instance = await executeStateProgram(target, snapshot.input, snapshot.instanceId, {}, structuredClone(snapshot));
	try {
		await instance.settle();
		const checkpoint = instance.checkpoint(), targetHash = await modelDigest(canonicalJson(checkpoint));
		if (sourceHash !== targetHash || instance.inspect().trace.length) { throw new Error('Checkpoint transfer must not replay actions or change data'); }
		return { version: 1, execution: 'offline-only', sourceHash, targetHash, plan, checkpoint };
	} finally { await instance.dispose(); }
}
