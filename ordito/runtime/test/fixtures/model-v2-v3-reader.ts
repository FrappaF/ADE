import { readFile, writeFile } from 'node:fs/promises';
import { Ajv2020 } from 'ajv/dist/2020.js';

// A compatibility fixture using the committed v2/v3 schemas, not a historical
// application binary or the modern migration CLI (which also supports v4/v5).
async function main(): Promise<void> {
	const [input, output, ...extra] = process.argv.slice(2);
	if (!input || !output || extra.length) { throw new Error('Usage: model-v2-v3-reader.ts INPUT OUTPUT'); }
	const ajv = new Ajv2020({ allErrors: true });
	const validators = await Promise.all([2, 3].map(async version => ({ version, validate: ajv.compile(JSON.parse(await readFile(new URL(`../../../schema/model-v${version}.schema.json`, import.meta.url), 'utf8'))) })));
	const bytes = await readFile(input), value: unknown = JSON.parse(bytes.toString('utf8'));
	const compatible = validators.find(reader => reader.validate(value));
	if (!compatible) {
		const diagnostics = validators.flatMap(reader => (reader.validate.errors ?? []).map(error => ({ version: reader.version, instancePath: error.instancePath, keyword: error.keyword, params: error.params })));
		const incompatibleVersion = diagnostics.filter(error => error.instancePath === '/version' && error.keyword === 'const');
		process.stderr.write(JSON.stringify({ reader: 'schema-v2-v3-compatibility-fixture', code: incompatibleVersion.length === 2 ? 'incompatible-model-version' : 'invalid-model', diagnostics: incompatibleVersion.length === 2 ? incompatibleVersion : diagnostics }) + '\n');
		process.exitCode = 1;
		return;
	}
	// Saving is permitted only after successful validation, and never replaces a file.
	await writeFile(output, bytes, { flag: 'wx' });
	process.stdout.write(JSON.stringify({ reader: 'schema-v2-v3-compatibility-fixture', version: compatible.version }) + '\n');
}

try { await main(); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
