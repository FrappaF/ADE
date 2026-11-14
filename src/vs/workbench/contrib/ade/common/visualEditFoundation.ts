/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { reviseModelTask } from './modelWorkflow.js';
import { type SemanticModel } from './modelTypes.js';
import { reviseModelDecision, setBlueprintRecord } from './modelBlueprint.js';
import { type VisualEditContext, type VisualEditOf } from './visualEditTypes.js';

/** Foundation edits share the caller's transaction and validation boundary. */
export function applyFoundationVisualEdit(context: VisualEditContext, edit: VisualEditOf<'taskIntent' | 'predicate' | 'blueprint' | 'decision' | 'type' | 'integration' | 'elementScope' | 'ownership' | 'membership' | 'platformBinding' | 'assertion'>): SemanticModel | undefined {
	const { candidate } = context;
	switch (edit.kind) {
		case 'taskIntent': { if ((candidate.version !== 4 && candidate.version !== 5)) { throw new Error('Task intent requires v4'); } reviseModelTask(candidate, edit.entry, edit.expectedRevision); break; }
		case 'predicate': {
			if ((candidate.version !== 4 && candidate.version !== 5)) { throw new Error('Predicates require v4'); }
			const entries = candidate.foundation.predicates ?? [];
			candidate.foundation.predicates = entries.some(entry => entry.id === edit.entry.id) ? entries.map(entry => entry.id === edit.entry.id ? structuredClone(edit.entry) : entry) : [...entries, structuredClone(edit.entry)];
			break;
		}
		case 'blueprint': {
			if ((candidate.version !== 4 && candidate.version !== 5)) { throw new Error('Blueprint requires v4'); }
			return setBlueprintRecord(candidate, edit.section, edit.entry);
		}
		case 'decision': {
			if ((candidate.version !== 4 && candidate.version !== 5)) { throw new Error('Project decisions require v4'); }
			return reviseModelDecision(candidate, edit.entry, edit.expectedRevision);
		}
		case 'type':
		case 'integration': {
			if ((candidate.version !== 4 && candidate.version !== 5)) { throw new Error('Semantic records require v4'); }
			if (edit.kind === 'type') { const index = candidate.foundation.types.findIndex(entry => entry.id === edit.entry.id); if (index < 0) { candidate.foundation.types.push(structuredClone(edit.entry)); } else { candidate.foundation.types[index] = structuredClone(edit.entry); } }
			else { candidate.foundation.integrations = [...candidate.foundation.integrations.filter(entry => entry.id !== edit.entry.id), structuredClone(edit.entry)]; }
			break;
		}
		case 'elementScope': {
			if ((candidate.version !== 4 && candidate.version !== 5)) { throw new Error('C4 scope requires v4'); }
			const element = candidate.semantics.elements.find(element => element.id === edit.id); if (!element) { throw new Error('Unknown element'); }
			if (edit.scope) { element.scope = edit.scope; } if (edit.runtimeKind) { element.runtimeKind = edit.runtimeKind; }
			break;
		}
		case 'ownership':
		case 'membership':
		case 'platformBinding':
		case 'assertion': {
			if ((candidate.version !== 4 && candidate.version !== 5)) { throw new Error('Explicit semantic records require v4'); }
			if (edit.kind === 'ownership') {
				const entries = candidate.foundation.ownership, index = entries.findIndex(entry => entry.elementId === edit.entry.elementId);
				candidate.foundation.ownership = index < 0 ? [...entries, structuredClone(edit.entry)] : entries.flatMap((entry, position) => entry.elementId !== edit.entry.elementId ? [entry] : position === index ? [structuredClone(edit.entry)] : []);
			}
			else if (edit.kind === 'membership') {
				const matches = (entry: typeof edit.entry) => entry.elementId === edit.entry.elementId && entry.featureId === edit.entry.featureId;
				const entries = candidate.foundation.memberships, index = entries.findIndex(matches);
				candidate.foundation.memberships = !edit.included ? entries.filter(entry => !matches(entry)) : index < 0 ? [...entries, structuredClone(edit.entry)] : entries.flatMap((entry, position) => !matches(entry) ? [entry] : position === index ? [structuredClone(edit.entry)] : []);
			}
			else if (edit.kind === 'platformBinding') { candidate.foundation.platform.bindings = [...candidate.foundation.platform.bindings.filter(entry => entry.id !== edit.entry.id), structuredClone(edit.entry)]; }
			else { candidate.foundation.assertions = [...candidate.foundation.assertions.filter(entry => entry.id !== edit.entry.id), structuredClone(edit.entry)]; }
			break;
		}
	}
	return undefined;
}
