/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { readSemanticModel, semanticModelV3Schema, type SemanticModel } from '../../src/vs/workbench/contrib/ade/common/semanticModel.ts';
import { importCode, validateProjection, type CodeImport } from './importCode.ts';
import type { SyncReport } from './syncCode.ts';
import { array, object, text, identifier, digest, evidence, semanticGraphSchema } from './schemas.ts';
import { isSourcePath, outputOutsideSource } from './paths.ts';

const hash = (text: string): string => createHash('sha256').update(text).digest('hex');
const rename = object({ from: text, to: text });
const ajv = new Ajv2020({ allErrors: true });
ajv.addSchema(semanticModelV3Schema);
const validateState = ajv.compile<CodeImport>(object({
	version: { const: 1 }, adapter: text, projectId: identifier, sourceRoot: text, revision: digest,
	excludedDirectories: array(text), model: { $ref: 'urn:ade:model:3' },
	semantic: semanticGraphSchema,
	analysis: object({ parsed: array(text), reused: array(text), renamed: array(rename), ambiguousRenames: array(object({ from: array(text), to: array(text) })), semanticInvalidated: { type: 'boolean' } }, ['semanticInvalidated']),
	files: array(object({
		file: text, moduleId: identifier, status: { enum: ['parsed', 'partial', 'unsupported', 'unclassified', 'excluded', 'configuration'] }, language: text, revision: digest,
		declarations: array(object({ id: identifier, sourceId: identifier, parentId: identifier, name: text, kind: { enum: ['component', 'contract', 'action'] }, syntaxKind: text, header: { type: 'string' }, evidence, nameEvidence: evidence }, ['nameEvidence'])),
		syntaxKinds: { type: 'object', additionalProperties: { type: 'integer', minimum: 1 } },
		imports: array(object({ text, evidence })),
		diagnostics: array(object({ code: { enum: ['syntaxError', 'unresolvedConstruct', 'unnamedDeclaration', 'duplicateName', 'unsupportedLanguage', 'fileTooLarge', 'symlink'] }, file: text, syntaxKind: text, count: { type: 'integer', minimum: 1 }, evidence }, ['syntaxKind', 'evidence']))
	}, ['moduleId', 'language', 'revision']))
}, ['semantic']));
const validateMarker = ajv.compile<{ version: 1; state: string; index: string }>(object({ version: { const: 1 }, state: digest, index: digest }));
const filenames = ['snapshot.json', 'import-state.json', 'code-index.json', 'model.ade.json'] as const;
const maxArtifactBytes = 64 * 1024 * 1024;

/** An import baseline and an editable model are deliberately separate. */
export interface ImportSnapshot {
	state: CodeImport;
	model: SemanticModel;
	inputHash: string;
	directory: string;
}

/** Rejects malformed or mixed state before it is used as a cache. */
export function readImportState(value: unknown): CodeImport {
	if (!validateState(value)) { throw new Error(`Invalid import state: ${ajv.errorsText(validateState.errors)}`); }
	if (!isAbsolute(value.sourceRoot) || value.model.id !== value.projectId) { throw new Error('Invalid source root or project in import state'); }
	const paths = new Set<string>();
	for (const file of value.files) {
		if (paths.has(file.file) || !isSourcePath(file.file)) { throw new Error('Invalid or duplicate source path in import state'); }
		paths.add(file.file);
		if ((file.status === 'parsed' || file.status === 'partial') && (!file.revision || !file.moduleId || !file.language)) { throw new Error('Incomplete source record in import state'); }
		for (const item of [...file.declarations, ...file.imports, ...file.diagnostics]) {
			const source = item.evidence;
			if (source && (source.file !== file.file || source.revision !== file.revision || source.start > source.end || source.line > source.endLine)) { throw new Error('Inconsistent source evidence in import state'); }
		}
		for (const declaration of file.declarations) {
			const name = declaration.nameEvidence;
			if (name && (name.file !== file.file || name.revision !== file.revision || name.start < declaration.evidence.start || name.end > declaration.evidence.end || name.start > name.end)) { throw new Error('Inconsistent declaration-name evidence'); }
		}
	}
	readSemanticModel(value.model);
	validateProjection(value);
	return structuredClone(value);
}

/** Reads bounded local artifacts; no project code or external references are executed. */
async function readArtifacts(directory: string): Promise<string[]> {
	return Promise.all(filenames.map(async name => {
		const path = join(directory, name);
		if ((await stat(path)).size > maxArtifactBytes) { throw new Error(`Snapshot artifact exceeds 64 MiB: ${name}`); }
		return readFile(path, 'utf8');
	}));
}

/** The completion marker detects interrupted and mixed generated artifacts. The model stays editable. */
export async function readSnapshot(directory: string): Promise<ImportSnapshot> {
	directory = await realpath(directory);
	const artifacts = await readArtifacts(directory);
	const [markerText, stateText, indexText, modelText] = artifacts;
	const marker: unknown = JSON.parse(markerText);
	if (!validateMarker(marker) || marker.state !== hash(stateText) || marker.index !== hash(indexText)) { throw new Error('Incomplete or inconsistent import snapshot'); }
	const state = readImportState(JSON.parse(stateText));
	const model = readSemanticModel(JSON.parse(modelText));
	if (model.id !== state.projectId) { throw new Error('Snapshot model belongs to a different project'); }
	const { model: generated, ...index } = state;
	if (JSON.stringify(JSON.parse(indexText)) !== JSON.stringify(index)) { throw new Error('Snapshot index differs from its baseline'); }
	return { state, model, inputHash: hash(JSON.stringify(artifacts)), directory };
}

/** Writes a new recoverable version and marks it complete only after freshness checks pass. */
export async function writeSnapshot(destination: string, state: CodeImport, model: SemanticModel, report?: SyncReport, previous?: ImportSnapshot, signal?: AbortSignal): Promise<string> {
	readImportState(state);
	readSemanticModel(model);
	if (model.id !== state.projectId) { throw new Error('Snapshot model belongs to a different project'); }
	if (state.analysis.semanticInvalidated) { throw new Error('Semantic index must be regenerated before publication'); }
	const output = await outputOutsideSource(destination, state.sourceRoot);
	const { model: generated, ...index } = state;
	const serialize = (value: object): string => JSON.stringify(value, null, '\t') + '\n';
	const stateText = serialize(state);
	const indexText = serialize(index);
	const payloads = new Map<string, string>([
		['model.ade.json', serialize(model)], ['code-index.json', indexText], ['import-state.json', stateText],
	]);
	if (report) { payloads.set('sync-report.json', serialize(report)); }
	if ([...payloads.values()].some(value => Buffer.byteLength(value) > maxArtifactBytes)) { throw new Error('Snapshot artifact exceeds 64 MiB'); }
	signal?.throwIfAborted();
	await mkdir(output);
	try {
		for (const [name, content] of payloads) { signal?.throwIfAborted(); await writeFile(join(output, name), content, { flag: 'wx' }); }
		const observed = await importCode(state.sourceRoot, state.projectId, { previous: state, signal });
		if (observed.revision !== state.revision) { throw new Error('Source changed before snapshot publication'); }
		if (previous && (await readSnapshot(previous.directory)).inputHash !== previous.inputHash) { throw new Error('Previous snapshot changed during Sync'); }
		signal?.throwIfAborted();
		await writeFile(join(output, 'snapshot.json'), serialize({ version: 1, state: hash(stateText), index: hash(indexText) }), { flag: 'wx' });
		return output;
	} catch (error) {
		await rm(output, { recursive: true, force: true });
		throw error;
	}
}
