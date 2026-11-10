/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType, IAccessibleViewService } from '../../../../platform/accessibility/browser/accessibleView.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { localize2 } from '../../../../nls.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { AccessibilityHelpAction, AccessibleViewAction } from '../../accessibility/browser/accessibleViewActions.js';
import { adeFocusedSurface } from './adeAccessibilityContext.js';
import { describeAdeDiagram, describeAdeHelp } from './adeAccessibleContent.js';
import { AdeEditor } from './adeEditor.js';
import { IAdeProjectService } from './adeProjectService.js';
import { ADE_VIEW_ID, AdeView } from './adeView.js';

/** Both native entry points share current project state and stay scoped to ADE focus. */
abstract class AdeAccessibleImplementation implements IAccessibleViewImplementation {
	readonly priority = 110;
	readonly when = ContextKeyExpr.or(adeFocusedSurface.isEqualTo('editor'), adeFocusedSurface.isEqualTo('navigation'));
	abstract readonly name: string;
	abstract readonly type: AccessibleViewType;

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider | undefined {
		const project = accessor.get(IAdeProjectService);
		const editorService = accessor.get(IEditorService);
		const viewsService = accessor.get(IViewsService);
		const surface = accessor.get(IContextKeyService).getContext(dom.getActiveElement()).getValue<string>(adeFocusedSurface.key);
		if (surface !== 'editor' && surface !== 'navigation') { return undefined; }
		const editor = editorService.activeEditorPane;
		const navigation = viewsService.getActiveViewWithId<AdeView>(ADE_VIEW_ID);
		const origin = surface === 'navigation' ? navigation : editor instanceof AdeEditor ? editor : undefined;
		if (!origin) { return undefined; }
		const restoreFocus = origin.captureAccessibilityFocus();
		const resource = project.modelUri?.toString();
		const content = () => this.type === AccessibleViewType.Help ? describeAdeHelp(project) : origin instanceof AdeEditor ? origin.describeCurrentContext() : describeAdeDiagram(project);
		return new AccessibleContentProvider(AccessibleViewProviderId.Ade,
			{ type: this.type, language: 'plaintext', customHelp: () => describeAdeHelp(project) }, content,
			() => {
				if (surface === 'editor' && editorService.activeEditorPane !== origin) { return; }
				if (surface === 'navigation' && viewsService.getActiveViewWithId<AdeView>(ADE_VIEW_ID) !== origin) { return; }
				if (resource === project.modelUri?.toString()) { restoreFocus(); } else { origin.focus(); }
			}, AccessibilityVerbositySettingId.Ade, undefined, undefined, undefined, undefined, origin instanceof AdeEditor ? origin.onDidChangeReading : project.onDidChange);
	}
}

export class AdeAccessibleView extends AdeAccessibleImplementation {
	readonly name = 'ade-diagram';
	readonly type = AccessibleViewType.View;
}

export class AdeAccessibilityHelp extends AdeAccessibleImplementation {
	readonly name = 'ade-help';
	readonly type = AccessibleViewType.Help;
}

/** Cover native keybindings before the registry dispatcher reaches the Eventually phase. */
export function registerAdeAccessibleStartup(implementation: IAccessibleViewImplementation): IDisposable {
	const command = implementation.type === AccessibleViewType.View ? AccessibleViewAction : AccessibilityHelpAction;
	return command.addImplementation(implementation.priority - 1, `${implementation.name}-startup`, accessor => {
		const provider = implementation.getProvider(accessor);
		if (!provider) { return false; }
		try { accessor.get(IAccessibleViewService).show(provider); return true; }
		catch { provider.dispose(); return false; }
	}, implementation.when);
}

// Native registry dispatch is installed in the Eventually phase. ADE's explicit reading
// control must also work immediately after startup, using the same provider and service.
registerAction2(class extends Action2 {
	constructor() {
		super({ id: 'ade.readContext', title: localize2('ade.readContext', "A.D.E: Read Current Context"), f1: true,
			precondition: ContextKeyExpr.or(adeFocusedSurface.isEqualTo('editor'), adeFocusedSurface.isEqualTo('navigation')) });
	}
	run(accessor: ServicesAccessor): void {
		const provider = new AdeAccessibleView().getProvider(accessor);
		if (provider) {
			try { accessor.get(IAccessibleViewService).show(provider); }
			catch (error) { provider.dispose(); throw error; }
		}
	}
});
