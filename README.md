# A.D.E — Agentice Development Environment

A.D.E è un ambiente di sviluppo visuale e collaborativo con l'IA, costruito come **derivazione dei sorgenti Code OSS**, la base open source di Visual Studio Code.

Il software engineer progetta struttura, diagrammi, flussi e interazioni fra attori e sistema; l'IA collabora alla realizzazione del codice e alla gestione dei dettagli tecnologici. L'obiettivo è esplorare feature, risorse, viste e controller e mantenere modello e codebase sincronizzati in entrambe le direzioni.

## Stato attuale

La shell nativa A.D.E include home di progetto, demo del checkout, proprietà e navigazione persistente nel workbench. Build di sviluppo, avvio, riavvio e prototipo nell’Extension Host sono verificati su Linux x64. Il primo collaudo CI Linux/macOS arm64 è passato; la chiusura M0 richiede ancora la verifica del Mac originale. La verifica TypeScript di produzione, separata dai test, passa localmente con circa 5,15 GiB di picco RSS. Esiti e limiti nella [roadmap](ade/docs/roadmap.md) e nel [report M0](ade/docs/m0-validation.md).

Editing visuale completo, analisi della codebase, IA e sincronizzazione sono da sviluppare. Le funzioni future risultano indisponibili nella shell. Il prototipo JSON resta in `ade/prototype/`.

## Sviluppo

Usa la versione Node indicata in `.nvmrc` e i prerequisiti nativi descritti nella [guida al fork](ade/docs/fork-development.md). Poi, dalla radice:

```sh
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
export FOUNDRY_LOCAL_SKIP_INSTALL=1
node build/npm/preinstall.ts
npm ci
npm run build-fast -- --client-only
GOMEMLIMIT=3GiB GOMAXPROCS=2 node node_modules/@typescript/native/bin/tsc --project ade/tsconfig.production.json --pretty false
npm run gulp transpile-extensions compile-extension-media
npm run compile-copilot
./ade/scripts/dev.sh
```

Su Windows usa `scripts\code.bat`. Per verificare soltanto il prototipo, senza installare le dipendenze dell'editor:

```sh
npm --prefix ade/prototype run check
npm --prefix ade/prototype test
```

## Documentazione

- [Roadmap](ade/docs/roadmap.md)
- [Visione](ade/docs/vision.md)
- [Architettura](ade/docs/architecture.md)
- [Sviluppo e aggiornamenti del fork](ade/docs/fork-development.md)

Base upstream: [microsoft/vscode](https://github.com/microsoft/vscode). Revisione importata in [upstream.json](ade/upstream.json). Licenza del codice upstream: [MIT](LICENSE.txt), con [avvisi di terze parti](ThirdPartyNotices.txt). A.D.E è un progetto indipendente; branding e servizi della distribuzione Microsoft non sono automaticamente inclusi.
