/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface DiagramCheckpoint {
	phase: 'discovery' | 'planning' | 'diagrams';
	nextFeatureId?: string;
	nextTaskId?: string;
	toolCalls: number;
	readBytes: number;
}

export const diagramCheckpointSchema = {
	type: 'object', additionalProperties: false, required: ['phase', 'toolCalls', 'readBytes'], properties: {
		phase: { enum: ['discovery', 'planning', 'diagrams'] }, nextFeatureId: { type: 'string', minLength: 1, maxLength: 120 }, nextTaskId: { type: 'string', minLength: 1, maxLength: 120 },
		toolCalls: { type: 'integer', minimum: 0, maximum: 1000 }, readBytes: { type: 'integer', minimum: 0 }
	}
};

/** Each provider invocation works on one catalog, plan or diagram checkpoint. */
export function sameDiagramCheckpoint(current: { phase?: string; nextFeatureId?: string; nextTaskId?: string }, checkpoint: DiagramCheckpoint): boolean {
	return current.phase === checkpoint.phase && current.nextFeatureId === checkpoint.nextFeatureId && current.nextTaskId === checkpoint.nextTaskId;
}

const readTools = new Set(['ade_project_inspect', 'ade_source_search', 'ade_source_read', 'ade_code_references', 'ade_model_query']);

/** Tighten the ordinary MCP tool surface for a single bounded provider invocation. */
export function checkpointToolAllowed(checkpoint: DiagramCheckpoint, name: string): boolean {
	return readTools.has(name) || (checkpoint.phase === 'discovery' ? name === 'ade_feature_catalog'
		: checkpoint.phase === 'planning' ? name === 'ade_diagram_plan'
			: ['ade_model_propose', 'ade_view_preview', 'ade_task_update', 'ade_proposal_discard'].includes(name));
}

export const diagramCheckpointInstruction = `Complete only the single checkpoint supplied for this invocation. In discovery save the catalog. In planning save the specified group's diagram plan. In diagrams finish only the specified next task, including its preview and ready checkpoint. If inspection reports a valid saved draft for the task, reuse its proposalId and proceed to preview and mark the task ready. If task.previewedProposalId already matches, proceed directly to marking the task ready. Use ade_model_query with collection evidence and an ID to locate saved evidence before re-reading sources. Inspection reports reusableObjects for the staged architecture model: a zero count means there are no existing objects in that collection to look up. When the service reports checkpoint complete or changed, end the turn. If the work needs an unavailable user decision, respond with one question starting exactly with CLARIFICATION:. Otherwise report the checkpoint's outcome briefly. ADE schedules further checkpoints.`;
