import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getFileResults } from '../../common/getFileResults.js';
import { resultIsMatch } from '../../common/search.js';

suite('getFileResults', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const bytes = (text: string) => new TextEncoder().encode(text);
	const options = { surroundingContext: 1, previewOptions: undefined, remainingResultQuota: 2 };

	test('keeps the first matches and reports a truncated file without counting context', () => {
		const result = getFileResults(bytes('before\nfoo\ncontext\nfoo\nafter\nfoo'), /foo/g, options);
		assert.deepStrictEqual({ lines: result.results.filter(resultIsMatch).map(match => match.rangeLocations[0].source.startLineNumber), limitHit: result.limitHit }, { lines: [1, 3], limitHit: true });
		assert.ok(result.results.some(result => !resultIsMatch(result)));
	});

	test('resets a reused regexp after quota truncation and detects exact quotas', () => {
		const pattern = /foo/g;
		getFileResults(bytes('foo foo foo'), pattern, options);
		const result = getFileResults(bytes('foo foo'), pattern, options);
		assert.deepStrictEqual({ count: result.results.filter(resultIsMatch).length, limitHit: result.limitHit, lastIndex: pattern.lastIndex }, { count: 2, limitHit: false, lastIndex: 0 });
	});

	test('reports a match beyond a zero remaining quota', () => {
		assert.deepStrictEqual(getFileResults(bytes('foo'), /foo/g, { ...options, remainingResultQuota: 0 }), { results: [], limitHit: true });
	});

	test('advances zero-width Unicode matches across complete code points', () => {
		const result = getFileResults(bytes('😀a'), /(?=.)/gu, { ...options, remainingResultQuota: 10 });
		assert.deepStrictEqual(result.results.filter(resultIsMatch).map(match => match.rangeLocations[0].source.startColumn), [0, 2]);
		assert.strictEqual(result.limitHit, false);
	});

});
