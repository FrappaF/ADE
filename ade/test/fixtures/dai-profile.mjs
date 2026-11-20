// Independent capability declaration for domain tests, never a production generator or chosen stack.
export const fixtureProfile = {
	id: 'fixture.spec', revision: 'fixture.1', archetype: 'specification-test-only',
	elementKinds: ['system', 'container', 'component', 'feature', 'actor', 'contract'],
	primitiveTypes: ['string', 'integer', 'boolean'], technologies: ['fixture-runtime'],
	requiredTechnologyKinds: ['container'], requiredOwnershipKinds: ['container', 'component'], structuredInteractions: true
};
