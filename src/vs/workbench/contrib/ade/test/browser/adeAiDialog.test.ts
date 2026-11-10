/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AdeAiDialog } from '../../browser/adeAiDialogView.js';
import { type AdeAiMessage } from '../../browser/adeAiDialog.js';
import { AdeControls } from '../../browser/adeControls.js';

suite('A.D.E transient assistant dialog', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let root: HTMLElement;
	setup(() => { root = dom.append(document.body, dom.$('section')); });
	teardown(() => root.remove());

	test('conversation is usable in the dialog and resets on every close; Escape restores focus', async () => {
		const trigger = dom.append(root, dom.$<HTMLButtonElement>('button')); trigger.textContent = 'Assistant'; trigger.focus();
		const sent: AdeAiMessage[][] = []; let refreshes = 0;
		const open = () => {
			const dialog = store.add(new AdeAiDialog(root, { onClose: async () => { refreshes++; }, send: async messages => { sent.push(messages); return '<script>untrusted()</script>'; } }));
			dialog.showConversation(); return dialog;
		};
		const first = open();
		const input = first.element.querySelector('textarea')!; input.value = 'Generate all diagrams';
		first.element.querySelector('form')!.requestSubmit(); await timeout(0);
		assert.deepStrictEqual([first.element.open, first.element.querySelectorAll('article').length, first.element.querySelector('script'), sent], [true, 2, null, [[{ role: 'user', text: 'Generate all diagrams' }]]]);
		first.element.dispatchEvent(new Event('cancel', { cancelable: true })); await timeout(0);
		assert.deepStrictEqual([refreshes, root.querySelector('dialog'), document.activeElement], [1, null, trigger]);
		const next = open();
		assert.deepStrictEqual([next.element.querySelectorAll('article').length, next.element.querySelector('textarea')!.value], [0, '']);
		await next.close(); assert.equal(refreshes, 2);
	});

	test('closing cancels a running turn and late output cannot reappear in the next conversation', async () => {
		const response = new DeferredPromise<string>(); let cancelled = false;
		const first = store.add(new AdeAiDialog(root, { onClose: async () => {}, send: async (_messages, token) => {
			const listener = token.onCancellationRequested(() => { cancelled = true; });
			try { return await response.p; } finally { listener.dispose(); }
		} }));
		first.showConversation(); first.element.querySelector('textarea')!.value = 'Generate'; first.element.querySelector('form')!.requestSubmit();
		assert.equal(first.element.querySelector('textarea')!.disabled, true);
		await first.close();
		const next = store.add(new AdeAiDialog(root, { onClose: async () => {}, send: async () => 'New session' })); next.showConversation();
		await response.complete('Old session output'); await timeout(0);
		assert.deepStrictEqual([cancelled, next.element.querySelectorAll('article').length, next.element.textContent?.includes('Old session output')], [true, 0, false]);
		await next.close();
	});

	test('closing refreshes the page and restores focus to the rebuilt action', async () => {
		root.className = 'ade-shell';
		const controls = store.add(new AdeControls()); let current: HTMLButtonElement;
		const render = () => controls.render(root, () => { dom.clearNode(root); current = controls.button(root, 'Explore Architecture', () => {}, 'explore'); });
		render(); current!.focus();
		const dialog = store.add(new AdeAiDialog(document.body, { onClose: async () => render() })); dialog.showConversation();
		await dialog.close();
		assert.deepStrictEqual([document.activeElement, root.querySelectorAll('button').length], [current!, 1]);
	});

	test('live CLI responses appear before completion and saved counters do not hide the current activity', async () => {
		const response = new DeferredPromise<string>();
		const dialog = store.add(new AdeAiDialog(root, { onClose: async () => {}, send: async () => response.p })); dialog.showConversation();
		dialog.element.querySelector('textarea')!.value = 'Repair the saved drafts'; dialog.element.querySelector('form')!.requestSubmit();
		dialog.updateConversation({ requestId: 'turn', kind: 'connecting' });
		dialog.updateProgress('10 Planned Diagrams · 6 Review Issues · 69 Source Tool Calls');
		assert.ok(dialog.element.textContent?.includes('Connecting to the Assistant'));
		dialog.updateConversation({ requestId: 'turn', kind: 'message', itemId: 'repair', text: 'I found six obsolete invalid attempts.' });
		assert.deepStrictEqual([dialog.element.querySelectorAll('article').length, dialog.element.querySelector('textarea')!.disabled], [2, true]);
		dialog.updateConversation({ requestId: 'turn', kind: 'message', itemId: 'repair', text: 'The existing diagrams are ready for review.' });
		await response.complete('The existing diagrams are ready for review.'); await timeout(0);
		assert.deepStrictEqual([dialog.element.querySelectorAll('article').length, dialog.element.querySelector('textarea')!.disabled], [2, false]);
		await dialog.close();
	});
});
