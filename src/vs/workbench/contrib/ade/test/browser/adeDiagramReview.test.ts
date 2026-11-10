/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AdeControls } from '../../browser/adeControls.js';
import type { AdeDiagramReview } from '../../browser/adeAiService.js';
import { renderAdeDiagramReview } from '../../browser/adeDiagramReview.js';

suite('A.D.E imported diagram review', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let root: HTMLElement;
	setup(() => { root = dom.append(document.body, dom.$('section.ade-shell')); });
	teardown(() => root.remove());

	function fixture() {
		const called: string[] = [];
		const review: AdeDiagramReview = { id: 'draft', sessionId: 'session', root: '/project', modelUri: 'file:///project/model.json', semanticRevision: 'revision', proposal: { id: 'draft', status: 'ready', diagnostics: [], views: [{ id: 'overview', name: 'Overview', kind: 'structure', nodes: [], relationIds: [] }] }, changes: [{ collection: 'elements', id: 'api', before: null, after: { name: 'HTTP API' } }], sources: [{ file: 'src/api.ts', revision: 'revision', start: 0, end: 40 }], images: [], contents: '{}' };
		const actions = { busy: false, current: true, apply: () => called.push('apply'), refresh: () => called.push('refresh'), close: () => called.push('close'), technical: () => called.push('technical') };
		const controls = store.add(new AdeControls());
		const render = () => controls.render(root, () => { root.textContent = ''; renderAdeDiagramReview(root, review, controls, actions); });
		return { review, actions, called, render };
	}

	test('one surface explains local effects, evidence and limits before explicit application', () => {
		const f = fixture(); f.render();
		assert.deepStrictEqual(f.called, []);
		for (const text of ['HTTP API', 'src/api.ts', 'complete coverage', 'Git', 'Other drafts remain available']) { assert.ok(root.textContent?.includes(text), text); }
		root.querySelector('button')!.click();
		assert.deepStrictEqual(f.called, ['apply']);
	});

	test('invalid or stale drafts cannot apply and their review remains consultable', () => {
		const f = fixture();
		for (const state of ['invalid', 'stale', 'problem'] as const) {
			f.review.proposal.status = state === 'invalid' ? 'invalid' : 'ready';
			f.actions.current = state !== 'stale'; f.review.problem = state === 'problem' ? 'staleEvidenceRevision' : undefined;
			f.render(); root.querySelector('button')!.click();
			assert.deepStrictEqual([root.querySelector('button')!.disabled, f.called, !!root.querySelector('[role="alert"]'), root.querySelector('details')!.open], [true, [], true, false]);
		}
	});

	test('hostile review labels remain text; busy operations disable mutation and refresh', () => {
		const f = fixture(); f.review.changes[0].after!.name = '<script>bad()</script>'; f.actions.busy = true; f.render();
		assert.deepStrictEqual([root.querySelector('script'), [...root.querySelectorAll('button')].every(button => button.disabled)], [null, true]);
	});
});
