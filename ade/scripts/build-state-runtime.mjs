/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { buildRuntime } from '../runtime/runtimeSource.ts';

await buildRuntime({
	source: new URL('../../src/vs/workbench/contrib/ade/common/modelStates.ts', import.meta.url),
	output: new URL('../../src/vs/workbench/contrib/ade/common/stateRuntime.generated.ts', import.meta.url),
	names: ['stateFields', 'stateKey', 'stateEvent', 'stateRestore', 'executeStateProgram', 'runStateScenario'],
	exportName: 'stateInterpreterSource',
	generator: 'build-state-runtime.mjs'
});
