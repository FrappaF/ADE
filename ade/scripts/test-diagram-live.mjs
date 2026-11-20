import './source-loader.mjs';

import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
const { createCodeEngine } = await import('../runtime/nativeHost.ts');
const { createCliProvider } = await import('../ai/providers.ts');
const { runProcess } = await import('../ai/process.ts');
import { architectureFiles } from '../code-import/test/notation-fixture.mjs';
import { todoFile, todoSource, todoFiles } from '../code-import/test/todo-semantic-fixture.mjs';

const option = (name, fallback) => { const index = process.argv.indexOf(name); return index < 0 ? fallback : process.argv[index + 1]; };
const model = process.env.ADE_AI_MODEL;
if (!model) { throw new Error('Set ADE_AI_MODEL to an exact authenticated CLI model ID. This test makes real model calls.'); }
const executable = process.env.ADE_AI_EXECUTABLE || 'codex';
const runs = Number(option('--runs', '1')), maxCalls = Number(option('--max-calls', '14'));
if (!Number.isSafeInteger(runs) || runs < 1 || runs > 5 || !Number.isSafeInteger(maxCalls) || maxCalls < 1 || maxCalls > 60) { throw new Error('Use 1-5 runs and 1-60 explicitly bounded model calls'); }
const output = resolve(option('--output', `.build/ade-live/diagrams-${Date.now()}`));
const replay = option('--replay', undefined);
const recordedAnalysis = option('--recorded-analysis', undefined);
if (recordedAnalysis && (replay || runs !== 1)) { throw new Error('Recorded analysis reuse needs one run and cannot be combined with exact replay'); }
const resume = option('--resume', undefined);
if (replay && resume) { throw new Error('Choose exact replay or explicit resume, not both'); }
await mkdir(output, { recursive: true, mode: 0o700 });
const fixtures = {
	'architecture': architectureFiles,
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
const cases = option('--cases', Object.keys(fixtures).filter(name => name !== 'architecture').join(',')).split(',');
if (cases.some(name => !Object.hasOwn(fixtures, name))) { throw new Error('Unknown fixture'); }
const hash = value => createHash('sha256').update(value).digest('hex');
const report = { kind: replay ? 'replay-recorded-real-cli-output' : recordedAnalysis ? 'real-cli-views-with-recorded-real-analysis' : 'real-cli-semantic-generation', model, recordedAt: new Date().toISOString(), maxCalls, calls: 0, replays: 0, cases: [] };
const config = { version: 1, provider: 'codex', connection: 'cli', executable, model, maxCalls: 1, timeoutMs: 180000, maxContextBytes: 262144 };
for (const name of cases) {
	for (let run = 1; run <= runs; run++) {
		const directory = join(output, `${name}-${run}`), root = resume ? resolve(resume, `${name}-${run}`, 'project') : join(directory, 'project');
		await mkdir(directory, { recursive: true, mode: 0o700 });
		await mkdir(root, { recursive: true, mode: 0o700 });
		for (const [file, text] of Object.entries(fixtures[name])) { if (resume) { assert.equal(await readFile(join(root, file), 'utf8'), text, 'resume uses the original, unchanged fixture'); } else { await mkdir(dirname(join(root, file)), { recursive: true }); await writeFile(join(root, file), text); } }
		const started = Date.now();
		const result = { name, run, passed: false, calls: 0 };
		const cli = createCliProvider(async (exe, args, cwd, options) => {
			if (report.calls >= maxCalls) { throw new Error('Live test invocation budget exhausted'); }
			report.calls++; result.calls++;
			const prefix = join(directory, `call-${result.calls}`);
			const schema = JSON.parse(await readFile(args[args.indexOf('--output-schema') + 1], 'utf8'));
			if (schema.properties.coverage) { result.sourceUnits = Object.keys(schema.properties.coverage.properties.targets.properties).length; }
			await writeFile(prefix + '-prompt.txt', options.input, { mode: 0o600 });
			await writeFile(prefix + '-schema.json', await readFile(args[args.indexOf('--output-schema') + 1]), { mode: 0o600 });
			console.log(`${name} run ${run}: real ${model} call ${report.calls}/${maxCalls}`);
			const response = await runProcess(exe, args, cwd, { ...options, ...(process.env.ADE_AI_CODEX_HOME ? { env: { ...process.env, CODEX_HOME: process.env.ADE_AI_CODEX_HOME } } : {}) });
			await writeFile(prefix + '-process.json', JSON.stringify(response), { mode: 0o600 });
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
		let reusedAnalysis = false;
		const selectedProvider = recordedAnalysis ? { async complete(config, prompt, schema, signal) {
			const context = JSON.parse(prompt.slice(prompt.indexOf('\n') + 1));
			if (context.step === 'diagram') { return provider.complete(config, prompt, schema, signal); }
			assert.equal(reusedAnalysis, false, 'only one whole-project analysis may be reused');
			const previousPrompt = await readFile(resolve(recordedAnalysis) + '-prompt.txt', 'utf8');
			const previousContext = JSON.parse(previousPrompt.slice(previousPrompt.indexOf('\n') + 1));
			assert.deepEqual({ files: context.files, units: context.units, clarification: context.clarification }, { files: previousContext.files, units: previousContext.units, clarification: previousContext.clarification }, 'analysis reuse requires identical disclosed source and user intent');
			assert.deepEqual(schema, JSON.parse(await readFile(resolve(recordedAnalysis) + '-schema.json', 'utf8')), 'recorded analysis still has the same output contract');
			reusedAnalysis = true; report.replays++; result.reusedAnalysis = resolve(recordedAnalysis);
			console.log(`${name}: revalidating recorded real analysis; no new analysis inference`);
			return { value: JSON.parse(await readFile(resolve(recordedAnalysis) + '-response.json', 'utf8')), usage: { inputTokens: null, outputTokens: null }, cost: null };
		} } : provider;
		const engine = createCodeEngine(selectedProvider);
		const call = async request => JSON.parse(await engine.execute(JSON.stringify(request)));
		try {
			const pointer = resume ? JSON.parse(await readFile(join(root, '.ade/code-project.json'), 'utf8')) : undefined;
			const initial = pointer ? await call({ operation: 'inspect', snapshot: join(root, '.ade/imports', pointer.active) }) : await call({ operation: 'import', root });
			const pending = [];
			if (resume) { for (const file of await readdir(join(root, '.ade/diagram-imports'))) { if (file === 'latest.json') { continue; } const job = JSON.parse(await readFile(join(root, '.ade/diagram-imports', file), 'utf8')); if (job.status !== 'complete' && job.config.model === model) { pending.push(job); } } assert.equal(pending.length, 1, 'resume needs one unambiguous pending job'); }
			let progress = await call({ operation: 'diagramPrepare', snapshot: initial.snapshot, config: JSON.stringify(config), clarification: process.env.ADE_AI_DIAGRAM_INTENT ?? '', ...(resume ? { resume: pending[0].id } : {}) });
			if (progress.plan) { result.plan = progress.plan; }
			if (resume) { result.resumed = { completed: progress.completed, calls: progress.calls }; }
			result.indexedSymbols = progress.symbols;
			while (progress.status === 'ready' || progress.status === 'running' || progress.status === 'plan') {
				if (progress.status === 'plan') { result.plan = progress.plan; console.log(JSON.stringify({ proposal: progress.plan.map(item => ({ name: item.name, kind: item.kind, intent: item.intent })) })); }
				progress = await call({ operation: progress.status === 'plan' ? 'diagramApprovePlan' : 'diagramStep', snapshot: initial.snapshot, id: progress.id, reviewId: progress.reviewId });
			}
			assert.equal(progress.status, 'complete', JSON.stringify(progress));
			result.plan = progress.plan ?? result.plan;
			const document = JSON.parse(await readFile(progress.context.model, 'utf8'));
			const domain = document.semantics.elements.filter(item => item.kind !== 'feature');
			assert.deepEqual(document.views.filter(view => view.id.startsWith('semantic:')).map(view => view.kind).sort(), result.plan.map(item => item.kind).sort(), 'every approved diagram must be published');
			if (name === 'architecture') {
				for (const kind of ['c4Container', 'databaseSchema', 'class', 'deployment', 'dataFlow']) { assert.ok(document.views.some(view => view.kind === kind), 'evidenced architecture perspective: ' + kind); }
				assert.ok(domain.some(item => item.kind === 'table' && item.details?.members.some(member => member.key === 'foreign')), 'actual SQL FK is modeled');
				const tasks = domain.find(item => item.kind === 'table' && item.name.toLowerCase() === 'tasks');
				assert.ok(tasks, 'the physical tasks table is represented');
				for (const name of ['id', 'owner_id', 'title', 'completed']) { assert.equal(tasks.details.members.find(member => member.name === name)?.required, true, 'SQL mandatory column: ' + name); }
			} else {
				assert.ok(domain.length >= 3 && domain.length <= 24, 'a compact domain model must be published');
				assert.ok(domain.every(item => !/\.(rb|go)$|\b(boot|framework|initializer|test)\b/i.test(item.name)), 'scaffolding must not become domain responsibilities');
				assert.ok(domain.some(item => item.kind === 'action'), 'task operations must be represented');
				assert.ok(domain.some(item => item.kind === 'resource'), 'task data must be represented');
				assert.ok(document.views.length >= 1 && document.views.every(view => view.nodes.length >= 2 && view.relationIds.length >= 1), 'views must connect responsibilities');
				assert.deepEqual(document.views.filter(view => view.id.startsWith('semantic:')).map(view => view.kind).sort(), result.plan.map(item => item.kind).sort(), 'every approved diagram must be published');
				assert.ok(document.views.some(view => view.kind === 'sequence'), 'TODO interactions need a sequence perspective');
				assert.ok(document.views.some(view => view.kind === 'state'), 'TODO completion needs a resource lifecycle');
				assert.ok(document.semantics.relations.length >= 2, 'the TODO interactions must be represented');
				const behavior = domain.filter(item => item.kind === 'action' || item.kind === 'controller').map(item => item.name + ' ' + item.description).join(' ');
				for (const operation of [/create|add/i, /complete|finish|done/i, /delete|remove|destroy/i, /list|view|show|retrieve/i]) { assert.match(behavior, operation, 'all TODO capabilities must be described'); }
				if (name.startsWith('todo-rails')) { assert.ok(domain.some(item => item.kind === 'view' || item.kind === 'actor'), 'the evidenced task UI must be represented'); }
			}
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
