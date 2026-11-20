import assert from 'node:assert/strict';
import test from 'node:test';
import { checkout, calculateTotal } from '../src/checkout.mjs';
import { createOrderStore } from '../src/orders.mjs';
import { requestReturn } from '../src/returns.mjs';

const purchase = { orderId: 'ordine-1', unitPriceCents: 1250, quantity: 2, approved: true };

test('Acquisto conferma e salva lo stesso ordine, in centesimi', () => {
	const orders = createOrderStore();
	assert.deepEqual({ checkout: checkout(purchase, orders), saved: orders.getOrder(purchase.orderId) }, {
		checkout: { status: 'confirmed', orderId: purchase.orderId, totalCents: 2500 },
		saved: { id: purchase.orderId, totalCents: 2500 }
	});
});

test('Acquisto rifiutato lascia vuoto l’archivio', () => {
	const orders = createOrderStore();
	assert.deepEqual({ checkout: checkout({ ...purchase, approved: false }, orders), saved: orders.getOrder(purchase.orderId) }, {
		checkout: { status: 'declined', totalCents: 2500 },
		saved: undefined
	});
});

test('Acquisto applica i limiti della quantità', () => {
	assert.equal(calculateTotal(1250, 10), 12500);
	assert.throws(() => calculateTotal(1250, 11), RangeError);
});

test('Resi legge l’ordine creato da Acquisto e accetta il trentesimo giorno', () => {
	const orders = createOrderStore();
	checkout(purchase, orders);
	assert.deepEqual(requestReturn({ orderId: purchase.orderId, daysSincePurchase: 30 }, orders), { status: 'accepted', orderId: purchase.orderId, refundCents: 2500 });
});

test('Resi distingue un ordine assente e il superamento della finestra', () => {
	const orders = createOrderStore();
	const input = { orderId: purchase.orderId, daysSincePurchase: 31 };
	const missing = requestReturn(input, orders);
	checkout(purchase, orders);
	assert.deepEqual([missing, requestReturn(input, orders)], [{ status: 'unknown-order' }, { status: 'outside-window' }]);
});
