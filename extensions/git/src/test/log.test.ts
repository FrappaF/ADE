/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import { sanitizeGitLog } from '../log';

suite('Git log credentials', () => {
	test('redacts credentials in commands and output while preserving useful URLs', () => {
		assert.deepStrictEqual([
			'> git clone https://user:fake-password@example.com/repo.git',
			`fatal: 'https://fake-token@example.com/repo.git' is unavailable`,
			'https://user:p%40ss@example.com/a https://other:secret@example.org/b',
			'https://example.com/repo?access_token=fake-token&ref=main',
			`https://user:pa'ss@example.com/repo`,
			`https://example.com/repo?access_token=pa'ss&ref=main`,
			'https://example.com/repo.git',
			'git@example.com:repo.git',
		].map(sanitizeGitLog), [
			'> git clone https://***@example.com/repo.git',
			`fatal: 'https://***@example.com/repo.git' is unavailable`,
			'https://***@example.com/a https://***@example.org/b',
			'https://example.com/repo?access_token=***&ref=main',
			'https://***@example.com/repo',
			'https://example.com/repo?access_token=***&ref=main',
			'https://example.com/repo.git',
			'git@example.com:repo.git',
		]);
	});
});
