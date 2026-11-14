# A.D.E — Agentice Development Environment

A.D.E è un ambiente di sviluppo visuale e collaborativo con l'IA, costruito come **derivazione dei sorgenti Code OSS**, la base open source di Visual Studio Code.

Il prodotto è un **IDE desktop autonomo**: i diagrammi occupano l’area principale, con navigazione su richiesta e proprietà contestuali. Il primo editor consente di creare un sistema, disegnarne struttura e flusso e salvarlo senza modificare JSON. Codice, terminale e debugger sono viste secondarie su richiesta; vedi la [decisione UI/UX](ade/docs/decisions/0002-visual-workbench.md).

Il software engineer progetta struttura, diagrammi, flussi e interazioni fra attori e sistema; l'IA collabora alla realizzazione del codice e alla gestione dei dettagli tecnologici. L'obiettivo è esplorare feature, risorse, viste e controller e mantenere modello e codebase sincronizzati in entrambe le direzioni.

L’[integrazione della branch M2](ade/docs/m2-branch-integration.md) recupera gruppi persistenti della sidebar, riferimenti ai diagrammi condivisi e annullamento acquisto, mantenendo editing e navigazione M3.

## Stato attuale

I sorgenti dell'editor sono nella radice. Il [workbench visuale persistente](ade/docs/visual-editing.md) permette di creare progetti e feature, modificare diagrammi, salvare, usare undo/redo e riprendere il contesto. L'[esploratore semantico M3](ade/docs/semantic-explorer.md) comprende ricerca, mappa del sistema, contratti comportamentali, sequenze, stati delle risorse e impatto nel modello. [Lettura testuale e aiuto accessibili](ade/docs/accessibility.md) usano le viste native del workbench. Il [modello semantico](ade/docs/semantic-model.md) conserva gli schemi v2/v3 e aggiunge [v4](ade/docs/diagram-driven-ai/schema-v4.md), API, esempi e migrazioni esplicite.

M4 offre [importazione e Sync deterministici](ade/docs/code-import.md) su 16 profili, analisi semantica JS/TS integrata, ponte SCIP opzionale, evidenze navigabili e versioni recuperabili. M5 aggiunge la [collaborazione IA](ade/docs/ai-collaboration.md) con Codex e Claude Code originali: piano revisionabile, generazione in worktree Git, test Node, applicazione e annullamento. Il percorso con Codex e account reale è stato collaudato su Linux; Claude richiede ancora un collaudo reale equivalente. M6 integra la [riconciliazione bidirezionale](ade/docs/reconciliation.md) su file esistenti, con baseline comune, review, journal, undo e recupero; Sync non esegue automaticamente verifiche runtime. La fase [M6.DAI · Diagram-Driven AI](ade/docs/roadmap.md#m6dai--attuazione-completa-diagram-driven-ai) estende questa base a specifiche eseguibili, bootstrap e archetipi: il [primo sprint DAI-01](ade/docs/diagram-driven-ai/baseline.md) consegna inventario, glossario, corpus, decisioni e budget misurabili; [DAI-02](ade/docs/diagram-driven-ai/dai-02.md) aggiunge fondazione v4, readiness per target e primo pacchetto IA riproducibile; [DAI-03](ade/docs/diagram-driven-ai/dai-03.md) aggiunge gerarchia C4, contratti condivisi e ADR dei progetti con storia e vincoli; [DAI-04](ade/docs/diagram-driven-ai/dai-04.md) aggiunge predicati puri, profilo strutturale Node ESM e contesto IA completo con retrieval e scope verificati; [DAI-05](ade/docs/diagram-driven-ai/dai-05.md) aggiunge il primo progetto puro senza importazione, forward/reverse verificabile, oracoli indipendenti e pubblicazione recuperabile; [DAI-06](ade/docs/diagram-driven-ai/dai-06.md) aggiunge espressioni, sequenze e frame eseguibili locali con editor gerarchico e criteri indipendenti; [DAI-07](ade/docs/diagram-driven-ai/dai-07.md) aggiunge macchine piatte, simulazione spiegabile e checkpoint con deduplica; [DAI-08](ade/docs/diagram-driven-ai/dai-08.md) aggiunge queue/topic, policy esplicite e adapter locale verificato con NATS JetStream reale; [DAI-09](ade/docs/diagram-driven-ai/dai-09.md) aggiunge move/rename annidati, collisioni e indice ricostruibile sul round trip dichiarato; [DAI-10](ade/docs/diagram-driven-ai/dai-10.md) aggiunge proprietà guidate, chiarimenti versionati, review nel diagramma e preparazione continua opt-in con budget; [DAI-11](ade/docs/diagram-driven-ai/dai-11.md) aggiunge il secondo runtime Bun ESM con PIM invariato, piano di cambio stack e trasferimenti offline dei dati locali; [DAI-12](ade/docs/diagram-driven-ai/dai-12.md) aggiunge collaudo riproducibile, benchmark e gate di accettazione con lacune esplicite. Per provare la branch separata vedere la [guida locale](ade/docs/diagram-driven-ai/local-testing.md). L'esecuzione e diagnostica visuale (M7) e la beta completa (M8) restano da sviluppare.

I nuovi progetti visuali usano v4. Aprire un modello v2/v3 ne conserva il formato; **A.D.E: Upgrade Model to Version 4** esegue una migrazione annullabile. I percorsi di generazione/Sync M4–M6 mantengono il supporto v2/v3 e mantengono i guard legacy su v4; il nuovo adapter del progetto puro è separato. Le bozze v4 restano modificabili e salvabili; scope C4, ownership, tipi, operazioni, interfacce, binding, asserzioni e ADR si modificano con **A.D.E: Edit Structural Blueprint** e **A.D.E: Project Architecture Decisions**. **A.D.E: Edit Pure Predicate**, **A.D.E: Choose Runtime and Review Stack Plan** e **A.D.E: Preview Structural AI Context** aggiungono guardie, binding e disclosure locale senza inferenze; **A.D.E: Add Pure Quantity Feature** prepara il primo progetto eseguibile e **Implement Feature** avvia il job deterministico revisionabile. [Il percorso DAI-05](ade/docs/diagram-driven-ai/project-v1.md) include verifiche indipendenti, reverse limitato al template, ripresa, recovery e undo; [DAI-06](ade/docs/diagram-driven-ai/interactions-v1.md) estende lo stesso percorso a `alt/opt/loop/par/critical/ref` con risposte come dati e **A.D.E: Edit Executable Interaction**. [DAI-07](ade/docs/diagram-driven-ai/states-v1.md) aggiunge **A.D.E: Edit Executable State Machine** e **A.D.E: Simulate State Machine** sullo stesso journal. [DAI-08](ade/docs/diagram-driven-ai/messaging-v1.md) aggiunge **A.D.E: Edit Messaging Topology** e **A.D.E: Simulate Messaging**, con prove broker separate dalla simulazione e dalla pubblicazione dei file. Corpi arbitrari e servizi esterni richiedono gli adapter successivi. **Edit Model Specification** resta disponibile per l'editing avanzato.

La [PR M5 #7](https://github.com/FrappaF/ADE/pull/7) è stata integrata in `main` il 4 novembre 2026, commit `69e25b5e`. Su quella revisione sono riuscite la [CI rapida](https://github.com/FrappaF/ADE/actions/runs/41905666828) e la [CI desktop Linux/macOS](https://github.com/FrappaF/ADE/actions/runs/41905667052), comprese build e prove grafiche. Questo aggiorna i riferimenti alla CI ancora aperta nei verbali storici; VoiceOver, revisione UX dell'utente e Windows restano verifiche distinte.

Le segnalazioni dei test manuali del 5 novembre sono raccolte nella [roadmap delle correzioni](ade/docs/manual-test-roadmap.md): account e feedback AI, cartella del progetto e terminale, Sync globale, relazioni, disposizione e menu dei diagrammi. Gli interventi sono implementati nel workbench desktop; capacità e limiti del collaudo sono nel [verbale di verifica](ade/docs/manual-test-verification.md).

## Generare i diagrammi di una codebase

Dopo **Import Codebase**, **Explore Architecture** avvia la [generazione completa dei diagrammi](ade/docs/diagram-workflow.md): Codex consulta il catalogo delle notazioni, pianifica le viste pertinenti dall'overview ai dettagli e prepara tutte le bozze senza approvazioni intermedie. **Review All Changes** riunisce piano, esclusioni, modifiche ed anteprime; **Apply All Changes** applica l'insieme revisionato in una sola operazione locale. **Continue Generation** riprende il lavoro se restano lacune o il budget è esaurito. Le viste di stato descrittive restano non supportate.

L'assistente vive in una modale temporanea: la chiusura azzera la conversazione, conserva le bozze e aggiorna automaticamente la pagina. La review mostra prima i diagrammi; i dettagli delle modifiche sono espandibili in fondo e gli impedimenti all'applicazione restano visibili. **Project Settings** e **AI Settings** si raggiungono dal menu del progetto, con comandi raggruppati.

## Dopo il pull di main: preparazione del PC

I comandi seguenti sono per macOS e Linux, dalla radice del clone A.D.E. Sostituire i percorsi di esempio con quelli del proprio computer. Chiudere l'istanza di sviluppo A.D.E prima di aggiornare dipendenze e build. Il clone contiene l'IDE; creare i propri progetti in cartelle separate dal clone.

1. Verificare i prerequisiti: Git, Python 3 (la CI usa 3.12), compilatore C/C++ e Node della versione in `.nvmrc`, attualmente **24.22.1**, con il suo npm. Con [nvm](https://github.com/nvm-sh/nvm#installing-and-updating), usare i comandi sotto; con un altro gestore selezionare la stessa versione Node.
2. Su **macOS**, verificare `xcode-select -p`, `xcrun --find clang` e `python3 --version`. Se mancano i Command Line Tools, installarli con `xcode-select --install` e completare l'installazione prima di procedere. Su Apple Silicon usare Node arm64, coerente con la macchina.
3. Su **Debian/Ubuntu**, installare le dipendenze native indicate nella [guida al fork](ade/docs/fork-development.md#da-un-clone-pulito): `build-essential pkg-config libx11-dev libxkbfile-dev libkrb5-dev libsecret-1-dev libgtk-3-dev libgbm-dev libnss3 libasound2-dev xvfb xauth`. I nomi possono variare fra distribuzioni.
4. Dal clone già aggiornato a `main`, selezionare Node e controllare lo stato locale:

```sh
cd "/percorso/del/clone/ADE"
git status --short --branch
nvm install
nvm use
node --version
npm --version
```

`node --version` deve corrispondere a `.nvmrc`. I prerequisiti Windows e l'avvio tramite `scripts\code.bat` sono descritti nella [guida al fork](ade/docs/fork-development.md); la procedura sotto e la matrice desktop corrente riguardano macOS/Linux.

## Installazione, build e primo avvio

Dopo aver selezionato Node e installato i prerequisiti di sistema, dalla radice del clone eseguire:

```sh
npm run ade:setup
./ade/scripts/dev.sh
```

**`npm run ade:setup` è il comando unico di preparazione:** controlla la versione esatta in `.nvmrc`, imposta `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` e `FOUNDRY_LOCAL_SKIP_INSTALL=1` per i processi figli, prepara gli header nativi, esegue `npm ci`, compila client/motore A.D.E, estensioni e Copilot, quindi prepara Electron. Mostra il passaggio corrente e si ferma al primo errore, conservandone il codice di uscita. `npm ci` usa i lockfile e installa anche `ade/runtime`, `ade/code-import` e `ade/ai` tramite gli script del repository; lasciare abilitati gli script npm.

Se servono soltanto **preinstallazione e installazione**, senza la build desktop:

```sh
npm run ade:setup -- --install-only
```

Le opzioni sono descritte anche da `npm run ade:setup -- --help`. Lo script usa soltanto i moduli integrati di Node ed è disponibile anche prima di installare `node_modules`. Node e i prerequisiti nativi del sistema restano quelli del paragrafo precedente.

Il primo avvio può completare il download delle estensioni integrate: serve una connessione anche per questi artifact. A.D.E usa un profilo separato sotto `.build/ade-*`. Non occorre installare l'estensione del prototipo né aprire un Extension Development Host.

Per un controllo dei tipi di produzione, separato dalla build, è disponibile il comando usato in CI:

```sh
GOMEMLIMIT=3GiB GOMAXPROCS=2 node node_modules/@typescript/native/bin/tsc --project ade/tsconfig.production.json --pretty false
```

Per gli avvii successivi, dalla radice del clone bastano `nvm use` e `./ade/scripts/dev.sh`, oppure `./ade/scripts/dev.sh "/percorso/del/tuo/progetto"` per aprire una cartella specifica. Dopo ulteriori pull, selezionare nuovamente Node dalla `.nvmrc` e rieseguire `npm run ade:setup` per aggiornare dipendenze e output: un semplice riavvio non ricompila sorgenti cambiati se `out/` esiste già. Per iterare sui soli sorgenti del client con dipendenze già aggiornate basta `npm run build-fast -- --client-only`.

## Imparare a usare ADE

La [guida completa per utenti esterni](ade/docs/guida-utente/README.md) accompagna dalla prima apertura a diagrammi, contratti, casi indipendenti, codice e collaborazione IA. Include 28 capitoli, screenshot dell’interfaccia corrente e sei versioni progressive del caso di studio Bottega Ordini.

- [Guida PDF](ade/docs/guida-utente/Guida-ADE.pdf), con indice e collegamenti.
- [Guida HTML da scaricare e aprire nel browser](ade/docs/guida-utente/Guida-ADE.html), consultabile offline con ricerca e immagini ingrandibili.
- [Progetti di esempio pronti da estrarre](ade/docs/guida-utente/progetti-esempio.zip).
- [Esempi in cartelle](ade/examples/guida/INIZIA-QUI.md), per chi usa il clone.

Copia le cartelle degli esempi in uno spazio di lavoro separato dal clone dell’IDE. Inizia con **Open Project** su `01-bottega-visuale`; prosegui con il template `02-quantita-ordine`. La modellazione e il laboratorio eseguibile non richiedono account IA o modifiche manuali al JSON. Per provare importazione ed evidenze usa **Import Codebase** su `03-codebase-ordini`.

La guida distingue aggiornamento del codice tramite chat, implementazione in worktree e profili deterministici, con prerequisiti e limiti di ciascun percorso. I vecchi criteri di feature e le nuove operazioni condivise non sono intercambiabili automaticamente.

## Problemi comuni

| Sintomo | Cosa controllare |
| --- | --- |
| `dev.sh` rifiuta Node | Eseguire `nvm use` dalla radice del clone e confrontare `node --version` con `.nvmrc`. |
| Errori di compilazione nativa su Mac | Verificare Command Line Tools, `xcode-select -p`, `xcrun --find clang`, Python e architettura Node; poi ripetere installazione e build. |
| App aperta ma funzioni nuove assenti | Chiudere l'app, aggiornare dipendenze e ricompilare gli output; riavviare con `ade/scripts/dev.sh` dal clone aggiornato. |
| Collaborazione IA nascosta | Verificare che `chat.disableAIFeatures` non sia attivo nelle impostazioni. |
| Un percorso IA richiede prerequisiti | Controllare il percorso scelto: chat modello-codice, worktree e profilo deterministico hanno prerequisiti distinti; vedere la guida utente. |
| Criterio sconosciuto o nessun test collegabile | Usare i form del contratto e dei casi indipendenti e controllare tipo di target e formato richiesti dal percorso. |
| Si vede il piano ma non parte la generazione | Verificare domande aperte e budget configurato: servono due invocazioni per piano e implementazione. |
| Baseline Git sporca o contesto superato | Salvare e registrare i cambiamenti sorgente, eseguire Sync e preparare un nuovo contesto. |
| CLI o modello non disponibili | Verificare eseguibile, login e ID modello nell'account originale; configurare il percorso assoluto della CLI se necessario. |

## Verifiche di sviluppo facoltative

Per verificare dominio e prototipo senza installare le dipendenze dell'editor, con Node dalla `.nvmrc`:

```sh
npm --prefix ade/prototype run check
npm --prefix ade/prototype test
npm run ade:test
```

## Documentazione

- [Guida completa con progetto di esempio](ade/docs/guida-utente/README.md)
- [Roadmap](ade/docs/roadmap.md)
- [Visione](ade/docs/vision.md)
- [Architettura](ade/docs/architecture.md)
- [Piano di redesign UI/UX e verifica dei workflow](ade/docs/ui-ux-redesign-plan.md)
- [Sviluppo e aggiornamenti del fork](ade/docs/fork-development.md)

Base upstream: [microsoft/vscode](https://github.com/microsoft/vscode). Revisione importata in [upstream.json](ade/upstream.json). Licenza del codice upstream: [MIT](LICENSE.txt), con [avvisi di terze parti](ThirdPartyNotices.txt). A.D.E è un progetto indipendente; branding e servizi della distribuzione Microsoft non sono automaticamente inclusi.
