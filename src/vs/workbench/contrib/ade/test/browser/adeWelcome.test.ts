/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AdeControls } from '../../browser/adeControls.js';
import { renderAdeWelcome, renderAdeProjectStart } from '../../browser/adeWelcome.js';
import { adeDocumentStatus } from '../../browser/adeDocumentStatus.js';

suite('A.D.E project entrances and truthful status', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let root: HTMLElement;
	setup(() => { root = dom.append(document.body, dom.$('section.ade-shell')); });
	teardown(() => root.remove());

	test('three entrances dispatch distinct tasks; model files and examples stay in secondary help', () => {
		const called: string[] = [];
		const controls = store.add(new AdeControls());
		renderAdeWelcome(root, controls, { open: () => called.push('open'), create: () => called.push('create'), importCode: () => called.push('import'), openModel: () => called.push('model'), example: () => called.push('example'), canImport: true });
		const entrances = [...root.querySelectorAll<HTMLButtonElement>('.ade-welcome-tasks button')];
		for (const button of entrances) { button.click(); }
		assert.deepStrictEqual({ names: entrances.map(button => button.textContent), called, primary: root.querySelectorAll('.ade-primary-action').length, helpOpen: root.querySelector('details')?.open }, { names: ['Open Project', 'Create Project', 'Import Codebase'], called: ['open', 'create', 'import'], primary: 1, helpOpen: false });
	});

	test('the unsupported import remains explained and cannot dispatch', () => {
		let calls = 0;
		renderAdeWelcome(root, store.add(new AdeControls()), { open() { }, create() { }, importCode: () => calls++, openModel() { }, example() { }, canImport: false });
		const button = root.querySelector<HTMLButtonElement>('.ade-welcome-tasks section:last-child button')!;
		button.click();
		assert.deepStrictEqual([button.disabled, calls, !!root.querySelector(`#${button.getAttribute('aria-describedby')}`)?.textContent?.includes('unavailable')], [true, 0, true]);
	});

	test('empty projects offer the supported template and free modeling as separate actions', () => {
		const called: string[] = [];
		renderAdeProjectStart(root, store.add(new AdeControls()), '<img src=x>', () => called.push('template'), () => called.push('manual'));
		for (const button of root.querySelectorAll('button')) { button.click(); }
		assert.deepStrictEqual([called, root.querySelector('img'), root.querySelectorAll('.ade-primary-action').length], [['template', 'manual'], null, 1]);
		root.textContent = '';
		renderAdeProjectStart(root, store.add(new AdeControls()), 'Unsupported', undefined, () => called.push('manual'));
		assert.strictEqual(root.querySelectorAll('button').length, 1);
	});

	test('blocking errors dominate success and file persistence stays distinct from verification', () => {
		const base = { loading: false, dirty: false, hasDocument: true, draft: false, codeChanged: false };
		assert.deepStrictEqual([
			adeDocumentStatus({ ...base, error: 'broken', operation: 'Verification passed' }),
			adeDocumentStatus({ ...base, saveError: 'disk full', dirty: true }),
			adeDocumentStatus({ ...base, draft: true }),
			adeDocumentStatus(base),
			adeDocumentStatus({ ...base, hasDocument: false })
		], ['Project Could Not Be Opened', 'Changes Could Not Be Saved', 'Draft Saved · Corrections Required', 'Model Saved Locally', 'Choose a Project to Begin']);
	});
});
