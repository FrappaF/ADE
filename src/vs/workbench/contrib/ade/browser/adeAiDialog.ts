/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type CancellationToken } from '../../../../base/common/cancellation.js';
import { type URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { type IChatWidget } from '../../chat/browser/chat.js';

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
	updateProgress(message: string): void;
}

