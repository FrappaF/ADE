import { randomUUID } from 'node:crypto';
import { mkdir, realpath, writeFile, open, unlink } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import './source-loader.mjs';
const { createPureProject } = await import('../../src/vs/workbench/contrib/ordito/common/modelProject.ts');
const { executeCollaboration } = await import('../ai/engine.ts');
const { outputOutsideSource } = await import('../code-import/paths.ts');
const controller = new AbortController();
const cancel = () => controller.abort(); process.on('SIGINT', cancel); process.on('SIGTERM', cancel);
try {
	const [command, rootValue, ...args] = process.argv.slice(2);
	if (command === 'create' && rootValue && args.length === 1 && args[0].trim()) {
		const root = join(await realpath(dirname(resolve(rootValue))), resolve(rootValue).split('/').at(-1));
		await mkdir(root); await mkdir(join(root, '.ordito'));
		const { model, criteria } = createPureProject(args[0], randomUUID);
		await writeFile(join(root, '.ordito/model.json'), JSON.stringify(model, null, '\t') + '\n', { flag: 'wx' });
		await writeFile(join(root, '.ordito/criteria.json'), JSON.stringify(criteria, null, '\t') + '\n', { flag: 'wx' });
		console.log(JSON.stringify({ root, model: model.id, status: 'modelled', calls: 0 }));
	} else {
		const operations = { forward: 'structuralPrepare', reverse: 'structuralPrepare', verify: 'structuralVerify', apply: 'structuralApply', undo: 'structuralUndo', session: 'structuralSession', recover: 'structuralRecover' };
		if (!rootValue || !(command in operations)) { throw new Error('Usage: dai-project.mjs create NEW_FOLDER NAME | forward/reverse ROOT NEW_REPORT | verify/apply/undo ROOT SESSION REVIEW_ID NEW_REPORT | session/recover ROOT SESSION NEW_REPORT'); }
		const root = await realpath(rootValue), operation = operations[command];
		const expected = ['forward', 'reverse'].includes(command) ? 1 : ['session', 'recover'].includes(command) ? 2 : 3;
		if (args.length !== expected) { throw new Error('Invalid project command arguments'); }
		const destination = await outputOutsideSource(args.at(-1), root);
		const request = { operation, root, ...(['forward', 'reverse'].includes(command) ? { direction: command } : { id: args[0], ...(expected === 3 ? { reviewId: args[1] } : {}) }) };
		const handle = await open(destination, 'wx', 0o600);
		try {
			const result = JSON.parse(await executeCollaboration(JSON.stringify(request), controller.signal));
			await handle.writeFile(JSON.stringify(result, null, '\t') + '\n');
			console.log(JSON.stringify({ result: destination, status: result.status, id: result.session?.id ?? result.id, reviewId: result.session?.reviewId ?? result.reviewId, calls: 0 }));
		} catch (error) { await handle.close(); await unlink(destination); throw error; }
		finally { await handle.close(); }
	}
} catch (error) { console.error(error instanceof Error ? error.message : 'Project operation failed'); process.exitCode = 1; }
finally { process.off('SIGINT', cancel); process.off('SIGTERM', cancel); }
