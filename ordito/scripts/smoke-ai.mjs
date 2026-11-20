import assert from 'node:assert/strict';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fixture, config, original } from '../ai/test/fixtures.mjs';

// Exercises the packaged native engine and a real subprocess speaking a simulated CLI contract.
// It does not sign in or call a model, and does not certify an external provider.
const cleanup = [];
try {
	const f = await fixture({ after: callback => cleanup.push(callback) });
	const executable = join(f.directory, 'simulated-codex.mjs');
	const counter = join(f.directory, 'calls.json');
	await writeFile(counter, '0');
	await writeFile(executable, `#!${process.execPath}\nimport {readFileSync,writeFileSync,writeSync} from 'node:fs';
const args=process.argv.slice(2);
const schema=JSON.parse(readFileSync(args[args.indexOf('--output-schema')+1],'utf8'));
const plan=${JSON.stringify(f.plan)};
const implementation=${JSON.stringify(f.generated)};
const counter=${JSON.stringify(counter)};
writeFileSync(counter,String(Number(readFileSync(counter,'utf8'))+1));
if(args.includes('failure-fixture')){implementation.files[1].content="import assert from 'node:assert/strict';assert.fail('fixture acceptance failure');";}
writeFileSync(args[args.indexOf('--output-last-message')+1],JSON.stringify(schema.properties.steps?plan:implementation));
writeSync(1,JSON.stringify({type:'turn.completed',usage:{input_tokens:10,output_tokens:20}})+'\\n');\n`);
	await chmod(executable, 0o700);
	const enginePath = new URL('../../out/vs/workbench/contrib/ordito/node/orditoCodeEngine.js', import.meta.url);
	let { engine } = await import(enginePath.href);
	const call = async request => JSON.parse(await engine.execute(JSON.stringify({ operation: 'collaboration', request: JSON.stringify(request) })));
	const prepared = await call({ operation: 'prepare', request: f.request, config: { ...config, executable } });
	assert.equal(Number(await readFile(counter, 'utf8')), 0);
	const proposal = await call({ operation: 'plan', prepared, reviewId: prepared.reviewId });
	const session = await call({ operation: 'stage', prepared, plan: proposal.plan, reviewId: proposal.planId });
	assert.equal(await readFile(join(f.root, 'checkout.mjs'), 'utf8'), original);
	assert.equal((await call({ operation: 'verify', root: f.root, id: session.id, reviewId: session.reviewId })).status, 'passed');
	assert.equal((await call({ operation: 'apply', root: f.root, id: session.id, reviewId: session.reviewId })).status, 'applied');
	assert.equal(await readFile(join(f.root, 'checkout.mjs'), 'utf8'), f.generated.files[0].content);
	({ engine } = await import(enginePath.href + '?restart=1'));
	assert.equal((await call({ operation: 'undo', root: f.root, id: session.id, reviewId: session.reviewId })).status, 'undone');
	assert.equal(await readFile(join(f.root, 'checkout.mjs'), 'utf8'), original);
	const failedContext = await call({ operation: 'prepare', request: f.request, config: { ...config, executable, model: 'failure-fixture' } });
	const failedPlan = await call({ operation: 'plan', prepared: failedContext, reviewId: failedContext.reviewId });
	const failedSession = await call({ operation: 'stage', prepared: failedContext, plan: failedPlan.plan, reviewId: failedPlan.planId });
	assert.equal((await call({ operation: 'verify', root: f.root, id: failedSession.id, reviewId: failedSession.reviewId })).status, 'failed');
	await assert.rejects(call({ operation: 'apply', root: f.root, id: failedSession.id, reviewId: failedSession.reviewId }), /passing/);
	const output = resolve('.build/ordito-smoke/m5-results.json'); await mkdir(resolve('.build/ordito-smoke'), { recursive: true });
	const report = { kind: 'packaged-engine-with-simulated-cli', externalProviderValidated: false, calls: Number(await readFile(counter, 'utf8')), passingImplementationAppliedAndUndone: true, restartRecovery: true, failingImplementationRejected: true, sourcePreserved: (await readFile(join(f.root, 'checkout.mjs'), 'utf8')) === original };
	await writeFile(output, JSON.stringify(report, null, '\t') + '\n');
	console.log(JSON.stringify(report));
} finally { for (const callback of cleanup.reverse()) { await callback(); } }
