import { UriHandler, Uri, window, Disposable, commands, LogOutputChannel, l10n } from 'vscode';
import { dispose, isWindows } from './util';
import * as querystring from 'querystring';
import { sanitizeGitLog } from './log';

const schemes = isWindows ?
	new Set(['git', 'http', 'https', 'ssh']) :
	new Set(['file', 'git', 'http', 'https', 'ssh']);

const refRegEx = /^$|[~\^:\\\*\s\[\]]|^-|^\.|\/\.|\.\.|\.lock\/|\.lock$|\/$|\.$/;

export class GitProtocolHandler implements UriHandler {

	private disposables: Disposable[] = [];

	constructor(private readonly logger: LogOutputChannel) {
		this.disposables.push(window.registerUriHandler(this));
	}

	// example code-oss://vscode.git/clone?url=https://github.com/microsoft/vscode
	handleUri(uri: Uri): void {
		this.logger.info(`[GitProtocolHandler][handleUri] Path: ${uri.path}`);

		switch (uri.path) {
			case '/clone': this.clone(uri);
		}
	}

	private async clone(uri: Uri): Promise<void> {
		const data = querystring.parse(uri.query);
		const ref = data.ref;

		if (!data.url) {
			this.logger.warn('[GitProtocolHandler][clone] Failed to open clone URI.');
			return;
		}

		if (Array.isArray(data.url) && data.url.length === 0) {
			this.logger.warn('[GitProtocolHandler][clone] Failed to open clone URI.');
			return;
		}

		if (ref !== undefined && typeof ref !== 'string') {
			this.logger.warn('[GitProtocolHandler][clone] Failed to open clone URI due to multiple references.');
			return;
		}

		let cloneUri: Uri;
		try {
			let rawUri = Array.isArray(data.url) ? data.url[0] : data.url;

			// Handle SSH Uri
			// Ex: git@github.com:microsoft/vscode.git
			rawUri = rawUri.replace(/^(git@[^\/:]+)(:)/i, 'ssh://$1/');

			cloneUri = Uri.parse(rawUri, true);

			// Validate against supported schemes
			if (!schemes.has(cloneUri.scheme.toLowerCase())) {
				throw new Error('Unsupported scheme.');
			}

			// Validate the reference
			if (typeof ref === 'string' && refRegEx.test(ref)) {
				throw new Error('Invalid reference.');
			}
		}
		catch (ex) {
			this.logger.warn('[GitProtocolHandler][clone] Invalid clone URI.');
			return;
		}

		if (!(await commands.getCommands(true)).includes('git.clone')) {
			this.logger.error('[GitProtocolHandler][clone] Could not complete git clone operation as git installation was not found.');

			const errorMessage = l10n.t('Could not clone your repository as Git is not installed.');
			const downloadGit = l10n.t('Download Git');

			if (await window.showErrorMessage(errorMessage, { modal: true }, downloadGit) === downloadGit) {
				commands.executeCommand('vscode.open', Uri.parse('https://aka.ms/vscode-download-git'));
			}

			return;
		} else {
			const cloneTarget = cloneUri.toString(true);
			this.logger.info(`[GitProtocolHandler][clone] Executing git.clone for ${sanitizeGitLog(cloneTarget)}`);
			commands.executeCommand('git.clone', cloneTarget, undefined, { ref: ref });
		}
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}
