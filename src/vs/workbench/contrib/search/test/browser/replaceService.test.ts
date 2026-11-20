import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { extUri } from '../../../../../base/common/resources.js';
import { hasKey } from '../../../../../base/common/types.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IBulkEditService, ResourceTextEdit } from '../../../../../editor/browser/services/bulkEditService.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { ITextFileEditorModelManager, ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { ReplacePattern } from '../../../../services/search/common/replace.js';
import { IFileMatch, ISearchResultProvider, ITextQuery, ITextSearchMatch, QueryType, SearchProviderType, SearchRange, TextSearchMatch } from '../../../../services/search/common/search.js';
import { SearchService } from '../../../../services/search/common/searchService.js';
import { ReplaceService } from '../../browser/replaceService.js';
import { textSearchResultToMatches } from '../../browser/searchTreeModel/match.js';
import { FILE_MATCH_PREFIX, ISearchModel, ISearchResult, ISearchTreeFileMatch, ISearchTreeFolderMatch, ISearchTreeMatch } from '../../browser/searchTreeModel/searchTreeCommon.js';

suite('Search replace freshness', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	async function admitLegacy(raw: ITextSearchMatch, model: ITextModel, query: ITextQuery, delivery: 'progress' | 'results'): Promise<ITextSearchMatch> {
		const models = new class extends mock<IModelService>() { override getModels() { return []; } };
		const editors = new class extends mock<IEditorService>() { override editors = []; };
		const extensions = new class extends mock<IExtensionService>() { override async activateByEvent() { } override async whenInstalledExtensionsRegistered() { return true; } };
		const files = new class extends mock<IFileService>() { override async exists() { return true; } };
		const identities = new class extends mock<IUriIdentityService>() { override extUri = extUri; };
		let disposed = 0;
		const resolver = new class extends mock<ITextModelService>() {
			override async createModelReference() { return { object: new class extends mock<IResolvedTextEditorModel>() { override textEditorModel = model; }, dispose: () => disposed++ }; }
		};
		const search = store.add(new SearchService(models, editors, NullTelemetryService, new NullLogService(), extensions, files, identities, resolver));
		const file: IFileMatch = { resource: model.uri, results: [raw] };
		store.add(search.registerSearchResultProvider(model.uri.scheme, SearchProviderType.text, new class extends mock<ISearchResultProvider>() {
			override async textSearch(_query: ITextQuery, onProgress?: (file: IFileMatch) => void) {
				if (delivery === 'progress') { onProgress?.(file); }
				return { results: [file], messages: [] };
			}
		}));
		const progress: IFileMatch[] = [];
		const result = await search.textSearch({ ...query, folderQueries: [{ folder: model.uri }] }, undefined, item => { if (hasKey(item, { resource: true })) { progress.push(item); } });
		assert.strictEqual(disposed, 1);
		if (delivery === 'progress') {
			assert.deepStrictEqual(progress[0].results, result.results[0].results);
		}
		return result.results[0].results![0] as ITextSearchMatch;
	}

	async function replace(original: string, current: string, pattern: string, replacement: string, range: SearchRange | SearchRange[], previewWidth = 10000, otherCurrent?: string, options: { preserveCase?: boolean; isWordMatch?: boolean; wordSeparators?: string; isMultiline?: boolean; replaceAll?: boolean; legacy?: 'progress' | 'results'; matchIndex?: number; preview?: string; originalDocument?: string } = {}) {
		const uri = URI.file('/search/file.txt');
		const model = store.add(createTextModel(options.legacy ? options.originalDocument ?? original : current, null, undefined, uri));
		let applied: ResourceTextEdit[] = [];
		let disposed = 0;
		const contentPattern = { pattern, isRegExp: true, isMultiline: options.isMultiline, isWordMatch: options.isWordMatch, wordSeparators: options.wordSeparators };
		const searchModel = new class extends mock<ISearchModel>() {
			override replaceString = replacement;
			override replacePattern = new ReplacePattern(replacement, contentPattern);
			override preserveCase = options.preserveCase ?? false;
			override searchResult = new class extends mock<ISearchResult>() { override query: ITextQuery = { type: QueryType.Text, contentPattern, folderQueries: [] }; };
		};
		const folder = new class extends mock<ISearchTreeFolderMatch>() { override searchModel = searchModel; };
		const file: ISearchTreeFileMatch = new class extends mock<ISearchTreeFileMatch>() { override resource = uri; override parent() { return folder; } override id() { return FILE_MATCH_PREFIX + uri; } override matches(): ISearchTreeMatch[] { return options.replaceAll ? matches : [match]; } override count() { return this.matches().length; } };
		let raw: ITextSearchMatch = new TextSearchMatch(original, range, { matchLines: 1, charsPerLine: previewWidth });
		if (options.legacy) {
			delete raw.fullMatchTexts;
			if (options.preview !== undefined) { raw.previewText = options.preview; }
			raw = await admitLegacy(raw, model, searchModel.searchResult.query!, options.legacy);
			model.setValue(current);
		}
		const matches = textSearchResultToMatches(raw, file, false);
		const match: ISearchTreeMatch = matches[options.matchIndex ?? 0];
		const otherUri = URI.file('/search/other.txt');
		const otherModel = otherCurrent === undefined ? undefined : store.add(createTextModel(otherCurrent, null, undefined, otherUri));
		const otherFile: ISearchTreeFileMatch = new class extends mock<ISearchTreeFileMatch>() { override resource = otherUri; override parent() { return folder; } override id() { return FILE_MATCH_PREFIX + otherUri; } override matches(): ISearchTreeMatch[] { return [otherMatch]; } override count() { return 1; } };
		const otherMatch: ISearchTreeMatch = textSearchResultToMatches(new TextSearchMatch(original, range), otherFile, false)[0];
		const resolver = new class extends mock<ITextModelService>() {
			override async createModelReference(resource: URI) { return { object: new class extends mock<IResolvedTextEditorModel>() { override textEditorModel = resource.toString() === uri.toString() ? model : otherModel!; }, dispose: () => disposed++ }; }
		};
		const bulk = new class extends mock<IBulkEditService>() {
			override async apply(edits: ResourceTextEdit[]) { applied = edits; return { ariaSummary: '', isApplied: true }; }
		};
		const textFiles = new class extends mock<ITextFileService>() { override files = new class extends mock<ITextFileEditorModelManager>() { override get() { return undefined; } }; };
		const service = new ReplaceService(textFiles, undefined!, resolver, bulk, undefined!, undefined!);
		return { run: () => otherModel ? service.replace([file, otherFile]) : options.replaceAll ? service.replace([file]) : service.replace(match), model, getApplied: () => applied, getDisposed: () => disposed };
	}

	test('replaces an unchanged line anchor after the first line', async () => {
		const test = await replace('foo', 'bar\nfoo', '^foo$', 'baz', new SearchRange(1, 0, 1, 3));
		await test.run();
		assert.strictEqual(test.getApplied()[0].textEdit.text, 'baz');
	});

	test('replaces all unchanged anchored results with captures and case operations', async () => {
		const text = 'bar\nfoo\nfoo';
		const test = await replace('foo\nfoo', text, '^(foo)$', '\\U$1', [new SearchRange(1, 0, 1, 3), new SearchRange(2, 0, 2, 3)], 10000, undefined, { replaceAll: true });
		await test.run();
		assert.deepStrictEqual(test.getApplied().map(edit => edit.textEdit.text), ['FOO', 'FOO']);
	});

	test('uses configured whole-word separators when calculating replacements', async () => {
		const test = await replace('foo_bar', 'foo_bar', '(foo)', '$1baz', new SearchRange(0, 0, 0, 3), 10000, undefined, { isWordMatch: true, wordSeparators: '_' });
		await test.run();
		assert.strictEqual(test.getApplied()[0].textEdit.text, 'foobaz');
	});

	test('keeps line-local lookaround captures consistent with the validated search', async () => {
		const test = await replace('foo', 'x\nfoo', '(?:(?<=\\s)(foo)|(foo))', '$1-$2', new SearchRange(1, 0, 1, 3));
		await test.run();
		assert.strictEqual(test.getApplied()[0].textEdit.text, '-foo');
	});

	test('rejects shifted closed-file results without applying and releases references', async () => {
		const test = await replace('foo', 'bar\nfoo', 'foo', 'baz', new SearchRange(0, 0, 0, 3));
		await assert.rejects(test.run(), /out of date/);
		assert.deepStrictEqual({ edits: test.getApplied(), disposed: test.getDisposed() }, { edits: [], disposed: 1 });
	});

	test('preserves full long matches and captures despite truncated previews', async () => {
		const test = await replace('foobar', 'foobar', '(foo)(bar)', '$2$1', new SearchRange(0, 0, 0, 6), 1);
		await test.run();
		assert.deepStrictEqual(test.getApplied().map(edit => [edit.textEdit.text, edit.versionId]), [['barfoo', test.model.getVersionId()]]);
	});

	test('accepts unchanged multiline matches across CRLF normalization', async () => {
		const test = await replace('foo\nbar', 'foo\r\nbar', '(foo)\\n(bar)', '$2$1', new SearchRange(0, 0, 1, 3));
		await test.run();
		assert.strictEqual(test.getApplied()[0].textEdit.text, 'barfoo');
	});

	test('validates the entire replacement batch before applying any file', async () => {
		const test = await replace('foo', 'foo', 'foo', 'bar', new SearchRange(0, 0, 0, 3), 10000, 'changed');
		await assert.rejects(test.run(), /out of date/);
		assert.deepStrictEqual({ edits: test.getApplied(), disposed: test.getDisposed() }, { edits: [], disposed: 2 });
	});

	test('rejects an invalidated zero-width match', async () => {
		const test = await replace('foo', 'bar', '(?=foo)', 'x', new SearchRange(0, 0, 0, 0));
		await assert.rejects(test.run(), /out of date/);
	});

	test('checks lookbehind on adjacent lines in the current document', async () => {
		const test = await replace('bar', 'baz\nbar', '(?<=foo\\n)bar', 'x', new SearchRange(1, 0, 1, 3));
		await assert.rejects(test.run(), /out of date/);
	});

	test('uses captures at the exact requested range rather than the first line match', async () => {
		const test = await replace('x1 x2', 'x1 x2', '(?<=x)(\\d)', '$1$1', new SearchRange(0, 4, 0, 5));
		await test.run();
		assert.strictEqual(test.getApplied()[0].textEdit.text, '22');
	});

	test('preserves search replacement case handling with capture groups', async () => {
		const test = await replace('foo', 'foo', '(foo)', '$1BAR', new SearchRange(0, 0, 0, 3), 10000, undefined, { preserveCase: true });
		await test.run();
		assert.strictEqual(test.getApplied()[0].textEdit.text, 'foobar');
	});

	test('rejects a match that is no longer a whole word without explicit separators', async () => {
		const test = await replace('foo', 'fooa', 'foo', 'bar', new SearchRange(0, 0, 0, 3), 10000, undefined, { isWordMatch: true });
		await assert.rejects(test.run(), /out of date/);
	});

	test('admits unchanged truncated legacy progress results and preserves captures', async () => {
		const test = await replace('foobar', 'foobar', '(foo)(bar)', '$2$1', new SearchRange(0, 0, 0, 6), 1, undefined, { legacy: 'progress' });
		await test.run();
		assert.strictEqual(test.getApplied()[0].textEdit.text, 'barfoo');
	});

	test('rejects a changed suffix outside the legacy preview even when the query still matches', async () => {
		const test = await replace('foobar', 'foobaz', 'foo...', 'x', new SearchRange(0, 0, 0, 6), 1, undefined, { legacy: 'results' });
		await assert.rejects(test.run(), /out of date/);
		assert.deepStrictEqual(test.getApplied(), []);
	});

	test('admits multiple truncated matches and uses the selected occurrence captures', async () => {
		const test = await replace('x123 x456', 'x123 x456', '(?<=x)(\\d+)', '$1$1', [new SearchRange(0, 1, 0, 4), new SearchRange(0, 6, 0, 9)], 1, undefined, { legacy: 'progress', matchIndex: 1 });
		await test.run();
		assert.strictEqual(test.getApplied()[0].textEdit.text, '456456');
	});

	test('admits multiline legacy results and rejects subsequent unseen changes', async () => {
		const test = await replace('foo\nbar', 'foo\nbaz', 'foo\\nb..', 'x', new SearchRange(0, 0, 1, 3), 1, undefined, { legacy: 'results', preview: 'foo\nb' });
		await assert.rejects(test.run(), /out of date/);
	});

	test('accepts unchanged truncated multiline legacy matches', async () => {
		const test = await replace('foo\nbar', 'foo\nbar', '(foo)\\n(bar)', '$2$1', new SearchRange(0, 0, 1, 3), 1, undefined, { legacy: 'results', preview: 'foo\nb' });
		await test.run();
		assert.strictEqual(test.getApplied()[0].textEdit.text, 'barfoo');
	});

	test('accepts truncated legacy lookbehind matches using the full document context', async () => {
		const test = await replace('bar123', 'foo\nbar123', '(?<=foo\\n)(bar)(123)', '$2$1', new SearchRange(1, 0, 1, 6), 1, undefined, { legacy: 'results', originalDocument: 'foo\nbar123' });
		await test.run();
		assert.strictEqual(test.getApplied()[0].textEdit.text, '123bar');
	});

	test('rejects an invalidated lookbehind after admitting a truncated legacy match', async () => {
		const test = await replace('bar123', 'baz\nbar123', '(?<=foo\\n)(bar)(123)', '$2$1', new SearchRange(1, 0, 1, 6), 1, undefined, { legacy: 'results', originalDocument: 'foo\nbar123' });
		await assert.rejects(test.run(), /out of date/);
	});

	test('preserves case handling for captures in truncated legacy matches', async () => {
		const test = await replace('foo', 'foo', '(foo)', '$1BAR', new SearchRange(0, 0, 0, 3), 1, undefined, { legacy: 'progress', preserveCase: true });
		await test.run();
		assert.strictEqual(test.getApplied()[0].textEdit.text, 'foobar');
	});
});
