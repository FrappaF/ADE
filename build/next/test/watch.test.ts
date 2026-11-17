/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { watchBuild } from '../watch.ts';

test('rebuilds a source changed after its initial read without another event or concurrent builds', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'ade-watch-'));
	try {
		const source = join(directory, 'input.ts');
		const output = join(directory, 'output.js');
		await writeFile(source, 'before');
		let emit: (file: string) => void = () => assert.fail('watcher was not subscribed');
		let releaseBuild!: () => void;
		const buildBlocked = new Promise<void>(resolve => releaseBuild = resolve);
		let initialRead!: () => void;
		const didRead = new Promise<void>(resolve => initialRead = resolve);
		let initializing = true;
		const pending = new Set<string>();
		const rebuilt: string[] = [];
		const watching = watchBuild<string>(listener => emit = listener, async () => {
			await writeFile(output, await readFile(source));
			initialRead();
			await buildBlocked;
			initializing = false;
		}, file => pending.add(file), async () => {
			assert.ok(!initializing, 'incremental build overlapped initialization');
			for (const file of pending) {
				rebuilt.push(file);
				await writeFile(output, await readFile(file));
			}
			pending.clear();
		});
		await didRead;
		await writeFile(source, 'after');
		emit(source);
		// Longer than the normal debounce: initialization must still own all output.
		await new Promise(resolve => setTimeout(resolve, 250));
		const duringBuild = await readFile(output, 'utf8');
		releaseBuild();
		await watching;
		assert.deepStrictEqual({ duringBuild, output: await readFile(output, 'utf8'), rebuilt }, { duringBuild: 'before', output: 'after', rebuilt: [source] });
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test('continues rebuilding after an initial build failure and debounces later events', async () => {
	let emit!: (change: string) => void;
	const pending = new Set<string>();
	const batches: string[][] = [];
	let laterRebuild!: () => void;
	const rebuilt = new Promise<void>(resolve => laterRebuild = resolve);
	await assert.rejects(watchBuild<string>(listener => emit = listener, async () => {
		emit('during');
		throw new Error('initial build failed');
	}, change => pending.add(change), async () => {
		batches.push([...pending]);
		pending.clear();
		if (batches.length === 2) {
			laterRebuild();
		}
	}), /initial build failed/);
	emit('later');
	emit('later');
	await rebuilt;
	assert.deepStrictEqual(batches, [['during'], ['later']]);
});
