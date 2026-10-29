/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { SemanticModel } from './semanticModel.js';

/** Design intent only: this example makes no claims about implemented or tested code. */
export const checkoutModel: SemanticModel = {
	version: 2,
	id: 'checkout-example',
	name: 'Acquisto',
	semantics: {
		elements: [
			{ id: 'purchase', kind: 'feature', name: 'Conferma acquisto' },
			{ id: 'customer', kind: 'actor', name: 'Cliente' },
			{ id: 'checkout', kind: 'view', name: 'Checkout', parentId: 'purchase' },
			{
				id: 'checkout-controller', kind: 'controller', name: 'Conferma ordine', parentId: 'purchase',
				behavior: {
					inputs: [{ name: 'cartId', type: 'CartId', required: true }],
					outputs: [{ name: 'orderId', type: 'OrderId', required: true }],
					preconditions: ['Il carrello contiene almeno un articolo', 'Il cliente è autenticato'],
					postconditions: ['Un pagamento riuscito conferma un solo ordine'],
					errors: [{ code: 'payment-declined', description: 'Pagamento rifiutato: ordine non confermato' }],
					permissions: [{ actorId: 'customer', capability: 'purchase:own-cart' }],
					acceptanceCriteria: [
						{ id: 'purchase-success', given: 'Carrello valido', when: 'Il pagamento riesce', then: 'Ordine confermato' },
						{ id: 'purchase-declined', given: 'Carrello valido', when: 'Il pagamento è rifiutato', then: 'Errore visibile e nessun ordine confermato' }
					]
				}
			},
			{ id: 'payment', kind: 'action', name: 'Richiedi pagamento', parentId: 'purchase' },
			{ id: 'gateway', kind: 'component', name: 'Servizio pagamenti' },
			{ id: 'payment-contract', kind: 'contract', name: 'Pagamento' },
			{ id: 'cart', kind: 'resource', name: 'Carrello' },
			{ id: 'order', kind: 'resource', name: 'Ordine' },
			{ id: 'pending', kind: 'state', name: 'In attesa', parentId: 'order' },
			{ id: 'confirmed', kind: 'state', name: 'Confermato', parentId: 'order' },
			{ id: 'declined', kind: 'state', name: 'Pagamento rifiutato', parentId: 'order' },
			{ id: 'cart-management', kind: 'feature', name: 'Gestione carrello' },
			{ id: 'review-cart', kind: 'action', name: 'Rivedi carrello', parentId: 'cart-management' },
			{ id: 'cancellation', kind: 'feature', name: 'Annullamento acquisto' },
			{ id: 'cancel-controller', kind: 'controller', name: 'Annulla ordine', parentId: 'cancellation' }
		],
		relations: [
			{ id: 'customer-checkout', kind: 'invocation', from: 'customer', to: 'checkout', name: 'conferma acquisto' },
			{ id: 'checkout-confirm', kind: 'invocation', from: 'checkout', to: 'checkout-controller', name: 'invia' },
			{ id: 'confirm-payment', kind: 'invocation', from: 'checkout-controller', to: 'payment', name: 'richiede pagamento' },
			{ id: 'payment-gateway', kind: 'invocation', from: 'payment', to: 'gateway', name: 'autorizza' },
			{ id: 'payment-realization', kind: 'realization', from: 'payment', to: 'payment-contract', name: 'realizza contratto' },
			{ id: 'confirm-cart', kind: 'read', from: 'checkout-controller', to: 'cart', name: 'legge carrello' },
			{ id: 'confirm-order', kind: 'write', from: 'checkout-controller', to: 'order', name: 'crea ordine', condition: 'pagamento riuscito' },
			{ id: 'confirm-feature', kind: 'realization', from: 'checkout-controller', to: 'purchase', name: 'realizza feature' },
			{ id: 'gateway-contract', kind: 'dependency', from: 'gateway', to: 'payment-contract', name: 'rispetta contratto' },
			{ id: 'order-confirmed', kind: 'transition', from: 'pending', to: 'confirmed', name: 'pagamento riuscito', condition: 'pagamento autorizzato' },
			{ id: 'order-declined', kind: 'transition', from: 'pending', to: 'declined', name: 'pagamento rifiutato', condition: 'pagamento non autorizzato' },
			{ id: 'show-declined', kind: 'invocation', from: 'checkout-controller', to: 'checkout', name: 'mostra errore', errorCode: 'payment-declined' },
			{ id: 'review-reads-cart', kind: 'read', from: 'review-cart', to: 'cart', name: 'legge carrello' },
			{ id: 'customer-cancel', kind: 'invocation', from: 'customer', to: 'cancel-controller', name: 'richiede annullamento' },
			{ id: 'cancel-order', kind: 'write', from: 'cancel-controller', to: 'order', name: 'annulla ordine' }
		]
	},
	views: [{
		id: 'purchase-structure', name: 'Percorso acquisto', kind: 'structure',
		nodes: [
			{ elementId: 'customer', x: 0, y: 0 }, { elementId: 'checkout', x: 260, y: 0 },
			{ elementId: 'checkout-controller', x: 520, y: 0 }, { elementId: 'payment', x: 520, y: 180 },
			{ elementId: 'gateway', x: 780, y: 180 }, { elementId: 'cart', x: 260, y: 180 },
			{ elementId: 'order', x: 780, y: 0 }
		],
		relationIds: ['customer-checkout', 'checkout-confirm', 'confirm-payment', 'payment-gateway', 'confirm-cart', 'confirm-order', 'show-declined']
	}, {
		id: 'purchase-outcome', name: 'Esito pagamento', kind: 'state',
		nodes: [
			{ elementId: 'payment', x: 0, y: 0 }, { elementId: 'pending', x: 260, y: 0 },
			{ elementId: 'confirmed', x: 520, y: 0 }, { elementId: 'declined', x: 520, y: 180 }
		],
		relationIds: ['order-confirmed', 'order-declined']
	}, {
		id: 'cart-structure', name: 'Struttura carrello', kind: 'structure',
		nodes: [{ elementId: 'review-cart', x: 0, y: 0 }, { elementId: 'cart', x: 260, y: 0 }],
		relationIds: ['review-reads-cart']
	}, {
		id: 'cancellation-structure', name: 'Percorso annullamento', kind: 'structure',
		nodes: [
			{ elementId: 'customer', x: 0, y: 0 },
			{ elementId: 'cancel-controller', x: 260, y: 0 },
			{ elementId: 'order', x: 520, y: 0 }
		],
		relationIds: ['customer-cancel', 'cancel-order']
	}],
	codeMappings: [],
	verifications: []
};
