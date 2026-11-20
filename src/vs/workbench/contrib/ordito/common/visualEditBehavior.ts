import { setModelMessaging } from './modelMessaging.js';
import { setModelStateMachine } from './modelStates.js';
import { setModelInteraction } from './modelInteractions.js';
import { type SemanticModel } from './modelTypes.js';
import { isSequenceMessage } from './sequenceDiagram.js';
import { getStateDiagram, isResourceTransition } from './stateDiagram.js';
import { type VisualEditContext, type VisualEditOf } from './visualEditTypes.js';
import { includeElement, excludeFromView } from './visualEditSupport.js';
import { applyScenarioEdit, editScenarioSequence } from './visualEditScenario.js';
import { getEditableScenario } from './visualNavigation.js';

/** Behavior edits share the caller's transaction and validation boundary. */
export function applyBehaviorVisualEdit(context: VisualEditContext, edit: VisualEditOf<'stateDefinition' | 'messagingOccurrence' | 'messaging' | 'viewMessaging' | 'stateMachine' | 'viewStateMachine' | 'interaction' | 'viewInteraction' | 'stateDiagram' | 'stateLifecycle' | 'stateTransition' | 'sequenceMessage' | 'sequenceOrder' | 'sequenceRemove' | 'scenarioOccurrence' | 'scenarioDetails' | 'scenarioFrame' | 'scenarioRemoveFrame' | 'scenarioOrderEdge'>): SemanticModel | undefined {
	const { candidate, nextId, view } = context;
	switch (edit.kind) {
		case 'stateDefinition': { if ((candidate.version !== 4 && candidate.version !== 5)) { throw new Error('States require v4'); } candidate.semantics.elements.push({ id: edit.id, name: edit.name, kind: 'state', parentId: edit.ownerId }); candidate.foundation.ownership.push({ id: nextId(), elementId: edit.id, ownerId: edit.ownerId, role: 'lifecycle' }); break; }
		case 'messagingOccurrence': { if ((candidate.version !== 4 && candidate.version !== 5)) { throw new Error('Messaging requires v4'); } const topology = candidate.foundation.messaging?.find(topology => topology.id === edit.topologyId), occurrence = candidate.foundation.occurrences.find(entry => entry.id === edit.id), publisher = topology?.publishers.find(binding => binding.id === edit.bindingId), subscriber = topology?.subscriptions.find(binding => binding.id === edit.bindingId), binding = publisher ?? subscriber, broker = topology?.brokers.find(broker => broker.id === topology.channels.find(channel => channel.id === binding?.channelId)?.brokerId); if (!occurrence || !binding || !broker || occurrence.execution) { throw new Error('Messaging occurrence binding unavailable'); } occurrence.messagingBindingId = binding.id; occurrence.operationId = binding.operationId; occurrence.from = publisher ? binding.ownerId : broker.elementId; occurrence.to = publisher ? broker.elementId : binding.ownerId; break; }
		case 'messaging': { if ((candidate.version !== 4 && candidate.version !== 5)) { throw new Error('Messaging requires v4'); } return setModelMessaging(candidate, edit.entry, edit.expectedRevision); }
		case 'viewMessaging': { if ((candidate.version !== 4 && candidate.version !== 5)) { throw new Error('Messaging requires v4'); } view(edit.viewId).messagingId = edit.messagingId; break; }
		case 'stateMachine': { if ((candidate.version !== 4 && candidate.version !== 5)) { throw new Error('States require v4'); } return setModelStateMachine(candidate, edit.entry, edit.expectedRevision); }
		case 'viewStateMachine': { if ((candidate.version !== 4 && candidate.version !== 5)) { throw new Error('States require v4'); } view(edit.viewId).stateMachineId = edit.stateMachineId; break; }
		case 'interaction': { if ((candidate.version !== 4 && candidate.version !== 5)) { throw new Error('Interactions require v4'); } return setModelInteraction(candidate, edit.entry); }
		case 'viewInteraction': { if ((candidate.version !== 4 && candidate.version !== 5)) { throw new Error('Interactions require v4'); } view(edit.viewId).interactionId = edit.interactionId; break; }
		case 'stateDiagram': {
			if (!candidate.semantics.elements.some(element => element.id === edit.resourceId && element.kind === 'resource')) { throw new Error(`Unknown resource: ${edit.resourceId}`); }
			candidate.views.push({ id: edit.id, name: edit.name, kind: 'state', featureId: edit.featureId, nodes: [{ elementId: edit.resourceId, x: 0, y: 0 }], relationIds: [] });
			if (!edit.featureId) { delete candidate.views.at(-1)!.featureId; }
			break;
		}
		case 'stateLifecycle': {
			const diagram = view(edit.viewId);
			if (!getStateDiagram(candidate, diagram).groups.some(group => group.resource.id === edit.resourceId)) { throw new Error(`Resource is outside this state diagram: ${edit.resourceId}`); }
			for (const element of candidate.semantics.elements.filter(element => element.kind === 'state' && element.parentId === edit.resourceId)) { includeElement(diagram, element.id); }
			for (const relation of candidate.semantics.relations) {
				if (isResourceTransition(candidate, relation) && candidate.semantics.elements.find(element => element.id === relation.from)!.parentId === edit.resourceId && !diagram.relationIds.includes(relation.id)) { diagram.relationIds.push(relation.id); }
			}
			break;
		}
		case 'stateTransition': {
			const diagram = view(edit.viewId);
			const relation = candidate.semantics.relations.find(relation => relation.id === edit.id);
			if (!relation || !isResourceTransition(candidate, relation)) { throw new Error(`Unsupported resource transition: ${edit.id}`); }
			const resourceId = candidate.semantics.elements.find(element => element.id === relation.from)!.parentId;
			if (!getStateDiagram(candidate, diagram).groups.some(group => group.resource.id === resourceId)) { throw new Error(`Resource is outside this state diagram: ${resourceId}`); }
			for (const id of [relation.from, relation.to]) { includeElement(diagram, id); }
			if (!diagram.relationIds.includes(relation.id)) { diagram.relationIds.push(relation.id); }
			break;
		}
		case 'sequenceMessage': {
			const diagram = view(edit.viewId);
			const relation = candidate.semantics.relations.find(relation => relation.id === edit.id);
			if (relation && isSequenceMessage(relation) && getEditableScenario(candidate, diagram)) {
				applyScenarioEdit(candidate, diagram, { kind: 'scenarioOccurrence', id: nextId(), viewId: edit.viewId, from: relation.from, to: relation.to, name: relation.name });
				break;
			}
			if (diagram.kind !== 'sequence' || !relation || !isSequenceMessage(relation)) { throw new Error(`Unsupported sequence message: ${edit.id}`); }
			for (const elementId of [relation.from, relation.to]) { includeElement(diagram, elementId); }
			if (!diagram.relationIds.includes(relation.id)) { diagram.relationIds.push(relation.id); }
			break;
		}
		case 'sequenceOrder': {
			const diagram = view(edit.viewId);
			if (editScenarioSequence(candidate, diagram, edit)) { break; }
			if (diagram.kind !== 'sequence') { throw new Error(`Not a sequence diagram: ${diagram.id}`); }
			const entries = edit.target === 'participant' ? diagram.nodes.map(node => node.elementId) : diagram.relationIds.filter(id => isSequenceMessage(candidate.semantics.relations.find(relation => relation.id === id)!));
			const index = entries.indexOf(edit.id);
			if (index < 0) { throw new Error(`Unknown sequence entry: ${edit.id}`); }
			const next = index + edit.direction;
			if (edit.target === 'participant') {
				if (next >= 0 && next < diagram.nodes.length) { [diagram.nodes[index], diagram.nodes[next]] = [diagram.nodes[next], diagram.nodes[index]]; }
			} else if (next >= 0 && next < entries.length) {
				const from = diagram.relationIds.indexOf(edit.id);
				const to = diagram.relationIds.indexOf(entries[next]);
				[diagram.relationIds[from], diagram.relationIds[to]] = [diagram.relationIds[to], diagram.relationIds[from]];
			}
			break;
		}
		case 'sequenceRemove': {
			const diagram = view(edit.viewId);
			if (editScenarioSequence(candidate, diagram, edit)) { break; }
			if (diagram.kind !== 'sequence') { throw new Error(`Not a sequence diagram: ${diagram.id}`); }
			excludeFromView(candidate, diagram, edit.id, edit.target === 'participant' ? 'element' : 'relation');
			break;
		}
		case 'scenarioOccurrence':
		case 'scenarioDetails':
		case 'scenarioFrame':
		case 'scenarioRemoveFrame':
		case 'scenarioOrderEdge':
			applyScenarioEdit(candidate, view(edit.viewId), edit);
			break;
	}
	return undefined;
}
