import { Event, Emitter } from '../../../../base/common/event.js';
import { Server } from '../../../../base/parts/ipc/node/ipc.mp.js';
import { IServerChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { orditoCodeChannel, CliAccountRequest, CliExecutableRequest, CliRuntimeEnvironment, CodeBridgeProtocol, CodeEngine, CodeAiProgress } from '../common/codeBridge.js';
import { resolveCliExecutable } from './orditoCliExecutable.js';
import { checkCliAccount, cliEnvironment } from './orditoCliAccount.js';

// Bundled with its parser grammars and compiler libraries by the client build.
const engineModule = './orditoCodeEngine.js';
const { engine, codeBridgeProtocol }: { engine: CodeEngine; codeBridgeProtocol?: CodeBridgeProtocol } = await import(engineModule);
const progress = new Emitter<CodeAiProgress>();
const channel: IServerChannel = {
	listen: (_context, event) => event === 'aiProgress' ? progress.event : Event.None,
	async call<T>(_context: string, command: string, input: unknown, token = CancellationToken.None): Promise<T> {
		if (command === 'protocol') { return codeBridgeProtocol as T; }
		if (command === 'resolveCli') { return await resolveCliExecutable(input as CliExecutableRequest) as T; }
		if (command === 'checkCliAccount') { return await checkCliAccount(input as CliAccountRequest) as T; }
		if (command === 'collaborate' || command === 'reconcile') {
			const request = input as { request: string; runtime: CliRuntimeEnvironment };
			if (typeof request?.request !== 'string' || !request.runtime || Object.values(request.runtime).some(value => value !== undefined && typeof value !== 'string')) { throw new Error('Invalid collaboration request'); }
			const before = { PATH: process.env.PATH, PATHEXT: process.env.PATHEXT, CODEX_HOME: process.env.CODEX_HOME };
			const environment = cliEnvironment(request.runtime);
			for (const key of Object.keys(before)) { if (environment[key] === undefined) { delete process.env[key]; } else { process.env[key] = environment[key]; } }
			try { return await channel.call<T>(_context, 'execute', command === 'collaborate' ? JSON.stringify({ operation: 'collaboration', request: request.request }) : request.request, token); }
			finally { for (const [key, value] of Object.entries(before)) { if (value === undefined) { delete process.env[key]; } else { process.env[key] = value; } } }
		}
		if (command !== 'execute' || typeof input !== 'string') { throw new Error('Invalid analysis request'); }
		const controller = new AbortController();
		const listener = token.onCancellationRequested(() => controller.abort());
		try { if (token.isCancellationRequested) { controller.abort(); } return await engine.execute(input, controller.signal, event => progress.fire(event)) as T; }
		finally { listener.dispose(); }
	}
};
const server = new Server();
server.registerChannel(orditoCodeChannel, channel);
