/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { ProgressOptions } from 'vscode';
import { encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { raceCancellationError } from '../../../../base/common/async.js';
import { CancellationError, isCancellationError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { IAuthorizationServerMetadata } from '../../../../base/common/oauth.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AdapterLogger, ILogger, ILoggerService, LogLevel, NullLogger } from '../../../../platform/log/common/log.js';
import { INotificationSource } from '../../../../platform/notification/common/notification.js';
import { Progress } from '../../../../platform/progress/common/progress.js';
import { IAuthenticationProviderSessionOptions } from '../../../services/authentication/common/authentication.js';
import { DynamicAuthProvider, IAuthorizationToken, reviveAccountIcon, TokenStore } from '../../common/extHostAuthentication.js';
import { IProgressStepDto, MainThreadAuthenticationShape } from '../../common/extHost.protocol.js';
import { IExtHostInitDataService } from '../../common/extHostInitDataService.js';
import { IExtHostProgress } from '../../common/extHostProgress.js';
import { IExtHostUrlsService } from '../../common/extHostUrls.js';
import { IExtHostWindow } from '../../common/extHostWindow.js';
import { Proxied } from '../../../services/extensions/common/proxyIdentifier.js';

/** Builds a structurally-valid JWT carrying the given claims. */
function jwt(claims: object): string {
	const segment = (value: object) => encodeBase64(VSBuffer.fromString(JSON.stringify(value)));
	return `${segment({ alg: 'none', typ: 'JWT' })}.${segment(claims)}.signature`;
}

suite('TokenStore', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createStore(initialTokens: IAuthorizationToken[]): TokenStore {
		const persistence = {
			onDidChange: disposables.add(new Emitter<IAuthorizationToken[]>()).event,
			set: () => { }
		};
		return disposables.add(new TokenStore(persistence, initialTokens, new NullLogger()));
	}

	// Regression for the MCP sign-in loop: an explicit empty `token.scope` must derive empty session scopes, not the granted scopes from the JWT claims, else empty-scope lookups never match their own session.
	test('derives session scopes from the stored token.scope, falling back to JWT claims only when scope is absent', () => {
		const store = createStore([
			// Explicit empty scope must win over the scopes embedded in the JWT claims.
			{ access_token: jwt({ sub: 'a', scope: 'menu:read orders:create orders:cancel' }), token_type: 'Bearer', scope: '', created_at: 0 },
			// Absent scope (undefined) falls back to the JWT claims.
			{ access_token: jwt({ sub: 'b', scope: 'menu:read orders:create' }), token_type: 'Bearer', created_at: 0 },
			// A non-empty scope is authoritative over the JWT claims.
			{ access_token: jwt({ sub: 'c', scope: 'ignored:claim' }), token_type: 'Bearer', scope: 'read write', created_at: 0 },
		]);

		assert.deepStrictEqual(
			store.sessions.map(session => session.scopes),
			[[], ['menu:read', 'orders:create'], ['read', 'write']]
		);
	});
});

suite('DynamicAuthProvider', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	class TestDynamicAuthProvider extends DynamicAuthProvider {
		generateNewClientIdCalls = 0;

		exchangeCodeForTesting(code: string, verifier: string) {
			return this.exchangeCodeForToken(code, verifier, 'https://vscode.dev/redirect');
		}

		generateClientIdForTesting() {
			return super._generateNewClientId();
		}

		protected override async _generateNewClientId(): Promise<void> {
			this.generateNewClientIdCalls++;
		}
	}

	interface ITestServer {
		readonly authorizationServer: string;
		readonly serverMetadata: IAuthorizationServerMetadata;
	}

	const resource = 'https://workiq.example.com/mcp';

	const servers: Record<string, ITestServer> = {
		entra: {
			authorizationServer: 'https://login.microsoftonline.com/organizations/v2.0',
			serverMetadata: {
				issuer: 'https://login.microsoftonline.com/organizations/v2.0',
				authorization_endpoint: 'https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize',
				token_endpoint: 'https://login.microsoftonline.com/organizations/oauth2/v2.0/token',
				response_types_supported: ['code'],
				scopes_supported: ['openid', 'profile', 'offline_access'],
			},
		},
		nonMicrosoft: {
			authorizationServer: 'https://auth.example.com',
			serverMetadata: {
				issuer: 'https://auth.example.com',
				authorization_endpoint: 'https://auth.example.com/authorize',
				token_endpoint: 'https://auth.example.com/token',
				response_types_supported: ['code'],
				scopes_supported: ['openid', 'profile', 'offline_access'],
			},
		},
		// A Microsoft authorization endpoint must not opt a non-Microsoft token endpoint into Microsoft behavior.
		entraWithForeignTokenEndpoint: {
			authorizationServer: 'https://login.microsoftonline.com/organizations/v2.0',
			serverMetadata: {
				issuer: 'https://login.microsoftonline.com/organizations/v2.0',
				authorization_endpoint: 'https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize',
				token_endpoint: 'https://auth.example.com/token',
				response_types_supported: ['code'],
				scopes_supported: ['openid', 'profile', 'offline_access'],
			},
		},
	};

	function createProvider(options: ITestServer & {
		readonly resource: string;
		readonly initialTokens?: IAuthorizationToken[];
		readonly providerId?: string;
		readonly fetcher?: typeof fetch;
		readonly onDidOpenUri?: (uri: string) => void;
		readonly onDidPersistTokens?: (tokens: IAuthorizationToken[]) => void;
		readonly waitForUriHandler?: (uri: UriComponents, token: CancellationToken) => Promise<UriComponents>;
		readonly logger?: ILogger;
		readonly clientSecret?: string;
	}): TestDynamicAuthProvider {
		const loggerService = new class extends mock<ILoggerService>() {
			override createLogger(): ILogger {
				return options.logger ?? new NullLogger();
			}
		}();
		const proxy = new class extends mock<Proxied<MainThreadAuthenticationShape>>() {
			override $promptForClientRegistration: Proxied<MainThreadAuthenticationShape>['$promptForClientRegistration'] = async () => undefined;
			override $setSessionsForDynamicAuthProvider = async (_providerId: string, _clientId: string, tokens: IAuthorizationToken[]): Promise<void> => { options.onDidPersistTokens?.(tokens); };
			// Never settles, so an abandoned authorization flow leaves no rejected promise behind.
			override $waitForUriHandler = (uri: UriComponents, token: CancellationToken): Promise<UriComponents> => options.waitForUriHandler?.(uri, token) ?? new Promise<UriComponents>(() => { });
		}();
		const extHostWindow = new class extends mock<IExtHostWindow>() {
			override async openUri(uri: string | URI): Promise<boolean> {
				options.onDidOpenUri?.(uri.toString());
				return false;
			}
		}();
		const extHostUrls = new class extends mock<IExtHostUrlsService>() {
			override async createAppUri(uri: URI): Promise<URI> {
				return uri;
			}
		}();
		const initData = new class extends mock<IExtHostInitDataService>() {
			override environment = { appUriScheme: 'vscode', appName: 'Test' } as IExtHostInitDataService['environment'];
		}();
		const extHostProgress = new class extends mock<IExtHostProgress>() {
			override async withProgressFromSource<R>(_source: string | INotificationSource, _options: ProgressOptions, task: (progress: Progress<IProgressStepDto>, token: CancellationToken) => Thenable<R>): Promise<R> {
				return task(new Progress<IProgressStepDto>(() => { }), CancellationToken.None);
			}
		}();
		return disposables.add(new TestDynamicAuthProvider(
			extHostWindow,
			extHostUrls,
			initData,
			extHostProgress,
			loggerService,
			proxy,
			URI.parse(options.authorizationServer),
			options.serverMetadata,
			{ resource: options.resource },
			'client-id',
			options.clientSecret,
			disposables.add(new Emitter()),
			options.initialTokens ?? [],
			options.providerId,
			options.fetcher,
		));
	}

	test('honors an explicit provider ID without changing the default identity', () => {
		const providerId = 'https://auth.example.com/ https://workiq.example.com/mcp client:client-id';
		const scoped = createProvider({ ...servers.nonMicrosoft, resource, providerId });
		const legacy = createProvider({ ...servers.nonMicrosoft, resource });

		assert.deepStrictEqual([scoped.id, legacy.id], [providerId, 'https://auth.example.com/ https://workiq.example.com/mcp']);
	});

	test('does not rotate the client while silently refreshing a token', async () => {
		let fetchCalls = 0;
		const fetcher: typeof fetch = async () => {
			fetchCalls++;
			return new Response(JSON.stringify({ error: 'invalid_client' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
			});
		};
		const provider = createProvider({
			authorizationServer: 'https://mcp.example.com',
			serverMetadata: {
				issuer: 'https://mcp.example.com',
				response_types_supported: ['code'],
				token_endpoint: 'https://mcp.example.com/token',
			},
			resource: 'https://mcp.example.com/resource',
			initialTokens: [{
				access_token: jwt({ sub: 'account' }),
				token_type: 'Bearer',
				scope: '',
				expires_in: 1,
				refresh_token: 'refresh-token',
				created_at: 0,
			}],
			fetcher,
		});

		const sessions = await provider.getSessions([], { silent: true } satisfies IAuthenticationProviderSessionOptions);

		assert.deepStrictEqual({
			sessions,
			fetchCalls,
			generateNewClientIdCalls: provider.generateNewClientIdCalls,
			clientId: provider.clientId,
		}, {
			sessions: [],
			fetchCalls: 1,
			generateNewClientIdCalls: 0,
			clientId: 'client-id',
		});
	});

	test('preserves a non-rotating refresh token through repeated refreshes and persistence', async () => {
		const refreshTokens: (string | null)[] = [];
		const persisted: IAuthorizationToken[][] = [];
		const provider = createProvider({
			...servers.nonMicrosoft,
			resource,
			initialTokens: [{ access_token: jwt({ sub: 'account' }), token_type: 'Bearer', scope: '', refresh_token: 'original-refresh', expires_in: 1, created_at: 0 }],
			onDidPersistTokens: tokens => persisted.push(tokens),
			fetcher: async (_input, init) => {
				refreshTokens.push(new URLSearchParams(String(init?.body)).get('refresh_token'));
				return new Response(JSON.stringify({ access_token: jwt({ sub: 'account', jti: String(refreshTokens.length) }), token_type: 'Bearer', expires_in: 60 }));
			},
		});
		await provider.getSessions([], { silent: true });
		await provider.getSessions([], { silent: true });
		assert.deepStrictEqual({ refreshTokens, persisted: persisted.map(tokens => tokens.map(token => token.refresh_token)) }, {
			refreshTokens: ['original-refresh', 'original-refresh'], persisted: [['original-refresh'], ['original-refresh']]
		});
	});

	for (const expired of [false, true]) {
		for (const failure of ['network', 'server', 'invalid_grant']) {
			test(`handles ${failure} while refreshing an ${expired ? 'expired' : 'unexpired'} token`, async () => {
				let fetchCalls = 0;
				const persisted: IAuthorizationToken[][] = [];
				const original = { access_token: jwt({ sub: 'account' }), token_type: 'Bearer', scope: '', refresh_token: 'original-refresh', expires_in: 60, created_at: expired ? 0 : Date.now() };
				const provider = createProvider({
					...servers.nonMicrosoft, resource, initialTokens: [original],
					onDidPersistTokens: tokens => persisted.push(tokens),
					fetcher: async () => {
						if (++fetchCalls === 1) {
							if (failure === 'network') {
								throw new TypeError('Failed to fetch');
							}
							return new Response(JSON.stringify({ error: failure === 'server' ? 'server_error' : 'invalid_grant' }), { status: failure === 'server' ? 503 : 400 });
						}
						return new Response(JSON.stringify({ access_token: jwt({ sub: 'account', jti: 'renewed' }), token_type: 'Bearer', expires_in: 3600, refresh_token: 'rotated-refresh' }));
					}
				});
				const first = await provider.getSessions([], { silent: true });
				const persistedAfterFailure = persisted.length;
				const second = await provider.getSessions([], { silent: true });
				const permanent = failure === 'invalid_grant';
				assert.deepStrictEqual({ first: first.map(session => session.accessToken), second: second.length, fetchCalls, persistedAfterFailure, lastRefresh: persisted.at(-1)?.map(token => token.refresh_token) }, {
					first: expired || permanent ? [] : [original.access_token], second: permanent ? 0 : 1, fetchCalls: permanent ? 1 : 2, persistedAfterFailure: permanent ? 1 : 0, lastRefresh: permanent ? [] : ['rotated-refresh']
				});
			});
		}
	}

	test('cancels the callback waiter when opening the browser fails', async () => {
		let waiter: CancellationToken | undefined;
		const provider = createProvider({
			...servers.nonMicrosoft, resource,
			waitForUriHandler: (_uri, token) => {
				waiter = token;
				return raceCancellationError(new Promise<UriComponents>(() => { }), token);
			}
		});
		await assert.rejects(provider.createSession([], {}), isCancellationError);
		assert.strictEqual(waiter?.isCancellationRequested, true);
	});

	test('does not log authorization codes, PKCE verifiers, client secrets, or invalid token payloads', async () => {
		const logs: string[] = [];
		const logger = disposables.add(new AdapterLogger({ log: (_level, args) => logs.push(JSON.stringify(args)) }, LogLevel.Trace));
		const provider = createProvider({
			...servers.nonMicrosoft, resource, logger, clientSecret: 'test-client-secret',
			fetcher: async () => new Response(JSON.stringify({ access_token: 'test-access-token', refresh_token: 'test-refresh-token' }))
		});
		await assert.rejects(provider.exchangeCodeForTesting('test-authorization-code', 'test-code-verifier'), /Invalid authorization token response/);
		assert.deepStrictEqual(['test-client-secret', 'test-authorization-code', 'test-code-verifier', 'test-access-token', 'test-refresh-token'].filter(secret => logs.some(log => log.includes(secret))), []);
	});

	for (const status of [200, 400]) {
		test(`does not log credentials from a rejected DCR response (${status})`, async () => {
			const secret = 'synthetic-dcr-client-secret';
			const logs: string[] = [];
			const logger = disposables.add(new AdapterLogger({ log: (_level, args) => logs.push(JSON.stringify(args)) }, LogLevel.Trace));
			const provider = createProvider({
				...servers.nonMicrosoft, resource, logger,
				serverMetadata: { ...servers.nonMicrosoft.serverMetadata, registration_endpoint: 'https://auth.example.com/register' },
				fetcher: async () => new Response(JSON.stringify({ client_secret: secret, error_description: secret }), { status })
			});
			await assert.rejects(provider.generateClientIdForTesting(), /Failed to fetch new client ID/);
			assert.deepStrictEqual({ leaked: logs.some(log => log.includes(secret)), prompted: logs.some(log => log.includes('Prompting user')) }, { leaked: false, prompted: true });
		});
	}

	test('refresh sends scope without resource for Microsoft auth, and resource without scope otherwise', async () => {
		const results: Record<string, { body: Record<string, string>; scopes: (readonly string[])[] }> = {};
		for (const [name, server] of Object.entries(servers)) {
			const bodies: Record<string, string>[] = [];
			const fetcher: typeof fetch = async (_input, init) => {
				bodies.push(Object.fromEntries(new URLSearchParams(String(init?.body))));
				return new Response(JSON.stringify({
					access_token: jwt({ sub: 'account' }),
					token_type: 'Bearer',
					expires_in: 3600,
					refresh_token: 'new-refresh',
				}), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				});
			};
			const provider = createProvider({
				...server,
				resource,
				initialTokens: [{
					access_token: jwt({ sub: 'account', jti: 'expired' }),
					token_type: 'Bearer',
					scope: 'api://res/Read',
					expires_in: 1,
					refresh_token: 'refresh-token',
					created_at: 0,
				}],
				fetcher,
			});

			const sessions = await provider.getSessions(['api://res/Read'], { silent: true } satisfies IAuthenticationProviderSessionOptions);
			results[name] = { body: bodies[0], scopes: sessions.map(session => session.scopes) };
		}

		const refreshBase = { client_id: 'client-id', grant_type: 'refresh_token', refresh_token: 'refresh-token' };
		assert.deepStrictEqual(results, {
			entra: {
				body: { ...refreshBase, scope: 'api://res/Read offline_access' },
				scopes: [['api://res/Read']],
			},
			nonMicrosoft: {
				body: { ...refreshBase, resource },
				scopes: [['api://res/Read']],
			},
			entraWithForeignTokenEndpoint: {
				body: { ...refreshBase, resource },
				scopes: [['api://res/Read']],
			},
		});
	});

	test('authorization URL requests offline_access when advertised and omits resource for Microsoft auth', async () => {
		const results: Record<string, { scope: string | null; resource: string | null; prompt: string | null }> = {};
		for (const [name, server] of Object.entries(servers)) {
			const openedUris: string[] = [];
			const provider = createProvider({
				...server,
				resource,
				onDidOpenUri: uri => openedUris.push(uri),
			});

			await assert.rejects(provider.createSession(['api://res/Read'], {}), isCancellationError);

			const params = new URL(openedUris[0]).searchParams;
			results[name] = {
				scope: params.get('scope'),
				resource: params.get('resource'),
				prompt: params.get('prompt'),
			};
		}

		assert.deepStrictEqual(results, {
			entra: { scope: 'api://res/Read offline_access', resource: null, prompt: null },
			nonMicrosoft: { scope: 'api://res/Read offline_access', resource, prompt: null },
			entraWithForeignTokenEndpoint: { scope: 'api://res/Read offline_access', resource, prompt: null },
		});
	});

	for (const failure of [new CancellationError(), new Error('Browser authorization failed')]) {
		test(`preserves the final authentication flow error: ${failure.message}`, async () => {
			const provider = createProvider({
				...servers.nonMicrosoft,
				resource,
				onDidOpenUri: () => { throw failure; },
			});
			await assert.rejects(provider.createSession(['read'], {}), error => error === failure);
		});
	}
});

suite('Account Icon Revival', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const iconComponents: UriComponents = { scheme: 'https', authority: 'example.com', path: '/avatar.png', query: '', fragment: '' };

	test('reviveAccountIcon revives a present icon into a URI and leaves a missing icon undefined', () => {
		const withIcon: { id: string; label: string; icon?: UriComponents } = { id: 'account-with-icon', label: 'Has Icon', icon: iconComponents };
		const withoutIcon: { id: string; label: string; icon?: UriComponents } = { id: 'account-without-icon', label: 'No Icon' };

		assert.deepStrictEqual(
			[reviveAccountIcon(withIcon), reviveAccountIcon(withoutIcon)],
			[
				{ ...withIcon, icon: URI.from(iconComponents) },
				{ ...withoutIcon, icon: undefined }
			]
		);
	});
});
