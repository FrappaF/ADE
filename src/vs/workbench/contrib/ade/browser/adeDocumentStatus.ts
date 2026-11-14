/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';

interface DocumentStatus {
	error?: string; saveError?: string; loading: boolean; dirty: boolean; hasDocument: boolean; draft: boolean;
	operation?: string; codeChanged: boolean; readOnly?: boolean;
}

/** File persistence never stands in for validation, verification or successful application. */
export function adeDocumentStatus(state: DocumentStatus): string {
	if (state.error) { return localize('ade.status.unavailable', "Project Could Not Be Opened"); }
	if (state.saveError) { return localize('ade.status.saveFailed', "Changes Could Not Be Saved"); }
	if (state.loading) { return localize('ade.loading', "Loading model…"); }
	if (state.operation) { return state.operation; }
	if (state.dirty) { return localize('ade.unsaved', "Unsaved Model Changes"); }
	if (state.draft) { return localize('ade.status.draft', "Draft Saved · Corrections Required"); }
	if (state.readOnly) { return localize('ade.status.readOnly', "Read-Only Model"); }
	if (state.codeChanged) { return localize('ade.codeNeedsDiagrams', "Code Changed · Review Diagram Evidence"); }
	if (state.hasDocument) { return localize('ade.status.saved', "Model Saved Locally"); }
	return localize('ade.status.ready', "Choose a Project to Begin");
}
