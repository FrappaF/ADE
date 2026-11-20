# Ordito

**Design the software architecture and delegate the implementation to AI.**

Ordito is an open-source desktop IDE for software architects and engineering teams. Define what each component owns, how modules communicate, and what should happen when things go wrong. Ordito gives Codex or Claude Code your architecture as context for implementing a feature. You review the proposed code and verify it against the acceptance cases you define.

**[Try the Marketplace example](#try-an-example)** · [Build Ordito from source](#getting-started) · [Read the user guide](ordito/docs/user-guide/README.md)

[![MIT license](.github/badges/license.svg)](LICENSE.txt)
[![In development](.github/badges/status.svg)](#getting-started)
[![Desktop CI workflow](.github/badges/desktop-ci.svg)](https://github.com/FrappaF/Ordito/actions/workflows/desktop.yml)

![Ordito showing the checkout structure diagram alongside the checkout and returns features in Order Shop](ordito/docs/user-guide/images/02-canvas.png)

## From architecture to verified code

1. **Define the system in a shared model.** Sketch boundaries in C4, trace behavior in UML, and model data in an entity-relationship diagram. Reuse the same components and relationships across views. Define types, interfaces, and architecture decisions in the Structural Blueprint, then see which views and consumers a contract change affects. [Diagram atlas](ordito/docs/user-guide/README.md#part-iii---atlas-of-16-diagrams) · [Contracts and architecture decisions](ordito/docs/user-guide/README.md#l11-define-types-a-contract-and-an-architecture-decision)
2. **Give the AI a specific feature to implement.** Select the features to build and supply independent cases that describe the outcomes you expect. Ordito uses the model as implementation context and lets you answer clarifying questions when a domain decision is needed. [Generate code from diagrams](ordito/docs/user-guide/README.md#l18-generate-code-from-diagrams)
3. **Review the result against your design.** Inspect the proposed files, diffs, and links to the model in the Code OSS-based IDE. Run the independent cases and apply the proposal once verification passes. [See the AI code review](ordito/docs/user-guide/images/35-ai-code-review.png)

## What you can do with Ordito

- **Build checkout and returns from one design.** Define an `Order` contract once so checkout and returns use the same record. Delegate the first implementation to AI, then verify that two items at 1,250 cents produce an order for 2,500 cents and that a return is accepted on day 30 and rejected on day 31. [Marketplace starter project](ordito/examples/user-guide/07-marketplace-workshop/modules/ai-generation/README.md)
- **Change a business rule in an existing project.** Tighten checkout to accept only integer quantities from 1 through 10. Update the model, ask the AI to update the linked Node.js example, then review the diff and test zero, both limits, 11, and a decimal. [Update an existing codebase](ordito/docs/user-guide/README.md#update-an-existing-codebase)
- **Understand a codebase you just inherited.** Import the Marketplace sample to see how checkout and returns share an order store and publish local events. Follow findings to source and tests, or ask AI to propose architectural views with source references. The local inventory works without an AI account and has built-in semantic resolution for JavaScript, TypeScript, and TSX. [Codebase walkthrough](ordito/examples/user-guide/08-marketplace-codebase/README.md) · [Generate diagrams from source](ordito/docs/user-guide/README.md#l17-generate-checkout-and-returns-diagrams)
- **Test behavior while you're still designing.** Simulate an order's state transitions, or check how a queue and a topic route messages to consumers. The guided simulations run locally without a broker. [Order lifecycle](ordito/docs/user-guide/README.md#l14-simulate-the-order-lifecycle) · [Message delivery](ordito/docs/user-guide/README.md#l15-simulate-message-publication-and-delivery)

## Try an example

[Build and launch Ordito](#getting-started), then extract the [example projects](ordito/docs/user-guide/example-projects.zip) to a writable folder outside the clone. Keep the hidden `.ordito` directories.

### Generate your first implementation

Use Node.js 24.22.1 and an authenticated Codex or Claude Code CLI with a model configured in Ordito. [Connect a provider](ordito/docs/user-guide/README.md#connect-a-provider-and-start-generation)

1. Choose **Open Project** and open `07-marketplace-workshop/modules/ai-generation` from the extracted examples. It starts with checkout and returns diagrams and seven independent acceptance cases.
2. Choose **Code > Prepare Code from Diagrams**. Select the **JavaScript · Node.js 24.22.1 · No Framework** profile and the **Checkout** and **Returns** features. Keep the included verification cases and select **Prepare Code Changes**.
3. Open **Review AI Code Changes**, inspect the diffs, and select **Run Verification**. Once the seven cases pass, select **Apply to Project** to write the implementation locally. [Follow the full walkthrough](ordito/docs/user-guide/README.md#l18-generate-code-from-diagrams)

### Explore without an AI account

Choose **Open Project** and open `01-visual-workshop`. In **Checkout Structure**, select **Order**, choose **Rename**, enter a new name, and select **Save Changes**. Open **Returns Structure** to see the new name on the same resource. Select **Undo** to restore it. [Take the Order Shop tour](ordito/docs/user-guide/README.md#part-i---tour-of-order-shop)

## Getting started

Ordito is in active development and builds from source. Install Git, Python 3, the native build tools for your platform, and the pinned Node.js version. The setup command installs locked dependencies, builds Ordito, and prepares Electron. [Build prerequisites](ordito/docs/fork-development.md#from-a-clean-clone) · [Pinned Node.js version](.nvmrc)

### macOS and Linux

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

## Documentation

| I want to | Start here |
| --- | --- |
| Explore Ordito or build a model from scratch | [User guide](ordito/docs/user-guide/README.md) · [Offline HTML](ordito/docs/user-guide/Ordito-User-Guide.html) · [PDF](ordito/docs/user-guide/Ordito-User-Guide.pdf) |
| Pick a diagram type | [Atlas of 16 diagrams](ordito/docs/user-guide/README.md#part-iii---atlas-of-16-diagrams) |
| Try an AI-assisted workflow | [Source to diagrams](ordito/docs/user-guide/README.md#l17-generate-checkout-and-returns-diagrams) · [Diagrams to code](ordito/docs/user-guide/README.md#l18-generate-code-from-diagrams) |
| Build, test, or understand the repository | [Development guide](ordito/docs/fork-development.md) · [Architecture](ordito/docs/architecture.md) |

## Contributing

Read the contribution guide before reporting a bug, proposing a feature, or submitting a pull request. Use the security policy to report vulnerabilities privately. [Contributing](CONTRIBUTING.md) · [Report an issue](https://github.com/FrappaF/Ordito/issues) · [Security policy](SECURITY.md)

The desktop workflow runs on Linux and can include macOS when started manually. [GitHub Actions](https://github.com/FrappaF/Ordito/actions)

## License and attribution

Ordito is licensed under MIT. The recorded upstream revision identifies the Code OSS snapshot used for the fork. [MIT license](LICENSE.txt) · [Code OSS](https://github.com/microsoft/vscode) · [Upstream revision](ordito/upstream.json) · [Third-party notices](ThirdPartyNotices.txt)
