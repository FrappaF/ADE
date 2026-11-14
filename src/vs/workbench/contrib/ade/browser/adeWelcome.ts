/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { localize } from '../../../../nls.js';
import { type AdeControls } from './adeControls.js';

interface WelcomeActions {
	open(): void; create(): void; importCode(): void; openModel(): void; example(): void;
	canImport: boolean;
}

/** Three task entrances; file formats and examples remain available as supporting help. */
export function renderAdeWelcome(parent: HTMLElement, controls: AdeControls, actions: WelcomeActions): void {
	const welcome = dom.append(parent, dom.$('section.ade-welcome'));
	dom.append(welcome, dom.$('h1')).textContent = localize('ade.welcome.title', "Start a Project");
	const tasks = dom.append(welcome, dom.$('div.ade-welcome-tasks'));
	for (const [id, label, callback, enabled] of [
		['open', localize('ade.openProject', "Open Project"), actions.open, true],
		['create', localize('ade.createProject', "Create Project"), actions.create, true],
		['import', localize('ade.importCode', "Import Codebase"), actions.importCode, actions.canImport]
	] as const) {
		const card = dom.append(tasks, dom.$('section.ade-welcome-task'));
		const button = controls.button(card, label, callback, `welcome:${id}`);
		button.disabled = !enabled;
		if (id === 'create') { button.classList.add('ade-primary-action'); }
		if (!enabled) {
			const detail = dom.append(card, dom.$('p')); detail.id = `ade-welcome-${id}`;
			detail.textContent = localize('ade.welcome.importUnavailable', "Code import is unavailable here or an import is already running.");
			button.setAttribute('aria-describedby', detail.id);
		}
	}
	const help = controls.details(welcome, localize('ade.welcome.help', "Examples and Model Files"), 'welcome-help');
	dom.append(help, dom.$('p')).textContent = localize('ade.welcome.modelHelp', "A project includes its model and local working context. You can also open a standalone model file or explore a read-only example.");
	controls.button(help, localize('ade.openModel', "Open Model"), actions.openModel, 'welcome:open-model');
	controls.button(help, localize('ade.demo', "Explore Purchase Example"), actions.example, 'welcome:example');
}

/** The first supported result is discoverable exactly where project creation lands. */
export function renderAdeProjectStart(parent: HTMLElement, controls: AdeControls, name: string, template: (() => void) | undefined, manual: () => void): void {
	const start = dom.append(parent, dom.$('section.ade-project-start'));
	dom.append(start, dom.$('h1')).textContent = localize('ade.start.title', "{0}", name);
	controls.button(start, localize('ade.addFeature', "Add Feature"), manual, 'start:manual').classList.add('ade-primary-action');
	if (template) {
		const examples = controls.details(start, localize('ade.start.examples', "Examples"), 'start-examples');
		controls.button(examples, localize('ade.start.quantityExample', "Quantity Validation"), template, 'start:template');
	}
}
