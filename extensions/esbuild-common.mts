/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { stat } from 'node:fs/promises';
import path from 'node:path';
import esbuild from 'esbuild';
import { BuildLifecycle } from '../build/lib/buildEvents.ts';

export interface RunConfig {
	readonly srcDir: string;
	readonly outdir: string;
	readonly outputSubdirectory?: string;
	readonly entryPoints: esbuild.BuildOptions['entryPoints'];
	readonly additionalOptions?: Partial<esbuild.BuildOptions>;
	readonly additionalWatchPaths?: readonly string[];
	readonly beforeBuild?: () => Promise<unknown> | unknown;
}

// `esbuild.stop()` shuts down the single esbuild service shared by all concurrent builds, so we
// must only call it once no builds are in flight. Otherwise a finishing build would tear down the
// service while a sibling build (e.g. running in the same `Promise.all`) is still using it.
const buildLifecycle = new BuildLifecycle(undefined, () => esbuild.stop());

async function buildOnce(
	options: esbuild.BuildOptions,
	beforeBuild?: () => Promise<unknown> | unknown,
	didBuild?: () => Promise<unknown> | unknown,
): Promise<esbuild.BuildResult> {
	const complete = buildLifecycle.start();
	let failed = false;
	try {
		await beforeBuild?.();
		const result = await esbuild.build(options);
		await didBuild?.();
		return result;
	} catch (error) {
		failed = true;
		throw error;
	} finally {
		complete(failed);
	}
}

/**
 * Shared build/watch runner for extension esbuild scripts.
 */
export async function runBuild(
	config: RunConfig,
	baseOptions: esbuild.BuildOptions,
	args: string[],
	didBuild?: (outDir: string) => unknown,
): Promise<void> {
	let outdir = config.outdir;
	const outputRootIndex = args.indexOf('--outputRoot');
	if (outputRootIndex >= 0) {
		const outputRoot = args[outputRootIndex + 1];
		outdir = path.join(outputRoot, config.outputSubdirectory ?? path.basename(outdir));
	}

	const resolvedOptions: esbuild.BuildOptions = {
		...baseOptions,
		entryPoints: config.entryPoints,
		outdir,
		...(config.additionalOptions || {}),
	};

	const isWatch = args.indexOf('--watch') >= 0;
	if (isWatch) {
		await watchWithParcel(
			resolvedOptions,
			config.srcDir,
			config.additionalWatchPaths ?? [],
			config.beforeBuild,
			() => didBuild?.(outdir),
		);
	} else {
		try {
			await buildOnce(resolvedOptions, config.beforeBuild, () => didBuild?.(outdir));
		} catch (error) {
			console.error(error);
			process.exitCode = 1;
		}
	}
}

// We use @parcel/watcher as it has much lower cpu usage when idle compared to esbuild's watch mode
async function watchWithParcel(
	options: esbuild.BuildOptions,
	srcDir: string,
	additionalWatchPaths: readonly string[],
	beforeBuild?: () => Promise<unknown> | unknown,
	didBuild?: () => Promise<unknown> | unknown,
): Promise<void> {
	let debounce: ReturnType<typeof setTimeout> | undefined;
	const rebuild = () => {
		if (debounce) {
			clearTimeout(debounce);
		}
		debounce = setTimeout(async () => {
			try {
				// Also instead of retaining the esbuild context, we are re-running the entire build on each change.
				// This reduces memory usage since most projects don't need to be re-built often.
				await buildOnce(options, beforeBuild, didBuild);
			} catch (error) {
				console.error('[watch] build error:', error);
			}
		}, 100);
	};

	const watcher = await import('@parcel/watcher');

	const subscribe = async (watchPath: string, ignore: readonly string[]) => {
		const watchPathStat = await stat(watchPath);
		const watchedFile = watchPathStat.isDirectory() ? undefined : path.resolve(watchPath);
		const watchRoot = watchedFile ? path.dirname(watchedFile) : watchPath;
		const ignoredOutputPaths: string[] = [];
		if (options.outdir) {
			const relativeOutput = path.relative(watchRoot, options.outdir);
			// An output directory above the watch root must not hide the source files.
			if (relativeOutput && relativeOutput !== '..' && !relativeOutput.startsWith(`..${path.sep}`) && !path.isAbsolute(relativeOutput)) {
				const outdirGlob = path.resolve(options.outdir).replace(/\\/g, '/');
				ignoredOutputPaths.push(outdirGlob, `${outdirGlob}/**`);
			}
		}
		return watcher.subscribe(watchRoot, (error, events) => {
			if (error) {
				console.error('[watch] watcher error:', error);
				return;
			}
			if (!watchedFile || events.some(event => path.resolve(event.path) === watchedFile)) {
				rebuild();
			}
		}, {
			ignore: [...ignore, ...ignoredOutputPaths, path.resolve(watchRoot, 'node_modules'), path.resolve(watchRoot, '.git')],
		});
	};
	await Promise.all([
		subscribe(srcDir, ['**/node_modules/**', '**/dist/**', '**/out/**']),
		...additionalWatchPaths.map(watchPath => subscribe(watchPath, [])),
	]);
	rebuild();
}
