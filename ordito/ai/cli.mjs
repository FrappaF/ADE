import { open, unlink, realpath } from 'node:fs/promises';
import { resolve, dirname, basename, join } from 'node:path';
import '../scripts/source-loader.mjs';
const { executeCollaboration } = await import('./engine.ts');
const { outputOutsideSource } = await import('../code-import/paths.ts');
const { readSnapshot } = await import('../code-import/snapshot.ts');

const controller = new AbortController();
const cancel = () => controller.abort();
process.on('SIGINT', cancel);
process.on('SIGTERM', cancel);
async function json(path) {
	const handle = await open(path, 'r');
	try {
		if (!(await handle.stat()).isFile()) { throw new Error('Input must be a regular file'); }
		const buffer = Buffer.alloc(4 * 1024 * 1024 + 1);
		let length = 0;
		while (length < buffer.length) {
			const read = await handle.read(buffer, length, buffer.length - length, null);
			if (!read.bytesRead) { break; }
			length += read.bytesRead;
		}
		if (length === buffer.length) { throw new Error('Input exceeds 4 MiB'); }
		try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length))); }
		catch { throw new Error('Input must contain valid UTF-8 JSON'); }
	} finally { await handle.close(); }
}

try {
	const [operation, input, selection, output, ...extra] = process.argv.slice(2);
	let request, destination;
	if (operation === 'prepare' && input && selection && output && !extra.length) {
		request = { operation: 'prepare', request: await json(input), config: await json(selection) }; destination = output;
	} else if (operation === 'propose' && input && selection && output && !extra.length) {
		request = { operation: 'plan', prepared: await json(input), reviewId: selection }; destination = output;
	} else if (operation === 'run' && input && selection && !output) {
		request = await json(input); destination = selection;
	} else {
		throw new Error('Usage: node ordito/ai/cli.mjs prepare REQUEST.json CONFIG.json NEW_REVIEW.json\n   or: node ordito/ai/cli.mjs propose REVIEW.json REVIEW_ID NEW_PLAN.json\n   or: node ordito/ai/cli.mjs run OPERATION.json NEW_RESULT.json');
	}
	const snapshotPath = request.request?.snapshot ?? request.prepared?.request?.snapshot;
	const sourceRoot = snapshotPath ? (await readSnapshot(snapshotPath)).state.sourceRoot : request.root;
	destination = sourceRoot ? await outputOutsideSource(destination, sourceRoot) : join(await realpath(dirname(resolve(destination))), basename(resolve(destination)));
	const handle = await open(destination, 'wx', 0o600);
	try {
		const result = JSON.parse(await executeCollaboration(JSON.stringify(request), controller.signal));
		controller.signal.throwIfAborted();
		await handle.writeFile(JSON.stringify(result, null, '\t') + '\n');
		console.log(JSON.stringify({ result: destination, status: result.status ?? 'complete', reviewId: result.reviewId, planId: result.planId, id: result.id }));
	} catch (error) {
		await handle.close();
		await unlink(destination);
		throw error;
	} finally { await handle.close(); }
} catch (error) {
	console.error(controller.signal.aborted ? 'Operation cancelled' : error instanceof Error ? error.message : 'Operation failed');
	process.exitCode = 1;
} finally {
	process.off('SIGINT', cancel);
	process.off('SIGTERM', cancel);
}
