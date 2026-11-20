import { createMarketplaceServer } from './server.mjs';

const port = Number(process.env.PORT ?? 3080);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
	throw new Error('PORT must be an integer from 0 to 65535.');
}

const server = createMarketplaceServer();
server.listen(port, '127.0.0.1', () => {
	console.log(`Marketplace listening at http://127.0.0.1:${server.address().port}`);
});
