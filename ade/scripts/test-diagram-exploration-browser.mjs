import './source-loader.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright-core';
const { emptyFoundation } = await import('../../src/vs/workbench/contrib/ade/common/semanticModel.ts');
const { diagramModelRevision, proposeDiagramModel, applyDiagramProposal } = await import('../../src/vs/workbench/contrib/ade/common/modelProposals.ts');
const { renderDiagramPreview, inspectDiagramQuality } = await import('../../src/vs/workbench/contrib/ade/common/diagramPreview.ts');
const { contentHash } = await import('../runtime/sourceChanges.ts');

const output = resolve(process.argv[2] ?? '.build/ade-exploration-preview'); await mkdir(output, { recursive: true });
const model = { version: 5, id: 'visual-fixture', name: 'Visual fixture', semantics: { elements: [], relations: [] }, views: [], codeMappings: [], verifications: [], foundation: { ...emptyFoundation(), evidence: [] } };
const evidence = { id: 'fixture', file: 'fixture.ts', revision: contentHash('fixture'), start: 0, end: 7, encoding: 'utf-16', producer: 'visual-test-fixture', producerVersion: '1', nature: 'text', factIds: [] };
let id = 0;
const request = { proposalId: 'visual-preview', baseSemanticRevision: await diagramModelRevision(model), readObjectIds: [], readEvidenceIds: [evidence.id], queryIds: [], commands: [
	...[[ '@system', 'system', 'Chart Service', 'governed' ], [ '@web', 'container', 'HTTP API' ], [ '@storage', 'container', 'Object Storage' ], [ '@external', 'system', 'External Client', 'external' ]].map(([ref, kind, name, scope]) => ({ kind: 'element', ref, evidenceIds: [evidence.id], element: { kind, name, ...(scope ? { scope } : {}) } })),
	{ kind: 'ownership', ref: '@ownWeb', elementId: '@web', ownerId: '@system', role: 'architecture' }, { kind: 'ownership', ref: '@ownStorage', elementId: '@storage', ownerId: '@system', role: 'architecture' },
	{ kind: 'relation', ref: '@stores', evidenceIds: [evidence.id], relation: { kind: 'dependency', from: '@web', to: '@storage', name: 'Stores charts' } },
	{ kind: 'view', ref: '@containers', name: 'Container Boundary', viewKind: 'c4Container', intent: 'One governed system and an external client', elementIds: ['@system', '@web', '@external', '@storage'], relationIds: ['@stores'], subjectId: '@system', contextIds: ['@external'] },
	{ kind: 'scenario', ref: '@upload', trigger: 'Upload chart', scope: 'One upload request', participantIds: ['@web', '@storage'], evidenceIds: [evidence.id], occurrences: [{ ref: '@put', name: 'PutObject', from: '@web', to: '@storage', evidenceIds: [evidence.id] }, { ref: '@retained', name: 'PutObjectWithRetention', from: '@web', to: '@storage', evidenceIds: [evidence.id] }], order: [], alternatives: [{ ref: '@alt', operator: 'alt', operands: [{ ref: '@ordinary', condition: { state: 'known', value: 'ChartLimits == nil' }, steps: ['@put'], evidenceIds: [evidence.id] }, { ref: '@limited', condition: { state: 'known', value: 'ChartLimits != nil' }, steps: ['@retained'], evidenceIds: [evidence.id] }] }] },
	{ kind: 'view', ref: '@sequence', name: 'Upload Alternatives', viewKind: 'sequence', intent: 'Exclusive storage paths', elementIds: ['@web', '@storage'], relationIds: [], scenarioId: '@upload' }
] };
const overviewCommands = request.commands.filter(command => command.kind !== 'scenario' && !(command.kind === 'view' && command.ref === '@sequence'));
const proposal = await proposeDiagramModel(model, { ...request, commands: overviewCommands }, [evidence], () => 'visual.' + ++id); assert.deepEqual(proposal.diagnostics, []);
const overview = applyDiagramProposal(model, proposal);
const scenarioCommands = request.commands.filter(command => command.kind === 'scenario' || command.kind === 'view' && command.ref === '@sequence').map(command => command.kind === 'scenario' ? { ...command, participantIds: command.participantIds.map(id => proposal.aliases[id]), occurrences: command.occurrences.map(call => ({ ...call, from: proposal.aliases[call.from], to: proposal.aliases[call.to] })) } : { ...command, elementIds: command.elementIds.map(id => proposal.aliases[id]) });
const behavior = await proposeDiagramModel(overview, { ...request, proposalId: 'visual-scenario', baseSemanticRevision: await diagramModelRevision(overview), commands: scenarioCommands }, [evidence], () => 'visual.' + ++id);
assert.deepEqual(behavior.diagnostics, []);
const sequenceModel = applyDiagramProposal(overview, behavior);
const activity = await proposeDiagramModel(sequenceModel, { ...request, proposalId: 'visual-activity', baseSemanticRevision: await diagramModelRevision(sequenceModel), commands: [{ kind: 'view', ref: '@activity', name: 'Upload Activity', viewKind: 'activity', intent: 'Project the same exclusive occurrences without inventing chronology', elementIds: [proposal.aliases['@web'], proposal.aliases['@storage']], relationIds: [], scenarioId: behavior.aliases['@upload'] }] }, [evidence], () => 'visual.' + ++id);
assert.deepEqual(activity.diagnostics, []);
const candidate = applyDiagramProposal(sequenceModel, activity), paths = [];
const names = ['c4', 'sequence', 'activity'];
for (const [index, view] of candidate.views.entries()) {
	assert.ok(!inspectDiagramQuality(candidate, view).some(diagnostic => diagnostic.severity === 'error'));
	const path = join(output, `${names[index]}.svg`); await writeFile(path, renderDiagramPreview(candidate, view)); paths.push(path);
}
const browser = await chromium.launch({ executablePath: process.env.ADE_CHROMIUM_EXECUTABLE || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
	const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
	const errors = []; page.on('pageerror', error => errors.push(error.message));
	for (const [index, path] of paths.entries()) {
		await page.setContent(await readFile(path, 'utf8'));
		assert.equal(await page.locator('svg > title').textContent(), candidate.views[index].name);
		assert.ok(await page.locator('text').count() >= 2);
		if (index === 0) {
			const boxes = await page.locator('rect').evaluateAll(rects => rects.filter(rect => rect.getAttribute('stroke')).map(rect => ({ x: Number(rect.getAttribute('x')), width: Number(rect.getAttribute('width')), fill: rect.getAttribute('fill'), label: rect.nextElementSibling?.textContent })));
			const boundary = boxes.find(box => box.fill === '#f3f6fa'), external = boxes.find(box => box.label === 'External Client');
			assert.ok(external.x >= boundary.x + boundary.width);
			assert.ok((await page.locator('text').allTextContents()).some(label => label.includes('Stores charts')));
			const end = (await page.locator('path[data-relation-id]').getAttribute('d')).match(/-?\d+(?:\.\d+)?/g).slice(-2).map(Number);
			const nodes = await page.locator('rect[stroke][fill="#ffffff"]').evaluateAll(rects => rects.map(rect => Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, Number(rect.getAttribute(key))]))));
			assert.ok(nodes.every(node => !(end[0] > node.x && end[0] < node.x + node.width && end[1] > node.y && end[1] < node.y + node.height)), 'arrowheads terminate at a visible node edge');
		} else {
			const labels = await page.locator('text').allTextContents();
			assert.ok(labels.join('').includes('ChartLimits == nil') && labels.join('').includes('ChartLimits != nil'));
			assert.ok(labels.includes('alt'));
			if (index === 2) { assert.equal(await page.locator('path[marker-end]').count(), 0); }
			assert.ok(labels.filter(label => label.includes('PutObject')).every(label => !label.includes('[?]')));
		}
		await page.screenshot({ path: join(output, `${names[index]}.png`), fullPage: true });
	}
	assert.deepEqual(errors, []);
	await writeFile(join(output, 'report.json'), JSON.stringify({ kind: 'local-browser-fixtures-no-inference', browser: browser.version(), views: 3, errors, passed: true }, null, '\t') + '\n');
	console.log(`Three browser previews passed: ${output}`);
} finally { await browser.close(); }
