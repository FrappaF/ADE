import * as dom from '../../../../base/browser/dom.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { type ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { type OrditoControls } from './orditoControls.js';

interface CodeAction {
	label: string;
	run(): void;
	reason?: string;
}

interface CodeActions {
	update?: CodeAction;
	reviewedGeneration?: { action?: CodeAction; prepareNew?: CodeAction; renderStatus(parent: HTMLElement): void };
	prepare: CodeAction;
	continuity: CodeAction;
	continuityStatus: string;
	recovery: CodeAction[];
	review?: CodeAction;
	worktree?: CodeAction & { status: string };
	sources?: CodeAction[];
	reviewActions?(parent: HTMLElement): void;
	settings(): void;
}

/** A focused entry point for implementation, verification and local recovery. */
export function renderOrditoCodeActions(parent: HTMLElement, controls: OrditoControls, actions: CodeActions): void {
	const page = dom.append(parent, dom.$('div.ordito-code-page'));
	dom.append(page, dom.$('h1')).textContent = localize('ordito.code.title', "Code");
	dom.append(page, dom.$('p.ordito-page-description')).textContent = localize('ordito.code.description', "Turn your diagrams into code, review changes and manage local preparation.");
	const panel = (container: HTMLElement, title: string, description: string, icon: ThemeIcon, primary = false) => {
		const section = dom.append(container, dom.$('section.ordito-code-panel'));
		section.classList.toggle('ordito-code-primary', primary);
		const heading = dom.append(section, dom.$('h2'));
		const glyph = renderIcon(icon); glyph.setAttribute('aria-hidden', 'true'); heading.append(glyph);
		dom.append(heading, dom.$('span')).textContent = title;
		dom.append(section, dom.$('p.ordito-page-description')).textContent = description;
		return section;
	};
	const button = (container: HTMLElement, action: CodeAction, id: string, primary = false) => {
		const button = controls.button(container, action.label, () => action.run(), id);
		button.classList.toggle('ordito-primary-action', primary);
		button.disabled = !!action.reason;
		if (action.reason) {
			const reason = dom.append(container, dom.$('p.ordito-action-reason'));
			reason.id = `${id}-reason`; reason.textContent = action.reason;
			button.setAttribute('aria-describedby', reason.id);
		}
	};
	if (actions.worktree) {
		const worktree = panel(page, localize('ordito.code.worktree', "Implementation Worktree"), actions.worktree.status, Codicon.checklist, true);
		button(worktree, actions.worktree, 'code-worktree-action', true);
	}
	if (actions.update) {
		const update = panel(page, localize('ordito.codeUpdate.group', "Codebase from Diagrams"), localize('ordito.code.updateHint', "Review your saved diagram changes and update the related files in the codebase."), Codicon.code, !actions.worktree);
		button(update, actions.update, 'code-update', !actions.worktree);
	}
	if (actions.reviewedGeneration) {
		const primary = !actions.worktree && !actions.update;
		const generation = panel(page, localize('ordito.code.reviewedGeneration', "Reviewed Code Generation"), localize('ordito.code.reviewedGenerationHint', "Prepare code from feature contracts and verify the proposed changes before applying them."), Codicon.code, primary);
		actions.reviewedGeneration.renderStatus(generation);
		if (actions.reviewedGeneration.action) { button(generation, actions.reviewedGeneration.action, actions.update ? 'code-reviewed-generation' : 'code-update', primary); }
		if (actions.reviewedGeneration.prepareNew) { button(generation, actions.reviewedGeneration.prepareNew, 'code-prepare-new'); }
	}
	if (actions.sources?.length) {
		const sources = panel(page, localize('ordito.code.sources', "Source Code"), localize('ordito.code.sourcesHint', "Inspect source evidence or update the project diagrams from your linked codebase."), Codicon.search);
		for (const [index, action] of actions.sources.entries()) { button(sources, action, `code-source:${index}`); }
	}
	const grid = dom.append(page, dom.$('div.ordito-code-grid'));
	const review = panel(grid, localize('ordito.code.review', "Review and Verification"), localize('ordito.code.reviewHint', "Prepare a local review from executable behavior, then verify and apply the proposed changes."), Codicon.checklist);
	button(review, actions.prepare, 'code-prepare');
	if (actions.review) { button(review, actions.review, 'code-review'); }
	controls.button(review, localize('ordito.code.requirements', "Open Project Settings"), actions.settings, 'code-settings');
	actions.reviewActions?.(review);
	const automatic = panel(grid, localize('ordito.code.automatic', "Automatic Preparation"), localize('ordito.code.automaticHint', "Prepare local proposals within a budget. Review and publication remain manual."), Codicon.sync);
	const status = dom.append(automatic, dom.$('p.ordito-code-status'));
	status.setAttribute('role', 'status'); status.textContent = actions.continuityStatus;
	button(automatic, actions.continuity, 'code-continuity');
	const recovery = panel(page, localize('ordito.project.recovery', "Recovery and Synchronization"), localize('ordito.code.recoveryHint', "Resume interrupted work or restore a previous local synchronization."), Codicon.history);
	const list = dom.append(recovery, dom.$('div.ordito-code-recovery'));
	for (const [index, action] of actions.recovery.entries()) {
		button(dom.append(list, dom.$('div')), action, `code-recovery:${index}`);
	}
}
