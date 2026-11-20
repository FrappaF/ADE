# ADE architecture

ADE is a Code OSS fork with a native ADE workbench contribution. Start with the [development guide](fork-development.md) to set up a working environment.

## Boundaries and dependencies

The domain lives in `src/vs/workbench/contrib/ade/common/`. It is pure TypeScript, independent of the filesystem, Node.js, the browser and workbench services. The native contribution adds UI and desktop adapters. The tools in `ade/` use the same domain.

```mermaid
flowchart TD
    UI[Native ADE contribution] --> Bridge[codeBridge JSON contract]
    Bridge --> Engine[ade/runtime/nativeHost]
    Engine --> AI[ade/ai]
    Engine --> Import[ade/code-import]
    AI --> Import
    Engine --> Storage[ade/runtime persistence and file changes]
    AI --> Storage
    Import --> Storage
    UI --> Domain[common domain]
    AI --> Domain
    Import --> Domain
    Messaging[ade/messaging] --> Domain
```

`ade/runtime/nativeHost.ts` composes the analysis process. It validates the protocol, coordinates import and AI operations, and keeps a separate cache for each engine instance. The importer is independent of AI and the dispatcher. The shared infrastructure modules `projectStore.ts`, `sourceChanges.ts` and `schemas.ts` are independent of application workflows.

The JSON contract in `common/codeBridge.ts` separates the renderer from the Node.js process. `ade/runtime/codeProtocol.ts` validates incoming requests. The bundle keeps the public name `adeCodeEngine.js`. The project format and protocol are independent of how the source files are organized.

## Semantic domain

The model supports legacy formats v2 and v3 and the v4 and v5 contracts. It represents semantic identities, visual projections, source evidence and verification separately. Architectural ownership comes from model declarations. Evidence from code syntax describes the source, while verification records describe executed behavior.

| Module in `common/` | Responsibility |
| --- | --- |
| `modelTypes.ts` | Document types, category identifiers and declared capabilities. |
| `modelSchema.ts` | Versioned JSON schemas and document shape validation. |
| `modelFoundation.ts` | Empty foundations, object inventory and recognition of evidence models. |
| `modelValidation.ts` | References, properties, diagnostics and reading validated snapshots or inspectable drafts. |
| `modelContractValidation.ts` | Contract compatibility and blueprint constraints. |
| `modelNotation.ts`, `modelScenario.ts` | Notation rules and partial ordering of scenarios. |
| `modelLegacyMigration.ts`, `modelMigration.ts` | Explicit migrations from legacy formats and to the v4 foundation. |
| `semanticModelService.ts` | In-memory model. Document adapters handle persistence. |
| `semanticModel.ts` | Compatibility entry point for the public API. Implementations import directly from the modules that define each API. |

The schema artifacts in `ade/schema/` are verified against the source. Preserve the document grammar when restructuring code.

## Atomic edits and runtimes

`visualEditTypes.ts` declares the discriminated union of operations. `visualEditing.ts` prepares one candidate and exhaustively dispatches each operation to the relevant handler in `visualEditFoundation.ts`, `visualEditElements.ts`, `visualEditViews.ts` or `visualEditBehavior.ts`. Identities, revisions and validation are handled at the transaction boundary. `visualEditSupport.ts` provides conservative updates and computes dependencies for deletion.

The domain compiles, interprets and verifies interactions, state machines and messaging. Import `interactionRuntime.ts` and `stateRuntime.ts` directly. The modules they depend on avoid re-exporting their generators to prevent dependency cycles.

The scripts `build-interaction-runtime.mjs`, `build-state-runtime.mjs` and `build-messaging-runtime.mjs` share `ade/runtime/runtimeSource.ts`. This module uses the TypeScript parser to find declarations by name, reports missing or ambiguous declarations and generates JavaScript. Generation is independent of comment headings and function order. Regenerate `*.generated.ts` artifacts with their scripts. A compatibility test pins the hashes of the three generated interpreters because managed regions in projects require an exact runtime match.

## Native workbench contribution

`browser/ade.contribution.ts` registers the editor, views and commands. `AdeProjectService` uses native text services to manage the document. These adapters handle saving, backups, conflicts and history. Navigation, layout, selection and model analysis use pure domain functions.

| Component | Responsibility |
| --- | --- |
| `AdeEditor` | Editor lifecycle, composition and navigation. |
| `AdeCanvasController` | Camera, zoom, pan, node movement and listeners scoped to each render. |
| `AdeCanvasSurface` | Canvas rendering, menus and connection creation. |
| `AdeInspector` | Properties for the selected elements and relationships. |
| `AdeWorkflowContent` | Workflow panels, AI settings and secondary tools. |

The controller registers its listeners in a `DisposableStore`, clears the store on each subsequent render and disposes it with the editor. Each notation has its own renderer module. Components receive their services and callbacks explicitly and are independent of the editor class.

`adeEditingCommands.ts` defines the edit command catalog. `adeEditing.ts` tracks the document revision and controls when edits are applied. The handlers `adeEditingProject.ts`, `adeEditingSpecification.ts`, `adeEditingStructure.ts` and `adeEditingDiagram.ts` collect user intentions through dialogs. When adding a command, extend the typed dispatch to cover it.

## AI workflows

`electron-browser/adeAiService.ts` coordinates independent components.

| Component | Responsibility |
| --- | --- |
| `AdeAiConnection` | Provider account, original CLI, models and configuration. |
| `AdeAiDiagrams` | Diagram conversation, exploration, generation and review. |
| `AdeAiStructural` | Continuous preparation, structural review, simulation and publishing. |
| `AdeAiImplementation` | Implementation proposals, reconciliation, verification and model comparisons. |

Each component owns its workflow sessions and resources. The coordinator shares the operation lock, cancellation, progress and notifications through a context that exposes the capabilities each workflow needs. Execution options select the AI, diagram or local mode. Constructors receive the required services. The instantiation service is used only during initial composition.

Each workflow prepares changes for review and provides a way to apply them. Its contract covers budget, consent to share context, verification, recovery and undo. The [user guide](user-guide/README.md) explains how to import, generate and verify from the interface.

## Testing and maintenance

The independent Node.js packages are `ade/runtime`, `ade/code-import`, `ade/ai` and `ade/messaging`. Each has pinned dependencies and TypeScript checks. `ade/tsconfig.tools.json` defines shared options and keeps AI configuration independent of the importer. Domain tests live in `ade/test/`, and native contribution tests live in `src/vs/workbench/contrib/ade/test/`.

To work on the tools alone, select the Node.js version in `.nvmrc` and install the packages you need.

```sh
npm --prefix ade/runtime ci --ignore-scripts
npm --prefix ade/code-import ci --ignore-scripts
npm --prefix ade/ai ci --ignore-scripts
npm --prefix ade/messaging ci --ignore-scripts
npm run ade:test
npm --prefix ade/runtime run check
npm --prefix ade/runtime test
npm --prefix ade/code-import run check
npm --prefix ade/code-import test
npm --prefix ade/ai run check
npm --prefix ade/ai test
```

The architecture tests check for runtime dependency cycles, verify that the domain and importer are independent, and ensure that desktop scenarios can resolve shared names. The suite also checks that runtime generation is independent of comments and declaration order.

For the native contribution, complete setup in the [development guide](fork-development.md), then use `npm run ade:check`, `npm run ade:smoke:check`, the client build required by your test and `npm run ade:ai:service-test`. Run the desktop smoke tests through `ade/scripts/smoke-desktop.mjs`. Launch, isolation and error collection live in `ade/scripts/smoke/harness.ts`, shared interactions in `helpers.ts` and scenarios in their own modules.

`ade/prototype/` preserves the original prototype and compatibility tests. The native app has its own launcher.
