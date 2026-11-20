import { type CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { type IOrditoCodeService } from '../browser/orditoCodeService.js';
import { type CodeUpdateResult } from '../common/codeBridge.js';
import { type OrditoAiConnection } from './orditoAiConnection.js';

interface CodeUpdateRequest {
	root: string;
	context: string;
	token: CancellationToken;
	onProgress(message: string): void;
}

export async function runCodeUpdate({ root, context, token, onProgress }: CodeUpdateRequest, connection: OrditoAiConnection, code: IOrditoCodeService): Promise<CodeUpdateResult> {
	if (!connection.config) {
		throw new Error(localize('ordito.codeUpdate.configureProvider', "Choose a Model and CLI in AI Settings, Then Retry the Update."));
	}
	onProgress(localize('ordito.codeUpdate.checking', "Checking the Provider Account…"));
	const config = await connection.readyConfig();
	if (token.isCancellationRequested) { throw new CancellationError(); }
	if (!config) { throw new Error(connection.connectionStatus); }
	if (!config.maxCalls) {
		throw new Error(localize('ordito.codeUpdate.disabledBudget', "Enable AI Requests in AI Settings, Then Retry the Update."));
	}

	const labels = {
		connecting: localize('ordito.codeUpdate.connecting', "Starting {0}…", config.model),
		thinking: localize('ordito.codeUpdate.working', "Inspecting and Updating the Affected Code…"),
		waiting: localize('ordito.codeUpdate.waiting', "Waiting for the Provider…"),
		tool: localize('ordito.codeUpdate.tools', "Working in the Project…"),
		message: localize('ordito.codeUpdate.response', "Receiving the Provider Response…")
	};
	const toolLabels: Record<string, string> = {
		source_inspection: localize('ordito.codeUpdate.inspectingSources', "Inspecting the Affected Source Files…"),
		file_change: localize('ordito.codeUpdate.editingSources', "Updating Source Files…"),
		command_execution: localize('ordito.codeUpdate.runningCommands', "Running Project Commands…")
	};
	const requestId = generateUuid();
	let lastStatus: string | undefined;
	const progress = code.onDidAiProgress(event => {
		if (event.requestId !== requestId || token.isCancellationRequested) { return; }
		const status = event.kind === 'tool' && event.tool ? toolLabels[event.tool] ?? labels.tool : labels[event.kind];
		if (status !== lastStatus) { lastStatus = status; onProgress(status); }
	});
	try {
		onProgress(labels.connecting);
		return JSON.parse(await code.executeReconciliation({ operation: 'codeUpdate', requestId, root, config: JSON.stringify(config), context }, token));
	} finally { progress.dispose(); }
}
