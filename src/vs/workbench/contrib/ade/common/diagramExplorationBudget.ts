/** Numeric budget shared by the workbench, saved sessions and the exploration engine. */
export interface DiagramExplorationBudget {
	maxToolCalls: number;
	maxReadBytes: number;
	maxDurationMs: number;
	maxModelTurns: number;
}

const kibibyte = 1024;
const mebibyte = 1024 * kibibyte;
const minuteMs = 60_000;

export const minimumDiagramExplorationBudget = Object.freeze({ maxToolCalls: 1, maxReadBytes: kibibyte, maxDurationMs: 1000, maxModelTurns: 1 });
export const maximumDiagramExplorationBudget = Object.freeze({ maxToolCalls: 1000, maxReadBytes: 32 * mebibyte, maxDurationMs: 24 * 60 * minuteMs, maxModelTurns: 100 });
export const defaultProjectDiagramExplorationBudget = Object.freeze({ maxToolCalls: 800, maxReadBytes: 16 * mebibyte, maxDurationMs: 180 * minuteMs, maxModelTurns: 64 });

export const projectDiagramBudgetPresets = Object.freeze({
	compact: Object.freeze({ maxToolCalls: 400, maxReadBytes: 8 * mebibyte, maxDurationMs: 90 * minuteMs, maxModelTurns: 32 }),
	standard: defaultProjectDiagramExplorationBudget,
	large: Object.freeze({ ...maximumDiagramExplorationBudget, maxDurationMs: 360 * minuteMs })
});

export const diagramBudgetExtensionPresets = Object.freeze({
	small: Object.freeze({ maxToolCalls: 100, maxReadBytes: 2 * mebibyte, maxDurationMs: 30 * minuteMs, maxModelTurns: 8 }),
	standard: Object.freeze({ maxToolCalls: 200, maxReadBytes: 4 * mebibyte, maxDurationMs: 60 * minuteMs, maxModelTurns: 16 }),
	large: Object.freeze({ maxToolCalls: 400, maxReadBytes: 8 * mebibyte, maxDurationMs: 120 * minuteMs, maxModelTurns: 32 })
});

/** Check limits in wire units without coercing incomplete or malformed input. */
export function isDiagramExplorationBudget(value: unknown): value is DiagramExplorationBudget {
	if (!value || typeof value !== 'object' || Array.isArray(value)) { return false; }
	const candidate = value as Record<string, unknown>;
	return (Object.keys(maximumDiagramExplorationBudget) as (keyof DiagramExplorationBudget)[]).every(key => {
		const amount = candidate[key];
		return typeof amount === 'number' && Number.isSafeInteger(amount) && amount >= minimumDiagramExplorationBudget[key] && amount <= maximumDiagramExplorationBudget[key];
	});
}

/** Resolve a configured budget to a detached value suitable for a new project session. */
export function getProjectDiagramExplorationBudget(value: unknown): DiagramExplorationBudget {
	const { maxToolCalls, maxReadBytes, maxDurationMs, maxModelTurns } = isDiagramExplorationBudget(value) ? value : defaultProjectDiagramExplorationBudget;
	return { maxToolCalls, maxReadBytes, maxDurationMs, maxModelTurns };
}

/** Return the maximum increment in each dimension at the observed session state. */
export function getDiagramBudgetExtensionCapacity(budget: DiagramExplorationBudget, usage: { toolCalls: number; readBytes: number; modelTurns: readonly string[] }, remainingMs: number): DiagramExplorationBudget {
	return {
		maxToolCalls: Math.max(0, maximumDiagramExplorationBudget.maxToolCalls - Math.max(budget.maxToolCalls, usage.toolCalls)),
		maxReadBytes: Math.max(0, maximumDiagramExplorationBudget.maxReadBytes - Math.max(budget.maxReadBytes, usage.readBytes)),
		maxDurationMs: Math.max(0, maximumDiagramExplorationBudget.maxDurationMs - Math.max(0, remainingMs)),
		maxModelTurns: Math.max(0, maximumDiagramExplorationBudget.maxModelTurns - Math.max(budget.maxModelTurns, usage.modelTurns.length))
	};
}
