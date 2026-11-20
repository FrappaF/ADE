import 'mocha';
import * as assert from 'assert';
import { Disposable, Event } from 'vscode';
import { registerOnEnablement } from '../util.js';

suite('GitHub integration enablement', () => {
	test('initial disablement preserves the listener, and contributions follow enablement until disposal', () => {
		let listener: ((enabled: boolean) => void) | undefined;
		let active = 0;
		const onDidChangeEnablement: Event<boolean> = callback => {
			listener = callback;
			return new Disposable(() => listener = undefined);
		};
		const registration = registerOnEnablement(onDidChangeEnablement, false, store => {
			active++;
			store.add(new Disposable(() => active--));
		});
		try {
			assert.ok(listener);
			assert.strictEqual(active, 0);
			listener(true);
			assert.strictEqual(active, 1);
			listener(false);
			assert.strictEqual(active, 0);
			listener(true);
			assert.strictEqual(active, 1);
		} finally {
			registration.dispose();
		}
		assert.deepStrictEqual({ listener, active }, { listener: undefined, active: 0 });
	});
});
