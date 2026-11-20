import { emptyFoundation } from '../../common/modelFoundation.js';
import { type SemanticModel } from '../../common/modelTypes.js';

/** Real model shapes for interaction tests and large, deterministic atlas regressions. */
export function createAtlasFixture(options: { version?: 3 | 4; actors?: number; features?: number; members?: number; shared?: number; areas?: number; hub?: boolean } = {}): SemanticModel {
	const config = { version: 3, actors: 8, features: 24, members: 20, shared: 48, areas: 12, ...options };
	const model: SemanticModel = config.version === 4
		? { version: 4, id: 'atlas-test', name: 'Commerce Platform', semantics: { elements: [], relations: [] }, views: [], codeMappings: [], verifications: [], foundation: emptyFoundation() }
		: { version: 3, id: 'atlas-test', name: 'Commerce Platform', semantics: { elements: [], relations: [] }, views: [], codeMappings: [], verifications: [] };
	const { elements, relations } = model.semantics;
	for (let i = 0; i < config.areas; i++) { elements.push({ id: `area-${i}`, kind: 'container', name: i === 0 ? 'Ordini' : `Area ${i}` }); }
	for (let i = 0; i < config.actors; i++) { elements.push({ id: `actor-${i}`, kind: 'actor', name: i === 0 ? 'Customer' : `Operatore ${i}` }); }
	for (let i = 0; i < config.shared; i++) { elements.push({ id: `shared-${i}`, kind: 'resource', name: `Registro ${i}` }); }
	for (let i = 0; i < config.features; i++) {
		const featureId = `feature-${i}`;
		elements.push({ id: featureId, kind: 'feature', name: i === 17 || i === 29 ? 'Verifica disponibilità' : `Conferma operazione ${i}`, ...(config.version === 3 && config.areas ? { parentId: `area-${i % config.areas}` } : {}) });
		const count = config.hub && i === 0 ? 5000 : config.members;
		for (let j = 0; j < count; j++) {
			const id = `element-${i}-${j}`;
			elements.push({ id, kind: j === 0 ? 'controller' : 'action', name: j === 0 ? `Gestore ${i}` : `Passaggio ${j}`, ...(config.version === 3 ? { parentId: featureId } : {}) });
			if (model.version === 4) { model.foundation.memberships.push({ id: `membership-${i}-${j}`, featureId, elementId: id }); }
			if (j) { relations.push({ id: `step-${i}-${j}`, kind: 'invocation', from: `element-${i}-${j - 1}`, to: id, name: 'Passaggio dichiarato' }); }
		}
		for (let j = 0; j < (config.hub && i === 0 ? config.actors : Math.min(4, config.actors)); j++) {
			relations.push({ id: `actor-link-${i}-${j}`, kind: 'invocation', from: `actor-${(i * 7 + j * 13) % config.actors}`, to: `element-${i}-0`, name: 'Avvia operazione' });
		}
		for (let j = 0; j < (config.hub && i === 0 ? config.shared : Math.min(6, config.shared)); j++) {
			relations.push({ id: `shared-link-${i}-${j}`, kind: 'read', from: `element-${i}-0`, to: `shared-${(i * 11 + j * 17) % config.shared}`, name: 'Legge registro', ...(i === 0 && j === 0 ? { condition: 'Accesso autorizzato', errorCode: 'access-denied' } : {}) });
		}
		model.views.push({ id: `diagram-${i}`, featureId, kind: 'structure', name: `Struttura ${i}`, nodes: [], relationIds: [] });
	}
	return model;
}
