/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { charge as pay } from './gateway.js';

export function checkout(amount: number): boolean {
	const marker = '😀'; return pay(amount);
}
