# Roadmap A.D.E

A.D.E punta a rendere il modello visuale l'ambiente quotidiano del software engineer: progettazione, esplorazione, implementazione assistita dall'IA e verifica del comportamento. La [visione](vision.md) definisce il prodotto; questa roadmap descrive come arrivarci in incrementi verificabili.

Le milestone indicano un ordine di sviluppo, non date di consegna. La verifica del 28 ottobre 2026 è registrata nel [verbale M0](m0-verification.md): Build, ripristino e smoke desktop sul MacBook sono stati confermati dall’utente; la CI della precedente integrazione M0 è documentata in [validazione M0](m0-validation.md); il merge M1 richiede una nuova esecuzione della CI. M1 dispone ora di contratto, API, migrazione ed esempi verificabili con Node; la sua integrazione iniziale è stata collaudata dall’utente sul MacBook. Le scelte tecnologiche riportate per le fasi successive sono proposte iniziali da validare.

Il 29 ottobre 2026 è stata implementata la prima shell M2.1: sidebar nativa sistema/feature/diagrammi, canvas in sola lettura, proprietà contestuali e ripristino per diagramma. Il [verbale M2.1](m2-1-verification.md) registra build e smoke nativo su Linux, distinguendoli dal collaudo macOS e dalla CI remota ancora da eseguire. Questa shell costituisce la base dell'editor M2.2.

La prosecuzione M2.2 aggiunge creazione del progetto e delle feature, diagrammi strutturali e di flusso modificabili, collegamenti condizionati, spostamento, salvataggio, undo/redo e recupero nativo. Il formato v3 conserva l'appartenenza dei diagrammi vuoti alle feature e mantiene l'apertura dei documenti storici. Il [verbale M2.2](m2-2-verification.md) registra le verifiche. M2.3 introduce revisione dei comandi, Fit Diagram, pan da tastiera e conservazione dello scorrimento; il [verbale M2.3](m2-3-verification.md) registra il collaudo Linux su finestra stretta e quattro temi. La chiusura M2 richiede ancora macOS, CI remota e revisione UX dell'utente.

M3.1 avvia l'[esplorazione semantica](semantic-explorer.md): ricerca filtrata di elementi e diagrammi, schede per gli elementi non collocati, breadcrumb, cambio di prospettiva a identità costante e cronologia di sessione. Il [verbale M3.1](m3-1-verification.md) distingue queste verifiche Linux dalle verifiche M2 ancora aperte sulle altre piattaforme. M3.2 aggiunge la mappa gerarchica del sistema, connessioni aggregate e routing ortogonale con etichette misurate; il [verbale M3.2](m3-2-verification.md) registra le verifiche e i limiti.

Il 30 ottobre 2026 la [branch M2 parallela](m2-branch-integration.md), commit `bbfc2087`, è stata confrontata e integrata selettivamente: gruppi della sidebar con persistenza per documento, riferimenti ai diagrammi condivisi, percorso di annullamento acquisto, etichette dei tipi, ritorno al modello da tastiera e compatibilità del profilo storico. Il [verbale macOS M2.1](m2-validation.md) conserva i risultati riportati per la branch sorgente; il collaudo della revisione integrata M2.2/M3 resta distinto.

M3.3 aggiunge l'editing dei contratti comportamentali dalle proprietà e dalle schede: input/output, precondizioni, postcondizioni, errori e associazioni degli errori alle relazioni, con validazione, undo/redo e persistenza condivisi. Il [verbale M3.3](m3-3-verification.md) registra build, test automatici e smoke grafico su Linux; macOS e CI remota rimangono da eseguire.

M3.4 introduce la prima sequenza coordinata: partecipanti condivisi, invocazioni/letture/scritture ordinate nella vista, auto-messaggi, condizioni ed errori dichiarati, con ordinamento e rimozione locale, lettura accessibile e persistenza nativa. Il [verbale M3.4](m3-4-verification.md) registra il collaudo Linux e il sottoinsieme supportato. Il prossimo incremento funzionale è M3.5, viste di stato e transizioni estese.

## Decisione di base: un prodotto desktop autonomo

A.D.E viene sviluppato modificando direttamente il fork Code OSS. Il workbench visuale, la navigazione del sistema e i servizi di coordinamento sono parti del prodotto. L’estensione in `ade/prototype/` resta un laboratorio di validazione delle interazioni; la sua esecuzione non certifica il funzionamento dell’applicazione desktop.

Il workbench definitivo viene riprogettato intorno a diagrammi e flussi: la barra sinistra parte dal sistema e dalle feature, con i diagrammi pertinenti sotto ciascun elemento; l'area centrale ospita canvas e viste coordinate, le proprietà seguono la selezione. Codice, file, terminale e debugger sono viste secondarie accessibili su richiesta. La home deve aprirsi direttamente nel prodotto, senza comandi di attivazione, installazione di plugin o Extension Development Host. La [decisione sul workbench visuale](decisions/0002-visual-workbench.md) precisa il risultato atteso e i confini della shell attuale.

Il primo percorso di prodotto è progettare un nuovo sistema dai diagrammi: creare progetto e feature, rappresentare struttura e flussi, salvare e riprendere il lavoro. Importazione della codebase e implementazione IA restano nelle milestone dedicate e non sono prerequisiti per questo percorso.

La [decisione su importazione, Sync e provider](decisions/0003-code-import-sync-and-providers.md), adottata il 29 ottobre 2026, prevede analisi del linguaggio affiancata dall'IA, importazione dell'intero perimetro supportato e aggiornamento incrementale su richiesta tramite **Sync**. L'utente sceglie provider e modello; il default sarà il modello più economico disponibile che superi il benchmark del prodotto. Collegamento a un piano personale, API e agente locale sono modalità distinte e vanno implementate secondo i percorsi ammessi dai provider. Queste capacità restano pianificate in M4–M6 e non interrompono il completamento di M2.

L’editor testuale, il terminale e gli strumenti tecnici restano disponibili per manutenzione e approfondimenti. L’esperienza ordinaria parte dal modello del sistema e permette di completare il percorso supportato senza aprire il sorgente. La [decisione architetturale](decisions/0001-code-oss-fork.md) e la [guida al fork](fork-development.md) definiscono la base adottata.

## Percorso e dipendenze

| Milestone | Risultato | Dipende da | Stato |
| --- | --- | --- | --- |
| M0 · Fondazione | Build riproducibile, shell A.D.E e manutenzione upstream | — | Build e smoke locali confermati; CI M0 Linux/macOS documentata, merge da ricollaudare |
| M1 · Modello semantico | Contratto condiviso del sistema | M0 | Dominio verificato; smoke desktop confermato dall’utente |
| M2 · Workbench visuale ed editor | IDE centrato su diagrammi e flussi, creazione e modifica senza JSON | M1 | Editor e collaudo M2.3 su Linux; macOS, CI e revisione utente aperti |
| M3 · Esploratore | Navigazione dal sistema alla singola feature | M1, M2 | M3.1–M3.4 implementati e verificati su Linux; stati estesi e impatto da sviluppare |
| M4 · Ponte con il codice | Importazione e tracciabilità | M1, M3 | Da sviluppare |
| M5 · Collaborazione IA | Prima feature implementata dal modello | M2, M4 | Da sviluppare |
| M6 · Riconciliazione | Modello e codice aggiornati in entrambe le direzioni | M4, M5 | Da sviluppare |
| M7 · Ambiente dinamico | Esecuzione e diagnostica nel modello | M3, M5, M6 | Da sviluppare |
| M8 · Beta utilizzabile | Progetto completo sul perimetro supportato | M2–M7 | Da sviluppare |
| M9 · Espansione | Altri adattatori, piattaforme e collaborazione | M8 | Da valutare |

Il primo traguardo end-to-end è completare una feature di acquisto: attore → interfaccia → controller → pagamento → ordine, inclusi errori e verifiche. Questo scenario accompagnerà tutte le milestone.

## M0 — Fondazione del fork Code OSS

**Disponibile:** sorgenti Code OSS nella radice, revisione upstream registrata, branding di sviluppo, prototipo separato e primo contributo nativo `ade.workbench.open`. La shell usa il servizio M1, legge documenti v1/v2, offre navigazione fra home, modello, proprietà e IA, e conserva file e selezione per workspace. Sono presenti CI leggera, workflow desktop macOS, smoke dell'Extension Host, inventario del fork e prova upstream con conflitti documentati. Vedi il [verbale](m0-verification.md) per distinguere implementazione e collaudo.

**Limiti:** layout fisso, nessuna modifica dal canvas, nessuna analisi della codebase o chiamata IA. La vista attuale non è un editor UML completo.

La shell attuale è una prima integrazione nativa aperta in un editor del workbench Code OSS. Il collaudo M0 ne verifica la fondazione tecnica; la trasformazione dell'intera esperienza dell'IDE, inclusi sidebar e percorso di avvio, è una consegna esplicita di M2. Il successo dello smoke non implica che questa riprogettazione sia già disponibile.

**Verifica di uscita:** selezionare Node da `.nvmrc`, ripristinare la toolchain nativa, installare le dipendenze, compilare e avviare il desktop A.D.E; controlli Node del prototipo superati; avvio manuale nell'Extension Development Host, apertura dell'esempio e aggiornamento del diagramma verificati. I controlli automatici sono già eseguibili; lo smoke nell’Extension Host è stato confermato dall’utente; le verifiche aggiuntive restano nel verbale.

### M0.1 — Toolchain e primo desktop funzionante

**Attività:**

- Selezionare la versione Node di `.nvmrc` e ripristinare una toolchain nativa compatibile sul Mac di sviluppo.
- Installare le dipendenze dello snapshot, compilare e avviare A.D.E con profilo di sviluppo isolato.
- Verificare apertura workspace, ripristino della finestra, comandi principali e caricamento del prototipo come estensione di sviluppo.
- Documentare prerequisiti e procedura a partire da un clone pulito; registrare piattaforma e revisione usate per il collaudo.
- Aggiungere una prima CI di compilazione per la piattaforma iniziale, separata dai test leggeri del prototipo.

**Consegna:** istruzioni riproducibili e primo avvio desktop verificato. La piattaforma iniziale proposta è macOS arm64, coerente con l’ambiente locale; altre piattaforme saranno validate separatamente.

**Criterio di completamento:** un clone pulito viene compilato e avviato seguendo la guida; lo smoke test del workbench passa. Un workflow che verifica soltanto `ade/prototype/` non soddisfa questo criterio.

**Verifica attuale:** installazione, build, avvio, ripristino e smoke desktop sul MacBook confermati dall’utente sul commit `d3ceb3d5`, dopo selezione del Node richiesto. Il blocco dell'ambiente Linux non si è riprodotto sul Mac. La CI M0 Linux/macOS è documentata nella [validazione M0](m0-validation.md); il merge M1 richiede una nuova esecuzione. I dettagli del MacBook restano da registrare.

### M0.2 — Shell e identità del prodotto A.D.E

**Dipende da:** M0.1. La progettazione dell’interfaccia può procedere durante la preparazione della toolchain; il collaudo richiede il desktop funzionante.

**Attività:**

- Definire home di progetto, area centrale del modello, esploratore semantico, proprietà e pannello della collaborazione IA.
- Integrare nel workbench un primo contributo A.D.E con comandi, apertura della vista e navigazione persistente.
- Impostare il percorso iniziale «Crea progetto / Apri progetto / Importa codebase», distinguendo le operazioni disponibili da quelle ancora da implementare.
- Completare il branding per lo sviluppo e isolare profili, impostazioni e dati rispetto ad altre installazioni dell’editor.
- Conservare l’accesso agli strumenti tecnici senza renderlo necessario per la navigazione ordinaria.
- Definire i confini fra contributi UI, servizi semantici, adattatori e coordinatore IA rispettando la struttura a livelli upstream.

**Consegna:** shell desktop A.D.E navigabile, inizialmente con una vista del modello dimostrativo. La shell non equivale ancora all’editor visuale di M2.

**Criterio di completamento:** aprendo un workspace dimostrativo si accede alla vista A.D.E, si cambia pannello e si ripristina il contesto dopo il riavvio. Le funzionalità future non simulano operazioni riuscite.

**Verifica attuale:** TypeScript e lint superati; navigazione, ripristino e smoke desktop confermati dall’utente. Le verifiche manuali aggiuntive non confermate singolarmente sono indicate nel [verbale M0](m0-verification.md).

### M0.3 — Gestione del fork e integrazione continua

**Attività:**

- Definire la strategia di aggiornamento dallo snapshot registrato in `ade/upstream.json`, con confronto delle revisioni e branch dedicati.
- Inventariare le modifiche A.D.E al core e mantenere separati, dove possibile, i contributi specifici dal codice upstream.
- Verificare un aggiornamento upstream su un branch di prova e documentare riconciliazione e ritorno alla versione precedente.
- Mantenere disattivati i workflow Microsoft non configurati per ADE; attivare soltanto controlli pertinenti e riproducibili.
- Inventariare servizi esterni, estensioni integrate e riferimenti di prodotto da configurare, sostituire o rimuovere prima della distribuzione.

**Consegna:** procedura di manutenzione del fork e CI iniziale del desktop. Firma e aggiornamenti agli utenti appartengono alla fase di distribuzione M8.

**Criterio di completamento:** la revisione di base e le personalizzazioni sono identificabili; un aggiornamento di prova supera build e smoke test, oppure presenta conflitti documentati senza compromettere il branch principale.

**Verifica attuale:** [inventario e procedura](fork-maintenance.md) disponibili; prova su branch isolato verso `a3ad284029f2b1c907c7c7e00039c228fe24511e` con otto conflitti nei workflow spostati. Nessuna modifica applicata alla base registrata. Il criterio relativo ai conflitti è verificato; gli esiti della CI M0 sono registrati nella [validazione M0](m0-validation.md); il risultato della nuova integrazione resta da verificare.

## M1 — Modello semantico e contratti

**Disponibile:** [contratto v2 e API documentati](semantic-model.md), [schema JSON](../schema/model-v2.schema.json), servizio puro in `src/vs/workbench/contrib/ade/common/semanticModel.ts`, esempio completo di acquisto, fixture invalide e migrazione conservativa del prototipo. I test Node coprono identità dopo rinomina/spostamento, indipendenza del layout, riferimenti, compatibilità delle relazioni, cicli, evidenze e migrazione senza sovrascrittura. Il workbench consuma lo stesso servizio; lo smoke desktop sul MacBook è stato confermato dall’utente.

**Obiettivo:** rappresentare il significato del sistema indipendentemente dalla posizione dei nodi e dal framework.

**Attività:**

- Definire elementi per feature, attori, componenti, risorse, viste, controller, contratti, azioni e stati.
- Definire relazioni tipizzate: invocazione, dipendenza, lettura/scrittura, transizione e realizzazione.
- Modellare input/output, condizioni, errori, autorizzazioni e criteri di accettazione.
- Separare semantica, layout delle viste e mappatura verso il codice.
- Introdurre identificatori stabili, schema versionato, validazione e migrazione dei file.
- Distinguere intento progettuale, implementazione osservata e comportamento verificato.

**Consegna:** schema documentato, API del modello, esempi validi e invalidi, migrazione dell'esempio attuale e confine del servizio semantico consumabile dal workbench. La logica di dominio deve poter essere verificata senza avviare Electron.

**Criterio di completamento:** un elemento mantiene identità e relazioni quando viene rinominato o spostato; riferimenti mancanti e relazioni incompatibili producono diagnostiche comprensibili.

## M2 — Workbench visuale nativo ed editor persistente

**Obiettivo:** usare A.D.E come IDE autonomo in cui si apre, esplora e modifica un progetto attraverso diagrammi e flussi. La riprogettazione riguarda il workbench completo: avvio, navigazione, aree di lavoro, comandi e strumenti contestuali.

La priorità è M2.1, prima di ampliare canvas e funzioni IA. L'infrastruttura Code OSS viene riutilizzata per file, editor, temi, accessibilità, cronologia e servizi tecnici; la gerarchia visuale e i percorsi ordinari appartengono al prodotto A.D.E.

### M2.1 — Architettura dell'esperienza e nuova shell

**Disponibile:** [specifica e wireframe](visual-workbench.md), sidebar nativa predefinita al posto dell'esploratore file, diagrammi raggruppati per contesto semantico, canvas con nodi selezionabili e relazioni, proprietà e condizioni contestuali, accesso agli strumenti tecnici e ritorno al modello, avvio diretto e ripristino di modello/diagramma/selezioni. L'esempio contiene due feature e tre diagrammi. Caricamenti concorrenti, migrazione del contesto M1, modello vuoto, errori e aggiornamenti esterni sono gestiti e verificati. La navigazione inferisce il contesto della feature dai nodi del contratto v2; i diagrammi condivisi rimangono sotto il sistema.

**Verifica:** build del client, controlli mirati e smoke Electron Linux superati; dettagli nel [verbale M2.1](m2-1-verification.md). Il percorso nativo è separato dallo smoke storico del prototipo e funziona anche con le estensioni integrate disabilitate. Restano revisione UX con l'utente, macOS, temi/contrasto e collaudo completo M2.3. Creazione, editing, salvataggio e cronologia del documento arrivano con M2.2; M2.1 resta in sola lettura.

**Attività:**

- Definire come percorso prioritario la creazione di un nuovo sistema: dalla home creare progetto e prima feature, aprire il relativo diagramma, progettare un flusso e salvarlo. Definire anche apertura e ripristino di un progetto esistente.
- Progettare e rivedere wireframe e stati interattivi prima di implementare il nuovo layout; includere primo avvio, progetto vuoto, caricamento, selezione, errore e ripristino.
- Sostituire la navigazione iniziale per file con una sidebar nativa organizzata per sistema e feature al primo livello, con i diagrammi pertinenti sotto ciascun elemento. Componenti e risorse sono raggiungibili nel contesto semantico del sistema; la gerarchia fisica dei file resta separata.
- Portare al centro il canvas del diagramma attivo; usare schede e titoli dei diagrammi, con passaggio fra viste che conserva contesto e selezione.
- Predisporre proprietà contestuali e strumenti per i flussi; collocare collaborazione IA e risultati delle verifiche come supporto al lavoro sul modello.
- Rendere sorgenti, terminale, debugger e strumenti Git viste secondarie su richiesta, con accesso contestuale dall'elemento quando esiste una mappatura. Preservare il ritorno al diagramma e la selezione senza introdurre una modalità tecnica separata. Un elemento ancora soltanto progettato non deve mostrare codice o mappature inventate.
- Integrare l'apertura della home o dell'ultimo diagramma nel ciclo di avvio e ripristino del workbench. Eliminare il bisogno di cercare `ade.workbench.open` per entrare nell'esperienza ordinaria.
- Adeguare menu, comandi, scorciatoie, focus e messaggi al lavoro sui diagrammi. Le operazioni non disponibili devono restare esplicite.
- Verificare la shell nativa con un profilo pulito senza caricare `ade/prototype/`; aggiungere un percorso di smoke dedicato al prodotto, distinto dal collaudo storico dell'estensione.

**Consegna:** specifica UI/UX condivisa e prima shell A.D.E con sidebar sistema → feature → diagrammi, area centrale visuale e proprietà contestuali. La creazione e l'editing completi arrivano con M2.2; M2.1 espone solo le operazioni già disponibili.

**Criterio di completamento:** avviare il desktop su un progetto dimostrativo con profilo pulito e vedere direttamente sistema, feature e relativi diagrammi nella sidebar e il canvas al centro; scegliere un diagramma di un'altra feature e riaprire il progetto conservando contesto. L'albero dei file non occupa la sidebar iniziale e il percorso funziona senza estensione di sviluppo. Aprire e richiudere una vista tecnica su richiesta mantiene il contesto del modello.

### M2.2 — Canvas, proprietà ed editing persistente

**Disponibile:** [creazione ed editing visuale](visual-editing.md), modello v3, progetto senza codebase, feature con struttura e flusso, palette, collegamenti compatibili e condizioni, rinomina, descrizioni, elementi condivisi, cancellazione con impatto esplicito, trascinamento e spostamento da tastiera, zoom/pan e layout a griglia. Le modifiche usano i servizi documentali di Code OSS per stato modificato, salvataggio, undo/redo, backup e conflitti. La demo integrata resta in sola lettura; i progetti creati e i modelli aperti da file sono modificabili secondo i permessi del file.

**Verifica:** test di dominio e servizio, schema indipendente, build client e percorso Electron Linux da progetto vuoto a struttura/flusso salvati e riaperti. Sono verificati anche protezione dalle sovrascritture concorrenti e recupero delle modifiche non salvate nel canvas. Il [verbale M2.2](m2-2-verification.md) delimita il collaudo; macOS e revisione completa dell'esperienza proseguono in M2.3. L'editor supporta un sottoinsieme dichiarato di proprietà e flussi, senza attribuire esecuzione alle condizioni.

**Attività:**

- Integrare un editor visuale nel workbench del fork con canvas, selezione, zoom, pan e spostamento dei nodi.
- Collegare il documento visuale al ciclo di vita degli editor e ai servizi di file, salvataggio e cronologia di Code OSS, riusando le infrastrutture esistenti.
- Collegare il canvas alla sidebar e alla shell M2.1, con creazione, rinomina, apertura e gestione dei diagrammi senza esporre i file JSON come interfaccia ordinaria.
- Implementare dalla home la creazione di un nuovo progetto e, dalla sidebar, di feature e relativi diagrammi, con nomi e identificatori stabili. Gestire progetto vuoto e primo diagramma.
- Realizzare una prima vista strutturale e una vista di flusso/attività con un sottoinsieme dichiarato di azioni, condizioni e percorsi alternativi. Entrambe fanno riferimento allo stesso modello M1; sequenze e stati completi si ampliano in M3.
- Aggiungere palette degli elementi, collegamenti e pannello delle proprietà.
- Integrare salvataggio, stato modificato, undo/redo e riapertura del documento.
- Offrire layout automatico di base e conservare le posizioni scelte dall'utente.
- Gestire documento non valido, aggiornamenti esterni e recupero dagli errori.
- Consentire operazioni principali da tastiera e rispettare tema e contrasto dell'editor.

**Consegna:** creazione di progetto e feature, editor strutturale e primo editor di flusso/attività, con operazioni di creazione, modifica e cancellazione coerenti.

**Criterio di completamento:** dalla home creare un progetto vuoto, aggiungere la feature «Conferma acquisto» e progettarne struttura e flusso, inclusi pagamento riuscito e rifiutato, senza una codebase iniziale. Annullare e ripetere una modifica, salvare e riaprire senza perdere proprietà o relazioni. La cancellazione di un elemento deve gestire esplicitamente i riferimenti coinvolti. I flussi esprimono intento progettuale: non vengono presentati come codice già eseguito o verificato.

### M2.3 — Collaudo del percorso visuale completo

**Attività:** verificare su desktop onboarding, scelta del diagramma, editing, passaggio fra viste, accesso contestuale agli strumenti tecnici e ripristino; controllare tastiera, contrasto, finestre strette ed errori di persistenza. Registrare capacità disponibili e rimandare esplicitamente importazione, generazione IA e diagnostica di esecuzione alle rispettive milestone.

**Disponibile:** comandi secondari in sezioni espandibili, Fit Diagram, canvas raggiungibile da tastiera con pan, focus e scorrimento conservati durante gli aggiornamenti, contesto di scorrimento distinto per documento e diagramma, salvataggio di una copia con conservazione del contesto. Collaudo Linux su finestra 800 × 800 e temi Light Modern, Dark Modern, Dark High Contrast e Light High Contrast; verifica dei colori effettivi del nodo selezionato e del focus, esecuzione di un comando nel terminale con ritorno alla stessa selezione. Percorsi nativo e UX configurati separatamente nella CI desktop.

**Verifica:** il [verbale M2.3](m2-3-verification.md) distingue risultati Linux, controlli di accessibilità circoscritti e limiti del routing. Restano esecuzione macOS corrente, VoiceOver, CI sulla revisione integrata e revisione UX dell'utente. M2 non è dichiarata chiusa sulla base del solo collaudo Linux.

**Prosecuzione accessibilità:** lettura testuale del diagramma e aiuto contestuale integrati in Accessible View nativa, raggiungibili da canvas e sidebar, con aggiornamenti dal documento, ripristino del focus e suggerimenti configurabili tramite `accessibility.verbosity.ade`. L'[accessibilità del workbench](accessibility.md) descrive contenuti, comandi e confini del collaudo; l'integrazione non sostituisce la verifica con VoiceOver.

**Criterio di completamento M2:** completare il percorso da nuovo progetto a feature, struttura e flusso salvati senza aprire sorgenti o modificare JSON. L'app si avvia come IDE A.D.E e mantiene sistema, feature, diagramma e selezione come contesto principale anche dopo una consultazione tecnica.

## M3 — Esplorazione del sistema e viste coordinate

**Obiettivo:** approfondire qualsiasi feature, risorsa, vista e controller restando nel contesto visuale.

**Attività:**

- Aggiungere mappa del sistema, ricerca, filtri, breadcrumb e cronologia di navigazione.
- Ampliare la sidebar sistema → feature → diagrammi di M2 con navigazione fra componenti, risorse e contratti: cambiare prospettiva deve mantenere l'identità semantica e orientare l'utente nel sistema.
- Collegare schede di dettaglio a responsabilità, contratti, dipendenze, dati ed errori.
- Ampliare le prime viste strutturali e di flusso M2 e introdurre progressivamente sequenze e stati sullo stesso modello, dichiarando i costrutti supportati.
- Mostrare percorsi fra attore, interfaccia, logica applicativa e risorse.
- Visualizzare impatto di una modifica e distinguere elementi progettati, implementati e verificati.

**Consegna:** esploratore semantico e prime viste coordinate, con copertura dichiarata dei costrutti UML supportati.

**Criterio di completamento:** partendo da «Conferma acquisto», raggiungere pagamento, ordine, errori e relativi contratti senza aprire il codice. Una modifica a un elemento condiviso deve riflettersi in tutte le viste interessate.

### M3.1 — Ricerca, dettaglio e continuità della navigazione

**Disponibile:** ricerca nativa con filtro per tipo semantico o diagrammi; destinazioni per tutti gli elementi, anche non collocati; schede con proprietà, relazioni, figli e diagrammi della feature; breadcrumb semantici; cambio di diagramma mantenendo la selezione; Back/Forward limitati a 100 posizioni della sessione. Schede e selezione corrente sono ripristinate dopo il riavvio; la cronologia viene azzerata fra documenti e sessioni.

**Verifica:** test di dominio e servizio, percorsi Electron e lettura accessibile nel [verbale M3.1](m3-1-verification.md). Il watcher correlato del modello copre anche file esterni al workspace e protegge documenti modificati. Non sono state aggiunte proprietà allo schema semantico per conservare la navigazione.

### M3.2 — Mappa del sistema e relazioni leggibili

**Disponibile:** System Map ricavata dalla gerarchia, con tutte le identità e raggruppamenti diretti delle relazioni; accesso a dettagli, diagrammi e sorgente/destinazione. Breadcrumb del sistema, cronologia, ripristino e lettura accessibile includono la mappa senza modificare lo schema. Routing ortogonale attorno ai nodi, auto-collegamenti e porte differenziate per relazioni parallele; etichette misurate e collocate evitando nodi ed etichette, con linea guida quando manca spazio.

**Verifica e limiti:** [verbale M3.2](m3-2-verification.md). Il routing non elimina tutti gli incroci fra connessioni; i layout completamente sovrapposti sono segnalati. macOS/VoiceOver, CI della revisione integrata e prestazioni su grandi modelli rimangono aperti.

### M3.3 — Editing dei contratti comportamentali

**Disponibile:** aggiunta, modifica e rimozione di input/output con tipo e obbligatorietà, precondizioni, postcondizioni ed errori tramite scelte native. Schede e diagrammi modificano la stessa identità; Escape annulla la voce corrente, ogni modifica completata partecipa a undo/redo e salvataggio nativi. Le relazioni possono riferire un errore della sorgente; rinomina e rimozione degli errori referenziati sono protette. Autorizzazioni e criteri esistenti vengono conservati e restano in sola lettura.

**Verifica e limiti:** [verbale M3.3](m3-3-verification.md). Build client, test automatici e smoke grafico esteso verificati su Linux. macOS/VoiceOver e CI remota restano aperti. Tipi e condizioni sono dichiarazioni testuali, senza inferenza di esecuzione o sincronizzazione con il codice.

### M3.4 — Prima sequenza coordinata

**Disponibile:** creazione di diagrammi di sequenza per feature, aggiunta di partecipanti e riuso delle interazioni esistenti con inclusione degli endpoint. Invocazioni, letture, scritture e auto-messaggi mostrano ordine locale, condizioni ed errori condivisi. Partecipanti e messaggi si ordinano dalle proprietà; rimuoverli dalla sola sequenza conserva sistema e altre viste. Contratti, lettore accessibile, undo/redo, salvataggio e ripristino riusano il documento nativo. Nessun nuovo campo nello schema.

**Verifica e limiti:** [verbale M3.4](m3-4-verification.md). Una sola occorrenza per relazione e una linea di vita per identità semantica. Il sottoinsieme non introduce frammenti UML, risposte, attivazioni, istanze runtime o tracce di esecuzione. Le relazioni storiche non supportate sono segnalate e conservate. macOS/VoiceOver e CI remota restano aperti.

**Prossimo incremento M3.5:** ampliare viste di stato e transizioni sulle risorse esistenti, con identità e contratti condivisi. L'analisi dell'impatto rimane in un incremento M3 successivo.

## M4 — Adattatore iniziale e tracciabilità del codice

**Obiettivo:** collegare il modello a una codebase reale prima di delegare modifiche all'IA.

**Attività:**

- Scegliere un primo perimetro TypeScript e un solo stack dimostrativo; documentarne le capacità.
- Analizzare la struttura sintattica del codice per ricavare simboli, dipendenze e contratti supportati.
- Mantenere mappature fra identificatori semantici e simboli/file, comprese rinomine e spostamenti.
- Importare una codebase di esempio e segnalare esplicitamente costrutti non rappresentabili.
- Rilevare cambiamenti esterni e calcolare un impatto preliminare senza riscrivere i file.
- Affiancare all'analisi deterministica un connettore IA inizialmente in sola lettura per responsabilità e raggruppamento delle feature; validare output strutturati e associare ogni risultato a simboli e revisioni sorgenti. Questo anticipa la parte dei provider necessaria all'importazione, senza generazione di codice.
- Percorrere tutto il sorgente pertinente dello stack dichiarato e costruire un indice e viste gerarchiche, rendendo esplicita la copertura dei costrutti. Distinguere fatti estratti, interpretazioni incerte e comportamento runtime non osservato.
- Introdurre il primo **Sync** su richiesta: hash/revisioni, rianalisi dei simboli modificati e delle dipendenze interessate, cache e riepilogo degli aggiornamenti. La riconciliazione completa delle modifiche concorrenti appartiene a M6.
- Confrontare modelli economici e più capaci su almeno tre repository campione; misurare accuratezza delle relazioni, copertura, tracciabilità, latenza e consumo. Adottare il modello economico predefinito soltanto dopo averne verificato le soglie.

**Consegna:** primo adattatore di analisi, codebase dimostrativa e mappa modello/codice ispezionabile.

**Criterio di completamento:** importare il progetto campione, navigarne gli elementi e sincronizzare una modifica manuale a un contratto, una rinomina e una cancellazione senza ricostruire inutilmente le parti invariate. Le relazioni devono avere evidenze ispezionabili; elementi non supportati e interpretazioni incerte restano riconoscibili. Pubblicare risultati del benchmark prima di dichiarare sufficiente un modello economico per il perimetro supportato.

## M5 — Collaborazione con l'IA e prima implementazione

**Obiettivo:** trasformare un intento visuale in una modifica funzionante e verificabile.

**Attività:**

- Definire un'interfaccia per i provider IA e una configurazione delle credenziali fuori dai file versionati.
- Estendere il connettore in sola lettura di M4 a esecuzione assistita, con selezione del modello, capacità e limiti per account. Distinguere API, collegamento al piano personale e agente locale: OpenAI/Codex e Claude non condividono automaticamente la stessa modalità di login.
- Impostare come default il modello più economico disponibile che superi le verifiche; configurare eventuale modello più capace e budget di passaggio. Rispettare quote e preferenze salvate e mostrare costi effettivi soltanto quando disponibili.
- Fornire all'agente modello, contesto della feature, vincoli e porzioni pertinenti della codebase.
- Presentare piano, domande sulle ambiguità e impatto sul sistema prima dell'esecuzione.
- Applicare le modifiche in un ambiente recuperabile, con controlli sulle operazioni eseguibili.
- Generare o aggiornare test legati ai criteri di accettazione ed eseguirli.
- Mostrare esito, differenze funzionali, costi disponibili e possibilità di annullare l'operazione.
- Dichiarare quali dati vengono inviati al provider e gestire timeout, cancellazione e fallimenti parziali.

**Consegna:** percorso assistito dal modello alla prima feature implementata sullo stack scelto.

**Criterio di completamento:** aggiungere visualmente il percorso «pagamento rifiutato», ottenere implementazione e test, eseguire le verifiche e poter ripristinare lo stato precedente. Un test fallito non deve essere presentato come completamento riuscito.

## M6 — Sincronizzazione bidirezionale e conflitti

**Obiettivo:** mantenere coerenti modello e codebase quando una modifica nasce da uno dei due lati.

**Attività:**

- Introdurre revisioni comuni, origine delle modifiche e registro delle operazioni.
- Estendere il comando **Sync** di M4 alla riconciliazione bidirezionale: elaborare differenze e dipendenze coinvolte, conservando identificatori, layout e annotazioni manuali.
- Rendere annullabili le sincronizzazioni e rifiutare risultati basati su revisioni superate; aggiornare il riferimento comune soltanto dopo un'applicazione riuscita e coerente.
- Confrontare versione comune, modello corrente e codice corrente per riconciliare cambiamenti concorrenti.
- Gestire entrambe le direzioni: modello → implementazione e codice → modello/viste.
- Distinguere trasformazioni deterministiche da interpretazioni IA che richiedono chiarimenti.
- Prevenire cicli di aggiornamento e riscritture dovute al solo layout o alla formattazione.
- Conservare codice personalizzato e gestire conflitti, cancellazioni e rinomine senza perdita silenziosa.
- Esporre stati: allineato, in attesa, in riconciliazione, in conflitto, verifica fallita.

**Consegna:** motore di riconciliazione sul perimetro dell'adattatore iniziale e interfaccia visuale di risoluzione dei conflitti.

**Criterio di completamento:** superare scenari di modifica dal diagramma, modifica dal codice, modifica concorrente dello stesso contratto, rinomina, cancellazione e interruzione a metà operazione. Ogni scenario deve terminare in uno stato coerente o in un conflitto esplicito e recuperabile.

La sincronizzazione universale di qualsiasi linguaggio e framework non è un criterio di questa milestone: la copertura deve essere dichiarata e verificata per ogni adattatore.

## M7 — Esecuzione, test e diagnostica visuale

**Obiettivo:** comprendere il comportamento effettivo del software attraverso il modello.

**Attività:**

- Avviare e fermare l'applicazione dimostrativa dall'ambiente.
- Collegare test, log, errori e tracce agli identificatori delle feature coinvolte.
- Distinguere flusso previsto e percorso osservato in una specifica esecuzione.
- Visualizzare guasti nelle interazioni e dipendenze coinvolte.
- Filtrare informazioni sensibili e controllare raccolta e conservazione delle tracce.

**Consegna:** pannello di esecuzione e diagnostica collegato alle viste della feature.

**Criterio di completamento:** simulare un errore di pagamento, individuare il passaggio fallito nel modello, chiedere una correzione e verificarne il risultato senza leggere il codice. L'assenza di tracce non deve essere interpretata come prova di correttezza.

## M8 — Beta end-to-end

**Obiettivo:** rendere utilizzabile il percorso completo da un nuovo progetto alla verifica di una feature.

**Attività:**

- Integrare onboarding, creazione/importazione del progetto e configurazione dell'adattatore/IA.
- Collaudare il prodotto installato senza VS Code preinstallato e senza installare un'estensione A.D.E; avvio, sidebar e layout iniziale devono corrispondere al workbench visuale nativo.
- Verificare persistenza, migrazioni, recupero, accessibilità e prestazioni su progetti campione di dimensioni crescenti.
- Completare test di integrazione del workbench, dei servizi A.D.E e degli eventuali componenti nell’Extension Host, oltre agli scenari end-to-end del desktop.
- Documentare capacità supportate, limiti e gestione dei problemi.
- Completare icone, identificatori applicativi, licenze, avvisi di terze parti e configurazione dei servizi esterni.
- Produrre un pacchetto installabile per la piattaforma iniziale, con firma e notarizzazione dove richieste dal canale scelto.
- Definire aggiornamenti, ripristino della versione precedente e compatibilità dei documenti e dei profili fra versioni.
- Raccogliere feedback di utilizzo sul flusso visuale e correggere i punti che richiedono accesso al sorgente.

**Consegna:** applicazione desktop A.D.E beta installabile, progetto dimostrativo e guida al percorso completo.

**Criterio di completamento:** un utente può installare e avviare A.D.E su una macchina di prova, creare o importare il progetto supportato, esplorare una feature, cambiarne il flusso con l'IA, verificare l'esecuzione e riconciliare una successiva modifica esterna. Nessuna perdita di dati negli scenari di recupero previsti.

## M9 — Altri stack, piattaforme e collaborazione

**Obiettivo:** ampliare A.D.E senza compromettere coerenza e affidabilità.

**Attività:**

- Formalizzare l'SDK degli adattatori e i test di compatibilità per analisi, generazione e riconciliazione.
- Aggiungere un secondo stack per verificare quali concetti del modello sono realmente indipendenti dalla tecnologia.
- Estendere le viste UML e la modellazione di interfacce, dati, eventi e distribuzione secondo necessità concrete.
- Valutare collaborazione multiutente e riconciliazione delle modifiche condivise.
- Ampliare la distribuzione Code OSS già adottata: ulteriori piattaforme, canali di aggiornamento ed ecosistema delle estensioni.

**Criterio di completamento:** ogni nuovo stack supera gli stessi scenari di coerenza e recupero del primo, con limiti documentati. La distribuzione dedicata è già la direzione adottata; l’espansione delle piattaforme dipende dai risultati della beta.

## Verifiche trasversali

Ogni milestone deve aggiornare documentazione ed esempi e includere verifiche proporzionate al comportamento introdotto. In particolare:

- Identità e semantica: riferimenti stabili e nessuna divergenza silenziosa fra viste.
- Persistenza: operazioni ripristinabili e compatibilità dei documenti versionati.
- IA: contesto esplicito, credenziali protette, cancellazione e fallimenti comprensibili.
- Riconciliazione: conservazione delle modifiche manuali e stato di allineamento attendibile.
- Esperienza: operazioni comprensibili dal modello, senza imporre la lettura del sorgente.
- Desktop: build e smoke test pertinenti alle modifiche del workbench; i test del prototipo non sostituiscono quelli del prodotto.
- Manutenzione: revisione upstream tracciata, personalizzazioni identificabili e aggiornamenti del fork verificabili.

## Decisioni da prendere e prossimo incremento

Prima di M4/M5 vanno scelti stack dimostrativo, provider IA e politiche di esecuzione e invio dei dati. Prima della beta vanno definiti licenza, distribuzione e obiettivi misurabili di prestazione. Le decisioni architetturali saranno registrate con motivazione e conseguenze.

## Ordine operativo dei prossimi incrementi

1. **M0.1:** ripristinare toolchain e versione Node, compilare e collaudare il desktop. Risultato: A.D.E avviabile da sorgente.
2. **M0.2:** introdurre home e primo contributo nativo A.D.E nel workbench. Risultato: il modello dimostrativo è raggiungibile nell’applicazione dedicata.
3. **M0.3:** rendere verificabili build e aggiornamenti upstream. Risultato: una base mantenibile prima di ampliare le modifiche al core.
4. **M1:** definire il modello semantico del checkout e i suoi contratti. Risultato: dati condivisi fra editor, esploratore e futuri agenti.
5. **M2.1:** introdurre sidebar semantica, canvas e proprietà nella shell nativa. Prima implementazione e smoke Linux disponibili; completare revisione UX e collaudo macOS.
6. **M2.2:** creare progetto, feature e diagrammi; collegare, modificare e salvare gli elementi dal canvas con undo/redo. Percorso implementato e verificato su Linux, con i limiti dichiarati nel verbale.
7. **M2.3:** collaudo Linux, tastiera, quattro temi e finestra stretta eseguiti; completare macOS/VoiceOver, revisione UX dell'utente e nuova CI prima della chiusura M2.
8. **M3.1:** ricerca, schede, breadcrumb, cronologia e cambio di prospettiva implementati e verificati su Linux; mantenere aperte le verifiche di piattaforma.
9. **M3.2:** mappa complessiva, routing ortogonale ed etichette implementati; verifiche e limiti nel verbale.
10. **M3.3:** editing dei contratti comportamentali e coerenza fra dettagli e viste implementati e verificati su Linux; completare verifiche di piattaforma e CI remota.
11. **M3.4:** prima sequenza coordinata con struttura, flusso e contratti implementata e verificata su Linux; completare verifiche di piattaforma e CI remota.
12. **M3.5:** ampliare viste di stato e transizioni sulle risorse esistenti.

Il percorso dimostrativo supportato su Linux parte da un progetto vuoto, consente di disegnare struttura e flusso, salvarli, riprenderli ed esplorarne le identità semantiche. L’implementazione assistita dall’IA e la sincronizzazione con il codice saranno aggiunte nelle milestone successive, con i rispettivi criteri di verifica.
