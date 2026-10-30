/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface Payment {
	amount: number;
	currency: string;
}

export class Checkout {
	pay(payment: Payment): boolean {
		return payment.amount > 0 && payment.currency === 'EUR';
	}
}
