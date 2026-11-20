import { TerminalLocation, IShellLaunchConfig } from '../../../../platform/terminal/common/terminal.js';
import { type ITerminalService, type ITerminalGroupService, type ITerminalInstance } from '../../terminal/browser/terminal.js';

/** A hidden terminal cannot finish focusWhenReady: reveal its panel before awaiting focus. */
export async function openOrditoTerminal(terminals: ITerminalService, groups: ITerminalGroupService, config: IShellLaunchConfig, onCreated?: (terminal: ITerminalInstance) => void): Promise<ITerminalInstance> {
	const terminal = await terminals.createTerminal({ config, location: TerminalLocation.Panel });
	onCreated?.(terminal);
	terminals.setActiveInstance(terminal);
	await groups.showPanel(true);
	await terminal.focusWhenReady();
	return terminal;
}
