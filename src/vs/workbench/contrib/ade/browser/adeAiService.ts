/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { type StructuralProjectSession } from '../common/modelProject.js';
import { CodePreview, CodeResolution, CodeDiagramProgress, CodeDiagramExploration } from '../common/codeBridge.js';

export const IAdeAiService = createDecorator<IAdeAiService>('adeAiService');

/** A detached, human-readable review; the exploration service remains the publication authority. */
export interface AdeDiagramReview {
	id: string; sessionId: string; root: string; modelUri: string; semanticRevision: string;
	proposal: CodeDiagramExploration['proposals'][number];
	changes: { collection: string; id: string; before: { name?: string } | null; after: { name?: string } | null }[];
	sources: { file: string; revision: string; start: number; end: number }[];
	images: { path: string; viewId: string }[];
	contents: string; problem?: string; projectReviewId?: string; plan?: CodeDiagramExploration['plan']; tasks?: CodeDiagramExploration['tasks'];
}

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
	readonly chatLocation: 'modal' | undefined;
	returnToDiagrams(): Promise<void>;
	readonly diagramProgress: CodeDiagramProgress | undefined;
	readonly diagramExploration: CodeDiagramExploration | undefined;
	readonly diagramReview: AdeDiagramReview | undefined;
	reviewDiagramProposal(id?: string): Promise<void>;
	applyDiagramReview(): Promise<void>;
	closeDiagramReview(): void;
	inspectDiagramReview(): Promise<void>;
	configureDiagramBudget(): Promise<void>;
	chat(): Promise<void>;
	chooseDiagramModel(): Promise<void>;
	buildDiagrams(): Promise<void>;
	resumeDiagrams(): Promise<void>;
	updateDiagrams(): Promise<void>;
	updateCodebase(): Promise<void>;
	connect(): Promise<void>;
	refreshConnection(): Promise<void>;
	openCli(): Promise<void>;
	implement(): Promise<void>;
	readonly structuralProblem: string | undefined;
	readonly structuralReview: StructuralProjectSession | undefined;
	readonly continuityStatus: string;
	configureContinuity(): Promise<void>;
	structuralTechnicalReview(): Promise<void>;
	structuralReverse(): Promise<void>;
	structuralResume(): Promise<void>;
	structuralRecover(): Promise<void>;
	simulateStates(): Promise<void>;
	editPureCriteria(): Promise<void>;
	movePureSource(): Promise<void>;
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
	readonly diagramExploration = undefined;
	readonly diagramReview = undefined;
	async reviewDiagramProposal(): Promise<void> { }
	async applyDiagramReview(): Promise<void> { }
	closeDiagramReview(): void { }
	async inspectDiagramReview(): Promise<void> { }
	async configureDiagramBudget(): Promise<void> { }
	async chat(): Promise<void> { }
	async chooseDiagramModel(): Promise<void> { }
	async buildDiagrams(): Promise<void> { }
	async resumeDiagrams(): Promise<void> { }
	async updateDiagrams(): Promise<void> { }
	async updateCodebase(): Promise<void> { }
	async connect(): Promise<void> { }
	async refreshConnection(): Promise<void> { }
	async openCli(): Promise<void> { }
	async implement(): Promise<void> { }
	readonly structuralProblem = undefined;
	readonly structuralReview = undefined;
	readonly continuityStatus = '';
	async configureContinuity(): Promise<void> { }
	async structuralTechnicalReview(): Promise<void> { }
	async structuralReverse(): Promise<void> { }
	async structuralResume(): Promise<void> { }
	async structuralRecover(): Promise<void> { }
	async simulateStates(): Promise<void> { }
	async editPureCriteria(): Promise<void> { }
	async movePureSource(): Promise<void> { }
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
