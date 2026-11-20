import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runDaiCorpus, daiCorpusGate, type DaiCorpus } from '../benchmarks/dai-corpus.ts';

const corpus: DaiCorpus = JSON.parse(await readFile(new URL('../benchmarks/corpus.v1.json', import.meta.url), 'utf8'));
const profiles = ['node.esm', 'bun.esm'];
const passing = corpus.cases.flatMap(item => profiles.map(profileId => ({ id: item.id, profileId, status: 'passed', expected: item.expected, observation: structuredClone(item.expected) })));

test('DAI12 release gate rejects omitted, duplicate, unavailable and forged observations on either profile', () => {
	assert.equal(daiCorpusGate(corpus, profiles, passing).accepted, true);
	for (const results of [passing.slice(1), [...passing, passing[0]], passing.map((r, i) => i ? r : { ...r, status: 'not-executed' }), passing.map((r, i) => i ? r : { ...r, observation: { ...r.observation, charges: 42 } }), passing.filter(r => r.profileId === 'node.esm')]) {
		assert.equal(daiCorpusGate(corpus, profiles, results).accepted, false);
	}
	assert.equal(daiCorpusGate(corpus, [], []).accepted, false);
	assert.equal(daiCorpusGate({ cases: [] }, profiles, []).accepted, false);
	assert.equal(daiCorpusGate(corpus, ['node.esm', 'node.esm'], passing).accepted, false);
});

test('DAI12 actual production negatives match frozen observations on both explicit profiles', async () => {
	const cases = corpus.cases.filter(item => ['invalid-reference', 'unknown-technology', 'unsupported-type', 'undeclared-external', 'adr-conflict', 'essential-omission', 'layout-only'].includes(item.id));
	const results = await runDaiCorpus({ cases }, profiles);
	assert.deepEqual(results.filter(item => item.status !== 'passed'), []);
	assert.equal(daiCorpusGate({ cases }, profiles, results).accepted, true);
});

test('DAI12 conservative migration proves compatibility rejection and modern v4 support without source or destination loss', async () => {
	const cases = corpus.cases.filter(item => item.id === 'conservative-migration');
	const results = await runDaiCorpus({ cases }, profiles);
	assert.deepEqual(results.map(result => ({ profileId: result.profileId, status: result.status, observation: result.observation, error: result.error })), profiles.map(profileId => ({ profileId, status: 'passed', observation: cases[0].expected, error: undefined })));
	for (const result of results) {
		assert.match(String(result.evidence?.boundary), /compatibility I\/O fixture, not a historical application binary/);
		assert.deepEqual(result.evidence?.checks && (result.evidence.checks as { version: number; legacyAccepted: boolean; modernV4Preserved: boolean; sourceBytesUnchanged: boolean; outputAbsent: boolean; sentinelUnchanged: boolean }[]).map(({ version, legacyAccepted, modernV4Preserved, sourceBytesUnchanged, outputAbsent, sentinelUnchanged }) => ({ version, legacyAccepted, modernV4Preserved, sourceBytesUnchanged, outputAbsent, sentinelUnchanged })), [2, 3].map(version => ({ version, legacyAccepted: true, modernV4Preserved: true, sourceBytesUnchanged: true, outputAbsent: true, sentinelUnchanged: true })));
	}
	assert.equal(daiCorpusGate({ cases }, profiles, results).accepted, true);
});

test('DAI12 unsupported database migration and full checkout are visible open cases, never skipped or passed', async () => {
	const cases = corpus.cases.filter(item => ['migration-data', 'migration-interrupted', 'checkout-approved'].includes(item.id));
	const results = await runDaiCorpus({ cases }, profiles);
	assert.equal(results.length, 6);
	assert.ok(results.every(item => item.status === 'not-executed' && item.reason && item.reason.length > 20));
	assert.deepEqual(daiCorpusGate({ cases }, profiles, results), { accepted: false, expectedExecutions: 6, passed: 0, failed: 0, notExecuted: 6 });
});
