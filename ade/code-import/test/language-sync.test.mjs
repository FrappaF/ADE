/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { samples } from './samples.mjs';
import { importCode } from '../importCode.ts';
import { prepareSync } from '../syncCode.ts';

test('contract, confirmed rename and deletion retain unchanged syntax in every declared language', async t => {
	for (const [language, file, source] of samples) {
		await t.test(language, async t => {
			const root = await mkdtemp(join(tmpdir(), 'ade-language-sync-'));
			t.after(() => rm(root, { recursive: true, force: true }));
			await writeFile(join(root, file), source);
			await writeFile(join(root, 'steady.py'), 'def steady():\n    return 1\n');
			await writeFile(join(root, 'obsolete.py'), 'def obsolete():\n    return 0\n');
			const initial = await importCode(root, `language:${language}`);
			const declaration = initial.files.find(item => item.file === file).declarations.find(item => item.kind === 'action');
			assert.ok(declaration, language);
			const contract = source.slice(0, declaration.evidence.start) + source.slice(declaration.evidence.start).replace('(', '( ');
			await writeFile(join(root, file), contract);
			const changed = await importCode(root, initial.projectId, { previous: initial });
			assert.equal(changed.files.find(item => item.file === file).status, 'parsed');
			assert.notEqual(changed.files.find(item => item.file === file).declarations.find(item => item.id === declaration.id).header, declaration.header);
			assert.equal(prepareSync(initial, initial.model, changed).report.conflicts.length, 0);
			const currentName = changed.files.find(item => item.file === file).declarations.find(item => item.id === declaration.id).nameEvidence;
			await writeFile(join(root, file), contract.slice(0, currentName.start) + 'Renamed' + contract.slice(currentName.end));
			await rm(join(root, 'obsolete.py'));
			const unconfirmed = await importCode(root, initial.projectId, { previous: changed });
			const target = unconfirmed.files.find(item => item.file === file).declarations.find(item => item.name === 'Renamed');
			const renamed = await importCode(root, initial.projectId, { previous: changed, renameHints: [{ fromId: declaration.id, toSourceId: target.sourceId }] });
			const prepared = prepareSync(changed, changed.model, renamed);
			assert.deepEqual(prepared.report.conflicts, []);
			assert.deepEqual(renamed.analysis.parsed, [file]);
			assert.deepEqual(renamed.analysis.reused, ['steady.py']);
			assert.ok(prepared.model.semantics.elements.some(item => item.id === declaration.id && item.name === 'Renamed'));
			assert.deepEqual(prepared.report.files.removed, ['obsolete.py']);
		});
	}
});
