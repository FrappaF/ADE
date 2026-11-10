/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../scripts/source-loader.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
const { packDiagramEvidence } = await import('../../ai/diagramEvidence.ts');

const unit = (ref, start, text, file = 'source.custom') => ({ ref, id: ref, file, language: 'custom', name: ref, start, end: start + text.length, text });

test('shared fragments preserve the disclosed text once and never fill undisclosed gaps', () => {
	const packed = packDiagramEvidence([unit('u0', 0, 'abcdef'), unit('u1', 3, 'defghi'), unit('u2', 20, 'other'), unit('u3', 0, 'abcdef')]);
	assert.deepEqual(packed, { files: [{ path: 'source.custom', language: 'custom', fragments: [{ start: 0, text: 'abcdefghi' }, { start: 20, text: 'other' }] }], units: [['u0', 0, 1, 'u0', 0, 6], ['u1', 0, 1, 'u1', 3, 9], ['u2', 0, 1, 'u2', 20, 25], ['u3', 0, 1, 'u3', 0, 6]] });
});

test('compact evidence removes repeated paths and overlapping class/method bodies', () => {
	const path = 'application/domain/features/task_management/implementation/task_repository.custom';
	const source = Array.from({ length: 60 }, (_, index) => `task_${index} returns its task;\n`).join('');
	const units = [unit('u0', 0, source.slice(0, 1200), path), ...Array.from({ length: 60 }, (_, index) => { const start = source.indexOf(`task_${index} `); return unit('u' + (index + 1), start, source.slice(start, source.indexOf('\n', start) + 1), path); })];
	const packed = packDiagramEvidence(units);
	const before = Buffer.byteLength(JSON.stringify(units)), after = Buffer.byteLength(JSON.stringify(packed));
	assert.ok(after < before * 0.55, `${before} -> ${after} bytes`);
	assert.equal(packed.files[0].fragments[0].text, source);
	assert.equal(packed.units.length, units.length);
});

test('packing rejects inconsistent overlapping evidence instead of silently choosing a source version', () => {
	assert.throws(() => packDiagramEvidence([unit('u0', 0, 'abc'), unit('u1', 1, 'XX')]), /Conflicting/);
});
