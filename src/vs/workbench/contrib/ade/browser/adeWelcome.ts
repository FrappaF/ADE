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
	dom.append(welcome, dom.$('p.ade-eyebrow')).textContent = localize('ade.welcome.eyebrow', "A.D.E · Your Development Workspace");
	dom.append(welcome, dom.$('h1')).textContent = localize('ade.welcome.title', "Your System, in Context");
	dom.append(welcome, dom.$('p.ade-intro')).textContent = localize('ade.welcome.intro', "Start with an idea, explore existing code, or pick up where you left off.");
	const tasks = dom.append(welcome, dom.$('div.ade-welcome-tasks'));
	for (const [id, label, description, callback, enabled] of [
		['open', localize('ade.openProject', "Open Project"), localize('ade.welcome.open', "Continue working with a saved project and its diagrams."), actions.open, true],
		['create', localize('ade.createProject', "Create Project"), localize('ade.welcome.create', "Define your first feature, then review and verify its code."), actions.create, true],
		['import', localize('ade.importCode', "Import Codebase"), localize('ade.welcome.import', "Build a local source inventory, then explore its architecture."), actions.importCode, actions.canImport]
	] as const) {
		const card = dom.append(tasks, dom.$('section.ade-welcome-task'));
		const button = controls.button(card, label, callback, `welcome:${id}`);
		button.disabled = !enabled;
		if (id === 'open') { button.classList.add('ade-primary-action'); }
		const descriptionId = `ade-welcome-${id}`;
		const detail = dom.append(card, dom.$('p'));
		detail.id = descriptionId;
		detail.textContent = enabled ? description : localize('ade.welcome.importUnavailable', "Code import is unavailable here or an import is already running.");
		button.setAttribute('aria-describedby', descriptionId);
	}
	const help = controls.details(welcome, localize('ade.welcome.help', "Examples and Model Files"), 'welcome-help');
	dom.append(help, dom.$('p')).textContent = localize('ade.welcome.modelHelp', "A project includes its model and local working context. You can also open a standalone model file or explore a read-only example.");
	controls.button(help, localize('ade.openModel', "Open Model"), actions.openModel, 'welcome:open-model');
	controls.button(help, localize('ade.demo', "Explore Purchase Example"), actions.example, 'welcome:example');
}

/** The first supported result is discoverable exactly where project creation lands. */
export function renderAdeProjectStart(parent: HTMLElement, controls: AdeControls, name: string, template: (() => void) | undefined, manual: () => void): void {
	const start = dom.append(parent, dom.$('section.ade-project-start'));
	dom.append(start, dom.$('p.ade-eyebrow')).textContent = localize('ade.start.created', "Project Created · {0}", name);
	dom.append(start, dom.$('h1')).textContent = localize('ade.start.title', "Define Your First Feature");
	dom.append(start, dom.$('p.ade-intro')).textContent = localize('ade.start.intro', "A feature connects your design to the behavior you want to build.");
	if (template) {
		const example = dom.append(start, dom.$('section.ade-start-template'));
		dom.append(example, dom.$('h2')).textContent = localize('ade.start.template', "Try Quantity Validation");
		dom.append(example, dom.$('p')).textContent = localize('ade.start.templateDescription', "Start with a positive-quantity rule, a structure diagram and independent test cases. Then prepare, verify and apply the changes locally.");
		controls.button(example, localize('ade.pure.start', "Add Pure Quantity Feature"), template, 'start:template').classList.add('ade-primary-action');
	}
	controls.button(start, localize('ade.start.manual', "Design a Feature from Scratch"), manual, 'start:manual');
	dom.append(start, dom.$('p.ade-supporting-text')).textContent = localize('ade.start.manualDescription', "Free modeling starts with a name and a diagram. Code generation requires a complete executable contract and a supported runtime.");
}
