/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AdeControls } from '../../browser/adeControls.js';
import { IAdeAiService, type AdeDiagramReview } from '../../browser/adeAiService.js';
import { renderAdeDiagramReview } from '../../browser/adeDiagramReview.js';
import { AdeEditor } from '../../browser/adeEditor.js';
import { IAdeProjectService, AdeProjectService } from '../../browser/adeProjectService.js';
import { IAdeCodeService } from '../../browser/adeCodeService.js';
import { type IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { type SemanticModel } from '../../common/modelTypes.js';
import { canonicalJson, semanticContent } from '../../common/modelSerialization.js';

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

	test('Review Draft opens an actionable review from the imported project Home and returns to exploration', () => {
		const f = fixture();
		const instantiation = workbenchInstantiationService(undefined, store);
		const changed = store.add(new Emitter<void>());
		const model: SemanticModel = { version: 3, id: 'code:imported', name: 'Imported Project', semantics: { elements: [], relations: [] }, views: [], codeMappings: [], verifications: [] };
		f.review.semanticRevision = canonicalJson(semanticContent(model));
		const project = Object.assign(new (mock<AdeProjectService>())(), { model, modelUri: URI.parse(f.review.modelUri), section: 'home', selectedId: '', onDidChange: Event.None, restore: async () => {} });
		const ai = Object.assign(new (mock<IAdeAiService>())(), {
			available: true, onDidChange: changed.event, diagramReview: undefined as AdeDiagramReview | undefined,
			diagramExploration: { sessionId: 'session', model: 'test', proposals: [f.review.proposal], tasks: [], usage: { toolCalls: 1, readBytes: 100, modelTurns: [], turnsObservable: false, inputTokens: null, outputTokens: null }, budget: { maxToolCalls: 80, maxReadBytes: 1048576, maxDurationMs: 1800000, maxModelTurns: 8 } },
			refreshConnection: async () => {},
			reviewDiagramProposal: async () => { ai.diagramReview = f.review; changed.fire(); },
			applyDiagramReview: async () => { f.called.push('apply'); },
			closeDiagramReview: () => { ai.diagramReview = undefined; changed.fire(); }
		});
		instantiation.stub(IAdeProjectService, project);
		instantiation.stub(IAdeAiService, ai);
		instantiation.stub(IAdeCodeService, Object.assign(new (mock<IAdeCodeService>())(), { onDidChange: Event.None, context: { diagramState: 'index' } }));
		const editor = store.add(instantiation.createInstance(AdeEditor, Object.assign(new (mock<IEditorGroup>())(), { id: 1, windowId: 1 })));
		editor.create(root);
		const button = (name: string) => [...root.querySelectorAll('button')].find(button => button.textContent === name)!;
		button('Review Draft').click();
		assert.ok(root.querySelector('.ade-review-mode'), 'the ready review must replace the import landing page');
		assert.equal(button('Apply to Project').disabled, false);
		assert.ok(editor.describeCurrentContext().includes('Source Evidence'));
		assert.deepStrictEqual(f.called, []);
		button('Apply to Project').click();
		assert.deepStrictEqual(f.called, ['apply']);
		button('Return to Exploration').click();
		assert.deepStrictEqual([!!button('Review Draft'), project.section, project.model], [true, 'home', model]);
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
