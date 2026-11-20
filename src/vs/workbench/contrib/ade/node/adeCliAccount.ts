import { execFile } from 'child_process';
import { CliAccountRequest, CliAccountState, CliRuntimeEnvironment } from '../common/codeBridge.js';
import { resolveCliExecutable } from './adeCliExecutable.js';

/** Only runtime selectors cross the bridge; credentials remain in the provider's own environment. */
export function cliEnvironment(runtime: CliRuntimeEnvironment): NodeJS.ProcessEnv {
	const env = { ...process.env };
	if (runtime.path !== undefined) { env.PATH = runtime.path; }
	if (runtime.pathExt !== undefined) { env.PATHEXT = runtime.pathExt; }
	if (runtime.codexHome !== undefined) { env.CODEX_HOME = runtime.codexHome; }
	return env;
}

/** Official, bounded account-status commands. Provider output is interpreted locally and never returned. */
export async function checkCliAccount(request: CliAccountRequest): Promise<CliAccountState> {
	if (!request || !['codex', 'claude'].includes(request.provider) || request.codexHome !== undefined && typeof request.codexHome !== 'string') { throw new Error('Invalid CLI account request'); }
	const executable = await resolveCliExecutable(request);
	if (!executable) { return { status: 'unavailable', reason: 'notFound' }; }
	return new Promise(resolve => {
		execFile(executable, request.provider === 'codex' ? ['login', 'status'] : ['auth', 'status', '--json'], { env: cliEnvironment(request), timeout: 8000, maxBuffer: 65536, windowsHide: true }, (error, stdout, stderr) => {
			const output = stdout + '\n' + stderr;
			if (request.provider === 'codex') {
				if (!error && /logged in|authenticated/i.test(output) && !/not logged in|unauthenticated/i.test(output)) { resolve({ status: 'signedIn', executable }); return; }
				if (/not logged in|not authenticated|unauthenticated/i.test(output)) { resolve({ status: 'signedOut', executable }); return; }
			} else {
				try {
					const status: { loggedIn?: boolean } = JSON.parse(stdout);
					if (typeof status.loggedIn === 'boolean' && (!error || !status.loggedIn)) { resolve({ status: status.loggedIn ? 'signedIn' : 'signedOut', executable }); return; }
				} catch { /* Older CLIs may not support a structured status command. */ }
			}
			resolve({ status: 'error', executable, reason: error?.killed ? 'timeout' : /unknown|unrecognized|unexpected.*(argument|option)/i.test(output) ? 'unsupported' : 'failed' });
		});
	});
}
