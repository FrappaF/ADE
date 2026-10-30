# Provenienza delle fixture SCIP

Queste fixture provengono da indicizzazioni reali eseguite il 30 ottobre 2026 con Node 24.22.1 su Linux. I test ordinari leggono questi dati locali; non installano indicizzatori, non contattano servizi e non simulano la risoluzione degli alias mediante confronti testuali.

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
| `typescript/checkout.ts` | `d6af4932e8fb1270c310634261cb989f066019f81af219d519b46a05cffe1e90` |
| `typescript/gateway.ts` | `9fbc5ab8793d76e24c70942e6c19d459792ea564b5395f43bf4c7eaf131fce3e` |
| `python/checkout.py` | `fd1d84d5892c9f851f9cc053a4b5ccc9b7be871b117f13b45a016ae4fa04f3ba` |
| `python/gateway.py` | `e75a996ed1e5b5575cee9cd5d421c3848492324ebfe1f2667dd3b17feadb126e` |

Le varianti negative e delle codifiche nei test sono trasformazioni esplicite di questi dati: non rappresentano nuovi collaudi di backend. Fonti primarie: [schema SCIP](https://github.com/scip-code/scip/blob/main/scip.proto), [CLI JSON](https://github.com/scip-code/scip/blob/main/docs/CLI.md), [scip-typescript](https://github.com/sourcegraph/scip-typescript), [scip-python](https://github.com/sourcegraph/scip-python/tree/scip). Gli indicizzatori e i binding sono dipendenze esterne opzionali; il tool ADE non ne ridistribuisce il codice.
