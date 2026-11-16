/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { authentication, AuthenticationSession, AuthenticationSessionsChangeEvent, EventEmitter } from 'vscode';
import { graphql } from '@octokit/graphql';
import { getOctokit, OctokitService } from '../auth.js';

function session(accessToken: string): AuthenticationSession {
	return { id: accessToken, accessToken, account: { id: accessToken, label: accessToken }, scopes: ['repo'] };
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: Error) => void;
	const promise = new Promise<T>((complete, error) => { resolve = complete; reject = error; });
	return { promise, resolve, reject };
}

suite('GitHub REST authentication', () => {
	teardown(() => sinon.restore());

	test('uses the current session after token or account changes', async () => {
		const getSession = sinon.stub(authentication, 'getSession');
		getSession.onFirstCall().resolves(session('first-test-token'));
		getSession.onSecondCall().resolves(session('second-test-token'));
		const first = await getOctokit();
		const second = await getOctokit();
		assert.deepStrictEqual([await first.auth(), await second.auth()], [
			{ type: 'token', token: 'first-test-token', tokenType: 'oauth' },
			{ type: 'token', token: 'second-test-token', tokenType: 'oauth' },
		]);
	});
});

suite('GitHub GraphQL authentication', () => {
	teardown(() => sinon.restore());

	for (const completion of ['resolve', 'reject']) {
		test(`retries the current session when an invalidated client initialization finishes (${completion})`, async () => {
			const changes = new EventEmitter<AuthenticationSessionsChangeEvent>();
			sinon.stub(authentication, 'onDidChangeSessions').callsFake(changes.event);
			const getSession = sinon.stub(authentication, 'getSession');
			getSession.onFirstCall().resolves(session('first-token'));
			getSession.onSecondCall().resolves(session('second-token'));
			const started = deferred<void>();
			const release = deferred<void>();
			const tokens: string[] = [];
			const current = graphql.defaults({ headers: { authorization: 'token second-token' } });
			const service = new OctokitService(async token => {
				tokens.push(token);
				if (token === 'first-token') {
					started.resolve();
					await release.promise;
					if (completion === 'reject') { throw new Error('old initialization failed'); }
					return graphql.defaults({ headers: { authorization: 'token first-token' } });
				}
				return current;
			});
			try {
				const first = service.getOctokitGraphql();
				await started.promise;
				changes.fire({ provider: { id: 'github', label: 'GitHub' } });
				const queued = service.getOctokitGraphql();
				release.resolve();
				const clients = await Promise.all([first, queued]);
				assert.deepStrictEqual({ tokens, sessionCalls: getSession.callCount, currentClients: clients.map(client => client === current) }, { tokens: ['first-token', 'second-token'], sessionCalls: 2, currentClients: [true, true] });
			} finally {
				release.resolve();
				service.dispose();
				changes.dispose();
			}
		});
	}

	test('rechecks the session when authentication changes during session resolution', async () => {
		const changes = new EventEmitter<AuthenticationSessionsChangeEvent>();
		sinon.stub(authentication, 'onDidChangeSessions').callsFake(changes.event);
		const started = deferred<void>();
		const initial = deferred<AuthenticationSession>();
		const getSession = sinon.stub(authentication, 'getSession');
		getSession.onFirstCall().callsFake(() => { started.resolve(); return initial.promise; });
		getSession.onSecondCall().resolves(session('second-token'));
		const tokens: string[] = [];
		const current = graphql.defaults({});
		const service = new OctokitService(async token => { tokens.push(token); return current; });
		try {
			const pending = service.getOctokitGraphql();
			await started.promise;
			changes.fire({ provider: { id: 'github', label: 'GitHub' } });
			initial.resolve(session('first-token'));
			assert.deepStrictEqual({ current: await pending === current, tokens, sessionCalls: getSession.callCount }, { current: true, tokens: ['second-token'], sessionCalls: 2 });
		} finally {
			service.dispose();
			changes.dispose();
		}
	});

	for (const stage of ['session', 'client']) {
		test(`disposal prevents an in-flight ${stage} from publishing a client`, async () => {
			const changes = new EventEmitter<AuthenticationSessionsChangeEvent>();
			sinon.stub(authentication, 'onDidChangeSessions').callsFake(changes.event);
			const started = deferred<void>();
			const release = deferred<void>();
			const getSession = sinon.stub(authentication, 'getSession').callsFake(async () => {
				if (stage === 'session') { started.resolve(); await release.promise; }
				return session('first-token');
			});
			let constructions = 0;
			const service = new OctokitService(async () => { constructions++; started.resolve(); await release.promise; return graphql.defaults({}); });
			try {
				const pending = service.getOctokitGraphql();
				await started.promise;
				service.dispose();
				const rejection = assert.rejects(pending, /disposed/);
				release.resolve();
				await rejection;
				await assert.rejects(service.getOctokitGraphql(), /disposed/);
				assert.deepStrictEqual({ constructions, sessionCalls: getSession.callCount }, { constructions: stage === 'session' ? 0 : 1, sessionCalls: 1 });
			} finally {
				release.resolve();
				service.dispose();
				changes.dispose();
			}
		});
	}
});
