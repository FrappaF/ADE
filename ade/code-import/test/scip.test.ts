/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../scripts/source-loader.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const { importCode } = await import('../importCode.ts');
const { applyScipBundles, captureScip, readScipBundle } = await import('../scip.ts');
const { prepareSync } = await import('../syncCode.ts');
const { readImportState, readSnapshot, writeSnapshot } = await import('../snapshot.ts');
const { validateSemanticModel } = await import('../../../src/vs/workbench/contrib/ade/common/modelValidation.ts');
const { refreshExplorationAnalysis, explorationCapabilities } = await import('../explorationIndex.ts');

test('a resolver configuration change invalidates old edges even when both endpoint files are unchanged', async t => {
	const { root, state, bundle } = await fixture(t);
	const previous = await applyScipBundles(state, [bundle]);
	assert.ok(previous.semantic.dependencies.length);
	await writeFile(join(root, 'package.json'), (await readFile(join(root, 'package.json'), 'utf8')) + '\n');
	const current = await importCode(root, state.projectId, { previous });
	await refreshExplorationAnalysis(current, previous);
	assert.deepEqual(current.semantic.dependencies, []);
	assert.ok(explorationCapabilities(current).every(capability => !capability.references && !capability.definitions));
	assert.ok(current.semantic.diagnostics.some(diagnostic => diagnostic.code === 'missingDocument'));
});

const run = promisify(execFile);
const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));
const captureCli = fileURLToPath(new URL('../capture-scip.mjs', import.meta.url));

async function fixture(t, language = 'typescript') {
	const directory = await mkdtemp(join(tmpdir(), 'ade-scip-test-'));
	t.after(() => rm(directory, { recursive: true, force: true }));
	await cp(new URL(`./fixtures/scip/${language}/`, import.meta.url), join(directory, 'source'), { recursive: true });
	const root = await realpath(join(directory, 'source'));
	const state = await importCode(root, language);
	const index = JSON.parse(await readFile(new URL(`./fixtures/scip/${language}.scip.json`, import.meta.url), 'utf8'));
	index.metadata.project_root = pathToFileURL(root).href;
	const bundle = { version: 1, sourceRoot: root, sourceRevision: state.revision, positionEncoding: 2, index };
	return { directory, root, state, index, bundle };
}

function namedEdges(state) {
	const names = new Map(state.model.semantics.elements.map(item => [item.id, item.name]));
	return state.model.semantics.relations.map(edge => [names.get(edge.from), names.get(edge.to), edge.kind]).sort();
}

test('real TypeScript and Python SCIP indexes resolve imported aliases with exact name evidence', async t => {
	for (const [language, extension] of [['typescript', 'ts'], ['python', 'py']]) {
		await t.test(language, async t => {
			const { root, state, bundle } = await fixture(t, language);
			const enriched = await applyScipBundles(state, [bundle]);
			assert.deepEqual({ bindings: enriched.semantic.bindings.length, indexed: enriched.semantic.indexedFiles, edges: namedEdges(enriched), validation: validateSemanticModel(enriched.model) }, {
				bindings: 2, indexed: [`checkout.${extension}`, `gateway.${extension}`], edges: [['checkout', 'charge', 'dependency'], [`checkout.${extension}`, 'charge', 'dependency']], validation: []
			});
			const reference = enriched.semantic.dependencies.flatMap(edge => edge.references).find(item => item.source.line === (language === 'typescript' ? 9 : 7));
			const source = await readFile(join(root, reference.source.file), 'utf8');
			assert.equal(source.slice(reference.source.start, reference.source.end), 'pay');
			assert.ok(enriched.semantic.diagnostics.some(item => item.code === 'unboundDefinition'));
			assert.ok(enriched.model.views.find(view => view.id === 'code-semantic-dependencies').relationIds.length === 2);
			assert.deepEqual(readImportState(JSON.parse(JSON.stringify(enriched))), enriched);
		});
	}
});

test('Unicode ranges honor UTF-8/16/32 and typed ranges take precedence over deprecated arrays', async t => {
	const { root, state, bundle } = await fixture(t);
	const expected = await applyScipBundles(state, [bundle]);
	for (const encoding of [1, 2, 3]) {
		const converted = structuredClone(bundle);
		delete converted.positionEncoding;
		for (const document of converted.index.documents) {
			document.position_encoding = encoding;
			const lines = (await readFile(join(root, document.relative_path), 'utf8')).split('\n');
			for (const occurrence of document.occurrences) {
				const [line, start, end] = occurrence.range;
				const unit = column => encoding === 1 ? Buffer.byteLength(lines[line].slice(0, column)) : encoding === 3 ? [...lines[line].slice(0, column)].length : column;
				if (encoding === 1) { occurrence.single_line_range = { line, start_character: unit(start), end_character: unit(end) }; }
				else if (encoding === 2) { occurrence.TypedRange = { SingleLineRange: { line, start_character: unit(start), end_character: unit(end) } }; }
				else { occurrence.TypedRange = { MultiLineRange: { start_line: line, start_character: unit(start), end_line: line, end_character: unit(end) } }; }
				occurrence.range = [99999, 0, 0];
			}
		}
		const actual = await applyScipBundles(state, [converted]);
		assert.deepEqual(actual.semantic.dependencies.map(edge => ({ id: edge.id, references: edge.references.map(item => item.source) })), expected.semantic.dependencies.map(edge => ({ id: edge.id, references: edge.references.map(item => item.source) })));
	}
	const split = structuredClone(bundle);
	const document = split.index.documents.find(document => document.relative_path === 'checkout.ts');
	const call = document.occurrences.find(item => item.range[0] === 8 && !(item.symbol_roles & 1));
	call.range = [8, 17, 18]; // Splits the emoji in the fixture's UTF-16 line.
	await assert.rejects(applyScipBundles(state, [split]), /splits a UTF-16 character/);
});

test('unspecified encoding, stale inputs, invalid paths and malformed indices are rejected', async t => {
	const { state, bundle } = await fixture(t);
	const unspecified = structuredClone(bundle);
	delete unspecified.positionEncoding;
	await assert.rejects(applyScipBundles(state, [unspecified]), /position encoding is unspecified/);
	await assert.rejects(applyScipBundles(state, [{ ...bundle, sourceRevision: '0'.repeat(64) }]), /different source root or revision/);
	const badPath = structuredClone(bundle);
	badPath.index.documents[0].relative_path = '../gateway.ts';
	await assert.rejects(applyScipBundles(state, [badPath]), /document path/);
	const wrongRoot = structuredClone(bundle);
	wrongRoot.index.metadata.project_root = 'https://example.com/source';
	await assert.rejects(applyScipBundles(state, [wrongRoot]), /project root differs/);
	const staleText = structuredClone(bundle);
	staleText.index.documents[0].text = 'stale source';
	await assert.rejects(applyScipBundles(state, [staleText]), /document is stale/);
	assert.throws(() => readScipBundle({ ...bundle, index: { documents: [] } }), /Invalid SCIP bundle/);
});

test('coverage gaps, ambiguous definitions and unrepresented symbol relationships stay explicit', async t => {
	const { state, bundle } = await fixture(t);
	const partial = structuredClone(bundle);
	partial.index.documents = partial.index.documents.filter(document => document.relative_path === 'gateway.ts');
	partial.index.documents.push({ relative_path: 'vendor/absent.ts', occurrences: [] });
	partial.index.documents[0].symbols[0].relationships = [{ symbol: 'external', is_implementation: true }];
	const covered = await applyScipBundles(state, [partial]);
	assert.deepEqual(covered.semantic.indexedFiles, ['gateway.ts']);
	assert.ok(['outsideScope', 'missingDocument', 'unresolvedRelationship'].every(code => covered.semantic.diagnostics.some(item => item.code === code)));
	const ambiguous = structuredClone(bundle);
	const gateway = ambiguous.index.documents.find(document => document.relative_path === 'gateway.ts');
	const charge = gateway.occurrences.find(item => item.range[0] === 5 && item.symbol_roles === 1).symbol;
	const checkout = ambiguous.index.documents.find(document => document.relative_path === 'checkout.ts');
	checkout.occurrences.find(item => item.range[0] === 7 && item.symbol_roles === 1).symbol = charge;
	const result = await applyScipBundles(state, [ambiguous]);
	assert.deepEqual({ edges: result.semantic.dependencies.length, ambiguous: result.semantic.diagnostics.some(item => item.code === 'ambiguousSymbol') }, { edges: 0, ambiguous: true });
});

test('capture verifies source revisions before and after the selected producer runs', async t => {
	const { root, state, index } = await fixture(t);
	const bundle = await captureScip(state, async () => index, 2);
	assert.equal(bundle.sourceRevision, state.revision);
	await assert.rejects(captureScip(state, async () => {
		await writeFile(join(root, 'gateway.ts'), 'export function charge() {}');
		return index;
	}, 2), /Source changed during SCIP capture/);
	let called = false;
	await assert.rejects(captureScip(state, async () => { called = true; return index; }, 2), /Source changed before SCIP capture/);
	assert.equal(called, false);
});

test('source and configuration changes invalidate semantic evidence until a new bundle is supplied', async t => {
	const { directory, root, state, bundle } = await fixture(t);
	const legacy = structuredClone(state);
	legacy.adapter = legacy.adapter.replace(/syntax-v\d+/, 'syntax-v2');
	for (const file of legacy.files) { for (const declaration of file.declarations) { delete declaration.nameEvidence; } }
	const migrated = await importCode(root, state.projectId, { previous: readImportState(legacy) });
	assert.deepEqual(migrated.model.semantics.elements.map(item => item.id), state.model.semantics.elements.map(item => item.id));
	assert.ok(migrated.files.flatMap(file => file.declarations).every(declaration => declaration.nameEvidence));
	const enriched = await applyScipBundles(state, [bundle]);
	const unchanged = await importCode(root, state.projectId, { previous: enriched });
	assert.deepEqual(unchanged.semantic, enriched.semantic);
	await writeFile(join(root, 'package.json'), (await readFile(join(root, 'package.json'), 'utf8')) + '\n');
	const changed = await importCode(root, state.projectId, { previous: enriched });
	assert.deepEqual({ parsed: changed.analysis.parsed, invalidated: changed.analysis.semanticInvalidated, conflicts: prepareSync(enriched, enriched.model, changed).report.conflicts.map(item => item.code) }, { parsed: [], invalidated: true, conflicts: ['incompleteSemantic'] });
	await assert.rejects(writeSnapshot(join(directory, 'invalidated'), changed, changed.model), /must be regenerated/);
	const renewed = await applyScipBundles(changed, [{ ...bundle, sourceRevision: changed.revision }]);
	assert.deepEqual(prepareSync(enriched, enriched.model, renewed).report.conflicts, []);
	const model = structuredClone(enriched.model);
	const owner = state.files.flatMap(file => file.declarations).find(item => item.name === 'checkout');
	model.semantics.relations.find(relation => relation.from === owner.id).name = 'Manual dependency label';
	const fewer = structuredClone(bundle.index);
	const doc = fewer.documents.find(document => document.relative_path === 'checkout.ts');
	doc.occurrences = doc.occurrences.filter(item => item.range[0] !== 8);
	const updated = await applyScipBundles(changed, [{ ...bundle, sourceRevision: changed.revision, index: fewer }]);
	const report = prepareSync(enriched, model, updated);
	assert.ok(report.report.dependencies.removed.length === 1);
	// Editing a generated dependency never permits silent removal of that relationship.
	assert.equal(report.model, undefined);
});

test('normalized evidence cannot point outside the declaration that owns a reference', async t => {
	const { state, bundle } = await fixture(t);
	const enriched = await applyScipBundles(state, [bundle]);
	const tampered = structuredClone(enriched);
	const action = state.files.flatMap(file => file.declarations).find(item => item.name === 'checkout');
	const edge = tampered.semantic.dependencies.find(item => item.from === action.id);
	edge.references[0].source.start = 0;
	assert.throws(() => readImportState(tampered), /outside its owner/);
});

test('CLI capture, status and Sync attach source-bound SCIP without replacing the previous version', async t => {
	const { directory, root, state, index } = await fixture(t);
	const initial = join(directory, 'v1');
	const output = join(directory, 'v2');
	const bundlePath = join(directory, 'semantic.json');
	await writeSnapshot(initial, state, state.model);
	const bytes = await readFile(join(initial, 'model.ade.json'), 'utf8');
	await run(process.execPath, [captureCli, initial, bundlePath, '--position-encoding', 'utf16', '--', process.execPath, '-e', `process.stdout.write(${JSON.stringify(JSON.stringify(index))})`]);
	const status = await run(process.execPath, [cli, 'status', initial, '--scip', bundlePath]);
	assert.equal(JSON.parse(status.stdout).dependencies.added.length, 2);
	assert.ok(!(await readdir(directory)).includes('v2'));
	await run(process.execPath, [cli, 'sync', initial, output, '--scip', bundlePath]);
	assert.equal((await readSnapshot(output)).state.semantic.dependencies.length, 2);
	assert.equal(await readFile(join(initial, 'model.ade.json'), 'utf8'), bytes);
	await writeFile(join(root, 'gateway.ts'), (await readFile(join(root, 'gateway.ts'), 'utf8')) + '\n');
	await assert.rejects(run(process.execPath, [cli, 'status', output]), error => error.code === 2 && error.stdout.includes('incompleteSemantic'));
	await assert.rejects(run(process.execPath, [captureCli, initial, bundlePath, '--position-encoding', '__proto__', '--', process.execPath, '-e', 'throw new Error("must not run")']), /Usage/);
});
