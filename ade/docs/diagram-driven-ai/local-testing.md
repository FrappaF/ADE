<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# Provare la branch Diagram-Driven AI

La branch `feat/m6-dai-validation` raccoglie gli incrementi DAI-01–12. Il [verbale DAI-12](dai-12.md) e la [matrice di uscita](release-review.json) distinguono capacità locali verificate e accettazione di release ancora aperta. Prima di cambiare branch, conservare eventuali modifiche del proprio clone.

```sh
git fetch origin
git switch --track origin/feat/m6-dai-validation
nvm install
nvm use
```

Se la branch locale esiste già, usare `git switch feat/m6-dai-validation` e `git pull --ff-only`. I comandi seguenti partono dalla radice del clone.

## Suite locali senza build desktop

Servono Node **24.22.1**, Git e Bun **1.3.2** della propria piattaforma. Installare quella versione di Bun con il proprio gestore oppure scaricare il pacchetto ufficiale corrispondente; `bun --version` deve stampare `1.3.2`. Non è previsto fallback su Node per un progetto Bun.

```sh
npm ci --prefix ade/ai
npm ci --prefix ade/code-import
npm ci --prefix ade/messaging
export ADE_BUN_EXECUTABLE="$(command -v bun)"
export TMPDIR="$(cd "${TMPDIR:-/tmp}" && pwd -P)"
npm run ade:dai:verify -- /tmp/ade-dai-prova-1
```

`ADE_BUN_EXECUTABLE` deve essere un percorso assoluto. Scegliere una directory di report nuova a ogni prova: il comando rifiuta una directory esistente. `verification.json`, `context.json`, `scale.json`, `corpus.json` e i log conservano revisioni/hash, runtime, risultati, metriche e lacune. L'esecuzione può richiedere diversi minuti. Nessun provider viene invocato da questo comando.

Exit **0** indica collaudo locale riuscito; **1** indica un errore locale o un runtime obbligatorio assente. `release.accepted` resta separato. Con `--require-release` il comando restituisce **2** se il collaudo locale passa ma l'accettazione è aperta. Non usare un semplice exit 0 locale per certificare I5. Le righe `not-executed` del corpus richiedono ancora implementazione/adapter e non sono test saltati o passati.

Per aggiungere il broker reale, installare **NATS Server 2.11.9**, controllare `nats-server --version` e impostare `ADE_NATS_SERVER` al percorso assoluto prima dello stesso comando. I test avviano broker isolati su loopback e directory temporanee; non usano servizi del proprio progetto. Il comando portabile esegue broker Node e trasferimento ledger Node→Bun→Node. La suite completa broker sotto Bun è una prova separata, riproducibile con l'harness conservato nel report DAI-12.

Per una verifica rapida dei nuovi negativi/gate, dopo l'installazione dei package:

```sh
node --test ade/test/dai-release.test.mjs
```

## Avvio dell'IDE e prove manuali

Seguire i prerequisiti nativi del [README](../../../README.md#dopo-il-pull-di-main-preparazione-del-pc). Preparare e avviare il client dalla branch:

```sh
npm run ade:setup
./ade/scripts/dev.sh
```

Per provare Bun nell'IDE, esportare `ADE_BUN_EXECUTABLE` **prima** di avviare A.D.E. Il modello non può scegliere un eseguibile dal disco. Creare i progetti in una cartella separata dal clone dell'IDE.

La verifica desktop usa Node standalone 24.22.1: il Node incorporato in Electron ha una versione indipendente da nvm. `dev.sh` conserva automaticamente il percorso del Node selezionato prima di avviare Electron. Per impostarlo esplicitamente, selezionare Node con `nvm use` ed esportare `ADE_NODE_EXECUTABLE="$(node -p 'process.execPath')"` prima dell'avvio. Dopo un aggiornamento dei sorgenti, ricompilare con `npm run build-fast -- --client-only` e chiudere completamente l'istanza precedente. La [correzione del runner desktop](desktop-node-runner.md) descrive verifica e limiti.

1. Creare/aprire un progetto visuale, poi usare **A.D.E: Add Pure Quantity Feature**. Esaminare proprietà, criterio indipendente e predicato; salvare e verificare undo/redo e riapertura.
2. Usare **Implement Feature**, leggere la review nel diagramma, eseguire **Run Real Verification**, quindi **Publish Verified Model and Code**. La pubblicazione richiede verifiche riuscite; spostare soltanto un nodo deve conservare il pacchetto e non invocare IA.
3. Da **Choose Runtime and Review Stack Plan**, scegliere Bun, leggere il piano e verificare nuovamente nel runtime target. ID, PIM e criteri devono restare uguali. Un ADR Node-only deve bloccare il cambio finché non viene rivisto esplicitamente.
4. Provare **Tasks and Clarifications** e **Start or Stop Continuous Preparation**: la continuità prepara soltanto proposte entro budget, con verifica/pubblicazione manuale. Modificare il modello dopo la review deve invalidare la proposta.
5. In una copia di prova, modificare una regione generata con una variazione supportata, usare **Update Diagrams**, verificare conflitti e undo. Testare anche un edit custom esterno alla regione: deve rimanere conservato. Non usare dati di produzione per prove di arresto/recupero.
6. Aprire gli esempi `ade/examples/dai-checkout-frames.ade.json`, `dai-checkout-states.ade.json` e `dai-checkout-messaging.ade.json`; controllare ordine/annidamento, guardie, azioni, policy e lettura testuale. La simulazione del messaging non avvia un broker.

Ripetere i percorsi con tastiera e screen reader, temi chiaro/scuro/alto contrasto e finestra stretta. Annotare OS, runtime, commit, azioni, risultato osservato ed eventuale log. Nel workspace cloud il setup, dopo la correzione del preinstaller, si ferma sulla compilazione di `native-keymap` per gli header X11/xkbfile assenti. Installare i prerequisiti del README sulla propria macchina prima della build. Le prove Electron/screen reader/macOS della branch sono ancora richieste: Chromium e servizi scriptati non le sostituiscono.

## Prova live esplicita

Questo comando invoca la CLI Codex originale autenticata e consuma la relativa quota. Richiede un ID modello esatto disponibile al proprio account. Usa soltanto una fixture sintetica, strumenti disabilitati e una proposta di rinomina verificata; non pubblica codice. Tre campioni per profilo, nessun retry/escalation dopo errore:

```sh
node ade/scripts/benchmark-dai-live.mjs /tmp/dai-live-prova-1.json /percorso/assoluto/codex ID_MODELLO
```

Il risultato di questa piccola prova non certifica il corpus business completo né confronta prezzi. Nel collaudo cloud DAI-12 la CLI risultava autenticata, ma il primo tentativo tramite adapter è terminato con exit 1, senza output strutturato/usage: nessun successo live osservato e nessuna escalation automatica.

La workflow [ADE Diagram-Driven AI validation](../../../.github/workflows/ade-dai.yml) esegue il collaudo deterministico su Linux/macOS e conserva gli artifact. Controllare i risultati sulla revisione pubblicata; il file della workflow da solo non è evidenza di una CI riuscita. Il collaudo desktop completo resta nella workflow [ADE desktop](../../../.github/workflows/desktop.yml).
