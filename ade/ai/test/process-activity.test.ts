import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tmpdir } from 'node:os';
import { ProcessTimeoutError, runProcess } from '../process.ts';

test('stdout activity renews the idle deadline while cancellation still stops the process', { timeout: 5000 }, async t => {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	const controller = new AbortController(); t.after(() => controller.abort());
	let next: (() => void) | undefined;
	const output = () => new Promise<void>(resolve => { next = resolve; });
	const ready = output();
	const pending = runProcess(process.execPath, ['-e', 'console.log("ready"); setInterval(() => console.log("active"), 10);'], tmpdir(), { signal: controller.signal, idleTimeoutMs: 100, timeoutMs: 1000, onOutput: (_text, stream) => { if (stream === 'stdout') { next?.(); next = undefined; } } });
	const stopped = assert.rejects(pending, /cancelled/);
	await ready;
	for (let index = 0; index < 4; index++) { const activity = output(); t.mock.timers.tick(90); await activity; }
	controller.abort(); await stopped;
});

test('stderr alone cannot keep an unresponsive provider alive', { timeout: 5000 }, async t => {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	let ready: () => void;
	const started = new Promise<void>(resolve => { ready = resolve; });
	const controller = new AbortController(); t.after(() => controller.abort());
	let nextStderr: (() => void) | undefined;
	const pending = runProcess(process.execPath, ['-e', 'console.log("ready"); setInterval(() => console.error("noise"), 10);'], tmpdir(), { signal: controller.signal, idleTimeoutMs: 100, timeoutMs: 1000, onOutput: (_text, stream) => { if (stream === 'stdout') { ready(); } else { nextStderr?.(); nextStderr = undefined; } } });
	const stopped = assert.rejects(pending, error => error instanceof ProcessTimeoutError && error.reason === 'idle' && /provider stopped responding/.test(error.message));
	await started; t.mock.timers.tick(90);
	await new Promise<void>(resolve => { nextStderr = resolve; });
	t.mock.timers.tick(11); await stopped;
});

test('continuous output does not bypass the total time limit', { timeout: 5000 }, async t => {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	let ready: () => void;
	const started = new Promise<void>(resolve => { ready = resolve; });
	const controller = new AbortController(); t.after(() => controller.abort());
	const pending = runProcess(process.execPath, ['-e', 'console.log("ready"); setInterval(() => console.log("active"), 10);'], tmpdir(), { signal: controller.signal, idleTimeoutMs: 1000, timeoutMs: 100, onOutput: () => ready() });
	const stopped = assert.rejects(pending, error => error instanceof ProcessTimeoutError && error.reason === 'deadline' && error.message === 'Operation timed out');
	await started; t.mock.timers.tick(101); await stopped;
});
