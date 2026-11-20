import '../../scripts/source-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { runtimeSource } from '../runtimeSource.ts';
import { interactionInterpreterSource } from '../../../src/vs/workbench/contrib/ordito/common/interactionRuntime.generated.ts';
import { stateInterpreterSource } from '../../../src/vs/workbench/contrib/ordito/common/stateRuntime.generated.ts';
import { messagingInterpreterSource } from '../../../src/vs/workbench/contrib/ordito/common/messagingRuntime.generated.ts';
const { legacyInteractionInterpreterSource } = await import('../../../src/vs/workbench/contrib/ordito/common/interactionRuntime.legacy.ts');

test('runtime generation selects named declarations independently of surrounding helpers and comments', async () => {
	const first = 'function ignored() { throw new Error(); }\n/** Original comment. */\nexport function run(value: number): number { return twice(value); }\nfunction twice(value: number) { return value * 2; }';
	const second = 'function twice(value: number) { return value * 2; }\n// Renamed section, unrelated helper moved.\nexport function run(value: number): number { return twice(value); }';
	const names = ['twice', 'run'];
	const source = runtimeSource(first, names);
	assert.equal(source, runtimeSource(second, names));
	const module = await import('data:text/javascript,' + encodeURIComponent(source + '\nexport { run };'));
	assert.equal(module.run(3), 6);
});

test('runtime generation rejects missing or ambiguous declarations', () => {
	assert.throws(() => runtimeSource('function other() {}', ['run']), /Missing runtime declaration: run/);
	assert.throws(() => runtimeSource('function run() {}\nfunction run() {}', ['run']), /Duplicate runtime declaration: run/);
});

test('supported interpreter revisions preserve their emitted bytes', () => {
	const sources = { interaction: interactionInterpreterSource, legacyInteraction: legacyInteractionInterpreterSource, state: stateInterpreterSource, messaging: messagingInterpreterSource };
	assert.deepEqual(Object.fromEntries(Object.entries(sources).map(([name, source]) => [name, createHash('sha256').update(source).digest('hex')])), {
		interaction: 'cb5bbef62dd5cabc70a559f289f08781a1d344e1df288f0af405c7c721c8e01c',
		legacyInteraction: '69729a27c028080979455dc696805acb6ed00d571ab704189092e22127c65608',
		state: '21e1d0259009a518ea2eeb7fd69a20a222b61231a6340566bde83558ef01ba36',
		messaging: 'd788e919dd3d146b99ff51ea2664b23e70b04573533f113b3cdb43c4e524684b'
	});
});

function legacyRegion(region: string): string {
	assert.ok(region.includes(interactionInterpreterSource));
	return region.replace(interactionInterpreterSource, () => legacyInteractionInterpreterSource)
		.replace(/^\/\/ <(\/?)ordito:/gm, '// <$1ade:');
}

test('reverse accepts edited data in a legacy interaction region and checks the entire body', async () => {
	const { checkoutInteractions } = await import('../../test/fixtures/dai-interactions.mjs');
	const { interactionRegion, readInteractionRegion, reverseModelInteraction } = await import('../../../src/vs/workbench/contrib/ordito/common/interactionRuntime.ts');
	const changed = structuredClone(checkoutInteractions);
	changed.foundation.occurrences[0].execution.timeoutMs = 45;
	const id = 'interaction.checkout';
	const region = legacyRegion(interactionRegion(changed, id));
	assert.equal(readInteractionRegion('// authored wrapper\n' + region).region, region);
	assert.deepEqual(reverseModelInteraction(checkoutInteractions, id, region), changed);
	const tampered = region.replace("setTimeout(()=>done('timeout'), execution.timeoutMs)", "setTimeout(()=>done('timeout'), 1)");
	assert.notEqual(tampered, region);
	assert.throws(() => reverseModelInteraction(checkoutInteractions, id, tampered), /unsupported body/);
});

test('reverse accepts edited data in a legacy state region and checks the entire body', async () => {
	const { checkoutStates } = await import('../../test/fixtures/dai-states.mjs');
	const { stateMachineRegion, readStateMachineRegion, reverseModelStateMachine } = await import('../../../src/vs/workbench/contrib/ordito/common/stateRuntime.ts');
	const changed = structuredClone(checkoutStates);
	changed.foundation.stateMachines[0].transitions[0].priority = 2;
	const id = 'checkout.lifecycle';
	const region = legacyRegion(stateMachineRegion(changed, id));
	assert.equal(readStateMachineRegion(region + '// authored tail\n').region, region);
	assert.deepEqual(reverseModelStateMachine(checkoutStates, id, region), changed);
	const tampered = region.replace("setTimeout(()=>done('timeout'), execution.timeoutMs)", "setTimeout(()=>done('timeout'), 1)");
	assert.notEqual(tampered, region);
	assert.throws(() => reverseModelStateMachine(checkoutStates, id, tampered), /unsupported runtime/);
});
