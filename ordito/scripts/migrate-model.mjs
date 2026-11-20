import './source-loader.mjs';
import { readFile, writeFile } from 'node:fs/promises';
const { migrateSemanticModel } = await import('../../src/vs/workbench/contrib/ordito/common/modelLegacyMigration.ts');
const { InvalidSemanticModelError } = await import('../../src/vs/workbench/contrib/ordito/common/modelValidation.ts');

const [input, output, modelId] = process.argv.slice(2);
if (!input || !output) {
	console.error('Usage: node ordito/scripts/migrate-model.mjs INPUT OUTPUT [MODEL_ID]');
	process.exitCode = 1;
} else {
	try {
		const result = migrateSemanticModel(JSON.parse(await readFile(input, 'utf8')), modelId);
		// Never overwrite the source or an existing destination.
		await writeFile(output, JSON.stringify(result.model, null, '\t') + '\n', { flag: 'wx' });
		for (const diagnostic of result.diagnostics) {
			console.error(`${diagnostic.severity}: ${diagnostic.code} ${diagnostic.path} ${diagnostic.args.join(', ')}`);
		}
	} catch (error) {
		console.error(error instanceof InvalidSemanticModelError ? JSON.stringify(error.diagnostics, null, 2) : error.message);
		process.exitCode = 1;
	}
}
