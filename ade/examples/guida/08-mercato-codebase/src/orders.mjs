export const orderStatuses = Object.freeze({ confirmed: 'confirmed', returned: 'returned' });

export function isOrderId(value) {
	return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value);
}

/** Both operations use one store and the same Ordine record. Times use epoch milliseconds. */
export function createOrderStore() {
	const orders = new Map();
	return {
		find(id) { return orders.get(id); },
		confirm({ id, quantity, unitPriceCents, totalCents, confirmedAt }) {
			const order = Object.freeze({ id, quantity, unitPriceCents, totalCents, status: orderStatuses.confirmed, confirmedAt });
			orders.set(id, order);
			return order;
		},
		markReturned(order, returnedAt) {
			const returned = Object.freeze({ ...order, status: orderStatuses.returned, returnedAt });
			orders.set(order.id, returned);
			return returned;
		}
	};
}
