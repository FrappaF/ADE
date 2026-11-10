/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { blueprintFixture } from '../common/blueprintFixture.js';
import { type IInputOptions, type IPickOptions, type IQuickInputService, type IQuickPickItem, type QuickPickInput } from '../../../../../platform/quickinput/common/quickInput.js';
import { editAdeBlueprint } from '../../browser/adeBlueprintEditing.js';
import { applyVisualEdit } from '../../common/visualEditing.js';
import { type SemanticModelV4 } from '../../common/modelTypes.js';

/** Scripted native dialog boundary: all semantic editing still uses the production implementation. */
export class ScriptedDialogs implements Pick<IQuickInputService, 'pick' | 'input'> {
	constructor(private readonly answers: (string | string[] | undefined)[]) { }
	pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: IPickOptions<T> & { canPickMany: true }): Promise<T[] | undefined>;
	pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: IPickOptions<T> & { canPickMany: false }): Promise<T | undefined>;
	pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: Omit<IPickOptions<T>, 'canPickMany'>): Promise<T | undefined>;
	async pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: IPickOptions<T>): Promise<T | T[] | undefined> {
		assert.ok(this.answers.length, 'Unexpected dialog'); const answer = this.answers.shift(); if (answer === undefined) { return; }
		const items = (await picks).filter((item): item is T => item.type !== 'separator');
		const find = (label: string) => { const item = items.find(item => item.label === label); assert.ok(item, `Missing dialog choice: ${label}`); return item; };
		return options?.canPickMany ? (Array.isArray(answer) ? answer : [answer]).map(find) : find(String(answer));
	}
	async input(options?: IInputOptions): Promise<string | undefined> {
		assert.ok(this.answers.length, 'Unexpected input'); const answer = this.answers.shift(); assert.ok(!Array.isArray(answer));
		if (answer !== undefined) { assert.strictEqual(await options?.validateInput?.(answer), undefined); } return answer;
	}
	assertComplete(): void { assert.strictEqual(this.answers.length, 0); }
}

suite('A.D.E guided blueprint editing', () => {
	let model: SemanticModelV4;
	setup(() => { model = structuredClone(blueprintFixture); });
	const run = async (model: SemanticModelV4, answers: (string | string[] | undefined)[], mode?: 'decision') => {
		const dialogs = new ScriptedDialogs(answers); const before = structuredClone(model);
		const edits = await editAdeBlueprint(dialogs, model, 'component.checkout', model.views[2], mode);
		dialogs.assertComplete(); assert.deepStrictEqual(model, before);
		return edits?.reduce((model, edit) => applyVisualEdit(model, edit) as SemanticModelV4, model);
	};
	test('canceling after a detached operation edit leaves all definitions untouched', async () => {
		assert.strictEqual(await run(model, ['Shared Operations', 'confirmOrder', 'Input Parameters', 'Create New', 'newInput', undefined]), undefined);
	});
	test('renaming an operation uses its existing stable identity', async () => {
		const updated = await run(model, ['Shared Operations', 'confirmOrder', 'Rename', 'submitOrder']);
		assert.deepStrictEqual(updated?.foundation.blueprint?.operations.map(operation => [operation.id, operation.name]), [['operation.confirm', 'submitOrder'], ['operation.reserveRequired', 'reserveStock'], ['operation.reserve', 'reserveStock']]);
	});
	test('guided field editing keeps optional presence separate from non-null values', async () => {
		const updated = await run(model, ['Shared Operations', 'confirmOrder', 'Input Parameters', 'order', 'order', 'Order', 'Optional', 'Non-null Value']);
		assert.deepStrictEqual(updated?.foundation.blueprint?.operations[0].inputs[0], { id: 'input.operation.confirm', name: 'order', type: '', typeId: 'type.order', required: false, nullable: { state: 'known', value: false } });
	});
	test('C4 scope editing preserves subject identity, existing coordinates and foreign context', async () => {
		const updated = await run(model, ['C4 View Subject and Context', 'API Components', 'L3 · Components', 'API', 'API Components', ['Money', 'Stock', 'Checkout API'], ['API', 'Checkout', 'Audit', 'Money', 'Stock', 'Checkout API']]);
		assert.deepStrictEqual(updated?.views[2], model.views[2]);
	});
	test('decision status changes create one tracked revision and preserve reasons', async () => {
		const updated = await run(model, ['1 · Declared stock protocol', 'Change Status', 'Deprecated'], 'decision');
		const decision = updated?.foundation.decisions.find(decision => decision.id === 'adr.transport');
		assert.deepStrictEqual([decision?.status, decision?.record?.history[0].revision, decision?.record?.history[0].decision], ['deprecated', 'adr.1', 'Use the declared protocol for stock requests']);
	});
	test('feature membership editing keeps ownership and shared identity unchanged', async () => {
		const updated = await run(model, ['Feature Memberships', ['Checkout', 'Audit']]);
		assert.deepStrictEqual(updated?.foundation.ownership, model.foundation.ownership);
		assert.deepStrictEqual(updated?.foundation.memberships.filter(entry => entry.elementId === 'component.checkout').map(entry => entry.featureId), ['feature.checkout', 'feature.audit']);
	});
});
