/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createCodeEngine } from '../nativeHost.ts';

const records = JSON.parse(await readFile(new URL('./fixtures/real-diagrams/todo-terra.json', import.meta.url), 'utf8'));
for (const record of records) {
	test(`recorded real ${record.model} output: ${record.case}`, async t => {
		const root = await mkdtemp(join(tmpdir(), 'ade-real-output-'));
		t.after(() => rm(root, { recursive: true, force: true }));
		for (const [file, source] of Object.entries(record.files)) { await mkdir(dirname(join(root, file)), { recursive: true }); await writeFile(join(root, file), source); }
		let calls = 0;
		const engine = createCodeEngine({ async complete(_config, prompt) {
			calls++;
			const context = JSON.parse(prompt.slice(prompt.indexOf('\n') + 1));
			assert.deepEqual(context.units.map(row => [row[0], context.files[row[1]].path, ...row.slice(2)]), record.inventory);
			return { value: structuredClone(record.response), usage: { inputTokens: null, outputTokens: null }, cost: null };
		} });
		const call = async request => JSON.parse(await engine.execute(JSON.stringify(request)));
		const initial = await call({ operation: 'import', root });
		const config = { version: 1, provider: 'codex', connection: 'cli', model: record.model, executable: 'codex', maxCalls: 1, timeoutMs: 180000, maxContextBytes: 262144 };
		const prepared = await call({ operation: 'diagramPrepare', snapshot: initial.snapshot, config: JSON.stringify(config) });
		const done = await call({ operation: 'diagramStep', snapshot: initial.snapshot, id: prepared.id, reviewId: prepared.reviewId });
		assert.equal(done.status, 'complete'); assert.equal(calls, 1);
		const model = JSON.parse(await readFile(done.context.model, 'utf8'));
		const domain = model.semantics.elements.filter(item => item.kind !== 'feature');
		assert.ok(domain.length >= 3 && domain.length <= 24);
		assert.ok(domain.some(item => item.kind === 'action') && domain.some(item => item.kind === 'resource'));
		const behavior = domain.filter(item => item.kind === 'action' || item.kind === 'controller').map(item => item.name + ' ' + item.description).join(' ');
		for (const operation of [/create|add/i, /complete|finish|done/i, /delete|remove|destroy/i, /list|view|show|retrieve/i]) { assert.match(behavior, operation); }
		assert.ok(model.views.every(view => view.nodes.length >= 2 && view.relationIds.length > 0));
		for (const [file, source] of Object.entries(record.files)) { assert.equal(await readFile(join(root, file), 'utf8'), source); }
	});
}
