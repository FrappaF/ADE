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

La versione Node richiesta è quella di `.nvmrc`, attualmente **24.22.1**, non quella del solo prototipo. Su macOS sono necessari Xcode/Command Line Tools funzionanti e le dipendenze native richieste dalla guida upstream. Su Linux servono compilatori C/C++, Python, `pkg-config`, header X11/xkbfile, libsecret e Kerberos, oltre alle librerie di esecuzione Electron; per un ambiente senza display serve Xvfb. Verificare i pacchetti per la propria distribuzione seguendo la guida upstream. Gli ostacoli riscontrati nell'ambiente gestito sono registrati nel [verbale M0](m0-verification.md).

Con un gestore Node già installato, selezionare la versione del file `.nvmrc` (per esempio `nvm install` e `nvm use`). Non installare i pacchetti con una versione Node arbitraria.

Dalla radice, eseguire `npm ci`, poi `npm run compile` e `npm run electron`, infine `./scripts/code.sh` su macOS/Linux o `scripts\code.bat` su Windows. La compilazione e il download di Electron richiedono rete, spazio e tempo; non sono parte dei test leggeri del prototipo. Per lo sviluppo continuativo usare le attività upstream presenti in `.vscode/` e la guida ufficiale. Un'installazione con `--ignore-scripts` serve ai controlli statici ma non completa la preparazione del desktop.

Per isolare il collaudo dalle installazioni esistenti, scegliere directory dedicate e riutilizzarle soltanto per verificare il ripristino:

```sh
./scripts/code.sh --user-data-dir="$PWD/.tmp/ade-profile" --extensions-dir="$PWD/.tmp/ade-extensions" "$PWD/ade/examples"
```

Dalla palette eseguire **A.D.E: Open Project Home**. La shell nativa può mostrare l'esempio integrato oppure aprire documenti M1 e modelli v1 migrati in memoria. Non occorre caricare il prototipo per usare questo contributo. Creazione visuale, importazione della codebase e coordinatore IA sono ancora indisponibili.

Per provare il prototipo precedente, aprire `ade/prototype/` come cartella VS Code e premere F5. Per caricarlo nel fork compilato, avviare `./scripts/code.sh --extensionDevelopmentPath="$PWD/ade/prototype"`. Non è ancora integrato come funzionalità nativa o estensione distribuita.

Dopo build e download di Electron, eseguire lo smoke automatico desktop:

```sh
VSCODE_SKIP_PRELAUNCH=1 ./scripts/code.sh --user-data-dir="$PWD/.tmp/ade-smoke-profile" --extensions-dir="$PWD/.tmp/ade-smoke-extensions" --skip-welcome --skip-release-notes --disable-workspace-trust --extensionDevelopmentPath="$PWD/ade/prototype" --extensionTestsPath="$PWD/ade/prototype/desktop/smoke.cjs" "$PWD/ade/examples"
```

Il workflow desktop esegue lo stesso percorso su macOS e registra piattaforma e revisione. Il [verbale M0](m0-verification.md) elenca anche i controlli manuali necessari per completare la milestone. I test del dominio si eseguono con `npm run ade:test` senza dipendenze desktop; dopo l'installazione root, `npm run ade:check` controlla dominio e shell con TypeScript.

## Primo branding

`product.json` personalizza nome, nome applicazione, cartelle dati, protocollo URL, bundle identifier macOS e indirizzo delle issue. Restano da completare icone, identificatori degli installer sulle altre piattaforme, firma, aggiornamenti e configurazione dei servizi. Non è ancora una distribuzione pronta alla pubblicazione.

La configurazione upstream contiene riferimenti e integrazioni Microsoft/GitHub. Devono essere valutati uno per uno prima di distribuire il prodotto: lo snapshot non fornisce automaticamente autorizzazioni di accesso a Marketplace, servizi, marchi o estensioni proprietarie. Conservare licenze e avvisi; definire i servizi effettivamente offerti da A.D.E.

## Aggiornamenti upstream

Remote di sviluppo: `origin` punta a FrappaF/ADE; `upstream` punta a microsoft/vscode. In un nuovo clone, aggiungere il secondo con `git remote add upstream https://github.com/microsoft/vscode.git`.

L'importazione iniziale è stata ottenuta da `upstream/main` con fetch limitato a una revisione. Non eseguire un merge indiscriminato di storie non correlate e non sovrascrivere i file ADE con una nuova estrazione.

Per ogni aggiornamento: scegliere una revisione, confrontarla con quella registrata, applicare le differenze upstream in un branch dedicato, riconciliare il branding e i contributi ADE, eseguire build e verifiche pertinenti e aggiornare `ade/upstream.json`. La [procedura di manutenzione](fork-maintenance.md) include inventario, script di anteprima senza applicazione e prova con conflitti documentati.

I workflow Microsoft sono conservati in `ade/upstream-workflows/` con suffisso `.disabled`; non sono attivati su ADE. `.github/workflows/ci.yml` verifica dominio e prototipo; `.github/workflows/desktop.yml` prepara dipendenze, compila ed esegue lo smoke desktop su macOS. La presenza del workflow non certifica una sua esecuzione riuscita.

## Fonti

- [Contribuire e compilare Code OSS](https://github.com/microsoft/vscode/wiki/How-to-Contribute)
- [Differenze fra Code OSS e la distribuzione Visual Studio Code](https://github.com/microsoft/vscode/wiki/Differences-between-the-repository-and-Visual-Studio-Code)
