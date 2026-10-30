/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Syntax coverage is distinct from semantic resolution and runtime observation. */
export interface LanguageAdapter {
	id: string;
	grammar: string;
	extensions: string[];
	containers: string[];
	contracts: string[];
	callables: string[];
	imports: string[];
	/** Known constructs requiring a richer adapter; never silently converted to facts. */
	unsupported: string[];
}

/** Each entry has an executable fixture. No toolchain or project code is executed. */
export const languageAdapters: readonly LanguageAdapter[] = [
	{ id: 'javascript', grammar: 'javascript', extensions: ['.js', '.jsx', '.mjs', '.cjs'], containers: ['class_declaration'], contracts: [], callables: ['function_declaration', 'generator_function_declaration', 'method_definition'], imports: ['import_statement', 'export_statement'], unsupported: ['call_expression', 'new_expression'] },
	{ id: 'typescript', grammar: 'typescript', extensions: ['.ts', '.mts', '.cts'], containers: ['class_declaration', 'abstract_class_declaration', 'enum_declaration'], contracts: ['interface_declaration', 'type_alias_declaration'], callables: ['function_declaration', 'generator_function_declaration', 'method_definition', 'function_signature'], imports: ['import_statement', 'export_statement'], unsupported: ['call_expression', 'new_expression', 'internal_module'] },
	{ id: 'tsx', grammar: 'tsx', extensions: ['.tsx'], containers: ['class_declaration'], contracts: ['interface_declaration', 'type_alias_declaration'], callables: ['function_declaration', 'method_definition'], imports: ['import_statement', 'export_statement'], unsupported: ['call_expression', 'new_expression', 'jsx_element', 'jsx_self_closing_element'] },
	{ id: 'python', grammar: 'python', extensions: ['.py', '.pyi'], containers: ['class_definition'], contracts: [], callables: ['function_definition'], imports: ['import_statement', 'import_from_statement'], unsupported: ['call', 'decorator'] },
	{ id: 'java', grammar: 'java', extensions: ['.java'], containers: ['class_declaration', 'enum_declaration', 'record_declaration'], contracts: ['interface_declaration', 'annotation_type_declaration'], callables: ['method_declaration', 'constructor_declaration'], imports: ['import_declaration'], unsupported: ['method_invocation', 'object_creation_expression'] },
	{ id: 'csharp', grammar: 'c_sharp', extensions: ['.cs'], containers: ['class_declaration', 'struct_declaration', 'record_declaration', 'enum_declaration'], contracts: ['interface_declaration'], callables: ['method_declaration', 'constructor_declaration', 'local_function_statement'], imports: ['using_directive'], unsupported: ['invocation_expression', 'object_creation_expression', 'preproc_if'] },
	{ id: 'c', grammar: 'c', extensions: ['.c', '.h'], containers: ['struct_specifier', 'union_specifier', 'enum_specifier'], contracts: [], callables: ['function_definition'], imports: ['preproc_include'], unsupported: ['call_expression', 'preproc_function_def', 'preproc_if', 'preproc_ifdef'] },
	{ id: 'cpp', grammar: 'cpp', extensions: ['.cpp', '.cc', '.cxx', '.hpp', '.hh', '.hxx'], containers: ['class_specifier', 'struct_specifier', 'union_specifier', 'enum_specifier'], contracts: [], callables: ['function_definition'], imports: ['preproc_include'], unsupported: ['call_expression', 'preproc_function_def', 'preproc_if', 'preproc_ifdef', 'template_declaration'] },
	{ id: 'go', grammar: 'go', extensions: ['.go'], containers: ['type_spec'], contracts: [], callables: ['function_declaration', 'method_declaration'], imports: ['import_declaration'], unsupported: ['call_expression'] },
	{ id: 'rust', grammar: 'rust', extensions: ['.rs'], containers: ['struct_item', 'enum_item', 'impl_item'], contracts: ['trait_item', 'type_item'], callables: ['function_item', 'function_signature_item'], imports: ['use_declaration', 'extern_crate_declaration'], unsupported: ['call_expression', 'macro_invocation'] },
	{ id: 'php', grammar: 'php', extensions: ['.php'], containers: ['class_declaration', 'trait_declaration', 'enum_declaration'], contracts: ['interface_declaration'], callables: ['function_definition', 'method_declaration'], imports: ['namespace_use_declaration'], unsupported: ['function_call_expression', 'member_call_expression', 'scoped_call_expression', 'include_expression', 'require_expression'] },
	{ id: 'ruby', grammar: 'ruby', extensions: ['.rb', '.rake'], containers: ['class', 'module', 'singleton_class'], contracts: [], callables: ['method', 'singleton_method'], imports: [], unsupported: ['call'] },
	{ id: 'swift', grammar: 'swift', extensions: ['.swift'], containers: ['class_declaration'], contracts: ['protocol_declaration'], callables: ['function_declaration', 'init_declaration'], imports: ['import_declaration'], unsupported: ['call_expression', 'macro_invocation'] },
	{ id: 'dart', grammar: 'dart', extensions: ['.dart'], containers: ['class_definition', 'enum_declaration', 'extension_declaration', 'mixin_declaration'], contracts: ['type_alias'], callables: ['function_signature', 'method_signature'], imports: ['import_or_export'], unsupported: ['selector'] }
];
