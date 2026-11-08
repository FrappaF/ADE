/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, dirname, basename } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { readSemanticModel, semanticModelV3Schema, type SemanticModel } from '../../src/vs/workbench/contrib/ade/common/semanticModel.ts';
import { importCode, validateProjection, type CodeImport } from './importCode.ts';
import type { SyncReport } from './syncCode.ts';
import { array, object, text, identifier, digest, evidence, semanticGraphSchema } from './schemas.ts';
import { isSourcePath, outputOutsideSource, isDisclosableSource } from './paths.ts';
import { sourceFile } from './sourceChanges.ts';
import { readSourceScope } from './sourceScope.ts';

const hash = (text: string): string => createHash('sha256').update(text).digest('hex');
const rename = object({ from: text, to: text });
const ajv = new Ajv2020({ allErrors: true });
ajv.addSchema(semanticModelV3Schema);
const validateState = ajv.compile<CodeImport>(object({
	version: { const: 1 }, adapter: text, projectId: identifier, sourceRoot: text, revision: digest,
	excludedDirectories: array(text), model: { $ref: 'urn:ade:model:3' },
	scope: { type: 'object' },
	semantic: semanticGraphSchema,
	analysis: object({ parsed: array(text), reused: array(text), renamed: array(rename), ambiguousRenames: array(object({ from: array(text), to: array(text) })), semanticInvalidated: { type: 'boolean' }, symbolRenames: array(object({ fromId: text, toSourceId: text, fromName: text, toName: text, fromFile: text, toFile: text })), semanticWork: object({ analyzed: array(text), reused: array(text) }), compilerDiagnostics: array(text), syntaxOnly: { type: 'boolean' } }, ['semanticInvalidated', 'symbolRenames', 'semanticWork', 'compilerDiagnostics', 'syntaxOnly']),
	files: array(object({
		file: text, moduleId: identifier, status: { enum: ['parsed', 'partial', 'unsupported', 'unclassified', 'excluded', 'configuration'] }, language: text, revision: digest,
		declarations: array(object({ id: identifier, sourceId: identifier, parentId: identifier, name: text, kind: { enum: ['component', 'contract', 'action'] }, syntaxKind: text, header: { type: 'string' }, evidence, nameEvidence: evidence }, ['nameEvidence'])),
		syntaxKinds: { type: 'object', additionalProperties: { type: 'integer', minimum: 1 } },
		imports: array(object({ text, evidence })),
		diagnostics: array(object({ code: { enum: ['syntaxError', 'unresolvedConstruct', 'unnamedDeclaration', 'duplicateName', 'unsupportedLanguage', 'fileTooLarge', 'symlink'] }, file: text, syntaxKind: text, count: { type: 'integer', minimum: 1 }, evidence }, ['syntaxKind', 'evidence']))
	}, ['moduleId', 'language', 'revision']))
}, ['semantic', 'scope']));
const validateMarker = ajv.compile<{ version: 1; state: string; index: string; common?: string; sources?: string }>(object({ version: { const: 1 }, state: digest, index: digest, common: digest, sources: digest }, ['common', 'sources']));
const validateSources = ajv.compile<Record<string, { revision: string; content: string }>>({ type: 'object', additionalProperties: object({ revision: digest, content: { type: 'string' } }) });
const filenames = ['snapshot.json', 'import-state.json', 'code-index.json', 'model.ade.json'] as const;
const maxArtifactBytes = 64 * 1024 * 1024;

/** An import baseline and an editable model are deliberately separate. */
export interface ImportSnapshot {
	state: CodeImport;
	model: SemanticModel;
	inputHash: string;
	directory: string;
	/** Last successfully reconciled model, distinct from the editable document and generated facts. */
	commonModel: SemanticModel;
	/** Bounded, sealed code preimages. Missing files are explicitly unknown, never reconstructed by AI. */
	commonSources: Record<string, { revision: string; content: string }>;
}

/** Rejects malformed or mixed state before it is used as a cache. */
export function readImportState(value: unknown): CodeImport {
	if (!validateState(value)) { throw new Error(`Invalid import state: ${ajv.errorsText(validateState.errors)}`); }
	if (!isAbsolute(value.sourceRoot) || value.model.id !== value.projectId) { throw new Error('Invalid source root or project in import state'); }
	if (value.scope) {
		readSourceScope(value.scope);
		if (JSON.stringify(value.scope.excludedDirectories) !== JSON.stringify(value.excludedDirectories)) { throw new Error('Source scope differs from excluded directories'); }
	}
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
	let commonText: string | undefined;
	if (marker.common) {
		const path = join(directory, 'common-model.json');
		if ((await stat(path)).size > maxArtifactBytes) { throw new Error('Common model exceeds 64 MiB'); }
		commonText = await readFile(path, 'utf8');
		if (hash(commonText) !== marker.common) { throw new Error('Common model differs from its completion marker'); }
	}
	const commonModel = commonText ? readSemanticModel(JSON.parse(commonText)) : structuredClone(state.model);
	if (commonModel.id !== state.projectId) { throw new Error('Common model belongs to a different project'); }
	let sourcesText: string | undefined;
	let commonSources: ImportSnapshot['commonSources'] = {};
	if (marker.sources) {
		const path = join(directory, 'common-code.json');
		if ((await stat(path)).size > maxArtifactBytes) { throw new Error('Common code exceeds 64 MiB'); }
		sourcesText = await readFile(path, 'utf8');
		const sources: unknown = JSON.parse(sourcesText);
		if (hash(sourcesText) !== marker.sources || !validateSources(sources) || Object.entries(sources).some(([file, source]) => !isDisclosableSource(file) || hash(source.content) !== source.revision)) { throw new Error('Common code differs from its sealed baseline'); }
		commonSources = sources;
	}
	if (model.id !== state.projectId) { throw new Error('Snapshot model belongs to a different project'); }
	const { model: generated, ...index } = state;
	if (JSON.stringify(JSON.parse(indexText)) !== JSON.stringify(index)) { throw new Error('Snapshot index differs from its baseline'); }
	return { state, model, commonModel, commonSources, inputHash: hash(JSON.stringify([...artifacts, ...(commonText ? [commonText] : []), ...(sourcesText ? [sourcesText] : [])])), directory };
}

/** Writes a new recoverable version and marks it complete only after freshness checks pass. */
export async function writeSnapshot(destination: string, state: CodeImport, model: SemanticModel, report?: SyncReport, previous?: ImportSnapshot, signal?: AbortSignal, managed = false): Promise<string> {
	readImportState(state);
	readSemanticModel(model);
	if (model.id !== state.projectId) { throw new Error('Snapshot model belongs to a different project'); }
	if (state.analysis.semanticInvalidated) { throw new Error('Semantic index must be regenerated before publication'); }
	const output = managed ? await managedOutput(destination, state.sourceRoot) : await outputOutsideSource(destination, state.sourceRoot);
	const { model: generated, ...index } = state;
	const serialize = (value: object): string => JSON.stringify(value, null, '\t') + '\n';
	const stateText = serialize(state);
	const indexText = serialize(index);
	const commonSources: ImportSnapshot['commonSources'] = {};
	let remainingSourceBytes = 8 * 1024 * 1024;
	for (const file of state.files.filter(file => !['excluded', 'configuration'].includes(file.status) && isDisclosableSource(file.file))) {
		signal?.throwIfAborted();
		const info = await stat(join(state.sourceRoot, file.file));
		if (!info.isFile() || info.size > 262144 || info.size > remainingSourceBytes) { continue; }
		let source: Awaited<ReturnType<typeof sourceFile>>;
		try { source = await sourceFile(state.sourceRoot, file.file); }
		catch (error) { if (file.status !== 'parsed' && error instanceof TypeError && 'code' in error && error.code === 'ERR_ENCODING_INVALID_ENCODED_DATA') { continue; } throw error; }
		if (source.content.includes('\0')) { continue; }
		const revision = hash(source.content);
		if (file.revision && file.revision !== revision) { throw new Error('Source changed before common revision capture'); }
		commonSources[file.file] = { revision, content: source.content }; remainingSourceBytes -= Buffer.byteLength(source.content);
	}
	const sourcesText = serialize(commonSources);
	const payloads = new Map<string, string>([
		['model.ade.json', serialize(model)], ['code-index.json', indexText], ['import-state.json', stateText],
		['common-model.json', serialize(model)],
		['common-code.json', sourcesText],
	]);
	if (report) { payloads.set('sync-report.json', serialize(report)); }
	if ([...payloads.values()].some(value => Buffer.byteLength(value) > maxArtifactBytes)) { throw new Error('Snapshot artifact exceeds 64 MiB'); }
	signal?.throwIfAborted();
	await mkdir(output);
	try {
		for (const [name, content] of payloads) { signal?.throwIfAborted(); await writeFile(join(output, name), content, { flag: 'wx' }); }
		const observed = await importCode(state.sourceRoot, state.projectId, { previous: state, signal });
		if (observed.revision !== state.revision) { throw new Error('Source changed before snapshot publication'); }
		for (const [file, source] of Object.entries(commonSources)) { if (hash((await sourceFile(state.sourceRoot, file)).content) !== source.revision) { throw new Error('Common source changed before snapshot publication'); } }
		if (previous && (await readSnapshot(previous.directory)).inputHash !== previous.inputHash) { throw new Error('Previous snapshot changed during Sync'); }
		signal?.throwIfAborted();
		await writeFile(join(output, 'snapshot.json'), serialize({ version: 1, state: hash(stateText), index: hash(indexText), common: hash(serialize(model)), sources: hash(sourcesText) }), { flag: 'wx' });
		return output;
	} catch (error) {
		await rm(output, { recursive: true, force: true });
		throw error;
	}
}

/** Only the owned snapshot namespace may be written inside a codebase. */
async function managedOutput(destination: string, root: string): Promise<string> {
	const parent = await realpath(dirname(destination));
	if (parent !== join(root, '.ade', 'imports') || !/^[a-f0-9-]{36}$/.test(basename(destination)) || await realpath(join(root, '.ade')) !== join(root, '.ade')) { throw new Error('Invalid managed snapshot destination'); }
	return join(parent, basename(destination));
}
