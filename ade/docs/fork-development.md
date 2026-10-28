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
node node_modules/@typescript/native/bin/tsc --project ade/tsconfig.json --pretty false
npm run gulp transpile-extensions compile-extension-media
npm run compile-copilot
npm run electron
./ade/scripts/dev.sh /percorso/del/progetto
```

La preparazione esplicita degli header precede gli script nativi delle dipendenze. `npm ci` conserva i lockfile e installa anche le sottocartelle previste upstream. `dev.sh` usa `.build/ade-profile`, `.build/ade-extensions`, `.build/ade-shared` e `.build/ade-portable`: sono isolati dagli altri editor. Su Windows usare `scripts\code.bat` con `--user-data-dir` e `--extensions-dir` dedicati. La sequenza separa build del client, typecheck del contributo A.D.E ed estensioni per ridurre la memoria simultanea; è usata anche in CI. Per iterare sul solo client usare `npm run build-fast -- --client-only`. La compilazione globale upstream (`npm run compile`) resta disponibile su una macchina con memoria sufficiente; il suo controllo TypeScript completo non è stato superato nel cloud da 8 GiB.

Dietro un proxy HTTP mantenere le variabili e la CA fornite dall’ambiente; con Node 24 impostare `NODE_USE_ENV_PROXY=1` per i download basati su fetch. Il runtime Chromium per i test browser upstream non serve allo smoke Electron: `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` evita quel download durante l’installazione. `FOUNDRY_LOCAL_SKIP_INSTALL=1` è l’opzione prevista dall’SDK upstream per le build da sorgente: esclude il download del runtime Foundry, che non viene utilizzato dalla shell M0. Non disabilitare i controlli TLS.

## Shell e collaudo

L’avvio predefinito apre la home A.D.E se non vengono ripristinati altri editor. `A.D.E: Open Home` la riapre dalla palette. La demo di acquisto è statica e in sola lettura: permette navigazione del modello e delle proprietà, con selezione e pannello memorizzati per workspace. Creazione progetto, importazione semantica e collaborazione IA espongono esplicitamente la loro indisponibilità. Onboarding e funzioni Copilot ereditate sono disabilitati per impostazione predefinita, evitando richieste di autenticazione a un servizio non configurato da A.D.E. Editor testuale, terminale e strumenti upstream rimangono accessibili.

```sh
npm --prefix ade/prototype run check
npm --prefix ade/prototype test
node ade/scripts/smoke-desktop.mjs
```

Su Linux senza display: `xvfb-run -a node ade/scripts/smoke-desktop.mjs`. Lo smoke usa profilo, estensioni e progetto temporanei, verifica riavvio e ripristino, quindi esegue il collaudo del prototipo nell’Extension Host. Le schermate vanno in `.build/ade-smoke/`. Per provare manualmente il laboratorio: `./ade/scripts/dev.sh --extensionDevelopmentPath="$PWD/ade/prototype"`, poi eseguire «A.D.E: Apri modello visuale» e aprire `ade/prototype/examples/checkout.diagram.json`.

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
