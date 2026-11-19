/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { defaultDiagramCheckpointTimeoutMinutes, maxDiagramCheckpointTimeoutMinutes } from './codeBridge.js';

export const diagramCheckpointTimeoutSetting = 'ade.diagramImport.checkpointTimeoutMinutes';
export const diagramExplorationBudgetSetting = 'ade.diagramImport.explorationBudget';

export function isDiagramCheckpointTimeoutMinutes(value: unknown): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= maxDiagramCheckpointTimeoutMinutes;
}

export function getDiagramCheckpointTimeoutMinutes(value: unknown): number {
	return isDiagramCheckpointTimeoutMinutes(value) ? value : defaultDiagramCheckpointTimeoutMinutes;
}
