/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createMercatoServer } from './server.mjs';

const port = Number(process.env.PORT ?? 3080);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
	throw new Error('PORT deve essere un intero da 0 a 65535.');
}

const server = createMercatoServer();
server.listen(port, '127.0.0.1', () => {
	console.log(`Mercato in ascolto su http://127.0.0.1:${server.address().port}`);
});
