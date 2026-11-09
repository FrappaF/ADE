/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import type { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { modelProjectProfile } from '../common/modelProfiles.js';
import { switchModelStack } from '../common/modelStack.js';
import type { SemanticModelV4 } from '../common/semanticModel.js';
import type { VisualEdit } from '../common/visualEditing.js';

/** One detached atomic binding edit; source, test and data publication still require the shared review. */
export async function editAdeStack(quickInput: Pick<IQuickInputService, 'pick'>, model: SemanticModelV4): Promise<VisualEdit[] | undefined> {
	const selected = await quickInput.pick([
		{ label: 'Node ESM 24.22.1', profileId: 'node.esm', technology: 'node-esm' },
		{ label: 'Bun ESM 1.3.2', profileId: 'bun.esm', technology: 'bun-esm' }
	], { title: localize('ade.stack.choose', "Choose Project Runtime") });
	if (!selected) { return; }
	let current;
	try { current = modelProjectProfile(model); } catch { /* A first binding can complete a draft. */ }
	if (!current) {
		const element = await quickInput.pick(model.semantics.elements.filter(element => element.kind === 'container' && ['application', 'service'].includes(element.runtimeKind ?? '')).map(element => ({ label: element.name, element })), { title: localize('ade.stack.container', "Choose Application Container") });
		if (!element) { return; }
		const bindings = model.foundation.platform.bindings.filter(binding => binding.elementId === element.element.id);
		if (bindings.length > 1) { throw new Error(localize('ade.stack.ambiguous', "Resolve Multiple Container Bindings Before Choosing a Runtime.")); }
		return [{ kind: 'platformBinding', entry: { id: bindings[0]?.id ?? generateUuid(), elementId: element.element.id, profileId: selected.profileId, technology: { state: 'known', value: selected.technology } } }];
	}
	if (current.profile.id === selected.profileId) { return []; }
	const confirmation = await quickInput.pick([{ label: localize('ade.stack.applyBindings', "Change Runtime Bindings"), description: selected.label }], { title: localize('ade.stack.plan', "Preserve Model and IDs · Verify Code and Business Tests Again · Stop/Back Up Data Before Manual Restart") });
	if (!confirmation) { return; }
	return switchModelStack(model, selected.profileId).foundation.platform.bindings.map(entry => ({ kind: 'platformBinding', entry }));
}
