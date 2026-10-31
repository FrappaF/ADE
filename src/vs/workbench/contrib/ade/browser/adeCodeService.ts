/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { CodeContext } from '../common/codeBridge.js';

export const IAdeCodeService = createDecorator<IAdeCodeService>('adeCodeService');
export interface IAdeCodeService {
	readonly _serviceBrand: undefined;
	readonly available: boolean;
	readonly busy: boolean;
	readonly changed: boolean;
	readonly context: CodeContext | undefined;
	readonly onDidChange: Event<void>;
	importCodebase(): Promise<void>;
	sync(): Promise<void>;
	inspect(elementId?: string): Promise<void>;
	recover(): Promise<void>;
	attachIndex(): Promise<void>;
	configure(): Promise<void>;
	executeCollaboration(request: string, token?: CancellationToken): Promise<string>;
}
class UnavailableCodeService implements IAdeCodeService {
	declare readonly _serviceBrand: undefined;
	readonly available = false; readonly busy = false; readonly changed = false; readonly context = undefined;
	readonly onDidChange = Event.None;
	async importCodebase(): Promise<void> { }
	async sync(): Promise<void> { }
	async inspect(): Promise<void> { }
	async recover(): Promise<void> { }
	async attachIndex(): Promise<void> { }
	async configure(): Promise<void> { }
	async executeCollaboration(): Promise<string> { throw new Error('Code collaboration is unavailable'); }
}
registerSingleton(IAdeCodeService, UnavailableCodeService, InstantiationType.Delayed);
