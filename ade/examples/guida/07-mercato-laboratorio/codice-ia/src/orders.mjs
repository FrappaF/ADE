export function createOrderStore() {
	const records = new Map();
	return {
		saveOrder(order) { records.set(order.id, order); },
		getOrder(orderId) { return records.get(orderId); }
	};
}
