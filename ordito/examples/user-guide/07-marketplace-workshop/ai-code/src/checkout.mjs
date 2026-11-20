export function validateQuantity(quantity) {
	if (!Number.isSafeInteger(quantity)) {
		throw new TypeError('Quantity must be a safe integer');
	}
	return quantity >= 1 && quantity <= 10;
}

export function calculateTotal(unitPriceCents, quantity) {
	if (!Number.isSafeInteger(unitPriceCents) || unitPriceCents < 0) {
		throw new TypeError('Invalid price');
	}
	if (!validateQuantity(quantity)) {
		throw new RangeError('Quantity must be from 1 to 10');
	}
	const totalCents = unitPriceCents * quantity;
	if (!Number.isSafeInteger(totalCents)) {
		throw new RangeError('Total exceeds the safe integer range');
	}
	return totalCents;
}

export function checkout({ orderId, unitPriceCents, quantity, approved }, orders) {
	const totalCents = calculateTotal(unitPriceCents, quantity);
	if (approved !== true) {
		return { status: 'declined', totalCents };
	}
	orders.saveOrder({ id: orderId, totalCents });
	return { status: 'confirmed', orderId, totalCents };
}
