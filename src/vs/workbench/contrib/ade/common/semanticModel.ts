/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Stable public domain API. Implementation modules depend directly on their owners. */
export { elementKinds, containmentKinds, viewKinds, type ElementKind, relationKinds, type RelationKind, type ModelField, type ModelBehavior, type ElementDetails, type RelationDetails, type SemanticElement, type SemanticRelation, type ModelView, type CodeMapping, type Verification, type LegacySemanticModel, type SemanticModelV4, type SemanticModelV5, type SemanticModel, type ModelDiagnostic, type Schema, type Knowledge, type ObjectKind, type ModelReference, type EvidenceRecord, type DescriptiveScenario, type ModelAssertion, blueprintRules, type ModelType, type ModelOperation, type ModelBlueprint, type DecisionStatus, type DecisionConstraint, type ModelDecision, type PredicateNode, type ModelExpression, type InteractionArgument, type MessageExecution, type ModelOccurrence, type ModelFrame, type ModelInteraction, type ModelPredicate, type ModelStateMachine, type ModelMessaging, type ModelTaskIntent, type ModelFoundation } from './modelTypes.js';
export { checkShape, knowledgeSchema, predicateSchema, expressionSchema, elementDetailsSchema, relationDetailsSchema, semanticModelSchema, semanticModelV3Schema, semanticModelV4Schema, semanticModelV5Schema } from './modelSchema.js';
export { emptyBlueprint, emptyFoundation, modelObjects, isSourceEvidenceModel } from './modelFoundation.js';
export { areModelOperationsCompatible } from './modelContractValidation.js';
export { validateSemanticShape, readSemanticDraft, isCompatibleRelation, validateSemanticModel, InvalidSemanticModelError, readSemanticModel, validateExploration } from './modelValidation.js';
export { migrateSemanticModel } from './modelLegacyMigration.js';
export { SemanticModelService } from './semanticModelService.js';
export { notationRules, acceptsNotationElement, acceptsNotationRelation, notationRelationLabel } from './modelNotation.js';
export { scenarioLayers, scenarioUnorderedOccurrences } from './modelScenario.js';
