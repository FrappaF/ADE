import { Event } from '../../../../base/common/event.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { CliAccountState, CodeContext, CodeRequest, CodeAiProgress } from '../common/codeBridge.js';

export const IOrditoCodeService = createDecorator<IOrditoCodeService>('orditoCodeService');
export interface IOrditoCodeService {
	readonly _serviceBrand: undefined;
	readonly available: boolean;
	readonly busy: boolean;
	readonly changed: boolean;
	readonly status: string;
	readonly context: CodeContext | undefined;
	readonly onDidChange: Event<void>;
	readonly onDidAiProgress: Event<CodeAiProgress>;
	importCodebase(): Promise<void>;
	/** Use the open project's codebase, preserving its model; ask for a folder only without an open project. */
	ensureProjectContext(): Promise<boolean>;
	sync(direction?: 'model' | 'code'): Promise<void>;
	openContext(context: CodeContext): Promise<void>;
	inspect(elementId?: string): Promise<void>;
	recover(): Promise<void>;
	undoSync(): Promise<void>;
	attachIndex(): Promise<void>;
	configure(): Promise<void>;
	resolveCli(executable: string): Promise<string | undefined>;
	checkCliAccount(provider: 'codex' | 'claude', executable: string): Promise<CliAccountState>;
	executeCollaboration(request: string, token?: CancellationToken): Promise<string>;
	executeReconciliation(request: CodeRequest, token?: CancellationToken): Promise<string>;
}
class UnavailableCodeService implements IOrditoCodeService {
	declare readonly _serviceBrand: undefined;
	readonly available = false; readonly busy = false; readonly changed = false; readonly context = undefined;
	readonly status = '';
	readonly onDidChange = Event.None;
	readonly onDidAiProgress = Event.None;
	async importCodebase(): Promise<void> { }
	async ensureProjectContext(): Promise<boolean> { return false; }
	async sync(): Promise<void> { }
	async openContext(): Promise<void> { }
	async inspect(): Promise<void> { }
	async recover(): Promise<void> { }
	async undoSync(): Promise<void> { }
	async attachIndex(): Promise<void> { }
	async configure(): Promise<void> { }
	async resolveCli(): Promise<string | undefined> { throw new Error('CLI lookup is unavailable'); }
	async checkCliAccount(): Promise<CliAccountState> { return { status: 'unavailable', reason: 'notFound' }; }
	async executeCollaboration(): Promise<string> { throw new Error('Code collaboration is unavailable'); }
	async executeReconciliation(): Promise<string> { throw new Error('Reconciliation is unavailable'); }
}
registerSingleton(IOrditoCodeService, UnavailableCodeService, InstantiationType.Delayed);
