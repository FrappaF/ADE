/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TerminalLocation, IShellLaunchConfig } from '../../../../platform/terminal/common/terminal.js';
import type { ITerminalService, ITerminalGroupService, ITerminalInstance } from '../../terminal/browser/terminal.js';

/** A hidden terminal cannot finish focusWhenReady: reveal its panel before awaiting focus. */
export async function openAdeTerminal(terminals: ITerminalService, groups: ITerminalGroupService, config: IShellLaunchConfig): Promise<ITerminalInstance> {
	const terminal = await terminals.createTerminal({ config, location: TerminalLocation.Panel });
	terminals.setActiveInstance(terminal);
	await groups.showPanel(true);
	await terminal.focusWhenReady();
	return terminal;
}
