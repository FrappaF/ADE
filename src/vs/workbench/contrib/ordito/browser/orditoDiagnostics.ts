import { localize } from '../../../../nls.js';
import { type ReadinessDiagnostic } from '../common/modelReadiness.js';
import { ModelDiagnostic, SemanticModel } from '../common/modelTypes.js';

/** A required interface can be authored before its provider without making the diagram unsafe. */
export function isOrditoDiagramBlockingDiagnostic(diagnostic: ModelDiagnostic): boolean {
	return diagnostic.severity === 'error' && !(diagnostic.code === 'contract' && diagnostic.args[1] === 'requiredInterfaceUnsatisfied');
}

/** Localized presentation of domain diagnostics, also usable by later editor adapters. */
export function diagnosticMessage(diagnostic: ModelDiagnostic, model?: SemanticModel): string {
	const args = diagnostic.args;
	switch (diagnostic.code) {
		case 'c4Scope': return localize('ordito.c4ScopeDiagnostic', "C4 scope needs correction: {0}.", args.slice(1).join(' · '));
		case 'contract': {
			if (args[1] === 'requiredInterfaceUnsatisfied') {
				const blueprint = model && (model.version === 4 || model.version === 5) ? model.foundation.blueprint : undefined;
				const port = blueprint?.ports.find(port => port.id === args[0]);
				const owner = model?.semantics.elements.find(element => element.id === port?.elementId)?.name ?? args[0];
				const contract = blueprint?.interfaces.find(contract => contract.id === port?.interfaceId);
				const name = model?.semantics.elements.find(element => element.id === contract?.elementId)?.name ?? port?.interfaceId ?? '';
				return localize('ordito.requiredInterfaceUnsatisfied', "The required interface {0} on {1} has no provider connection. Open Edit Blueprint → Interface Connection, choose a provider and map its operations. ({2})", name, owner, diagnostic.path);
			}
			return localize('ordito.contractDiagnostic', "Contract needs correction: {0}.", args.slice(1).join(' · '));
		}
		case 'decisionHistory': return localize('ordito.decisionHistoryDiagnostic', "Decision history or replacement needs correction: {0}.", args[1] ?? '');
		case 'shape': return localize('ordito.shape', "Invalid value at {0}. Expected: {1}.", diagnostic.path, args[0]);
		case 'duplicateId': return localize('ordito.duplicate', "Duplicate identifier {0} at {1}.", args[0], diagnostic.path);
		case 'missingReference': return /\/(?:typeId|itemTypeId|targetTypeId|payloadTypeId)$/.test(diagnostic.path) ? localize('ordito.missingType', "Type {0} does not exist ({1}).", args[0], diagnostic.path) : localize('ordito.missing', "Element or relation {0} does not exist ({1}).", args[0], diagnostic.path);
		case 'incompatibleRelation': return localize('ordito.incompatible', "A {0} relation cannot connect {1} to {2} ({3}).", args[0], args[1], args[2], diagnostic.path);
		case 'containmentCycle': return localize('ordito.cycle', "Element {0} contains itself through its parents ({1}).", args[0], diagnostic.path);
		case 'invalidParent': return localize('ordito.parent', "Element {0} of kind {1} is not allowed at {2}.", args[0], args[1], diagnostic.path);
		case 'missingCriterion': return localize('ordito.criterion', "Acceptance criterion {0} does not exist on {1}.", args[0], args[1]);
		case 'missingError': return localize('ordito.errorCode', "Error {0} is not declared by {1}.", args[0], args[1]);
		case 'viewEndpoint': return localize('ordito.endpoint', "Both endpoints of relation {0} must be present in this view.", args[0]);
		case 'ownership': {
			const name = model?.semantics.elements.find(element => element.id === args[0])?.name ?? args[0];
			return args[1] === 'invalidOwner' ? localize('ordito.invalidOwnership', "Ownership of {0} is invalid. Use an architectural owner for a structural element, or a resource, entity or class as the owner of a lifecycle state. ({1})", name, diagnostic.path) : localize('ordito.ownershipDiagnostic', "Ownership or feature membership of {0} needs correction ({1}; {2}).", name, args[1] ?? args[0], diagnostic.path);
		}
		case 'assertionConflict': return localize('ordito.assertionConflict', "Accepted assertions disagree. Resolve the conflict before generating this target.");
		case 'legacyClassification': return localize('ordito.legacy', "Imported relation {0} needs semantic classification.", args[0]);
	}
}

/** Actions are localized for people; internal packet IDs and hashes stay out of the normal UI. */
export function readinessDiagnosticMessage(model: SemanticModel, diagnostic: ReadinessDiagnostic): string {
	const element = model.semantics.elements.find(item => item.id === diagnostic.object?.id);
	const name = element?.name ?? model.name;
	switch (diagnostic.action) {
		case 'chooseTechnology': return localize('ordito.ready.technology', "Choose a Supported Technology for {0}.", name);
		case 'declareExternal': return localize('ordito.ready.external', "Declare the System Boundary and External Access for {0}.", name);
		case 'resolveOwnership': return localize('ordito.ready.ownership', "Resolve the Architectural Owner of {0}.", name);
		case 'chooseProfile': return localize('ordito.ready.profile', "Choose an Implemented Generation Profile for {0}.", name);
		case 'resolveType': return localize('ordito.ready.type', "Resolve the Unsupported or Unknown Type in {0}.", name);
		case 'resolveDecision': return localize('ordito.ready.decision', "Resolve Conflicting or Unsatisfied Decisions for {0}.", name);
		case 'completeBehavior': return localize('ordito.ready.behavior', "Complete the Behavioral Specification for {0}.", name);
		case 'acceptAssertion': return localize('ordito.ready.assertion', "Review the Proposed Assertion for {0}.", name);
		case 'classifyLegacy': return localize('ordito.ready.legacy', "Classify the Imported Relationship Before Generating {0}.", name);
		case 'resolveReference': return localize('ordito.ready.reference', "Repair the Missing or Ambiguous Reference in {0}.", name);
		case 'repairShape': return localize('ordito.ready.shape', "Correct or Upgrade the Model Specification for {0}.", name);
	}
}

/** Route to the typed property editor responsible for this diagnostic, preserving object identity. */
export function readinessEditor(diagnostic: ReadinessDiagnostic): { command: string; mode?: import('./orditoBlueprintEditing.js').BlueprintEditMode } {
	switch (diagnostic.action) {
		case 'chooseTechnology': case 'chooseProfile': return { command: 'ordito.blueprint', mode: 'binding' };
		case 'resolveOwnership': return { command: 'ordito.blueprint', mode: 'owner' };
		case 'declareExternal': return { command: 'ordito.blueprint', mode: diagnostic.code === 'undeclaredExternal' ? 'integration' : 'scope' };
		case 'resolveDecision': return { command: 'ordito.blueprint', mode: 'decision' };
		case 'acceptAssertion': return { command: 'ordito.blueprint', mode: 'assertion' };
		case 'resolveType': return { command: 'ordito.blueprint', mode: diagnostic.object?.kind === 'operation' ? 'operations' : 'types' };
		case 'completeBehavior': return { command: diagnostic.object?.kind === 'stateMachine' ? 'ordito.stateMachine' : diagnostic.object?.kind === 'messaging' ? 'ordito.messaging' : diagnostic.object?.kind === 'interaction' || diagnostic.object?.kind === 'frame' || diagnostic.object?.kind === 'occurrence' ? 'ordito.interaction' : 'ordito.predicate' };
		case 'classifyLegacy': return { command: 'ordito.editRelation' };
		case 'resolveReference': case 'repairShape': return { command: 'ordito.blueprint' };
	}
}
