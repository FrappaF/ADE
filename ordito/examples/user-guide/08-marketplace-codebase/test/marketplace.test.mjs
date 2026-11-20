import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { checkout } from '../src/checkout.mjs';
import { createOrderStore } from '../src/orders.mjs';
import { createOutbox } from '../src/outbox.mjs';
import { returnOrder } from '../src/returns.mjs';
import { createMarketplaceServer } from '../src/server.mjs';

const purchase = { orderId: 'order-1', quantity: 2, unitPriceCents: 1250, approved: true };
const started = Date.UTC(2026, 0, 10);
const days = amount => amount * 24 * 60 * 60 * 1000;

function createServices() {
	let time = started;
	return { orders: createOrderStore(), outbox: createOutbox(), now: () => time, setTime(value) { time = value; } };
}

test('checkout confirms an order in cents and records one event', () => {
	const services = createServices();
	const order = { id: 'order-1', quantity: 2, unitPriceCents: 1250, totalCents: 2500, status: 'confirmed', confirmedAt: started };
	assert.deepEqual({ result: checkout(purchase, services), order: services.orders.find('order-1'), events: services.outbox.list() }, {
		result: { status: 'confirmed', order }, order,
		events: [{ sequence: 1, type: 'order.confirmed', orderId: 'order-1', amountCents: 2500, occurredAt: started }]
	});
});

test('quantity 10 is valid while zero, 11 and fractional quantities leave no order', () => {
	const services = createServices();
	const rejected = [0, 11, 1.5].map(quantity => checkout({ ...purchase, quantity }, services).status);
	const boundary = checkout({ ...purchase, quantity: 10 }, services);
	assert.deepEqual([rejected, boundary.status, boundary.order.totalCents, services.outbox.list().length], [['invalid-input', 'invalid-input', 'invalid-input'], 'confirmed', 12500, 1]);
});

test('invalid IDs, non-integer cents and an overflowing total are rejected', () => {
	const services = createServices();
	const invalid = [{ orderId: 'not/valid' }, { unitPriceCents: -1 }, { unitPriceCents: 99.5 }, { unitPriceCents: Number.MAX_SAFE_INTEGER }, { approved: 'true' }];
	assert.deepEqual(invalid.map(data => checkout({ ...purchase, ...data }, services)), invalid.map(() => ({ status: 'invalid-input' })));
	assert.deepEqual(services.outbox.list(), []);
});

test('declined payment creates no order and a duplicate ID does not replace a confirmed order', () => {
	const services = createServices();
	assert.deepEqual([checkout({ ...purchase, approved: false }, services), services.orders.find(purchase.orderId), services.outbox.list()], [{ status: 'declined' }, undefined, []]);
	const first = checkout(purchase, services);
	const second = checkout({ ...purchase, quantity: 3 }, services);
	assert.deepEqual([second.status, services.orders.find(purchase.orderId), services.outbox.list().length], ['duplicate-order', first.order, 1]);
});

test('the thirtieth day is inclusive and a repeat return emits no additional event', () => {
	const services = createServices();
	const confirmed = checkout(purchase, services).order;
	const returnedAt = started + days(30);
	services.setTime(returnedAt);
	const result = returnOrder(purchase.orderId, services);
	assert.deepEqual(result, { status: 'returned', order: { ...confirmed, status: 'returned', returnedAt }, refundCents: 2500 });
	assert.deepEqual([returnOrder(purchase.orderId, services), services.orders.find(purchase.orderId), services.outbox.list()[1], services.outbox.list().length], [
		{ status: 'already-returned' }, result.order,
		{ sequence: 2, type: 'order.returned', orderId: 'order-1', amountCents: 2500, occurredAt: returnedAt }, 2
	]);
});

test('expired and unknown orders remain unchanged', () => {
	const services = createServices();
	const confirmed = checkout(purchase, services).order;
	services.setTime(started + days(30) + 1);
	assert.deepEqual([returnOrder(purchase.orderId, services), returnOrder('missing', services), services.orders.find(purchase.orderId), services.outbox.list().length], [
		{ status: 'outside-window' }, { status: 'unknown-order' }, confirmed, 1
	]);
});

async function listen(t) {
	const server = createMarketplaceServer({ now: () => started });
	const listening = once(server, 'listening');
	server.listen(0, '127.0.0.1');
	t.after(() => new Promise(resolve => server.close(resolve)));
	await listening;
	return async (path, options) => {
		const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, options);
		return [response.status, await response.json()];
	};
}

test('HTTP connects checkout, retrieval, return and outbox through one order ID', { timeout: 5000 }, async t => {
	const request = await listen(t);
	const [created, purchaseResult] = await request('/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(purchase) });
	const [found, current] = await request('/orders/order-1');
	const [returned, returnResult] = await request('/orders/order-1/return', { method: 'POST' });
	const [eventsStatus, outbox] = await request('/events');
	assert.deepEqual([created, found, returned, eventsStatus, purchaseResult.order, current.order, returnResult.order.id, returnResult.refundCents, outbox.events.map(event => event.type)], [
		201, 200, 200, 200, current.order, purchaseResult.order, 'order-1', 2500, ['order.confirmed', 'order.returned']
	]);
});

test('HTTP distinguishes bad JSON, large requests, declined payment and missing orders', { timeout: 5000 }, async t => {
	const request = await listen(t);
	assert.deepEqual(await request('/checkout', { method: 'POST', body: '{' }), [400, { status: 'invalid-input' }]);
	assert.deepEqual(await request('/checkout', { method: 'POST', body: ' '.repeat(16385) }), [413, { status: 'request-too-large' }]);
	assert.deepEqual(await request('/checkout', { method: 'POST', body: JSON.stringify({ ...purchase, approved: false }) }), [402, { status: 'declined' }]);
	assert.deepEqual(await request('/orders/missing/return', { method: 'POST' }), [404, { status: 'unknown-order' }]);
	assert.deepEqual(await request('/events'), [200, { events: [] }]);
});
