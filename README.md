# A.D.E — Agentice Development Environment

A.D.E è un ambiente di sviluppo visuale e collaborativo con l'IA, costruito come **derivazione dei sorgenti Code OSS**, la base open source di Visual Studio Code.

Il software engineer progetta struttura, diagrammi, flussi e interazioni fra attori e sistema; l'IA collabora alla realizzazione del codice e alla gestione dei dettagli tecnologici. L'obiettivo è esplorare feature, risorse, viste e controller e mantenere modello e codebase sincronizzati in entrambe le direzioni.

## Stato attuale

I sorgenti dell'editor sono nella radice della repository e sono modificabili direttamente. È stato applicato un primo branding A.D.E in `product.json`. Il prototipo visuale precedente è conservato in `ade/prototype/`, ancora separato dal workbench. IA, editing visuale completo e sincronizzazione bidirezionale sono da sviluppare. La build desktop A.D.E non è ancora stata verificata.

## Sviluppo

Usa la versione Node indicata in `.nvmrc` e i prerequisiti nativi descritti nella [guida al fork](ade/docs/fork-development.md). Poi, dalla radice:

```sh
npm install
npm run compile
./scripts/code.sh
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
