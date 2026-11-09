# A.D.E — Agentice Development Environment

A.D.E è un ambiente di sviluppo visuale e collaborativo con l'IA, costruito come **derivazione dei sorgenti Code OSS**, la base open source di Visual Studio Code.

Il prodotto è un **IDE desktop autonomo**: sistema e feature sono nella sidebar nativa, con i diagrammi al centro e proprietà contestuali. Il primo editor consente di creare un sistema, disegnarne struttura e flusso e salvarlo senza modificare JSON. Codice, terminale e debugger sono viste secondarie su richiesta; vedi la [decisione UI/UX](ade/docs/decisions/0002-visual-workbench.md).

Il software engineer progetta struttura, diagrammi, flussi e interazioni fra attori e sistema; l'IA collabora alla realizzazione del codice e alla gestione dei dettagli tecnologici. L'obiettivo è esplorare feature, risorse, viste e controller e mantenere modello e codebase sincronizzati in entrambe le direzioni.

L’[integrazione della branch M2](ade/docs/m2-branch-integration.md) recupera gruppi persistenti della sidebar, riferimenti ai diagrammi condivisi e annullamento acquisto, mantenendo editing e navigazione M3.

## Stato attuale

I sorgenti dell'editor sono nella radice. Il [workbench visuale persistente](ade/docs/visual-editing.md) permette di creare progetti e feature, modificare diagrammi, salvare, usare undo/redo e riprendere il contesto. L'[esploratore semantico M3](ade/docs/semantic-explorer.md) comprende ricerca, mappa del sistema, contratti comportamentali, sequenze, stati delle risorse e impatto nel modello. [Lettura testuale e aiuto accessibili](ade/docs/accessibility.md) usano le viste native del workbench. Il [modello semantico](ade/docs/semantic-model.md) conserva gli schemi v2/v3 e aggiunge [v4](ade/docs/diagram-driven-ai/schema-v4.md), API, esempi e migrazioni esplicite.

M4 offre [importazione e Sync deterministici](ade/docs/code-import.md) su 16 profili, analisi semantica JS/TS integrata, ponte SCIP opzionale, evidenze navigabili e versioni recuperabili. M5 aggiunge la [collaborazione IA](ade/docs/ai-collaboration.md) con Codex e Claude Code originali: piano revisionabile, generazione in worktree Git, test Node, applicazione e annullamento. Il percorso con Codex e account reale è stato collaudato su Linux; Claude richiede ancora un collaudo reale equivalente. M6 integra la [riconciliazione bidirezionale](ade/docs/reconciliation.md) su file esistenti, con baseline comune, review, journal, undo e recupero; Sync non esegue automaticamente verifiche runtime. La fase [M6.DAI · Diagram-Driven AI](ade/docs/roadmap.md#m6dai--attuazione-completa-diagram-driven-ai) estende questa base a specifiche eseguibili, bootstrap e archetipi: il [primo sprint DAI-01](ade/docs/diagram-driven-ai/baseline.md) consegna inventario, glossario, corpus, decisioni e budget misurabili; [DAI-02](ade/docs/diagram-driven-ai/dai-02.md) aggiunge fondazione v4, readiness per target e primo pacchetto IA riproducibile; [DAI-03](ade/docs/diagram-driven-ai/dai-03.md) aggiunge gerarchia C4, contratti condivisi e ADR dei progetti con storia e vincoli; [DAI-04](ade/docs/diagram-driven-ai/dai-04.md) aggiunge predicati puri, profilo strutturale Node ESM e contesto IA completo con retrieval e scope verificati; [DAI-05](ade/docs/diagram-driven-ai/dai-05.md) aggiunge il primo progetto puro senza importazione, forward/reverse verificabile, oracoli indipendenti e pubblicazione recuperabile; [DAI-06](ade/docs/diagram-driven-ai/dai-06.md) aggiunge espressioni, sequenze e frame eseguibili locali con editor gerarchico e criteri indipendenti; [DAI-07](ade/docs/diagram-driven-ai/dai-07.md) aggiunge macchine piatte, simulazione spiegabile e checkpoint con deduplica; [DAI-08](ade/docs/diagram-driven-ai/dai-08.md) aggiunge queue/topic, policy esplicite e adapter locale verificato con NATS JetStream reale; [DAI-09](ade/docs/diagram-driven-ai/dai-09.md) aggiunge move/rename annidati, collisioni e indice ricostruibile sul round trip dichiarato; [DAI-10](ade/docs/diagram-driven-ai/dai-10.md) aggiunge proprietà guidate, chiarimenti versionati, review nel diagramma e preparazione continua opt-in con budget; [DAI-11](ade/docs/diagram-driven-ai/dai-11.md) aggiunge il secondo runtime Bun ESM con PIM invariato, piano di cambio stack e trasferimenti offline dei dati locali; [DAI-12](ade/docs/diagram-driven-ai/dai-12.md) aggiunge collaudo riproducibile, benchmark e gate di accettazione con lacune esplicite. Per provare la branch separata vedere la [guida locale](ade/docs/diagram-driven-ai/local-testing.md). L'esecuzione e diagnostica visuale (M7) e la beta completa (M8) restano da sviluppare.

I nuovi progetti visuali usano v4. Aprire un modello v2/v3 ne conserva il formato; **A.D.E: Upgrade Model to Version 4** esegue una migrazione annullabile. I percorsi di generazione/Sync M4–M6 mantengono il supporto v2/v3 e mantengono i guard legacy su v4; il nuovo adapter del progetto puro è separato. Le bozze v4 restano modificabili e salvabili; scope C4, ownership, tipi, operazioni, interfacce, binding, asserzioni e ADR si modificano con **A.D.E: Edit Structural Blueprint** e **A.D.E: Project Architecture Decisions**. **A.D.E: Edit Pure Predicate**, **A.D.E: Choose Runtime and Review Stack Plan** e **A.D.E: Preview Structural AI Context** aggiungono guardie, binding e disclosure locale senza inferenze; **A.D.E: Add Pure Quantity Feature** prepara il primo progetto eseguibile e **Implement Feature** avvia il job deterministico revisionabile. [Il percorso DAI-05](ade/docs/diagram-driven-ai/project-v1.md) include verifiche indipendenti, reverse limitato al template, ripresa, recovery e undo; [DAI-06](ade/docs/diagram-driven-ai/interactions-v1.md) estende lo stesso percorso a `alt/opt/loop/par/critical/ref` con risposte come dati e **A.D.E: Edit Executable Interaction**. [DAI-07](ade/docs/diagram-driven-ai/states-v1.md) aggiunge **A.D.E: Edit Executable State Machine** e **A.D.E: Simulate State Machine** sullo stesso journal. [DAI-08](ade/docs/diagram-driven-ai/messaging-v1.md) aggiunge **A.D.E: Edit Messaging Topology** e **A.D.E: Simulate Messaging**, con prove broker separate dalla simulazione e dalla pubblicazione dei file. Corpi arbitrari e servizi esterni richiedono gli adapter successivi. **Edit Model Specification** resta disponibile per l'editing avanzato.

La [PR M5 #7](https://github.com/FrappaF/ADE/pull/7) è stata integrata in `main` il 4 novembre 2026, commit `69e25b5e`. Su quella revisione sono riuscite la [CI rapida](https://github.com/FrappaF/ADE/actions/runs/41905666828) e la [CI desktop Linux/macOS](https://github.com/FrappaF/ADE/actions/runs/41905667052), comprese build e prove grafiche. Questo aggiorna i riferimenti alla CI ancora aperta nei verbali storici; VoiceOver, revisione UX dell'utente e Windows restano verifiche distinte.

Le segnalazioni dei test manuali del 5 novembre sono raccolte nella [roadmap delle correzioni](ade/docs/manual-test-roadmap.md): account e feedback AI, cartella del progetto e terminale, Sync globale, relazioni, disposizione e menu dei diagrammi. Gli interventi sono implementati nel workbench desktop; capacità e limiti del collaudo sono nel [verbale di verifica](ade/docs/manual-test-verification.md).

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

**`npm run ade:setup` è il comando unico di preparazione:** controlla la versione esatta in `.nvmrc`, imposta `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` e `FOUNDRY_LOCAL_SKIP_INSTALL=1` per i processi figli, prepara gli header nativi, esegue `npm ci`, compila client/motore A.D.E, estensioni e Copilot, quindi prepara Electron. Mostra il passaggio corrente e si ferma al primo errore, conservandone il codice di uscita. `npm ci` usa i lockfile e installa anche `ade/code-import` e `ade/ai` tramite gli script del repository; lasciare abilitati gli script npm.

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

## Creare e usare un nuovo progetto visuale

1. Dalla home scegliere **Create Project**, assegnare un nome e selezionare una cartella per il proprio sistema. Viene creato `.ade/model.json`. Se l'avvio ripristina un progetto precedente, aprire la palette comandi con `Cmd+Shift+P` su macOS o `Ctrl+Shift+P` su Linux e cercare **A.D.E: Open Home**.
2. Scegliere **Add Feature**: si creano una feature e due diagrammi vuoti, struttura e flusso.
3. Con **Add Element** inserire attori, interfacce, componenti, controller, risorse o azioni. Con **Connect Selection** scegliere tipo, destinazione, nome e condizione del collegamento. Le proprietà consentono di modificare nomi, descrizioni e relazioni.
4. Usare **Edit Behavioral Contract** per input, output, precondizioni, postcondizioni ed errori. **Add Existing Element** riusa la stessa identità in un'altra vista.
5. Con **Add Diagram** aggiungere sequenze o diagrammi di stato. Le sequenze riusano le interazioni; gli stati appartengono a una risorsa. Ricerca e **System Map** permettono di esplorare il sistema; **Show Change Impact** mostra i riferimenti del modello da rivedere.
6. Salvare con `Cmd+S`/`Ctrl+S`. Undo/redo, zoom e **Fit Diagram** sono disponibili nell'editor. Dopo aver chiuso A.D.E, usare **Open Project** sulla stessa cartella per riprendere il lavoro.

Queste operazioni non richiedono account IA. Disegni, condizioni e contratti descrivono il progetto: non generano automaticamente sorgenti e non eseguono il flusso. Per questo percorso non è necessario modificare il JSON. I costrutti supportati e i limiti delle viste sono nella [guida M3](ade/docs/semantic-explorer.md).

### Interazioni e strumenti del progetto

- **Files** mostra la cartella scelta con Create Project, Open Project o Import Codebase. La cartella viene aperta nel workspace nativo; i workspace con più cartelle conservano quelle esistenti. Un modello aperto singolarmente resta un documento fino all’apertura esplicita dei suoi strumenti.
- **Terminal** crea un nuovo terminale nella radice del progetto; i terminali già attivi conservano directory e processi. La CLI di una revisione AI viene aperta nel relativo worktree, indicato nel nome.
- **Sync Project**, nella barra globale e nella palette, considera tutto il perimetro configurato della codebase collegata. Mostra anteprima, inclusioni/esclusioni, conflitti ed esito. La [riconciliazione M6](ade/docs/reconciliation.md) confronta baseline, modello e codice e propone modifiche in entrambe le direzioni con review e recupero. Le modifiche fisiche create/move/delete e la verifica dei nuovi comportamenti sono incrementi DAI ancora da sviluppare.
- Le connessioni mostrano il tipo, il nome e la condizione. Clic destro o **Shift+F10** su un nodo apre creazione di relazioni, proprietà e azioni di rimozione; sulle relazioni apre modifica, navigazione agli estremi e rimozione. La creazione sul canvas si annulla con **Esc**. Rimuovere dalla vista mantiene l’identità nel modello; eliminare dal sistema richiede conferma.
- **Arrange Diagram** offre **Compact**, **Balanced** e **Spacious**; considera collegamenti, cicli e larghezza dei nomi. La modifica riguarda la vista corrente ed è annullabile. **Fit Diagram** rimane un comando separato.
- **AI Collaboration** è nel pannello contestuale del diagramma. Mostra account CLI e avanzamento come stati distinti; **Choose Model and CLI** configura modello, eseguibile e budget senza richiedere di ripetere un login già valido. **Refresh Account and Models** riconosce anche un login effettuato esternamente. Revisione, test, applicazione, recupero e confronto sono nel gruppo delle altre azioni AI, con i relativi prerequisiti.

## Provare l'implementazione IA su un nuovo progetto Node.js

Il percorso IA richiede una **codebase Git importata**, almeno un commit e sorgenti senza modifiche pendenti. **Create Project** da solo prepara il modello visuale: non inizializza Git, non crea una base applicativa e non collega automaticamente un modello progettato separatamente a una nuova codebase. Per la prima prova partire da un piccolo progetto JavaScript con moduli `.mjs` e test Node integrati, senza dipendenze da installare nel worktree.

### 1. Preparare una base di codice separata dal clone A.D.E

Creare una cartella nuova, con il genitore già esistente, e inizializzare una funzione dimostrativa da correggere:

```sh
mkdir "/percorso/nuovo-progetto-node"
cd "/percorso/nuovo-progetto-node"
git init
printf '%s\n' '.ade/' > .gitignore
printf '%s\n' "export function checkout(approved) { return 'paid'; }" > checkout.mjs
git add .gitignore checkout.mjs
git commit -m "Initial Node project"
git status --short
```

Se Git richiede nome ed email, configurare la propria identità Git e ripetere il commit. L'ultimo comando deve avere output vuoto. `.ade/` contiene modelli importati, registri e worktree gestiti da A.D.E; nell'esempio è esclusa dalla baseline Git dei sorgenti.

### 2. Importare e completare il modello

1. Tornare nella radice del clone A.D.E e avviare `./ade/scripts/dev.sh "/percorso/nuovo-progetto-node"`.
2. Dalla home scegliere **Import Codebase**, selezionare la **radice Git** del nuovo progetto e scegliere **Structure and Available Semantic Analysis**. L'importazione è locale e non chiama l'IA.
3. Esplorare **System Map** e le dichiarazioni importate. Nel modello importato usare **Add Feature** per creare, per esempio, «Gestione esito pagamento». Salvare. La selezione dei file da condividere con l'IA sarà esplicita: nella prova scegliere `checkout.mjs` anche se non è suggerito automaticamente.
4. Aggiungere i criteri di accettazione con il passaggio manuale seguente. La sola descrizione dell'intento o una precondizione non sostituisce questi criteri.

### 3. Inserire i criteri di accettazione nel modello

**Limite attuale:** l'editor visuale modifica input/output, precondizioni, postcondizioni ed errori, ma non `acceptanceCriteria`. M5 richiede criteri dichiarati cui collegare i test. Per un modello nuovo occorre quindi una modifica manuale del JSON prima di avviare l'implementazione.

Salvare prima tutte le modifiche visuali. Nel terminale, dalla cartella del progetto Node appena importato, ricavare il percorso del modello attivo:

```sh
cd "/percorso/nuovo-progetto-node"
node -e 'const fs = require("node:fs"); const project = JSON.parse(fs.readFileSync(".ade/code-project.json", "utf8")); console.log(".ade/imports/" + project.active + "/model.ade.json");'
```

Aprire il file indicato in un editor di testo. In `semantics.elements` trovare la feature appena creata, identificata da `kind: "feature"` e dal suo nome. Aggiungere alla feature la proprietà `behavior` seguente. Se `behavior` esiste già, conservarne gli altri campi e aggiungere i criteri al suo array `acceptanceCriteria`, con ID univoci per quell'elemento:

```json
{
  "inputs": [],
  "outputs": [],
  "preconditions": [],
  "postconditions": [],
  "errors": [],
  "permissions": [],
  "acceptanceCriteria": [
    {
      "id": "payment-declined",
      "given": "approved è false",
      "when": "viene chiamata checkout(approved)",
      "then": "restituisce la stringa declined"
    },
    {
      "id": "payment-approved",
      "given": "approved è true",
      "when": "viene chiamata checkout(approved)",
      "then": "restituisce la stringa paid"
    }
  ]
}
```

Questo oggetto è il **valore di `behavior` nella feature**, non un sostituto dell'intero documento. Conservare ID, dichiarazioni importate e gli altri campi del modello. Salvare il JSON; A.D.E ricarica gli aggiornamenti esterni del documento pulito. Se necessario riaprire la cartella con **Open Project** e controllare nelle proprietà della feature che i criteri siano visibili. Non modificare `code-index.json`, `import-state.json` o `snapshot.json`.

### 4. Collegare il provider e scegliere il modello

1. Installare la CLI originale del provider sul proprio computer: seguire le istruzioni ufficiali di [Codex](https://developers.openai.com/codex/cli) oppure [Claude Code](https://code.claude.com/docs/en/setup). Per Codex è disponibile `npm install -g @openai/codex`. Verificare nel terminale `codex --version` oppure `claude --version`.
2. Dalla palette di A.D.E eseguire **A.D.E: Connect Claude Code or Codex**, scegliere il provider e **Sign In**. A.D.E verifica prima la CLI: se non la trova, mostra istruzioni di installazione e di configurazione del percorso. Completare il login originale nel browser/terminale. Codex può usare il login ChatGPT nativo quando il relativo SDK è pronto; altrimenti viene aperto `codex login`. Il login nativo mostra il proprio stato e segnala una mancata risposta dopo 15 secondi. Per aprire direttamente `codex login` nel terminale scegliere **Sign In with CLI**. Claude usa `claude auth login`. Non è richiesta una chiave API per questo percorso.
3. Riaprire il comando e scegliere **Refresh Account and Models** se necessario; quindi riaprirlo e scegliere **Choose Model and CLI**. Selezionare un modello disponibile nel proprio account oppure indicare un ID esatto verificato nella CLI. Specificare `codex`/`claude` o il percorso assoluto dell'eseguibile, utile se l'app non eredita il `PATH` del terminale.
4. Per generare codice scegliere **Plan and Implementation · At Most Two Agent Runs**. Le altre opzioni si fermano al piano o alla sola preparazione del contesto. Il limite riguarda le invocazioni della CLI, non i suoi token, retry o richieste interne. Non viene scelto automaticamente un modello commerciale economico senza misure e tariffe confrontabili.

### 5. Generare, verificare, applicare e annullare

1. Eseguire **A.D.E: Implement Feature**, selezionare la feature e descrivere l'intento: «Correggi checkout: con false restituisci declined, con true mantieni paid; conserva l'export e aggiungi test con node:test e node:assert/strict, senza dipendenze esterne».
2. Selezionare `checkout.mjs` tra i file da condividere. Leggere l'anteprima del contesto e confermare **Send Context**. Il provider riceve quel contesto e i sorgenti selezionati.
3. Leggere il piano, i file previsti e le eventuali domande. Se ci sono domande, aggiornare intento o contratto e preparare un nuovo piano. Quando il piano è adeguato, confermare **Generate in Worktree**.
4. Rivedere le differenze e il riepilogo. I sorgenti principali non sono ancora modificati. Avviare **Run Tests**; dalla palette il comando è **A.D.E: Verify Implementation**. I test generati vengono eseguiti localmente con Node dopo la conferma di attendibilità del workspace.
5. Dopo un esito positivo scegliere **Apply Verified Changes**, oppure **A.D.E: Apply Verified Implementation** dalla palette. Un test fallito impedisce l'applicazione. Controllare anche il risultato rispetto al comportamento richiesto: i test generati non sostituiscono la revisione.
6. Per provare il ripristino scegliere **A.D.E: Undo Implementation**. Dopo un riavvio usare prima **A.D.E: Resume Implementation**. Se i file sono stati modificati manualmente nel frattempo, l'annullamento si ferma invece di sovrascriverli.
7. Dopo applicazione o annullamento usare **Sync Project**, rivedere l'anteprima e scegliere **Apply Sync** per aggiornare il modello dal codice. Se si mantiene l'implementazione, registrare i sorgenti con un commit prima di una nuova operazione M5. Per il recupero di una transazione interrotta è disponibile **A.D.E: Recover Interrupted Implementation**.

Il percorso corrente esegue direttamente test Node; non installa dipendenze né avvia automaticamente script npm, build di framework o test Python/Java. L'importazione multilinguaggio non implica un esecutore IA verificato per ogni stack. La [guida M5](ade/docs/ai-collaboration.md) descrive recupero, budget, benchmark e limiti.

## Problemi comuni

| Sintomo | Cosa controllare |
| --- | --- |
| `dev.sh` rifiuta Node | Eseguire `nvm use` dalla radice del clone e confrontare `node --version` con `.nvmrc`. |
| Errori di compilazione nativa su Mac | Verificare Command Line Tools, `xcode-select -p`, `xcrun --find clang`, Python e architettura Node; poi ripetere installazione e build. |
| App aperta ma funzioni nuove assenti | Chiudere l'app, aggiornare dipendenze e ricompilare gli output; riavviare con `ade/scripts/dev.sh` dal clone aggiornato. |
| Collaborazione IA nascosta | Verificare che `chat.disableAIFeatures` non sia attivo nelle impostazioni. |
| Richiesta di importare o sincronizzare prima dell'IA | Aprire il modello importato della codebase Git, salvarlo e completare importazione/Sync; il solo progetto visuale `.ade/model.json` non basta. |
| Criterio sconosciuto o nessun test collegabile | Controllare `behavior.acceptanceCriteria` della feature, ID univoci e ricaricamento del modello attivo. |
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

- [Roadmap](ade/docs/roadmap.md)
- [Visione](ade/docs/vision.md)
- [Architettura](ade/docs/architecture.md)
- [Sviluppo e aggiornamenti del fork](ade/docs/fork-development.md)

Base upstream: [microsoft/vscode](https://github.com/microsoft/vscode). Revisione importata in [upstream.json](ade/upstream.json). Licenza del codice upstream: [MIT](LICENSE.txt), con [avvisi di terze parti](ThirdPartyNotices.txt). A.D.E è un progetto indipendente; branding e servizi della distribuzione Microsoft non sono automaticamente inclusi.
