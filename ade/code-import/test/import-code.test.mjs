/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../scripts/source-loader.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const { importCode } = await import('../importCode.ts');
const { languageAdapters } = await import('../languages.ts');
const { validateSemanticModel } = await import('../../../src/vs/workbench/contrib/ade/common/modelValidation.ts');
import { samples } from './samples.mjs';

const run = promisify(execFile);
const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));

async function workspace(t, files) {
	const directory = await mkdtemp(join(tmpdir(), 'ade-code-import-'));
	t.after(() => rm(directory, { recursive: true, force: true }));
	for (const [file, source] of files) {
		await mkdir(join(directory, file, '..'), { recursive: true });
		await writeFile(join(directory, file), source);
	}
	return directory;
}

test('every registered language parses a real declaration and reports unresolved calls', async t => {
	assert.deepEqual(samples.map(([language]) => language), languageAdapters.map(adapter => adapter.id));
	for (const [language, file, source] of samples) {
		await t.test(language, async t => {
			const root = await workspace(t, [[file, source]]);
			const result = await importCode(root, 'checkout');
			const indexed = result.files[0];
			assert.deepEqual({ status: indexed.status, language: indexed.language, errors: indexed.diagnostics.filter(item => item.code === 'syntaxError'), validation: validateSemanticModel(result.model), runtimeEvidence: result.model.verifications, inferredRelations: result.model.semantics.relations }, { status: 'parsed', language, errors: [], validation: [], runtimeEvidence: [], inferredRelations: [] });
			assert.ok(indexed.declarations.some(item => item.name === 'Checkout'));
			assert.ok(indexed.declarations.some(item => item.kind === 'action'));
			assert.ok(indexed.diagnostics.some(item => item.code === 'unresolvedConstruct'));
			for (const declaration of indexed.declarations) {
				const { evidence } = declaration;
				assert.ok(source.slice(evidence.start, evidence.end).includes(declaration.name));
				assert.equal(result.model.codeMappings.find(mapping => mapping.id === declaration.id).revision, evidence.revision);
			}
		});
	}
});

test('imports, contracts, arrows, scope, unicode and source revisions remain inspectable', async t => {
	const source = '// 😀 checkout\nimport type { Receipt } from "./contracts";\nexport interface Payment { pay(amount: number): Receipt; }\nexport class Checkout { pay(amount: number): Receipt { return gateway.pay(amount); } }\nexport const refund = (amount: number) => gateway.refund(amount);\n';
	const root = await workspace(t, [['src/checkout.ts', source]]);
	const first = await importCode(root, 'payments');
	const file = first.files[0];
	assert.deepEqual(file.declarations.map(({ name, kind }) => ({ name, kind })), [
		{ name: 'Payment', kind: 'contract' }, { name: 'Checkout', kind: 'component' }, { name: 'pay', kind: 'action' }, { name: 'refund', kind: 'action' }
	]);
	assert.deepEqual({ import: file.imports[0].text, methodParent: file.declarations[2].parentId, interfaceMembers: file.syntaxKinds.method_signature, fields: file.declarations[2].header }, {
		import: 'import type { Receipt } from "./contracts";', methodParent: file.declarations[1].id, interfaceMembers: 1, fields: 'pay(amount: number): Receipt'
	});
	assert.equal(source.slice(file.declarations[0].evidence.start, file.declarations[0].evidence.end), 'interface Payment { pay(amount: number): Receipt; }');
	assert.deepEqual(await importCode(root, 'payments'), first);
	await writeFile(join(root, 'src/checkout.ts'), '\n\n' + source.replace('amount: number): Receipt {', 'amount: bigint): Receipt {'));
	const changed = await importCode(root, 'payments');
	assert.deepEqual(changed.files[0].declarations.map(item => item.id), file.declarations.map(item => item.id));
	assert.notEqual(changed.revision, first.revision);
	assert.match(changed.files[0].declarations[2].header, /bigint/);
	assert.notEqual(changed.files[0].revision, file.revision);
	assert.equal(await readFile(join(root, 'src/checkout.ts'), 'utf8'), '\n\n' + source.replace('amount: number): Receipt {', 'amount: bigint): Receipt {'));
});

test('ambiguous overloads, computed names, malformed and unsupported sources stay explicit', async t => {
	const root = await workspace(t, [
		['overloads.java', 'class Checkout { void pay(int amount) {} void pay(double amount) {} }'],
		['computed.ts', 'class Checkout { [methodName]() {} }'],
		['broken.py', 'def pay(\n'],
		['other.vb', 'class Checkout'],
		['notes.md', '# Project notes'],
		['large.ts', ' '.repeat(2 * 1024 * 1024 + 1)],
		['node_modules/external.ts', 'throw new Error("do not read");'],
		['dist/generated.ts', 'export class Generated {}']
	]);
	await symlink(join(root, 'computed.ts'), join(root, 'alias.ts'));
	const result = await importCode(root, 'limitations');
	assert.deepEqual(result.files.map(file => [file.file, file.status, file.diagnostics.map(item => item.code)]), [
		['alias.ts', 'excluded', ['symlink']],
		['broken.py', 'partial', ['syntaxError']],
		['computed.ts', 'parsed', ['unnamedDeclaration']],
		['dist', 'excluded', []],
		['large.ts', 'unsupported', ['fileTooLarge']],
		['node_modules', 'excluded', []],
		['notes.md', 'unclassified', []],
		['other.vb', 'unsupported', ['unsupportedLanguage']],
		['overloads.java', 'parsed', ['duplicateName']]
	]);
	assert.deepEqual(validateSemanticModel(result.model), []);
	assert.equal(new Set(result.model.semantics.elements.map(item => item.id)).size, result.model.semantics.elements.length);
	await assert.rejects(importCode(root, 'invalid identifier'), /Invalid project identifier/);
});

test('type aliases and arrow parameter lists are retained as source evidence', async t => {
	const root = await workspace(t, [['receipt.ts', 'export type Receipt = { id: string };\nexport const refund = (amount: number): boolean => amount > 0;\n']]);
	const result = await importCode(root, 'headers');
	assert.deepEqual(result.files[0].declarations.map(({ name, kind, header }) => ({ name, kind, header })), [
		{ name: 'Receipt', kind: 'contract', header: 'type Receipt = { id: string };' },
		{ name: 'refund', kind: 'action', header: 'refund = (amount: number): boolean =>' }
	]);
});

test('separate projects and same-named declarations cannot share identities', async t => {
	const root = await workspace(t, [['a/pay.py', 'def pay():\n    pass\n'], ['b/pay.py', 'def pay():\n    pass\n']]);
	const first = await importCode(root, 'first');
	const second = await importCode(root, 'second');
	assert.equal(new Set(first.files.flatMap(file => file.declarations.map(item => item.id))).size, 2);
	assert.ok(first.model.semantics.elements.every(element => !second.model.semantics.elements.some(other => other.id === element.id)));
	assert.deepEqual(validateSemanticModel(first.model), []);
});

test('CLI writes an openable model and index, refuses overwrites and source destinations', async t => {
	const directory = await workspace(t, [['source/pay.py', 'def pay(amount: float) -> bool:\n    return True\n']]);
	const source = join(directory, 'source');
	const output = join(directory, 'imported');
	const invocation = () => run(process.execPath, [cli, source, output, 'cli-project']);
	await invocation();
	const saved = await readFile(join(output, 'model.ade.json'), 'utf8');
	const index = JSON.parse(await readFile(join(output, 'code-index.json'), 'utf8'));
	assert.deepEqual({ validation: validateSemanticModel(JSON.parse(saved)), projectId: index.projectId, files: index.files.map(file => file.file) }, { validation: [], projectId: 'cli-project', files: ['pay.py'] });
	await assert.rejects(invocation(), /EEXIST/);
	assert.equal(await readFile(join(output, 'model.ade.json'), 'utf8'), saved);
	await assert.rejects(run(process.execPath, [cli, source, join(source, 'generated'), 'cli-project']), /outside the source tree/);
	await assert.rejects(run(process.execPath, [cli, source, source, 'cli-project']), /outside the source tree/);
	await assert.rejects(run(process.execPath, [cli]), /Usage/);
	await symlink(source, join(directory, 'linked-source'));
	await assert.rejects(run(process.execPath, [cli, source, join(directory, 'linked-source', 'generated'), 'cli-project']), /outside the source tree/);
	assert.deepEqual(await readdir(source), ['pay.py']);
});
