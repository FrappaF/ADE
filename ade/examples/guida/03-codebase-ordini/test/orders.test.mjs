// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License.

import test from 'node:test';
import assert from 'node:assert/strict';
import { validateQuantity, calculateTotal, checkout } from '../src/orders.mjs';

test('quantità positiva', () => assert.equal(validateQuantity(2), true));
test('zero e negativi rifiutati', () => { assert.equal(validateQuantity(0), false); assert.equal(validateQuantity(-1), false); });
test('testo e decimali non sono interi', () => { assert.throws(() => validateQuantity('2'), TypeError); assert.throws(() => validateQuantity(1.5), TypeError); });
test('totale espresso in centesimi', () => assert.equal(calculateTotal(1250, 2), 2500));
test('prezzo e overflow invalidi', () => { assert.throws(() => calculateTotal(-1, 2), TypeError); assert.throws(() => calculateTotal(Number.MAX_SAFE_INTEGER, 2), RangeError); });
test('ordine confermato', () => assert.deepEqual(checkout({ unitPriceCents: 1250, quantity: 2, approved: true }), { status: 'confirmed', totalCents: 2500 }));
test('pagamento rifiutato', () => assert.deepEqual(checkout({ unitPriceCents: 1250, quantity: 2, approved: false }), { status: 'declined', totalCents: 2500 }));
