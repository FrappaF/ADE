# A.D.E — Agentice Development Environment

A.D.E è un ambiente di sviluppo visuale e collaborativo con l'IA, costruito come **derivazione dei sorgenti Code OSS**, la base open source di Visual Studio Code.

Il prodotto è un **IDE desktop autonomo**: la UI/UX prevista mette sistema e feature nella sidebar, con i relativi diagrammi, canvas e flussi al centro. Codice, terminale e debugger sono viste secondarie su richiesta. La prossima priorità è riprogettare il workbench nativo e consentire di progettare un nuovo sistema dai diagrammi; vedi la [decisione UI/UX](ade/docs/decisions/0002-visual-workbench.md).

Il software engineer progetta struttura, diagrammi, flussi e interazioni fra attori e sistema; l'IA collabora alla realizzazione del codice e alla gestione dei dettagli tecnologici. L'obiettivo è esplorare feature, risorse, viste e controller e mantenere modello e codebase sincronizzati in entrambe le direzioni.

## Stato attuale

I sorgenti dell'editor sono nella radice. Sono disponibili branding A.D.E, shell nativa (`A.D.E: Open Project Home`) e [modello semantico M1](ade/docs/semantic-model.md) con schema v2, API, esempi e migrazione del prototipo. Il dominio è verificabile con Node senza Electron. IA, editing visuale completo e sincronizzazione bidirezionale sono da sviluppare. Build, ripristino e smoke desktop sul MacBook sono stati confermati dall’utente; CI e verifiche aggiuntive sono tracciate nel [verbale M0](ade/docs/m0-verification.md).

## Sviluppo

Usa la versione Node indicata in `.nvmrc` e i prerequisiti nativi descritti nella [guida al fork](ade/docs/fork-development.md). Poi, dalla radice:

```sh
npm ci
npm run compile
npm run electron
./scripts/code.sh --user-data-dir="$PWD/.tmp/ade-profile" --extensions-dir="$PWD/.tmp/ade-extensions" "$PWD/ade/examples"
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
