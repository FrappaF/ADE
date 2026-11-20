export function validateQuantity(quantity) {
	if (!Number.isSafeInteger(quantity)) {
		throw new TypeError('La quantità deve essere un intero sicuro');
	}
	return quantity >= 1 && quantity <= 10;
}

export function calculateTotal(unitPriceCents, quantity) {
	if (!Number.isSafeInteger(unitPriceCents) || unitPriceCents < 0) {
		throw new TypeError('Prezzo non valido');
	}
	if (!validateQuantity(quantity)) {
		throw new RangeError('La quantità ammessa è da 1 a 10');
	}
	const totalCents = unitPriceCents * quantity;
	if (!Number.isSafeInteger(totalCents)) {
		throw new RangeError('Totale fuori limite');
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
