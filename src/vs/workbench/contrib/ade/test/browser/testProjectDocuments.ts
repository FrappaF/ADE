import { SaveReason } from '../../../../common/editor.js';
import { Event, Emitter } from '../../../../../base/common/event.js';
import { DisposableStore, IReference } from '../../../../../base/common/lifecycle.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IResolvedTextFileEditorModel, ITextFileEditorModelManager, ITextFileService, type ITextFileEditorModelSaveEvent } from '../../../../services/textfile/common/textfiles.js';

/** Uses the real editor text model and undo stack; file-model plumbing is covered by desktop smoke. */
class ProjectDocument extends mock<IResolvedTextFileEditorModel>() {
	private baseline: string;
	private readonly dirtyEmitter: Emitter<void>;
	override readonly textEditorModel;
	override readonly onDidChangeContent;
	override readonly onDidChangeDirty;
	override readonly onDidChangeReadonly = Event.None;
	private readonly saveEmitter: Emitter<ITextFileEditorModelSaveEvent>;
	override readonly onDidSave;

	constructor(private readonly files: IFileService, readonly uri: URI, value: string, store: Pick<DisposableStore, 'add'>) {
		super();
		this.baseline = value;
		this.saveEmitter = store.add(new Emitter<ITextFileEditorModelSaveEvent>()); this.onDidSave = this.saveEmitter.event;
		this.dirtyEmitter = store.add(new Emitter<void>());
		this.textEditorModel = store.add(createTextModel(value, undefined, undefined, uri));
		const contentEmitter = store.add(new Emitter<void>());
		this.onDidChangeContent = contentEmitter.event;
		this.onDidChangeDirty = this.dirtyEmitter.event;
		store.add(this.textEditorModel.onDidChangeContent(() => { this.dirtyEmitter.fire(); contentEmitter.fire(); }));
	}
	override isDirty(): this is IResolvedTextFileEditorModel { return this.baseline !== this.textEditorModel.getValue(); }
	override isResolved(): this is IResolvedTextFileEditorModel { return true; }
	override isReadonly(): boolean { return false; }
	refresh(value: string): void {
		this.baseline = value;
		if (this.textEditorModel.getValue() !== value) { this.textEditorModel.setValue(value); }
	}
	override async save(): Promise<boolean> {
		const content = this.textEditorModel.getValue();
		const stat = await this.files.writeFile(this.uri, VSBuffer.fromString(content));
		this.baseline = content;
		this.saveEmitter.fire({ reason: SaveReason.EXPLICIT, stat });
		this.dirtyEmitter.fire();
		return true;
	}
	override async revert(): Promise<void> {
		this.refresh((await this.files.readFile(this.uri)).value.toString());
		this.dirtyEmitter.fire();
	}
}

export function projectDocuments(files: IFileService, store: Pick<DisposableStore, 'add'>) {
	const documents = new Map<string, ProjectDocument>();
	const manager = new class extends mock<ITextFileEditorModelManager>() {
		override async resolve(uri: URI): Promise<IResolvedTextFileEditorModel> {
			const key = uri.toString();
			let document = documents.get(key);
			if (document?.isDirty()) { return document; }
			const content = (await files.readFile(uri)).value.toString();
			if (document) { document.refresh(content); } else {
				document = new ProjectDocument(files, uri, content, store);
				documents.set(key, document);
			}
			return document;
		}
	}();
	return {
		textFiles: new class extends mock<ITextFileService>() {
			override readonly files = manager;
			override async saveAs(source: URI, target?: URI): Promise<URI | undefined> {
				if (!target) { return undefined; }
				const document = await manager.resolve(source);
				await files.writeFile(target, VSBuffer.fromString(document.textEditorModel.getValue()));
				await document.revert();
				return target;
			}
		}(),
		textModels: new class extends mock<ITextModelService>() {
			override async createModelReference(uri: URI): Promise<IReference<IResolvedTextEditorModel>> {
				const document = documents.get(uri.toString());
				if (!document) { throw new Error('Document not resolved'); }
				return { object: document, dispose: () => { } };
			}
		}()
	};
}
