/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { ElementKind, ModelView, RelationKind } from '../common/semanticModel.js';

export const elementLabels: Record<ElementKind, string> = {
	feature: localize('ade.kind.feature', "Feature"), actor: localize('ade.kind.actor', "Actor"),
	component: localize('ade.kind.component', "Component"), resource: localize('ade.kind.resource', "Resource"),
	view: localize('ade.kind.view', "Interface"), controller: localize('ade.kind.controller', "Controller"),
	contract: localize('ade.kind.contract', "Contract"), action: localize('ade.kind.action', "Action"), state: localize('ade.kind.state', "State")
};

export const relationLabels: Record<RelationKind, string> = {
	invocation: localize('ade.relation.invocation', "Invocation"), dependency: localize('ade.relation.dependency', "Dependency"),
	read: localize('ade.relation.read', "Read"), write: localize('ade.relation.write', "Write"),
	transition: localize('ade.relation.transition', "Transition"), realization: localize('ade.relation.realization', "Realization")
};

export const viewLabels: Record<ModelView['kind'], string> = {
	structure: localize('ade.view.structure', "Structure"), activity: localize('ade.view.activity', "Activity"),
	sequence: localize('ade.view.sequence', "Sequence"), state: localize('ade.view.state', "State")
};
