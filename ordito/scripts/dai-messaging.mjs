import { readFile, writeFile, stat } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import './source-loader.mjs';
const { readSemanticModel } = await import('../../src/vs/workbench/contrib/ordito/common/semanticModel.ts');
const { compileModelMessaging, simulateMessaging } = await import('../../src/vs/workbench/contrib/ordito/common/modelMessaging.ts');
try {
	const [command, modelPath, criteriaPath, target, output] = process.argv.slice(2);
	if (command !== 'simulate' || !modelPath || !criteriaPath || !target || !output || process.argv.length !== 7) { throw new Error('Usage: dai-messaging.mjs simulate MODEL CRITERIA TARGET NEW_REPORT'); }
	for (const file of [modelPath, criteriaPath]) { if ((await stat(file)).size > 2097152) { throw new Error('Input exceeds 2 MiB'); } }
	const model = readSemanticModel(JSON.parse(await readFile(modelPath, 'utf8'))), criteria = JSON.parse(await readFile(criteriaPath, 'utf8')); if (model.version !== 4) { throw new Error('Messaging requires v4'); }
	const program = compileModelMessaging(model, target), cases = (criteria.messaging ?? []).filter(entry => entry.messagingId === target); if (!cases.length || cases.length > 1000) { throw new Error('Independent messaging cases required'); }
	const results = cases.map(entry => { const actual = simulateMessaging(program, entry.scenario); return { id: entry.id, passed: isDeepStrictEqual(actual, entry.expected), expected: entry.expected, actual }; });
	await writeFile(output, JSON.stringify({ version: 1, kind: 'messaging-simulation', network: false, persistence: false, brokerProof: false, calls: 0, results }, null, '\t') + '\n', { flag: 'wx' });
	console.log(JSON.stringify({ output, passed: results.filter(entry => entry.passed).length, failed: results.filter(entry => !entry.passed).length, brokerProof: false })); if (results.some(entry => !entry.passed)) { process.exitCode = 1; }
} catch (error) { console.error(error instanceof Error ? error.message : 'Messaging simulation failed'); process.exitCode = 1; }
