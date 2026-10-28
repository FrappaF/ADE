/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { EditorInputCapabilities, IUntypedEditorInput } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';

export class AdeInput extends EditorInput {
	static readonly ID = 'workbench.editor.ade';
	static readonly RESOURCE = URI.from({ scheme: 'ade-home', path: '/home' });
	override get typeId(): string { return AdeInput.ID; }
	override get editorId(): string { return AdeInput.ID; }
	override get capabilities(): EditorInputCapabilities { return EditorInputCapabilities.Readonly | EditorInputCapabilities.Singleton; }
	readonly resource = AdeInput.RESOURCE;
	override getName(): string { return localize('ade.home', "A.D.E Home"); }
	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		return super.matches(other) || other instanceof AdeInput;
	}
}
