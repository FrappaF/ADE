/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { createCodeEngine } from '../code-import/nativeHost.ts';
import { createCliProvider } from '../ai/providers.ts';
import { runProcess } from '../ai/process.ts';
import { todoFile, todoSource, todoFiles } from '../code-import/test/todo-semantic-fixture.mjs';

const option = (name, fallback) => { const index = process.argv.indexOf(name); return index < 0 ? fallback : process.argv[index + 1]; };
const model = process.env.ADE_AI_MODEL;
if (!model) { throw new Error('Set ADE_AI_MODEL to an exact authenticated CLI model ID. This test makes real model calls.'); }
const executable = process.env.ADE_AI_EXECUTABLE || 'codex';
const runs = Number(option('--runs', '2')), maxCalls = Number(option('--max-calls', '8'));
if (!Number.isSafeInteger(runs) || runs < 1 || runs > 5 || !Number.isSafeInteger(maxCalls) || maxCalls < 1 || maxCalls > 20) { throw new Error('Use 1-5 runs and 1-20 explicitly bounded model calls'); }
const output = resolve(option('--output', `.build/ade-live/diagrams-${Date.now()}`));
const replay = option('--replay', undefined);
await mkdir(output, { recursive: true, mode: 0o700 });
const fixtures = {
	'todo-rails': { [todoFile]: todoSource, ...todoFiles },
	'todo-rails-scaffold': { [todoFile]: todoSource, ...todoFiles, ...Object.fromEntries(Array.from({ length: 22 }, (_, index) => [`config/initializers/setup_${index}.rb`, `module Setup${index}\n  def self.configure\n    # Framework startup only; no task behavior\n    true\n  end\nend\n`])) },
	'todo-go': { 'tasks.go': `package tasks
type Task struct { ID int; Title string; Completed bool }
type Store struct { Tasks map[int]Task; NextID int }
func (s *Store) Create(title string) Task { s.NextID++; t := Task{ID:s.NextID,Title:title}; s.Tasks[t.ID]=t; return t }
func (s *Store) Complete(id int) { t := s.Tasks[id]; t.Completed=true; s.Tasks[id]=t }
func (s *Store) Delete(id int) { delete(s.Tasks,id) }
func (s *Store) List() []Task { out:=[]Task{}; for _,t:=range s.Tasks { out=append(out,t) }; return out }
` }
};
const cases = option('--cases', Object.keys(fixtures).join(',')).split(',');
if (cases.some(name => !Object.hasOwn(fixtures, name))) { throw new Error('Unknown fixture'); }
const hash = value => createHash('sha256').update(value).digest('hex');
const report = { kind: replay ? 'replay-recorded-real-cli-output' : 'real-cli-semantic-generation', model, recordedAt: new Date().toISOString(), maxCalls, calls: 0, replays: 0, cases: [] };
const config = { version: 1, provider: 'codex', connection: 'cli', executable, model, maxCalls: 1, timeoutMs: 180000, maxContextBytes: 262144 };
for (const name of cases) {
	for (let run = 1; run <= runs; run++) {
		const directory = join(output, `${name}-${run}`), root = join(directory, 'project');
		await mkdir(root, { recursive: true, mode: 0o700 });
		for (const [file, text] of Object.entries(fixtures[name])) { await mkdir(dirname(join(root, file)), { recursive: true }); await writeFile(join(root, file), text); }
		const started = Date.now();
		const result = { name, run, passed: false, calls: 0 };
		const cli = createCliProvider(async (exe, args, cwd, options) => {
			if (report.calls >= maxCalls) { throw new Error('Live test invocation budget exhausted'); }
			report.calls++; result.calls++;
			const prefix = join(directory, `call-${result.calls}`);
			const schema = JSON.parse(await readFile(args[args.indexOf('--output-schema') + 1], 'utf8'));
			result.sourceUnits = Object.keys(schema.properties.coverage.properties.targets.properties).length;
			await writeFile(prefix + '-prompt.txt', options.input, { mode: 0o600 });
			await writeFile(prefix + '-schema.json', await readFile(args[args.indexOf('--output-schema') + 1]), { mode: 0o600 });
			console.log(`${name} run ${run}: real ${model} call ${report.calls}/${maxCalls}`);
			const response = await runProcess(exe, args, cwd, { ...options, ...(process.env.ADE_AI_CODEX_HOME ? { env: { ...process.env, CODEX_HOME: process.env.ADE_AI_CODEX_HOME } } : {}) });
			try { await writeFile(prefix + '-response.json', await readFile(args[args.indexOf('--output-last-message') + 1]), { mode: 0o600 }); } catch { /* CLI failures may not produce a response. */ }
			return response;
		});
		const provider = replay ? { async complete(_config, prompt, schema) {
			if (report.replays >= maxCalls) { throw new Error('Replay budget exhausted'); }
			report.replays++; result.replayed = (result.replayed ?? 0) + 1;
			const prefix = resolve(replay, `${name}-${run}`, `call-${result.replayed}`);
			assert.equal(hash(prompt), hash(await readFile(prefix + '-prompt.txt')), 'replay must use exactly the recorded model input');
			assert.deepEqual(schema, JSON.parse(await readFile(prefix + '-schema.json', 'utf8')), 'replay must use exactly the recorded output schema');
			return { value: JSON.parse(await readFile(prefix + '-response.json', 'utf8')), usage: { inputTokens: null, outputTokens: null }, cost: null };
		} } : cli;
		const engine = createCodeEngine(provider);
		const call = async request => JSON.parse(await engine.execute(JSON.stringify(request)));
		try {
			const initial = await call({ operation: 'import', root });
			let progress = await call({ operation: 'diagramPrepare', snapshot: initial.snapshot, config: JSON.stringify(config) });
			result.indexedSymbols = progress.symbols;
			while (progress.status === 'ready' || progress.status === 'running') { progress = await call({ operation: 'diagramStep', snapshot: initial.snapshot, id: progress.id, reviewId: progress.reviewId }); }
			assert.equal(progress.status, 'complete', JSON.stringify(progress));
			const document = JSON.parse(await readFile(progress.context.model, 'utf8'));
			const domain = document.semantics.elements.filter(item => item.kind !== 'feature');
			assert.ok(domain.length >= 3 && domain.length <= 24, 'a compact domain model must be published');
			assert.ok(domain.every(item => !/\.(rb|go)$|\b(boot|framework|initializer|test)\b/i.test(item.name)), 'scaffolding must not become domain responsibilities');
			assert.ok(domain.some(item => item.kind === 'action'), 'task operations must be represented');
			assert.ok(domain.some(item => item.kind === 'resource'), 'task data must be represented');
			assert.ok(document.views.length >= 1 && document.views.every(view => view.nodes.length >= 2 && view.relationIds.length >= 1), 'views must connect responsibilities');
			assert.ok(document.semantics.relations.length >= 2, 'the TODO interactions must be represented');
			const behavior = domain.filter(item => item.kind === 'action' || item.kind === 'controller').map(item => item.name + ' ' + item.description).join(' ');
			for (const operation of [/create|add/i, /complete|finish|done/i, /delete|remove|destroy/i, /list|view|show|retrieve/i]) { assert.match(behavior, operation, 'all TODO capabilities must be described'); }
			if (name.startsWith('todo-rails')) { assert.ok(domain.some(item => item.kind === 'view' || item.kind === 'actor'), 'the evidenced task UI must be represented'); }
			for (const [file, text] of Object.entries(fixtures[name])) { assert.equal(hash(await readFile(join(root, file))), hash(text), 'source files must be unchanged'); }
			const job = JSON.parse(await readFile(join(root, '.ade', 'diagram-imports', progress.id + '.json'), 'utf8'));
			Object.assign(result, { usage: job.usage, passed: true, elements: domain.length, relations: document.semantics.relations.length, views: document.views.length, modelPath: progress.context.model });
		} catch (error) { result.error = error.message; if (error.diagnostics) { result.diagnostics = error.diagnostics; } }
		result.durationMs = Date.now() - started;
		report.cases.push(result);
		await writeFile(join(output, 'results.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
		console.log(JSON.stringify(result));
	}
}
console.log(`Live results: ${join(output, 'results.json')}`);
if (report.cases.some(result => !result.passed)) { process.exitCode = 1; }
