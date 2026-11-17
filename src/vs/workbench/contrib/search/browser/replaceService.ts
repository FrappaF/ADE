/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { URI } from '../../../../base/common/uri.js';
import * as network from '../../../../base/common/network.js';
import { Disposable, DisposableStore, IReference } from '../../../../base/common/lifecycle.js';
import { IReplaceService } from './replace.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { ISearchViewModelWorkbenchService } from './searchTreeModel/searchViewModelWorkbenchService.js';
import { IProgress, IProgressStep } from '../../../../platform/progress/common/progress.js';
import { ITextModelService, ITextModelContentProvider } from '../../../../editor/common/services/resolverService.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ScrollType } from '../../../../editor/common/editorCommon.js';
import { EndOfLinePreference, FindMatch, ITextModel } from '../../../../editor/common/model.js';
import { USUAL_WORD_SEPARATORS } from '../../../../editor/common/core/wordHelper.js';
import { SearchParams } from '../../../../editor/common/model/textModelSearch.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { createTextBufferFactoryFromSnapshot } from '../../../../editor/common/model/textModel.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { IBulkEditService, ResourceTextEdit } from '../../../../editor/browser/services/bulkEditService.js';
import { Range } from '../../../../editor/common/core/range.js';
import { EditOperation, ISingleEditOperation } from '../../../../editor/common/core/editOperation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { dirname } from '../../../../base/common/resources.js';
import { Promises } from '../../../../base/common/async.js';
import { SaveSourceRegistry } from '../../../common/editor.js';
import { CellUri, IResolvedNotebookEditorModel } from '../../notebook/common/notebookCommon.js';
import { INotebookEditorModelResolverService } from '../../notebook/common/notebookEditorModelResolverService.js';
import { ISearchTreeFileMatch, isSearchTreeFileMatch, ISearchTreeMatch, FileMatchOrMatch, isSearchTreeMatch } from './searchTreeModel/searchTreeCommon.js';
import { isIMatchInNotebook } from './notebookSearch/notebookSearchModelBase.js';
import { IPatternInfo } from '../../../services/search/common/search.js';
import { ReplacePattern } from '../../../services/search/common/replace.js';

const REPLACE_PREVIEW = 'replacePreview';

class SearchReplaceEdit extends ResourceTextEdit {
	constructor(resource: URI, range: Range, text: string, readonly expectedText: string, readonly pattern: IPatternInfo | undefined, readonly replacement: ReplacePattern | null, readonly preserveCase: boolean) {
		super(resource, { range, text });
	}
}

const toReplaceResource = (fileResource: URI): URI => {
	return fileResource.with({ scheme: network.Schemas.internal, fragment: REPLACE_PREVIEW, query: JSON.stringify({ scheme: fileResource.scheme }) });
};

const toFileResource = (replaceResource: URI): URI => {
	return replaceResource.with({ scheme: JSON.parse(replaceResource.query).scheme, fragment: '', query: '' });
};

export class ReplacePreviewContentProvider implements ITextModelContentProvider, IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.replacePreviewContentProvider';

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITextModelService private readonly textModelResolverService: ITextModelService
	) {
		this.textModelResolverService.registerTextModelContentProvider(network.Schemas.internal, this);
	}

	provideTextContent(uri: URI): Promise<ITextModel> | null {
		if (uri.fragment === REPLACE_PREVIEW) {
			return this.instantiationService.createInstance(ReplacePreviewModel).resolve(uri);
		}
		return null;
	}
}

class ReplacePreviewModel extends Disposable {
	constructor(
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService,
		@ITextModelService private readonly textModelResolverService: ITextModelService,
		@IReplaceService private readonly replaceService: IReplaceService,
		@ISearchViewModelWorkbenchService private readonly searchWorkbenchService: ISearchViewModelWorkbenchService
	) {
		super();
	}

	async resolve(replacePreviewUri: URI): Promise<ITextModel> {
		const fileResource = toFileResource(replacePreviewUri);
		const fileMatch = <ISearchTreeFileMatch>this.searchWorkbenchService.searchModel.searchResult.matches(false).filter(match => match.resource.toString() === fileResource.toString())[0];
		const ref = this._register(await this.textModelResolverService.createModelReference(fileResource));
		const sourceModel = ref.object.textEditorModel;
		const sourceModelLanguageId = sourceModel.getLanguageId();
		const replacePreviewModel = this.modelService.createModel(createTextBufferFactoryFromSnapshot(sourceModel.createSnapshot()), this.languageService.createById(sourceModelLanguageId), replacePreviewUri);
		this._register(fileMatch.onChange(({ forceUpdateModel }) => this.update(sourceModel, replacePreviewModel, fileMatch, forceUpdateModel)));
		this._register(this.searchWorkbenchService.searchModel.onReplaceTermChanged(() => this.update(sourceModel, replacePreviewModel, fileMatch)));
		this._register(fileMatch.onDispose(() => replacePreviewModel.dispose())); // TODO@Sandeep we should not dispose a model directly but rather the reference (depends on https://github.com/microsoft/vscode/issues/17073)
		this._register(replacePreviewModel.onWillDispose(() => this.dispose()));
		this._register(sourceModel.onWillDispose(() => this.dispose()));
		return replacePreviewModel;
	}

	private update(sourceModel: ITextModel, replacePreviewModel: ITextModel, fileMatch: ISearchTreeFileMatch, override: boolean = false): void {
		if (!sourceModel.isDisposed() && !replacePreviewModel.isDisposed()) {
			this.replaceService.updateReplacePreview(fileMatch, override);
		}
	}
}

export class ReplaceService implements IReplaceService {

	declare readonly _serviceBrand: undefined;

	private static readonly REPLACE_SAVE_SOURCE = SaveSourceRegistry.registerSource('searchReplace.source', nls.localize('searchReplace.source', "Search and Replace"));

	constructor(
		@ITextFileService private readonly textFileService: ITextFileService,
		@IEditorService private readonly editorService: IEditorService,
		@ITextModelService private readonly textModelResolverService: ITextModelService,
		@IBulkEditService private readonly bulkEditorService: IBulkEditService,
		@ILabelService private readonly labelService: ILabelService,
		@INotebookEditorModelResolverService private readonly notebookEditorModelResolverService: INotebookEditorModelResolverService
	) { }

	replace(match: ISearchTreeMatch): Promise<any>;
	replace(files: ISearchTreeFileMatch[], progress?: IProgress<IProgressStep>): Promise<any>;
	replace(match: FileMatchOrMatch, progress?: IProgress<IProgressStep>, resource?: URI): Promise<any>;
	async replace(arg: any, progress: IProgress<IProgressStep> | undefined = undefined, resource: URI | null = null): Promise<any> {
		const edits = this.createEdits(arg, resource);
		const references = new DisposableStore();
		try {
			const models = new Map<string, ITextModel>();
			await Promise.all([...new Map(edits.map(edit => [edit.resource.toString(), edit.resource])).values()].map(async uri => {
				const ref = await this.textModelResolverService.createModelReference(uri);
				if (references.isDisposed) {
					ref.dispose();
					return;
				}
				references.add(ref);
				models.set(uri.toString(), ref.object.textEditorModel);
			}));
			const currentMatches = new Map<string, { matches: Map<string, FindMatch>; regex: RegExp | undefined }>();
			const currentTexts = new Map<string, string>();
			const validatedEdits = edits.map(edit => {
				const model = models.get(edit.resource.toString())!;
				let matchesPattern = true;
				let currentMatch: FindMatch | undefined;
				let searchRegExp: RegExp | undefined;
				if (edit.pattern) {
					const key = JSON.stringify([edit.resource.toString(), edit.pattern]);
					let search = currentMatches.get(key);
					if (!search) {
						const pattern = edit.pattern;
						const matches = new Map(model.findMatches(pattern.pattern, model.getFullModelRange(), !!pattern.isRegExp, !!pattern.isCaseSensitive, pattern.isWordMatch ? pattern.wordSeparators ?? USUAL_WORD_SEPARATORS : null, false, Number.MAX_SAFE_INTEGER).map(match => [match.range.toString(), match]));
						// Word boundaries were validated by the model using its configured
						// separators. Reuse its regex grammar without adding JavaScript \b.
						const regex = new SearchParams(pattern.pattern, !!pattern.isRegExp, !!pattern.isCaseSensitive, null).parseSearchRequest()?.regex;
						search = { matches, regex };
						currentMatches.set(key, search);
					}
					currentMatch = search.matches.get(Range.lift(edit.textEdit.range).toString());
					searchRegExp = search.regex;
					matchesPattern = currentMatch !== undefined;
				}
				if (model.getValueInRange(Range.lift(edit.textEdit.range)).replace(/\r\n/g, '\n') !== edit.expectedText.replace(/\r\n/g, '\n')
					|| !matchesPattern) {
					throw new Error(nls.localize('searchReplace.changed', "The search results for {0} are out of date. Run the search again before replacing.", edit.resource.toString()));
				}
				let textEdit = edit.textEdit;
				if (currentMatch && edit.replacement && searchRegExp) {
					const key = edit.resource.toString();
					const range = currentMatch.range;
					let text: string;
					let offset: number;
					if (searchRegExp.multiline) {
						text = currentTexts.get(key) ?? model.getValue(EndOfLinePreference.LF);
						currentTexts.set(key, text);
						offset = model.getValueLengthInRange(new Range(1, 1, range.startLineNumber, range.startColumn), EndOfLinePreference.LF);
					} else {
						// Non-multiline model searches run one line at a time, including
						// anchors and lookaround. Keep that context for replacement too.
						text = model.getLineContent(range.startLineNumber);
						offset = range.startColumn - 1;
					}
					const replacement = edit.replacement.getReplaceString(text, edit.preserveCase, offset, searchRegExp);
					if (replacement === null) {
						throw new Error(nls.localize('searchReplace.patternChanged', "The search results for {0} no longer match. Run the search again before replacing.", edit.resource.toString()));
					}
					textEdit = { ...edit.textEdit, text: replacement };
				}
				return new ResourceTextEdit(edit.resource, textEdit, model.getVersionId());
			});
			await this.bulkEditorService.apply(validatedEdits, { progress });

			const rawTextPromises = edits.map(async e => {
				if (e.resource.scheme === network.Schemas.vscodeNotebookCell) {
					const notebookResource = CellUri.parse(e.resource)?.notebook;
					if (notebookResource) {
						let ref: IReference<IResolvedNotebookEditorModel> | undefined;
						try {
							ref = await this.notebookEditorModelResolverService.resolve(notebookResource);
							await ref.object.save({ source: ReplaceService.REPLACE_SAVE_SOURCE });
						} finally {
							ref?.dispose();
						}
					}
					return;
				} else {
					return this.textFileService.files.get(e.resource)?.save({ source: ReplaceService.REPLACE_SAVE_SOURCE });
				}
			});

			return await Promises.settled(rawTextPromises);
		} finally {
			references.dispose();
		}
	}

	async openReplacePreview(element: FileMatchOrMatch, preserveFocus?: boolean, sideBySide?: boolean, pinned?: boolean): Promise<any> {
		const fileMatch = isSearchTreeMatch(element) ? element.parent() : element;

		const editor = await this.editorService.openEditor({
			original: { resource: fileMatch.resource },
			modified: { resource: toReplaceResource(fileMatch.resource) },
			label: nls.localize('fileReplaceChanges', "{0} ↔ {1} (Replace Preview)", fileMatch.name(), fileMatch.name()),
			description: this.labelService.getUriLabel(dirname(fileMatch.resource), { relative: true }),
			options: {
				preserveFocus,
				pinned,
				revealIfVisible: true
			}
		});
		const input = editor?.input;
		const disposable = fileMatch.onDispose(() => {
			input?.dispose();
			disposable.dispose();
		});
		await this.updateReplacePreview(fileMatch);
		if (editor) {
			const editorControl = editor.getControl();
			if (isSearchTreeMatch(element) && editorControl) {
				editorControl.revealLineInCenter(element.range().startLineNumber, ScrollType.Immediate);
			}
		}
	}

	async updateReplacePreview(fileMatch: ISearchTreeFileMatch, override: boolean = false): Promise<void> {
		const replacePreviewUri = toReplaceResource(fileMatch.resource);
		const [sourceModelRef, replaceModelRef] = await Promise.all([this.textModelResolverService.createModelReference(fileMatch.resource), this.textModelResolverService.createModelReference(replacePreviewUri)]);
		const sourceModel = sourceModelRef.object.textEditorModel;
		const replaceModel = replaceModelRef.object.textEditorModel;
		// If model is disposed do not update
		try {
			if (sourceModel && replaceModel) {
				if (override) {
					replaceModel.setValue(sourceModel.getValue());
				} else {
					replaceModel.undo();
				}
				this.applyEditsToPreview(fileMatch, replaceModel);
			}
		} finally {
			sourceModelRef.dispose();
			replaceModelRef.dispose();
		}
	}

	private applyEditsToPreview(fileMatch: ISearchTreeFileMatch, replaceModel: ITextModel): void {
		const resourceEdits = this.createEdits(fileMatch, replaceModel.uri);
		const modelEdits: ISingleEditOperation[] = [];
		for (const resourceEdit of resourceEdits) {
			modelEdits.push(EditOperation.replaceMove(
				Range.lift(resourceEdit.textEdit.range),
				resourceEdit.textEdit.text)
			);
		}
		replaceModel.pushEditOperations([], modelEdits.sort((a, b) => Range.compareRangesUsingStarts(a.range, b.range)), () => []);
	}

	private createEdits(arg: FileMatchOrMatch | ISearchTreeFileMatch[], resource: URI | null = null): SearchReplaceEdit[] {
		const edits: SearchReplaceEdit[] = [];

		if (isSearchTreeMatch(arg)) {
			if (!arg.isReadonly) {
				if (isIMatchInNotebook(arg)) {
					// only apply edits if it's not a webview match, since webview matches are read-only
					const match = arg;
					edits.push(this.createEdit(match, match.replaceString, match.cell?.uri));
				} else {
					const match = <ISearchTreeMatch>arg;
					edits.push(this.createEdit(match, match.replaceString, resource));
				}
			}
		}

		if (isSearchTreeFileMatch(arg)) {
			arg = [arg];
		}

		if (arg instanceof Array) {
			arg.forEach(element => {
				const fileMatch = <ISearchTreeFileMatch>element;
				if (fileMatch.count() > 0) {
					edits.push(...fileMatch.matches().flatMap(
						match => this.createEdits(match, resource)
					));
				}
			});
		}
		return edits;
	}

	private createEdit(match: ISearchTreeMatch, text: string, resource: URI | null = null): SearchReplaceEdit {
		const fileMatch: ISearchTreeFileMatch = match.parent();
		const searchModel = fileMatch.parent().searchModel;
		const queryPattern = searchModel.searchResult.query?.contentPattern;
		const pattern = queryPattern ? { ...queryPattern } : undefined;
		const replacement = searchModel.replacePattern;
		return new SearchReplaceEdit(
			resource ?? fileMatch.resource,
			match.range(), text, match.fullMatchText(), pattern, replacement, searchModel.preserveCase
		);
	}
}
