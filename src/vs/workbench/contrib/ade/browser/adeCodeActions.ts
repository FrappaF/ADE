/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { type ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { type AdeControls } from './adeControls.js';

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
export function renderAdeCodeActions(parent: HTMLElement, controls: AdeControls, actions: CodeActions): void {
	const page = dom.append(parent, dom.$('div.ade-code-page'));
	dom.append(page, dom.$('h1')).textContent = localize('ade.code.title', "Code");
	dom.append(page, dom.$('p.ade-page-description')).textContent = localize('ade.code.description', "Turn your diagrams into code, review changes and manage local preparation.");
	const panel = (container: HTMLElement, title: string, description: string, icon: ThemeIcon, primary = false) => {
		const section = dom.append(container, dom.$('section.ade-code-panel'));
		section.classList.toggle('ade-code-primary', primary);
		const heading = dom.append(section, dom.$('h2'));
		const glyph = renderIcon(icon); glyph.setAttribute('aria-hidden', 'true'); heading.append(glyph);
		dom.append(heading, dom.$('span')).textContent = title;
		dom.append(section, dom.$('p.ade-page-description')).textContent = description;
		return section;
	};
	const button = (container: HTMLElement, action: CodeAction, id: string, primary = false) => {
		const button = controls.button(container, action.label, () => action.run(), id);
		button.classList.toggle('ade-primary-action', primary);
		button.disabled = !!action.reason;
		if (action.reason) {
			const reason = dom.append(container, dom.$('p.ade-action-reason'));
			reason.id = `${id}-reason`; reason.textContent = action.reason;
			button.setAttribute('aria-describedby', reason.id);
		}
	};
	if (actions.worktree) {
		const worktree = panel(page, localize('ade.code.worktree', "Implementation Worktree"), actions.worktree.status, Codicon.checklist, true);
		button(worktree, actions.worktree, 'code-worktree-action', true);
	}
	if (actions.update) {
		const update = panel(page, localize('ade.codeUpdate.group', "Codebase from Diagrams"), localize('ade.code.updateHint', "Review your saved diagram changes and update the related files in the codebase."), Codicon.code, !actions.worktree);
		button(update, actions.update, 'code-update', !actions.worktree);
	}
	if (actions.reviewedGeneration) {
		const primary = !actions.worktree && !actions.update;
		const generation = panel(page, localize('ade.code.reviewedGeneration', "Reviewed Code Generation"), localize('ade.code.reviewedGenerationHint', "Prepare code from feature contracts and verify the proposed changes before applying them."), Codicon.code, primary);
		actions.reviewedGeneration.renderStatus(generation);
		if (actions.reviewedGeneration.action) { button(generation, actions.reviewedGeneration.action, actions.update ? 'code-reviewed-generation' : 'code-update', primary); }
		if (actions.reviewedGeneration.prepareNew) { button(generation, actions.reviewedGeneration.prepareNew, 'code-prepare-new'); }
	}
	if (actions.sources?.length) {
		const sources = panel(page, localize('ade.code.sources', "Source Code"), localize('ade.code.sourcesHint', "Inspect source evidence or update the project diagrams from your linked codebase."), Codicon.search);
		for (const [index, action] of actions.sources.entries()) { button(sources, action, `code-source:${index}`); }
	}
	const grid = dom.append(page, dom.$('div.ade-code-grid'));
	const review = panel(grid, localize('ade.code.review', "Review and Verification"), localize('ade.code.reviewHint', "Prepare a local review from executable behavior, then verify and apply the proposed changes."), Codicon.checklist);
	button(review, actions.prepare, 'code-prepare');
	if (actions.review) { button(review, actions.review, 'code-review'); }
	controls.button(review, localize('ade.code.requirements', "Open Project Settings"), actions.settings, 'code-settings');
	actions.reviewActions?.(review);
	const automatic = panel(grid, localize('ade.code.automatic', "Automatic Preparation"), localize('ade.code.automaticHint', "Prepare local proposals within a budget. Review and publication remain manual."), Codicon.sync);
	const status = dom.append(automatic, dom.$('p.ade-code-status'));
	status.setAttribute('role', 'status'); status.textContent = actions.continuityStatus;
	button(automatic, actions.continuity, 'code-continuity');
	const recovery = panel(page, localize('ade.project.recovery', "Recovery and Synchronization"), localize('ade.code.recoveryHint', "Resume interrupted work or restore a previous local synchronization."), Codicon.history);
	const list = dom.append(recovery, dom.$('div.ade-code-recovery'));
	for (const [index, action] of actions.recovery.entries()) {
		button(dom.append(list, dom.$('div')), action, `code-recovery:${index}`);
	}
}
