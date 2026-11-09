/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AdeControls } from '../../browser/adeControls.js';
import { renderAdeInteractionSequence } from '../../browser/adeInteractionSequence.js';
import { adeInteractionRows } from '../../browser/adeInteractionContent.js';
import { interactionFixture } from '../common/interactionFixture.js';

suite('A.D.E executable sequence renderer', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite(); let root: HTMLElement;
	setup(() => { root = dom.append(document.body, dom.$('section')); }); teardown(() => root.remove());
	test('nested frames and operands render in semantic order with measured, focusable labels', () => {
		const model = structuredClone(interactionFixture), before = structuredClone(model), controls = disposables.add(new AdeControls());
		const size = renderAdeInteractionSequence(root, model, 'interaction.checkout', controls, () => {}), buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-interaction-step-id]')];
		assert.deepStrictEqual(buttons.map(button => button.dataset.interactionStepId), adeInteractionRows(model, 'interaction.checkout').map(row => row.id));
		assert.strictEqual(root.querySelectorAll('rect[data-frame-id]').length, 3); assert.ok(size.width >= 720 && size.height > 200);
		buttons[2].focus(); assert.strictEqual(document.activeElement, buttons[2]); assert.deepStrictEqual(model, before);
		for (let index = 1; index < buttons.length; index++) { assert.ok(buttons[index].offsetTop >= buttons[index - 1].offsetTop + buttons[index - 1].offsetHeight); }
	});
	test('hostile labels remain text; accessible and visible rows describe the same policies', () => {
		const model = structuredClone(interactionFixture); model.foundation.blueprint!.operations.find(operation => operation.id === 'charge')!.name = '<img src=x onerror=alert(1)>';
		renderAdeInteractionSequence(root, model, 'interaction.checkout', disposables.add(new AdeControls()), () => {});
		assert.strictEqual(root.querySelector('img'), null); for (const row of adeInteractionRows(model, 'interaction.checkout')) { assert.ok(root.textContent?.includes(row.label)); assert.ok([...root.querySelectorAll('[data-interaction-step-id]')].some(label => label.getAttribute('aria-label') === row.text)); }
	});
});
