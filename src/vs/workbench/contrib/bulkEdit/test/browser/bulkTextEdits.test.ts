import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { IReference } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ResourceTextEdit } from '../../../../../editor/browser/services/bulkEditService.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { IUndoRedoService, UndoRedoGroup } from '../../../../../platform/undoRedo/common/undoRedo.js';
import { BulkTextEdits } from '../../browser/bulkTextEdits.js';

suite('BulkTextEdits', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('rejects overlapping edits before changing any resource or its undo history', async () => {
		const first = store.add(createTextModel('first', null, undefined, URI.file('/first')));
		const second = store.add(createTextModel('second', null, undefined, URI.file('/second')));
		let disposed = 0;
		let undoElements = 0;
		const resolver = new class extends mock<ITextModelService>() {
			override async createModelReference(uri: URI) {
				const textEditorModel = uri.toString() === first.uri.toString() ? first : second;
				return { object: new class extends mock<IResolvedTextEditorModel>() { override textEditorModel = textEditorModel; }, dispose: () => disposed++ };
			}
		};
		const undo = new class extends mock<IUndoRedoService>() { override pushElement() { undoElements++; } };
		const edits = new BulkTextEdits('test', 'test', undefined, new UndoRedoGroup(), undefined, { report() { } }, CancellationToken.None, [
			new ResourceTextEdit(first.uri, { range: new Range(1, 1, 1, 2), text: 'F' }),
			new ResourceTextEdit(second.uri, { range: new Range(1, 1, 1, 4), text: 'S' }),
			new ResourceTextEdit(second.uri, { range: new Range(1, 3, 1, 5), text: 'X' }),
		], new class extends mock<IEditorWorkerService>() { }, new class extends mock<IModelService>() { }, resolver, undo);
		await assert.rejects(edits.apply(), /Overlapping ranges/);
		assert.deepStrictEqual({ values: [first.getValue(), second.getValue()], disposed, undoElements }, { values: ['first', 'second'], disposed: 2, undoElements: 0 });
	});

	test('releases references acquired before and after another resource fails to resolve', async () => {
		const model = store.add(createTextModel('content'));
		const late = new DeferredPromise<IReference<IResolvedTextEditorModel>>();
		let disposed = 0;
		const reference = () => ({ object: new class extends mock<IResolvedTextEditorModel>() { override textEditorModel = model; }, dispose: () => disposed++ });
		const resolver = new class extends mock<ITextModelService>() {
			override async createModelReference(uri: URI) {
				if (uri.path === '/failed') { throw new Error('resolve failed'); }
				return uri.path === '/late' ? late.p : reference();
			}
		};
		const edits = new BulkTextEdits('test', 'test', undefined, new UndoRedoGroup(), undefined, { report() { } }, CancellationToken.None,
			['/first', '/failed', '/late'].map(path => new ResourceTextEdit(URI.file(path), { range: new Range(1, 1, 1, 2), text: 'x' })),
			new class extends mock<IEditorWorkerService>() { }, new class extends mock<IModelService>() { }, resolver, new class extends mock<IUndoRedoService>() { });
		await assert.rejects(edits.apply(), /resolve failed/);
		await late.complete(reference());
		await Promise.resolve();
		await Promise.resolve();
		assert.strictEqual(disposed, 2);
	});

	test('owns references while minimal edit preparation is still pending', async () => {
		const model = store.add(createTextModel('content', null, undefined, URI.file('/first')));
		const started = new DeferredPromise<void>();
		const minimal = new DeferredPromise<{ range: Range; text: string }[]>();
		let disposed = 0;
		const resolver = new class extends mock<ITextModelService>() {
			override async createModelReference(uri: URI) {
				if (uri.path === '/failed') { await started.p; throw new Error('resolve failed'); }
				return { object: new class extends mock<IResolvedTextEditorModel>() { override textEditorModel = model; }, dispose: () => disposed++ };
			}
		};
		const worker = new class extends mock<IEditorWorkerService>() {
			override async computeMoreMinimalEdits() { await started.complete(); return minimal.p; }
		};
		const editor = new class extends mock<ICodeEditor>() { override getModel() { return model; } };
		const edits = new BulkTextEdits('test', 'test', editor, new UndoRedoGroup(), undefined, { report() { } }, CancellationToken.None,
			['/first', '/failed'].map(path => new ResourceTextEdit(URI.file(path), { range: new Range(1, 1, 1, 2), text: 'x' })), worker, new class extends mock<IModelService>() { }, resolver, new class extends mock<IUndoRedoService>() { });
		await assert.rejects(edits.apply(), /resolve failed/);
		assert.strictEqual(disposed, 1);
		await minimal.complete([]);
	});
});
