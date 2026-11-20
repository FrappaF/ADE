import * as dom from '../../../../base/browser/dom.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { OrditoControls } from './orditoControls.js';
import { type OrditoErrorInfo } from './orditoErrors.js';

/** A non-modal explanation shared by forms, project failures and recoverable operations. */
export function renderOrditoErrorNotice(parent: HTMLElement, error: OrditoErrorInfo, controls: OrditoControls): HTMLElement {
	const notice = dom.append(parent, dom.$('section.ordito-error-notice', { role: 'alert' }));
	const title = dom.append(notice, dom.$('h3', { id: generateUuid() }));
	title.textContent = error.title;
	notice.setAttribute('aria-labelledby', title.id);
	const explanation = dom.append(notice, dom.$('dl'));
	for (const [label, value] of [
		[localize('ordito.error.causeLabel', "Cause"), error.cause],
		[localize('ordito.error.resolutionLabel', "How to Resolve"), error.resolution]
	]) {
		dom.append(explanation, dom.$('dt')).textContent = label;
		dom.append(explanation, dom.$('dd')).textContent = value;
	}
	if (error.details) {
		const details = controls.details(notice, localize('ordito.properties.technical', "Technical Details"), `error-details:${error.title}:${error.details}`);
		dom.append(details, dom.$('pre')).textContent = error.details;
	}
	return notice;
}
