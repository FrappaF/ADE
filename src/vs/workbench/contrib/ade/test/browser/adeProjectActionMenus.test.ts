import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IAdeAiService } from '../../browser/adeAiService.js';
import { IAdeCodeService } from '../../browser/adeCodeService.js';
import { AdeControls } from '../../browser/adeControls.js';
import { AdeProjectService } from '../../browser/adeProjectService.js';
import { AdeWorkflowContent } from '../../browser/adeWorkflowContent.js';
import { blueprintFixture } from '../common/blueprintFixture.js';

suite('A.D.E project action menus', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let root: HTMLElement;
	setup(() => { root = dom.append(document.body, dom.$('section.ade-shell')); });
	teardown(() => root.remove());

	function fixture() {
		const controls = store.add(new AdeControls());
		const project = Object.assign(new (mock<AdeProjectService>())(), { model: structuredClone(blueprintFixture), editable: true });
		const commands: string[] = [];
		const commandService = Object.assign(new (mock<ICommandService>())(), { executeCommand: async (command: string) => { commands.push(command); } });
		const ai = Object.assign(new (mock<IAdeAiService>())(), { editPureCriteria: async () => { commands.push('criteria'); }, structuralReverse: async () => { commands.push('reverse'); } });
		const host = new (mock<ConstructorParameters<typeof AdeWorkflowContent>[0]>())();
		const workflow = new AdeWorkflowContent(host, controls, project, ai, new (mock<IConfigurationService>())(), new (mock<INotificationService>())(), new (mock<IAdeCodeService>())(), commandService);
		return { project, workflow, commands, controls };
	}

	test('project settings distinguish navigation, specification editing and advanced tools', async () => {
		const { workflow, commands } = fixture(); workflow.renderProjectActions(root);
		const buttons = [...root.querySelectorAll<HTMLButtonElement>('.ade-menu-action')];
		const action = (label: string) => buttons.find(button => button.getAttribute('aria-label') === label)!;
		assert.deepStrictEqual({ sections: [...root.querySelectorAll(':scope > details > summary')].map(summary => summary.getAttribute('aria-label')), navigate: action('System Map').classList.contains('ade-menu-action-navigation'), edit: action('Edit Blueprint').classList.contains('ade-menu-action-navigation'), editGroup: action('Edit Blueprint').closest('section')?.querySelector('h3')?.textContent, nestedEditDisclosure: [...root.querySelectorAll('summary')].some(summary => summary.getAttribute('aria-label') === 'Edit Behavior') }, { sections: ['Open and Save', 'Model and Architecture', 'Executable Behavior', 'Developer Tools'], navigate: true, edit: false, editGroup: 'Edit Specification', nestedEditDisclosure: false });
		assert.ok(buttons.every(button => button.querySelector('.codicon[aria-hidden="true"]')));
		action('System Map').click(); action('Edit Blueprint').click(); action('Independent Business Expectations').click();
		await Promise.resolve(); assert.deepStrictEqual(commands, ['ade.showSystemMap', 'ade.blueprint', 'criteria']);
	});

	test('readonly projects retain exploration and tools while omitting specification mutations', () => {
		const { workflow, project } = fixture(); Object.assign(project, { editable: false }); workflow.renderProjectActions(root);
		const names = [...root.querySelectorAll<HTMLButtonElement>('.ade-menu-action')].map(button => button.getAttribute('aria-label'));
		assert.deepStrictEqual({ explore: names.includes('System Map'), tools: names.includes('Files') && names.includes('Git'), edit: names.includes('Edit Blueprint'), behavior: root.textContent?.includes('Executable Behavior') }, { explore: true, tools: true, edit: false, behavior: false });
	});

	test('loading leaves file recovery available and does not expose stale model actions', () => {
		const { workflow, project } = fixture(); Object.assign(project, { loading: true }); workflow.renderProjectActions(root);
		assert.deepStrictEqual([...root.querySelectorAll<HTMLButtonElement>('.ade-menu-action')].map(button => button.getAttribute('aria-label')), ['Save Project Copy', 'Reload Project', 'Import Codebase', 'Open Model']);
	});
});
