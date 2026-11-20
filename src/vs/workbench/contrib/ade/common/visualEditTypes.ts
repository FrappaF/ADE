/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type InteractionEdit } from './modelInteractions.js';
import { type Knowledge, type ModelBlueprint, type ModelType, type ModelDecision, type ModelFoundation, type ModelAssertion, type ElementDetails, type RelationDetails, type ElementKind, type ModelBehavior, type ModelView, type RelationKind, type SemanticModel } from './modelTypes.js';
import { type ModelIdFactory } from './modelMigration.js';
import { type DiagramDensity } from './diagramLayout.js';

export type VisualEdit =
	| { kind: 'taskIntent'; entry: import('./semanticModel.js').ModelTaskIntent; expectedRevision?: string }
	| { kind: 'stateDefinition'; id: string; name: string; ownerId: string }
	| { kind: 'messagingOccurrence'; id: string; bindingId: string; topologyId: string }
	| { kind: 'messaging'; entry: import('./semanticModel.js').ModelMessaging; expectedRevision?: string }
	| { kind: 'viewMessaging'; viewId: string; messagingId: string }
	| { kind: 'stateMachine'; entry: import('./semanticModel.js').ModelStateMachine; expectedRevision?: string }
	| { kind: 'viewStateMachine'; viewId: string; stateMachineId: string }
	| { kind: 'interaction'; entry: InteractionEdit }
	| { kind: 'viewInteraction'; viewId: string; interactionId: string }
	| { kind: 'predicate'; entry: import('./semanticModel.js').ModelPredicate }
	| { kind: 'blueprint'; section: keyof ModelBlueprint; entry: ModelBlueprint[keyof ModelBlueprint][number] }
	| { kind: 'type'; entry: ModelType }
	| { kind: 'decision'; entry: ModelDecision; expectedRevision?: string }
	| { kind: 'c4View'; view: ModelView }
	| { kind: 'elementScope'; id: string; scope?: 'governed' | 'external'; runtimeKind?: import('./semanticModel.js').SemanticElement['runtimeKind'] }
	| { kind: 'integration'; entry: ModelFoundation['integrations'][number] }
	| { kind: 'ownership'; entry: ModelFoundation['ownership'][number] }
	| { kind: 'membership'; entry: ModelFoundation['memberships'][number]; included: boolean }
	| { kind: 'platformBinding'; entry: ModelFoundation['platform']['bindings'][number] }
	| { kind: 'assertion'; entry: ModelAssertion }
	| { kind: 'feature'; id: string; name: string }
	| { kind: 'resource'; id: string; name: string; parentId?: string }
	| { kind: 'diagram'; id: string; name: string; featureId?: string; viewKind: Exclude<ModelView['kind'], 'state'> }
	| { kind: 'stateDiagram'; id: string; name: string; featureId?: string; resourceId: string }
	| { kind: 'stateLifecycle'; viewId: string; resourceId: string }
	| { kind: 'stateTransition'; viewId: string; id: string }
	| { kind: 'element'; id: string; name: string; elementKind: ElementKind; viewId: string; parentId?: string }
	| { kind: 'includeRelation'; id: string; viewId: string }
	| { kind: 'include'; id: string; viewId: string }
	| { kind: 'exclude'; id: string; viewId: string; target: 'element' | 'relation' }
	| { kind: 'sequenceMessage'; id: string; viewId: string }
	| { kind: 'sequenceOrder'; id: string; viewId: string; target: 'participant' | 'message'; direction: -1 | 1 }
	| { kind: 'sequenceRemove'; id: string; viewId: string; target: 'participant' | 'message' }
	| { kind: 'scenarioOccurrence'; id: string; viewId: string; from: string; to: string; name: string; operandId?: string | null }
	| { kind: 'scenarioDetails'; viewId: string; trigger: string; scope: string }
	| { kind: 'scenarioFrame'; id: string; viewId: string; operator: 'alt' | 'opt' | 'par' | 'loop'; operands: { id: string; condition: Knowledge; steps: string[] }[] }
	| { kind: 'scenarioRemoveFrame'; id: string; viewId: string }
	| { kind: 'scenarioOrderEdge'; viewId: string; before: string; after: string; remove?: true }
	| { kind: 'relation'; id: string; viewId: string; from: string; to: string; relationKind: RelationKind; name: string; condition?: string }
	| { kind: 'rename'; id: string; name: string; target: 'element' | 'diagram' }
	| { kind: 'renameRelation'; id: string; name: string }
	| { kind: 'description'; id: string; description: string }
	| { kind: 'behavior'; id: string; behavior: ModelBehavior }
	| { kind: 'parent'; id: string; parentId?: string }
	| { kind: 'elementDetails'; id: string; details: ElementDetails }
	| { kind: 'relationDetails'; id: string; details: RelationDetails }
	| { kind: 'condition'; id: string; condition: string }
	| { kind: 'relationError'; id: string; errorCode?: string }
	| { kind: 'updateRelation'; id: string; from: string; to: string; relationKind: RelationKind; name: string; condition?: string; errorCode?: string }
	| { kind: 'position'; viewId: string; id: string; x: number; y: number }
	| { kind: 'layout'; viewId: string; density?: DiagramDensity }
	| { kind: 'deleteElement'; id: string }
	| { kind: 'deleteDiagram'; id: string }
	| { kind: 'deleteRelation'; id: string };

export type VisualEditOf<K extends VisualEdit['kind']> = Extract<VisualEdit, { kind: K }>;

/** One candidate and ID factory are shared by a complete atomic edit. */
export interface VisualEditContext {
	model: SemanticModel;
	candidate: SemanticModel;
	nextId: ModelIdFactory;
	view(id: string): ModelView;
}
