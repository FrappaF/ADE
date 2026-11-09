/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Resolve the pinned production compiler once for semantic import and structural source indexes.
// A second resolution from ade/ai would bundle a second compiler from its development dependencies.
export { default } from 'typescript';
