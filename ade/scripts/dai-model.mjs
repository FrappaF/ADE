/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { open, writeFile } from 'node:fs/promises';
import './source-loader.mjs';
const { readSemanticDraft } = await import('../../src/vs/workbench/contrib/ade/common/semanticModel.ts');
const { migrateSemanticModelToV4, normalizeInteractionAliases } = await import('../../src/vs/workbench/contrib/ade/common/modelMigration.ts');
const { getModelReadiness } = await import('../../src/vs/workbench/contrib/ade/common/modelReadiness.ts');
const { compileModelTaskContext } = await import('../../src/vs/workbench/contrib/ade/common/modelTaskContext.ts');
const { getModelArchetype } = await import('../../src/vs/workbench/contrib/ade/common/modelProfiles.ts');
const { serializeSemanticModel } = await import('../../src/vs/workbench/contrib/ade/common/modelSerialization.ts');

async function json(path) {
	const file = await open(path, 'r');
	try {
		const buffer = Buffer.alloc(4 * 1024 * 1024 + 1); let offset = 0;
		while (offset < buffer.length) { const result = await file.read(buffer, offset, buffer.length - offset, null); if (!result.bytesRead) { break; } offset += result.bytesRead; }
		if (offset === buffer.length) { throw new Error('Model input exceeds 4 MiB'); }
		return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, offset)));
	} finally { await file.close(); }
}

try {
	const [operation, input, target, ...extra] = process.argv.slice(2);
	if (operation === 'normalize-frames' && input && target && !extra.length) {
		await writeFile(target, serializeSemanticModel(normalizeInteractionAliases(await json(input))), { flag: 'wx' });
		console.log(JSON.stringify({ version: 4, output: target, calls: 0 }));
	} else if (operation === 'migrate' && input && target && !extra.length) {
		const model = migrateSemanticModelToV4(await json(input));
		await writeFile(target, serializeSemanticModel(model), { flag: 'wx' });
		console.log(JSON.stringify({ version: model.version, output: target }));
	} else if (operation === 'context' && input && target && extra.length === 1) {
		const packet = await compileModelTaskContext(await json(input), await json(target));
		await writeFile(extra[0], JSON.stringify(packet, null, '\t') + '\n', { flag: 'wx' });
		console.log(JSON.stringify({ output: extra[0], bytes: packet.byteLength, seal: packet.seal, calls: 0 }));
	} else if (operation === 'profile' && input && !target && !extra.length) {
		console.log(JSON.stringify(getModelArchetype(input), null, '\t'));
	} else if (operation === 'inspect' && input && target && !extra.length) {
		// Generic inspection requires an explicitly selected profile; project generation has separate scope checks.
		console.log(JSON.stringify(getModelReadiness(readSemanticDraft(await json(input)), target), null, '\t'));
	} else { throw new Error('Usage: node ade/scripts/dai-model.mjs migrate INPUT NEW_OUTPUT\n   or: node ade/scripts/dai-model.mjs inspect INPUT TARGET_ID\n   or: node ade/scripts/dai-model.mjs context INPUT REQUEST NEW_OUTPUT\n   or: node ade/scripts/dai-model.mjs profile node.esm\n   or: node ade/scripts/dai-model.mjs normalize-frames INPUT NEW_OUTPUT'); }
} catch (error) {
	console.error(error instanceof Error ? error.message : 'Model operation failed'); process.exitCode = 1;
}
