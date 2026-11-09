/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, readdir, realpath } from 'node:fs/promises';
import { resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpus, arch, platform, release, totalmem } from 'node:os';
import { createHash } from 'node:crypto';
import { runDaiCorpus, daiCorpusGate } from '../benchmarks/dai-corpus.mjs';
import { measureDaiContext } from '../benchmarks/dai-context.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sha = value => createHash('sha256').update(value).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const json = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const optional = async path => { try { return (await readFile(path, 'utf8')).trim(); } catch { return null; } };

async function sourceHashes() {
	const files = [...new Set(git('ls-files', '-c', '-m', '-o', '--exclude-standard', '--', 'ade', 'src/vs/workbench/contrib/ade', 'package.json', '.github/workflows/ade-dai.yml').split('\n'))].filter(path => /\.(?:ts|mjs|json|yml)$/.test(path) && !path.startsWith('ade/docs/'));
	return Object.fromEntries(await Promise.all(files.sort().map(async path => [path, sha(await readFile(resolve(root, path)))])));
}

async function main() {
	const [destination, ...flags] = process.argv.slice(2);
	if (!destination || flags.some(flag => flag !== '--require-release') || new Set(flags).size !== flags.length) { throw new Error('Usage: node ade/scripts/verify-dai.mjs NEW_REPORT_DIRECTORY [--require-release]'); }
	if (process.version !== 'v24.22.1') { throw new Error('DAI verification requires Node 24.22.1, as pinned by the trusted archetype'); }
	const output = resolve(destination);
	// An existing report is immutable. Never overwrite historical evidence.
	await mkdir(output);
	const policyPath = 'ade/docs/diagram-driven-ai/budgets.v1.json', corpusPath = 'ade/docs/diagram-driven-ai/corpus.v1.json';
	const policy = await json(policyPath), corpus = await json(corpusPath), hashes = await sourceHashes();
	const controller = new AbortController(), cancel = () => controller.abort();
	process.on('SIGINT', cancel); process.on('SIGTERM', cancel);
	const suites = [];
	const run = async (name, args, env = process.env) => {
		controller.signal.throwIfAborted();
		console.log(`DAI: ${name}`);
		const started = Date.now();
		const result = await new Promise(resolveResult => {
			const child = spawn(process.execPath, args, { cwd: root, env, shell: false, signal: controller.signal, timeout: 600000 });
			const chunks = []; let size = 0, error;
			for (const stream of [child.stdout, child.stderr]) { stream.on('data', data => { size += data.length; if (size <= 16 * 1024 * 1024) { chunks.push(data); } else { error = 'Verification output exceeds 16 MiB'; child.kill(); } }); }
			child.on('error', value => { error = value.message; });
			child.on('close', (code, signal) => resolveResult({ code, signal, error, text: Buffer.concat(chunks).toString('utf8') }));
		});
		await writeFile(resolve(output, name + '.log'), result.text, { flag: 'wx' });
		const row = { name, command: [process.execPath, ...args], status: result.code === 0 && !result.error ? 'passed' : 'failed', code: result.code, signal: result.signal, ...(result.error ? { error: result.error } : {}), durationMs: Date.now() - started, log: name + '.log', logSha256: sha(result.text) };
		suites.push(row); return row;
	};
	try {
		let bun;
		try {
			if (!process.env.ADE_BUN_EXECUTABLE || !isAbsolute(process.env.ADE_BUN_EXECUTABLE)) { throw new Error('Set ADE_BUN_EXECUTABLE to an absolute Bun 1.3.2 path'); }
			const path = await realpath(process.env.ADE_BUN_EXECUTABLE), version = execFileSync(path, ['--version'], { encoding: 'utf8', timeout: 5000, env: {} }).trim();
			if (version !== '1.3.2') { throw new Error('Expected Bun 1.3.2, received ' + version); }
			bun = { path, version, sha256: sha(await readFile(path)), status: 'available' };
		} catch (error) { bun = { status: 'not-executed', reason: error.message }; }
		const files = async directory => (await readdir(resolve(root, directory))).filter(file => file.endsWith('.test.mjs')).sort().map(file => directory + '/' + file);
		await run('domain', ['--test', '--test-isolation=none', ...await files('ade/test')]);
		await run('ai', ['--test', '--test-isolation=none', ...await files('ade/ai/test')]);
		await run('import', ['--test', ...await files('ade/code-import/test')]);
		if (bun.status === 'available') {
			await run('two-stacks', ['--test', '--test-isolation=none', 'ade/ai/test/second-stack.integration.mjs']);
			await run('bun-roundtrip', ['--test', '--test-isolation=none', 'ade/ai/test/roundtrip-project.test.mjs'], { ...process.env, ADE_ROUNDTRIP_PROFILE: 'bun.esm' });
		}
		if (process.env.ADE_NATS_SERVER) {
			await run('broker-node', ['--test', 'ade/messaging/test/broker.test.mjs']);
			if (bun.status === 'available') { await run('ledger-transfer', ['--test', 'ade/messaging/test/stack-transfer.integration.mjs']); }
		}
		for (const runtime of ['interaction', 'state', 'messaging']) { await run('generated-' + runtime, [`ade/scripts/build-${runtime}-runtime.mjs`, '--check']); }
		await run('frozen-scale', ['ade/scripts/benchmark-dai.mjs', '--v4', '--output', resolve(output, 'scale.json')]);
		const context = await measureDaiContext();
		await writeFile(resolve(output, 'context.json'), JSON.stringify(context, null, '\t') + '\n', { flag: 'wx' });
		const results = await runDaiCorpus(corpus), corpusGate = daiCorpusGate(corpus, ['node.esm', 'bun.esm'], results);
		await writeFile(resolve(output, 'corpus.json'), JSON.stringify({ gate: corpusGate, results }, null, '\t') + '\n', { flag: 'wx' });
		const after = await sourceHashes(), sourceUnchanged = JSON.stringify(hashes) === JSON.stringify(after);
		const scale = await json(resolve(output, 'scale.json'));
		const performancePass = scale.memory.withinBudget && scale.fixtures.every(f => ['validation', 'edit', 'impact', 'evidencePacking'].every(key => f[key].withinBudget)) && context.records.every(r => r.candidate.inputBudgetPass && r.candidate.timing.withinBudget);
		const localPassed = suites.every(s => s.status === 'passed') && bun.status === 'available' && corpusGate.failed === 0 && sourceUnchanged && performancePass;
		const external = [
			{ id: 'live-provider', status: 'not-measured', reason: 'Deterministic runner sends no provider requests. Three configured live runs per case/candidate and comparable usage/prices remain required.' },
			{ id: 'native-desktop-accessibility', status: 'not-measured', reason: 'Renderer and scripted native service tests do not certify two complete Electron workflows or a real screen reader.' },
			{ id: 'cross-platform', status: 'not-measured', reason: 'One invocation measures only its declared host. Linux/macOS results and matching frozen reference hardware must be reviewed separately.' },
			{ id: 'broker-bun', status: 'not-measured', reason: 'This portable command runs the Node broker and cross-runtime ledger tests when configured. The full Bun broker compatibility suite requires the documented harness.' }
		];
		const report = { version: 1, sprint: 'DAI-12', recordedAt: new Date().toISOString(), revision: git('rev-parse', 'HEAD'), branch: git('branch', '--show-current'), workingTreeDirty: !!git('status', '--porcelain'), sourceHashes: hashes, sourceUnchanged,
			policySha256: sha(await readFile(resolve(root, policyPath))), corpusSha256: sha(await readFile(resolve(root, corpusPath))),
			hardware: { platform: platform(), arch: arch(), kernel: release(), cpu: cpus()[0]?.model, hostMemoryMiB: totalmem() / 1024 / 1024, cgroupCpuMax: await optional('/sys/fs/cgroup/cpu.max'), cgroupMemoryMax: await optional('/sys/fs/cgroup/memory.max') }, runtimes: { node: process.version, bun }, suites, localValidation: localPassed ? 'passed' : 'failed', corpusGate,
			release: { accepted: false, status: 'open', reason: 'Mandatory corpus and external evidence must all pass; local validation alone cannot certify I5.', external },
			provider: { calls: 0, model: null, measuredInputTokens: null, measuredOutputTokens: null, monetaryCost: null }, policy, performancePass,
			limits: ['Corpus rows with not-executed are open obligations, never test skips or successful business executions.', 'Profile-specific readiness runs on Node; generated project verification uses the selected actual runtime.', 'Timing reports must run without concurrent workloads before comparison with reference hardware.', 'Use --require-release for a blocking release gate: exit 2 until every mandatory external obligation is satisfied.'] };
		await writeFile(resolve(output, 'verification.json'), JSON.stringify(report, null, '\t') + '\n', { flag: 'wx' });
		console.log(JSON.stringify({ output, localValidation: report.localValidation, corpus: corpusGate, releaseAccepted: false }));
		process.exitCode = !localPassed ? 1 : flags.includes('--require-release') ? 2 : 0;
	} finally { process.off('SIGINT', cancel); process.off('SIGTERM', cancel); }
}

try { await main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
