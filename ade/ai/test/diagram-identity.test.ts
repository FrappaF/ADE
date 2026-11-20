import '../../scripts/source-loader.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { DiagramCommand } from '../../../src/vs/workbench/contrib/ade/common/modelProposals.ts';
import type { EvidenceRecord, SemanticModelV4 } from '../../../src/vs/workbench/contrib/ade/common/modelTypes.ts';

const { lookupDiagramElements, sourceDeclarationFact } = await import('../../../src/vs/workbench/contrib/ade/common/diagramIdentity.ts');
const { diagramModelRevision, proposeDiagramModel, applyDiagramProposal } = await import('../../../src/vs/workbench/contrib/ade/common/modelProposals.ts');
const { emptyFoundation } = await import('../../../src/vs/workbench/contrib/ade/common/semanticModel.ts');
const { importCode } = await import('../../code-import/importCode.ts');
const { readExplorationSource, searchExplorationSource } = await import('../../code-import/explorationIndex.ts');

function model(): SemanticModelV4 {
	return { version: 5, id: 'shop', name: 'Shop', semantics: { elements: [{ id: 'checkout', kind: 'component', name: 'Checkout' }, { id: 'returns', kind: 'component', name: 'Returns' }, { id: 'store', kind: 'resource', name: 'Storage' }], relations: [] }, views: [], codeMappings: [], verifications: [], foundation: emptyFoundation() };
}

function evidence(id: string, file: string, start = 0, syntax = true): EvidenceRecord {
	return { id, file, revision: '1'.repeat(64), start, end: start + 20, encoding: 'utf-16', producer: 'fixture', producerVersion: '1', nature: syntax ? 'syntax' : 'text', factIds: syntax ? [sourceDeclarationFact(`${file}:${start}`)] : [] };
}

function action(ref: string, evidenceId: string, name = 'Handle Request'): DiagramCommand {
	return { kind: 'element', ref, element: { name, kind: 'action' }, evidenceIds: [evidenceId] };
}

async function propose(base: SemanticModelV4, id: string, commands: DiagramCommand[], records: EvidenceRecord[]) {
	return proposeDiagramModel(base, { proposalId: id, baseSemanticRevision: await diagramModelRevision(base), readEvidenceIds: [], readObjectIds: [], queryIds: [], commands }, records);
}

test('an indexed symbol search and a complete symbol read use the same declaration anchor', async t => {
	const root = await mkdtemp(join(tmpdir(), 'ade-diagram-identity-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	await writeFile(join(root, 'checkout.mjs'), 'export function handleRequest() { return true; }\n');
	const source = await importCode(root, 'shop');
	const [hit] = (await searchExplorationSource(source, { query: 'handleRequest', mode: 'symbol' })).page.items;
	assert.ok(hit.symbolId);
	const location = { symbolId: hit.symbolId, revision: hit.evidence.revision };
	const complete = await readExplorationSource(source, location);
	const partial = await readExplorationSource(source, { ...location, maxChars: 12 });
	assert.deepEqual([hit.evidence.id, hit.evidence.factIds, partial.evidence.factIds], [complete.evidence.id, [sourceDeclarationFact(hit.symbolId)], []]);
});

test('identity lookup ranks IDs and declaration anchors while leaving same-name candidates ambiguous', async () => {
	const initial = model();
	const checkoutEvidence = evidence('checkout-handler', 'checkout.ts'), returnsEvidence = evidence('returns-handler', 'returns.ts');
	const drafted = await propose(initial, 'handlers', [
		action('@checkoutHandler', checkoutEvidence.id),
		action('@returnsHandler', returnsEvidence.id),
		{ kind: 'ownership', ref: '@checkoutOwner', elementId: '@checkoutHandler', ownerId: 'checkout', role: 'architecture' },
		{ kind: 'ownership', ref: '@returnsOwner', elementId: '@returnsHandler', ownerId: 'returns', role: 'architecture' }
	], [checkoutEvidence, returnsEvidence]);
	const staged = applyDiagramProposal(initial, drafted);
	const name = { kind: 'action', name: 'HANDLE  REQUEST' } as const;
	const sameName = lookupDiagramElements(staged, name, []);
	const byOwner = lookupDiagramElements(staged, { ...name, ownerId: 'returns' }, []);
	const alternateRecord = { ...checkoutEvidence, id: 'same-declaration', start: 2 };
	const byDefinition = lookupDiagramElements(staged, { ...name, evidenceIds: [alternateRecord.id] }, [alternateRecord]);
	const byId = lookupDiagramElements(staged, { ...name, id: drafted.aliases['@returnsHandler'] }, []);
	assert.deepEqual([sameName.status, sameName.total, byOwner.candidates[0].id, byDefinition.candidates[0].match, byDefinition.candidates[0].id, byId.candidates[0].match], ['ambiguous', 2, drafted.aliases['@returnsHandler'], 'name-and-definition', drafted.aliases['@checkoutHandler'], 'id']);
});

test('duplicate declarations report the canonical identity and a second view can use it directly', async () => {
	const initial = model(), anchor = evidence('handler', 'checkout.ts');
	const drafted = await propose(initial, 'handler', [action('@handler', anchor.id)], [anchor]);
	const staged = applyDiagramProposal(initial, drafted), canonicalId = drafted.aliases['@handler'];
	const duplicate = await propose(staged, 'duplicate', [action('@other', anchor.id, 'Request Handler')], [anchor]);
	const reuse = await propose(staged, 'reuse', [{ kind: 'view', ref: '@detail', name: 'Handler structure', viewKind: 'structure', intent: 'Show shared handler', elementIds: [canonicalId], relationIds: [] }], []);
	const updated = applyDiagramProposal(staged, reuse);
	assert.deepEqual([duplicate.status, duplicate.diagnostics[0].args, updated.semantics.elements.length, updated.views[0].nodes[0].elementId], ['invalid', ['duplicateElementIdentity', canonicalId], staged.semantics.elements.length, canonicalId]);
});

test('distinct ownership and independently anchored homonyms can coexist', async () => {
	const initial = model(), shared = evidence('guide', 'guide.md', 0, false), first = evidence('first-handler', 'checkout.ts'), second = evidence('second-handler', 'checkout.ts', 70);
	const drafted = await propose(initial, 'same-name-distinct', [
		action('@first', first.id), action('@second', second.id), action('@sameOwner', shared.id), action('@differentOwner', shared.id),
		{ kind: 'ownership', ref: '@firstOwner', elementId: '@first', ownerId: 'checkout', role: 'architecture' },
		{ kind: 'ownership', ref: '@secondOwner', elementId: '@second', ownerId: 'checkout', role: 'architecture' },
		{ kind: 'ownership', ref: '@sameOwnerOwnership', elementId: '@sameOwner', ownerId: 'checkout', role: 'architecture' },
		{ kind: 'ownership', ref: '@differentOwnerOwnership', elementId: '@differentOwner', ownerId: 'returns', role: 'architecture' }
	], [shared, first, second]);
	assert.equal(drafted.status, 'ready');
	const staged = applyDiagramProposal(initial, drafted);
	const repeated = await propose(staged, 'duplicate-range', [action('@repeat', shared.id), { kind: 'ownership', ref: '@repeatOwner', elementId: '@repeat', ownerId: 'returns', role: 'architecture' }], [shared]);
	assert.deepEqual(repeated.diagnostics.map(diagnostic => diagnostic.args), [['duplicateElementIdentity', drafted.aliases['@differentOwner']]]);
});

test('new same-scope aliases ask for explicit reuse of an unanchored manual element', async () => {
	const base = model(), initial = structuredClone(base), first = evidence('first-handler', 'checkout.ts'), second = evidence('second-handler', 'checkout.ts', 70);
	const ownership = (ownerId: string): DiagramCommand => ({ kind: 'ownership', ref: '@owner', elementId: '@handler', ownerId, role: 'architecture' });
	initial.semantics.elements.push({ id: 'manual-handler', kind: 'action', name: 'Handle Request' });
	initial.foundation.ownership.push({ id: 'manual-owner', elementId: 'manual-handler', ownerId: 'checkout', role: 'architecture' });
	const fresh = await propose(initial, 'unconfirmed', [action('@handler', second.id), ownership('checkout')], [second]);
	const anotherScope = await propose(initial, 'distinct-scope', [action('@handler', second.id), ownership('returns')], [second]);
	const anchorManual = await propose(initial, 'anchor-manual', [action('manual-handler', first.id)], [first]);
	const anchored = applyDiagramProposal(initial, anchorManual);
	const anotherDefinition = await propose(anchored, 'distinct-definition', [action('@handler', second.id), ownership('checkout')], [second]);
	const legacyDraft = await propose(base, 'legacy', [action('@handler', second.id), ownership('checkout')], [second]);
	assert.deepEqual([fresh.status, fresh.diagnostics[0].args, anotherScope.status, anotherDefinition.status, applyDiagramProposal(initial, legacyDraft).semantics.elements.length], ['invalid', ['unconfirmedElementIdentity', 'manual-handler'], 'ready', 'ready', 5]);
});

test('relation duplicates are guarded in review and on replay without collapsing distinct qualifiers', async () => {
	const initial = model(), anchor = evidence('relation', 'checkout.ts'), secondAnchor = evidence('parallel-relation', 'checkout.ts', 20);
	const relation = (ref: string, condition: string, evidenceId = anchor.id, protocol?: string): DiagramCommand => ({ kind: 'relation', ref, relation: { kind: 'write', from: 'checkout', to: 'store', name: 'Persist order', condition, ...(protocol ? { details: { sourceMultiplicity: '', sourceMember: '', targetMultiplicity: '', targetMember: '', protocol } } : {}) }, evidenceIds: [evidenceId] });
	const first = await propose(initial, 'write-first', [relation('@first', 'payment is approved')], [anchor]);
	const parallel = await propose(initial, 'write-matching', [relation('@matching', 'payment is approved', secondAnchor.id)], [secondAnchor]);
	const staged = applyDiagramProposal(initial, first);
	const duplicate = await propose(staged, 'write-duplicate', [relation('@duplicate', 'payment is approved')], [anchor]);
	const distinct = await propose(staged, 'write-distinct', [relation('@condition', 'payment is pending'), relation('@protocol', 'payment is approved', anchor.id, 'SQL')], [anchor]);
	assert.deepEqual([duplicate.diagnostics[0].args, distinct.status, applyDiagramProposal(staged, distinct).semantics.relations.length], [['duplicateRelationIdentity', first.aliases['@first']], 'ready', 3]);
	assert.throws(() => applyDiagramProposal(staged, parallel), /duplicateRelationIdentity/);
});
