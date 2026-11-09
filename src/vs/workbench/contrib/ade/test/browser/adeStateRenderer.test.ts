/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AdeControls } from '../../browser/adeControls.js';
import { renderAdeState } from '../../browser/adeState.js';
import { adeStateRows } from '../../browser/adeStateContent.js';
import { stateFixture } from '../common/stateFixture.js';

suite('A.D.E executable state renderer', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite(); let root: HTMLElement;
	setup(() => { root = dom.append(document.body, dom.$('section')); }); teardown(() => root.remove());
	test('native state table preserves semantic order, keyboard focus and model', () => { const model = structuredClone(stateFixture), before = structuredClone(model), selected: string[] = []; renderAdeState(root, model, model.views[0], disposables.add(new AdeControls()), () => {}, id => selected.push(id)); const rows = [...root.querySelectorAll<HTMLElement>('[data-state-id]')]; assert.deepStrictEqual(rows.map(row => row.dataset.stateId), adeStateRows(model, 'checkout.lifecycle').map(row => row.id)); const button = root.querySelector<HTMLButtonElement>('[data-state-id="Draft"] button')!; button.focus(); assert.strictEqual(document.activeElement, button); button.click(); assert.deepStrictEqual(selected, ['Draft']); assert.deepStrictEqual(model, before); });
	test('hostile state labels are rendered as text and policy is accessible', () => { const model = structuredClone(stateFixture); model.semantics.elements.find(element => element.id === 'Draft')!.name = '<img src=x onerror=alert(1)>'; renderAdeState(root, model, model.views[0], disposables.add(new AdeControls()), () => {}, () => {}); assert.strictEqual(root.querySelector('img'), null); for (const row of adeStateRows(model, 'checkout.lifecycle')) { assert.ok(root.textContent?.includes(row.text)); } assert.strictEqual(root.querySelector('section')?.getAttribute('aria-label'), 'Executable State Machine'); });
});
