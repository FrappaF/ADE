import { createServer } from 'node:http';
import { checkout } from './checkout.mjs';
import { createOrderStore } from './orders.mjs';
import { createOutbox } from './outbox.mjs';
import { returnOrder } from './returns.mjs';

const maxRequestBytes = 16 * 1024;
const checkoutStatus = { confirmed: 201, 'invalid-input': 400, declined: 402, 'duplicate-order': 409 };
const returnStatus = { returned: 200, 'invalid-input': 400, 'unknown-order': 404, 'already-returned': 409, 'outside-window': 422 };

function sendJson(response, code, body) {
	response.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
	response.end(JSON.stringify(body));
}

async function readCheckout(request) {
	const chunks = [];
	let size = 0;
	for await (const chunk of request.iterator({ destroyOnReturn: false })) {
		size += chunk.length;
		if (size > maxRequestBytes) {
			request.resume();
			return { status: 'request-too-large' };
		}
		chunks.push(chunk);
	}
	try {
		return { input: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
	} catch {
		return { status: 'invalid-input' };
	}
}

/** One server instance owns the store and outbox used by both features. */
export function createMercatoServer({ now = Date.now } = {}) {
	const orders = createOrderStore();
	const outbox = createOutbox();
	const services = { orders, outbox, now };
	return createServer(async (request, response) => {
		try {
			const path = request.url.split('?')[0];
			if (request.method === 'POST' && path === '/checkout') {
				const payload = await readCheckout(request);
				if (payload.status) {
					sendJson(response, payload.status === 'request-too-large' ? 413 : 400, { status: payload.status });
					return;
				}
				const result = checkout(payload.input, services);
				sendJson(response, checkoutStatus[result.status], result);
				return;
			}
			const orderPath = /^\/orders\/([A-Za-z0-9][A-Za-z0-9_-]{0,63})(\/return)?$/.exec(path);
			if (orderPath && orderPath[2] && request.method === 'POST') {
				const result = returnOrder(orderPath[1], services);
				sendJson(response, returnStatus[result.status], result);
				return;
			}
			if (orderPath && !orderPath[2] && request.method === 'GET') {
				const order = orders.find(orderPath[1]);
				sendJson(response, order ? 200 : 404, order ? { order } : { status: 'unknown-order' });
				return;
			}
			if (request.method === 'GET' && path === '/events') {
				sendJson(response, 200, { events: outbox.list() });
				return;
			}
			sendJson(response, 404, { status: 'unknown-route' });
		} catch {
			sendJson(response, 500, { status: 'internal-error' });
		}
	});
}
