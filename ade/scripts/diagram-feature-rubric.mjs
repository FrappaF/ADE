const purchaseName = /\b(?:acquisto|checkout|purchase)\b/i;
const returnsName = /\b(?:return|returns|resi|reso)\b/i;
const orderName = /\b(?:order|orders|ordine|ordini)\b/i;
const sourceFiles = { purchase: 'src/checkout.mjs', returns: 'src/returns.mjs', orders: 'src/orders.mjs' };

/** A human checks semantic claims against these independently specified source facts. */
export const mercatoClaimRubric = [
	{ id: 'quantity-cents', file: sourceFiles.purchase, symbol: 'calculateTotal', critical: true, expected: 'The quantity is an integer from 1 to 10 inclusive. Monetary amounts and totals remain integers in cents, with overflow checked.' },
	{ id: 'approved-save', file: sourceFiles.purchase, symbol: 'checkout', critical: true, expected: 'Only explicitly approved checkout saves an order. Declined checkout returns a status and total without storing the order.' },
	{ id: 'shared-order', file: sourceFiles.orders, symbol: 'createOrderStore', critical: true, expected: 'Checkout and returns use the same order identity and store contract. The fixture uses an in-memory Map and no remote service.' },
	{ id: 'missing-order', file: sourceFiles.returns, symbol: 'requestReturn', critical: true, expected: 'A missing order and an order outside the allowed window are different outcomes.' },
	{ id: 'inclusive-window', file: sourceFiles.returns, symbol: 'requestReturn', critical: true, expected: 'Day 30 is eligible. Later returns are rejected. An eligible result references the existing order and its total as refund cents.' }
];

/** Score protocol completion using persisted tasks and the host's aggregate review. */
export function diagramFeatureChecks(session, review) {
	const tasks = new Map(session.tasks.map(task => [task.id, task]));
	const ready = session.plan?.items.filter(item => tasks.get(item.id)?.status === 'ready') ?? [];
	const planned = session.plan?.items ?? [];
	const completedPlan = planned.every(item => {
		const task = tasks.get(item.id);
		return task?.status === 'ready' && task.proposalId && task.previewedProposalId === task.proposalId || task?.status === 'cancelled' && task.gaps.some(gap => gap.trim());
	});
	const readyProposals = new Set(ready.map(item => tasks.get(item.id).proposalId));
	const expectedViews = new Set();
	for (const proposal of [...session.proposals.filter(proposal => readyProposals.has(proposal.id)), ...session.audit?.proposals ?? []]) {
		for (const patch of proposal.patch.filter(patch => patch.collection === 'views')) {
			if (patch.value === null) { expectedViews.delete(patch.id); }
			else { expectedViews.add(patch.id); }
		}
	}
	const reviewedViews = new Set(review?.data.proposal?.views.map(view => view.id));
	const findings = review?.data.auditReport?.findings;
	return [
		{ id: 'feature-catalog', passed: session.featureWorkflow === true && !!session.featureCatalog?.features.length, observed: session.featureCatalog?.features.length ?? 0 },
		{ id: 'planned-and-previewed', passed: ready.length > 0 && completedPlan, observed: { planned: planned.length, ready: ready.length } },
		{ id: 'audit-completed', passed: !session.auditRequired || findings?.every(finding => !!finding.resolution) === true, observed: { required: !!session.auditRequired, total: findings?.length ?? null, repaired: findings?.filter(finding => !!finding.resolution).length ?? null } },
		{ id: 'aggregate-review', passed: review?.data.phase === 'review' && review?.data.proposal?.status === 'ready' && reviewedViews.size === expectedViews.size && [...expectedViews].every(id => reviewedViews.has(id)), observed: { phase: review?.data.phase ?? null, status: review?.data.proposal?.status ?? null, views: reviewedViews.size, expected: expectedViews.size } },
		{ id: 'unpublished', passed: !session.publication, observed: session.publication?.status ?? null }
	];
}

/** Check graph identities and source associations without pretending to assess free-text claims. */
export function mercatoDiagramChecks(session, review, artifact) {
	const features = session.featureCatalog?.features ?? [];
	const purchase = features.find(feature => purchaseName.test(`${feature.id} ${feature.name}`));
	const returns = features.find(feature => returnsName.test(`${feature.id} ${feature.name}`));
	const views = review?.data.proposal?.views ?? [];
	const purchaseViews = purchase?.elementId ? views.filter(view => view.featureId === purchase.elementId) : [];
	const returnsViews = returns?.elementId ? views.filter(view => view.featureId === returns.elementId) : [];
	const featureOrder = !!purchase && !!returns && features.indexOf(purchase) < features.indexOf(returns) && returns.dependsOn.includes(purchase.id);
	const evidence = new Map(session.evidence.map(anchor => [anchor.id, anchor.file]));
	const hasEvidence = (ids, file) => ids?.some(id => evidence.get(id) === file) ?? false;
	const changed = collection => (artifact?.changes ?? []).filter(change => change.collection === collection && change.after).map(change => change.after);
	const assertions = changed('assertions');
	const evidenced = (kind, id, file) => assertions.some(assertion => assertion.subject.kind === kind && assertion.subject.id === id && hasEvidence(assertion.evidenceIds, file));
	const purchaseNodes = new Set(purchaseViews.flatMap(view => view.nodes.map(node => node.elementId)));
	const returnsNodes = new Set(returnsViews.flatMap(view => view.nodes.map(node => node.elementId)));
	const sharedOrders = changed('elements').filter(element => purchaseNodes.has(element.id) && returnsNodes.has(element.id)
		&& ['resource', 'entity', 'dataStore', 'class', 'component', 'container', 'table'].includes(element.kind)
		&& orderName.test(element.name) && evidenced('element', element.id, sourceFiles.orders)).map(element => element.id);
	const relations = changed('relations');
	const interactions = new Map(changed('interactions').map(interaction => [interaction.id, interaction]));
	const occurrences = new Map(changed('occurrences').map(occurrence => [occurrence.id, occurrence]));
	const sessionAccess = (scopedViews, resource, direction, file, method) => {
		const relationIds = new Set(scopedViews.flatMap(view => view.relationIds));
		return relations.some(relation => relationIds.has(relation.id) && relation.to === resource && relation.kind === direction && evidenced('relation', relation.id, file))
			|| scopedViews.some(view => interactions.get(view.interactionId)?.occurrenceIds.some(id => {
				const occurrence = occurrences.get(id);
				return occurrence?.to === resource && method.test(occurrence.name) && hasEvidence(occurrence.evidenceIds, file);
			}));
	};
	const corroboratedIdentity = sharedOrders.find(id => sessionAccess(purchaseViews, id, 'write', sourceFiles.purchase, /save|stor|salva|registra/i)
		&& sessionAccess(returnsViews, id, 'read', sourceFiles.returns, /get|find|read|cerca|leggi|recupera/i));
	return [
		{ id: 'mercato-two-feature-catalog', passed: features.length === 2 && featureOrder, observed: features.map(feature => ({ id: feature.id, name: feature.name, dependsOn: feature.dependsOn })) },
		{ id: 'mercato-feature-runtime-evidence', passed: hasEvidence(purchase?.evidenceIds, sourceFiles.purchase) && hasEvidence(returns?.evidenceIds, sourceFiles.returns), observed: { purchase: purchase?.evidenceIds.map(id => evidence.get(id)) ?? [], returns: returns?.evidenceIds.map(id => evidence.get(id)) ?? [] } },
		{ id: 'mercato-review-per-feature', passed: purchaseViews.length > 0 && returnsViews.length > 0 && purchase.elementId !== returns.elementId, observed: { purchase: purchaseViews.map(view => view.id), returns: returnsViews.map(view => view.id) } },
		{ id: 'mercato-canonical-order-reuse', passed: !!corroboratedIdentity, observed: { sharedOrders, corroboratedIdentity: corroboratedIdentity ?? null } }
	];
}
