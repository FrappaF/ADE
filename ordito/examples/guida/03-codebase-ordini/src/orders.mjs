export function validateQuantity(quantity) {
  if (!Number.isSafeInteger(quantity)) throw new TypeError('La quantità deve essere un intero sicuro');
  return quantity > 0;
}

export function calculateTotal(unitPriceCents, quantity) {
  if (!Number.isSafeInteger(unitPriceCents) || unitPriceCents < 0) throw new TypeError('Prezzo non valido');
  if (!validateQuantity(quantity)) throw new RangeError('Quantità non positiva');
  const total = unitPriceCents * quantity;
  if (!Number.isSafeInteger(total)) throw new RangeError('Totale fuori limite');
  return total;
}

export function checkout({ unitPriceCents, quantity, approved }) {
  const totalCents = calculateTotal(unitPriceCents, quantity);
  return { status: approved === true ? 'confirmed' : 'declined', totalCents };
}
