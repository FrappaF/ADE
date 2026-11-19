/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Collects local event records in the order they were recorded. */
export function createOutbox() {
	const events = [];
	return {
		publish(event) {
			events.push(Object.freeze({ sequence: events.length + 1, ...event }));
		},
		list() { return [...events]; }
	};
}
