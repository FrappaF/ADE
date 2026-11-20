import { isOrderId } from './orders.mjs';
import { authorizePayment } from './payments.mjs';

export const maxQuantity = 10;

/** Checkout verifies the request, simulates payment and records a confirmed order. */
export function checkout(input, { orders, outbox, now }) {
	const { orderId, quantity, unitPriceCents, approved } = input ?? {};
	if (!isOrderId(orderId) || !Number.isInteger(quantity) || quantity < 1 || quantity > maxQuantity ||
		!Number.isSafeInteger(unitPriceCents) || unitPriceCents < 0 || typeof approved !== 'boolean') {
		return { status: 'invalid-input' };
	}
	const totalCents = quantity * unitPriceCents;
	if (!Number.isSafeInteger(totalCents)) { return { status: 'invalid-input' }; }
	if (orders.find(orderId)) { return { status: 'duplicate-order' }; }

	const payment = authorizePayment(totalCents, approved);
	if (payment.status === 'declined') { return { status: 'declined' }; }

	const confirmedAt = now();
	const order = orders.confirm({ id: orderId, quantity, unitPriceCents, totalCents: payment.amountCents, confirmedAt });
	outbox.publish({ type: 'order.confirmed', orderId, amountCents: order.totalCents, occurredAt: confirmedAt });
	return { status: order.status, order };
}
