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
import type { CodeDiagramExploration } from '../../common/codeBridge.js';

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
		const project = Object.assign(new (mock<AdeProjectService>())(), { model, modelUri: URI.parse(f.review.modelUri), section: 'home', selectedId: '', diagnostics: [], onDidChange: Event.None, restore: async () => {} });
		const ai = Object.assign(new (mock<IAdeAiService>())(), {
			available: true, onDidChange: changed.event, diagramReview: undefined as AdeDiagramReview | undefined,
			diagramExploration: { ...(projectWorkflow ? { workflow: 'project' as const, batch: { blockers: [] } } : {}), sessionId: 'session', model: 'test', proposals: [f.review.proposal], plan: f.review.plan, tasks: f.review.tasks ?? [], usage: { toolCalls: 1, readBytes: 100, modelTurns: [], turnsObservable: false, inputTokens: null, outputTokens: null }, budget: { maxToolCalls: 80, maxReadBytes: 1048576, maxDurationMs: 1800000, maxModelTurns: 8 } } as CodeDiagramExploration,
			refreshConnection: async () => {},
			reviewDiagramProposal: async () => { ai.diagramReview = f.review; changed.fire(); },
			applyDiagramReview: async () => { f.called.push('apply'); },
			closeDiagramReview: () => { ai.diagramReview = undefined; changed.fire(); }
		});
		instantiation.stub(IAdeProjectService, project);
		instantiation.stub(IAdeAiService, ai);
		const code = Object.assign(new (mock<IAdeCodeService>())(), { onDidChange: Event.None, context: { diagramState: 'index' } });
		instantiation.stub(IAdeCodeService, code);
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
		button('Project Settings').click();
		assert.ok(root.textContent?.includes('Open and Save'));
		assert.equal(root.querySelector('.ade-tools'), null, 'settings do not duplicate document status');
		editor.showWorkspace(); assert.ok(button(reviewLabel), 'explicit diagram navigation returns from project settings');
		button('AI Settings').click();
		assert.deepStrictEqual([...root.querySelectorAll('.ade-action-group h2')].map(node => node.textContent), ['Account and Model', 'AI Requests', 'Diagram Generation']);
		assert.ok(button('Configure AI Request Budget'));
		editor.showWorkspace();
		assert.ok(button(reviewLabel), 'returning to the workspace preserves the saved review');

		// Applying the saved review must leave the diagram usable, including after reopening the editor.
		model.id = 'semantic:imported';
		model.semantics.elements.push({ id: 'api', name: 'HTTP API', kind: 'component' });
		const view = { ...f.review.proposal.views[0], nodes: [{ elementId: 'api', x: 0, y: 0 }] };
		model.views.push(view);
		Object.assign(project, { section: 'diagram', activeView: view });
		code.context.diagramState = 'diagrams';
		const exploration = ai.diagramExploration;
		const apply = () => { for (const proposal of exploration.proposals) { proposal.status = 'applied'; } for (const task of exploration.tasks) { task.status = 'applied'; } };
		apply(); changed.fire();
		const assertAppliedCanvas = () => {
			assert.ok(root.querySelector('.ade-canvas-mode .ade-node'), 'the applied diagram remains on the canvas');
			assert.equal(root.querySelector('.ade-workflow, .ade-floating-workflow'), null, 'generation history never overlays the diagram');
			assert.equal(root.querySelector('.ade-floating-menu .ade-primary-action'), null, 'applied work does not request more generation');
			assert.equal(button('Continue Exploration'), undefined); assert.equal(button('Continue Generation'), undefined);
			assert.ok(button('Code'), 'code workflows have their own destination');
		};
		assertAppliedCanvas();
		button('Code').click();
		assert.ok(root.textContent?.includes('All Diagram Changes Applied'));
		assert.equal(button('Review All Changes'), undefined, 'a completed review does not leave a disabled review action');
		if (projectWorkflow) {
			const plan = [...root.querySelectorAll('details')].find(details => details.querySelector('summary')?.textContent === 'Diagram Plan')!;
			assert.equal(plan.open, false); plan.open = true;
			assert.ok(plan.textContent?.includes('Overview · Structure · Applied'));
		}
		editor.showWorkspace(); assertAppliedCanvas();
		Object.assign(code, { changed: true }); changed.fire(); button('Code').click();
		assert.ok(button('Update Diagrams').classList.contains('ade-primary-action'), 'source changes have a specific action');
		Object.assign(code, { changed: false });
		exploration.proposals[0].status = 'invalid';
		if (projectWorkflow) { exploration.batch!.blockers = ['invalidDraft:draft']; exploration.tasks[0].status = 'running'; }
		changed.fire();
		assert.ok(button(projectWorkflow ? 'Continue Generation' : 'Continue Exploration').classList.contains('ade-primary-action'));
		editor.showWorkspace(); assert.equal(root.querySelector('.ade-workflow'), null, 'unfinished work also keeps the canvas clear');
		exploration.proposals[0].status = 'ready';
		if (projectWorkflow) { exploration.batch!.blockers = []; exploration.tasks[0].status = 'ready'; }
		changed.fire(); button('Code').click();
		assert.ok(button(reviewLabel).classList.contains('ade-primary-action'), 'prepared drafts lead directly to review');
		apply(); editor.dispose(); root.textContent = '';
		const restored = store.add(instantiation.createInstance(AdeEditor, Object.assign(new (mock<IEditorGroup>())(), { id: 1, windowId: 1 })));
		restored.create(root); assertAppliedCanvas();
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

	test('nested source-staleness failures show one readable reason without evidence identifiers', () => {
		const f = fixture();
		f.review.problem = 'projectNotReady:staleEvidence:evidence:opaque-hash';
		f.review.proposal.status = 'invalid';
		f.review.proposal.diagnostics = [{ code: 'contract', path: '/review', args: ['staleEvidence:evidence:opaque-hash'] }];
		f.render();
		const alert = root.querySelector('[role="alert"]')!;
		assert.strictEqual(alert.querySelectorAll('li').length, 1);
		assert.ok(alert.textContent?.includes('Source Files Changed After Analysis'));
		assert.ok(!alert.textContent?.includes('opaque-hash'));
		assert.ok(!alert.textContent?.includes('projectNotReady'));
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
