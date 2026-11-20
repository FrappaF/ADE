/** The caller supplies the simulated authorization decision for this checkout. */
export function authorizePayment(amountCents, approved) {
	return { status: approved ? 'authorized' : 'declined', amountCents };
}
