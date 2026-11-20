import { constants, promises as fs } from 'fs';
import { findExecutable } from '../../../../base/node/processes.js';
import { CliExecutableRequest } from '../common/codeBridge.js';

/** Resolve the original CLI without launching it or reading provider credentials. */
export async function resolveCliExecutable(request: CliExecutableRequest): Promise<string | undefined> {
	if (!request || typeof request.executable !== 'string' || !request.executable.trim() || request.executable.includes('\0')
		|| request.path !== undefined && typeof request.path !== 'string' || request.pathExt !== undefined && typeof request.pathExt !== 'string') {
		throw new Error('Invalid CLI executable lookup');
	}
	return findExecutable(request.executable, undefined, undefined, {
		PATH: request.path ?? process.env.PATH, PATHEXT: request.pathExt ?? process.env.PATHEXT
	}, async path => {
		try {
			if (!(await fs.stat(path)).isFile()) { return false; }
			await fs.access(path, constants.X_OK);
			return true;
		} catch (error) {
			if (error.code === 'ENOENT' || error.code === 'ENOTDIR' || error.code === 'EACCES' || error.code === 'EPERM') { return false; }
			throw error;
		}
	});
}
