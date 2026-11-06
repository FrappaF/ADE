/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { CodePreview, CodeResolution, CodeDiagramProgress } from '../common/codeBridge.js';

export const IAdeAiService = createDecorator<IAdeAiService>('adeAiService');
export interface IAdeAiService {
	readonly _serviceBrand: undefined;
	readonly available: boolean;
	readonly busy: boolean;
	readonly status: string;
	readonly connectionStatus: string;
	readonly canVerify: boolean;
	readonly canApply: boolean;
	readonly canUndo: boolean;
	readonly onDidChange: Event<void>;
	readonly generatingDiagrams: boolean;
	readonly workflowStatus: string | undefined;
	readonly chatLocation: 'chat' | 'terminal' | undefined;
	returnToDiagrams(): Promise<void>;
	readonly diagramProgress: CodeDiagramProgress | undefined;
	chat(): Promise<void>;
	chooseDiagramModel(): Promise<void>;
	buildDiagrams(): Promise<void>;
	resumeDiagrams(): Promise<void>;
	connect(): Promise<void>;
	refreshConnection(): Promise<void>;
	openCli(): Promise<void>;
	implement(): Promise<void>;
	interpret(): Promise<void>;
	review(): Promise<void>;
	verify(): Promise<void>;
	apply(): Promise<void>;
	undo(): Promise<void>;
	resume(): Promise<void>;
	recover(): Promise<void>;
	benchmark(): Promise<void>;
	benchmarkReconciliation(): Promise<void>;
	exportBenchmark(): Promise<void>;
	reconcile(preview: CodePreview, resolutions?: CodeResolution[], direction?: 'model' | 'code'): Promise<CodePreview | undefined>;
}
class UnavailableAiService implements IAdeAiService {
	declare readonly _serviceBrand: undefined;
	readonly available = false; readonly busy = false; readonly status = '';
	readonly connectionStatus = '';
	readonly canVerify = false; readonly canApply = false; readonly canUndo = false;
	readonly onDidChange = Event.None;
	readonly generatingDiagrams = false;
	readonly workflowStatus = undefined;
	readonly chatLocation = undefined;
	async returnToDiagrams(): Promise<void> { }
	readonly diagramProgress = undefined;
	async chat(): Promise<void> { }
	async chooseDiagramModel(): Promise<void> { }
	async buildDiagrams(): Promise<void> { }
	async resumeDiagrams(): Promise<void> { }
	async connect(): Promise<void> { }
	async refreshConnection(): Promise<void> { }
	async openCli(): Promise<void> { }
	async implement(): Promise<void> { }
	async interpret(): Promise<void> { }
	async review(): Promise<void> { }
	async verify(): Promise<void> { }
	async apply(): Promise<void> { }
	async undo(): Promise<void> { }
	async resume(): Promise<void> { }
	async recover(): Promise<void> { }
	async benchmark(): Promise<void> { }
	async benchmarkReconciliation(): Promise<void> { }
	async exportBenchmark(): Promise<void> { }
	async reconcile(): Promise<CodePreview | undefined> { return undefined; }
}
registerSingleton(IAdeAiService, UnavailableAiService, InstantiationType.Delayed);
