/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { readFile, writeFile } from 'node:fs/promises';
import { benchmarkReconciliation } from './reconciliationBenchmark.ts';

const [input, output] = process.argv.slice(2);
if (!input || !output || process.argv.length !== 4) { throw new Error('Usage: node ade/ai/reconciliation-benchmark.mjs CANDIDATES.json NEW_REPORT.json'); }
const controller = new AbortController();
process.once('SIGINT', () => controller.abort(new Error('Benchmark cancelled')));
const report = await benchmarkReconciliation(JSON.parse(await readFile(input, 'utf8')), controller.signal);
await writeFile(output, JSON.stringify(report, null, '\t') + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ report: output, defaultModel: report.defaultModel }));
