/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../scripts/source-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { importCode } = await import('../importCode.ts');

test('confirmed container rename preserves descendants; conflicting, stale and copy hints are rejected', async t => {
	const root = await mkdtemp(join(tmpdir(), 'ade-rename-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	await writeFile(join(root, 'a.ts'), 'export class Before { method() {} }');
	const before = await importCode(root, 'rename');
	const old = before.files[0].declarations.find(item => item.name === 'Before');
	const child = before.files[0].declarations.find(item => item.name === 'method');
	await writeFile(join(root, 'a.ts'), 'export class After { method() {} }');
	const unconfirmed = await importCode(root, 'rename', { previous: before });
	const target = unconfirmed.files[0].declarations.find(item => item.name === 'After');
	const hint = { fromId: old.id, toSourceId: target.sourceId };
	const after = await importCode(root, 'rename', { previous: before, renameHints: [hint] });
	assert.ok(after.files[0].declarations.some(item => item.name === 'After' && item.id === old.id));
	assert.ok(after.files[0].declarations.some(item => item.id === child.id && item.parentId === old.id));
	await writeFile(join(root, 'a.ts'), 'export class After { method(): number { return 1; } }');
	const again = await importCode(root, 'rename', { previous: after });
	assert.ok(again.files[0].declarations.some(item => item.id === child.id));
	await assert.rejects(importCode(root, 'rename', { previous: before, renameHints: [hint, hint] }), /stale, ambiguous/);
	await assert.rejects(importCode(root, 'rename', { previous: before, renameHints: [{ ...hint, toSourceId: 'missing' }] }), /stale, ambiguous/);
	await writeFile(join(root, 'original.ts'), 'export class Before { method() {} }');
	// The old symbol still exists in its original path: a copy cannot claim its identity.
	await writeFile(join(root, 'a.ts'), 'export class Before { method() {} } export class After { method() {} }');
	await assert.rejects(importCode(root, 'rename', { previous: before, renameHints: [hint] }), /stale, ambiguous/);
});
