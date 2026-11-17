/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Removes URL credentials before Git commands or their output reach a log. */
export function sanitizeGitLog(value: string): string {
	return value
		.replace(/([a-z][a-z0-9+.-]*:\/\/)[^/\s]*@/gi, '$1***@')
		.replace(/([?&](?:access_token|token|password|client_secret|private_token)=)[^&\s#]*/gi, '$1***');
}
