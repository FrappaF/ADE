import { type CancellationToken } from '../../../../base/common/cancellation.js';
import { type URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { type IChatWidget } from '../../chat/browser/chat.js';
import { type CodeAiProgress } from '../common/codeBridge.js';
import { type DiagramExplorationBudget } from '../common/diagramExplorationBudget.js';
import { type OrditoDiagramBudgetFormOptions } from './orditoDiagramBudgetForm.js';

export interface OrditoAiMessage { role: 'user' | 'assistant'; text: string }
export interface OrditoAiDialogOptions {
	onClose(): Promise<void>;
	resource?: URI;
	prompt?: string;
	send?(messages: OrditoAiMessage[], token: CancellationToken): Promise<string>;
}

export const IOrditoAiDialogService = createDecorator<IOrditoAiDialogService>('orditoAiDialogService');
export interface IOrditoAiDialogService {
	readonly _serviceBrand: undefined;
	open(options: OrditoAiDialogOptions): Promise<IChatWidget | undefined>;
	close(): Promise<void>;
	editDiagramBudget(options: OrditoDiagramBudgetFormOptions): Promise<DiagramExplorationBudget | undefined>;
	updateProgress(message: string): void;
	updateConversation(event: CodeAiProgress): void;
}

