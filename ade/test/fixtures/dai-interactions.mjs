import '../../scripts/source-loader.mjs';
const { createPureProject } = await import('../../../src/vs/workbench/contrib/ade/common/modelProject.ts');
let serial = 0;
const model = createPureProject('Checkout Frames', () => 'checkout.' + ++serial).model;
const owner = model.foundation.blueprint.operations[0].ownerId;
model.foundation.predicates = [];
model.semantics.elements.find(element => element.id === owner).name = 'Checkout';
const container = model.foundation.ownership.find(entry => entry.elementId === owner).ownerId;
for (const [id, name] of [['payments', 'Payments'], ['orders', 'Orders'], ['notifications', 'Notifications']]) { model.semantics.elements.push({ id: 'component.' + id, name, kind: 'component', description: name + ' contract' }); model.foundation.ownership.push({ id: 'ownership.' + id, ownerId: container, elementId: 'component.' + id, role: 'architecture' }); }
const operationOwner = id => ({ charge: 'component.payments', persist: 'component.orders', notify: 'component.notifications' }[id] ?? owner);
const field = (id, typeId) => ({ id, name: id.split('.').at(-1), type: '', typeId, required: true, nullable: { state: 'known', value: false } });
const operation = (id, inputs = [], outputs = [], effects = []) => ({ id, name: id, ownerId: operationOwner(id), inputs, outputs, errors: [], effects, permissions: [], preconditions: [], postconditions: [], acceptanceCriteria: [{ id: 'criterion.' + id, given: 'Authored inputs and reply data', when: 'The interaction runs', then: 'The authored outcome and ordered calls hold' }] });
model.foundation.types.push(
	{ id: 'Money', name: 'Money', kind: 'primitive', primitive: 'integer', fields: [] },
	{ id: 'Text', name: 'Text', kind: 'primitive', primitive: 'string', fields: [] },
	{ id: 'Flag', name: 'Flag', kind: 'primitive', primitive: 'boolean', fields: [] },
	{ id: 'Quantity', name: 'Quantity', kind: 'primitive', primitive: 'integer', fields: [] },
	{ id: 'Quantities', name: 'Quantities', kind: 'collection', itemTypeId: 'Quantity', fields: [] },
	{ id: 'Status', name: 'Payment Status', kind: 'enum', values: ['approved', 'declined', 'pending', 'unknown'], fields: [] }
);
model.foundation.blueprint.operations = [
	operation('checkout', [field('input.total', 'Money'), field('input.correlation', 'Text'), field('input.notify', 'Flag')]),
	operation('charge', [field('charge.amount', 'Money')], [field('payment.status', 'Status')]),
	operation('persistContract', [field('persist.total', 'Money'), field('persist.correlation', 'Text')]),
	operation('persist', [field('persist.amount', 'Money')], [], ['orders']),
	operation('handleOther', [field('other.status', 'Status')]),
	operation('notify', [])
];
export const literal = (typeId, value) => ({ version: 1, nodes: [{ id: 'literal', kind: 'literal', typeId, value }], rootId: 'literal' });
export const reference = (fieldId, path = []) => ({ version: 1, nodes: [{ id: 'reference', kind: 'reference', fieldId, path }], rootId: 'reference' });
export const compare = (a, b, operator = 'eq') => ({ version: 1, nodes: [...a.nodes.map(n => ({ ...n, id: 'a.' + n.id })), ...b.nodes.map(n => ({ ...n, id: 'b.' + n.id })), { id: 'comparison', kind: 'compare', left: 'a.' + a.rootId, right: 'b.' + b.rootId, operator }], rootId: 'comparison' });
export const argument = (fieldId, expression) => ({ fieldId, expression });
export const message = (id, operationId, args = [], correlation = reference('input.correlation')) => ({ id, operationId, from: owner, to: operationOwner(operationId), execution: { mode: 'sync', arguments: args, resultId: 'result.' + id, response: 'required', failure: 'propagate', timeoutMs: 50, correlation } });
model.foundation.occurrences = [
	message('message.charge', 'charge', [argument('charge.amount', reference('input.total'))]),
	message('message.persist', 'persist', [argument('persist.amount', reference('persist.total'))], reference('persist.correlation')),
	message('message.other', 'handleOther', [argument('other.status', reference('result.message.charge', ['payment.status']))]),
	message('message.notify', 'notify')
];
model.foundation.frames = [
	{ id: 'frame.outcome', kind: 'alt', occurrenceIds: ['message.other'], selection: 'exclusive', operands: [
		{ id: 'branch.approved', guard: compare(reference('result.message.charge', ['payment.status']), literal('Status', 'approved')), steps: ['frame.persist'] },
		{ id: 'branch.else', guard: null, steps: ['message.other'] }
	] },
	{ id: 'frame.persist', kind: 'ref', occurrenceIds: [], interactionId: 'interaction.persist', revision: '1', arguments: [argument('persist.total', reference('input.total')), argument('persist.correlation', reference('input.correlation'))], resultId: 'result.persist' },
	{ id: 'frame.notify', kind: 'opt', occurrenceIds: ['message.notify'], guard: reference('input.notify'), steps: ['message.notify'] }
];
model.foundation.interactions = [
	{ id: 'interaction.checkout', ownerId: owner, occurrenceIds: ['message.charge', 'message.other', 'message.notify'], frameIds: ['frame.outcome', 'frame.persist', 'frame.notify'], execution: { version: 1, revision: '1', operationId: 'checkout', steps: ['message.charge', 'frame.outcome', 'frame.notify'], outputs: [] } },
	{ id: 'interaction.persist', ownerId: owner, occurrenceIds: ['message.persist'], frameIds: [], execution: { version: 1, revision: '1', operationId: 'persistContract', steps: ['message.persist'], outputs: [] } }
];
export const checkoutInteractions = model;
const input = { 'input.total': 100, 'input.correlation': 'order-1', 'input.notify': false };
const replies = status => ({ 'message.charge': [{ delayMs: 0, outputs: { 'payment.status': status } }], 'message.persist': [{ delayMs: 0, outputs: {} }], 'message.other': [{ delayMs: 0, outputs: {} }], 'message.notify': [{ delayMs: 0, outputs: {} }] });
// Independent business oracles: never evaluated from the AST or emitted implementation.
export const interactionCriteria = { version: 1, revision: 'authored-before-runtime-v1', cases: [], interactions: [
	...['approved', 'declined', 'pending', 'unknown'].map(status => ({ id: 'checkout.' + status, interactionId: 'interaction.checkout', criterionId: 'criterion.checkout', input, replies: replies(status), expected: { outcome: 'completed', calls: ['message.charge', status === 'approved' ? 'message.persist' : 'message.other'], outputs: {} } })),
	{ id: 'checkout.opt', interactionId: 'interaction.checkout', criterionId: 'criterion.checkout', input: { ...input, 'input.notify': true }, replies: replies('approved'), expected: { outcome: 'completed', calls: ['message.charge', 'message.persist', 'message.notify'], outputs: {} } },
	{ id: 'checkout.timeout', interactionId: 'interaction.checkout', criterionId: 'criterion.checkout', input, replies: { ...replies('approved'), 'message.charge': [{ delayMs: 100, outputs: { 'payment.status': 'approved' } }] }, expected: { outcome: 'failed', calls: ['message.charge'], outputs: {}, error: 'timeout' } },
	{ id: 'persist.direct', interactionId: 'interaction.persist', criterionId: 'criterion.persistContract', input: { 'persist.total': 100, 'persist.correlation': 'order-1' }, replies: replies('approved'), expected: { outcome: 'completed', calls: ['message.persist'], outputs: {} } }
] };
