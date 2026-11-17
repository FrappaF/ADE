/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { localize } from '../../../../nls.js';
import { type AdeControls } from './adeControls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { type SemanticModel } from '../common/modelTypes.js';
import { getDiagramGroups } from '../common/visualNavigation.js';
import { diagramIcon, prependAdeIcon } from './adeIcons.js';

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

interface ProjectHomeActions {
	model: SemanticModel;
	editable: boolean;
	busy: boolean;
	resumeViewId?: string;
	addFeature(): void;
	addDiagram(featureId?: string): void;
	openDiagram(viewId: string): void;
	inspectFeature(featureId: string): void;
	systemMap(): void;
	navigation(): void;
	purchaseExample(): void;
	quantityTemplate?: () => void;
}

/** A project starts with guidance, then becomes a stable entrance to its actual features and diagrams. */
export function renderAdeProjectHome(parent: HTMLElement, controls: AdeControls, actions: ProjectHomeActions): void {
	const { model } = actions;
	const empty = model.semantics.elements.length === 0 && model.views.length === 0;
	const home = dom.append(parent, dom.$('section.ade-project-home'));
	const heading = dom.append(home, dom.$('header.ade-home-heading'));
	const title = dom.append(heading, dom.$('div'));
	dom.append(title, dom.$('h1')).textContent = model.name;
	dom.append(title, dom.$('p.ade-home-description')).textContent = localize('ade.home.description', "Your space to design the system.");
	const headerActions = dom.append(heading, dom.$('div.ade-home-header-actions'));
	const editButton = (parent: HTMLElement, label: string, run: () => void, id: string) => {
		const button = controls.button(parent, label, run, id);
		button.disabled = actions.busy;
		prependAdeIcon(button, Codicon.add);
		return button;
	};
	if (actions.editable && !empty) { editButton(headerActions, localize('ade.addFeature', "Add Feature"), actions.addFeature, 'home:add-feature'); }
	const map = controls.button(headerActions, localize('ade.systemMap', "System Map"), actions.systemMap, 'home:map');
	prependAdeIcon(map, Codicon.typeHierarchy);
	if (!actions.editable) { dom.append(home, dom.$('p.ade-home-description')).textContent = localize('ade.home.readOnly', "This project is read-only. You can explore its features and diagrams."); }
	else if (actions.busy) { dom.append(home, dom.$('p.ade-home-description')).textContent = localize('ade.home.busy', "Wait for the current operation to finish before adding features or diagrams."); }
	const layout = dom.append(home, dom.$('div.ade-home-layout'));
	const main = dom.append(layout, dom.$('div.ade-home-main'));
	if (empty) {
		const start = dom.append(main, dom.$('section.ade-home-start'));
		dom.append(start, dom.$('p.ade-eyebrow')).textContent = localize('ade.home.startHere', "Start Here");
		dom.append(start, dom.$('h2')).textContent = actions.editable ? localize('ade.home.firstFeature', "Create your first feature.") : localize('ade.home.emptyReadOnly', "Explore how a project takes shape.");
		dom.append(start, dom.$('p.ade-home-description')).textContent = actions.editable
			? localize('ade.home.firstFeatureDescription', "Start with a capability your system should offer. For example, purchasing a product.")
			: localize('ade.home.emptyReadOnlyDescription', "This project is empty. Explore an example to see features, structure and flow in context.");
		if (actions.editable) {
			editButton(start, localize('ade.home.createFirstFeature', "Create First Feature"), actions.addFeature, 'start:manual').classList.add('ade-primary-action');
			const includes = dom.append(start, dom.$('div.ade-home-includes'));
			dom.append(includes, dom.$('span')).textContent = localize('ade.home.includes', "Starts with two diagrams:");
			for (const [label, icon] of [[localize('ade.home.structure', "Structure"), Codicon.symbolClass], [localize('ade.home.flow', "Flow"), Codicon.gitMerge]] as const) {
				const item = dom.append(includes, dom.$('span')); item.textContent = label; prependAdeIcon(item, icon);
			}
		}
	} else {
		const resume = model.views.find(view => view.id === actions.resumeViewId);
		if (resume) {
			const section = dom.append(main, dom.$('section.ade-home-resume'));
			dom.append(section, dom.$('h2')).textContent = localize('ade.home.continue', "Continue Your Work");
			const button = controls.button(section, localize('ade.home.resume', "Resume {0}", resume.name), () => actions.openDiagram(resume.id), 'home:resume');
			button.classList.add('ade-primary-action'); prependAdeIcon(button, diagramIcon(resume.kind));
		}
		const groups = getDiagramGroups(model);
		const features = groups.filter(group => group.featureId);
		if (features.length) {
			const section = dom.append(main, dom.$('section.ade-home-features'));
			dom.append(section, dom.$('h2')).textContent = localize('ade.home.features', "Your Features");
			const list = dom.append(section, dom.$('div.ade-home-feature-list'));
			for (const feature of features) {
				const card = dom.append(list, dom.$('article.ade-home-feature'));
				controls.button(dom.append(card, dom.$('h3')), feature.name, () => actions.inspectFeature(feature.featureId!), `home:feature:${feature.featureId}`);
				if (!feature.views.length) { dom.append(card, dom.$('p.ade-home-description')).textContent = localize('ade.home.noFeatureDiagrams', "No diagrams yet. Open the feature to explore its details or add a diagram."); }
				const links = dom.append(card, dom.$('div.ade-home-feature-actions'));
				for (const view of feature.views) {
					const button = controls.button(links, view.name, () => actions.openDiagram(view.id), `home:view:${feature.featureId}:${view.id}`); prependAdeIcon(button, diagramIcon(view.kind));
				}
				if (actions.editable && !feature.views.length) { editButton(links, localize('ade.addDiagram', "Add Diagram"), () => actions.addDiagram(feature.featureId), `home:add-diagram:${feature.featureId}`); }
			}
		}
		if (groups[0].views.length) {
			const section = dom.append(main, dom.$('section.ade-home-system-diagrams'));
			dom.append(section, dom.$('h2')).textContent = localize('ade.systemDiagrams', "System Diagrams");
			const links = dom.append(section, dom.$('div.ade-home-feature-actions'));
			for (const view of groups[0].views) {
				const button = controls.button(links, view.name, () => actions.openDiagram(view.id), `home:view:system:${view.id}`); prependAdeIcon(button, diagramIcon(view.kind));
			}
		}
		if (!features.length && !model.views.length) {
			const section = dom.append(main, dom.$('section.ade-home-system-diagrams'));
			dom.append(section, dom.$('h2')).textContent = localize('ade.home.noDiagrams', "No Diagrams Yet");
			dom.append(section, dom.$('p.ade-home-description')).textContent = localize('ade.home.noDiagramsDescription', "Your system elements are available in System Map. Add a feature or diagram to start designing.");
			if (actions.editable) { editButton(section, localize('ade.addDiagram', "Add Diagram"), actions.addDiagram, 'home:add-diagram:system'); }
		}
	}
	const examples = dom.append(main, dom.$('section.ade-home-examples'));
	dom.append(examples, dom.$('h2')).textContent = localize('ade.home.examples', "Start from an Example");
	dom.append(examples, dom.$('p.ade-home-description')).textContent = localize('ade.home.examplesDescription', "Explore before creating. Previewing an example leaves your project unchanged.");
	const cards = dom.append(examples, dom.$('div.ade-home-example-grid'));
	for (const kind of ['purchase', 'quantity'] as const) {
		const purchase = kind === 'purchase';
		const card = dom.append(cards, dom.$('article.ade-home-example'));
		const preview = dom.append(card, dom.$('div.ade-home-example-preview')); preview.setAttribute('aria-hidden', 'true');
		dom.append(preview, dom.$('span.ade-home-example-node')).textContent = purchase ? localize('ade.home.example.customer', "Customer") : localize('ade.home.example.quantity', "Quantity");
		prependAdeIcon(dom.append(preview, dom.$('span')), Codicon.arrowRight);
		dom.append(preview, dom.$('span.ade-home-example-node')).textContent = purchase ? localize('ade.home.example.purchase', "Purchase") : localize('ade.home.example.validate', "Validate");
		const body = dom.append(card, dom.$('div.ade-home-example-body'));
		dom.append(body, dom.$('h3')).textContent = purchase ? localize('ade.home.purchaseTitle', "Purchase a Product") : localize('ade.start.quantityExample', "Quantity Validation");
		dom.append(body, dom.$('p')).textContent = purchase ? localize('ade.home.purchaseDescription', "Actors, an order and a payment flow.") : localize('ade.home.quantityDescription', "One rule, two possible outcomes.");
		const detail = controls.details(body, localize('ade.home.exploreExample', "Explore Example"), `home:example:${kind}`);
		const flow = dom.append(detail, dom.$('div.ade-home-example-flow'));
		for (const text of purchase ? [
			localize('ade.home.purchaseStep', "The customer confirms the purchase."),
			localize('ade.home.purchaseAccepted', "Payment authorized → order confirmed."),
			localize('ade.home.purchaseDeclined', "Payment declined → purchase not completed.")
		] : [
			localize('ade.home.quantityStep', "Enter a quantity and check whether it is greater than zero."),
			localize('ade.home.quantityAccepted', "Greater than zero → valid quantity."),
			localize('ade.home.quantityDeclined', "Zero or less → correct the quantity.")
		]) { dom.append(flow, dom.$('p')).textContent = text; }
		if (purchase) {
			dom.append(detail, dom.$('p')).textContent = localize('ade.home.purchaseReadOnly', "Open the full purchase example as a separate read-only model.");
			controls.button(detail, localize('ade.demo', "Explore Purchase Example"), actions.purchaseExample, 'home:purchase-example').disabled = actions.busy;
		} else if (actions.editable && actions.quantityTemplate) {
			dom.append(detail, dom.$('p')).textContent = localize('ade.home.quantityAdds', "Add this starter feature and its validation criteria to the current project.");
			editButton(detail, localize('ade.home.addQuantity', "Add Quantity Validation"), actions.quantityTemplate, 'home:quantity-template');
		} else {
			dom.append(detail, dom.$('p')).textContent = localize('ade.home.quantityRequiresEmpty', "To add this starter, use an empty version 4 or 5 project.");
		}
	}
	const guide = dom.append(layout, dom.$('aside.ade-home-guide'));
	guide.setAttribute('aria-label', localize('ade.home.gettingStarted', "Getting Started"));
	const help = controls.details(guide, localize('ade.home.howItWorks', "How It Works"), 'home:guide', { openByDefault: true });
	const steps = dom.append(help, dom.$('ol.ade-home-steps'));
	for (const [title, description] of [
		[localize('ade.home.stepFeature', "Choose a Feature"), localize('ade.home.stepFeatureDescription', "Describe one concrete capability of your system.")],
		[localize('ade.home.stepDiagrams', "Structure and Flow"), localize('ade.home.stepDiagramsDescription', "Define who collaborates and what happens.")],
		[localize('ade.home.stepMap', "See the Whole System"), localize('ade.home.stepMapDescription', "Find your features and their relationships in System Map.")]
	]) {
		const step = dom.append(steps, dom.$('li'));
		dom.append(step, dom.$('h3')).textContent = title;
		dom.append(step, dom.$('p')).textContent = description;
	}
	dom.append(help, dom.$('p.ade-home-guide-note')).textContent = localize('ade.home.guideNote', "One step at a time. Add other diagrams when you need them.");
	const navigation = controls.button(help, localize('ade.home.showNavigation', "Show Project Navigation"), actions.navigation, 'home:navigation');
	prependAdeIcon(navigation, Codicon.layoutSidebarLeft);
}
