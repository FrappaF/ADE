/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { ModelDiagnostic } from '../common/semanticModel.js';

/** Localized presentation of domain diagnostics, also usable by later editor adapters. */
export function diagnosticMessage(diagnostic: ModelDiagnostic): string {
	const args = diagnostic.args;
	switch (diagnostic.code) {
		case 'shape': return localize('ade.shape', "Invalid value at {0}. Expected: {1}.", diagnostic.path, args[0]);
		case 'duplicateId': return localize('ade.duplicate', "Duplicate identifier {0} at {1}.", args[0], diagnostic.path);
		case 'missingReference': return localize('ade.missing', "Element or relation {0} does not exist ({1}).", args[0], diagnostic.path);
		case 'incompatibleRelation': return localize('ade.incompatible', "A {0} relation cannot connect {1} to {2} ({3}).", args[0], args[1], args[2], diagnostic.path);
		case 'containmentCycle': return localize('ade.cycle', "Element {0} contains itself through its parents ({1}).", args[0], diagnostic.path);
		case 'invalidParent': return localize('ade.parent', "Element {0} of kind {1} is not allowed at {2}.", args[0], args[1], diagnostic.path);
		case 'missingCriterion': return localize('ade.criterion', "Acceptance criterion {0} does not exist on {1}.", args[0], args[1]);
		case 'missingError': return localize('ade.errorCode', "Error {0} is not declared by {1}.", args[0], args[1]);
		case 'viewEndpoint': return localize('ade.endpoint', "Both endpoints of relation {0} must be present in this view.", args[0]);
		case 'legacyClassification': return localize('ade.legacy', "Imported relation {0} needs semantic classification.", args[0]);
	}
}
