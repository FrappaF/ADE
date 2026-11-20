import { basename, dirname, isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';

export const orditoMetadataNames = ['.ordito', '.ade'] as const;
export const orditoImportedModelNames = ['model.ordito.json', 'model.ade.json'] as const;

export function isOrditoMetadataDirectory(resource: URI): boolean {
	return orditoMetadataNames.some(name => name === basename(resource));
}

export function isOrditoImportedModel(resource: URI): boolean {
	return orditoImportedModelNames.some(name => name === basename(resource));
}

export function isOrditoProjectModelPath(path: string): boolean {
	return orditoMetadataNames.some(name => path === `${name}/model.json` || path.endsWith(`/${name}/model.json`));
}

export function orditoSnapshotMetadataDirectory(root: URI, snapshot: string): URI {
	const imports = dirname(URI.file(snapshot));
	const metadata = dirname(imports);
	return basename(imports) === 'imports' && isOrditoMetadataDirectory(metadata) && isEqual(dirname(metadata), root)
		? metadata : URI.joinPath(root, orditoMetadataNames[0]);
}

/** Keep existing journals and snapshots at their original paths. */
export async function resolveOrditoMetadataDirectory(files: IFileService, root: URI): Promise<URI> {
	const current = URI.joinPath(root, orditoMetadataNames[0]);
	if (await files.exists(current)) { return current; }
	const legacy = URI.joinPath(root, orditoMetadataNames[1]);
	return await files.exists(legacy) ? legacy : current;
}
