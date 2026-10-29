# A.D.E — Agentice Development Environment

A.D.E è un ambiente di sviluppo visuale e collaborativo con l'IA, costruito come **derivazione dei sorgenti Code OSS**, la base open source di Visual Studio Code.

Il prodotto è un **IDE desktop autonomo**: sistema e feature sono nella sidebar nativa, con i diagrammi al centro e proprietà contestuali. Il primo editor consente di creare un sistema, disegnarne struttura e flusso e salvarlo senza modificare JSON. Codice, terminale e debugger sono viste secondarie su richiesta; vedi la [decisione UI/UX](ade/docs/decisions/0002-visual-workbench.md).

Il software engineer progetta struttura, diagrammi, flussi e interazioni fra attori e sistema; l'IA collabora alla realizzazione del codice e alla gestione dei dettagli tecnologici. L'obiettivo è esplorare feature, risorse, viste e controller e mantenere modello e codebase sincronizzati in entrambe le direzioni.

L’[integrazione della branch M2](ade/docs/m2-branch-integration.md) recupera gruppi persistenti della sidebar, riferimenti ai diagrammi condivisi e annullamento acquisto, mantenendo editing e navigazione M3.

## Stato attuale

I sorgenti dell'editor sono nella radice. Sono disponibili branding A.D.E, sidebar sistema/feature/diagrammi e [editor persistente](ade/docs/visual-editing.md): creazione di progetto e feature, struttura e flusso con condizioni, proprietà, salvataggio, undo/redo e recupero del contesto. [Lettura testuale e aiuto accessibili](ade/docs/accessibility.md) usano le viste native del workbench. Il [modello semantico](ade/docs/semantic-model.md) comprende schemi v2/v3, API, esempi e migrazione; il dominio è verificabile con Node senza Electron. Il [collaudo M2.3](ade/docs/m2-3-verification.md) registra su Linux percorso nativo, tastiera, lettore accessibile, Fit Diagram, finestra stretta e quattro temi; macOS, nuova CI e revisione UX dell'utente restano aperti. I precedenti collaudi M0/M1 del MacBook sono tracciati nel [verbale M0](ade/docs/m0-verification.md). [Importazione assistita, Sync incrementale e scelta del provider/modello](ade/docs/decisions/0003-code-import-sync-and-providers.md) sono pianificati in M4–M6 e ancora da sviluppare.

Il primo [esploratore M3.1](ade/docs/semantic-explorer.md) aggiunge ricerca per tipo, schede per gli elementi non collocati, breadcrumb, cambio di prospettiva a identità costante e cronologia di sessione. Il [verbale M3.1](ade/docs/m3-1-verification.md) registra le verifiche; M3.2 aggiunge la mappa del sistema e connessioni ortogonali con etichette separate dai nodi ([verifica](ade/docs/m3-2-verification.md)). Contratti e viste estese proseguono in M3.

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

Su Windows usa `scripts\code.bat`. Per verificare dominio e prototipo senza installare le dipendenze dell'editor:

```sh
npm --prefix ade/prototype run check
npm --prefix ade/prototype test
npm run ade:test
```

## Documentazione

- [Roadmap](ade/docs/roadmap.md)
- [Visione](ade/docs/vision.md)
- [Architettura](ade/docs/architecture.md)
- [Sviluppo e aggiornamenti del fork](ade/docs/fork-development.md)

Base upstream: [microsoft/vscode](https://github.com/microsoft/vscode). Revisione importata in [upstream.json](ade/upstream.json). Licenza del codice upstream: [MIT](LICENSE.txt), con [avvisi di terze parti](ThirdPartyNotices.txt). A.D.E è un progetto indipendente; branding e servizi della distribuzione Microsoft non sono automaticamente inclusi.
