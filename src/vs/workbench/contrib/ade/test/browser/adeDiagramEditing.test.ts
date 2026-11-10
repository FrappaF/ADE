/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IQuickInputService, type IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { runAdeDiagramCommand } from '../../browser/adeEditingDiagram.js';
import { type AdeEditingContext } from '../../browser/adeEditingContext.js';
import { AdeProjectService } from '../../browser/adeProjectService.js';
import { emptyFoundation } from '../../common/modelFoundation.js';
import { type SemanticModel, type ModelView } from '../../common/modelTypes.js';
import { applyVisualEdit } from '../../common/visualEditing.js';
import { type VisualEdit } from '../../common/visualEditTypes.js';
import { validateSemanticModel } from '../../common/modelValidation.js';

suite('A.D.E project diagram creation', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	for (const kind of ['structure', 'state'] as const) {
		test(`an empty project can create a ${kind} diagram without requiring a preexisting feature`, async () => {
			const model: SemanticModel = { version: 5, id: 'project', name: 'Project', semantics: { elements: [], relations: [] }, views: [], foundation: emptyFoundation(), codeMappings: [], verifications: [] };
			const project = Object.assign(new (mock<AdeProjectService>())(), { model: model as SemanticModel, selectedId: '', activeView: undefined as ModelView | undefined, showDiagram: (id: string) => { Object.assign(project, { activeView: project.model.views.find(view => view.id === id) }); } });
			const edits: VisualEdit[] = [];
			const ui = Object.assign(new (mock<AdeEditingContext>())(), {
				project,
				quickInput: Object.assign(new (mock<IQuickInputService>())(), { pick: async (items: (IQuickPickItem & { kind?: string })[]) => items.find(item => item.kind === kind) ?? items[0] }),
				feature: async () => { assert.fail('the empty project must not open an empty feature picker'); },
				name: async () => 'New Diagram',
				edit: (value: VisualEdit | VisualEdit[]) => { const batch = Array.isArray(value) ? value : [value]; edits.push(...batch); for (const edit of batch) { project.model = applyVisualEdit(project.model, edit); } }
			});
			await runAdeDiagramCommand(ui, 'addDiagram');
			assert.deepStrictEqual({ kind: project.activeView?.kind, name: project.activeView?.name, featureId: project.activeView?.featureId, features: project.model.semantics.elements.filter(element => element.kind === 'feature'), valid: validateSemanticModel(project.model), batches: edits.map(edit => edit.kind), original: model.views }, { kind, name: 'New Diagram', featureId: undefined, features: [], valid: [], batches: kind === 'state' ? ['resource', 'stateDiagram'] : ['diagram'], original: [] });
		});
	}
});
