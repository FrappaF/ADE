import assert from 'assert';
import { AdapterLogger, LogLevel } from '../../../../../platform/log/common/log.js';
import { TestSecretStorageService } from '../../../../../platform/secrets/test/common/testSecretStorageService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { DynamicAuthenticationProviderStorageService } from '../../browser/dynamicAuthenticationProviderStorageService.js';

suite('Dynamic authentication token storage', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('does not log tokens when persisting or rejecting invalid sessions', async () => {
		const logs: string[] = [];
		const logger = disposables.add(new class extends AdapterLogger { declare readonly _serviceBrand: undefined; }({ log: (_level, args) => logs.push(JSON.stringify(args)) }, LogLevel.Trace));
		const secrets = disposables.add(new TestSecretStorageService());
		const service = disposables.add(new DynamicAuthenticationProviderStorageService(disposables.add(new TestStorageService()), secrets, logger));
		const token = { access_token: 'test-access-token', refresh_token: 'test-refresh-token', id_token: 'test-id-token', token_type: 'Bearer', created_at: 1 };
		await service.setSessionsForDynamicAuthProvider('provider', 'client', [token]);
		assert.deepStrictEqual(await service.getSessionsForDynamicAuthProvider('provider', 'client'), [token]);
		await service.setSessionsForDynamicAuthProvider('provider', 'client', [{ ...token, created_at: NaN }]);
		assert.strictEqual(await service.getSessionsForDynamicAuthProvider('provider', 'client'), undefined);
		const key = JSON.stringify({ isDynamicAuthProvider: true, authProviderId: 'provider', clientId: 'client' });
		for (const invalid of ['[null]', 'test-access-token malformed JSON']) {
			await secrets.set(key, invalid);
			assert.strictEqual(await service.getSessionsForDynamicAuthProvider('provider', 'client'), undefined);
		}
		assert.deepStrictEqual([token.access_token, token.refresh_token, token.id_token].filter(secret => logs.some(log => log.includes(secret))), []);
	});
});
