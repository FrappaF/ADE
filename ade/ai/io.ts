import { open } from 'node:fs/promises';
import { constants } from 'node:fs';

/** Bounds memory even if an external process grows the file after stat. */
export async function readBoundedText(path: string, maxBytes: number): Promise<string> {
	const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
	try {
		const info = await handle.stat();
		if (!info.isFile() || info.size > maxBytes) { throw new Error('Artifact is oversized or is not a regular file'); }
		const buffer = Buffer.alloc(maxBytes + 1);
		let length = 0;
		while (length < buffer.length) {
			const result = await handle.read(buffer, length, buffer.length - length, null);
			if (!result.bytesRead) { break; }
			length += result.bytesRead;
		}
		if (length > maxBytes) { throw new Error('Artifact exceeds its byte limit'); }
		return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length));
	} finally { await handle.close(); }
}
