/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { buildRuntime } from '../runtime/runtimeSource.ts';

await buildRuntime({
	source: new URL('../../src/vs/workbench/contrib/ade/common/modelInteractions.ts', import.meta.url),
	output: new URL('../../src/vs/workbench/contrib/ade/common/interactionRuntime.generated.ts', import.meta.url),
	names: ['InteractionFailure', 'fail', 'valuesFor', 'assertFields', 'operationScope', 'executeInteractionProgram'],
	exportName: 'interactionInterpreterSource',
	generator: 'build-interaction-runtime.mjs'
});
