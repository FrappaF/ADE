/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { localize } from '../../../../nls.js';
import type { ModelTaskPacket } from '../common/modelTaskContext.js';
import type { AdeControls } from './adeControls.js';

/** Quiet native disclosures distinguish actual bytes, unknown cost and the exact data to be shared. */
export function renderModelTaskPreview(parent: HTMLElement, packet: ModelTaskPacket, controls: AdeControls): void {
	const section = controls.details(parent, localize('ade.task.preview', "Structural AI Context Preview"), 'structural-context');
	dom.append(section, dom.$('p')).textContent = localize('ade.task.measurement', "{0} UTF-8 bytes · {1} estimated tokens · Price unavailable · No inference started", packet.byteLength, packet.metrics.estimatedTokens);
	dom.append(section, dom.$('p')).textContent = localize('ade.task.counts', "{0} complete definitions · {1} boundaries · {2} gaps", packet.definitions.length, packet.boundaries.length, packet.gaps.length);
	for (const gap of packet.gaps) { dom.append(section, dom.$('p')).textContent = localize('ade.task.gap', "{0}: {1}", gap.reference, gap.reason); }
	const exact = controls.details(section, localize('ade.task.exact', "Exact Disclosed Packet and Write Scope"), 'structural-context-bytes');
	const pre = dom.append(exact, dom.$('pre')); pre.tabIndex = 0; pre.textContent = JSON.stringify(JSON.parse(packet.bytes), null, '\t');
	pre.setAttribute('aria-label', localize('ade.task.exact', "Exact Disclosed Packet and Write Scope"));
}
