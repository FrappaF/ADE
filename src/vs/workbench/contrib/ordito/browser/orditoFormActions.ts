import { localize } from '../../../../nls.js';
import { type IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';

/** Keep form actions in small contextual groups while preserving cancellation and a visible return path. */
export async function pickOrditoFormAction<T extends string>(quick: Pick<IQuickInputService, 'pick'>, title: string, groups: readonly { label: string; actions: readonly { label: string; value: T }[] }[], direct: readonly { label: string; value: T }[] = []): Promise<T | undefined> {
	type Group = { label: string; kind: 'group'; actions: readonly { label: string; value: T }[] };
	type Action = { label: string; kind: 'action'; value: T };
	const items: (Group | Action)[] = [...groups.filter(group => group.actions.length).map(group => ({ ...group, kind: 'group' as const })), ...direct.map(action => ({ ...action, kind: 'action' as const }))];
	while (true) {
		const choice = await quick.pick(items, { title }); if (!choice) { return; }
		if (choice.kind === 'action') { return choice.value; }
		const action = await quick.pick([...choice.actions.map(action => ({ ...action, kind: 'action' as const })), { label: localize('ordito.form.back', "Back"), kind: 'back' as const }], { title: localize('ordito.form.context', "{0} · {1}", title, choice.label) });
		if (!action) { return; }
		if (action.kind === 'action') { return action.value; }
	}
}
