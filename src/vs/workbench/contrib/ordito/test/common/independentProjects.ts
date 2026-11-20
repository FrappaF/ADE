import { type SemanticModel } from '../../common/modelTypes.js';

/** Independently authored domains: no checkout data, migrated copies or renamed demo graphs. */
export const libraryModel: SemanticModel = {
	version: 3, id: 'library-system', name: 'Public Library',
	semantics: {
		elements: [
			{ id: 'feature', kind: 'feature', name: 'Loans' },
			{ id: 'catalog', kind: 'feature', name: 'Catalog' },
			{ id: 'agent', kind: 'actor', name: 'Librarian' },
			{ id: 'interface', kind: 'view', name: 'Service Desk', parentId: 'feature' },
			{ id: 'worker', kind: 'controller', name: 'Loan Controller', parentId: 'feature', behavior: {
				inputs: [{ name: 'isbn', type: 'ISBN', required: true }], outputs: [], preconditions: ['Active library card'], postconditions: ['Only one active loan per copy'],
				errors: [{ code: 'unavailable', description: 'Copy unavailable' }], permissions: [{ actorId: 'agent', capability: 'loans:manage' }],
				acceptanceCriteria: [{ id: 'loan-recorded', given: 'Copy available', when: 'Request approved', then: 'Loan recorded' }]
			} },
			{ id: 'catalog-service', kind: 'component', name: 'Bibliographic Index', parentId: 'catalog' },
			{ id: 'resource', kind: 'resource', name: 'Copy', parentId: 'catalog-service' },
			{ id: 'member', kind: 'resource', name: 'Library Card', parentId: 'catalog' },
			{ id: 'contract', kind: 'contract', name: 'Loan Policy', parentId: 'feature' },
			{ id: 'idle', kind: 'state', name: 'Available', parentId: 'resource' },
			{ id: 'active', kind: 'state', name: 'On Loan', parentId: 'resource' },
			{ id: 'registered', kind: 'state', name: 'Active', parentId: 'member' }
		],
		relations: [
			{ id: 'request', kind: 'invocation', from: 'agent', to: 'interface', name: 'Records Loan' },
			{ id: 'dispatch', kind: 'invocation', from: 'interface', to: 'worker', name: 'Reviews Request' },
			{ id: 'update', kind: 'write', from: 'worker', to: 'resource', name: 'Assigns Copy', condition: 'Copy available' },
			{ id: 'policy', kind: 'dependency', from: 'worker', to: 'contract', name: 'Applies Policy' },
			{ id: 'index', kind: 'read', from: 'catalog-service', to: 'resource', name: 'Indexes Copy' },
			{ id: 'lend-copy', kind: 'transition', from: 'idle', to: 'active', name: 'Checks Out Copy', condition: 'Loan approved' },
			{ id: 'return-copy', kind: 'transition', from: 'active', to: 'idle', name: 'Returns Copy' }
		]
	},
	views: [
		{ id: 'structure', kind: 'structure', name: 'Loan Service', featureId: 'feature', nodes: [
			{ elementId: 'agent', x: 0, y: 0 }, { elementId: 'interface', x: 260, y: 0 }, { elementId: 'worker', x: 520, y: 0 }, { elementId: 'resource', x: 520, y: 180 }
		], relationIds: ['request', 'dispatch', 'update'] },
		{ id: 'states', kind: 'state', name: 'Copy States', featureId: 'catalog', nodes: [
			{ elementId: 'resource', x: 0, y: 0 }, { elementId: 'idle', x: 260, y: 0 }, { elementId: 'active', x: 520, y: 0 }
		], relationIds: ['lend-copy', 'return-copy'] },
		{ id: 'empty', kind: 'activity', name: 'Catalog Review', featureId: 'catalog', nodes: [], relationIds: [] }
	],
	codeMappings: [], verifications: []
};

/** Reuses local IDs across a different document, with different topology and no diagram at all. */
export const observatoryModel: SemanticModel = {
	version: 3, id: 'observatory-system', name: 'Observatory — α Centauri',
	semantics: {
		elements: [
			{ id: 'feature', kind: 'feature', name: 'Nighttime Observations' },
			{ id: 'agent', kind: 'actor', name: 'Astronomer' },
			{ id: 'worker', kind: 'component', name: 'Coordinator', parentId: 'feature' },
			{ id: 'scheduler', kind: 'action', name: 'Schedule Observation', parentId: 'worker' },
			{ id: 'resource', kind: 'resource', name: 'Exposure', parentId: 'worker' },
			{ id: 'contract', kind: 'contract', name: 'Optical Constraints' },
			{ id: 'idle', kind: 'state', name: 'Queued', parentId: 'resource' },
			{ id: 'active', kind: 'state', name: 'Captured', parentId: 'resource' },
			{ id: 'isolated', kind: 'resource', name: 'Exposure' }
		],
		relations: [
			{ id: 'request', kind: 'invocation', from: 'agent', to: 'scheduler', name: 'Books Session' },
			{ id: 'constraints', kind: 'dependency', from: 'scheduler', to: 'contract', name: 'Checks Constraints' },
			{ id: 'write', kind: 'write', from: 'scheduler', to: 'resource', name: 'Records Image' },
			{ id: 'feedback', kind: 'dependency', from: 'worker', to: 'scheduler', name: 'Starts Scheduling' },
			{ id: 'cycle', kind: 'dependency', from: 'scheduler', to: 'worker', name: 'Consults Coordinator' },
			{ id: 'capture', kind: 'transition', from: 'idle', to: 'active', name: 'Exposure Complete', condition: 'Sufficient signal' }
		]
	},
	views: [], codeMappings: [], verifications: []
};
