import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { type ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { prependOrditoIcon } from './orditoIcons.js';

export function renderOrditoWorkflowSteps(parent: HTMLElement, label: string, steps: readonly { label: string; icon: ThemeIcon }[], current: number): void {
	const list = dom.append(parent, dom.$('ol.ordito-explore-steps', { 'aria-label': label }));
	for (const [index, step] of steps.entries()) {
		const state = index < current ? 'complete' : index === current ? 'current' : 'pending';
		const item = dom.append(list, dom.$('li', { 'data-state': state }));
		if (state === 'current') { item.setAttribute('aria-current', 'step'); }
		const marker = dom.append(item, dom.$('span.ordito-explore-step-icon'));
		prependOrditoIcon(marker, state === 'complete' ? Codicon.check : step.icon);
		dom.append(item, dom.$('span.ordito-explore-step-label')).textContent = step.label;
		if (state === 'complete') { item.setAttribute('aria-label', localize('ordito.explore.stepComplete', "{0} complete", step.label)); }
	}
}
