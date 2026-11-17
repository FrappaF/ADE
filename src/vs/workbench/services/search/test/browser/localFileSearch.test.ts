/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { IWebWorkerServer, Proxied } from '../../../../../base/common/worker/webWorker.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { QueryType } from '../../common/search.js';
// Exercise the worker implementation in the browser test environment.
// eslint-disable-next-line local/code-import-patterns
import { LocalFileSearchWorker } from '../../worker/localFileSearch.js';

suite('LocalFileSearchWorker limits', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	test('publishes retained matches and reports the overflowing file limit', async () => {
		let published = 0;
		const server = new class extends mock<IWebWorkerServer>() {
			override getChannel<T extends object>(): Proxied<T> {
				return { $sendTextSearchMatch: () => published++ } as unknown as Proxied<T>;
			}
		};
		const worker = new LocalFileSearchWorker(server);
		// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers
		worker['walkFolderQuery'] = async (_handle, _query, _folder, _uri, onFile) => {
			await onFile({ type: 'file', name: 'file.txt', path: 'file.txt', resolve: async () => new TextEncoder().encode('before\nfoo\ncontext\nfoo\nafter\nfoo').buffer });
		};
		try {
			const result = await worker.$searchDirectory(undefined!, { type: QueryType.Text, contentPattern: { pattern: 'foo' }, folderQueries: [{ folder: URI.file('/search') }], maxResults: 2, surroundingContext: 1 }, { folder: URI.file('/search') }, false, 1);
			assert.deepStrictEqual({ limitHit: result.limitHit, count: result.results[0].results!.filter(result => hasKey(result, { rangeLocations: true })).length, published }, { limitHit: true, count: 2, published: 1 });
		} finally {
			worker.cancellationTokens.forEach(token => token.dispose());
		}
	});
});
