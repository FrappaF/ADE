/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { describeAdeDiagram, describeAdeHelp, AdeReadingState } from '../../browser/adeAccessibleContent.js';
import { checkoutModel } from '../../common/checkoutModel.js';

suite('A.D.E accessible content', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	function state(overrides: Partial<AdeReadingState> = {}): AdeReadingState {
		return { model: checkoutModel, activeView: checkoutModel.views[1], selectedId: 'declined', section: 'diagram',
			loading: false, error: undefined, saveError: undefined, dirty: false, editable: false, diagnostics: [], ...overrides };
	}

	test('reads diagram identities, both payment outcomes and the current selection without inferring execution', () => {
		const content = describeAdeDiagram(state());
		for (const expected of ['Diagram: Esito pagamento', 'Feature: Conferma acquisto', 'Elements in This Diagram: 4', 'Relationships in This Diagram: 2',
			'Condition: pagamento autorizzato', 'Condition: pagamento non autorizzato', 'Selected Element: Pagamento rifiutato', 'Read-only', 'not execution results']) {
			assert.ok(content.includes(expected), expected);
		}
		assert.ok(!content.includes('legge carrello'));
	});

	test('distinguishes additional relationships of a shared selection from relationships drawn in the view', () => {
		const content = describeAdeDiagram(state({ selectedId: 'payment' }));
		assert.match(content, /Other Relationships of the Selected Element, Not Shown in This Diagram:/);
		assert.match(content, /Conferma ordine to Richiedi pagamento/);
		assert.match(content, /Relationships in This Diagram: 2/);
	});

	test('loading, invalid documents and Home never expose the previous diagram as current', () => {
		const reading = [describeAdeDiagram(state({ loading: true })), describeAdeDiagram(state({ error: 'Invalid document' })), describeAdeDiagram(state({ section: 'home' }))];
		assert.deepStrictEqual(reading.map(content => ({ stale: content.includes('Esito pagamento'), selected: content.includes('Selected Element:') })),
			[{ stale: false, selected: false }, { stale: false, selected: false }, { stale: false, selected: false }]);
		assert.ok(reading[1].includes('Invalid document'));
	});

	test('empty feature diagrams keep their owner and reading never mutates the model', () => {
		const model = structuredClone(checkoutModel);
		model.version = 3;
		const view = { id: 'empty', featureId: 'purchase', name: 'Empty Flow', kind: 'activity' as const, nodes: [], relationIds: [] };
		model.views.push(view);
		const before = JSON.stringify(model);
		const content = describeAdeDiagram(state({ model, activeView: view, editable: true, selectedId: 'declined' }));
		assert.deepStrictEqual({ owner: content.includes('Feature: Conferma acquisto'), empty: content.includes('This diagram has no elements.'), staleSelection: content.includes('Selected Element:'), unchanged: JSON.stringify(model) === before },
			{ owner: true, empty: true, staleSelection: false, unchanged: true });
	});

	test('selected behavior, source evidence and save errors reflect the supplied document', () => {
		const model = structuredClone(checkoutModel);
		model.codeMappings.push({ id: 'mapping', elementId: 'checkout-controller', file: 'src/checkout.ts', symbol: 'confirm', revision: 'test-revision' });
		model.verifications.push({ id: 'verification', elementId: 'checkout-controller', criterionId: model.semantics.elements.find(element => element.id === 'checkout-controller')!.behavior!.acceptanceCriteria[0].id, outcome: 'unknown', evidence: 'Declared test fixture', revision: 'test-revision' });
		const content = describeAdeDiagram(state({ model, activeView: model.views[0], selectedId: 'checkout-controller', editable: true, dirty: true, saveError: 'Save conflict', diagnostics: ['Legacy classification warning'] }));
		for (const expected of ['Input: cartId (CartId), Required', 'Output: orderId (OrderId), Required', 'Authorization: Cliente, purchase:own-cart', 'Code mappings: 1. Verification records: 1.', 'Unsaved Changes', 'Save conflict', 'Legacy classification warning']) {
			assert.ok(content.includes(expected), expected);
		}
	});

	test('element details read unplaced contracts without inventing a diagram', () => {
		const content = describeAdeDiagram(state({ section: 'element', selectedId: 'payment-contract' }));
		assert.deepStrictEqual({ details: content.includes('Element Details: Pagamento'), unplaced: content.includes('not placed in a diagram'), related: content.includes('Related Relationships: 2'), staleDiagram: content.includes('Diagram: Esito pagamento') },
			{ details: true, unplaced: true, related: true, staleDiagram: false });
	});

	test('sequence reading preserves participant and message order and identifies unsupported relationships', () => {
		const model = structuredClone(checkoutModel);
		const view = { id: 'sequence', name: 'Purchase Sequence', kind: 'sequence' as const, nodes: [...model.views[0].nodes].reverse(), relationIds: ['show-declined', 'checkout-confirm', 'confirm-order'] };
		model.views.push(view);
		const content = describeAdeDiagram(state({ model, activeView: view, selectedId: 'checkout-controller' }));
		assert.deepStrictEqual({ declared: content.includes('not observed execution'), firstParticipant: content.includes('1. Ordine (Resource)'), orderedMessages: content.indexOf('mostra errore') < content.indexOf('invia'), condition: content.includes('Condition: pagamento riuscito'), error: content.includes('Error: payment-declined'), contract: content.includes('Input: cartId (CartId), Required') },
			{ declared: true, firstParticipant: true, orderedMessages: true, condition: true, error: true, contract: true });
		view.relationIds.push('confirm-feature');
		view.nodes.push({ elementId: 'purchase', x: 0, y: 0 });
		assert.ok(describeAdeDiagram(state({ model, activeView: view })).includes('Not Rendered as a Sequence Message:'));
	});

	test('state reading names resource ownership and events while preserving historical context', () => {
		const content = describeAdeDiagram(state());
		assert.deepStrictEqual({ resource: content.includes('Resource: Ordine. Visible states: 3 of 3. Visible transitions: 2.'), ownership: content.includes('State In attesa belongs to resource Ordine.'), context: content.includes('Additional context: 1 elements and 0 relationships'), event: content.includes('Transition Event: pagamento riuscito'), guard: content.includes('Condition: pagamento autorizzato'), intent: content.includes('no initial or final state is inferred') },
			{ resource: true, ownership: true, context: true, event: true, guard: true, intent: true });
	});

	test('help distinguishes read-only navigation from editing and uses resolvable command keybindings', () => {
		const readOnly = describeAdeHelp(state());
		const editable = describeAdeHelp(state({ editable: true }));
		assert.deepStrictEqual({ readOnly: readOnly.includes('Editing is unavailable'), movable: readOnly.includes('Arrow keys move the focused element'), editable: editable.includes('Arrow keys move the focused element'), nativeSave: editable.includes('<keybinding:workbench.action.files.save>'), nativeReading: editable.includes('<keybinding:editor.action.accessibleView>') },
			{ readOnly: true, movable: false, editable: true, nativeSave: true, nativeReading: true });
	});

	test('system map reads hierarchy, unplaced elements and all relationship conditions without a stale diagram', () => {
		const content = describeAdeDiagram(state({ section: 'map' }));
		assert.deepStrictEqual({ map: content.includes('System Map.'), hierarchy: content.includes('parent: Conferma acquisto'), contract: content.includes('Pagamento (Contract)'), condition: content.includes('Condition: pagamento non autorizzato'), stale: content.includes('Selected Element:') || content.includes('Diagram: Esito pagamento') },
			{ map: true, hierarchy: true, contract: true, condition: true, stale: false });
		assert.ok(!describeAdeDiagram(state({ section: 'map', loading: true })).includes('Group:'));
	});
});
