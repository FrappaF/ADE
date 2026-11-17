/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { type ThemeIcon } from '../../../../../base/common/themables.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { AdeCanvasController } from '../../browser/adeCanvasController.js';
import { AdeCanvasSurface } from '../../browser/adeCanvasSurface.js';
import { AdeControls } from '../../browser/adeControls.js';
import { type AdeEditingContext } from '../../browser/adeEditingContext.js';
import { runAdeSpecificationCommand } from '../../browser/adeEditingSpecification.js';
import { AdeProjectService } from '../../browser/adeProjectService.js';
import { applyVisualEdit } from '../../common/visualEditing.js';
import { type VisualEdit } from '../../common/visualEditTypes.js';
import { blueprintFixture } from '../common/blueprintFixture.js';

suite('A.D.E blueprint diagram controls', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let root: HTMLElement;
	setup(() => { root = dom.append(document.body, dom.$('section')); });
	teardown(() => root.remove());

	const page = (title: string): Promise<void> => {
		const ready = () => root.querySelector('h3')?.textContent === title;
		if (ready()) { return Promise.resolve(); }
		return new Promise(resolve => {
			const observer = new MutationObserver(() => { if (ready()) { observer.disconnect(); resolve(); } });
			store.add(toDisposable(() => observer.disconnect()));
			observer.observe(root, { subtree: true, childList: true, characterData: true });
		});
	};
	const button = (label: string) => {
		const button = [...root.querySelectorAll('button')].find(button => (button.getAttribute('aria-label') ?? button.textContent) === label);
		assert.ok(button, `Missing button: ${label}`); button.click();
	};
	const select = (label: string) => {
		const row = [...root.querySelectorAll('label')].find(row => row.querySelector('strong')?.textContent === label);
		assert.ok(row, `Missing option: ${label}`); row.click();
	};
	const next = async (title: string) => { button('Next'); await page(title); };

	function fixture() {
		const model = structuredClone(blueprintFixture);
		const project = Object.assign(new (mock<AdeProjectService>())(), { model, activeView: model.views[2], selectedId: 'component.checkout', section: 'diagram', editable: true });
		const controls = store.add(new AdeControls());
		const canvas = store.add(new AdeCanvasController({ root }, controls, project, store.add(new InMemoryStorageService())));
		const commands: { command: string; args: (string | undefined)[] }[] = [];
		const commandService = Object.assign(new (mock<ICommandService>())(), { executeCommand: async (command: string, ...args: (string | undefined)[]) => { commands.push({ command, args }); } });
		const host = Object.assign(new (mock<ConstructorParameters<typeof AdeCanvasSurface>[0]>())(), {
			root,
			button: (parent: HTMLElement, label: string, action: () => void, id?: string) => controls.button(parent, label, action, id),
			iconButton: (parent: HTMLElement, label: string, _icon: ThemeIcon, action: () => void, id?: string) => controls.button(parent, label, action, id),
			paragraph: (parent: HTMLElement, text: string) => { dom.append(parent, dom.$('p')).textContent = text; }
		});
		const surface = new AdeCanvasSurface(host, canvas, controls, project, commandService, new (mock<IQuickInputService>())(), new (mock<IContextMenuService>())(), new (mock<INotificationService>())());
		return { surface, project, commands };
	}

	for (const presentation of ['canvas', 'toolbar'] as const) {
		test(`${presentation} exposes visibility and dependency editing for the current blueprint`, () => {
			const { surface, project, commands } = fixture();
			if (presentation === 'canvas') { surface.renderCanvasMenus(root, project.activeView!); } else { surface.renderEditingToolbar(root); }
			const buttons = [...root.querySelectorAll('button')].filter(button => ['Edit Visible Elements', 'Edit Context Dependencies'].includes(button.getAttribute('aria-label') ?? button.textContent!));
			for (const button of buttons) { button.click(); }
			assert.deepStrictEqual(commands, [{ command: 'ade.blueprint', args: [undefined, 'c4Visibility'] }, { command: 'ade.blueprint', args: [undefined, 'c4Dependencies'] }]);
		});
	}

	test('readonly blueprints and diagrams without a subject omit blueprint editing actions', () => {
		const { surface, project } = fixture();
		Object.assign(project, { editable: false }); surface.renderCanvasMenus(root, project.activeView!);
		Object.assign(project, { editable: true, activeView: { ...project.activeView!, subjectId: undefined } }); surface.renderEditingToolbar(root);
		assert.ok(!root.textContent?.includes('Edit Visible Elements') && !root.textContent?.includes('Edit Context Dependencies'));
	});

	test('creating a blueprint opens its new diagram after applying the edit', async () => {
		const { project } = fixture();
		const opened: string[] = [];
		Object.assign(project, { showDiagram: (id: string) => { assert.ok(project.model.views.some(view => view.id === id)); opened.push(id); } });
		const ui = Object.assign(new (mock<AdeEditingContext>())(), { project, container: root, edit: (edits: VisualEdit[]) => { project.model = edits.reduce((model, edit) => applyVisualEdit(model, edit) as typeof model, project.model); } });
		const result = runAdeSpecificationCommand(ui, 'blueprint', undefined, 'c4');
		await page('C4 View Subject and Context'); select('Create New'); await next('C4 Level');
		select('L3 · Components'); await next('View Subject'); select('API'); await next('View Name');
		root.querySelector<HTMLInputElement>('input[type="text"]')!.value = 'New Blueprint';
		await next('Context Dependencies (Outside the Subject)'); await next('Visible Elements'); await next('Review Your Blueprint Changes');
		assert.deepStrictEqual(opened, []); button('Apply Changes'); await result;
		assert.deepStrictEqual(opened.map(id => project.model.views.find(view => view.id === id)?.name), ['New Blueprint']);
	});

	for (const [mode, title] of [['c4Visibility', 'Visible Elements'], ['c4Dependencies', 'Context Dependencies (Outside the Subject)']] as const) {
		test(`${mode} opens the current diagram selection in the wizard and applies only after review`, async () => {
			const { project } = fixture(); const edits: VisualEdit[][] = [];
			const ui = Object.assign(new (mock<AdeEditingContext>())(), { project, container: root, edit: (batch: VisualEdit[]) => { edits.push(batch); } });
			const result = runAdeSpecificationCommand(ui, 'blueprint', undefined, mode);
			await page(title);
			assert.ok(root.querySelector('input[type="checkbox"]:checked'));
			await next('Review Your Blueprint Changes'); assert.strictEqual(edits.length, 0);
			button('Apply Changes'); await result;
			assert.strictEqual(edits[0]?.[0]?.kind, 'c4View');
		});
	}
});
