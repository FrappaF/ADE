/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';

export const adeFocusedSurface = new RawContextKey<string>('adeFocusedSurface', '', localize('ade.focusedSurface', "The focused A.D.E workbench surface."));

/** Resolve actual user keybindings and honor the feature's verbosity setting. */
export function getAdeAccessibilityHint(configuration: IConfigurationService, keybindings: IKeybindingService): string {
	if (!configuration.getValue<boolean>(AccessibilityVerbositySettingId.Ade)) { return ''; }
	const help = keybindings.lookupKeybinding('editor.action.accessibilityHelp')?.getAriaLabel();
	const view = keybindings.lookupKeybinding('editor.action.accessibleView')?.getAriaLabel();
	return help && view
		? localize('ade.accessibilityHint', "Use {0} for Accessibility Help or {1} to read the diagram as text.", help, view)
		: localize('ade.accessibilityHintUnassigned', "Use Open Accessibility Help or Open Accessible View from the Command Palette.");
}
