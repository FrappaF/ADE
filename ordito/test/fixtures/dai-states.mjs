import '../../scripts/source-loader.mjs';
const { createPureProject } = await import('../../../src/vs/workbench/contrib/ordito/common/modelProject.ts');
const { literal, reference, argument, compare } = await import('./dai-interactions.mjs');
let serial = 0;
const model = createPureProject('Checkout States', () => 'lifecycle.' + ++serial).model, owner = model.foundation.blueprint.operations[0].ownerId;
model.foundation.predicates = [];
model.semantics.elements.find(element => element.id === owner).kind = 'class'; model.semantics.elements.find(element => element.id === owner).name = 'Checkout';
model.foundation.types.push({ id: 'Money', name: 'Money', kind: 'primitive', primitive: 'integer', fields: [] }, { id: 'Text', name: 'Text', kind: 'primitive', primitive: 'string', fields: [] });
const field = (id, typeId) => ({ id, name: id, type: '', typeId, required: true, nullable: { state: 'known', value: false } });
const operation = (id, inputs = []) => ({ id, name: id, ownerId: owner, inputs, outputs: [], errors: [], effects: [], permissions: [], preconditions: [], postconditions: [], acceptanceCriteria: [{ id: 'criterion.' + id, given: 'Authored lifecycle data', when: 'The declared event runs', then: 'The independently authored state and action order hold' }] });
model.foundation.blueprint.operations = [operation('initialize', [field('order.id', 'Text')]), operation('pay', [field('pay.amount', 'Money')]), operation('cancel'), operation('check'), operation('refresh')];
const actions = [];
for (const id of ['draftEntry', 'draftExit', 'paidEntry', 'charge', 'audit', 'watch']) {
	const contractId = 'action.' + id, interactionId = 'interaction.' + id, operationId = 'service.' + id, messageId = 'message.' + id;
	const inputs = id === 'charge' ? [field('charge.amount', 'Money')] : [];
	model.foundation.blueprint.operations.push(operation(contractId, inputs), { ...operation(operationId, inputs.map(f => ({ ...f, id: 'service.' + f.id }))), errors: [{ id: 'error.' + id, code: 'denied', description: 'Authored action failure', typeId: 'Text' }] });
	model.foundation.occurrences.push({ id: messageId, from: owner, to: owner, operationId, execution: { mode: 'async', arguments: inputs.map(f => argument('service.' + f.id, reference(f.id))), resultId: 'result.' + id, response: 'required', failure: 'propagate', timeoutMs: 1000, correlation: literal('Text', 'checkout') } });
	model.foundation.interactions.push({ id: interactionId, ownerId: owner, occurrenceIds: [messageId], frameIds: [], execution: { version: 1, revision: '1', operationId: contractId, steps: [messageId], outputs: [] } });
	actions.push({ id, interactionId, revision: '1', arguments: id === 'charge' ? [argument('charge.amount', reference('pay.amount'))] : [] });
}
for (const id of ['Draft', 'Paid', 'Cancelled']) { model.semantics.elements.push({ id, name: id, kind: 'state', parentId: owner }); model.foundation.ownership.push({ id: 'lifecycle.' + id, elementId: id, ownerId: owner, role: 'lifecycle' }); }
model.foundation.stateMachines = [{ id: 'checkout.lifecycle', version: 1, revision: '1', ownerId: owner, operationId: 'initialize', profile: 'flat', initialIds: ['Draft'], finalIds: ['Cancelled'], persistence: 'snapshot-v1', states: [{ elementId: 'Draft', entry: ['draftEntry'], exit: ['draftExit'], doActionId: 'watch' }, { elementId: 'Paid', entry: ['paidEntry'], exit: [] }, { elementId: 'Cancelled', entry: [], exit: [] }], events: ['pay', 'cancel', 'check', 'refresh'].map(id => ({ id: 'event.' + id, operationId: id })), actions, transitions: [
	{ id: 'transition.pay', from: 'Draft', to: 'Paid', eventId: 'event.pay', kind: 'external', priority: 0, guard: compare(reference('pay.amount'), literal('Money', 0), 'gt'), effects: ['charge'] },
	{ id: 'transition.cancelDraft', from: 'Draft', to: 'Cancelled', eventId: 'event.cancel', kind: 'external', priority: 0, guard: null, effects: [] },
	{ id: 'transition.cancelPaid', from: 'Paid', to: 'Cancelled', eventId: 'event.cancel', kind: 'external', priority: 0, guard: null, effects: [] },
	{ id: 'transition.check', from: 'Draft', to: 'Draft', eventId: 'event.check', kind: 'internal', priority: 0, guard: null, effects: ['audit'] },
	{ id: 'transition.refresh', from: 'Draft', to: 'Draft', eventId: 'event.refresh', kind: 'external', priority: 0, guard: null, effects: [] }
] }];
model.views = [{ id: 'view.lifecycle', name: 'Checkout Lifecycle', kind: 'state', stateMachineId: 'checkout.lifecycle', nodes: ['Draft', 'Paid', 'Cancelled'].map((elementId, i) => ({ elementId, x: i * 240, y: 100 })), relationIds: [] }];
export const checkoutStates = model;
export const replies = (watchDelay = 100) => Object.fromEntries(actions.map(action => [action.id, { ['message.' + action.id]: [{ delayMs: action.id === 'watch' ? watchDelay : 0, outputs: {} }] }]));
const event = (id, eventId, input = {}) => ({ id, eventId: 'event.' + eventId, input });
export const scenario = (events, boot = replies()) => ({ instanceId: 'order-42', input: { 'order.id': '42' }, replies: boot, events: events.map(entry => ({ event: entry, replies: replies() })) });
const paid = scenario([event('payment-1', 'pay', { 'pay.amount': 10 })]);
const paidPhases = ['entry:draftEntry', 'doStart:watch', 'guard:transition.pay', 'doCancelled:watch', 'exit:draftExit', 'effect:charge', 'entry:paidEntry', 'commit:transition.pay'];
const paidCalls = ['message.draftEntry', 'message.watch', 'message.draftExit', 'message.charge', 'message.paidEntry'];
export const stateCriteria = { version: 1, revision: '1', cases: [], interactions: actions.map(action => ({ id: 'criterion.' + action.id, interactionId: action.interactionId, criterionId: 'criterion.action.' + action.id, input: action.id === 'charge' ? { 'charge.amount': 10 } : {}, replies: { ['message.' + action.id]: [{ delayMs: 0, outputs: {} }] }, expected: { outcome: 'completed', calls: ['message.' + action.id], outputs: {} } })), states: [
	{ id: 'checkout.paid', machineId: 'checkout.lifecycle', criterionId: 'criterion.initialize', scenario: paid, expected: { stateId: 'Paid', error: null, doStatus: 'none', statuses: ['accepted'], errors: [null], transitions: ['transition.pay'], calls: paidCalls, phases: paidPhases } },
	{ id: 'checkout.dedup-reopen', machineId: 'checkout.lifecycle', criterionId: 'criterion.initialize', scenario: { ...paid, events: [{ ...paid.events[0], reopen: true }, { ...paid.events[0] }, { event: event('payment-1', 'pay', { 'pay.amount': 20 }), replies: {} }] }, expected: { stateId: 'Paid', error: null, doStatus: 'none', statuses: ['accepted', 'duplicate', 'rejected'], errors: [null, null, 'deliveryConflict'], transitions: ['transition.pay', null, null], calls: paidCalls, phases: paidPhases } },
	{ id: 'checkout.failed-charge', machineId: 'checkout.lifecycle', criterionId: 'criterion.initialize', scenario: { ...paid, events: [{ ...paid.events[0], replies: { ...replies(), charge: { 'message.charge': [{ delayMs: 0, error: { code: 'denied', details: 'Declined' } }] } }, reopen: true }, { event: event('cancel-1', 'cancel'), replies: replies() }] }, expected: { stateId: 'Draft', error: 'denied', doStatus: 'cancelled', statuses: ['failed', 'failed'], errors: ['denied', 'denied'], transitions: ['transition.pay', null], calls: ['message.draftEntry', 'message.watch', 'message.draftExit', 'message.charge'], phases: ['entry:draftEntry', 'doStart:watch', 'guard:transition.pay', 'doCancelled:watch', 'exit:draftExit', 'effect:charge'] } },
	{ id: 'checkout.final', machineId: 'checkout.lifecycle', criterionId: 'criterion.initialize', scenario: scenario([event('cancel-1', 'cancel'), event('cancel-2', 'cancel')]), expected: { stateId: 'Cancelled', error: null, doStatus: 'none', statuses: ['accepted', 'rejected'], errors: [null, 'unexpectedEvent'], transitions: ['transition.cancelDraft', null], calls: ['message.draftEntry', 'message.watch', 'message.draftExit'], phases: ['entry:draftEntry', 'doStart:watch', 'guard:transition.cancelDraft', 'doCancelled:watch', 'exit:draftExit', 'commit:transition.cancelDraft'] } }
] };
