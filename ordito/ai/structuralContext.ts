import { validateModelTaskProposal } from '../../src/vs/workbench/contrib/ordito/common/modelTaskResponse.ts';
import { readSource } from './context.ts';
import { modelDigest } from '../../src/vs/workbench/contrib/ordito/common/modelSerialization.ts';
import { compileModelTaskContext, type ModelTaskRequest } from '../../src/vs/workbench/contrib/ordito/common/modelTaskContext.ts';
import { type SemanticModelV4 } from '../../src/vs/workbench/contrib/ordito/common/modelTypes.ts';

/** Reuse M5's bounded canonical/no-symlink reader. Ranges/revisions are explicit trusted M4 selections. */
export async function prepareStructuralSourceContext(root: string, model: SemanticModelV4, request: ModelTaskRequest, signal?: AbortSignal) {
	const next = structuredClone(request);
	for (const source of next.sources) {
		const content = await readSource(root, source.file, signal);
		if (content.length !== source.length || await modelDigest(content) !== source.revision) { throw new Error('Structural source baseline stale'); }
		for (const window of source.windows) { if (content.slice(window.start, window.start + window.text.length) !== window.text) { throw new Error('Structural source window stale'); } }
	}
	return compileModelTaskContext(model, next);
}

/** Re-read actual source bytes before accepting a candidate, including a cache hit. */
export async function validateStructuralSourceProposal(root: string, packet: import('../../src/vs/workbench/contrib/ordito/common/modelTaskContext.ts').ModelTaskPacket, model: SemanticModelV4, request: ModelTaskRequest, response: unknown, signal?: AbortSignal) {
	const current = await prepareStructuralSourceContext(root, model, request, signal);
	if (current.bytes !== packet.bytes || current.seal !== packet.seal || current.byteLength !== packet.byteLength) { throw new Error('Structural source task stale or modified'); }
	return validateModelTaskProposal(packet, model, request, response);
}
