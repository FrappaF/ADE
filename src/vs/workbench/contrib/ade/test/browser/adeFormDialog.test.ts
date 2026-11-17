/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AdeFormDialog } from '../../browser/adeFormDialog.js';

suite('A.D.E form dialog', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let parent: HTMLElement;
	setup(() => { parent = document.body.appendChild(document.createElement('div')); });
	teardown(() => parent.remove());

	test('validates visible fields, skips disabled groups and commits all fields together', async () => {
		const dialog = store.add(new AdeFormDialog(parent, { title: 'Edit Details' }));
		const name = dialog.text(dialog.body, 'Name', '', { required: true });
		const description = dialog.text(dialog.body, 'Description', 'First line\nSecond line', { multiline: true });
		const disabled = dialog.body.appendChild(document.createElement('fieldset')); disabled.disabled = true;
		dialog.text(disabled, 'Inactive Field', '', { required: true });
		const result = dialog.open(() => ({ name: name.value.trim(), description: description.value }));
		name.value = '   '; dialog.body.requestSubmit();
		assert.deepStrictEqual([name.getAttribute('aria-invalid'), document.activeElement === name], ['true', true]);
		name.value = 'Customer'; name.dispatchEvent(new Event('input')); dialog.body.requestSubmit();
		assert.deepStrictEqual(await result, { name: 'Customer', description: 'First line\nSecond line' });
		assert.strictEqual(parent.querySelector('dialog'), null);
	});

	test('Escape cancels the draft, restores focus and disposes listeners', async () => {
		const origin = parent.appendChild(document.createElement('button')); origin.focus();
		const dialog = store.add(new AdeFormDialog(parent, { title: 'Edit Details' }));
		let reads = 0;
		const name = dialog.text(dialog.body, 'Name', 'Original');
		const result = dialog.open(() => { reads++; return name.value; });
		name.value = 'Draft';
		parent.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }));
		assert.deepStrictEqual([await result, reads, document.activeElement === origin, parent.querySelector('dialog')], [undefined, 0, true, null]);
	});

	test('removing an invalid collection row does not block saving the remaining draft', async () => {
		const dialog = store.add(new AdeFormDialog(parent, { title: 'Members' }));
		const row = dialog.body.appendChild(document.createElement('fieldset'));
		dialog.text(row, 'Name', '', { required: true });
		const result = dialog.open(() => []);
		dialog.body.requestSubmit(); row.remove(); dialog.body.requestSubmit();
		assert.deepStrictEqual(await result, []);
	});
});
