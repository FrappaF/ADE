/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';

/** Argument vectors only; bounded output, deadline and process-group cancellation. */
export async function runProcess(executable: string, args: string[], cwd: string, options: { input?: string; signal?: AbortSignal; timeoutMs?: number; maxBytes?: number; env?: NodeJS.ProcessEnv; gracefulShutdownMs?: number; onOutput?: (text: string, stream: 'stdout' | 'stderr') => void; startupTimeoutMs?: number } = {}) {
	options.signal?.throwIfAborted();
	return new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
		// Checks inside the external desktop runner stay in its group so cancellation also kills descendants.
		const ownGroup = process.platform !== 'win32' && process.env.ADE_TRUSTED_NODE_CHILD !== '1';
		const child = spawn(executable, args, { cwd, env: options.env ?? process.env, shell: false, windowsHide: true, detached: ownGroup, stdio: ['pipe', 'pipe', 'pipe'] });
		let stdout = '', stderr = '', bytes = 0;
		const decoders = { stdout: new StringDecoder('utf8'), stderr: new StringDecoder('utf8') };
		let failure: Error | undefined;
		let shutdownTimer: ReturnType<typeof setTimeout> | undefined;
		const kill = () => { try { if (ownGroup && child.pid) { process.kill(-child.pid, 'SIGKILL'); } else { child.kill('SIGKILL'); } } catch { /* already exited */ } };
		const stop = (message: string) => {
			failure ??= new Error(message);
			if (shutdownTimer) { return; }
			if (options.gracefulShutdownMs) { child.kill('SIGTERM'); shutdownTimer = setTimeout(kill, options.gracefulShutdownMs); }
			else { kill(); }
		};
		const cancel = () => stop('Operation cancelled');
		const timer = setTimeout(() => stop('Operation timed out'), options.timeoutMs ?? 120000);
		const startup = options.startupTimeoutMs ? setTimeout(() => stop('The provider CLI did not start responding. Check the connection and selected model in AI Settings, then retry.'), options.startupTimeoutMs) : undefined;
		options.signal?.addEventListener('abort', cancel, { once: true });
		const append = (chunk: Buffer, target: 'stdout' | 'stderr') => {
			bytes += chunk.length;
			if (bytes > (options.maxBytes ?? 2 * 1024 * 1024)) { stop('Process output exceeds limit'); return; }
			const text = decoders[target].write(chunk);
			if (target === 'stdout') { if (startup) { clearTimeout(startup); } stdout += text; } else { stderr += text; }
			options.onOutput?.(text, target);
		};
		child.stdout.on('data', chunk => append(chunk, 'stdout'));
		child.stderr.on('data', chunk => append(chunk, 'stderr'));
		child.stdin.on('error', () => { /* close/error is reported below */ });
		child.on('error', () => { failure ??= new Error('Executable is unavailable or could not be started'); });
		child.on('close', code => {
			if (shutdownTimer) { clearTimeout(shutdownTimer); }
			clearTimeout(timer); if (startup) { clearTimeout(startup); } options.signal?.removeEventListener('abort', cancel);
			stdout += decoders.stdout.end(); stderr += decoders.stderr.end();
			if (failure) { reject(failure); } else { resolve({ code: code ?? -1, stdout, stderr }); }
		});
		if (options.signal?.aborted) { cancel(); }
		child.stdin.end(options.input ?? '');
	});
}
