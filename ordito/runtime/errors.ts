/** Read filesystem error codes without accepting inherited properties. */
export function errorCode(error: unknown): string | undefined {
	return error instanceof Error && Object.hasOwn(error, 'code') ? (error as NodeJS.ErrnoException).code : undefined;
}
