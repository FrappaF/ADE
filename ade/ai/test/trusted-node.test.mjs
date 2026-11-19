/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm, realpath, chmod, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import '../../scripts/source-loader.mjs';
const { needsExternalStructuralNode, verifyWithExternalNode } = await import('../trustedNode.ts');
const { createPureProject } = await import('../../../src/vs/workbench/contrib/ade/common/modelProject.ts');
const { prepareStructuralProject } = await import('../structuralProject.ts');

test('Electron dispatches isolated verification to external Node; ordinary Node retains its existing path', () => {
	for (const operation of ['structuralPrepare', 'structuralApply', 'structuralUndo', 'structuralVerify', 'featureImplementationInspect', 'featureImplementationPrepare', 'featureImplementationVerify', 'featureImplementationApply']) {
		assert.equal(needsExternalStructuralNode(JSON.stringify({ operation }), '43.8.3'), operation.endsWith('Verify'));
		assert.equal(needsExternalStructuralNode(JSON.stringify({ operation })), false);
	}
});

test('external Node verifies a real staged project with the shared engine and independent criteria', async t => {
	const directory = await realpath(await mkdtemp(join(tmpdir(), 'ade-node-runner-')));
	t.after(() => rm(directory, { recursive: true, force: true }));
	let serial = 0; const { model, criteria } = createPureProject('External desktop runner', () => 'node.' + ++serial);
	await mkdir(join(directory, '.ade')); await writeFile(join(directory, '.ade/model.json'), JSON.stringify(model)); await writeFile(join(directory, '.ade/criteria.json'), JSON.stringify(criteria));
	const { session } = await prepareStructuralProject(directory);
	// A source wrapper stands in for the built ESM bundle and loads the same production engine.
	const wrapper = join(directory, 'engine.mjs');
	await writeFile(wrapper, `await import(${JSON.stringify(new URL('../../scripts/source-loader.mjs', import.meta.url).href)});export const {engine}=await import(${JSON.stringify(new URL('../../runtime/nativeHost.ts', import.meta.url).href)});`);
	const before = process.env.ADE_NODE_EXECUTABLE; process.env.ADE_NODE_EXECUTABLE = process.execPath;
	t.after(() => { if (before === undefined) { delete process.env.ADE_NODE_EXECUTABLE; } else { process.env.ADE_NODE_EXECUTABLE = before; } });
	const result = JSON.parse(await verifyWithExternalNode(JSON.stringify({ operation: 'structuralVerify', root: directory, id: session.id, reviewId: session.reviewId }), pathToFileURL(wrapper).href));
	assert.equal(result.status, 'passed', result.verification.output);
	assert.deepEqual([result.verification.generated, result.verification.independent], [8, 8]);
	assert.match(result.verification.policy, /node.esm@5\/24.22.1/);
});

test('external runner rejects relative configuration and cancellation before execution', async t => {
	const before = process.env.ADE_NODE_EXECUTABLE;
	t.after(() => { if (before === undefined) { delete process.env.ADE_NODE_EXECUTABLE; } else { process.env.ADE_NODE_EXECUTABLE = before; } });
	process.env.ADE_NODE_EXECUTABLE = 'node';
	await assert.rejects(verifyWithExternalNode('{}', 'file:///unused.mjs'), /absolute/);
	process.env.ADE_NODE_EXECUTABLE = process.execPath;
	const controller = new AbortController(); controller.abort();
	await assert.rejects(verifyWithExternalNode('{}', 'file:///unused.mjs', controller.signal), /abort/i);
});

test('external runner refuses a mismatched executable before importing the engine', { skip: process.platform === 'win32' }, async t => {
	const directory = await realpath(await mkdtemp(join(tmpdir(), 'ade-node-version-'))), path = join(directory, 'node');
	t.after(() => rm(directory, { recursive: true, force: true }));
	await writeFile(path, '#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({node:"22.0.0",electron:null}));'); await chmod(path, 0o755);
	const before = process.env.ADE_NODE_EXECUTABLE; process.env.ADE_NODE_EXECUTABLE = path;
	t.after(() => { if (before === undefined) { delete process.env.ADE_NODE_EXECUTABLE; } else { process.env.ADE_NODE_EXECUTABLE = before; } });
	await assert.rejects(verifyWithExternalNode('{}', 'file:///engine-must-not-load.mjs'), /received 22.0.0/);
});

test('cancelling external verification also kills the nested trusted test process', { skip: process.platform === 'win32' }, async t => {
	const directory = await realpath(await mkdtemp(join(tmpdir(), 'ade-node-cancel-'))), pidFile = join(directory, 'child.pid'), wrapper = join(directory, 'engine.mjs');
	t.after(() => rm(directory, { recursive: true, force: true }));
	const code = `require('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid));setInterval(()=>{},1000);`;
	await writeFile(wrapper, `const {runProcess}=await import(${JSON.stringify(new URL('../process.ts', import.meta.url).href)});const {lock}=await import(${JSON.stringify(new URL('../../runtime/projectStore.ts', import.meta.url).href)});export const engine={execute:async(_input,signal)=>lock(${JSON.stringify(directory)},async()=>{await runProcess(process.execPath,['--eval',${JSON.stringify(code)}],${JSON.stringify(directory)},{signal});return '{}';})};`);
	const before = process.env.ADE_NODE_EXECUTABLE; process.env.ADE_NODE_EXECUTABLE = process.execPath;
	t.after(() => { if (before === undefined) { delete process.env.ADE_NODE_EXECUTABLE; } else { process.env.ADE_NODE_EXECUTABLE = before; } });
	const controller = new AbortController();
	const pending = verifyWithExternalNode('{}', pathToFileURL(wrapper).href, controller.signal);
	const rejected = assert.rejects(pending, /cancelled|abort/i);
	let pid;
	try {
		for (let i = 0; i < 100; i++) { try { pid = Number(await readFile(pidFile, 'utf8')); break; } catch { await new Promise(resolve => setTimeout(resolve, 20)); } }
		assert.ok(pid, 'nested child started');
	} finally { controller.abort(); await rejected; }
	let active = true;
	for (let i = 0; i < 100; i++) {
		try { active = !execFileSync('ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8' }).trim().startsWith('Z'); } catch { active = false; }
		if (!active) { break; } await new Promise(resolve => setTimeout(resolve, 20));
	}
	assert.equal(active, false, 'nested child terminated');
	await assert.rejects(readFile(join(directory, '.ade/code-project.lock')), { code: 'ENOENT' });
});
