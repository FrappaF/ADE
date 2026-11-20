import 'mocha';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { EventEmitter, LogLevel, LogOutputChannel, window, workspace, WorkspaceConfiguration } from 'vscode';
import { Askpass } from '../askpass';

class TestLogOutputChannel implements LogOutputChannel {
	readonly name = 'Askpass test';
	readonly logLevel = LogLevel.Trace;
	readonly messages: string[] = [];
	private readonly logLevelChanged = new EventEmitter<LogLevel>();
	readonly onDidChangeLogLevel = this.logLevelChanged.event;
	trace(message: string): void { this.messages.push(message); }
	debug(): void { }
	info(): void { }
	warn(): void { }
	error(): void { }
	append(): void { }
	appendLine(): void { }
	replace(): void { }
	clear(): void { }
	show(): void { }
	hide(): void { }
	dispose(): void { this.logLevelChanged.dispose(); }
}

suite('Askpass log credentials', () => {
	teardown(() => sinon.restore());

	for (const host of ['https://synthetic-pat@example.com', 'https://user:synthetic-password@example.com/repo?access_token=synthetic-query-token']) {
		test(`redacts credentials from the payload and prompt logs (${host.includes('?') ? 'password and query' : 'PAT username'})`, async () => {
			const logger = new TestLogOutputChannel();
			const askpass = new Askpass(undefined, logger, { askpass: '', askpassMain: '', askpassEmpty: '', sshAskpass: '', sshAskpassEmpty: '' });
			const config: WorkspaceConfiguration = { get: <T>() => true as T, has: () => true, inspect: () => undefined, update: async () => { } };
			sinon.stub(workspace, 'getConfiguration').returns(config);
			const input = sinon.stub(window, 'showInputBox').resolves('entered-password');
			try {
				const response = await askpass.handle({ askpassType: 'https', argv: ['node', 'askpass-main', 'Password', 'for', `'${host}':`] });
				assert.deepStrictEqual({
					response,
					prompt: input.firstCall.args[0]?.prompt,
					leaked: logger.messages.some(message => /synthetic-(pat|password|query-token)/.test(message)),
					retainedHost: logger.messages.every(message => message.includes('example.com'))
				}, { response: 'entered-password', prompt: `Git: ${host}`, leaked: false, retainedHost: true });
			} finally {
				askpass.dispose();
				logger.dispose();
			}
		});
	}
});
