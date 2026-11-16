/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { AdeView } from '../../browser/adeView.js';
import { IAdeProjectService, AdeProjectService } from '../../browser/adeProjectService.js';
import { IAdeAiService } from '../../browser/adeAiService.js';
import { IAdeCodeService } from '../../browser/adeCodeService.js';
import { type SemanticModel } from '../../common/modelTypes.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { ViewContainerLocation, IViewDescriptorService, type IViewContainerModel, type ViewContainer } from '../../../../common/views.js';
import { type IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';

suite('A.D.E sidebar project shortcuts', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let root: HTMLElement;
	setup(() => { root = dom.append(document.body, dom.$('section')); });
	teardown(() => root.remove());

	function fixture(linked = true) {
		const configuration = new TestConfigurationService();
		const instantiation = workbenchInstantiationService({ configurationService: () => configuration }, store);
		const changed = store.add(new Emitter<void>()), aiChanged = store.add(new Emitter<void>()), codeChanged = store.add(new Emitter<void>());
		const model: SemanticModel = { version: 3, id: 'project', name: 'ecommerce-ade', semantics: { elements: [], relations: [] }, views: [], codeMappings: [], verifications: [] };
		const project = Object.assign(new (mock<AdeProjectService>())(), { model, modelUri: URI.file('/project/model.ade.json'), projectRoot: URI.file('/project'), editable: true, section: 'home', onDidChange: changed.event, restore: async () => {} });
		const ai = Object.assign(new (mock<IAdeAiService>())(), { available: true, busy: false, onDidChange: aiChanged.event });
		const code = Object.assign(new (mock<IAdeCodeService>())(), { available: true, busy: false, context: linked ? { sourceRoot: '/project' } : undefined, onDidChange: codeChanged.event });
		const commands: string[] = [];
		instantiation.stub(IAdeProjectService, project); instantiation.stub(IAdeAiService, ai); instantiation.stub(IAdeCodeService, code);
		instantiation.stub(ICommandService, { onWillExecuteCommand: Event.None, onDidExecuteCommand: Event.None, executeCommand: async (id: string) => { commands.push(id); } });
		const container = Object.assign(new (mock<ViewContainer>())(), { id: 'ade-shortcuts-test' });
		instantiation.stub(IViewDescriptorService, { onDidChangeLocation: Event.None, onDidChangeContainer: Event.None, getViewLocationById: () => ViewContainerLocation.Sidebar, getViewDescriptorById: () => null, getViewContainerByViewId: () => container, getViewContainerModel: () => Object.assign(new (mock<IViewContainerModel>())(), { title: 'System and Features', onDidChangeContainerInfo: Event.None }), getDefaultContainerById: () => container });
		const view = store.add(instantiation.createInstance(AdeView, { id: 'ade-shortcuts-test', title: 'System and Features' }));
		view.render(); root.appendChild(view.element);
		const buttons = () => [...root.querySelectorAll<HTMLButtonElement>('.ade-outline-tools .ade-options-content > button')];
		return { view, project, ai, code, changed, aiChanged, codeChanged, commands, configuration, buttons };
	}

	test('the outline contains only search and creation; implementation belongs to Code', async () => {
		const f = fixture();
		for (const button of f.buttons()) { button.click(); }
		await Promise.resolve();
		assert.deepStrictEqual({ actions: f.buttons().map(button => button.textContent), commands: f.commands, hasCodeActions: root.textContent?.includes('Update Codebase'), title: root.querySelector('.ade-navigation-group > summary .ade-nav-label')?.textContent }, { actions: ['Add Feature', 'Add Diagram'], commands: ['ade.addFeature', 'ade.addDiagram'], hasCodeActions: false, title: 'ecommerce-ade' });
	});

	test('System Map stays directly reachable while the project is collapsed', async () => {
		const f = fixture();
		root.querySelector<HTMLDetailsElement>('.ade-navigation-group')!.open = false;
		const map = root.querySelector<HTMLButtonElement>('.ade-sidebar-navigation button[aria-current]')!;
		map.click(); await Promise.resolve();
		assert.deepStrictEqual({ label: map.textContent, hiddenInOptions: !!map.closest('details'), commands: f.commands }, { label: 'System Map', hiddenInOptions: false, commands: ['ade.showSystemMap'] });
	});

	test('busy state blocks creation and preserves the collapsed project', () => {
		const f = fixture();
		root.querySelector<HTMLDetailsElement>('.ade-navigation-group')!.open = false;
		f.ai.busy = true; f.aiChanged.fire();
		for (const button of f.buttons()) { button.click(); }
		assert.deepStrictEqual([f.buttons().every(button => button.disabled), root.querySelector<HTMLDetailsElement>('.ade-navigation-group')!.open, f.commands], [true, false, []]);
		f.ai.busy = false; f.aiChanged.fire();
		assert.ok(f.buttons().every(button => !button.disabled));
	});

	test('source inventories and readonly projects do not offer manual creation', () => {
		const f = fixture(); f.project.model.id = 'code:inventory'; f.changed.fire();
		assert.deepStrictEqual([f.buttons().length, root.textContent?.includes('Source inventory ready')], [0, true]);
		f.project.model.id = 'project'; Object.assign(f.project, { editable: false }); f.changed.fire();
		assert.strictEqual(f.buttons().length, 0);
	});

	test('manual creation remains available with AI disabled', async () => {
		const f = fixture(false);
		await f.configuration.setUserConfiguration('chat.disableAIFeatures', true);
		f.configuration.onDidChangeConfigurationEmitter.fire(Object.assign(new (mock<IConfigurationChangeEvent>())(), { affectsConfiguration: (key: string) => key === 'chat.disableAIFeatures' }));
		f.buttons()[1].click(); await Promise.resolve();
		assert.deepStrictEqual([f.buttons().map(button => button.disabled), f.commands], [[false, false], ['ade.addDiagram']]);
	});
});
