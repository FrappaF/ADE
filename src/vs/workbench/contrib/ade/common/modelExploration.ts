/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { scenarioLayers } from './modelScenario.js';
import { validateExploration } from './modelValidation.js';
import { type ModelDiagnostic, type SemanticModelV4 } from './modelTypes.js';
import { validateModelInteraction } from './modelInteractions.js';

export { scenarioLayers, validateExploration };

/** A descriptive draft can be reviewed; generation requires the executable contract separately. */
export function explorationReadiness(model: SemanticModelV4, viewId: string): { viewable: boolean; reviewable: boolean; executable: boolean; diagnostics: ModelDiagnostic[] } {
	const view = model.views.find(entry => entry.id === viewId), diagnostics = validateExploration(model);
	const valid = !!view && !diagnostics.some(entry => entry.path === '/views/' + viewId || entry.path.startsWith('/foundation/'));
	const scenario = model.foundation.interactions.find(entry => entry.id === view?.interactionId);
	return { viewable: valid, reviewable: valid, executable: valid && !!scenario?.execution && scenario.profile !== 'descriptive' && validateModelInteraction(model, scenario.id).length === 0, diagnostics };
}
