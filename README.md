# <img src="ordito/docs/branding/ordito-logo.webp" alt="Ordito" width="340">

**An open-source desktop IDE for software architects who want to delegate implementation to AI.**

Focus on how the system should work. In Ordito, the boundaries, contracts, and behavior you define in a visual model guide what Codex or Claude Code implements. When the code is ready for review, the same model gives you the context to judge whether it fits the design.

**[Build and launch Ordito](#getting-started)** · [Read the user guide](ordito/docs/user-guide/README.md)

[![MIT license](.github/badges/license.svg)](LICENSE.txt)
[![In development](.github/badges/status.svg)](#getting-started)
[![Desktop CI workflow](.github/badges/desktop-ci.svg)](https://github.com/FrappaF/Ordito/actions/workflows/desktop.yml)

## From architecture to implementation

1. **Design the system in a shared model.** Reuse components and relationships across C4, UML, and entity-relationship diagrams. Define responsibilities, interfaces, and data in the Structural Blueprint and record why you made those choices. When a contract changes, inspect the views and references it affects.
2. **Delegate one feature at a time.** Select the feature and supply independent acceptance cases that capture the outcomes you expect. Ordito passes the relevant design to the AI and lets you resolve questions about behavior or constraints during generation.
3. **Verify before applying changes.** Inspect the proposed files, diffs, and references to the model in the Code OSS-based IDE. Run your acceptance cases against the generated code, then apply the changes locally when verification passes.

You can also start from an existing codebase. Build a local source inventory, jump from findings to declarations, or ask AI to draft architectural views you can check against the source. On supported profiles, you can simulate interactions, state transitions, and message delivery while refining the design.

## Getting started

Ordito is in active development. To build it from source, install Git, Python 3, the native build tools for your platform, and the pinned Node.js version. [Build prerequisites](ordito/docs/fork-development.md#from-a-clean-clone) · [Pinned Node.js version](.nvmrc)

### macOS and Linux

Check [GitHub Releases](https://github.com/FrappaF/Ordito/releases) for desktop previews for macOS (Apple Silicon and Intel) and Linux (x86-64).

With `nvm` installed, run the following commands.

```bash
git clone https://github.com/FrappaF/Ordito.git
cd Ordito
nvm install
nvm use
npm run ordito:setup
./ordito/scripts/dev.sh
```

### Windows

After installing the native build tools and selecting the version of Node.js in `.nvmrc`, run the following commands in PowerShell.

```powershell
git clone https://github.com/FrappaF/Ordito.git
cd Ordito
npm run ordito:setup
.\scripts\code.bat --user-data-dir .build\ordito-profile --extensions-dir .build\ordito-extensions
```

### Open your own project

From the start screen, choose **Create Project** to design a new system or **Import Codebase** to examine an existing one. Manual modeling and local source inventory work without an AI account. The importer provides built-in semantic resolution for JavaScript, TypeScript, and TSX.

To delegate a feature, connect an authenticated Codex or Claude Code CLI, select a model in Ordito, and open **Code > Prepare Code from Diagrams**. This workflow currently supports framework-free JavaScript ES modules on Node.js 24.22.1. [Connect a provider](ordito/docs/user-guide/README.md#connect-a-provider-and-start-generation) · [Generate code from diagrams](ordito/docs/user-guide/README.md#l18-generate-code-from-diagrams)

## Documentation

- [User guide](ordito/docs/user-guide/README.md) · [Offline HTML](ordito/docs/user-guide/Ordito-User-Guide.html) · [PDF](ordito/docs/user-guide/Ordito-User-Guide.pdf)
- [Atlas of 16 diagrams](ordito/docs/user-guide/README.md#part-iii---atlas-of-16-diagrams)
- [Development guide](ordito/docs/fork-development.md) · [Ordito architecture](ordito/docs/architecture.md)

## Contributing

Read the contribution guide before reporting a bug, proposing a feature, or submitting a pull request. Use the security policy to report vulnerabilities privately. [Contributing](CONTRIBUTING.md) · [Report an issue](https://github.com/FrappaF/Ordito/issues) · [Security policy](SECURITY.md)

## License and attribution

Ordito is licensed under MIT. The recorded upstream revision identifies the Code OSS snapshot used for the fork. [MIT license](LICENSE.txt) · [Code OSS](https://github.com/microsoft/vscode) · [Upstream revision](ordito/upstream.json) · [Third-party notices](ThirdPartyNotices.txt)
