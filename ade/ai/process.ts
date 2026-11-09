/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';

/** Argument vectors only; bounded output, deadline and process-group cancellation. */
export async function runProcess(executable: string, args: string[], cwd: string, options: { input?: string; signal?: AbortSignal; timeoutMs?: number; maxBytes?: number; env?: NodeJS.ProcessEnv; gracefulShutdownMs?: number } = {}) {
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
		options.signal?.addEventListener('abort', cancel, { once: true });
		const append = (chunk: Buffer, target: 'stdout' | 'stderr') => {
			bytes += chunk.length;
			if (bytes > (options.maxBytes ?? 2 * 1024 * 1024)) { stop('Process output exceeds limit'); return; }
			if (target === 'stdout') { stdout += decoders.stdout.write(chunk); } else { stderr += decoders.stderr.write(chunk); }
		};
		child.stdout.on('data', chunk => append(chunk, 'stdout'));
		child.stderr.on('data', chunk => append(chunk, 'stderr'));
		child.stdin.on('error', () => { /* close/error is reported below */ });
		child.on('error', () => { failure ??= new Error('Executable is unavailable or could not be started'); });
		child.on('close', code => {
			if (shutdownTimer) { clearTimeout(shutdownTimer); }
			clearTimeout(timer); options.signal?.removeEventListener('abort', cancel);
			stdout += decoders.stdout.end(); stderr += decoders.stderr.end();
			if (failure) { reject(failure); } else { resolve({ code: code ?? -1, stdout, stderr }); }
		});
		if (options.signal?.aborted) { cancel(); }
		child.stdin.end(options.input ?? '');
	});
}
