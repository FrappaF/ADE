import { localize } from '../../../../nls.js';
import * as dom from '../../../../base/browser/dom.js';
import { type SemanticModelV4 } from '../common/modelTypes.js';
import { type OrditoControls } from './orditoControls.js';
import { orditoMessagingRows } from './orditoMessagingContent.js';

export function renderOrditoMessaging(parent: HTMLElement, model: SemanticModelV4, id: string, controls: OrditoControls, select: (id: string) => void): void {
	const section = dom.append(parent, dom.$('section')); section.setAttribute('aria-label', localize('ordito.messaging.detail', "Messaging Details"));
	for (const row of orditoMessagingRows(model, id)) { const p = dom.append(section, dom.$('p')); p.dataset.messagingId = row.id; if (model.semantics.elements.some(element => element.id === row.id)) { controls.button(p, row.label, () => select(row.id), 'messaging:' + row.id); } dom.append(p, dom.$('span')).textContent = row.text; }
}
