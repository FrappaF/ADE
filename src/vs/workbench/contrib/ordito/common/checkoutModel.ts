import { type SemanticModel } from './modelTypes.js';

/** Design intent only: this example makes no claims about implemented or tested code. */
export const checkoutModel: SemanticModel = {
	version: 2,
	id: 'checkout-example',
	name: 'Checkout',
	semantics: {
		elements: [
			{ id: 'purchase', kind: 'feature', name: 'Confirm Purchase' },
			{ id: 'customer', kind: 'actor', name: 'Customer' },
			{ id: 'checkout', kind: 'view', name: 'Checkout', parentId: 'purchase' },
			{
				id: 'checkout-controller', kind: 'controller', name: 'Confirm Order', parentId: 'purchase',
				behavior: {
					inputs: [{ name: 'cartId', type: 'CartId', required: true }],
					outputs: [{ name: 'orderId', type: 'OrderId', required: true }],
					preconditions: ['The cart contains at least one item', 'The customer is signed in'],
					postconditions: ['A successful payment confirms exactly one order'],
					errors: [{ code: 'payment-declined', description: 'Payment declined: order was not confirmed' }],
					permissions: [{ actorId: 'customer', capability: 'purchase:own-cart' }],
					acceptanceCriteria: [
						{ id: 'purchase-success', given: 'Valid cart', when: 'The payment succeeds', then: 'Order Confirmed' },
						{ id: 'purchase-declined', given: 'Valid cart', when: 'The payment is declined', then: 'An error is shown and no order is confirmed' }
					]
				}
			},
			{ id: 'payment', kind: 'action', name: 'Request Payment', parentId: 'purchase' },
			{ id: 'gateway', kind: 'component', name: 'Payment Service' },
			{ id: 'payment-contract', kind: 'contract', name: 'Payment' },
			{ id: 'cart', kind: 'resource', name: 'Cart' },
			{ id: 'order', kind: 'resource', name: 'Order' },
			{ id: 'pending', kind: 'state', name: 'Pending', parentId: 'order' },
			{ id: 'confirmed', kind: 'state', name: 'Confirmed', parentId: 'order' },
			{ id: 'declined', kind: 'state', name: 'Payment Declined', parentId: 'order' },
			{ id: 'cart-management', kind: 'feature', name: 'Cart Management' },
			{ id: 'review-cart', kind: 'action', name: 'Review Cart', parentId: 'cart-management' },
			{ id: 'cancellation', kind: 'feature', name: 'Cancel Purchase' },
			{ id: 'cancel-controller', kind: 'controller', name: 'Cancel Order', parentId: 'cancellation' }
		],
		relations: [
			{ id: 'customer-checkout', kind: 'invocation', from: 'customer', to: 'checkout', name: 'confirms purchase' },
			{ id: 'checkout-confirm', kind: 'invocation', from: 'checkout', to: 'checkout-controller', name: 'submits' },
			{ id: 'confirm-payment', kind: 'invocation', from: 'checkout-controller', to: 'payment', name: 'requests payment' },
			{ id: 'payment-gateway', kind: 'invocation', from: 'payment', to: 'gateway', name: 'authorizes' },
			{ id: 'payment-realization', kind: 'realization', from: 'payment', to: 'payment-contract', name: 'implements contract' },
			{ id: 'confirm-cart', kind: 'read', from: 'checkout-controller', to: 'cart', name: 'reads cart' },
			{ id: 'confirm-order', kind: 'write', from: 'checkout-controller', to: 'order', name: 'creates order', condition: 'payment succeeds' },
			{ id: 'confirm-feature', kind: 'realization', from: 'checkout-controller', to: 'purchase', name: 'implements feature' },
			{ id: 'gateway-contract', kind: 'dependency', from: 'gateway', to: 'payment-contract', name: 'follows contract' },
			{ id: 'order-confirmed', kind: 'transition', from: 'pending', to: 'confirmed', name: 'payment succeeds', condition: 'payment authorized' },
			{ id: 'order-declined', kind: 'transition', from: 'pending', to: 'declined', name: 'payment declined', condition: 'payment not authorized' },
			{ id: 'show-declined', kind: 'invocation', from: 'checkout-controller', to: 'checkout', name: 'shows error', errorCode: 'payment-declined' },
			{ id: 'review-reads-cart', kind: 'read', from: 'review-cart', to: 'cart', name: 'reads cart' },
			{ id: 'customer-cancel', kind: 'invocation', from: 'customer', to: 'cancel-controller', name: 'requests cancellation' },
			{ id: 'cancel-order', kind: 'write', from: 'cancel-controller', to: 'order', name: 'cancels order' }
		]
	},
	views: [{
		id: 'purchase-structure', name: 'Checkout Structure', kind: 'structure',
		nodes: [
			{ elementId: 'customer', x: 0, y: 0 }, { elementId: 'checkout', x: 260, y: 0 },
			{ elementId: 'checkout-controller', x: 520, y: 0 }, { elementId: 'payment', x: 520, y: 180 },
			{ elementId: 'gateway', x: 780, y: 180 }, { elementId: 'cart', x: 260, y: 180 },
			{ elementId: 'order', x: 780, y: 0 }
		],
		relationIds: ['customer-checkout', 'checkout-confirm', 'confirm-payment', 'payment-gateway', 'confirm-cart', 'confirm-order', 'show-declined']
	}, {
		id: 'purchase-outcome', name: 'Payment Outcome', kind: 'state',
		nodes: [
			{ elementId: 'payment', x: 0, y: 0 }, { elementId: 'pending', x: 260, y: 0 },
			{ elementId: 'confirmed', x: 520, y: 0 }, { elementId: 'declined', x: 520, y: 180 }
		],
		relationIds: ['order-confirmed', 'order-declined']
	}, {
		id: 'cart-structure', name: 'Cart Structure', kind: 'structure',
		nodes: [{ elementId: 'review-cart', x: 0, y: 0 }, { elementId: 'cart', x: 260, y: 0 }],
		relationIds: ['review-reads-cart']
	}, {
		id: 'cancellation-structure', name: 'Cancellation Flow', kind: 'structure',
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
