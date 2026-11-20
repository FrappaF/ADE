import { defaultDiagramCheckpointTimeoutMinutes, diagramCheckpointReasoningEfforts, maxDiagramCheckpointTimeoutMinutes, type DiagramCheckpointReasoningEffort } from './codeBridge.js';

export const diagramCheckpointTimeoutSetting = 'ade.diagramImport.checkpointTimeoutMinutes';
export const diagramCheckpointReasoningEffortSetting = 'ade.diagramImport.reasoningEffort';
export const diagramExplorationBudgetSetting = 'ade.diagramImport.explorationBudget';
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
