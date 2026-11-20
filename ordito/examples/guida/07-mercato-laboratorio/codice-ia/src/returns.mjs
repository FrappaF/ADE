export function requestReturn({ orderId, daysSincePurchase }, orders) {
	if (!Number.isSafeInteger(daysSincePurchase) || daysSincePurchase < 0) {
		throw new RangeError('Il tempo trascorso deve essere un intero non negativo');
	}
	const order = orders.getOrder(orderId);
	if (!order) {
		return { status: 'unknown-order' };
	}
	if (daysSincePurchase > 30) {
		return { status: 'outside-window' };
	}
	return { status: 'accepted', orderId: order.id, refundCents: order.totalCents };
}
