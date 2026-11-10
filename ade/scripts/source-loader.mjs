/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerHooks } from 'node:module';

const domain = new URL('../../src/vs/workbench/contrib/ade/', import.meta.url).href;
registerHooks({
	resolve(specifier, context, next) {
		return next(context.parentURL?.startsWith(domain) && specifier.endsWith('.js') ? specifier.slice(0, -3) + '.ts' : specifier, context);
	}
});
