/** Retry a failed package installation only for npm's transient network errors. */
export async function withNpmNetworkRetries<T>(install: () => Promise<T>, onRetry: (nextAttempt: number) => void, wait: (milliseconds: number) => Promise<void> = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))): Promise<T> {
	for (let attempt = 1; ; attempt++) {
		try {
			return await install();
		} catch (error) {
			if (attempt >= 3 || !(error instanceof Error) || !/^npm (?:error|ERR!) code (?:ECONNRESET|ETIMEDOUT|EAI_AGAIN)\b/m.test(error.message)) {
				throw error;
			}
			onRetry(attempt + 1);
			await wait(attempt * 1000);
		}
	}
}
