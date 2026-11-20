/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';

/** One command catalog supplies registration and exhaustive UI dispatch. */
export const adeEditingCommands = [
	['taskIntent', localize2('ade.task.editCommand', "A.D.E: Tasks and Clarifications")],
	['selectStructuralProfile', localize2('ade.task.profileCommand', "A.D.E: Choose Runtime and Review Stack Plan")],
	['createPureFeature', localize2('ade.pure.create.command', "A.D.E: Add Pure Quantity Feature")],
	['messaging', localize2('ade.messaging.command', "A.D.E: Edit Messaging Topology")],
	['simulateMessaging', localize2('ade.messaging.simCommand', "A.D.E: Simulate Messaging")],
	['stateMachine', localize2('ade.states.command', "A.D.E: Edit Executable State Machine")],
	['interaction', localize2('ade.interaction.command', "A.D.E: Edit Executable Interaction")],
	['editScenario', localize2('ade.scenario.editCommand', "A.D.E: Edit Diagram Scenario")],
	['predicate', localize2('ade.predicate.command', "A.D.E: Edit Pure Predicate")],
	['prepareStructuralContext', localize2('ade.task.command', "A.D.E: Preview Structural AI Context")],
	['blueprint', localize2('ade.blueprint.command', "A.D.E: Edit Structural Blueprint")],
	['projectDecisions', localize2('ade.projectDecisions.command', "A.D.E: Project Architecture Decisions")],
	['createProject', localize2('ade.createProject', "A.D.E: Create Project")],
	['openProject', localize2('ade.openProject', "A.D.E: Open Project")],
	['addFeature', localize2('ade.addFeature', "A.D.E: Add Feature")],
	['parent', localize2('ade.parent', "A.D.E: Change Boundary or Parent")],
	['notation', localize2('ade.notation', "A.D.E: Edit Attributes and Technology")],
	['relationNotation', localize2('ade.relationNotation', "A.D.E: Edit Cardinalities and Protocol")],
	['addDiagram', localize2('ade.addDiagram', "A.D.E: Add Diagram")],
	['addElement', localize2('ade.addElement', "A.D.E: Add Element")],
	['addExistingRelation', localize2('ade.addExistingRelation.command', "A.D.E: Add Existing Relationship")],
	['addExisting', localize2('ade.addExisting', "A.D.E: Add Existing Element")],
	['addExistingState', localize2('ade.state.addExisting.command', "A.D.E: Add Existing State")],
	['includeLifecycle', localize2('ade.state.includeLifecycle.command', "A.D.E: Include Resource Lifecycle")],
	['addTransition', localize2('ade.state.addTransition.command', "A.D.E: Add Existing Transition")],
	['renameRelation', localize2('ade.state.event.command', "A.D.E: Edit Transition Event")],
	['addSequenceMessage', localize2('ade.sequence.addMessage.command', "A.D.E: Add Existing Message")],
	['connect', localize2('ade.connect', "A.D.E: Connect Selection")],
	['editRelation', localize2('ade.editRelation.command', "A.D.E: Edit Relationship")],
	['removeElementFromDiagram', localize2('ade.removeElement.command', "A.D.E: Remove Element from Diagram")],
	['removeRelationFromDiagram', localize2('ade.removeRelation.command', "A.D.E: Remove Relationship from Diagram")],
	['renameFeature', localize2('ade.renameFeature', "A.D.E: Rename Feature")],
	['deleteFeature', localize2('ade.deleteFeature', "A.D.E: Delete Feature")],
	['renameDiagram', localize2('ade.renameDiagram', "A.D.E: Rename Diagram")],
	['deleteDiagram', localize2('ade.deleteDiagram.command', "A.D.E: Delete Diagram")],
	['renameElement', localize2('ade.renameElement', "A.D.E: Rename Element")],
	['description', localize2('ade.description.command', "A.D.E: Edit Description")],
	['behavior', localize2('ade.behavior.command', "A.D.E: Edit Behavioral Contract")],
	['deleteElement', localize2('ade.deleteElement.command', "A.D.E: Delete Element")],
	['condition', localize2('ade.condition', "A.D.E: Edit Condition")],
	['relationError', localize2('ade.relationError.command', "A.D.E: Edit Relationship Error")],
	['deleteRelation', localize2('ade.deleteRelation.command', "A.D.E: Delete Relationship")],
	['layout', localize2('ade.layout', "A.D.E: Arrange Diagram")],
	['reload', localize2('ade.reload.command', "A.D.E: Reload Project")],
	['saveCopy', localize2('ade.saveCopy', "A.D.E: Save Project Copy")]
] as const;

export type AdeEditingCommand = typeof adeEditingCommands[number][0];
