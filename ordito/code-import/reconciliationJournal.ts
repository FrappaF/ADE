import { randomUUID } from 'node:crypto';
import { readFile, readdir, lstat, realpath, writeFile, rename, rm, chmod } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { managed, active, activate, atomicJson, snapshotId, assertNoInterruptedStructuralPublication } from '../runtime/projectStore.ts';
import { projectMetadataPath } from '../runtime/projectPaths.ts';
import { sourceFile, type SourceMutation } from '../runtime/sourceChanges.ts';
import { readSnapshot, type ImportSnapshot } from './snapshot.ts';
import { object, text, digest, array } from '../runtime/schemas.ts';
import { errorCode } from '../runtime/errors.ts';

export interface ReconciliationOperation {
	version: 1; id: string; root: string; created: string;
	origin: 'model' | 'code' | 'both' | 'none';
	status: 'reconciling' | 'applied' | 'undoing' | 'undone' | 'rolledBack';
	from: string; to: string; fromHash: string; toHash?: string;
	fromRevision: string; toRevision: string;
	mutations: SourceMutation[];
	review?: { id: string; provider: string; model: string; promptRevision: string; outputRevision: string; inputBytes: number; outputBytes: number; cached: boolean };
}
const valid = new Ajv2020().compile<ReconciliationOperation>(object({
	version: { const: 1 }, id: text, root: text, created: text, origin: { enum: ['model', 'code', 'both', 'none'] },
	status: { enum: ['reconciling', 'applied', 'undoing', 'undone', 'rolledBack'] },
	from: text, to: text, fromHash: digest, toHash: digest, fromRevision: digest, toRevision: digest,
	mutations: { ...array(object({ file: text, before: { type: 'string' }, after: { type: 'string' }, mode: { type: 'integer', minimum: 0, maximum: 511 } })), maxItems: 1000 },
	review: object({ id: digest, provider: text, model: text, promptRevision: digest, outputRevision: digest, inputBytes: { type: 'integer', minimum: 0 }, outputBytes: { type: 'integer', minimum: 0 }, cached: { type: 'boolean' } })
}, ['toHash', 'review']));

async function save(operation: ReconciliationOperation): Promise<void> {
	if (Buffer.byteLength(JSON.stringify(operation)) > 32 * 1024 * 1024) { throw new Error('Reconciliation journal exceeds 32 MiB; narrow the operation before applying'); }
	await atomicJson(join(await managed(operation.root, 'reconciliation'), `${operation.id}.json`), operation);
}

async function readOperation(root: string, id: string): Promise<ReconciliationOperation> {
	if (!snapshotId(id)) { throw new Error('Invalid reconciliation operation'); }
	const path = join(await managed(root, 'reconciliation'), `${id}.json`);
	const info = await lstat(path);
	if (!info.isFile() || info.size > 32 * 1024 * 1024) { throw new Error('Invalid reconciliation journal'); }
	const value: unknown = JSON.parse(await readFile(path, 'utf8'));
	const imports = await projectMetadataPath(root, 'imports');
	if (!valid(value) || value.id !== id || value.root !== root || !snapshotId(basename(value.from)) || !snapshotId(basename(value.to)) || value.from === value.to || [value.from, value.to].some(path => dirname(path) !== imports) || new Set(value.mutations.map(item => item.file)).size !== value.mutations.length) { throw new Error('Inconsistent reconciliation journal'); }
	return value;
}

export async function operationHistory(root: string): Promise<ReconciliationOperation[]> {
	const directory = await managed(root, 'reconciliation');
	const operations = [];
	for (const file of await readdir(directory)) {
		if (!file.endsWith('.json') || !snapshotId(file.slice(0, -5))) { continue; }
		operations.push(await readOperation(root, file.slice(0, -5)));
	}
	return operations.sort((a, b) => b.created.localeCompare(a.created));
}

/** An interrupted transaction blocks all further publications until explicit recovery. */
export async function assertNoInterruptedOperation(root: string, recoveringImplementationId?: string): Promise<void> {
	await assertNoInterruptedStructuralPublication(root);
	if ((await operationHistory(root)).some(item => item.status === 'reconciling' || item.status === 'undoing')) { throw new Error('Interrupted reconciliation requires recovery before Sync or implementation'); }
	const directory = await projectMetadataPath(root, 'collaboration');
	let entries: string[];
	try { if (await realpath(directory) !== directory) { throw new Error('Redirected collaboration journals'); } entries = await readdir(directory); }
	catch (error) { if (errorCode(error) === 'ENOENT') { return; } throw error; }
	for (const id of entries) {
		if (!snapshotId(id)) { continue; }
		const session = join(directory, id);
		if (await realpath(session) !== session) { throw new Error('Redirected collaboration journal'); }
		try {
			const info = await lstat(join(session, 'transaction.json'));
			if (!info.isFile() || info.isSymbolicLink()) { throw new Error('Invalid implementation transaction'); }
			if (id !== recoveringImplementationId) { throw new Error('Interrupted implementation requires recovery before Sync or implementation'); }
		} catch (error) { if (!(errorCode(error) === 'ENOENT')) { throw error; } }
	}
}

async function replace(root: string, mutation: SourceMutation, undo: boolean): Promise<void> {
	const source = await sourceFile(root, mutation.file);
	if (source.content !== (undo ? mutation.after : mutation.before) || source.mode !== mutation.mode) { throw new Error('Source changed since review; manual edits were preserved'); }
	const temporary = join(dirname(source.path), `.ordito-${randomUUID()}.tmp`);
	try {
		await writeFile(temporary, undo ? mutation.before : mutation.after, { flag: 'wx', mode: mutation.mode });
		await chmod(temporary, mutation.mode);
		// Compare once more immediately before replacing the path.
		const checked = await sourceFile(root, mutation.file);
		if (checked.content !== source.content || checked.mode !== source.mode) { throw new Error('Source changed during reconciliation'); }
		await rename(temporary, source.path);
	} finally { await rm(temporary, { force: true }); }
}

/** Journal before writes; publish the shared baseline only after all source/index/model checks succeed. Caller owns the project lock. */
export async function applyReconciliation(previous: ImportSnapshot, destination: string, origin: ReconciliationOperation['origin'], mutations: SourceMutation[], publish: () => Promise<void>, signal?: AbortSignal, review?: ReconciliationOperation['review']): Promise<ReconciliationOperation> {
	const root = previous.state.sourceRoot;
	await assertNoInterruptedOperation(root);
	if (await active(root) !== basename(previous.directory) || (await readSnapshot(previous.directory)).inputHash !== previous.inputHash) { throw new Error('Model or active snapshot changed since reconciliation review'); }
	for (const mutation of mutations) {
		const source = await sourceFile(root, mutation.file);
		if (source.content !== mutation.before || source.mode !== mutation.mode) { throw new Error('Source changed since review'); }
	}
	const operation: ReconciliationOperation = { version: 1, id: randomUUID(), root, created: new Date().toISOString(), origin, status: 'reconciling', from: previous.directory, to: destination, fromHash: previous.inputHash, fromRevision: previous.state.revision, toRevision: previous.state.revision, mutations, review };
	await save(operation);
	try {
		for (const mutation of mutations) { signal?.throwIfAborted(); await replace(root, mutation, false); }
		await publish();
		signal?.throwIfAborted();
		const next = await readSnapshot(destination);
		if ((await readSnapshot(previous.directory)).inputHash !== previous.inputHash || await active(root) !== basename(previous.directory)) { throw new Error('Common revision changed during reconciliation'); }
		operation.toHash = next.inputHash; operation.toRevision = next.state.revision;
		await save(operation);
		await activate(root, destination);
		operation.status = 'applied'; await save(operation);
		return operation;
	} catch (error) {
		// Recovery recognizes both preimages and applied images, even after an ambiguous final write.
		await recoverReconciliation(root, operation.id);
		throw error;
	}
}

/** Restores the exact pre-operation pair. Later edits to either side prevent undo. Caller owns the project lock. */
export async function undoReconciliation(root: string, id: string): Promise<ImportSnapshot> {
	await assertNoInterruptedOperation(root);
	const operation = await readOperation(root, id);
	if (operation.status !== 'applied' || await active(root) !== basename(operation.to) || (await readSnapshot(operation.to)).inputHash !== operation.toHash || (await readSnapshot(operation.from)).inputHash !== operation.fromHash) { throw new Error('Only the unchanged active reconciliation can be undone'); }
	for (const mutation of operation.mutations) {
		const source = await sourceFile(root, mutation.file);
		if (source.content !== mutation.after || source.mode !== mutation.mode) { throw new Error('Manual source edits prevent undo'); }
	}
	operation.status = 'undoing'; await save(operation);
	try {
		for (const mutation of [...operation.mutations].reverse()) { await replace(root, mutation, true); }
		await activate(root, operation.from);
		operation.status = 'undone'; await save(operation);
		return readSnapshot(operation.from);
	} catch (error) { await recoverReconciliation(root, id); throw error; }
}

/** Restart recovery completes a published transaction or rolls back uncommitted writes, without overwriting unknown edits. */
export async function recoverReconciliation(root: string, id: string): Promise<ImportSnapshot> {
	const operation = await readOperation(root, id);
	if (!['reconciling', 'undoing'].includes(operation.status)) { throw new Error('Operation does not need recovery'); }
	const pointer = await active(root);
	const undo = operation.status === 'undoing';
	const committed = pointer === basename(undo ? operation.from : operation.to);
	if (pointer !== basename(operation.from) && pointer !== basename(operation.to)) { throw new Error('Active snapshot changed; recovery preserved all files'); }
	const destination = committed ? undo ? operation.from : operation.to : undo ? operation.to : operation.from;
	const snapshot = await readSnapshot(destination);
	if (snapshot.inputHash !== (destination === operation.from ? operation.fromHash : operation.toHash)) { throw new Error('Model edits prevent recovery'); }
	const restore: SourceMutation[] = [];
	for (const mutation of operation.mutations) {
		const source = await sourceFile(root, mutation.file);
		const expected = undo ? mutation.after : mutation.before;
		const applied = undo ? mutation.before : mutation.after;
		if (source.mode !== mutation.mode || source.content !== expected && source.content !== applied || committed && source.content !== applied) { throw new Error('Manual source edits prevent recovery; all unknown edits were preserved'); }
		if (!committed && source.content !== expected) { restore.push(mutation); }
	}
	for (const mutation of restore.reverse()) { await replace(root, mutation, !undo); }
	operation.status = committed ? undo ? 'undone' : 'applied' : undo ? 'applied' : 'rolledBack';
	await save(operation);
	return snapshot;
}
