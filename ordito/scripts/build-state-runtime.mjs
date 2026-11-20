import { buildRuntime } from '../runtime/runtimeSource.ts';

await buildRuntime({
	source: new URL('../../src/vs/workbench/contrib/ordito/common/modelStates.ts', import.meta.url),
	output: new URL('../../src/vs/workbench/contrib/ordito/common/stateRuntime.generated.ts', import.meta.url),
	names: ['stateFields', 'stateKey', 'stateEvent', 'stateRestore', 'executeStateProgram', 'runStateScenario'],
	exportName: 'stateInterpreterSource',
	generator: 'build-state-runtime.mjs'
});
