import './source-loader.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
const { semanticModelSchema, semanticModelV3Schema, semanticModelV4Schema, semanticModelV5Schema } = await import('../../src/vs/workbench/contrib/ordito/common/modelSchema.ts');

const directory = new URL('../schema/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL('model-v2.schema.json', directory), JSON.stringify(semanticModelSchema, null, '\t') + '\n');
await writeFile(new URL('model-v3.schema.json', directory), JSON.stringify(semanticModelV3Schema, null, '\t') + '\n');
await writeFile(new URL('model-v4.schema.json', directory), JSON.stringify(semanticModelV4Schema, null, '\t') + '\n');
await writeFile(new URL('model-v5.schema.json', directory), JSON.stringify(semanticModelV5Schema, null, '\t') + '\n');
