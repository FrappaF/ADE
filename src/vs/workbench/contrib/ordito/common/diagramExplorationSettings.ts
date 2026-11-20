import { defaultDiagramCheckpointTimeoutMinutes, diagramCheckpointReasoningEfforts, maxDiagramCheckpointTimeoutMinutes, type DiagramCheckpointReasoningEffort } from './codeBridge.js';

export const diagramCheckpointTimeoutSetting = 'ordito.diagramImport.checkpointTimeoutMinutes';
export const diagramCheckpointReasoningEffortSetting = 'ordito.diagramImport.reasoningEffort';
export const diagramExplorationBudgetSetting = 'ordito.diagramImport.explorationBudget';
export const defaultDiagramCheckpointReasoningEffort: DiagramCheckpointReasoningEffort = 'medium';

export function isDiagramCheckpointTimeoutMinutes(value: unknown): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= maxDiagramCheckpointTimeoutMinutes;
}

export function getDiagramCheckpointTimeoutMinutes(value: unknown): number {
	return isDiagramCheckpointTimeoutMinutes(value) ? value : defaultDiagramCheckpointTimeoutMinutes;
}

export function getDiagramCheckpointReasoningEffort(value: unknown): DiagramCheckpointReasoningEffort {
	return diagramCheckpointReasoningEfforts.find(effort => effort === value) ?? defaultDiagramCheckpointReasoningEffort;
}
