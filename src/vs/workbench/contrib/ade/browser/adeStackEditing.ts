import { localize } from '../../../../nls.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { type IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { type IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { modelProjectProfile } from '../common/modelProfiles.js';
import { modelStackPlan, switchModelStack } from '../common/modelStack.js';
import { type SemanticModelV4 } from '../common/modelTypes.js';
import { type VisualEdit } from '../common/visualEditing.js';

/** One detached atomic binding edit; source, test and data publication still require the shared review. */
export async function editAdeStack(quickInput: Pick<IQuickInputService, 'pick'>, model: SemanticModelV4, dialogs: Pick<IDialogService, 'confirm'>): Promise<VisualEdit[] | undefined> {
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
	const next = switchModelStack(model, selected.profileId), plan = await modelStackPlan(model, next);
	const confirmation = await dialogs.confirm({
		message: localize('ade.stack.plan', "Review Runtime Change · {0} → {1}", `${current.toolchain.runtime === 'bun' ? 'Bun' : 'Node'} ESM ${current.toolchain.version}`, selected.label),
		detail: localize('ade.stack.planDetail', "Implementation\n{0}\n\nDependencies\n{1}\n\nStorage and Data\n{2}\n\nTests\n{3}\n\nDeployment\n{4}\n\nRecovery\n{5}", plan.implementation, plan.dependencies, plan.storage, plan.tests, plan.deployment, plan.recovery),
		primaryButton: localize('ade.stack.applyBindings', "Change Runtime Bindings")
	});
	if (!confirmation.confirmed) { return; }
	return next.foundation.platform.bindings.map(entry => ({ kind: 'platformBinding', entry }));
}
