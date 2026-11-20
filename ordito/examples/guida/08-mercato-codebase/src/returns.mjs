import { isOrderId, orderStatuses } from './orders.mjs';

export const returnWindowMs = 30 * 24 * 60 * 60 * 1000;

/** RESI. Look up the order created by checkout, then record an eligible return. */
export function returnOrder(orderId, { orders, outbox, now }) {
	if (!isOrderId(orderId)) { return { status: 'invalid-input' }; }
	const order = orders.find(orderId);
	if (!order) { return { status: 'unknown-order' }; }
	if (order.status === orderStatuses.returned) { return { status: 'already-returned' }; }

	const returnedAt = now();
	const elapsed = returnedAt - order.confirmedAt;
	if (elapsed < 0 || elapsed > returnWindowMs) { return { status: 'outside-window' }; }

	const returned = orders.markReturned(order, returnedAt);
	outbox.publish({ type: 'order.returned', orderId, amountCents: returned.totalCents, occurredAt: returnedAt });
	return { status: returned.status, order: returned, refundCents: returned.totalCents };
}
