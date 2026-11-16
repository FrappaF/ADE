/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { type ThemeIcon } from '../../../../base/common/themables.js';
import { type ElementKind, type ModelView } from '../common/modelTypes.js';

/** Shared visual vocabulary for navigation and the system overview. */
export function diagramIcon(kind: ModelView['kind']): ThemeIcon {
	switch (kind) {
		case 'activity': case 'dataFlow': return Codicon.gitMerge;
		case 'sequence': return Codicon.arrowSwap;
		case 'state': return Codicon.circleLarge;
		case 'structure': case 'class': case 'component': return Codicon.symbolClass;
		case 'erd': case 'databaseSchema': return Codicon.database;
		case 'deployment': case 'network': return Codicon.server;
		case 'useCase': return Codicon.person;
		case 'package': return Codicon.package;
		default: return Codicon.typeHierarchy;
	}
}

export function elementIcon(kind: ElementKind): ThemeIcon {
	switch (kind) {
		case 'feature': case 'useCase': return Codicon.symbolEvent;
		case 'actor': return Codicon.person;
		case 'resource': case 'table': case 'dataStore': case 'entity': return Codicon.database;
		case 'action': case 'process': case 'controller': return Codicon.symbolMethod;
		case 'state': case 'start': case 'end': return Codicon.circleLarge;
		case 'contract': case 'interface': return Codicon.symbolInterface;
		case 'package': case 'container': return Codicon.package;
		case 'system': case 'deploymentNode': case 'networkNode': return Codicon.server;
		default: return Codicon.symbolClass;
	}
}

export function prependAdeIcon(parent: HTMLElement, icon: ThemeIcon): void {
	const glyph = renderIcon(icon);
	glyph.setAttribute('aria-hidden', 'true');
	parent.prepend(glyph);
}
