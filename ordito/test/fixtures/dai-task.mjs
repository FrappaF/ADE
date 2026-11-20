import { readFile } from 'node:fs/promises';
export const nodeOrders = JSON.parse(await readFile(new URL('../../examples/dai-node-orders.ordito.json', import.meta.url)));
export function taskRequest() {
	return { version: 1, target: { kind: 'operation', id: 'operation.submit' }, mode: 'analysis', intent: { revision: '1', text: 'Review the explicit positive-quantity predicate and its shared contract.', clarifications: [] }, profileId: 'node.esm', provider: { id: 'fixture-provider', model: 'none', configurationRevision: '1' }, baselineRevision: 'baseline.1', delta: [], writeScope: { objects: [{ kind: 'operation', id: 'operation.submit' }], files: [], createOperationsUnder: [] }, retrievalScope: { objects: [], files: [] }, sources: [], budget: { maxInputBytes: 196608, maxContextBytes: 262144, outputReserveBytes: 65536, overheadReserveBytes: 0 } };
}
