/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type SemanticModel } from '../../common/modelTypes.js';

/** Independently authored domains: no checkout data, migrated copies or renamed demo graphs. */
export const libraryModel: SemanticModel = {
	version: 3, id: 'library-system', name: 'Biblioteca civica',
	semantics: {
		elements: [
			{ id: 'feature', kind: 'feature', name: 'Prestiti' },
			{ id: 'catalog', kind: 'feature', name: 'Catalogo' },
			{ id: 'agent', kind: 'actor', name: 'Bibliotecaria' },
			{ id: 'interface', kind: 'view', name: 'Sportello', parentId: 'feature' },
			{ id: 'worker', kind: 'controller', name: 'Gestore prestiti', parentId: 'feature', behavior: {
				inputs: [{ name: 'isbn', type: 'ISBN', required: true }], outputs: [], preconditions: ['Tessera attiva'], postconditions: ['Un solo prestito attivo per copia'],
				errors: [{ code: 'unavailable', description: 'Copia non disponibile' }], permissions: [{ actorId: 'agent', capability: 'loans:manage' }],
				acceptanceCriteria: [{ id: 'loan-recorded', given: 'Copia disponibile', when: 'Richiesta approvata', then: 'Prestito registrato' }]
			} },
			{ id: 'catalog-service', kind: 'component', name: 'Indice bibliografico', parentId: 'catalog' },
			{ id: 'resource', kind: 'resource', name: 'Copia', parentId: 'catalog-service' },
			{ id: 'member', kind: 'resource', name: 'Tessera', parentId: 'catalog' },
			{ id: 'contract', kind: 'contract', name: 'Regole del prestito', parentId: 'feature' },
			{ id: 'idle', kind: 'state', name: 'Disponibile', parentId: 'resource' },
			{ id: 'active', kind: 'state', name: 'In prestito', parentId: 'resource' },
			{ id: 'registered', kind: 'state', name: 'Attiva', parentId: 'member' }
		],
		relations: [
			{ id: 'request', kind: 'invocation', from: 'agent', to: 'interface', name: 'Registra prestito' },
			{ id: 'dispatch', kind: 'invocation', from: 'interface', to: 'worker', name: 'Valuta richiesta' },
			{ id: 'update', kind: 'write', from: 'worker', to: 'resource', name: 'Assegna copia', condition: 'Copia disponibile' },
			{ id: 'policy', kind: 'dependency', from: 'worker', to: 'contract', name: 'Applica regole' },
			{ id: 'index', kind: 'read', from: 'catalog-service', to: 'resource', name: 'Indicizza copia' },
			{ id: 'lend-copy', kind: 'transition', from: 'idle', to: 'active', name: 'Consegna', condition: 'Prestito approvato' },
			{ id: 'return-copy', kind: 'transition', from: 'active', to: 'idle', name: 'Restituzione' }
		]
	},
	views: [
		{ id: 'structure', kind: 'structure', name: 'Servizio prestiti', featureId: 'feature', nodes: [
			{ elementId: 'agent', x: 0, y: 0 }, { elementId: 'interface', x: 260, y: 0 }, { elementId: 'worker', x: 520, y: 0 }, { elementId: 'resource', x: 520, y: 180 }
		], relationIds: ['request', 'dispatch', 'update'] },
		{ id: 'states', kind: 'state', name: 'Stati della copia', featureId: 'catalog', nodes: [
			{ elementId: 'resource', x: 0, y: 0 }, { elementId: 'idle', x: 260, y: 0 }, { elementId: 'active', x: 520, y: 0 }
		], relationIds: ['lend-copy', 'return-copy'] },
		{ id: 'empty', kind: 'activity', name: 'Revisione catalogo', featureId: 'catalog', nodes: [], relationIds: [] }
	],
	codeMappings: [], verifications: []
};

/** Reuses local IDs across a different document, with different topology and no diagram at all. */
export const observatoryModel: SemanticModel = {
	version: 3, id: 'observatory-system', name: 'Osservatorio — α Centauri',
	semantics: {
		elements: [
			{ id: 'feature', kind: 'feature', name: 'Acquisizioni notturne' },
			{ id: 'agent', kind: 'actor', name: 'Astronoma' },
			{ id: 'worker', kind: 'component', name: 'Coordinatore', parentId: 'feature' },
			{ id: 'scheduler', kind: 'action', name: 'Pianifica', parentId: 'worker' },
			{ id: 'resource', kind: 'resource', name: 'Esposizione', parentId: 'worker' },
			{ id: 'contract', kind: 'contract', name: 'Vincoli ottici' },
			{ id: 'idle', kind: 'state', name: 'In coda', parentId: 'resource' },
			{ id: 'active', kind: 'state', name: 'Acquisita', parentId: 'resource' },
			{ id: 'isolated', kind: 'resource', name: 'Esposizione' }
		],
		relations: [
			{ id: 'request', kind: 'invocation', from: 'agent', to: 'scheduler', name: 'Prenota sessione' },
			{ id: 'constraints', kind: 'dependency', from: 'scheduler', to: 'contract', name: 'Controlla vincoli' },
			{ id: 'write', kind: 'write', from: 'scheduler', to: 'resource', name: 'Registra immagine' },
			{ id: 'feedback', kind: 'dependency', from: 'worker', to: 'scheduler', name: 'Avvia pianificazione' },
			{ id: 'cycle', kind: 'dependency', from: 'scheduler', to: 'worker', name: 'Consulta coordinatore' },
			{ id: 'capture', kind: 'transition', from: 'idle', to: 'active', name: 'Esposizione completata', condition: 'Segnale sufficiente' }
		]
	},
	views: [], codeMappings: [], verifications: []
};
