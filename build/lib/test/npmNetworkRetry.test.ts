/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';
import { withNpmNetworkRetries } from '../npmNetworkRetry.ts';

suite('npm network retries', () => {
	for (const message of ['npm error code ECONNRESET', 'npm ERR! code ETIMEDOUT', 'npm error code EAI_AGAIN']) {
		test(`recovers from ${message}`, async () => {
			let attempts = 0;
			const retries: number[] = [];
			const delays: number[] = [];
			const result = await withNpmNetworkRetries(async () => {
				if (++attempts < 3) { throw new Error(`Process exited with code: 152\n${message}`); }
				return 'installed';
			}, attempt => { retries.push(attempt); }, async milliseconds => { delays.push(milliseconds); });
			assert.deepStrictEqual({ result, attempts, retries, delays }, { result: 'installed', attempts: 3, retries: [2, 3], delays: [1000, 2000] });
		});
	}

	test('propagates an exhausted network failure', async () => {
		let attempts = 0;
		const failure = new Error('npm error code ECONNRESET');
		await assert.rejects(withNpmNetworkRetries(async () => { attempts++; throw failure; }, () => {}, async () => {}), error => error === failure);
		assert.strictEqual(attempts, 3);
	});

	for (const message of ['npm error code E401', 'npm error code E403', 'npm error code 1\ngyp ERR! build error', 'spawn npm ENOENT']) {
		test(`does not retry ${message.split('\n')[0]}`, async () => {
			let attempts = 0;
			const failure = new Error(message);
			await assert.rejects(withNpmNetworkRetries(async () => { attempts++; throw failure; }, () => assert.fail('Unexpected retry'), async () => assert.fail('Unexpected wait')), error => error === failure);
			assert.strictEqual(attempts, 1);
		});
	}
});
