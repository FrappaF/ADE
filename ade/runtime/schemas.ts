/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const text = { type: 'string', minLength: 1 };
export const identifier = { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9_.:-]*$' };
export const digest = { type: 'string', pattern: '^[a-f0-9]{64}$' };

/** Small schema constructors shared by persisted state and external-index validation. */
export function array(items: object): object { return { type: 'array', items }; }
export function object(properties: Record<string, object>, optional: string[] = []): object {
	return { type: 'object', properties, required: Object.keys(properties).filter(key => !optional.includes(key)), additionalProperties: false };
}
