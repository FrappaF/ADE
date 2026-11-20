import './media/adeCodebaseExploration.css';
import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { getDurationString } from '../../../../base/common/date.js';
import { type ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { type ModelCodeUpdateItem, type ModelCodeUpdateState } from '../common/modelCodeUpdate.js';
import { type AdeControls } from './adeControls.js';
import { prependAdeIcon } from './adeIcons.js';
import { renderAdeWorkflowSteps } from './adeWorkflowSteps.js';

const steps = [
	{ label: localize('ade.codeUpdate.step.changes', "Changes"), icon: Codicon.diff },
	{ label: localize('ade.codeUpdate.step.update', "Update"), icon: Codicon.code },
	{ label: localize('ade.codeUpdate.step.review', "Review"), icon: Codicon.eye }
];

const changeLabels: Record<ModelCodeUpdateItem['kind'], string> = {
	added: localize('ade.codeUpdate.change.added', "Added"),
	modified: localize('ade.codeUpdate.change.modified', "Modified"),
	removed: localize('ade.codeUpdate.change.removed', "Removed")
};

function stageOf(phase: ModelCodeUpdateState['phase']) {
	switch (phase) {
		case 'ready': return { step: 0, title: localize('ade.codeUpdate.stage.ready', "Review the saved diagram changes"), icon: Codicon.diff, tone: 'ready' };
		case 'running': return { step: 1, title: localize('ade.codeUpdate.stage.running', "Updating the codebase"), icon: Codicon.code, tone: 'active' };
		case 'completed': return { step: 2, title: localize('ade.codeUpdate.stage.review', "Review the result"), icon: Codicon.check, tone: 'success' };
		case 'failed': return { step: 1, title: localize('ade.codeUpdate.stage.failed', "Codebase update failed"), icon: Codicon.warning, tone: 'attention' };
		case 'cancelled': return { step: 1, title: localize('ade.codeUpdate.stage.stopped', "Codebase update stopped"), icon: Codicon.debugStop, tone: 'attention' };
		case 'unavailable': return { step: 0, title: localize('ade.codeUpdate.stage.unavailable', "Codebase update unavailable"), icon: Codicon.info, tone: 'ready' };
	}
}

export interface AdeCodeUpdateActions {
	readonly startReason?: string;
	refresh(): Promise<void>;
	start(): Promise<void>;
	stop(): void;
	close(): void;
	openFiles(): Promise<void>;
}

/** Show the saved scope before an AI update, and the implementation summary after it. */
export function renderAdeCodeUpdate(parent: HTMLElement, controls: AdeControls, state: ModelCodeUpdateState, actions: AdeCodeUpdateActions): HTMLElement {
	const title = localize('ade.codeUpdate.button', "Update Codebase from Diagrams");
	const running = state.phase === 'running';
	const finished = state.phase === 'completed' || state.phase === 'cancelled' || state.phase === 'failed';
	const stage = stageOf(state.phase);
	const panel = dom.append(parent, dom.$('section.ade-explore.ade-code-update', { 'aria-label': title }));
	const header = dom.append(panel, dom.$('header.ade-explore-header'));
	const identity = dom.append(header, dom.$('div.ade-explore-identity'));
	prependAdeIcon(dom.append(identity, dom.$('span.ade-explore-project-icon')), Codicon.repo);
	const heading = dom.append(dom.append(identity, dom.$('div.ade-explore-heading')), dom.$('h1'));
	heading.textContent = title;
	heading.tabIndex = -1;
	controls.trackFocus('code-update-heading', heading);
	const button = (container: HTMLElement, label: string, icon: ThemeIcon, run: () => void | Promise<void>, id: string, primary = false) => {
		const control = controls.button(container, label, run, id);
		control.classList.add('ade-explore-button');
		control.classList.toggle('ade-primary-action', primary);
		prependAdeIcon(control, icon);
		return control;
	};
	if (!running) { button(header, localize('ade.featureCode.back', "Back to Code"), Codicon.arrowLeft, actions.close, 'code-update-back'); }
	const card = dom.append(panel, dom.$('div.ade-explore-card'));
	renderAdeWorkflowSteps(card, localize('ade.codeUpdate.steps', "Codebase update stages"), steps, stage.step);
	const body = dom.append(card, dom.$('div.ade-explore-stage', { 'data-tone': stage.tone }));
	const content = dom.append(body, dom.$('div.ade-explore-stage-main'));
	const glyph = dom.append(content, dom.$('span.ade-explore-stage-icon'));
	glyph.classList.toggle('ade-explore-stage-icon-running', running);
	prependAdeIcon(glyph, stage.icon);
	const copy = dom.append(content, dom.$('div.ade-explore-stage-copy'));
	const live = dom.append(copy, dom.$('div.ade-explore-live', { role: 'status' }));
	dom.append(live, dom.$('h2')).textContent = stage.title;
	if (state.phase === 'ready') {
		dom.append(live, dom.$('p')).textContent = localize('ade.codeUpdate.writeScope', "The AI uses these saved changes and edits the relevant project files locally.");
	}
	if (state.status) { dom.append(live, dom.$('p')).textContent = state.status; }
	if (state.phase === 'failed') {
		dom.append(live, dom.$('p')).textContent = localize('ade.codeUpdate.reviewPartial', "Inspect any local edits before retrying.");
	}
	if (state.durationMs !== undefined && finished) {
		dom.append(live, dom.$('p')).textContent = localize('ade.codeUpdate.elapsed', "Elapsed time · {0}", getDurationString(state.durationMs, true));
	}
	const buttons = dom.append(body, dom.$('div.ade-explore-actions'));
	if (running) {
		button(buttons, state.stopping ? localize('ade.explore.stopping', "Stopping…") : localize('ade.codeUpdate.stop', "Stop Update"), Codicon.debugStop, actions.stop, 'code-update-stop').disabled = !!state.stopping;
		dom.append(card, dom.$('progress.ade-explore-progress', { 'aria-label': localize('ade.codeUpdate.progress', "Codebase update progress") }));
	} else if (state.canRefresh || state.phase === 'ready' || state.phase === 'failed' || state.phase === 'cancelled') {
		const next = state.canRefresh
			? button(buttons, localize('ade.codeUpdate.refresh', "Refresh Changes"), Codicon.refresh, actions.refresh, 'code-update-refresh', true)
			: button(buttons, state.phase === 'ready' ? localize('ade.codeUpdate.start', "Start Update") : localize('ade.codeUpdate.retry', "Retry Update"), Codicon.play, actions.start, 'code-update-start', true);
		if (actions.startReason) {
			next.disabled = true;
			const reason = dom.append(copy, dom.$('p.ade-explore-notice', { id: 'ade-code-update-disabled' }));
			reason.textContent = actions.startReason;
			next.setAttribute('aria-describedby', reason.id);
		}
	}
	if (finished) { button(buttons, localize('ade.codeUpdate.files', "Open Project Files"), Codicon.files, actions.openFiles, 'code-update-files', state.phase === 'completed'); }
	if (state.summary) {
		const result = dom.append(panel, dom.$('section.ade-explore-plan-group'));
		dom.append(result, dom.$('h3')).textContent = localize('ade.codeUpdate.result', "Implementation Summary");
		dom.append(result, dom.$('p.ade-code-update-summary')).textContent = state.summary;
	}
	if (state.changes.length) {
		const section = dom.append(panel, dom.$('section.ade-explore-plan-group'));
		dom.append(section, dom.$('h3')).textContent = state.changes.length === 1 ? localize('ade.codeUpdate.singleChange', "1 Saved Change") : localize('ade.codeUpdate.changeCount', "{0} Saved Changes", state.changes.length);
		const list = dom.append(section, dom.$('ul.ade-explore-views'));
		for (const change of state.changes) {
			const item = dom.append(list, dom.$('li'));
			const row = dom.append(item, dom.$('div.ade-explore-view'));
			dom.append(row, dom.$('strong')).textContent = change.label;
			dom.append(row, dom.$('span.ade-explore-tag')).textContent = changeLabels[change.kind];
			if (change.fields?.length) { dom.append(item, dom.$('p')).textContent = localize('ade.codeUpdate.fields', "Changed fields · {0}", change.fields.join(', ')); }
			if (change.preview?.length) {
				const detail = controls.details(item, localize('ade.codeUpdate.showValues', "Before and After"), `code-update-change:${state.id}:${change.collection}:${change.id}`);
				for (const entry of change.preview) {
					dom.append(detail, dom.$('strong')).textContent = entry.field;
					const values = dom.append(detail, dom.$('dl.ade-code-update-values'));
					for (const [label, value] of [[localize('ade.codeUpdate.before', "Before"), entry.before], [localize('ade.codeUpdate.after', "After"), entry.after]]) {
						const pair = dom.append(values, dom.$('div'));
						dom.append(pair, dom.$('dt')).textContent = label;
						dom.append(pair, dom.$('dd')).textContent = value || localize('ade.codeUpdate.emptyValue', "Empty");
					}
				}
			}
		}
	}
	return panel;
}
