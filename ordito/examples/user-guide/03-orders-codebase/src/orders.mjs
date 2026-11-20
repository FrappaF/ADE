export function validateQuantity(quantity) {
  if (!Number.isSafeInteger(quantity)) throw new TypeError('Quantity must be a safe integer');
  return quantity > 0;
}

export function calculateTotal(unitPriceCents, quantity) {
  if (!Number.isSafeInteger(unitPriceCents) || unitPriceCents < 0) throw new TypeError('Invalid price');
  if (!validateQuantity(quantity)) throw new RangeError('Quantity must be positive');
  const total = unitPriceCents * quantity;
  if (!Number.isSafeInteger(total)) throw new RangeError('Total exceeds safe integer range');
  return total;
}

export function checkout({ unitPriceCents, quantity, approved }) {
  const totalCents = calculateTotal(unitPriceCents, quantity);
  return { status: approved === true ? 'confirmed' : 'declined', totalCents };
}
