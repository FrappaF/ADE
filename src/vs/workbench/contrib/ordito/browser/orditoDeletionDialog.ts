import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { localize } from '../../../../nls.js';
import { type IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { deletionCollections, type DeletionCollection, type DeletionPreview, type DeletionChange } from '../common/deletionPreview.js';
import { type ModelView, type SemanticModel } from '../common/modelTypes.js';
import { elementLabels, relationLabels, viewLabels } from './orditoLabels.js';
import { diagnosticMessage } from './orditoDiagnostics.js';

const collectionLabels: Record<DeletionCollection, string> = {
	elements: localize('ordito.deletion.elements', "Elements"), relations: localize('ordito.deletion.relations', "Relationships"), views: localize('ordito.deletion.views', "Diagrams"),
	codeMappings: localize('ordito.deletion.mappings', "Code References"), verifications: localize('ordito.deletion.verifications', "Verification Records"),
	ownership: localize('ordito.deletion.ownership', "Ownership"), memberships: localize('ordito.deletion.memberships', "Feature Memberships"), integrations: localize('ordito.deletion.integrations', "Integrations"),
	occurrences: localize('ordito.deletion.occurrences', "Interaction Occurrences"), frames: localize('ordito.deletion.frames', "Interaction Frames"), interactions: localize('ordito.deletion.interactions', "Interactions"),
	assertions: localize('ordito.deletion.assertions', "Assertions"), stateMachines: localize('ordito.deletion.stateMachines', "State Machines"), bindings: localize('ordito.deletion.bindings', "Platform Bindings"), migration: localize('ordito.deletion.migration', "Migration References")
};

function appendText(markdown: MarkdownString, text: string): void {
	markdown.appendMarkdown(new MarkdownString().appendText(text.replace(/\s+/g, ' ')).value.replaceAll('&nbsp;', ' '));
}

function changeDescription(model: SemanticModel, change: DeletionChange): string {
	const name = (id: string) => model.semantics.elements.find(element => element.id === id)?.name ?? id;
	switch (change.collection) {
		case 'elements': { const element = model.semantics.elements.find(element => element.id === change.id)!; return localize('ordito.deletion.element', "{0} · {1}", element.name, elementLabels[element.kind]); }
		case 'relations': { const relation = model.semantics.relations.find(relation => relation.id === change.id)!; return localize('ordito.deletion.relation', "{0} → {1} · {2} · {3}", name(relation.from), name(relation.to), relation.name, relationLabels[relation.kind]); }
		case 'views': { const view = model.views.find(view => view.id === change.id)!; return localize('ordito.deletion.view', "{0} · {1}", view.name, viewLabels[view.kind]); }
		case 'codeMappings': { const mapping = model.codeMappings.find(mapping => mapping.id === change.id)!; return localize('ordito.deletion.mapping', "{0} · {1} · {2}", mapping.file, mapping.symbol, name(mapping.elementId)); }
		case 'verifications': { const record = model.verifications.find(record => record.id === change.id)!; return localize('ordito.deletion.verification', "{0} · {1} · {2}", name(record.elementId), record.criterionId, record.evidence); }
		default: {
			const references = Object.entries(change.before).filter(([key, value]) => key !== 'id' && typeof value === 'string');
			return references.map(([, value]) => name(String(value))).join(' · ') || change.id;
		}
	}
}

/** Compact, truthful counts; owned diagrams are distinct from diagrams that remain. */
export function deletionSummary(preview: DeletionPreview): MarkdownString {
	const removedViews = preview.changes.filter(change => change.collection === 'views' && !change.after).length;
	const updatedViews = preview.changes.filter(change => change.collection === 'views' && change.after).length;
	const markdown = new MarkdownString();
	const lines = [
		localize('ordito.deletion.removeCount', "Elements to delete: {0} · Relationships to remove: {1}", preview.impact.elements.length, preview.impact.relations.length),
		localize('ordito.deletion.diagramCount', "Diagrams to delete: {0} · Diagrams to update: {1}", removedViews, updatedViews),
		localize('ordito.deletion.referenceCount', "Code references: {0} · Verification records: {1} · Authorization references: {2}", preview.impact.mappings, preview.impact.verifications, preview.impact.permissions)
	];
	const other = preview.changes.filter(change => !['elements', 'relations', 'views', 'codeMappings', 'verifications'].includes(change.collection)).length;
	if (other) { lines.push(localize('ordito.deletion.otherCount', "Other model references to update or remove: {0}", other)); }
	if (preview.referencesToReview.length) { lines.push(localize('ordito.deletion.reviewCount', "Retained references requiring correction after deletion: {0}", preview.referencesToReview.length)); }
	for (const line of lines) { markdown.appendMarkdown('- '); appendText(markdown, line); markdown.appendMarkdown('\n'); }
	markdown.appendMarkdown('\n'); appendText(markdown, localize('ordito.deletion.scope', "Changes apply to this model across all diagrams. Source files are kept. You can undo this deletion in the editor."));
	return markdown;
}

/** Every changed record is listed by name and stable identity, with removed/updated status. */
export function deletionDetails(preview: DeletionPreview): MarkdownString {
	const markdown = new MarkdownString();
	for (const collection of deletionCollections) {
		const changes = preview.changes.filter(change => change.collection === collection);
		if (!changes.length) { continue; }
		markdown.appendMarkdown('### '); appendText(markdown, localize('ordito.deletion.section', "{0} ({1})", collectionLabels[collection], changes.length)); markdown.appendMarkdown('\n\n');
		for (const change of changes) {
			markdown.appendMarkdown('- **'); appendText(markdown, changeDescription(preview.model, change).replace(/\s+/g, ' ')); markdown.appendMarkdown('**  \n');
			appendText(markdown, change.after ? localize('ordito.deletion.updated', "Updated · {0}", change.id) : localize('ordito.deletion.removed', "Deleted · {0}", change.id)); markdown.appendMarkdown('\n\n');
			if (change.collection === 'views') {
				const view = preview.model.views.find(view => view.id === change.id)!;
				const next = change.after as ModelView | undefined;
				const elements = view.nodes.filter(node => !next?.nodes.some(current => current.elementId === node.elementId)).map(node => preview.model.semantics.elements.find(element => element.id === node.elementId)?.name ?? node.elementId);
				const relations = view.relationIds.filter(id => !next?.relationIds.includes(id)).map(id => preview.model.semantics.relations.find(relation => relation.id === id)?.name || id);
				if (elements.length) { markdown.appendMarkdown('  '); appendText(markdown, localize('ordito.deletion.placements', "Element placements removed: {0}", elements.join(', '))); markdown.appendMarkdown('\n\n'); }
				if (relations.length) { markdown.appendMarkdown('  '); appendText(markdown, localize('ordito.deletion.connections', "Relationship placements removed: {0}", relations.join(', '))); markdown.appendMarkdown('\n\n'); }
			}
		}
	}
	const removed = new Set(preview.impact.elements);
	const permissions = preview.model.semantics.elements.flatMap(element => (element.behavior?.permissions ?? []).filter(permission => removed.has(element.id) || removed.has(permission.actorId)).map(permission => ({ element, permission })));
	if (permissions.length) {
		markdown.appendMarkdown('### '); appendText(markdown, localize('ordito.deletion.permissions', "Authorization References ({0})", permissions.length)); markdown.appendMarkdown('\n\n');
		for (const { element, permission } of permissions) {
			markdown.appendMarkdown('- '); appendText(markdown, localize('ordito.deletion.permission', "{0} · {1} · Actor: {2}", element.name, permission.capability, preview.model.semantics.elements.find(actor => actor.id === permission.actorId)?.name ?? permission.actorId)); markdown.appendMarkdown('\n');
		}
	}
	if (preview.referencesToReview.length) {
		markdown.appendMarkdown('### '); appendText(markdown, localize('ordito.deletion.reviewReferences', "References Requiring Review ({0})", preview.referencesToReview.length)); markdown.appendMarkdown('\n\n');
		appendText(markdown, localize('ordito.deletion.reviewReferencesHint', "These records are kept and will refer to deleted items. Correct their references after deletion or cancel to keep the current model.")); markdown.appendMarkdown('\n\n');
		for (const diagnostic of preview.referencesToReview) { markdown.appendMarkdown('- '); appendText(markdown, diagnosticMessage(diagnostic)); markdown.appendMarkdown('\n'); }
	}
	return markdown;
}

/** Details never authorize deletion; returning always requires a separate explicit choice. */
export async function confirmOrditoDeletion(dialogs: IDialogService, name: string, preview: DeletionPreview, isCurrent: () => boolean): Promise<boolean> {
	while (isCurrent()) {
		const { result } = await dialogs.prompt<'details' | 'delete'>({
			type: 'warning', message: localize('ordito.deleteElement', "Delete {0} from the System?", name),
			detail: localize('ordito.deletion.intro', "Review the impact across the system before deleting."),
			custom: { classes: ['ordito-deletion-dialog'], markdownDetails: [{ markdown: deletionSummary(preview), classes: ['ordito-deletion-summary'] }] },
			buttons: [{ label: localize('ordito.deletion.details', "Details"), run: () => 'details' }, { label: localize('ordito.delete', "Delete"), run: () => 'delete' }], cancelButton: true
		});
		if (!isCurrent()) { break; }
		if (result !== 'details') { return result === 'delete'; }
		await dialogs.prompt({
			type: 'info', message: localize('ordito.deletion.detailsTitle', "Deletion Details · {0}", name),
			detail: localize('ordito.deletion.detailsHint', "Deleted items are removed from the model. Updated items remain with their affected references removed."),
			custom: { classes: ['ordito-deletion-dialog', 'ordito-deletion-details'], markdownDetails: [{ markdown: deletionDetails(preview), classes: ['ordito-deletion-report'] }] },
			cancelButton: localize('ordito.deletion.back', "Back")
		});
	}
	await dialogs.info(localize('ordito.deletion.stale', "The project changed while you reviewed the deletion. Nothing was deleted. Open Delete from the System again to review the current impact."));
	return false;
}
