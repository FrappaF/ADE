# Provenienza delle fixture SCIP

Queste fixture provengono da indicizzazioni reali eseguite con Node 24.22.1 su Linux. I test ordinari leggono questi dati locali; non installano indicizzatori, non contattano servizi e non simulano la risoluzione degli alias mediante confronti testuali.

| Fixture | Produttore | Versione | Posizioni |
| --- | --- | --- | --- |
| `typescript.scip.json` | `@sourcegraph/scip-typescript` | 0.6.0 | UTF-16, fallback esplicito perché il produttore omette `position_encoding` |
| `python.scip.json` | `@sourcegraph/scip-python` | 0.6.8 | UTF-16, implementazione TypeScript/Pyright |

Entrambi i progetti definiscono `charge` in `gateway` e la importano come `pay` in `checkout`. Un carattere supplementare prima del riferimento verifica gli offset Unicode. Parametri e una variabile locale restano nel payload per controllare che non vengano scambiati per dichiarazioni ADE rappresentate.

Gli indici binari sono stati decodificati con i binding protobuf ufficiali in `@sourcegraph/scip-typescript/dist/src/scip.js`, tramite `scip.Index.deserializeBinary(...).toObject()`. I JSON conservano metadata, percorsi, linguaggio, range, simboli, ruoli, relazioni dei simboli e il testo documentale vuoto predefinito Proto3. Documentazione estesa, evidenziazione sintattica e range di contesto non usati dal ponte sono stati rimossi. La sola sostituzione nei dati identificativi è `metadata.project_root = "file:///SCIP_FIXTURE/"`; ogni test la ricollega alla propria copia temporanea dei sorgenti.

## Rigenerazione

Dalla radice ADE, dopo aver selezionato Node dalla `.nvmrc`, installare gli strumenti in una cartella separata e generare i binari senza eseguire le applicazioni:

```sh
mkdir -p /tmp/ade-scip-tools
npm --prefix /tmp/ade-scip-tools install --ignore-scripts @sourcegraph/scip-typescript@0.6.0 @sourcegraph/scip-python@0.6.8
node /tmp/ade-scip-tools/node_modules/@sourcegraph/scip-typescript/dist/src/main.js index --cwd "$PWD/ade/code-import/test/fixtures/scip/typescript" --output /tmp/ade-typescript.scip --no-progress-bar
printf '[]\n' > /tmp/ade-python-environment.json
node /tmp/ade-scip-tools/node_modules/@sourcegraph/scip-python/index.js index --cwd "$PWD/ade/code-import/test/fixtures/scip/python" --project-name ade-scip-checkout --project-version 1.0.0 --environment /tmp/ade-python-environment.json --output /tmp/ade-python.scip --quiet
```

Decodificare e ridurre i risultati con gli stessi campi delle fixture. Il progetto TypeScript dichiara nome/versione nel proprio `package.json`; la versione e il nome Python sono passati esplicitamente per non dipendere dalla revisione Git locale. L'ambiente Python vuoto disabilita la raccolta implicita dei pacchetti pip. Il produttore dimostrativo `produce-scip.mjs` usa invece `ade-local`/`0` per Python: produce identificatori di pacchetto diversi ma gli stessi collegamenti locali.

| Sorgente | SHA-256 |
| --- | --- |
| `typescript/checkout.ts` | `55a95c5750c6bc03c7dcdd492cc876e41f20ec0c56acf8e5656ec3cd9899dae1` |
| `typescript/gateway.ts` | `f7ee15c123f7cebe244dabda97483f2d3ecf57daef1c9bae105137395e0fce74` |
| `python/checkout.py` | `9e3e1bd9629821f528936966dc7323ef6a2b2fcd8afbea7fcdc4875084602341` |
| `python/gateway.py` | `7f058bb949d1bad2eb922900b133967a4fbbf0cfe5eabb6b33ace9723ef801a8` |

Le varianti negative e delle codifiche nei test sono trasformazioni esplicite di questi dati: non rappresentano nuovi collaudi di backend. Fonti primarie: [schema SCIP](https://github.com/scip-code/scip/blob/main/scip.proto), [CLI JSON](https://github.com/scip-code/scip/blob/main/docs/CLI.md), [scip-typescript](https://github.com/sourcegraph/scip-typescript), [scip-python](https://github.com/sourcegraph/scip-python/tree/scip). Gli indicizzatori e i binding sono dipendenze esterne opzionali; il tool ADE non ne ridistribuisce il codice.
