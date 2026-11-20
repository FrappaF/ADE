import { assertPreparedCurrent, type PreparedImplementation } from './context.ts';
import { readImplementationPlan } from './plan.ts';
import { createPlanProvider } from './providers.ts';
import type { PlanProvider } from './contracts.ts';
import { inspectImplementationBaseline } from './implementation.ts';

/** Source/model freshness is checked both before disclosure and after the provider completes. */
export async function proposeImplementation(prepared: PreparedImplementation, reviewId: string, signal?: AbortSignal, provider: PlanProvider = createPlanProvider()) {
	await assertPreparedCurrent(prepared, reviewId, signal);
	if (prepared.config.maxCalls < 1) { throw new Error('The saved request budget allows no AI calls'); }
	if (prepared.config.maxCalls > 1) { await inspectImplementationBaseline(prepared, signal); }
	const started = performance.now();
	const result = await provider.propose(prepared.config, structuredClone(prepared.context), signal);
	const plan = readImplementationPlan(result.plan, prepared.context);
	await assertPreparedCurrent(prepared, reviewId, signal);
	return {
		version: 1 as const, status: 'proposed' as const, reviewId, provider: prepared.config.provider, connection: prepared.config.connection,
		model: prepared.config.model, sourceRevision: prepared.context.sourceRevision, modelRevision: prepared.context.modelRevision,
		plan, usage: result.usage, durationMs: Math.round(performance.now() - started), cost: null,
		verification: 'not-run' as const, implementation: 'not-applied' as const
	};
}
