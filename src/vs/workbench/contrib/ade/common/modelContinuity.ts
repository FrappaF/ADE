export interface ContinuityPolicy {
	version: 1; revision: string; root: string; maxPreparations: number; attempted: number;
	maxInputBytes: number; outputReserveBytes: 65536; review: 'manual'; providerCalls: 0;
}
export type ContinuityState = 'off' | 'paused' | 'waiting' | 'preparing' | 'review' | 'aligned' | 'blocked' | 'exhausted' | 'failed';

/** Serial preparation queue. Publication and inference are deliberately outside this policy. */
export class ModelContinuity<T> {
	state: ContinuityState = 'off';
	error: string | undefined;
	private policy: ContinuityPolicy | undefined;
	private enabled = false;
	private current: string | undefined;
	private valid: boolean | undefined;
	private completed: string | undefined;
	private pending: { revision: string; prepare: (signal: AbortSignal, policy: ContinuityPolicy) => Promise<T | undefined> } | undefined;
	private running: AbortController | undefined;
	private timer: ReturnType<typeof setTimeout> | undefined;
	private readonly accept: (result: T) => void;
	private readonly changed: (policy: ContinuityPolicy | undefined) => void;
	private readonly delay: number;
	constructor(accept: (result: T) => void, changed: (policy: ContinuityPolicy | undefined) => void, delay = 600) { this.accept = accept; this.changed = changed; this.delay = delay; }
	get budget(): Readonly<ContinuityPolicy> | undefined { return this.policy ? { ...this.policy } : undefined; }
	get active(): boolean { return this.enabled; }
	configure(policy: ContinuityPolicy): void {
		if (policy.version !== 1 || !policy.revision || !policy.root || !Number.isInteger(policy.maxPreparations) || policy.maxPreparations < 1 || policy.maxPreparations > 100 || !Number.isInteger(policy.attempted) || policy.attempted < 0 || policy.attempted > policy.maxPreparations || !Number.isInteger(policy.maxInputBytes) || policy.maxInputBytes < 1 || policy.maxInputBytes > 196608 || policy.outputReserveBytes !== 65536 || policy.review !== 'manual' || policy.providerCalls !== 0) { throw new Error('Invalid continuous preparation budget'); }
		this.pause(); this.policy = { ...policy }; this.enabled = true; this.completed = undefined;
		this.state = policy.attempted >= policy.maxPreparations ? 'exhausted' : 'waiting'; this.changed(this.policy);
	}
	/** Ignore navigation/layout repeats; an invalid draft still cancels the preceding valid revision. */
	update(revision: string, valid: boolean, prepare: (signal: AbortSignal, policy: ContinuityPolicy) => Promise<T | undefined>): void {
		if (!this.enabled || revision === this.current && valid === this.valid) { return; }
		this.current = revision; this.valid = valid; this.running?.abort(); this.clearTimer(); this.pending = undefined; this.error = undefined;
		if (!valid) { this.state = 'blocked'; this.changed(this.policy); return; }
		if (revision === this.completed) { this.state = 'aligned'; this.changed(this.policy); return; }
		if (!this.policy || this.policy.attempted >= this.policy.maxPreparations) { this.state = 'exhausted'; this.changed(this.policy); return; }
		this.pending = { revision, prepare }; this.state = 'waiting'; this.changed(this.policy);
		this.timer = setTimeout(() => { this.timer = undefined; void this.flush(); }, this.delay);
	}
	async flush(): Promise<void> {
		if (this.running || !this.enabled || !this.pending || !this.policy) { return; }
		const job = this.pending, policy = this.policy; this.pending = undefined;
		if (policy.attempted >= policy.maxPreparations) { this.state = 'exhausted'; this.changed(policy); return; }
		const controller = new AbortController(); this.running = controller;
		policy.attempted++; this.state = 'preparing';
		try {
			// Durable reservation happens before any adapter work. Unknown tokens/prices stay outside this counter.
			this.changed(policy);
			const result = await job.prepare(controller.signal, { ...policy });
			if (!controller.signal.aborted && this.enabled && this.current === job.revision && this.policy === policy) {
				this.completed = job.revision; this.state = result ? 'review' : 'aligned'; if (result) { this.accept(result); }
			}
		} catch (error) {
			if (!controller.signal.aborted && this.enabled && this.current === job.revision) { this.error = error instanceof Error ? error.message : String(error); this.state = 'failed'; }
		} finally {
			this.running = undefined; this.changed(this.policy);
			if (this.enabled && this.pending && !this.timer) { this.timer = setTimeout(() => { this.timer = undefined; void this.flush(); }, this.delay); }
		}
	}
	pause(): void { this.enabled = false; this.running?.abort(); this.pending = undefined; this.current = undefined; this.clearTimer(); this.state = this.policy ? 'paused' : 'off'; this.changed(this.policy); }
	dispose(): void { this.pause(); }
	private clearTimer(): void { if (this.timer) { clearTimeout(this.timer); this.timer = undefined; } }
}
