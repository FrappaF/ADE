import * as dom from '../../../../base/browser/dom.js';
import { localize } from '../../../../nls.js';
import { type ModelTaskPacket } from '../common/modelTaskContext.js';
import { type OrditoControls } from './orditoControls.js';

/** Quiet native disclosures distinguish actual bytes, unknown cost and the exact data to be shared. */
export function renderModelTaskPreview(parent: HTMLElement, packet: ModelTaskPacket, controls: OrditoControls): void {
	const section = controls.details(parent, localize('ordito.task.preview', "Structural AI Context Preview"), 'structural-context');
	dom.append(section, dom.$('p')).textContent = localize('ordito.task.measurement', "{0} UTF-8 bytes · {1} estimated tokens · Price unavailable · No inference started", packet.byteLength, packet.metrics.estimatedTokens);
	dom.append(section, dom.$('p')).textContent = localize('ordito.task.counts', "{0} complete definitions · {1} boundaries · {2} gaps", packet.definitions.length, packet.boundaries.length, packet.gaps.length);
	for (const gap of packet.gaps) { dom.append(section, dom.$('p')).textContent = localize('ordito.task.gap', "{0}: {1}", gap.reference, gap.reason); }
	const exact = controls.details(section, localize('ordito.task.exact', "Exact Disclosed Packet and Write Scope"), 'structural-context-bytes');
	const pre = dom.append(exact, dom.$('pre')); pre.tabIndex = 0; pre.textContent = JSON.stringify(JSON.parse(packet.bytes), null, '\t');
	pre.setAttribute('aria-label', localize('ordito.task.exact', "Exact Disclosed Packet and Write Scope"));
}
