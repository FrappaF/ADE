/** Collects changes throughout initialization, then hands them to the serialized rebuild queue. */
export async function watchBuild<T>(subscribe: (listener: (change: T) => void) => void, initialize: () => Promise<void>, enqueue: (change: T) => void, rebuild: () => Promise<void>): Promise<void> {
	let initializing = true;
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	subscribe(change => {
		enqueue(change);
		if (!initializing) {
			clearTimeout(debounceTimer);
			debounceTimer = setTimeout(() => void rebuild(), 200);
		}
	});
	try {
		await initialize();
	} finally {
		initializing = false;
		await rebuild();
	}
}
