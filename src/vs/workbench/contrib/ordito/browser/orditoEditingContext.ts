import { IDialogService, IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { SemanticElement } from '../common/modelTypes.js';
import { VisualEdit } from '../common/visualEditing.js';
import { OrditoProjectService } from './orditoProjectService.js';

/** Dialog handlers share one document revision and one atomic edit boundary. */
export interface OrditoEditingContext {
	readonly container: HTMLElement;
	readonly project: OrditoProjectService;
	readonly quickInput: IQuickInputService;
	readonly dialogs: IDialogService;
	readonly files: IFileDialogService;
	projectChanged: boolean;
	edit(edit: VisualEdit | VisualEdit[]): void;
	name(value?: string, title?: string): Promise<string | undefined>;
	feature(id?: string): Promise<SemanticElement | undefined>;
	deleteElement(element: SemanticElement): Promise<void>;
}
