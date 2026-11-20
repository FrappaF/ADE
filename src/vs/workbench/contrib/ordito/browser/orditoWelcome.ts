import * as dom from '../../../../base/browser/dom.js';
import { localize } from '../../../../nls.js';
import { type OrditoControls } from './orditoControls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { type SemanticModel } from '../common/modelTypes.js';
import { getDiagramGroups } from '../common/visualNavigation.js';
import { diagramIcon, prependOrditoIcon } from './orditoIcons.js';

interface WelcomeActions {
	open(): void; create(): void; importCode(): void; openModel(): void; example(): void;
	canImport: boolean;
}

/** Three task entrances; file formats and examples remain available as supporting help. */
export function renderOrditoWelcome(parent: HTMLElement, controls: OrditoControls, actions: WelcomeActions): void {
	const welcome = dom.append(parent, dom.$('section.ordito-welcome'));
	dom.append(welcome, dom.$('h1')).textContent = localize('ordito.welcome.title', "Start a Project");
	const tasks = dom.append(welcome, dom.$('div.ordito-welcome-tasks'));
	for (const [id, label, callback, enabled] of [
		['open', localize('ordito.openProject', "Open Project"), actions.open, true],
		['create', localize('ordito.createProject', "Create Project"), actions.create, true],
		['import', localize('ordito.importCode', "Import Codebase"), actions.importCode, actions.canImport]
	] as const) {
		const card = dom.append(tasks, dom.$('section.ordito-welcome-task'));
		const button = controls.button(card, label, callback, `welcome:${id}`);
		button.disabled = !enabled;
		if (id === 'create') { button.classList.add('ordito-primary-action'); }
		if (!enabled) {
			const detail = dom.append(card, dom.$('p')); detail.id = `ordito-welcome-${id}`;
			detail.textContent = localize('ordito.welcome.importUnavailable', "Code import is unavailable here or an import is already running.");
			button.setAttribute('aria-describedby', detail.id);
		}
	}
	const help = controls.details(welcome, localize('ordito.welcome.help', "Examples and Model Files"), 'welcome-help');
	dom.append(help, dom.$('p')).textContent = localize('ordito.welcome.modelHelp', "A project includes its model and local working context. You can also open a standalone model file or explore a read-only example.");
	controls.button(help, localize('ordito.openModel', "Open Model"), actions.openModel, 'welcome:open-model');
	controls.button(help, localize('ordito.demo', "Explore Purchase Example"), actions.example, 'welcome:example');
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
export function renderOrditoProjectHome(parent: HTMLElement, controls: OrditoControls, actions: ProjectHomeActions): void {
	const { model } = actions;
	const empty = model.semantics.elements.length === 0 && model.views.length === 0;
	const home = dom.append(parent, dom.$('section.ordito-project-home'));
	const heading = dom.append(home, dom.$('header.ordito-home-heading'));
	const title = dom.append(heading, dom.$('div'));
	dom.append(title, dom.$('h1')).textContent = model.name;
	dom.append(title, dom.$('p.ordito-home-description')).textContent = localize('ordito.home.description', "Your space to design the system.");
	const headerActions = dom.append(heading, dom.$('div.ordito-home-header-actions'));
	const editButton = (parent: HTMLElement, label: string, run: () => void, id: string) => {
		const button = controls.button(parent, label, run, id);
		button.disabled = actions.busy;
		prependOrditoIcon(button, Codicon.add);
		return button;
	};
	if (actions.editable && !empty) { editButton(headerActions, localize('ordito.addFeature', "Add Feature"), actions.addFeature, 'home:add-feature'); }
	const map = controls.button(headerActions, localize('ordito.systemMap', "System Map"), actions.systemMap, 'home:map');
	prependOrditoIcon(map, Codicon.typeHierarchy);
	if (!actions.editable) { dom.append(home, dom.$('p.ordito-home-description')).textContent = localize('ordito.home.readOnly', "This project is read-only. You can explore its features and diagrams."); }
	else if (actions.busy) { dom.append(home, dom.$('p.ordito-home-description')).textContent = localize('ordito.home.busy', "Wait for the current operation to finish before adding features or diagrams."); }
	const layout = dom.append(home, dom.$('div.ordito-home-layout'));
	const main = dom.append(layout, dom.$('div.ordito-home-main'));
	if (empty) {
		const start = dom.append(main, dom.$('section.ordito-home-start'));
		dom.append(start, dom.$('p.ordito-eyebrow')).textContent = localize('ordito.home.startHere', "Start Here");
		dom.append(start, dom.$('h2')).textContent = actions.editable ? localize('ordito.home.firstFeature', "Create your first feature.") : localize('ordito.home.emptyReadOnly', "Explore how a project takes shape.");
		dom.append(start, dom.$('p.ordito-home-description')).textContent = actions.editable
			? localize('ordito.home.firstFeatureDescription', "Start with a capability your system should offer. For example, purchasing a product.")
			: localize('ordito.home.emptyReadOnlyDescription', "This project is empty. Explore an example to see features, structure and flow in context.");
		if (actions.editable) {
			editButton(start, localize('ordito.home.createFirstFeature', "Create First Feature"), actions.addFeature, 'start:manual').classList.add('ordito-primary-action');
			const includes = dom.append(start, dom.$('div.ordito-home-includes'));
			dom.append(includes, dom.$('span')).textContent = localize('ordito.home.includes', "Starts with two diagrams:");
			for (const [label, icon] of [[localize('ordito.home.structure', "Structure"), Codicon.symbolClass], [localize('ordito.home.flow', "Flow"), Codicon.gitMerge]] as const) {
				const item = dom.append(includes, dom.$('span')); item.textContent = label; prependOrditoIcon(item, icon);
			}
		}
	} else {
		const resume = model.views.find(view => view.id === actions.resumeViewId);
		if (resume) {
			const section = dom.append(main, dom.$('section.ordito-home-resume'));
			dom.append(section, dom.$('h2')).textContent = localize('ordito.home.continue', "Continue Your Work");
			const button = controls.button(section, localize('ordito.home.resume', "Resume {0}", resume.name), () => actions.openDiagram(resume.id), 'home:resume');
			button.classList.add('ordito-primary-action'); prependOrditoIcon(button, diagramIcon(resume.kind));
		}
		const groups = getDiagramGroups(model);
		const features = groups.filter(group => group.featureId);
		if (features.length) {
			const section = dom.append(main, dom.$('section.ordito-home-features'));
			dom.append(section, dom.$('h2')).textContent = localize('ordito.home.features', "Your Features");
			const list = dom.append(section, dom.$('div.ordito-home-feature-list'));
			for (const feature of features) {
				const card = dom.append(list, dom.$('article.ordito-home-feature'));
				controls.button(dom.append(card, dom.$('h3')), feature.name, () => actions.inspectFeature(feature.featureId!), `home:feature:${feature.featureId}`);
				if (!feature.views.length) { dom.append(card, dom.$('p.ordito-home-description')).textContent = localize('ordito.home.noFeatureDiagrams', "No diagrams yet. Open the feature to explore its details or add a diagram."); }
				const links = dom.append(card, dom.$('div.ordito-home-feature-actions'));
				for (const view of feature.views) {
					const button = controls.button(links, view.name, () => actions.openDiagram(view.id), `home:view:${feature.featureId}:${view.id}`); prependOrditoIcon(button, diagramIcon(view.kind));
				}
				if (actions.editable && !feature.views.length) { editButton(links, localize('ordito.addDiagram', "Add Diagram"), () => actions.addDiagram(feature.featureId), `home:add-diagram:${feature.featureId}`); }
			}
		}
		if (groups[0].views.length) {
			const section = dom.append(main, dom.$('section.ordito-home-system-diagrams'));
			dom.append(section, dom.$('h2')).textContent = localize('ordito.systemDiagrams', "System Diagrams");
			const links = dom.append(section, dom.$('div.ordito-home-feature-actions'));
			for (const view of groups[0].views) {
				const button = controls.button(links, view.name, () => actions.openDiagram(view.id), `home:view:system:${view.id}`); prependOrditoIcon(button, diagramIcon(view.kind));
			}
		}
		if (!features.length && !model.views.length) {
			const section = dom.append(main, dom.$('section.ordito-home-system-diagrams'));
			dom.append(section, dom.$('h2')).textContent = localize('ordito.home.noDiagrams', "No Diagrams Yet");
			dom.append(section, dom.$('p.ordito-home-description')).textContent = localize('ordito.home.noDiagramsDescription', "Your system elements are available in System Map. Add a feature or diagram to start designing.");
			if (actions.editable) { editButton(section, localize('ordito.addDiagram', "Add Diagram"), actions.addDiagram, 'home:add-diagram:system'); }
		}
	}
	const examples = dom.append(main, dom.$('section.ordito-home-examples'));
	dom.append(examples, dom.$('h2')).textContent = localize('ordito.home.examples', "Start from an Example");
	dom.append(examples, dom.$('p.ordito-home-description')).textContent = localize('ordito.home.examplesDescription', "Explore before creating. Previewing an example leaves your project unchanged.");
	const cards = dom.append(examples, dom.$('div.ordito-home-example-grid'));
	for (const kind of ['purchase', 'quantity'] as const) {
		const purchase = kind === 'purchase';
		const card = dom.append(cards, dom.$('article.ordito-home-example'));
		const preview = dom.append(card, dom.$('div.ordito-home-example-preview')); preview.setAttribute('aria-hidden', 'true');
		dom.append(preview, dom.$('span.ordito-home-example-node')).textContent = purchase ? localize('ordito.home.example.customer', "Customer") : localize('ordito.home.example.quantity', "Quantity");
		prependOrditoIcon(dom.append(preview, dom.$('span')), Codicon.arrowRight);
		dom.append(preview, dom.$('span.ordito-home-example-node')).textContent = purchase ? localize('ordito.home.example.purchase', "Purchase") : localize('ordito.home.example.validate', "Validate");
		const body = dom.append(card, dom.$('div.ordito-home-example-body'));
		dom.append(body, dom.$('h3')).textContent = purchase ? localize('ordito.home.purchaseTitle', "Purchase a Product") : localize('ordito.start.quantityExample', "Quantity Validation");
		dom.append(body, dom.$('p')).textContent = purchase ? localize('ordito.home.purchaseDescription', "Actors, an order and a payment flow.") : localize('ordito.home.quantityDescription', "One rule, two possible outcomes.");
		const detail = controls.details(body, localize('ordito.home.exploreExample', "Explore Example"), `home:example:${kind}`);
		const flow = dom.append(detail, dom.$('div.ordito-home-example-flow'));
		for (const text of purchase ? [
			localize('ordito.home.purchaseStep', "The customer confirms the purchase."),
			localize('ordito.home.purchaseAccepted', "Payment authorized → order confirmed."),
			localize('ordito.home.purchaseDeclined', "Payment declined → purchase not completed.")
		] : [
			localize('ordito.home.quantityStep', "Enter a quantity and check whether it is greater than zero."),
			localize('ordito.home.quantityAccepted', "Greater than zero → valid quantity."),
			localize('ordito.home.quantityDeclined', "Zero or less → correct the quantity.")
		]) { dom.append(flow, dom.$('p')).textContent = text; }
		if (purchase) {
			dom.append(detail, dom.$('p')).textContent = localize('ordito.home.purchaseReadOnly', "Open the full purchase example as a separate read-only model.");
			controls.button(detail, localize('ordito.demo', "Explore Purchase Example"), actions.purchaseExample, 'home:purchase-example').disabled = actions.busy;
		} else if (actions.editable && actions.quantityTemplate) {
			dom.append(detail, dom.$('p')).textContent = localize('ordito.home.quantityAdds', "Add this starter feature and its validation criteria to the current project.");
			editButton(detail, localize('ordito.home.addQuantity', "Add Quantity Validation"), actions.quantityTemplate, 'home:quantity-template');
		} else {
			dom.append(detail, dom.$('p')).textContent = localize('ordito.home.quantityRequiresEmpty', "To add this starter, use an empty version 4 or 5 project.");
		}
	}
	const guide = dom.append(layout, dom.$('aside.ordito-home-guide'));
	guide.setAttribute('aria-label', localize('ordito.home.gettingStarted', "Getting Started"));
	const help = controls.details(guide, localize('ordito.home.howItWorks', "How It Works"), 'home:guide', { openByDefault: true });
	const steps = dom.append(help, dom.$('ol.ordito-home-steps'));
	for (const [title, description] of [
		[localize('ordito.home.stepFeature', "Choose a Feature"), localize('ordito.home.stepFeatureDescription', "Describe one concrete capability of your system.")],
		[localize('ordito.home.stepDiagrams', "Structure and Flow"), localize('ordito.home.stepDiagramsDescription', "Define who collaborates and what happens.")],
		[localize('ordito.home.stepMap', "See the Whole System"), localize('ordito.home.stepMapDescription', "Find your features and their relationships in System Map.")]
	]) {
		const step = dom.append(steps, dom.$('li'));
		dom.append(step, dom.$('h3')).textContent = title;
		dom.append(step, dom.$('p')).textContent = description;
	}
	dom.append(help, dom.$('p.ordito-home-guide-note')).textContent = localize('ordito.home.guideNote', "One step at a time. Add other diagrams when you need them.");
	const navigation = controls.button(help, localize('ordito.home.showNavigation', "Show Project Navigation"), actions.navigation, 'home:navigation');
	prependOrditoIcon(navigation, Codicon.layoutSidebarLeft);
}
