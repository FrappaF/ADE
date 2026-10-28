# Sviluppare il fork A.D.E

## Struttura

La radice contiene i sorgenti Code OSS importati dalla revisione registrata in `ade/upstream.json`. Le modifiche al prodotto si sviluppano direttamente qui. L'importazione è uno snapshot versionato nella storia ADE: non è un merge della storia Microsoft e non configura la relazione di fork nel network GitHub.

- `src/vs/workbench/`: interfaccia, navigazione, servizi e contributi del workbench.
- `src/vs/platform/`: servizi trasversali e infrastruttura.
- `src/vs/editor/`: motore dell'editor testuale.
- `src/vs/code/`: integrazione desktop Electron.
- `extensions/`: estensioni integrate upstream.
- `product.json`: identità e configurazione del prodotto.
- `build/`, `scripts/`, `resources/`: compilazione, avvio e risorse.
- `ade/docs/`: visione, architettura e roadmap specifiche di A.D.E.
- `ade/prototype/`: precedente estensione sperimentale, ancora avviabile separatamente.

## Prerequisiti e primo avvio

La versione Node richiesta è quella di `.nvmrc`, non quella del solo prototipo. Su macOS sono necessari toolchain Xcode/Command Line Tools funzionante e dipendenze native richieste dalla guida upstream. Il sistema di sviluppo attuale dispone di Node 26, mentre lo snapshot richiede Node 24.22.1; la selezione Xcode di sistema presenta inoltre un errore di caricamento librerie. Questi prerequisiti devono essere sistemati prima di verificare la build desktop.

Con un gestore Node già installato, selezionare la versione del file `.nvmrc` (per esempio `nvm install` e `nvm use`). Non installare i pacchetti con una versione Node arbitraria.

Dalla radice, eseguire `npm install`, poi `npm run compile`, infine `./scripts/code.sh` su macOS/Linux o `scripts\code.bat` su Windows. La compilazione e il download di Electron richiedono rete, spazio e tempo; non sono parte dei test leggeri del prototipo. Per lo sviluppo continuativo usare le attività upstream presenti in `.vscode/` e la guida ufficiale.

Per provare il prototipo precedente, aprire `ade/prototype/` come cartella VS Code e premere F5. Per caricarlo nel fork compilato, avviare `./scripts/code.sh --extensionDevelopmentPath="$PWD/ade/prototype"`. Non è ancora integrato come funzionalità nativa o estensione distribuita.

## Primo branding

`product.json` personalizza nome, nome applicazione, cartelle dati, protocollo URL, bundle identifier macOS e indirizzo delle issue. Restano da completare icone, identificatori degli installer sulle altre piattaforme, firma, aggiornamenti e configurazione dei servizi. Non è ancora una distribuzione pronta alla pubblicazione.

La configurazione upstream contiene riferimenti e integrazioni Microsoft/GitHub. Devono essere valutati uno per uno prima di distribuire il prodotto: lo snapshot non fornisce automaticamente autorizzazioni di accesso a Marketplace, servizi, marchi o estensioni proprietarie. Conservare licenze e avvisi; definire i servizi effettivamente offerti da A.D.E.

## Aggiornamenti upstream

Remote di sviluppo: `origin` punta a FrappaF/ADE; `upstream` punta a microsoft/vscode. In un nuovo clone, aggiungere il secondo con `git remote add upstream https://github.com/microsoft/vscode.git`.

L'importazione iniziale è stata ottenuta da `upstream/main` con fetch limitato a una revisione. Non eseguire un merge indiscriminato di storie non correlate e non sovrascrivere i file ADE con una nuova estrazione.

Per ogni aggiornamento: scegliere una revisione, confrontarla con quella registrata, applicare le differenze upstream in un branch dedicato, riconciliare il branding e i contributi ADE, eseguire build e verifiche pertinenti e aggiornare `ade/upstream.json`. La procedura automatizzata di aggiornamento è ancora da implementare.

I workflow Microsoft sono conservati in `ade/upstream-workflows/` con suffisso `.disabled`; non sono attivati su ADE. Il workflow `.github/workflows/ci.yml` verifica per ora soltanto il prototipo. Aggiungere una CI desktop dedicata quando toolchain e primo build saranno verificati.

## Fonti

- [Contribuire e compilare Code OSS](https://github.com/microsoft/vscode/wiki/How-to-Contribute)
- [Differenze fra Code OSS e la distribuzione Visual Studio Code](https://github.com/microsoft/vscode/wiki/Differences-between-the-repository-and-Visual-Studio-Code)
