import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { renderAdeCodeActions } from '../../browser/adeCodeActions.js';
import { AdeControls } from '../../browser/adeControls.js';
import { IAdeAiService } from '../../browser/adeAiService.js';
import { IAdeCodeService } from '../../browser/adeCodeService.js';
import { AdeProjectService } from '../../browser/adeProjectService.js';
import { AdeWorkflowContent } from '../../browser/adeWorkflowContent.js';
import { emptyFoundation } from '../../common/modelFoundation.js';

suite('A.D.E readable workflow and map', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let root: HTMLElement;
	setup(() => { root = dom.append(document.body, dom.$('section.ade-shell')); });
	teardown(() => root.remove());

	test('disabled code actions explain the requirement while project settings stays actionable', () => {
		const controls = store.add(new AdeControls());
		const calls: string[] = [];
		const action = (label: string, reason?: string) => ({ label, reason, run: () => { calls.push(label); } });
		renderAdeCodeActions(root, controls, { update: action('Update'), prepare: action('Prepare', 'Complete executable behavior'), continuity: action('Automatic'), continuityStatus: 'Off', recovery: [], settings: () => { calls.push('settings'); } });
		const prepare = [...root.querySelectorAll('button')].find(button => button.textContent === 'Prepare')!;
		prepare.click();
		controls.focusTarget('code-settings'); (document.activeElement as HTMLButtonElement).click();
		assert.deepStrictEqual({ disabled: prepare.disabled, reason: document.getElementById(prepare.getAttribute('aria-describedby')!)?.textContent, calls }, { disabled: true, reason: 'Complete executable behavior', calls: ['settings'] });
	});

	test('turning off AI keeps local preparation usable while AI code updates explain their restriction', () => {
		const controls = store.add(new AdeControls());
		const calls: string[] = [];
		const project = Object.assign(new (mock<AdeProjectService>())(), { editable: true, projectRoot: URI.file('/project'), model: { version: 4, id: 'system', name: 'System', semantics: { elements: [], relations: [] }, views: [], codeMappings: [], verifications: [], foundation: emptyFoundation() } });
		const ai = Object.assign(new (mock<IAdeAiService>())(), { available: true, busy: false, continuityStatus: 'Off', configureContinuity: async () => { calls.push('local-preparation'); } });
		const code = Object.assign(new (mock<IAdeCodeService>())(), { available: true, busy: false, context: { sourceRoot: '/source' }, inspect: async () => { calls.push('source-evidence'); } });
		const workflow = new AdeWorkflowContent({ root, paragraph: (parent, text) => { dom.append(parent, dom.$('p')).textContent = text; }, button: (parent, label, action, id) => controls.button(parent, label, action, id), documentStatus: () => '', showReview: () => {} }, controls, project, ai, new TestConfigurationService({ chat: { disableAIFeatures: true } }), new (mock<INotificationService>())(), code, new (mock<ICommandService>())());
		workflow.renderCodeActions(root, () => {});
		controls.focusTarget('code-continuity');
		(document.activeElement as HTMLButtonElement).click();
		controls.focusTarget('code-source:0');
		(document.activeElement as HTMLButtonElement).click();
		const update = [...root.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Update Codebase from Diagrams')!;
		assert.deepStrictEqual({ calls, aiDisabled: update.disabled, reason: document.getElementById(update.getAttribute('aria-describedby')!)?.textContent }, { calls: ['local-preparation', 'source-evidence'], aiDisabled: true, reason: 'AI Features Are Disabled in Settings.' });
	});

	test('the Code page keeps the next worktree action visible while architecture exploration exists', () => {
		const controls = store.add(new AdeControls());
		const calls: string[] = [];
		const project = Object.assign(new (mock<AdeProjectService>())(), { editable: true, projectRoot: URI.file('/project'), model: { version: 2, id: 'checkout', semantics: { elements: [] } } });
		const ai = Object.assign(new (mock<IAdeAiService>())(), {
			available: true, busy: false, canVerify: true, canApply: false, status: 'Changes Ready for Review', continuityStatus: 'Off',
			diagramExploration: { workflow: 'project', proposals: [], tasks: [], usage: { toolCalls: 0, readBytes: 0 }, budget: { maxToolCalls: 8, maxReadBytes: 16384 } },
			verify: async () => { calls.push('verify'); }, apply: async () => { calls.push('apply'); }
		});
		const code = Object.assign(new (mock<IAdeCodeService>())(), { available: true, busy: false, context: { sourceRoot: '/source' } });
		const workflow = new AdeWorkflowContent({ root, paragraph: (parent, text) => { dom.append(parent, dom.$('p')).textContent = text; }, button: (parent, label, action, id) => controls.button(parent, label, action, id), documentStatus: () => '', showReview: () => {} }, controls, project, ai, new TestConfigurationService(), new (mock<INotificationService>())(), code, new (mock<ICommandService>())());
		const clickWorktreeAction = (label: string) => {
			assert.strictEqual(root.querySelector('.ade-code-panel h2')?.textContent, 'Implementation Worktree');
			const buttons = [...root.querySelectorAll('button')].filter(button => button.textContent === label);
			assert.strictEqual(buttons.length, 1);
			buttons[0].click();
		};
		workflow.renderCodeActions(root, () => {});
		clickWorktreeAction('Run Tests');
		dom.clearNode(root);
		Object.assign(ai, { canApply: true, status: 'Tests Passed · Ready to Apply' });
		workflow.renderCodeActions(root, () => {});
		clickWorktreeAction('Apply Verified Changes');
		assert.deepStrictEqual(calls, ['verify', 'apply']);
	});
});
