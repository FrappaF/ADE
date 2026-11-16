/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { commands, Disposable, ExtensionContext, extensions, l10n, LogLevel, LogOutputChannel, window } from 'vscode';
import { TelemetryReporter } from '@vscode/extension-telemetry';
import { GithubRemoteSourceProvider } from './remoteSourceProvider.js';
import type { API, GitExtension } from './typings/git.d.ts';
import { registerCommands } from './commands.js';
import { GithubCredentialProviderManager } from './credentialProvider.js';
import { DisposableStore, registerOnEnablement, repositoryHasGitHubRemote } from './util.js';
import { GithubPushErrorHandler } from './pushErrorHandler.js';
import { GitBaseExtension } from './typings/git-base.js';
import { GithubRemoteSourcePublisher } from './remoteSourcePublisher.js';
import { GitHubBranchProtectionProviderManager } from './branchProtection.js';
import { GitHubCanonicalUriProvider } from './canonicalUriProvider.js';
import { VscodeDevShareProvider } from './shareProviders.js';
import { GitHubSourceControlHistoryItemDetailsProvider } from './historyItemDetailsProvider.js';
import { OctokitService } from './auth.js';

export function activate(context: ExtensionContext): void {
	const disposables: Disposable[] = [];
	context.subscriptions.push(new Disposable(() => Disposable.from(...disposables).dispose()));

	const logger = window.createOutputChannel('GitHub', { log: true });
	disposables.push(logger);

	const onDidChangeLogLevel = (logLevel: LogLevel) => {
		logger.appendLine(l10n.t('Log level: {0}', LogLevel[logLevel]));
	};
	disposables.push(logger.onDidChangeLogLevel(onDidChangeLogLevel));
	onDidChangeLogLevel(logger.logLevel);

	const { aiKey } = context.extension.packageJSON as { aiKey: string };
	const telemetryReporter = new TelemetryReporter(aiKey);
	disposables.push(telemetryReporter);

	const octokitService = new OctokitService();
	disposables.push(octokitService);

	disposables.push(initializeGitBaseExtension());
	disposables.push(initializeGitExtension(context, octokitService, telemetryReporter, logger));
}

function initializeGitBaseExtension(): Disposable {
	const gitBaseExtension = extensions.getExtension<GitBaseExtension>('vscode.git-base')!.exports;
	return registerOnEnablement(gitBaseExtension.onDidChangeEnablement, gitBaseExtension.enabled, registrations => {
		try {
			const gitBaseAPI = gitBaseExtension.getAPI(1);

			registrations.add(gitBaseAPI.registerRemoteSourceProvider(new GithubRemoteSourceProvider()));
		}
		catch (err) {
			console.error('Could not initialize GitHub extension');
			console.warn(err);
		}
	});
}

function setGitHubContext(gitAPI: API, disposables: DisposableStore) {
	if (gitAPI.repositories.find(repo => repositoryHasGitHubRemote(repo))) {
		commands.executeCommand('setContext', 'github.hasGitHubRepo', true);
	} else {
		const openRepoDisposable = gitAPI.onDidOpenRepository(async e => {
			await e.status();
			if (repositoryHasGitHubRemote(e)) {
				commands.executeCommand('setContext', 'github.hasGitHubRepo', true);
				openRepoDisposable.dispose();
			}
		});
		disposables.add(openRepoDisposable);
	}
}

function initializeGitExtension(context: ExtensionContext, octokitService: OctokitService, telemetryReporter: TelemetryReporter, logger: LogOutputChannel): Disposable {
	const disposables = new DisposableStore();

	let gitExtension = extensions.getExtension<GitExtension>('vscode.git');

	const initialize = () => {
		gitExtension!.activate()
			.then(extension => {
				disposables.add(registerOnEnablement(extension.onDidChangeEnablement, extension.enabled, registrations => {
					const gitAPI = extension.getAPI(1);

					registrations.add(registerCommands(gitAPI));
					registrations.add(new GithubCredentialProviderManager(gitAPI));
					registrations.add(new GitHubBranchProtectionProviderManager(gitAPI, context.globalState, octokitService, logger, telemetryReporter));
					registrations.add(gitAPI.registerPushErrorHandler(new GithubPushErrorHandler(telemetryReporter)));
					registrations.add(gitAPI.registerRemoteSourcePublisher(new GithubRemoteSourcePublisher(gitAPI)));
					registrations.add(gitAPI.registerSourceControlHistoryItemDetailsProvider(new GitHubSourceControlHistoryItemDetailsProvider(gitAPI, octokitService, logger)));
					registrations.add(new GitHubCanonicalUriProvider(gitAPI));
					registrations.add(new VscodeDevShareProvider(gitAPI));
					setGitHubContext(gitAPI, registrations);

					commands.executeCommand('setContext', 'git-base.gitEnabled', true);
				}));
			});
	};

	if (gitExtension) {
		initialize();
	} else {
		const listener = extensions.onDidChange(() => {
			if (!gitExtension && extensions.getExtension<GitExtension>('vscode.git')) {
				gitExtension = extensions.getExtension<GitExtension>('vscode.git');
				initialize();
				listener.dispose();
			}
		});
		disposables.add(listener);
	}

	return disposables;
}
