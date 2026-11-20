# SCIP fixture provenance

These fixtures come from real indexing runs with Node.js 24.22.1 on Linux. The regular test suite reads the saved local indexes. The indexes provide the alias relationships directly, so tests can run offline without installing indexers.

| Fixture | Indexer | Version | Position encoding |
| --- | --- | --- | --- |
| `typescript.scip.json` | `@sourcegraph/scip-typescript` | 0.6.0 | UTF-16, selected explicitly as the fallback because the indexer omits `position_encoding` |
| `python.scip.json` | `@sourcegraph/scip-python` | 0.6.8 | UTF-16, TypeScript/Pyright implementation |

Both projects define `charge` in `gateway` and import it as `pay` in `checkout`. A supplementary Unicode character preceding the reference tests the offsets. The payload retains parameters and a local variable so the tests can verify that ADE excludes them when identifying represented declarations.

The binary indexes were decoded with the official protobuf bindings in `@sourcegraph/scip-typescript/dist/src/scip.js` using `scip.Index.deserializeBinary(...).toObject()`. The JSON retains metadata, paths, languages, ranges, symbols, roles, symbol relationships and the default empty Proto3 documentation text. Extended documentation, syntax highlighting and context ranges unused by the bridge were removed. The sole identifying field changed is `metadata.project_root = "file:///SCIP_FIXTURE/"`. Each test points it at its own temporary copy of the sources.

## Regenerate the fixtures

From the ADE repository root, select the Node.js version in `.nvmrc`. Install the indexers in a separate directory and generate the binary indexes.

```sh
mkdir -p /tmp/ade-scip-tools
npm --prefix /tmp/ade-scip-tools install --ignore-scripts @sourcegraph/scip-typescript@0.6.0 @sourcegraph/scip-python@0.6.8
node /tmp/ade-scip-tools/node_modules/@sourcegraph/scip-typescript/dist/src/main.js index --cwd "$PWD/ade/code-import/test/fixtures/scip/typescript" --output /tmp/ade-typescript.scip --no-progress-bar
printf '[]\n' > /tmp/ade-python-environment.json
node /tmp/ade-scip-tools/node_modules/@sourcegraph/scip-python/index.js index --cwd "$PWD/ade/code-import/test/fixtures/scip/python" --project-name ade-scip-checkout --project-version 1.0.0 --environment /tmp/ade-python-environment.json --output /tmp/ade-python.scip --quiet
```

Decode the indexes and keep the same fields as the fixtures. The TypeScript project declares its name and version in its own `package.json`. The Python command passes its name and version explicitly so local Git revisions have no effect on the output. The empty Python environment disables implicit collection of pip packages. The demo indexer `produce-scip.mjs` uses `ade-local` and `0` for Python, which yields different package identifiers and the same local relationships.

| Source | SHA-256 |
| --- | --- |
| `typescript/checkout.ts` | `55a95c5750c6bc03c7dcdd492cc876e41f20ec0c56acf8e5656ec3cd9899dae1` |
| `typescript/gateway.ts` | `f7ee15c123f7cebe244dabda97483f2d3ecf57daef1c9bae105137395e0fce74` |
| `python/checkout.py` | `9e3e1bd9629821f528936966dc7323ef6a2b2fcd8afbea7fcdc4875084602341` |
| `python/gateway.py` | `7f058bb949d1bad2eb922900b133967a4fbbf0cfe5eabb6b33ace9723ef801a8` |

The negative and encoding variants in the tests are transformations of these indexes. The backend runs that produced the fixtures are described above. The indexers and bindings are optional external dependencies whose code stays outside the ADE tool. [SCIP schema](https://github.com/scip-code/scip/blob/main/scip.proto) · [CLI JSON](https://github.com/scip-code/scip/blob/main/docs/CLI.md) · [scip-typescript](https://github.com/sourcegraph/scip-typescript) · [scip-python](https://github.com/sourcegraph/scip-python/tree/scip)
