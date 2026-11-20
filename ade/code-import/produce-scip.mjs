import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

const [language, toolsDirectory, ...extra] = process.argv.slice(2);
if (!['typescript', 'python'].includes(language) || !toolsDirectory || extra.length) {
	console.error('Usage: node ade/code-import/produce-scip.mjs typescript|python EXTERNAL_NPM_TOOLS_DIRECTORY');
	process.exitCode = 1;
} else {
	const directory = await mkdtemp(join(tmpdir(), 'ade-scip-producer-'));
	const controller = new AbortController();
	const cancel = () => controller.abort(new Error('SCIP producer cancelled'));
	process.on('SIGINT', cancel);
	process.on('SIGTERM', cancel);
	try {
		const modules = join(resolve(toolsDirectory), 'node_modules', '@sourcegraph');
		const output = join(directory, 'index.scip');
		const program = language === 'typescript' ? join(modules, 'scip-typescript', 'dist', 'src', 'main.js') : join(modules, 'scip-python', 'index.js');
		const args = language === 'typescript' ? ['index', '--cwd', process.cwd(), '--output', output, '--no-progress-bar'] : ['index', '--cwd', process.cwd(), '--output', output, '--project-name', 'ade-local', '--project-version', '0', '--environment', join(directory, 'environment.json'), '--quiet'];
		// The Python demo deliberately indexes only the local project, with no implicit pip inspection.
		if (language === 'python') { await writeFile(join(directory, 'environment.json'), '[]\n'); }
		const { stdout, stderr } = await promisify(execFile)(process.execPath, [program, ...args], { maxBuffer: 64 * 1024 * 1024, signal: controller.signal });
		if (stdout) { process.stderr.write(stdout); }
		if (stderr) { process.stderr.write(stderr); }
		// Use the indexer's official generated protobuf bindings, not a handwritten binary decoder.
		const require = createRequire(import.meta.url);
		const { scip } = require(join(modules, 'scip-typescript', 'dist', 'src', 'scip.js'));
		if ((await stat(output)).size > 64 * 1024 * 1024) { throw new Error('Binary SCIP index exceeds 64 MiB'); }
		const index = scip.Index.deserializeBinary(await readFile(output)).toObject();
		process.stdout.write(JSON.stringify(index) + '\n');
	} catch (error) { console.error(error.message); process.exitCode = 1; }
	finally { process.off('SIGINT', cancel); process.off('SIGTERM', cancel); await rm(directory, { recursive: true, force: true }); }
}
