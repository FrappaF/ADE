import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { runtimeSource } from '../runtimeSource.ts';
import { interactionInterpreterSource } from '../../../src/vs/workbench/contrib/ordito/common/interactionRuntime.generated.ts';
import { stateInterpreterSource } from '../../../src/vs/workbench/contrib/ordito/common/stateRuntime.generated.ts';
import { messagingInterpreterSource } from '../../../src/vs/workbench/contrib/ordito/common/messagingRuntime.generated.ts';

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

test('named extraction preserves the interpreter bytes used by existing project regions', () => {
	const sources = { interaction: interactionInterpreterSource, state: stateInterpreterSource, messaging: messagingInterpreterSource };
	assert.deepEqual(Object.fromEntries(Object.entries(sources).map(([name, source]) => [name, createHash('sha256').update(source).digest('hex')])), {
		interaction: '69729a27c028080979455dc696805acb6ed00d571ab704189092e22127c65608',
		state: '21e1d0259009a518ea2eeb7fd69a20a222b61231a6340566bde83558ef01ba36',
		messaging: 'd788e919dd3d146b99ff51ea2664b23e70b04573533f113b3cdb43c4e524684b'
	});
});
