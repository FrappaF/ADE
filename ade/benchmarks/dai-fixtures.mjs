/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Fixed graph topology shared by baseline and future candidates; no random IDs or source paths. */
export function createDaiGraph(size) {
	const elements = [{ id: 'feature.checkout', kind: 'feature', name: 'Checkout' }];
	for (let index = 1; index < size; index++) {
		elements.push({ id: `component.${index}`, kind: 'component', name: `Responsibility ${index}`, parentId: 'feature.checkout' });
	}
	const relations = elements.slice(2).map((element, index) => ({ id: `dependency.${index + 1}`, kind: 'dependency', from: `component.${index + 1}`, to: element.id, name: 'requires' }));
	return {
		version: 3, id: `dai-scale-${size}`, name: 'DAI fixed dependency chain', semantics: { elements, relations },
		views: [{ id: 'view.checkout', featureId: 'feature.checkout', name: 'Checkout', kind: 'structure', nodes: elements.slice(1).map((element, index) => ({ elementId: element.id, x: index % 16 * 240, y: Math.floor(index / 16) * 160 })), relationIds: relations.map(relation => relation.id) }],
		codeMappings: [], verifications: []
	};
}

/** Two overlapping UTF-16 windows per source file, including non-ASCII text to distinguish bytes. */
export function createDaiEvidence(size) {
	return Array.from({ length: size - 1 }, (_, index) => {
		const text = `export function confirm${index}(approved) { /* acquisto · € */ return approved ? 'paid' : 'declined'; }\n`;
		const file = `checkout/part-${index}.mjs`;
		return [
			{ ref: `unit.${index}.file`, file, language: 'javascript', name: file, start: 0, end: text.length, text },
			{ ref: `unit.${index}.declaration`, id: `symbol.${index}`, file, language: 'javascript', name: `confirm${index}`, start: 7, end: text.length, text: text.slice(7) }
		];
	}).flat();
}
