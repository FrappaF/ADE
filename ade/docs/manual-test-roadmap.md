# Roadmap delle correzioni emerse dai test manuali

Data: 5 novembre 2026. Branch: `fix/manual-test-followup`, dalla revisione `69e25b5e`. Questo documento sviluppa le segnalazioni dell’utente in requisiti e criteri di accettazione. Gli interventi sono ora implementati nel workbench desktop; il [verbale di verifica](manual-test-verification.md) distingue test automatici, collaudo desktop e verifiche di piattaforma ancora aperte.

L’incremento comprende anche il comando unico di setup, la documentazione di avvio e le precedenti correzioni al feedback del login. La verifica del login usa il comando di stato della CLI originale: non legge direttamente le credenziali e non confonde l’account CLI con quello eventualmente mostrato dalla chat nativa.

La [proposta interattiva della UI/UX](../design/ux-preview/index.html), descritta nella [guida al prototipo](../design/ux-preview/README.md), resta un riferimento dimostrativo separato. L’app usa i componenti e i temi nativi del workbench; il file HTML non viene caricato nel prodotto.

## Obiettivo e ordine di lavoro

Il percorso da rendere affidabile è: creare o aprire un progetto, ritrovare la stessa cartella in Files e nel terminale, collegare Codex già autenticato, ricevere una risposta comprensibile dalle azioni AI, sincronizzare il progetto e modificare diagrammi leggibili. L’interfaccia deve risultare chiara e coerente: poche azioni primarie, opzioni vicine all’oggetto interessato, stato dell’operazione sempre visibile.

| Fase | Priorità | Punti | Risultato atteso |
| --- | --- | --- | --- |
| 1 — AI utilizzabile | P0, bloccante | AI-01, AI-02 | Account già autenticato riconosciuto, configurazione guidata, azioni con esito o motivo del blocco |
| 2 — Contesto del progetto | P1 | PRJ-01, TERM-01, SYNC-01 | Stessa radice in modello, Files e terminale; Sync globale facilmente raggiungibile |
| 3 — Diagrammi leggibili | P1 | REL-01, LAY-01, ROUTE-01 | Tipi di relazione distinguibili, disposizione più ariosa, connessioni selezionabili |
| 4 — Editing diretto | P2 | CTX-01, CTX-02, UI-01 | Menu contestuali di nodi e relazioni, barra degli strumenti più semplice |

Le fasi indicano l’ordine di implementazione, senza stimare date prima della diagnosi AI. PRJ-01 precede TERM-01 e definisce la radice usata da SYNC-01. REL-01 e ROUTE-01 precedono CTX-02, perché una relazione deve essere distinguibile e selezionabile per poterla modificare. La barra UI-01 viene consolidata dopo aver definito le azioni contestuali.

## 1. AI utilizzabile

### AI-01 — Riconoscere il login Codex già effettuato

**Segnalazione sviluppata:** dopo `codex login` nel terminale, A.D.E continua a proporre l’accesso. Per l’utente «sono autenticato», «devo scegliere il modello» e «il provider non è disponibile» sono condizioni differenti; il prodotto deve distinguerle e indicare il prossimo passo corretto.

**Riscontro nella revisione di partenza:** `AdeAiService` conserva una configurazione CLI separata dall’account nativo; in assenza di configurazione diverse azioni riaprono `connect()`. Il login avviato nel terminale non equivale al salvataggio di modello, eseguibile e budget. Questo spiega una possibile riapertura della configurazione, ma non prova da solo la causa del mancato riconoscimento osservato sul Mac.

**Intervento:**

- Definire stati separati per CLI assente, verifica in corso, CLI autenticata, accesso necessario, configurazione incompleta ed errore di verifica. Lo stato dell’account nativo deve essere distinto quando usa un’istanza o una configurazione diversa.
- Verificare l’accesso con il comando di stato ufficiale della CLI selezionata, con timeout e gestione dei diversi esiti; per Codex partire da `codex login status`. Non leggere direttamente file di token. Non invocare un modello a pagamento per verificare il login.
- Usare lo stesso eseguibile risolto e lo stesso contesto di ambiente per controllo, login e invocazioni AI. Verificare PATH della shell su macOS, percorso assoluto e l’eventuale `CODEX_HOME`, senza copiare o mostrare credenziali.
- Aggiornare lo stato entrando nella sezione AI, dopo il login avviato da A.D.E e con un comando esplicito di aggiornamento. Rilevare anche un login eseguito in un terminale esterno al successivo controllo; invalidare lo stato cambiando provider o eseguibile.
- Se l’account è già collegato, proporre il modello o la configurazione mancante senza chiedere un nuovo accesso. Salvare la scelta e ripristinarla dopo il riavvio.
- Se il catalogo dei modelli non è disponibile ma la CLI è autenticata, dichiararlo e permettere l’inserimento dell’ID del modello. L’autenticazione non deve implicare disponibilità o quota per qualsiasi modello.

**Esempio atteso:** `codex login status` conferma il login; **Implement Feature** mostra «Codex collegato · scegli un modello» se manca la configurazione, oppure prosegue alla feature. Non ripropone «Sign In» come requisito già soddisfatto.

**Accettazione:** login preesistente, login dalla UI, login esterno e riavvio vengono riconosciuti; CLI assente, logout, timeout, eseguibile personalizzato e configurazione diversa producono stati distinti e azioni utili. La verifica non modifica l’account né avvia richieste di generazione.

### AI-02 — Dare feedback a tutte le azioni AI

**Segnalazione sviluppata:** un pulsante cliccato non deve lasciare il dubbio se l’operazione sia partita, sia bloccata o sia fallita. Il problema riguarda l’intero percorso AI, oltre al solo login.

**Riscontro nella revisione di partenza:** esistono progressi e notifiche per alcune operazioni, ma ci sono anche ritorni anticipati per configurazione assente, operazione già attiva, AI disabilitata e sessione mancante. I pulsanti vengono abilitati usando condizioni diverse; un esito generico della CLI non spiega necessariamente il passo successivo.

**Intervento:**

- Inventariare Connect, Open AI CLI, Implement Feature, Interpret Unresolved Evidence, Review Changes, Run Tests, Apply, Undo, Resume, Recover, Compare Models ed esportazione del rapporto; verificare sia i pulsanti sia i comandi della palette.
- Per ogni azione definire prerequisiti, stato in corso, risultato, annullamento ed errore. Un comando bloccato deve spiegare il requisito; un pulsante disabilitato deve renderlo consultabile con tooltip e lettore di schermo.
- Distinguere CLI mancante, login richiesto, configurazione incompleta, modello non disponibile, limite del provider, timeout, assenza di progetto importato, repository non pronto e verifica fallita. Quando l’errore non è classificabile, mostrarlo come errore generico con dettagli diagnostici depurati.
- Trattare budget zero e solo piano come esiti espliciti: «Contesto preparato, nessuna richiesta AI» e «Piano pronto, generazione non prevista dal budget».
- Mostrare il progresso della fase effettiva: preparazione del contesto, attesa del provider, piano pronto, generazione, test e applicazione. Offrire annullamento quando supportato e impedire esecuzioni concorrenti con un motivo visibile.
- Conservare un riepilogo dell’ultimo esito nella sezione AI e rendere accessibili i dettagli tecnici utili, senza registrare credenziali o riversare automaticamente il contesto sorgente nei log.

**Esempio atteso:** su un progetto senza importazione, **Implement Feature** spiega «Importa la codebase del progetto prima di implementare» e offre l’azione pertinente. Con budget zero apre il contesto e conferma che nessuna chiamata è stata effettuata.

**Accettazione:** ogni azione dell’inventario ha un percorso verificato di successo e di prerequisito mancante o errore; nessun clic valido termina senza un risultato visibile. I test con provider simulato verificano gli esiti deterministici; un collaudo Codex reale su macOS verifica separatamente login e una richiesta autorizzata.

## 2. Contesto del progetto

### PRJ-01 — Allineare progetto A.D.E e cartella in Files

**Segnalazione sviluppata:** dopo aver scelto una cartella durante Create Project, la voce Files deve mostrare quella cartella. Lo stesso comportamento deve valere per Open Project e Import Codebase, e restare corretto al riavvio e cambiando progetto.

**Riscontro nella revisione di partenza:** `createProject()` e `openProject()` caricano il documento del modello; non aprono la cartella come workspace. La voce Files richiama l’Explorer nativo, che segue il workspace dell’editor. Sono quindi possibili due contesti differenti nella stessa finestra.

**Intervento:**

- Definire una radice esplicita del progetto: cartella scelta per i progetti visuali e `sourceRoot` per quelli importati. Non dedurla dalla cartella interna `.ade/imports/<id>`.
- Collegare creazione, apertura e importazione al servizio workspace nativo, preservando salvataggio, conferme per documenti modificati, attendibilità e ripristino. Il cambio di cartella può ricaricare la finestra: riprendere il progetto selezionato dopo il caricamento.
- Nei workspace con più cartelle mantenere esplicita la radice del progetto A.D.E attivo senza sostituire in silenzio le altre cartelle. L’apertura isolata di un file modello deve distinguersi dall’apertura di un progetto.
- Se esiste già `.ade/model.json`, spiegare che la cartella contiene un progetto e proporre di aprirlo o scegliere un’altra cartella, conservando la protezione contro la sovrascrittura.

**Esempio atteso:** creando `~/Progetti/negozio-demo`, Files mostra `negozio-demo` con i suoi file; riaprendo il progetto continua a mostrare la stessa radice.

**Accettazione:** nuovo progetto, progetto esistente, codebase importata, cambio A→B, cartella con spazi e riavvio mantengono coerenti modello e Files. Nessun documento modificato viene perso e un progetto esistente non viene sovrascritto.

### TERM-01 — Aprire i nuovi terminali nella radice corretta

**Segnalazione sviluppata:** aprendo Terminal da A.D.E ci si aspetta di lavorare subito nella cartella del progetto, senza eseguire manualmente `cd` da `~`.

**Riscontro nella revisione di partenza:** il pulsante Terminal richiama il toggle generico del pannello. Open AI CLI imposta la directory dal contesto importato o dal worktree, ma un progetto solo visuale non dispone necessariamente di quel contesto.

**Intervento:** usare la radice di PRJ-01 per i nuovi terminali del progetto e i comandi nativi pertinenti. La CLI aperta per una sessione di implementazione in revisione usa invece il suo worktree e lo dichiara nel nome o nel riepilogo. Rivelare un terminale esistente non deve cambiarne la directory né interromperne il processo; se appartiene a un altro progetto, offrire un nuovo terminale del progetto attivo. Senza progetto, indicare il contesto usato.

**Accettazione:** il comando `pwd` in un nuovo terminale corrisponde alla radice attiva per progetti creati, aperti e importati, anche con spazi nel percorso. Dopo A→B un nuovo terminale parte in B e quello già attivo in A continua a funzionare. Open AI CLI distingue radice sorgenti e worktree.

### SYNC-01 — Rendere globale e riconoscibile il Sync del progetto

**Segnalazione sviluppata:** Sync deve essere raggiungibile dal progetto, indipendentemente dal diagramma o dall’item selezionato. «Globale» indica tutto il perimetro della codebase collegata al progetto attivo, con esclusioni dichiarate.

**Riscontro nella revisione di partenza:** il Sync deterministico M4 esiste; il pulsante viene mostrato negli strumenti quando esiste `code.context`. Prevede anteprima, conflitti e applicazione. Il problema da affrontare comprende visibilità, disponibilità e comprensione del suo perimetro.

**Intervento:**

- Esporre **Sync Project** nella barra del progetto e nella palette, riusando il motore esistente e rendendolo disponibile da tutte le viste A.D.E.
- Mostrare stato dell’ultimo Sync e cambiamenti rilevati. Prima di avviare, indicare radice, inclusioni ed esclusioni; se manca una codebase collegata, spiegare il requisito e offrire Import Codebase.
- Conservare anteprima e gestione dei conflitti; esplicitare anche «Nessuna modifica», errore e annullamento. Serializzare il Sync rispetto alle operazioni AI che modificano gli stessi sorgenti e invalidare contesti diventati obsoleti.
- Chiarire nell’interfaccia che il Sync attuale aggiorna il modello dal codice. La riconciliazione bidirezionale completa resta nella milestone M6 e non viene promessa da questo pulsante.

**Esempio atteso:** modificando `src/prezzi.ts`, da qualsiasi diagramma **Sync Project** prepara un’anteprima sull’intera codebase collegata; dopo l’applicazione indica quanti file o simboli sono cambiati e quali viste rivedere.

**Accettazione:** comando raggiungibile senza selezionare un item; rilevamento di aggiunte, modifiche e rimozioni nel perimetro; esito esplicito senza cambiamenti; conflitti senza perdita di modifiche manuali; progetto senza importazione guidato al passo successivo.

## 3. Diagrammi leggibili

### REL-01 — Distinguere il tipo di relazione sul canvas

**Segnalazione sviluppata:** le frecce appaiono tutte uguali; nome e condizione da soli non permettono di capire se un elemento chiama, dipende, legge o scrive.

**Riscontro nella revisione di partenza:** il modello distingue sei tipi di relazione, mentre il rendering generale usa lo stesso tracciato con freccia e un’etichetta derivata da nome o condizione. Le proprietà contengono informazioni che il canvas non comunica con la stessa chiarezza.

**Intervento:** introdurre una rappresentazione coerente fra viste, con tipo leggibile, freccia o tratteggio distintivo, legenda compatta e dettagli al passaggio del mouse o al focus. Il colore può rafforzare il significato, ma non deve essere l’unico segnale. Conservare nome, condizione ed eventuale errore; sequenze e transizioni mantengono la loro notazione specifica.

| Tipo esistente | Significato da rendere esplicito | Proposta di rappresentazione |
| --- | --- | --- |
| `invocation` | Chiama | Linea continua, freccia direzionale, etichetta «chiama» |
| `dependency` | Dipende da | Linea tratteggiata, freccia aperta, etichetta «dipende da» |
| `read` | Legge | Freccia direzionale con indicatore testuale «legge» |
| `write` | Scrive | Freccia direzionale con indicatore testuale «scrive» |
| `transition` | Passa a un altro stato | Freccia di transizione con evento, guardia ed errore quando presenti |
| `realization` | Realizza | Linea tratteggiata con triangolo vuoto ed etichetta «realizza» |

La tabella propone una convenzione visuale per i tipi già supportati; non aggiunge nuovi tipi semantici. La resa va verificata con zoom ridotto, tema chiaro, scuro e contrasto elevato.

**Accettazione:** due collegamenti con lo stesso nome e tipo diverso sono distinguibili senza aprire Properties; direzione e tipo restano leggibili senza colore; nome e condizione non vengono persi; descrizioni accessibili riportano sorgente, tipo e destinazione.

### LAY-01 — Arrange Diagram più arioso e sensibile alla struttura

**Segnalazione sviluppata:** la disposizione automatica deve migliorare la lettura, lasciando spazio a nomi, etichette e connessioni. Un diagramma piccolo non deve essere compresso solo per occupare meno superficie.

**Riscontro nella revisione di partenza:** Arrange usa una griglia fissa a tre colonne, con passo orizzontale e verticale costante, senza considerare le relazioni o la lunghezza delle etichette.

**Intervento:** sostituire la griglia come disposizione generale con un layout deterministico che tenga conto di dimensioni dei nodi, direzione prevalente delle relazioni, componenti scollegate e cicli. Prevedere densità compatta, bilanciata e ampia, con bilanciata come default. Coordinare distanze e corridoi con ROUTE-01. Applicare il layout solo alla vista corrente, come singola operazione annullabile; Fit Diagram rimane un’azione distinta e non deve rendere il testo illeggibile.

**Accettazione:** campioni con 5, 15 e 30 nodi, nomi lunghi, ciclo e componenti separate non presentano sovrapposizioni dei nodi dopo Arrange. Stesso input e stessa densità producono lo stesso risultato. Undo ripristina esattamente le posizioni precedenti; salvataggio e riapertura conservano il layout.

### ROUTE-01 — Separare relazioni convergenti e parallele

**Segnalazione sviluppata:** quando più relazioni arrivano allo stesso item, o collegano la stessa coppia, deve essere possibile seguire ogni percorso, leggerne l’etichetta e selezionare la relazione voluta.

**Riscontro nella revisione di partenza:** il routing evita i rettangoli dei nodi e introduce corsie per coppie di estremi. Non coordina globalmente tutti i collegamenti incidenti allo stesso nodo; relazioni di coppie diverse possono quindi condividere porte e tratti.

**Intervento:** assegnare porte e corsie considerando tutte le relazioni incidenti, gestire direzioni opposte e auto-relazioni, riservare spazio alle etichette e ridurre tratti coincidenti. Evidenziare la relazione selezionata e i suoi estremi. Aggiungere un’area di selezione più ampia del tratto visibile e un selettore fra relazioni quando restano sovrapposte. Nei casi non instradabili mostrare un avviso e mantenere l’accesso alla relazione dall’elenco.

**Accettazione:** campione con almeno sei connessioni convergenti, tre parallele fra due nodi, una relazione inversa e una auto-relazione. Ogni relazione deve poter essere selezionata senza sceglierne un’altra per errore. Il routing deve restare stabile a parità di input e non attraversare i nodi; verificare il comportamento anche dopo trascinamento e cambio zoom.

## 4. Editing diretto e menu

### CTX-01 — Menu contestuale sugli item

**Segnalazione sviluppata:** clic destro su un item deve consentire operazioni frequenti nel punto in cui si sta lavorando, soprattutto creare una relazione senza ricercare sorgente e destinazione in più menu.

**Intervento:** menu nativo del workbench con **Crea relazione…**, **Rinomina**, **Modifica proprietà**, **Mostra nelle altre viste**, **Analizza impatto** e operazioni di rimozione pertinenti. Crea relazione preseleziona l’item come sorgente, propone solo tipi compatibili e consente di scegliere il target sul canvas o da un elenco ricercabile. Mostrare l’istruzione durante la scelta; Esc annulla senza modifiche. Riusare validazione, salvataggio e undo/redo esistenti. Distinguere rimozione dalla vista ed eliminazione dal modello quando entrambe sono supportate, rendendone esplicito l’impatto.

**Accettazione:** clic destro su `CheckoutController` → Crea relazione → «chiama» → scelta di `PaymentService` crea il collegamento nella vista e nel modello. Il flusso funziona anche con tastiera tramite menu contestuale/Shift+F10; un target incompatibile viene spiegato e non applicato; Esc e Undo sono verificati.

### CTX-02 — Menu contestuale sulle relazioni

**Segnalazione sviluppata:** clic destro sulla linea o sulla sua etichetta deve aprire un piccolo menu riferito a quella relazione, senza doverla ricercare nelle proprietà del nodo.

**Intervento:** menu con **Modifica relazione…**, **Vai alla sorgente**, **Vai alla destinazione** e rimozione pertinente. L’editor della relazione consente nome, tipo compatibile, estremi, condizione ed errore dichiarato; un cambio di tipo o estremi rivalida l’intera relazione. Il tipo della vista determina le opzioni disponibili. Prevedere la stessa azione dall’elenco accessibile delle relazioni; il menu deve funzionare su linea, freccia ed etichetta. Non aggiungere un comando «inverti» indiscriminato: la relazione inversa può essere semanticamente incompatibile.

**Accettazione:** una relazione scelta sul canvas è esattamente quella modificata; cambiando condizione o tipo il canvas e Properties si aggiornano, le altre viste restano coerenti e Undo/Redo ripristinano l’operazione. Un’eliminazione con impatto su più viste lo dichiara prima di essere applicata.

### UI-01 — Semplificare i menu dei diagrammi

**Segnalazione sviluppata:** troppe voci contemporanee rendono difficile riconoscere il comando giusto. Le icone devono rendere più rapidi i comandi comuni, mantenendo comprensibili quelli meno familiari.

**Intervento:**

- Separare azioni del progetto, azioni della vista e azioni dell’oggetto selezionato. La barra principale ospita salvataggio/cronologia, creazione principale, Arrange/Fit e Sync Project; le opzioni meno frequenti vanno in un menu «Altre azioni».
- Usare icone standard del workbench per Salva, Undo/Redo, zoom, Fit e menu aggiuntivo, con tooltip, nome accessibile e scorciatoia esistente quando disponibile. Conservare testo per azioni poco familiari come Sync Project e per quelle che richiedono un passo successivo esplicito.
- Mostrare comandi pertinenti al tipo di diagramma, spostando le operazioni sull’item nei menu CTX-01/CTX-02. Raggruppare la sezione AI secondo stato e passo successivo anziché presentare tutte le azioni allo stesso livello.
- In finestra stretta usare l’overflow, mantenendo accessibili i comandi primari e un ordine di focus stabile. Documentare scorciatoie nuove solo dopo aver verificato conflitti con il workbench.

**Accettazione:** in finestra normale e stretta l’utente trova creazione, Arrange, Fit e Sync senza espandere più gruppi. Ogni icona ha tooltip e nome accessibile; struttura, flusso, sequenza e stati mostrano opzioni pertinenti. Nessuna funzione supportata viene persa nella riorganizzazione.

## Piano di collaudo e completamento

Ogni punto si chiude con implementazione, verifiche proporzionate e registrazione dell’esito. I riscontri nel codice sopra sono analisi statica del workspace; non sostituiscono la riproduzione nell’app dell’utente.

1. **AI:** test mirati del controller e del ponte di esecuzione per stato CLI, configurazione e feedback; smoke desktop con provider simulato; collaudo macOS separato con Codex originale già autenticato. Una chiamata live usa un piccolo repository di prova e il modello scelto, senza benchmark automatici aggiuntivi.
2. **Progetto:** due cartelle temporanee A e B, una con spazi; creazione, apertura, importazione, Files, `pwd`, cambio progetto e riavvio. Includere un documento modificato e un progetto già esistente per verificare assenza di perdita o sovrascrittura.
3. **Sync:** aggiunta/modifica/rimozione di un file, progetto invariato, conflitto con modifica manuale e annullamento dell’anteprima. Verificare che il perimetro sia quello dichiarato anche cambiando vista.
4. **Diagrammi:** campioni riproducibili con tutti i sei tipi di relazione, nomi lunghi, collegamenti convergenti/paralleli/inversi, cicli e auto-relazioni; layout, selezione, menu contestuali, annullamento, undo/redo, salvataggio e riapertura.
5. **Interfaccia:** tema chiaro, scuro e contrasto elevato, finestra stretta e uso da tastiera; collaudo macOS e verifica VoiceOver distinta dai controlli automatici. Build, lint e controlli dei tipi limitati agli ambiti modificati, con smoke desktop per le integrazioni del workbench.

Il rapporto finale deve indicare revisione, piattaforma, scenario, risultato e limiti. Non dichiarare risolto il login sulla base dei soli test simulati e non dichiarare completata la riconciliazione M6 per aver reso visibile Sync Project.

## Riferimenti per l’implementazione

- AI e configurazione: `src/vs/workbench/contrib/ade/electron-browser/adeAiService.ts`, `src/vs/workbench/contrib/ade/electron-browser/adeCodeService.ts`, `src/vs/workbench/services/agentHost/browser/codexAccountService.ts`, `ade/ai/providers.ts` e `ade/ai/process.ts`.
- Progetto e workspace: `src/vs/workbench/contrib/ade/browser/adeProjectService.ts`, `src/vs/workbench/contrib/ade/browser/adeEditing.ts`, servizi nativi del workspace e del terminale.
- Canvas e menu: `src/vs/workbench/contrib/ade/browser/adeEditor.ts`, `src/vs/workbench/contrib/ade/browser/adeControls.ts`, `src/vs/workbench/contrib/ade/browser/media/ade.css`.
- Semantica, disposizione e routing: `src/vs/workbench/contrib/ade/common/semanticModel.ts`, `src/vs/workbench/contrib/ade/common/visualEditing.ts`, `src/vs/workbench/contrib/ade/common/diagramRouting.ts`.
- Test già presenti: controller AI in `src/vs/workbench/contrib/ade/test/electron-browser/adeAiService.test.ts`, suite browser A.D.E, test del modello e `ade/scripts/smoke-desktop.mjs`.

La [roadmap generale](roadmap.md) conserva le milestone di prodotto; questo piano prioritario raccoglie le correzioni emerse nell’utilizzo del percorso già disponibile. Per i confini attuali vedere [collaborazione AI](ai-collaboration.md), [importazione e Sync](code-import.md) ed [editing visuale](visual-editing.md).
