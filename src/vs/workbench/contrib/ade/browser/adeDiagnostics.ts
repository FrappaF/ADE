/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import type { ReadinessDiagnostic } from '../common/modelReadiness.js';
import { ModelDiagnostic, SemanticModel } from '../common/semanticModel.js';

/** Localized presentation of domain diagnostics, also usable by later editor adapters. */
export function diagnosticMessage(diagnostic: ModelDiagnostic): string {
	const args = diagnostic.args;
	switch (diagnostic.code) {
		case 'c4Scope': return localize('ade.c4ScopeDiagnostic', "C4 scope needs correction: {0}.", args.slice(1).join(' · '));
		case 'contract': return localize('ade.contractDiagnostic', "Contract needs correction: {0}.", args.slice(1).join(' · '));
		case 'decisionHistory': return localize('ade.decisionHistoryDiagnostic', "Decision history or replacement needs correction: {0}.", args[1] ?? '');
		case 'shape': return localize('ade.shape', "Invalid value at {0}. Expected: {1}.", diagnostic.path, args[0]);
		case 'duplicateId': return localize('ade.duplicate', "Duplicate identifier {0} at {1}.", args[0], diagnostic.path);
		case 'missingReference': return localize('ade.missing', "Element or relation {0} does not exist ({1}).", args[0], diagnostic.path);
		case 'incompatibleRelation': return localize('ade.incompatible', "A {0} relation cannot connect {1} to {2} ({3}).", args[0], args[1], args[2], diagnostic.path);
		case 'containmentCycle': return localize('ade.cycle', "Element {0} contains itself through its parents ({1}).", args[0], diagnostic.path);
		case 'invalidParent': return localize('ade.parent', "Element {0} of kind {1} is not allowed at {2}.", args[0], args[1], diagnostic.path);
		case 'missingCriterion': return localize('ade.criterion', "Acceptance criterion {0} does not exist on {1}.", args[0], args[1]);
		case 'missingError': return localize('ade.errorCode', "Error {0} is not declared by {1}.", args[0], args[1]);
		case 'viewEndpoint': return localize('ade.endpoint', "Both endpoints of relation {0} must be present in this view.", args[0]);
		case 'ownership': return localize('ade.ownershipDiagnostic', "Ownership or feature membership needs correction ({0}).", args[1] ?? args[0]);
		case 'assertionConflict': return localize('ade.assertionConflict', "Accepted assertions disagree. Resolve the conflict before generating this target.");
		case 'legacyClassification': return localize('ade.legacy', "Imported relation {0} needs semantic classification.", args[0]);
	}
}

/** Actions are localized for people; internal packet IDs and hashes stay out of the normal UI. */
export function readinessDiagnosticMessage(model: SemanticModel, diagnostic: ReadinessDiagnostic): string {
	const element = model.semantics.elements.find(item => item.id === diagnostic.object?.id);
	const name = element?.name ?? model.name;
	switch (diagnostic.action) {
		case 'chooseTechnology': return localize('ade.ready.technology', "Choose a Supported Technology for {0}.", name);
		case 'declareExternal': return localize('ade.ready.external', "Declare the System Boundary and External Access for {0}.", name);
		case 'resolveOwnership': return localize('ade.ready.ownership', "Resolve the Architectural Owner of {0}.", name);
		case 'chooseProfile': return localize('ade.ready.profile', "Choose an Implemented Generation Profile for {0}.", name);
		case 'resolveType': return localize('ade.ready.type', "Resolve the Unsupported or Unknown Type in {0}.", name);
		case 'resolveDecision': return localize('ade.ready.decision', "Resolve Conflicting or Unsatisfied Decisions for {0}.", name);
		case 'completeBehavior': return localize('ade.ready.behavior', "Complete the Behavioral Specification for {0}.", name);
		case 'acceptAssertion': return localize('ade.ready.assertion', "Review the Proposed Assertion for {0}.", name);
		case 'classifyLegacy': return localize('ade.ready.legacy', "Classify the Imported Relationship Before Generating {0}.", name);
		case 'resolveReference': return localize('ade.ready.reference', "Repair the Missing or Ambiguous Reference in {0}.", name);
		case 'repairShape': return localize('ade.ready.shape', "Correct or Upgrade the Model Specification for {0}.", name);
	}
}

/** Route to the typed property editor responsible for this diagnostic, preserving object identity. */
export function readinessEditor(diagnostic: ReadinessDiagnostic): { command: string; mode?: import('./adeBlueprintEditing.js').BlueprintEditMode } {
	switch (diagnostic.action) {
		case 'chooseTechnology': case 'chooseProfile': return { command: 'ade.blueprint', mode: 'binding' };
		case 'resolveOwnership': return { command: 'ade.blueprint', mode: 'owner' };
		case 'declareExternal': return { command: 'ade.blueprint', mode: diagnostic.code === 'undeclaredExternal' ? 'integration' : 'scope' };
		case 'resolveDecision': return { command: 'ade.blueprint', mode: 'decision' };
		case 'acceptAssertion': return { command: 'ade.blueprint', mode: 'assertion' };
		case 'resolveType': return { command: 'ade.blueprint', mode: diagnostic.object?.kind === 'operation' ? 'operations' : 'types' };
		case 'completeBehavior': return { command: diagnostic.object?.kind === 'stateMachine' ? 'ade.stateMachine' : diagnostic.object?.kind === 'messaging' ? 'ade.messaging' : diagnostic.object?.kind === 'interaction' || diagnostic.object?.kind === 'frame' || diagnostic.object?.kind === 'occurrence' ? 'ade.interaction' : 'ade.predicate' };
		case 'classifyLegacy': return { command: 'ade.editRelation' };
		case 'resolveReference': case 'repairShape': return { command: 'ade.blueprint' };
	}
}
