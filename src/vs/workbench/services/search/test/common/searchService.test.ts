/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, raceTimeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { IReference, toDisposable } from '../../../../../base/common/lifecycle.js';
import { extUri } from '../../../../../base/common/resources.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { IFileMatch, ISearchResultProvider, ITextQuery, ITextSearchMatch, QueryType, SearchProviderType, SearchRange, TextSearchMatch } from '../../common/search.js';
import { SearchService } from '../../common/searchService.js';

suite('SearchService limits', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	test('aggregates a limit reported by a later provider', async () => {
		const extensions = new class extends mock<IExtensionService>() { override async activateByEvent() { } override async whenInstalledExtensionsRegistered() { return true; } };
		const files = new class extends mock<IFileService>() { override async exists() { return true; } };
		const service = store.add(new SearchService(undefined!, undefined!, undefined!, new NullLogService(), extensions, files, undefined!, undefined!));
		// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers
		service['searchWithProviders'] = async () => [{ results: [], messages: [], limitHit: false }, { results: [], messages: [], limitHit: true }];
		const result = await service.fileSearch({ type: QueryType.File, folderQueries: [{ folder: URI.file('/search') }] });
		assert.strictEqual(result.limitHit, true);
	});
});

suite('SearchService legacy replacement baselines', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const resource = URI.parse('readonly-search:/file.txt');
	const query: ITextQuery = { type: QueryType.Text, folderQueries: [{ folder: resource }], contentPattern: { pattern: '\\w+', isRegExp: true } };

	function legacy(text = 'foobar', range = new SearchRange(0, 0, 0, text.length), previewWidth = 1): ITextSearchMatch {
		const match: ITextSearchMatch = new TextSearchMatch(text, range, { matchLines: 1, charsPerLine: previewWidth });
		delete match.fullMatchTexts;
		return match;
	}

	function reference(model: ITextModel, dispose = () => { }): IReference<IResolvedTextEditorModel> {
		return { object: new class extends mock<IResolvedTextEditorModel>() { override textEditorModel = model; override isReadonly() { return true; } }, dispose };
	}

	function createSearch(provider: ISearchResultProvider, resolve: (resource: URI) => Promise<IReference<IResolvedTextEditorModel>>) {
		const models = new class extends mock<IModelService>() { override getModels() { return []; } };
		const editors = new class extends mock<IEditorService>() { override editors = []; };
		const extensions = new class extends mock<IExtensionService>() { override async activateByEvent() { } override async whenInstalledExtensionsRegistered() { return true; } };
		const files = new class extends mock<IFileService>() { override async exists() { return true; } override hasProvider() { return false; } };
		const identities = new class extends mock<IUriIdentityService>() { override extUri = extUri; };
		const resolver = new class extends mock<ITextModelService>() { override createModelReference = resolve; };
		const search = store.add(new SearchService(models, editors, NullTelemetryService, new NullLogService(), extensions, files, identities, resolver));
		store.add(search.registerSearchResultProvider(resource.scheme, SearchProviderType.text, provider));
		return search;
	}

	function resultsProvider(results: IFileMatch[]): ISearchResultProvider {
		return new class extends mock<ISearchResultProvider>() { override async textSearch() { return { results, messages: [] }; } };
	}

	test('does not resolve a complete single-line legacy preview', async () => {
		const search = createSearch(resultsProvider([{ resource, results: [legacy('foobar', undefined, 100)] }]), async () => { throw new Error('must not resolve'); });
		const result = await search.textSearch(query);
		assert.strictEqual(result.results.length, 1);
	});

	test('delays publication and completion until a readonly virtual result has its baseline', async () => {
		const model = store.add(createTextModel('foobar', null, undefined, resource));
		const opened = new DeferredPromise<void>();
		const pending = new DeferredPromise<IReference<IResolvedTextEditorModel>>();
		const file = { resource, results: [legacy()] };
		const search = createSearch(new class extends mock<ISearchResultProvider>() {
			override async textSearch(_query: ITextQuery, onProgress?: (file: IFileMatch) => void) { onProgress?.(file); return { results: [file], messages: [] }; }
		}, async () => { opened.complete(); return pending.p; });
		let disposed = 0;
		let progress = 0;
		let completed = false;
		const resultPromise = search.textSearch(query, undefined, () => { assert.strictEqual(disposed, 1); progress++; }).then(result => { completed = true; return result; });
		await opened.p;
		assert.deepStrictEqual({ progress, completed }, { progress: 0, completed: false });
		pending.complete(reference(model, () => disposed++));
		const result = await resultPromise;
		assert.deepStrictEqual((result.results[0].results![0] as ITextSearchMatch).fullMatchTexts, ['foobar']);
		assert.deepStrictEqual({ progress, disposed }, { progress: 1, disposed: 1 });
	});

	test('bounds simultaneously held models for results-only providers', async () => {
		const model = store.add(createTextModel('foobar', null, undefined, resource));
		const opened = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		const files = Array.from({ length: 5 }, (_, index) => ({ resource: resource.with({ path: `/file${index}.txt` }), results: [legacy()] }));
		let active = 0;
		let maximum = 0;
		let disposed = 0;
		const search = createSearch(resultsProvider(files), async () => {
			active++;
			maximum = Math.max(maximum, active);
			if (active === 2) { opened.complete(); }
			await release.p;
			return reference(model, () => { active--; disposed++; });
		});
		const resultPromise = search.textSearch(query);
		await opened.p;
		assert.strictEqual(active, 2);
		release.complete();
		assert.strictEqual((await resultPromise).results.length, 5);
		assert.deepStrictEqual({ maximum, active, disposed }, { maximum: 2, active: 0, disposed: 5 });
	});

	test('releases a model resolved after cancellation and publishes no late result', async () => {
		const model = store.add(createTextModel('foobar', null, undefined, resource));
		const opened = new DeferredPromise<void>();
		const pending = new DeferredPromise<IReference<IResolvedTextEditorModel>>();
		const disposed = new DeferredPromise<void>();
		const cancellation = store.add(new CancellationTokenSource());
		const file = { resource, results: [legacy()] };
		const search = createSearch(new class extends mock<ISearchResultProvider>() {
			override async textSearch(_query: ITextQuery, onProgress?: (file: IFileMatch) => void) { onProgress?.(file); return { results: [file], messages: [] }; }
		}, async () => { opened.complete(); return pending.p; });
		let progress = 0;
		const resultPromise = search.textSearch(query, cancellation.token, () => progress++);
		await opened.p;
		cancellation.cancel();
		await assert.rejects(resultPromise, /Canceled/);
		pending.complete(reference(model, () => { disposed.complete(); }));
		await disposed.p;
		assert.strictEqual(progress, 0);
	});

	test('releases admission cancellation listeners before a blocked model resolves', async () => {
		const model = store.add(createTextModel('foobar', null, undefined, resource));
		const opened = new DeferredPromise<void>();
		const pending = new DeferredPromise<IReference<IResolvedTextEditorModel>>();
		const disposed = new DeferredPromise<void>();
		const noListeners = new DeferredPromise<void>();
		const cancellation = store.add(new CancellationTokenSource());
		let listeners = 0;
		const token: CancellationToken = {
			get isCancellationRequested() { return cancellation.token.isCancellationRequested; },
			onCancellationRequested: (listener, thisArgs) => {
				listeners++;
				const subscription = cancellation.token.onCancellationRequested(listener, thisArgs);
				return toDisposable(() => { subscription.dispose(); if (--listeners === 0) { noListeners.complete(); } });
			}
		};
		const search = createSearch(resultsProvider([{ resource, results: [legacy()] }]), async () => { opened.complete(); return pending.p; });
		const resultPromise = search.textSearch(query, token);
		await opened.p;
		cancellation.cancel();
		await assert.rejects(resultPromise, /Canceled/);
		let cleaned: boolean | undefined;
		try {
			cleaned = await raceTimeout(noListeners.p.then(() => true), 1000);
		} finally {
			pending.complete(reference(model, () => { disposed.complete(); }));
			await disposed.p;
		}
		assert.strictEqual(cleaned, true, 'admission cleanup must not wait for the underlying model resolver');
	});

	test('rejects a failed provider and drains queued admissions before blocked models resolve', async () => {
		const model = store.add(createTextModel('foobar', null, undefined, resource));
		const opened = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		const disposed = new DeferredPromise<void>();
		const providerDone = new DeferredPromise<never>();
		const files = Array.from({ length: 3 }, (_, index) => ({ resource: resource.with({ path: `/file${index}.txt` }), results: [legacy()] }));
		let resolved = 0;
		let released = 0;
		const search = createSearch(new class extends mock<ISearchResultProvider>() {
			override async textSearch(_query: ITextQuery, onProgress?: (file: IFileMatch) => void) { files.forEach(file => onProgress?.(file)); return providerDone.p; }
		}, async () => {
			if (++resolved === 2) { opened.complete(); }
			await release.p;
			return reference(model, () => { if (++released === 2) { disposed.complete(); } });
		});
		let progress = 0;
		const resultPromise = search.textSearch(query, undefined, () => progress++);
		await opened.p;
		providerDone.error(new Error('provider failed'));
		let rejected: boolean | undefined;
		try {
			rejected = await raceTimeout(assert.rejects(resultPromise, /provider failed/).then(() => true), 1000);
		} finally {
			release.complete();
			await disposed.p;
			await resultPromise.catch(() => { });
		}
		assert.strictEqual(rejected, true, 'provider failure must not wait for blocked model resolution');
		assert.deepStrictEqual({ resolved, released, progress }, { resolved: 2, released: 2, progress: 0 });
	});

	test('omits an unavailable file without failing other results', async () => {
		const model = store.add(createTextModel('foobar', null, undefined, resource));
		const missing = resource.with({ path: '/missing.txt' });
		let disposed = 0;
		const search = createSearch(resultsProvider([{ resource: missing, results: [legacy()] }, { resource, results: [legacy()] }]), async uri => {
			if (uri.toString() === missing.toString()) { throw new Error('file disappeared'); }
			return reference(model, () => disposed++);
		});
		const result = await search.textSearch(query);
		assert.deepStrictEqual(result.results.map(file => file.resource), [resource]);
		assert.strictEqual(disposed, 1);
	});

	test('checks every visible fragment before accepting a baseline', async () => {
		const model = store.add(createTextModel('foo123 bar456', null, undefined, resource));
		const match: ITextSearchMatch = {
			previewText: 'foo123 z',
			rangeLocations: [
				{ source: new SearchRange(0, 0, 0, 6), preview: new SearchRange(0, 0, 0, 6) },
				{ source: new SearchRange(0, 7, 0, 13), preview: new SearchRange(0, 7, 0, 13) }
			]
		};
		const search = createSearch(resultsProvider([{ resource, results: [match] }]), async () => reference(model));
		assert.deepStrictEqual((await search.textSearch(query)).results, []);
	});

	test('preserves a provider baseline when only another range needs a snapshot', async () => {
		const model = store.add(createTextModel('foo999 bar456', null, undefined, resource));
		const match: ITextSearchMatch = {
			previewText: 'f b',
			fullMatchTexts: ['foo123'],
			rangeLocations: [
				{ source: new SearchRange(0, 0, 0, 6), preview: new SearchRange(0, 0, 0, 1) },
				{ source: new SearchRange(0, 7, 0, 13), preview: new SearchRange(0, 2, 0, 3) }
			]
		};
		const search = createSearch(resultsProvider([{ resource, results: [match] }]), async () => reference(model));
		assert.deepStrictEqual((await search.textSearch(query)).results, []);
	});

	test('keeps progress snapshots stable when a provider appends chunks to its first file', async () => {
		const model = store.add(createTextModel('foo123\nbar456', null, undefined, resource));
		const first: IFileMatch = { resource, results: [legacy('foo123')] };
		const second: IFileMatch = { resource, results: [legacy('bar456', new SearchRange(1, 0, 1, 6))] };
		const search = createSearch(new class extends mock<ISearchResultProvider>() {
			override async textSearch(_query: ITextQuery, onProgress?: (file: IFileMatch) => void) {
				onProgress?.(first);
				first.results!.push(...second.results!);
				onProgress?.(second);
				return { results: [first], messages: [] };
			}
		}, async () => reference(model));
		const progress: IFileMatch[] = [];
		const result = await search.textSearch(query, undefined, item => { if (hasKey(item, { resource: true })) { progress.push(item); } });
		assert.deepStrictEqual(progress.map(file => file.results!.length), [1, 1]);
		assert.deepStrictEqual(result.results[0].results!.map(match => (match as ITextSearchMatch).fullMatchTexts), [['foo123'], ['bar456']]);
	});
});
