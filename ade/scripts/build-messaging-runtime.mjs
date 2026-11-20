import { buildRuntime } from '../runtime/runtimeSource.ts';

await buildRuntime({
	source: new URL('../../src/vs/workbench/contrib/ade/common/modelMessaging.ts', import.meta.url),
	output: new URL('../../src/vs/workbench/contrib/ade/common/messagingRuntime.generated.ts', import.meta.url),
	names: ['validateMessageEnvelope', 'simulateMessaging'],
	exportName: 'messagingInterpreterSource',
	generator: 'build-messaging-runtime.mjs'
});
