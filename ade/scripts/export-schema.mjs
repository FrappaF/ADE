/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { mkdir, writeFile } from 'node:fs/promises';
import { semanticModelSchema, semanticModelV3Schema, semanticModelV4Schema } from '../../src/vs/workbench/contrib/ade/common/semanticModel.ts';

const directory = new URL('../schema/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL('model-v2.schema.json', directory), JSON.stringify(semanticModelSchema, null, '\t') + '\n');
await writeFile(new URL('model-v3.schema.json', directory), JSON.stringify(semanticModelV3Schema, null, '\t') + '\n');
await writeFile(new URL('model-v4.schema.json', directory), JSON.stringify(semanticModelV4Schema, null, '\t') + '\n');
