# Developing ADE from source

## From a clean clone

Install Git, Python 3, a C/C++ compiler and the Node.js version specified in [`.nvmrc`](../../.nvmrc), including its npm. Setup downloads npm dependencies, Node.js headers, Electron and the built-in extensions.

- On **macOS**, install the Command Line Tools with `xcode-select --install`. Check `xcode-select -p`, `xcrun --find clang` and `python3 --version`. Use an ARM64 build of Node.js on Apple Silicon.
- On **Debian and Ubuntu**, install `build-essential pkg-config libx11-dev libxkbfile-dev libkrb5-dev libsecret-1-dev libgtk-3-dev libgbm-dev libnss3 libasound2-dev xvfb xauth`. Package names can vary by distribution.
- On **Windows**, follow the [Code OSS prerequisites for Visual Studio and C++](https://github.com/microsoft/vscode/wiki/How-to-Contribute#prerequisites). ADE's desktop CI covers Linux and macOS.

On macOS and Linux, run these commands from the root of your clone with `nvm` installed.

```sh
nvm install
nvm use
npm run ade:setup
./ade/scripts/dev.sh
```

If you use another Node.js version manager, select the same version. `ade:setup` prepares the headers, installs dependencies from the lockfiles, builds the client, ADE engine and extensions, and prepares Electron. Run `npm run ade:setup -- --install-only` to install dependencies only, or `npm run ade:setup -- --help` to list the options.

On macOS and Linux, `./ade/scripts/dev.sh /path/to/project` opens a specific folder and uses a development profile under `.build/`. On Windows, run `scripts\code.bat --user-data-dir .build\ade-profile --extensions-dir .build\ade-extensions` after setup. The first launch may require internet access to download built-in extensions.

After updating your clone, close ADE and run `npm run ade:setup` again. During development, use `npm run build-fast -- --client-only` to rebuild the client with up-to-date dependencies.

## Verify a change

```sh
npm run ade:test
npm run ade:check
npm run ade:smoke:check
```

`ade:test` runs the domain tests. `ade:check` checks TypeScript types and `ade:smoke:check` type-checks the desktop smoke tests. To try the built app, run `node ade/scripts/smoke-desktop.mjs --native-only`. Prefix the command with `xvfb-run -a` on Linux without a display.

The tools in `ade/runtime`, `ade/code-import`, `ade/ai` and `ade/messaging` have their own lockfiles and tests. Use the [architecture overview](architecture.md) to find the package to check. GitHub Actions runs checks and desktop smoke tests on Linux. To run the macOS smoke tests, start the **ADE desktop** workflow manually.

## Update the Code OSS base

The upstream revision is recorded in [`ade/upstream.json`](../upstream.json). To try an update in a dedicated worktree, run `node ade/scripts/prepare-upstream.mjs FULL_SHA /absolute/path/to/new-worktree`. The script applies the diff between revisions and stops if it touches Microsoft workflows. The upstream workflows are stored as `.disabled` files in `ade/upstream-workflows/`. Before integrating the update, check the ADE contribution registration, the product settings and the checks affected by the diff.
