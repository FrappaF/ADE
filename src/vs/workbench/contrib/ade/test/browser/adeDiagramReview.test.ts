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
		assert.deepStrictEqual([root.querySelector('details')!.open, !!root.querySelector('details .ade-draft-changes'), root.querySelector('figure')!.parentElement?.className], [false, true, 'ade-review-body']);
		for (const text of ['HTTP API', 'src/api.ts', 'complete coverage', 'Git', 'Other drafts remain available']) { assert.ok(root.textContent?.includes(text), text); }
		root.querySelector('button')!.click();
		assert.deepStrictEqual(f.called, ['apply']);
	});

	for (const projectWorkflow of [false, true]) {
	test(`${projectWorkflow ? 'Review All Changes' : 'Review Draft'} opens an actionable review from the imported project Home and returns to exploration`, () => {
		const f = fixture();
		const instantiation = workbenchInstantiationService(undefined, store);
		const changed = store.add(new Emitter<void>());
		const model: SemanticModel = { version: 3, id: 'code:imported', name: 'Imported Project', semantics: { elements: [], relations: [] }, views: [], codeMappings: [], verifications: [] };
		if (projectWorkflow) {
			f.review.projectReviewId = 'project-seal'; f.review.proposal.views.push({ ...f.review.proposal.views[0], id: 'details', name: 'Details' });
			f.review.plan = { revision: 'plan', items: f.review.proposal.views.map(view => ({ id: view.id, name: view.name, viewKind: view.kind, intent: 'Explain this scope', rationale: 'Relevant to the project', dependsOn: view.id === 'details' ? ['overview'] : [] })) };
			f.review.tasks = f.review.plan.items.map(item => ({ id: item.id, intent: item.intent, status: 'ready', gaps: [] }));
		}
		f.review.semanticRevision = canonicalJson(semanticContent(model));
		const project = Object.assign(new (mock<AdeProjectService>())(), { model, modelUri: URI.parse(f.review.modelUri), section: 'home', selectedId: '', onDidChange: Event.None, restore: async () => {} });
		const ai = Object.assign(new (mock<IAdeAiService>())(), {
			available: true, onDidChange: changed.event, diagramReview: undefined as AdeDiagramReview | undefined,
			diagramExploration: { ...(projectWorkflow ? { workflow: 'project' as const, batch: { blockers: [] } } : {}), sessionId: 'session', model: 'test', proposals: [f.review.proposal], plan: f.review.plan, tasks: f.review.tasks ?? [], usage: { toolCalls: 1, readBytes: 100, modelTurns: [], turnsObservable: false, inputTokens: null, outputTokens: null }, budget: { maxToolCalls: 80, maxReadBytes: 1048576, maxDurationMs: 1800000, maxModelTurns: 8 } },
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
		const reviewLabel = projectWorkflow ? 'Review All Changes' : 'Review Draft', applyLabel = projectWorkflow ? 'Apply All Changes' : 'Apply to Project';
		if (projectWorkflow) { assert.equal(button('Review Draft'), undefined); assert.ok(root.textContent?.includes('Diagram Plan')); }
		button(reviewLabel).click();
		assert.ok(root.querySelector('.ade-review-mode'), 'the ready review must replace the import landing page');
		assert.equal(button(applyLabel).disabled, false);
		assert.equal(root.querySelectorAll('figure.ade-review-preview').length, projectWorkflow ? 2 : 1);
		assert.ok(editor.describeCurrentContext().includes('Overview'));
		assert.deepStrictEqual(f.called, []);
		button(applyLabel).click();
		assert.deepStrictEqual(f.called, ['apply']);
		button('Return to Exploration').click();
		assert.deepStrictEqual([!!button(reviewLabel), project.section, project.model], [true, 'home', model]);
		button('Project').click();
		assert.deepStrictEqual([...root.querySelectorAll('.ade-action-group h2')].map(node => node.textContent), ['Open and Save', 'Explore and Review']);
		assert.equal(root.querySelector('.ade-tools details'), null, 'project actions no longer occupy the footer');
		editor.showWorkspace(); assert.ok(button(reviewLabel), 'explicit diagram navigation returns from the settings tabs');
		button('AI Settings').click();
		assert.deepStrictEqual([...root.querySelectorAll('.ade-action-group h2')].map(node => node.textContent), ['Account and Model', 'Diagram Generation']);
		root.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
		assert.ok(button(reviewLabel), 'the first tab returns to the existing diagram workflow');
	});

	}

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

	test('application blockers name the incomplete planned diagram beside the disabled button', () => {
		const f = fixture();
		f.review.projectReviewId = 'batch';
		f.review.plan = { revision: 'plan', items: [{ id: 'data', name: 'Todo Data Model', viewKind: 'structure', rationale: 'Persistence responsibilities', intent: 'Storage', dependsOn: [] }] };
		f.review.proposal.status = 'invalid'; f.review.proposal.diagnostics = [{ code: 'contract', path: '/project', args: ['plannedDiagramIncomplete:data'] }];
		f.render();
		const reason = root.querySelector('.ade-review-blockers')!;
		assert.deepStrictEqual([root.querySelector('button')!.disabled, reason.closest('details'), reason.textContent?.includes('Todo Data Model Is Not Ready'), root.querySelector('button')!.getAttribute('aria-describedby')], [true, null, true, reason.id]);
	});
});
