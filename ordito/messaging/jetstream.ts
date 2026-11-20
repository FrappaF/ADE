import { connect, AckPolicy, DeliverPolicy, ReplayPolicy, RetentionPolicy, StorageType, DiscardPolicy, nanos, type JsMsg, type StreamConfig, type ConsumerConfig } from 'nats';
import { mkdir, open, readFile, rename, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { validateMessageEnvelope, assertMessagingProgram, messagingRules, type MessageEnvelope, type MessagingProgram } from '../../src/vs/workbench/contrib/ordito/common/modelMessaging.ts';
import { canonicalJson } from '../../src/vs/workbench/contrib/ordito/common/modelSerialization.ts';
import type { ModelValue } from '../../src/vs/workbench/contrib/ordito/common/modelValues.ts';
import lockfile from 'proper-lockfile';

export interface JetStreamOptions { server: string; namespace: string; ledgerDirectory: string; mode: 'create' | 'attach' }
export interface MessageDelivery { envelope: MessageEnvelope; input: Record<string, ModelValue>; attempt: number; subscriptionId: string }
export interface DeliveryResult { status: 'empty' | 'completed' | 'duplicate' | 'retry' | 'deadLetter'; id?: string; attempt?: number; reason?: string }
interface Ledger { version: 1; programHash: string; completed: Record<string, string> }
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const token = (id: string) => Buffer.from(id).toString('hex');

/** Explicit isolated local adapter. Does not deploy services, run project code or join a live project transaction. */
export async function openJetStream(program: MessagingProgram, options: JetStreamOptions) {
	program = structuredClone(program); options = structuredClone(options); assertMessagingProgram(program);
	const endpoint = new URL(options.server);
	if (endpoint.protocol !== 'nats:' || !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname) || endpoint.username || endpoint.password || endpoint.pathname && endpoint.pathname !== '/' || endpoint.search || endpoint.hash || !/^[A-Z][A-Z0-9_]{0,31}$/.test(options.namespace) || canonicalJson(program.rules) !== canonicalJson(messagingRules) || program.topology.brokers.length !== 1 || program.topology.brokers[0].credentialRef !== 'none') { throw new Error('Unsupported isolated broker execution'); }
	const nc = await connect({ servers: options.server, reconnect: false, timeout: 2000, name: 'ordito-dai08-isolated' });
	try {
		if (nc.info?.version !== messagingRules.brokerVersion) { throw new Error('Broker version mismatch'); }
		const jsm = await nc.jetstreamManager(), js = nc.jetstream(), ns = options.namespace, subject = (value: string) => ns + '.' + value;
		const streamName = (id: string) => ns + '_' + token(id), durableName = (id: string) => program.topology.subscriptions.find(sub => sub.id === id)!.durable;
		const streams: Partial<StreamConfig>[] = program.topology.channels.map(channel => ({ name: streamName(channel.id), subjects: [subject(channel.subject)], retention: RetentionPolicy.Limits, storage: StorageType.File, discard: DiscardPolicy.New, max_msgs: channel.maxMessages, max_msg_size: 131072, num_replicas: 1, duplicate_window: nanos(channel.duplicateWindowMs), max_age: 0 }));
		for (const sub of program.topology.subscriptions) { const channel = program.topology.channels.find(channel => channel.id === sub.channelId)!; streams.push({ name: streamName('dlq.' + sub.id), subjects: [subject(sub.deadLetter.subject)], retention: RetentionPolicy.Limits, storage: StorageType.File, discard: DiscardPolicy.New, max_msgs: channel.maxMessages, max_msg_size: 262144, num_replicas: 1, duplicate_window: nanos(channel.duplicateWindowMs), max_age: 0 }); }
		const sameFields = (actual: object, expected: object) => Object.entries(expected).every(([key, value]) => canonicalJson((actual as Record<string, object>)[key]) === canonicalJson(value));
		// Preflight every resource before mutation. create never updates existing resources.
		for (const config of streams) { if (options.mode === 'attach') { const actual = await jsm.streams.info(config.name!); if (!sameFields(actual.config, config)) { throw new Error('Broker configuration changed'); } } else { let exists = false; try { await jsm.streams.info(config.name!); exists = true; } catch (error) { if ((error as { code?: string }).code !== '404') { throw error; } } if (exists) { throw new Error('Broker namespace already exists'); } } }
		const consumers = program.topology.subscriptions.map(sub => ({ stream: streamName(sub.channelId), config: { durable_name: durableName(sub.id), ack_policy: AckPolicy.Explicit, ack_wait: nanos(sub.ackWaitMs), max_deliver: -1, max_ack_pending: 1, max_waiting: 32, deliver_policy: DeliverPolicy.All, replay_policy: ReplayPolicy.Instant, filter_subject: subject(program.topology.channels.find(channel => channel.id === sub.channelId)!.subject) } satisfies Partial<ConsumerConfig> }));
		if (options.mode === 'attach') { for (const item of consumers) { const actual = await jsm.consumers.info(item.stream, item.config.durable_name!); if (!sameFields(actual.config, item.config)) { throw new Error('Broker consumer configuration changed'); } } }
		else { for (const config of streams) { await jsm.streams.add(config); } for (const item of consumers) { await jsm.consumers.add(item.stream, item.config); } }
		const planHash = digest(canonicalJson(program));
		await mkdir(options.ledgerDirectory, { recursive: true }); if ((await lstat(options.ledgerDirectory)).isSymbolicLink()) { throw new Error('Ledger directory cannot be a symbolic link'); }
		const publish = async (publisherId: string, envelope: MessageEnvelope) => { envelope = structuredClone(envelope); const publisher = program.topology.publishers.find(binding => binding.id === publisherId); if (!publisher || publisherId !== envelope.publisherId) { throw new Error('messagePublisher'); } validateMessageEnvelope(program, publisher.channelId, envelope); const channel = program.topology.channels.find(channel => channel.id === publisher.channelId)!; const ack = await js.publish(subject(channel.subject), Buffer.from(canonicalJson(envelope)), { msgID: envelope.id }); return { duplicate: ack.duplicate, sequence: ack.seq }; };
		const next = async (subscriptionId: string, expires = 1000): Promise<JsMsg | null> => { const sub = program.topology.subscriptions.find(sub => sub.id === subscriptionId); if (!sub) { throw new Error('messageSubscription'); } if (!Number.isSafeInteger(expires) || expires < 1000 || expires > 5000) { throw new Error('Invalid fetch timeout'); } const consumer = await js.consumers.get(streamName(sub.channelId), sub.durable); return consumer.next({ expires }); };
		const consume = async (subscriptionId: string, handler: (delivery: MessageDelivery) => Promise<void>, expires = 1000): Promise<DeliveryResult> => {
			const sub = program.topology.subscriptions.find(sub => sub.id === subscriptionId); if (!sub) { throw new Error('messageSubscription'); }
			const path = join(options.ledgerDirectory, ns + '_' + token(sub.id) + '.json'), useLedger = sub.idempotency === 'file-ledger-v1';
			const release = useLedger ? await lockfile.lock(options.ledgerDirectory, { lockfilePath: path + '.lock', stale: 2000, update: 1000, realpath: false, retries: 0 }) : undefined;
			try {
				let ledger: Ledger = { version: 1, programHash: planHash, completed: {} };
				if (useLedger) { try { const stat = await lstat(path); if (stat.isSymbolicLink() || stat.size > 2097152) { throw new Error('Invalid ledger file'); } ledger = JSON.parse(await readFile(path, 'utf8')) as Ledger; if (Object.keys(ledger).sort().join(',') !== 'completed,programHash,version' || ledger.version !== 1 || ledger.programHash !== planHash || !ledger.completed || typeof ledger.completed !== 'object' || Array.isArray(ledger.completed) || Object.keys(ledger.completed).length > 10000 || Object.entries(ledger.completed).some(([key, value]) => !/^[a-f0-9]{64}$/.test(key) || typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))) { throw new Error('Ledger revision or shape changed'); } } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { throw error; } } }
				const msg = await next(subscriptionId, expires); if (!msg) { return { status: 'empty' }; } const attempt = msg.info.deliveryCount;
				let envelope: MessageEnvelope;
				const deadLetter = async (reason: string): Promise<DeliveryResult> => { const identity = digest(Buffer.from(msg.data).toString('base64')), record = { version: 1, subscriptionId, reason, attempt, sourceSequence: msg.seq, envelope: Buffer.from(msg.data).toString('base64') }; await js.publish(subject(sub.deadLetter.subject), Buffer.from(canonicalJson(record)), { msgID: digest(subscriptionId + ':' + msg.seq + ':' + identity) }); if (!await msg.ackAck({ timeout: 2000 })) { throw new Error('Source ack not confirmed'); } return { status: 'deadLetter', attempt, reason }; };
				try { if (msg.data.length > 65536) { throw new Error('messageBytes'); } envelope = JSON.parse(Buffer.from(msg.data).toString('utf8')) as MessageEnvelope; validateMessageEnvelope(program, sub.channelId, envelope); } catch (error) { return await deadLetter(error instanceof Error ? error.message : 'messageEnvelope'); }
				const hash = digest(canonicalJson(envelope)), key = digest(envelope.id), previous = ledger.completed[key];
				if (useLedger && previous) { if (previous !== hash) { return await deadLetter('identityConflict'); } if (!await msg.ackAck({ timeout: 2000 })) { throw new Error('Duplicate ack not confirmed'); } return { status: 'duplicate', id: envelope.id, attempt }; }
				if (attempt > sub.maxAttempts) { return await deadLetter('attemptsExhausted'); }
				if (useLedger && Object.keys(ledger.completed).length >= 10000) { throw new Error('Ledger capacity reached before handler'); }
				try { await handler({ envelope: structuredClone(envelope), input: { [program.inputs[sub.id]]: structuredClone(envelope.payload) }, subscriptionId, attempt }); }
				catch { if (attempt >= sub.maxAttempts) { return await deadLetter('attemptsExhausted'); } msg.nak(sub.backoffMs[attempt - 1]); await nc.flush(); return { status: 'retry', id: envelope.id, attempt }; }
				if (useLedger) {
					ledger.completed[key] = hash;
					const temporary = path + '.' + randomUUID() + '.next', file = await open(temporary, 'wx', 0o600); try { await file.writeFile(canonicalJson(ledger)); await file.sync(); } finally { await file.close(); } await rename(temporary, path); const directory = await open(options.ledgerDirectory, 'r'); try { await directory.sync(); } finally { await directory.close(); }
				}
				if (!await msg.ackAck({ timeout: 2000 })) { throw new Error('Completion persisted; ack not confirmed'); } return { status: 'completed', id: envelope.id, attempt };
			} finally { await release?.(); }
		};
		return { publish, consume, close: () => nc.close(), resources: { streams: streams.map(config => config.name!), subjects: program.topology.channels.map(channel => subject(channel.subject)), deadLetters: program.topology.subscriptions.map(sub => ({ id: sub.id, stream: streamName('dlq.' + sub.id), subject: subject(sub.deadLetter.subject) })) } };
	} catch (error) { await nc.close(); throw error; }
}
