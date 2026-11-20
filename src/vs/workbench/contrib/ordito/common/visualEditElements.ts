import { type SemanticModel } from './modelTypes.js';
import { isSequenceMessage } from './sequenceDiagram.js';
import { getStateDiagram, isResourceTransition } from './stateDiagram.js';
import { type VisualEditContext, type VisualEditOf } from './visualEditTypes.js';
import { getDeletionImpact, includeElement } from './visualEditSupport.js';
import { addScenarioParticipants } from './visualEditScenario.js';

/** Elements edits share the caller's transaction and validation boundary. */
export function applyElementsVisualEdit(context: VisualEditContext, edit: VisualEditOf<'feature' | 'resource' | 'element' | 'relation' | 'rename' | 'description' | 'renameRelation' | 'parent' | 'elementDetails' | 'relationDetails' | 'condition' | 'behavior' | 'relationError' | 'updateRelation' | 'deleteRelation' | 'deleteElement'>): SemanticModel | undefined {
	const { candidate, view } = context;
	switch (edit.kind) {
		case 'feature':
			candidate.semantics.elements.push({ id: edit.id, kind: 'feature', name: edit.name });
			break;
		case 'resource':
			candidate.semantics.elements.push({ id: edit.id, kind: 'resource', name: edit.name, ...(edit.parentId ? { parentId: edit.parentId } : {}) });
			break;
		case 'element': {
			const diagram = view(edit.viewId);
			const scopedC4 = (candidate.version === 4 || candidate.version === 5) && ['c4Context', 'c4Container', 'c4Component'].includes(diagram.kind) && !!diagram.subjectId;
			const contextContainer = scopedC4 && diagram.kind === 'c4Component' && edit.elementKind === 'container';
			const scopedClass = (candidate.version === 4 || candidate.version === 5) && diagram.kind === 'class' && !!diagram.subjectId;
			const contextElement = scopedClass || scopedC4 && (edit.elementKind === 'actor' || edit.elementKind === 'system' || contextContainer);
			const subjectOwner = contextContainer && (candidate.version === 4 || candidate.version === 5) ? candidate.foundation.ownership.find(entry => entry.elementId === diagram.subjectId && entry.role === 'architecture')?.ownerId : undefined;
			const parentId = edit.parentId ?? (contextContainer ? subjectOwner : scopedC4 && !contextElement && diagram.kind !== 'c4Context' ? diagram.subjectId : diagram.featureId);
			if (diagram.kind === 'state' && edit.elementKind === 'state' && !getStateDiagram(candidate, diagram).groups.some(group => group.resource.id === parentId)) { throw new Error(`Resource is outside this state diagram: ${parentId}`); }
			candidate.semantics.elements.push({ id: edit.id, kind: edit.elementKind, name: edit.name, ...(parentId ? { parentId } : {}), ...(contextElement && edit.elementKind === 'system' ? { scope: 'external' as const } : {}) });
			if (contextElement) { diagram.contextIds = [...new Set([...(diagram.contextIds ?? []), edit.id])]; }
			includeElement(diagram, edit.id, candidate);
			addScenarioParticipants(candidate, diagram, [edit.id]);
			break;
		}
		case 'relation': {
			const diagram = view(edit.viewId);
			if (diagram.kind === 'sequence' && !isSequenceMessage({ kind: edit.relationKind })) { throw new Error('Unsupported sequence message'); }
			if (diagram.kind === 'state' && !isResourceTransition(candidate, { id: edit.id, from: edit.from, to: edit.to, kind: edit.relationKind, name: edit.name })) { throw new Error('Unsupported resource transition'); }
			candidate.semantics.relations.push({
				id: edit.id, kind: edit.relationKind, from: edit.from, to: edit.to, name: edit.name,
				...(edit.condition?.trim() ? { condition: edit.condition } : {})
			});
			diagram.relationIds.push(edit.id);
			break;
		}
		case 'rename': {
			const target = edit.target === 'diagram' ? view(edit.id) : candidate.semantics.elements.find(element => element.id === edit.id);
			if (!target) { throw new Error(`Unknown element: ${edit.id}`); }
			target.name = edit.name;
			break;
		}
		case 'description': {
			const element = candidate.semantics.elements.find(element => element.id === edit.id);
			if (!element) { throw new Error(`Unknown element: ${edit.id}`); }
			element.description = edit.description;
			break;
		}
		case 'renameRelation': {
			const relation = candidate.semantics.relations.find(relation => relation.id === edit.id);
			if (!relation) { throw new Error(`Unknown relation: ${edit.id}`); }
			relation.name = edit.name;
			break;
		}
		case 'parent': {
			if ((candidate.version === 4 || candidate.version === 5)) { throw new Error('Edit architectural ownership and feature membership separately in v4'); }
			const element = candidate.semantics.elements.find(element => element.id === edit.id);
			if (!element) { throw new Error(`Unknown element: ${edit.id}`); }
			if (edit.parentId) { element.parentId = edit.parentId; } else { delete element.parentId; }
			break;
		}
		case 'elementDetails': {
			const element = candidate.semantics.elements.find(element => element.id === edit.id);
			if (!element) { throw new Error(`Unknown element: ${edit.id}`); }
			element.details = structuredClone(edit.details);
			break;
		}
		case 'relationDetails': {
			const relation = candidate.semantics.relations.find(relation => relation.id === edit.id);
			if (!relation) { throw new Error(`Unknown relation: ${edit.id}`); }
			relation.details = structuredClone(edit.details);
			break;
		}
		case 'condition': {
			const relation = candidate.semantics.relations.find(relation => relation.id === edit.id);
			if (!relation) { throw new Error(`Unknown relation: ${edit.id}`); }
			if (edit.condition.trim()) { relation.condition = edit.condition; } else { delete relation.condition; }
			break;
		}
		case 'behavior': {
			const element = candidate.semantics.elements.find(element => element.id === edit.id);
			if (!element) { throw new Error(`Unknown element: ${edit.id}`); }
			element.behavior = structuredClone(edit.behavior);
			break;
		}
		case 'relationError': {
			const relation = candidate.semantics.relations.find(relation => relation.id === edit.id);
			if (!relation) { throw new Error(`Unknown relation: ${edit.id}`); }
			if (edit.errorCode) { relation.errorCode = edit.errorCode; } else { delete relation.errorCode; }
			break;
		}
		case 'updateRelation': {
			const relation = candidate.semantics.relations.find(relation => relation.id === edit.id);
			if (!relation) { throw new Error(`Unknown relation: ${edit.id}`); }
			Object.assign(relation, { from: edit.from, to: edit.to, kind: edit.relationKind, name: edit.name });
			delete relation.classification;
			for (const diagram of candidate.views.filter(diagram => diagram.relationIds.includes(edit.id))) {
				if (diagram.kind === 'sequence' && !isSequenceMessage(relation)) { throw new Error('Unsupported sequence message'); }
				if (diagram.kind === 'state' && !isResourceTransition(candidate, relation)) { throw new Error('Unsupported resource transition'); }
			}
			delete relation.condition; delete relation.errorCode;
			if (edit.condition) { relation.condition = edit.condition; }
			if (edit.errorCode) { relation.errorCode = edit.errorCode; }
			break;
		}
		case 'deleteRelation':
			candidate.semantics.relations = candidate.semantics.relations.filter(relation => relation.id !== edit.id);
			for (const diagram of candidate.views) { diagram.relationIds = diagram.relationIds.filter(id => id !== edit.id); }
			break;
		case 'deleteElement': {
			const impact = getDeletionImpact(candidate, edit.id);
			candidate.semantics.elements = candidate.semantics.elements.filter(element => !impact.elements.includes(element.id));
			candidate.semantics.relations = candidate.semantics.relations.filter(relation => !impact.relations.includes(relation.id));
			candidate.views = candidate.views.filter(view => !view.featureId || !impact.elements.includes(view.featureId));
			for (const diagram of candidate.views) {
				diagram.nodes = diagram.nodes.filter(node => !impact.elements.includes(node.elementId));
				diagram.relationIds = diagram.relationIds.filter(id => !impact.relations.includes(id));
			}
			for (const element of candidate.semantics.elements) {
				if (element.behavior) { element.behavior.permissions = element.behavior.permissions.filter(permission => !impact.elements.includes(permission.actorId)); }
			}
			candidate.codeMappings = candidate.codeMappings.filter(mapping => !impact.elements.includes(mapping.elementId));
			candidate.verifications = candidate.verifications.filter(verification => !impact.elements.includes(verification.elementId));
			break;
		}
	}
	return undefined;
}
