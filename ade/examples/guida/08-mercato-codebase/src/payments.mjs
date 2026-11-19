/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** The caller supplies the simulated authorization decision for this checkout. */
export function authorizePayment(amountCents, approved) {
	return { status: approved ? 'authorized' : 'declined', amountCents };
}
