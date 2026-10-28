/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { mkdir, writeFile } from 'node:fs/promises';
import { semanticModelSchema } from '../../src/vs/workbench/contrib/ade/common/semanticModel.ts';

const directory = new URL('../schema/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL('model-v2.schema.json', directory), JSON.stringify(semanticModelSchema, null, '\t') + '\n');
