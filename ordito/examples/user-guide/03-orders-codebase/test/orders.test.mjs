import test from 'node:test';
import assert from 'node:assert/strict';
import { validateQuantity, calculateTotal, checkout } from '../src/orders.mjs';

test('accepts positive quantities', () => assert.equal(validateQuantity(2), true));
test('rejects zero and negative quantities', () => { assert.equal(validateQuantity(0), false); assert.equal(validateQuantity(-1), false); });
test('rejects text and fractional quantities', () => { assert.throws(() => validateQuantity('2'), TypeError); assert.throws(() => validateQuantity(1.5), TypeError); });
test('calculates the total in cents', () => assert.equal(calculateTotal(1250, 2), 2500));
test('rejects negative prices and totals outside the safe integer range', () => { assert.throws(() => calculateTotal(-1, 2), TypeError); assert.throws(() => calculateTotal(Number.MAX_SAFE_INTEGER, 2), RangeError); });
test('confirms the order when payment is approved', () => assert.deepEqual(checkout({ unitPriceCents: 1250, quantity: 2, approved: true }), { status: 'confirmed', totalCents: 2500 }));
test('declines the order when payment is rejected', () => assert.deepEqual(checkout({ unitPriceCents: 1250, quantity: 2, approved: false }), { status: 'declined', totalCents: 2500 }));
