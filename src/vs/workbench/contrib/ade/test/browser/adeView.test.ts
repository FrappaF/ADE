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
		const project = Object.assign(new (mock<AdeProjectService>())(), { model, modelUri: URI.file('/project/model.ade.json'), editable: true, section: 'home', onDidChange: changed.event, restore: async () => {} });
		const ai = Object.assign(new (mock<IAdeAiService>())(), { available: true, busy: false, onDidChange: aiChanged.event });
		const code = Object.assign(new (mock<IAdeCodeService>())(), { available: true, busy: false, context: linked ? { sourceRoot: '/project' } : undefined, onDidChange: codeChanged.event });
		const commands: string[] = [];
		let importSucceeds = false;
		instantiation.stub(IAdeProjectService, project); instantiation.stub(IAdeAiService, ai); instantiation.stub(IAdeCodeService, code);
		instantiation.stub(ICommandService, { onWillExecuteCommand: Event.None, onDidExecuteCommand: Event.None, executeCommand: async (id: string) => { commands.push(id); if (id === 'ade.importCodebase' && importSucceeds) { Object.assign(code, { context: { sourceRoot: '/selected-project' } }); codeChanged.fire(); } } });
		const container = Object.assign(new (mock<ViewContainer>())(), { id: 'ade-shortcuts-test' });
		instantiation.stub(IViewDescriptorService, { onDidChangeLocation: Event.None, onDidChangeContainer: Event.None, getViewLocationById: () => ViewContainerLocation.Sidebar, getViewDescriptorById: () => null, getViewContainerByViewId: () => container, getViewContainerModel: () => Object.assign(new (mock<IViewContainerModel>())(), { title: 'System and Features', onDidChangeContainerInfo: Event.None }), getDefaultContainerById: () => container });
		const view = store.add(instantiation.createInstance(AdeView, { id: 'ade-shortcuts-test', title: 'System and Features' }));
		view.render(); root.appendChild(view.element);
		const buttons = () => [...root.querySelectorAll<HTMLButtonElement>('.ade-project-shortcuts > button')];
		return { view, project, ai, code, changed, aiChanged, codeChanged, commands, configuration, buttons, completeImport: () => { importSucceeds = true; } };
	}

	test('empty projects expose both shortcuts under a single project title and dispatch the existing commands', async () => {
		const f = fixture();
		assert.deepStrictEqual({ title: root.querySelector('.ade-navigation-group > summary')?.textContent, actions: f.buttons().map(button => button.textContent), duplicateTitle: root.querySelector('.ade-sidebar > h3'), empty: root.textContent?.includes('No diagrams in this context.') }, { title: 'ecommerce-ade', actions: ['Create Diagram', 'Update Diagrams from Codebase'], duplicateTitle: null, empty: true });
		for (const button of f.buttons()) { button.click(); }
		await Promise.resolve();
		assert.deepStrictEqual(f.commands, ['ade.addDiagram', 'ade.ai.updateDiagrams']);
	});

	test('codebase setup opens import first and canceling it never launches generation', async () => {
		const f = fixture(false);
		f.buttons()[1].click(); await Promise.resolve(); await Promise.resolve();
		assert.deepStrictEqual(f.commands, ['ade.importCodebase']);
		f.completeImport(); f.buttons()[1].click(); await Promise.resolve(); await Promise.resolve();
		assert.deepStrictEqual(f.commands, ['ade.importCodebase', 'ade.importCodebase', 'ade.ai.updateDiagrams']);
	});

	test('busy and readonly states update both shortcuts without losing the collapsed project', () => {
		const f = fixture();
		const group = root.querySelector<HTMLDetailsElement>('.ade-navigation-group')!; group.open = false;
		f.ai.busy = true; f.aiChanged.fire();
		assert.deepStrictEqual([f.buttons().every(button => button.disabled), root.querySelector<HTMLDetailsElement>('.ade-navigation-group')!.open], [true, false]);
		f.ai.busy = false; f.aiChanged.fire(); assert.ok(f.buttons().every(button => !button.disabled));
		Object.assign(f.project, { editable: false }); f.changed.fire();
		for (const button of f.buttons()) { button.click(); }
		assert.deepStrictEqual([f.buttons().every(button => button.disabled), f.commands, !!root.querySelector(`#${f.buttons()[0].getAttribute('aria-describedby')}`)?.textContent?.includes('Writable Project')], [true, [], true]);
	});

	test('source inventories offer generation while manual editing waits for published diagrams', () => {
		const f = fixture(); f.project.model.id = 'code:inventory'; f.changed.fire();
		assert.deepStrictEqual(f.buttons().map(button => button.disabled), [true, false]);
		assert.ok(root.textContent?.includes('Source inventory ready'));
	});

	test('turning off AI explains the unavailable update and keeps manual diagram creation usable', async () => {
		const f = fixture();
		await f.configuration.setUserConfiguration('chat.disableAIFeatures', true);
		f.configuration.onDidChangeConfigurationEmitter.fire(Object.assign(new (mock<IConfigurationChangeEvent>())(), { affectsConfiguration: (key: string) => key === 'chat.disableAIFeatures' }));
		f.buttons()[1].click();
		assert.deepStrictEqual([f.buttons().map(button => button.disabled), f.commands, root.textContent?.includes('AI features are disabled')], [[false, true], [], true]);
	});
});
