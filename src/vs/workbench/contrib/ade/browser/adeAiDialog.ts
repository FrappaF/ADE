import { type CancellationToken } from '../../../../base/common/cancellation.js';
import { type URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { type IChatWidget } from '../../chat/browser/chat.js';
import { type CodeAiProgress } from '../common/codeBridge.js';
import { type DiagramExplorationBudget } from '../common/diagramExplorationBudget.js';
import { type AdeDiagramBudgetFormOptions } from './adeDiagramBudgetForm.js';

export interface AdeAiMessage { role: 'user' | 'assistant'; text: string }
export interface AdeAiDialogOptions {
	onClose(): Promise<void>;
	resource?: URI;
	prompt?: string;
	send?(messages: AdeAiMessage[], token: CancellationToken): Promise<string>;
}

export const IAdeAiDialogService = createDecorator<IAdeAiDialogService>('adeAiDialogService');
export interface IAdeAiDialogService {
	readonly _serviceBrand: undefined;
	open(options: AdeAiDialogOptions): Promise<IChatWidget | undefined>;
	close(): Promise<void>;
	editDiagramBudget(options: AdeDiagramBudgetFormOptions): Promise<DiagramExplorationBudget | undefined>;
	updateProgress(message: string): void;
	updateConversation(event: CodeAiProgress): void;
}

