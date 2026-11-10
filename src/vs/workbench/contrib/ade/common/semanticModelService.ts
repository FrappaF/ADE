/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type SemanticElement, type SemanticModel, type SemanticRelation } from './modelTypes.js';
import { InvalidSemanticModelError, readSemanticDraft, readSemanticModel } from './modelValidation.js';

/** In-memory service consumed by the workbench; persistence belongs to file/editor services. */
export class SemanticModelService {
	private model: SemanticModel;

	constructor(value: unknown) { this.model = this.read(value); }

	private read(value: unknown): SemanticModel {
		const draft = readSemanticDraft(value);
		return (draft.version === 4 || draft.version === 5) ? draft : readSemanticModel(draft);
	}

	getSnapshot(): SemanticModel { return structuredClone(this.model); }

	getElement(id: string): SemanticElement | undefined {
		const element = this.model.semantics.elements.find(element => element.id === id);
		return element && structuredClone(element);
	}

	getRelations(id: string): SemanticRelation[] {
		return structuredClone(this.model.semantics.relations.filter(relation => relation.from === id || relation.to === id));
	}

	/** Validate the whole candidate before atomically replacing the previous snapshot. */
	replace(value: unknown): void { this.model = this.read(value); }

	renameElement(id: string, name: string): void {
		this.editElement(id, element => { element.name = name; });
	}

	moveElement(id: string, parentId: string | undefined): void {
		if ((this.model.version === 4 || this.model.version === 5)) { throw new InvalidSemanticModelError([{ code: 'ownership', severity: 'error', path: '/foundation/ownership', args: [id, 'separateOwnershipAndMembership'] }]); }
		this.editElement(id, element => {
			if (parentId === undefined) {
				delete element.parentId;
			} else {
				element.parentId = parentId;
			}
		});
	}

	setPosition(viewId: string, elementId: string, x: number, y: number): void {
		const candidate = this.getSnapshot();
		const node = candidate.views.find(view => view.id === viewId)?.nodes.find(node => node.elementId === elementId);
		if (!node) {
			throw new InvalidSemanticModelError([{ code: 'missingReference', severity: 'error', path: '/views', args: [viewId, elementId] }]);
		}
		node.x = x;
		node.y = y;
		this.replace(candidate);
	}

	private editElement(id: string, edit: (element: SemanticElement) => void): void {
		const candidate = this.getSnapshot();
		const element = candidate.semantics.elements.find(element => element.id === id);
		if (!element) {
			throw new InvalidSemanticModelError([{ code: 'missingReference', severity: 'error', path: '/semantics/elements', args: [id] }]);
		}
		edit(element);
		this.replace(candidate);
	}
}
