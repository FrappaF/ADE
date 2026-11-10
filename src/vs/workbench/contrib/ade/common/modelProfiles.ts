/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type GenerationProfile } from './modelReadiness.js';
import { canonicalJson, modelDigest } from './modelSerialization.js';
import { type SemanticModelV4 } from './modelTypes.js';

export interface ModelArchetype {
	version: 1;
	profile: GenerationProfile;
	toolchain: { runtime: string; version: string; language: string; framework: 'none' };
	capabilities: { structuralContext: boolean; predicates: boolean; create: boolean; analyze: boolean; forward: boolean; reverse: boolean; test: boolean; states: boolean; frames: boolean; async: boolean; migrations: boolean };
	scope: string;
	mapping: { primitives: Record<string, string>; errors: string; modules: string; sources: string; tests: string; dependencies: { name: string; version: string }[]; persistence: 'quiescent-snapshot-v1'; messaging?: { broker: string; version: string; client: string; clientVersion: string; execution: string }; concurrency: 'pure-synchronous' | 'local-structured-concurrency' };
	runner: { executable: 'node' | 'bun'; arguments: string[]; shell: false; network: false; authority: 'profile-owned' };
}

const nodeEsm: ModelArchetype = {
	version: 1,
	profile: { id: 'node.esm', revision: '5', archetype: 'node-esm-structural-v1', elementKinds: ['feature', 'actor', 'system', 'container', 'component', 'contract', 'interface', 'package', 'entity', 'class', 'state'], primitiveTypes: ['string', 'integer', 'boolean'], technologies: ['node-esm', 'nats-jetstream'], requiredTechnologyKinds: ['container'], requiredOwnershipKinds: ['container', 'component', 'contract', 'interface', 'class'], structuredInteractions: true, flatStates: true, messaging: true, interactionContractsOnly: true, runtimeKinds: ['application', 'service', 'messaging'] },
	toolchain: { runtime: 'node', version: '24.22.1', language: 'ECMAScript modules', framework: 'none' },
	capabilities: { structuralContext: true, predicates: true, create: true, analyze: true, forward: true, reverse: true, test: true, states: true, frames: true, async: true, migrations: false },
	scope: 'Pure predicates, flat state machines with serialized events and quiescent checkpoints, and versioned structured interactions with alt/opt/loop/par/critical/ref. Calls use typed scripted data adapters; no arbitrary operation code or DB. Explicit NATS JetStream 2.11.9 topology uses the isolated local broker adapter and pinned client 2.29.3; the project runner verifies configuration/simulation only. Reverse verifies the complete emitted runtime and existing data-plan identities. Checkpoints are caller-persisted data; no live service-state transaction. Custom project code stays outside execution.',
	mapping: { primitives: { string: 'string', integer: 'number (safe integer)', boolean: 'boolean' }, errors: 'Declared tagged result: {ok:false,error:{code,details}}; no implicit exception/retry mapping.', modules: 'One nondeployable ESM package per declared library; imports require an explicit dependency.', sources: 'src/<tool-assigned-id>.mjs', tests: 'test/<tool-assigned-id>.test.mjs', dependencies: [], messaging: { broker: 'nats-jetstream', version: '2.11.9', client: 'nats', clientVersion: '2.29.3', execution: 'explicit-isolated-local-adapter; no broker execution in project runner' }, persistence: 'quiescent-snapshot-v1', concurrency: 'local-structured-concurrency' },
	runner: { executable: 'node', arguments: ['--test'], shell: false, network: false, authority: 'profile-owned' }
};

/** A separate runtime and runner; executable semantics are intentionally shared. */
const bunEsm: ModelArchetype = {
	...structuredClone(nodeEsm),
	profile: { ...structuredClone(nodeEsm.profile), id: 'bun.esm', revision: '1', archetype: 'bun-esm-structural-v1', technologies: ['bun-esm', 'nats-jetstream'] },
	toolchain: { runtime: 'bun', version: '1.3.2', language: 'ECMAScript modules', framework: 'none' },
	runner: { executable: 'bun', arguments: ['test'], shell: false, network: false, authority: 'profile-owned' }
};

/** Resolve one explicit runtime for the bounded project job. Mixed/unknown bindings never pick a default. */
export function modelProjectProfile(model: SemanticModelV4): ModelArchetype {
	const containers = model.semantics.elements.filter(element => element.kind === 'container' && ['application', 'service'].includes(element.runtimeKind ?? ''));
	const profiles = containers.map(element => {
		const bindings = model.foundation.platform.bindings.filter(binding => binding.elementId === element.id);
		if (bindings.length !== 1) { throw new Error('One explicit runtime binding per application container required'); }
		resolveModelPlatform(model, element.id, bindings[0].profileId);
		return bindings[0].profileId;
	});
	if (!profiles.length || new Set(profiles).size !== 1) { throw new Error('Mixed project runtimes require separate jobs'); }
	const archetype = getModelArchetype(profiles[0]);
	for (const element of model.semantics.elements.filter(element => element.kind === 'container' && element.runtimeKind === 'messaging')) {
		if (model.foundation.platform.bindings.filter(binding => binding.elementId === element.id).length !== 1) { throw new Error('One explicit broker binding required'); }
		resolveModelPlatform(model, element.id, archetype.profile.id);
	}
	return archetype;
}

/** Return detached trusted descriptors. Serialized model/provider data cannot register capabilities. */
export function getModelArchetype(id: string): ModelArchetype {
	const archetype = [nodeEsm, bunEsm].find(entry => entry.profile.id === id);
	if (!archetype) { throw new Error('Unknown structural archetype'); }
	return structuredClone(archetype);
}

export async function modelArchetypeRevision(archetype: ModelArchetype): Promise<string> {
	if (canonicalJson(archetype) !== canonicalJson(getModelArchetype(archetype.profile.id))) { throw new Error('Untrusted or superseded archetype'); }
	return modelDigest(canonicalJson(archetype));
}

/** Capability gating describes actual adapters; productive scope is checked separately by assertPureProject. */
export function assertArchetypeCapability(id: string, capability: keyof ModelArchetype['capabilities'], runtimeVersion?: string): void {
	const archetype = getModelArchetype(id);
	if (!archetype.capabilities[capability]) { throw new Error(`Unsupported archetype capability: ${capability}`); }
	if (runtimeVersion !== undefined && runtimeVersion !== archetype.toolchain.version) { throw new Error('Archetype runtime version mismatch'); }
}

/** PSM can be resolved independently of the PIM; no mutation or implicit technology selection. */
export function resolveModelPlatform(model: SemanticModelV4, elementId: string, profileId: string): { technology: string; runtime: string; version: string; framework: string } {
	const archetype = getModelArchetype(profileId);
	const entries = model.foundation.platform.bindings.filter(binding => binding.elementId === elementId && binding.profileId === profileId);
	if (entries.length === 1 && entries[0].technology.state === 'known' && entries[0].technology.value === 'nats-jetstream' && model.semantics.elements.some(element => element.id === elementId && element.kind === 'container' && element.runtimeKind === 'messaging') && model.foundation.messaging?.some(topology => topology.brokers.some(broker => broker.elementId === elementId && broker.engine === 'nats-jetstream' && broker.version === '2.11.9'))) { return { technology: 'nats-jetstream', runtime: 'nats-server', version: '2.11.9', framework: 'JetStream' }; }
	if (entries.length !== 1 || entries[0].technology.state !== 'known' || entries[0].technology.value !== (profileId === 'bun.esm' ? 'bun-esm' : 'node-esm')) { throw new Error('Explicit supported platform binding required'); }
	return { technology: profileId === 'bun.esm' ? 'bun-esm' : 'node-esm', runtime: archetype.toolchain.runtime, version: archetype.toolchain.version, framework: archetype.toolchain.framework };
}
