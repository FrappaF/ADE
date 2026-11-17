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
import { blueprintFixture } from '../common/blueprintFixture.js';
import { emptyFoundation } from '../../common/modelFoundation.js';

suite('A.D.E sidebar project shortcuts', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let root: HTMLElement;
	setup(() => { root = dom.append(document.body, dom.$('section')); });
	teardown(() => root.remove());

	function fixture(linked = true) {
		const configuration = new TestConfigurationService();
		const instantiation = workbenchInstantiationService({ configurationService: () => configuration }, store);
		const changed = store.add(new Emitter<void>()), aiChanged = store.add(new Emitter<void>()), codeChanged = store.add(new Emitter<void>());
		const model: SemanticModel = { version: 4, id: 'project', name: 'ecommerce-ade', semantics: { elements: [], relations: [] }, views: [], codeMappings: [], verifications: [], foundation: emptyFoundation() };
		const project = Object.assign(new (mock<AdeProjectService>())(), { model, modelRevision: 0, documentVersion: 'model:1', modelUri: URI.file('/project/model.ade.json'), projectRoot: URI.file('/project'), editable: true, section: 'home', onDidChange: changed.event, restore: async () => {} });
		const ai = Object.assign(new (mock<IAdeAiService>())(), { available: true, busy: false, onDidChange: aiChanged.event });
		const code = Object.assign(new (mock<IAdeCodeService>())(), { available: true, busy: false, context: linked ? { sourceRoot: '/project' } : undefined, onDidChange: codeChanged.event });
		const commands: string[] = [];
		instantiation.stub(IAdeProjectService, project); instantiation.stub(IAdeAiService, ai); instantiation.stub(IAdeCodeService, code);
		instantiation.stub(ICommandService, { onWillExecuteCommand: Event.None, onDidExecuteCommand: Event.None, executeCommand: async (id: string) => { commands.push(id); } });
		const container = Object.assign(new (mock<ViewContainer>())(), { id: 'ade-shortcuts-test' });
		instantiation.stub(IViewDescriptorService, { onDidChangeLocation: Event.None, onDidChangeContainer: Event.None, getViewLocationById: () => ViewContainerLocation.Sidebar, getViewDescriptorById: () => null, getViewContainerByViewId: () => container, getViewContainerModel: () => Object.assign(new (mock<IViewContainerModel>())(), { title: 'System and Features', onDidChangeContainerInfo: Event.None }), getDefaultContainerById: () => container });
		const view = store.add(instantiation.createInstance(AdeView, { id: 'ade-shortcuts-test', title: 'System and Features' }));
		view.render(); root.appendChild(view.element);
		const buttons = () => [...root.querySelectorAll<HTMLButtonElement>('.ade-outline-tools .ade-menu-action')];
		return { view, project, ai, code, changed, aiChanged, codeChanged, commands, configuration, buttons };
	}

	test('the outline contains only search and creation; implementation belongs to Code', async () => {
		const f = fixture();
		for (const button of f.buttons()) { button.click(); }
		await Promise.resolve();
		assert.deepStrictEqual({ actions: f.buttons().map(button => button.getAttribute('aria-label')), commands: f.commands, hasCodeActions: root.textContent?.includes('Update Codebase'), title: root.querySelector('.ade-navigation-group > summary .ade-nav-label')?.textContent }, { actions: ['Add Feature', 'Add Diagram', 'Structural Blueprint'], commands: ['ade.addFeature', 'ade.addDiagram', 'ade.blueprint'], hasCodeActions: false, title: 'ecommerce-ade' });
	});

	test('System Map stays directly reachable while the project is collapsed', async () => {
		const f = fixture();
		root.querySelector<HTMLDetailsElement>('.ade-navigation-group')!.open = false;
		const map = root.querySelector<HTMLButtonElement>('.ade-sidebar-navigation button[aria-current]')!;
		map.click(); await Promise.resolve();
		assert.deepStrictEqual({ label: map.textContent, hiddenInOptions: !!map.closest('details'), commands: f.commands }, { label: 'System Map', hiddenInOptions: false, commands: ['ade.showSystemMap'] });
	});

	test('New separates creation from architecture and blocks blueprint editing while busy', async () => {
		const f = fixture();
		Object.assign(f.project, { model: structuredClone(blueprintFixture) }); f.changed.fire();
		const blueprint = () => root.querySelector<HTMLButtonElement>('.ade-sidebar-blueprint')!;
		blueprint().click(); await Promise.resolve();
		assert.deepStrictEqual({ label: blueprint().getAttribute('aria-label'), sections: [...root.querySelectorAll('.ade-outline-tools .ade-menu-section h3')].map(heading => heading.textContent), menu: blueprint().closest('details')?.querySelector('summary')?.textContent, menuOpen: blueprint().closest('details')?.open, commands: f.commands }, { label: 'Structural Blueprint', sections: ['Create', 'Define Architecture'], menu: 'New', menuOpen: false, commands: ['ade.blueprint'] });
		assert.ok(f.buttons().every(button => button.querySelector('.codicon[aria-hidden="true"]') && button.hasAttribute('aria-describedby')));
		f.ai.busy = true; f.aiChanged.fire(); blueprint().click();
		assert.deepStrictEqual([blueprint().disabled, f.commands], [true, ['ade.blueprint']]);
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

	test('feature deletion is isolated after its normal management actions', async () => {
		const f = fixture();
		f.project.model.semantics.elements.push({ id: 'delivery', kind: 'feature', name: 'Delivery' });
		f.project.model.views.push({ id: 'delivery-flow', name: 'Delivery Flow', kind: 'activity', featureId: 'delivery', nodes: [], relationIds: [] });
		Object.assign(f.project, { modelRevision: 1 }); f.changed.fire();
		const options = root.querySelector('.ade-feature-options')!;
		const actions = [...options.querySelectorAll<HTMLButtonElement>('.ade-menu-action')];
		assert.deepStrictEqual({ labels: actions.map(button => button.getAttribute('aria-label')), danger: actions.map(button => !!button.closest('.ade-menu-danger')), icons: actions.every(button => !!button.querySelector('.codicon[aria-hidden="true"]')) }, { labels: ['Add Diagram', 'Rename Feature', 'Delete Feature'], danger: [false, false, true], icons: true });
		actions[2].click(); await Promise.resolve();
		assert.deepStrictEqual(f.commands, ['ade.deleteFeature']);
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
		assert.deepStrictEqual([f.buttons().map(button => button.disabled), f.commands], [[false, false, false], ['ade.addDiagram']]);
	});

	test('parsed blueprint changes refresh navigation after an earlier dirty notification at the same text version', () => {
		const f = fixture();
		Object.assign(f.project, { documentVersion: 'model:2' }); f.changed.fire();
		f.project.model.views.push({ id: 'blueprint', name: 'New Blueprint', kind: 'c4Container', subjectId: 'shop', contextIds: [], nodes: [], relationIds: [] });
		Object.assign(f.project, { modelRevision: 1 }); f.changed.fire();
		assert.deepStrictEqual([...root.querySelectorAll('.ade-diagram-entry')].map(button => button.textContent), ['New Blueprint']);
		root.querySelector<HTMLDetailsElement>('.ade-navigation-group[data-kind="c4Container"]')!.open = false;
		f.project.model.views[0].name = 'Renamed Blueprint';
		Object.assign(f.project, { modelRevision: 2 }); f.changed.fire();
		assert.deepStrictEqual({ names: [...root.querySelectorAll('.ade-diagram-entry')].map(button => button.textContent), open: root.querySelector<HTMLDetailsElement>('.ade-navigation-group[data-kind="c4Container"]')!.open }, { names: ['Renamed Blueprint'], open: false });
		f.project.model.views = [];
		Object.assign(f.project, { modelRevision: 3 }); f.changed.fire();
		assert.strictEqual(root.querySelectorAll('.ade-diagram-entry').length, 0);
	});
});
