/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { Server } from '../../../../base/parts/ipc/node/ipc.mp.js';
import { IServerChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { adeCodeChannel, CodeEngine } from '../common/codeBridge.js';

// Bundled with its parser grammars and compiler libraries by the client build.
const engineModule = './adeCodeEngine.js';
const { engine }: { engine: CodeEngine } = await import(engineModule);
const channel: IServerChannel = {
	listen: () => Event.None,
	async call<T>(_context: unknown, command: string, input: unknown, token = CancellationToken.None): Promise<T> {
		if (command !== 'execute' || typeof input !== 'string') { throw new Error('Invalid analysis request'); }
		const controller = new AbortController();
		const listener = token.onCancellationRequested(() => controller.abort());
		try { if (token.isCancellationRequested) { controller.abort(); } return await engine.execute(input, controller.signal) as T; }
		finally { listener.dispose(); }
	}
};
const server = new Server();
server.registerChannel(adeCodeChannel, channel);
