/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { AdeControls } from './adeControls.js';
import { type AdeErrorInfo } from './adeErrors.js';

/** A non-modal explanation shared by forms, project failures and recoverable operations. */
export function renderAdeErrorNotice(parent: HTMLElement, error: AdeErrorInfo, controls: AdeControls): HTMLElement {
	const notice = dom.append(parent, dom.$('section.ade-error-notice', { role: 'alert' }));
	const title = dom.append(notice, dom.$('h3', { id: generateUuid() }));
	title.textContent = error.title;
	notice.setAttribute('aria-labelledby', title.id);
	const explanation = dom.append(notice, dom.$('dl'));
	for (const [label, value] of [
		[localize('ade.error.causeLabel', "Cause"), error.cause],
		[localize('ade.error.resolutionLabel', "How to Resolve"), error.resolution]
	]) {
		dom.append(explanation, dom.$('dt')).textContent = label;
		dom.append(explanation, dom.$('dd')).textContent = value;
	}
	if (error.details) {
		const details = controls.details(notice, localize('ade.properties.technical', "Technical Details"), `error-details:${error.title}:${error.details}`);
		dom.append(details, dom.$('pre')).textContent = error.details;
	}
	return notice;
}
