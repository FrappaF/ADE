import { localize } from '../../../../nls.js';

interface DocumentStatus {
	error?: string; saveError?: string; loading: boolean; dirty: boolean; hasDocument: boolean; draft: boolean;
	operation?: string; codeChanged: boolean; readOnly?: boolean;
}

/** File persistence never stands in for validation, verification or successful application. */
export function orditoDocumentStatus(state: DocumentStatus): string {
	if (state.error) { return localize('ordito.status.unavailable', "Project Could Not Be Opened"); }
	if (state.saveError) { return localize('ordito.status.saveFailed', "Changes Could Not Be Saved"); }
	if (state.loading) { return localize('ordito.loading', "Loading model…"); }
	if (state.operation) { return state.operation; }
	if (state.dirty) { return localize('ordito.unsaved', "Unsaved Model Changes"); }
	if (state.draft) { return localize('ordito.status.draft', "Draft Saved · Corrections Required"); }
	if (state.readOnly) { return localize('ordito.status.readOnly', "Read-Only Model"); }
	if (state.codeChanged) { return localize('ordito.codeNeedsDiagrams', "Code Changed · Review Diagram Evidence"); }
	if (state.hasDocument) { return localize('ordito.status.saved', "Model Saved Locally"); }
	return localize('ordito.status.ready', "Choose a Project to Begin");
}
