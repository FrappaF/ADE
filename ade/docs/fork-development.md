# Sviluppare il fork A.D.E

## Struttura e responsabilità

La radice contiene i sorgenti Code OSS importati dalla revisione in `ade/upstream.json`. È uno snapshot nella storia ADE, non un merge della storia Microsoft. Il contributo nativo è in `src/vs/workbench/contrib/ade/browser/`; l’estensione sperimentale resta separata in `ade/prototype/`.

L’[inventario del fork](fork-inventory.md) elenca personalizzazioni, punti di integrazione, servizi esterni e confini architetturali. Gli [esiti M0](m0-validation.md) distinguono implementazione, verifiche locali e verifiche ancora necessarie.

## Da un clone pulito

Selezionare **Node dalla `.nvmrc`** (attualmente 24.22.1), con npm incluso nella distribuzione Node. Non usare una versione Node arbitraria. Sono necessari Git, Python, compilatore C/C++ e una connessione per npm, Node, Electron e gli artifact delle estensioni.

- **macOS arm64:** installare e selezionare Xcode/Command Line Tools funzionanti (`xcode-select -p`, `xcrun --find clang`, `clang --version`). Il problema della selezione Xcode osservato sul Mac originale deve essere corretto su quella macchina; il cloud Linux non può certificarne la riparazione.
- **Linux (Debian/Ubuntu):** installare `build-essential pkg-config libx11-dev libxkbfile-dev libkrb5-dev libsecret-1-dev libgtk-3-dev libgbm-dev libnss3 libasound2-dev xvfb`. I nomi dei pacchetti possono variare con la distribuzione. Per i test senza display serve anche `xauth`.
- **Windows:** seguire i prerequisiti C++ e Visual Studio della guida upstream; non è una piattaforma collaudata in M0.

Con `nvm` disponibile: `nvm install && nvm use`. Dalla radice:

```sh
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
export FOUNDRY_LOCAL_SKIP_INSTALL=1
node build/npm/preinstall.ts
npm ci
npm run build-fast -- --client-only
GOMEMLIMIT=3GiB GOMAXPROCS=2 node node_modules/@typescript/native/bin/tsc --project ade/tsconfig.production.json --pretty false
npm run gulp transpile-extensions compile-extension-media
npm run compile-copilot
npm run electron
./ade/scripts/dev.sh /percorso/del/progetto
```

La preparazione esplicita degli header precede gli script nativi delle dipendenze. `npm ci` conserva i lockfile e installa anche le sottocartelle previste upstream. `dev.sh` usa `.build/ade-profile`, `.build/ade-extensions`, `.build/ade-shared` e `.build/ade-portable`: sono isolati dagli altri editor. Su Windows usare `scripts\code.bat` con `--user-data-dir` e `--extensions-dir` dedicati. La sequenza separa build del client, typecheck di produzione ed estensioni per ridurre la memoria simultanea; è usata anche in CI. Per iterare sul solo client usare `npm run build-fast -- --client-only`. Il controllo di produzione separato dai test ha superato il collaudo con circa 5,15 GiB di picco RSS; dettagli nell’[analisi dell’ingombro](build-footprint.md). La compilazione globale upstream (`npm run compile`) resta disponibile su una macchina con memoria sufficiente; il suo controllo TypeScript completo non è stato superato nel cloud da 8 GiB.

Dietro un proxy HTTP mantenere le variabili e la CA fornite dall’ambiente; con Node 24 impostare `NODE_USE_ENV_PROXY=1` per i download basati su fetch. Il runtime Chromium per i test browser upstream non serve allo smoke Electron: `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` evita quel download durante l’installazione. `FOUNDRY_LOCAL_SKIP_INSTALL=1` è l’opzione prevista dall’SDK upstream per le build da sorgente: esclude il download del runtime Foundry, che non viene utilizzato dalla shell M0. Non disabilitare i controlli TLS.

## Shell e collaudo

Con lo startup editor predefinito `adeHome`, l'avvio apre la home A.D.E o il diagramma ripristinato; file aperti esplicitamente da riga di comando e `--skip-welcome` mantengono il loro percorso. `A.D.E: Open Home` riapre la home e la sidebar nativa; `A.D.E: Return to Model` torna al diagramma e alla selezione. La sidebar organizza sistema, feature e diagrammi; il canvas permette progettazione di struttura e flusso, proprietà e salvataggio con undo/redo nativi. **Create Project** inizializza `.ade/model.json` nella cartella scelta, senza sovrascrivere un progetto esistente. Il contesto e le selezioni dei diagrammi sono memorizzati per workspace; backup e conflitti sono gestiti dai servizi documentali upstream. La demo integrata resta in sola lettura. Importazione semantica e collaborazione IA espongono la loro indisponibilità. Onboarding e funzioni Copilot ereditate sono disabilitati per impostazione predefinita. Editor testuale, terminale e strumenti upstream rimangono accessibili.

```sh
npm --prefix ade/prototype run check
npm --prefix ade/prototype test
node ade/scripts/smoke-desktop.mjs --native-only
node ade/scripts/smoke-desktop.mjs --ux-only
node ade/scripts/smoke-desktop.mjs --navigation-only
node ade/scripts/smoke-desktop.mjs --extension-only
```

Su Linux senza display, anteporre `xvfb-run -a` ai comandi di smoke. Lo smoke usa profilo portable, estensioni e progetto temporanei. `--native-only` collauda sidebar, canvas, navigazione, creazione di progetto/feature, editing, salvataggio, undo/redo, riavvio, conflitti, recupero delle modifiche non salvate, salvataggio di una copia ed errori. Non usa estensione di sviluppo e disabilita anche l'attivazione delle estensioni integrate, per verificare l'indipendenza del prodotto. `--ux-only` abilita soltanto i contributi dichiarativi dei temi integrati e collauda tastiera, finestra stretta, Fit Diagram, scorrimento distinto per documento e temi chiaro/scuro/ad alto contrasto attraverso il watcher delle impostazioni; verifica anche l'output di un comando nel terminale e il ritorno al modello. Il profilo usa il renderer DOM del terminale per il display Xvfb. `--extension-only` collauda il laboratorio nell'Extension Host. Senza flag esegue percorso nativo e laboratorio con le estensioni integrate disponibili. Le schermate vanno in `.build/ade-smoke/`; gli esiti osservati sono nei verbali [M2.2](m2-2-verification.md) e [M2.3](m2-3-verification.md). Per provare manualmente il laboratorio: `./ade/scripts/dev.sh --extensionDevelopmentPath="$PWD/ade/prototype"`, poi eseguire «A.D.E: Apri modello visuale» e aprire `ade/prototype/examples/checkout.diagram.json`.

Il percorso `--ux-only` include anche lettura testuale e aiuto accessibili: canvas e sidebar, palette, aggiornamenti esterni, stato invalido, ritorno al focus, suggerimenti configurabili e scorciatoia personalizzata. La CI desktop esegue i sette test del contenuto accessibile insieme ai test documentali; non considera questo collaudo equivalente a VoiceOver sul MacBook.

`--navigation-only` verifica l'[esploratore M3](semantic-explorer.md): ricerca per tipo, contratti non collocati, breadcrumb, selezione fra prospettive, Back/Forward, modifica e ripristino delle schede, cancellazione esterna. Il file del modello usato per editing e riavvio si trova fuori dal workspace temporaneo. Gli esiti sono nel [verbale M3.1](m3-1-verification.md). Questo percorso è configurato separatamente su Linux e macOS nella CI desktop.

Il workflow `desktop.yml` compila e collauda su Linux e macOS; `ci.yml` esegue soltanto i controlli leggeri. Le esecuzioni effettive vanno verificate su GitHub: il solo file YAML non dimostra il successo della CI.

## Aggiornamenti upstream e ritorno alla base

`origin` punta a FrappaF/ADE; configurare `upstream` con `git remote add upstream https://github.com/microsoft/vscode.git`. Non unire indiscriminatamente storie non correlate e non sovrascrivere la radice con una nuova estrazione.

1. Partire da modifiche ADE salvate in un commit e selezionare una revisione upstream completa, verificandone il diff rispetto a `ade/upstream.json`.
2. Eseguire `node ade/scripts/prepare-upstream.mjs SHA_COMPLETO /percorso/assoluto/nuovo-worktree`. Lo script applica soltanto il delta fra snapshot su un branch dedicato e produce `ade/upstream-trial.json`. Il checkout iniziale resta intatto. Se cambiano workflow upstream, lo script si ferma prima di applicarli: vanno riconciliati come file `.disabled` in `ade/upstream-workflows/`.
3. Risolvere eventuali conflitti nel worktree di prova, controllando branding, registrazioni e contributi nell’inventario. La revisione di base cambia solo dopo un’applicazione senza conflitti; in caso di risoluzione manuale aggiornare esplicitamente il manifest.
4. Installare le dipendenze nel worktree, compilare, eseguire lo smoke desktop e i test pertinenti al delta. Non condividere `node_modules` tramite symlink fra checkout. Registrare revisioni ed esiti nel report prima del commit.
5. Integrare il branch aggiornato soltanto dopo le verifiche. Per abbandonare la prova, conservare prima il report e poi rimuovere il worktree temporaneo; il branch originale mantiene la vecchia base. Per annullare un aggiornamento già integrato usare un revert del commit d’integrazione, includendo il manifest, senza riscrivere la storia condivisa.

Per validare una prova con le dipendenze già presenti nello stesso checkout: salvare il branch di prova in un commit, rimuovere il suo worktree pulito e passare temporaneamente a quel branch nel checkout di sviluppo. Tornare poi al branch originale. Se cambiano i lockfile va ripetuta l’installazione; ricompilare gli output influenzati dal cambio di branch.

I workflow Microsoft restano in `ade/upstream-workflows/*.disabled`. Licenze e avvisi vanno conservati. Firma, notarizzazione, icone originali, canali di aggiornamento e distribuzione agli utenti appartengono a M8.

## Fonti

- [Compilare Code OSS](https://github.com/microsoft/vscode/wiki/How-to-Contribute)
- [Code OSS e la distribuzione Visual Studio Code](https://github.com/microsoft/vscode/wiki/Differences-between-the-repository-and-Visual-Studio-Code)

## Modello semantico M1

La home usa il dominio condiviso per il modello di acquisto e i documenti v1/v2/v3. `A.D.E: Open Project Home` conserva l'accesso alla home della precedente shell. `npm run ade:test` verifica dominio, navigazione ed editing senza Electron; `npm run ade:check` controlla dominio, shell e test dopo l’installazione root. Dopo la build client, `node test/unit/node/index.js --run src/vs/workbench/contrib/ade/test/browser/adeProjectService.test.ts --run src/vs/workbench/contrib/ade/test/browser/workingCopyRecovery.test.ts` verifica servizio e ripristino con cronologia nativa e backend controllato. Schema, esempi e migrazione sono descritti nel [contratto semantico](semantic-model.md); il percorso operativo è nell'[editor persistente](visual-editing.md).

M3.2 estende `--navigation-only` a System Map, lettura accessibile, tastiera, breadcrumb, ripristino dopo il riavvio e misure delle etichette SVG rispetto ai nodi. I test del dominio coprono anche routing, auto-collegamenti, relazioni parallele e sovrapposizioni bloccanti; vedere il [verbale M3.2](m3-2-verification.md).

M3.3 estende lo stesso percorso a creazione/modifica/rimozione di voci dei contratti, validazione dei campi, cancellazione dei dialoghi, undo/redo, lettura accessibile e coerenza fra scheda e due diagrammi. La CI desktop include anche `adeBehaviorEditing.test.ts` nel runner nativo. Build, test automatici e smoke Linux sono registrati nel [verbale M3.3](m3-3-verification.md), distinti da macOS e CI remota ancora da eseguire.
