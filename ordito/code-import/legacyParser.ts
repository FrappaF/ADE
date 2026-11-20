import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

/** Narrow read-only AST interface shared by the two supported grammar ABIs. */
export interface SyntaxNode {
	type: string; text: string; startIndex: number; endIndex: number;
	startPosition: { row: number; column: number }; endPosition: { row: number; column: number };
	hasError: boolean; isError: boolean; isMissing: boolean; namedChildren: SyntaxNode[];
	childForFieldName(name: string): SyntaxNode | null;
}
interface LegacyNode extends Omit<SyntaxNode, 'hasError' | 'isMissing' | 'isError' | 'namedChildren' | 'childForFieldName'> {
	hasError(): boolean; isMissing(): boolean; namedChildren: LegacyNode[]; childForFieldName(name: string): LegacyNode | null;
}
interface LegacyLanguage { readonly version: number }
interface LegacyRuntime {
	new(): { setLanguage(language: LegacyLanguage): void; parse(source: string): { rootNode: LegacyNode; delete(): void }; delete(): void };
	init(): Promise<void>;
	Language: { load(path: string): Promise<LegacyLanguage> };
}
const runtime = fileURLToPath(new URL('./legacy-runtime.cjs', import.meta.url));
const Parser = createRequire(import.meta.url)(existsSync(runtime) ? runtime : 'legacy-tree-sitter') as LegacyRuntime;
let initialized: Promise<void> | undefined;
const languages = new Map<string, Promise<LegacyLanguage>>();

/** Compatibility is isolated here; modern grammars retain the current runtime. */
function wrap(node: LegacyNode): SyntaxNode {
	return {
		get type() { return node.type; }, get text() { return node.text; },
		get startIndex() { return node.startIndex; }, get endIndex() { return node.endIndex; },
		get startPosition() { return node.startPosition; }, get endPosition() { return node.endPosition; },
		get hasError() { return node.hasError(); }, get isError() { return node.type === 'ERROR'; }, get isMissing() { return node.isMissing(); },
		get namedChildren() { return node.namedChildren.map(child => wrap(child)); },
		childForFieldName(name) { const child = node.childForFieldName(name); return child ? wrap(child) : null; }
	};
}

/** The returned tree owns both native allocations and is disposed by the importer. */
export async function parseLegacy(grammar: string, source: string): Promise<{ rootNode: SyntaxNode; delete(): void }> {
	initialized ??= Parser.init();
	await initialized;
	let language = languages.get(grammar);
	if (!language) { language = Parser.Language.load(grammar); languages.set(grammar, language); }
	const parser = new Parser();
	try {
		parser.setLanguage(await language);
		const tree = parser.parse(source);
		return { rootNode: wrap(tree.rootNode), delete: () => { tree.delete(); parser.delete(); } };
	} catch (error) { parser.delete(); throw error; }
}
