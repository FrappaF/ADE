# Roadmap A.D.E

Il [piano di attuazione Diagram-Driven AI](diagram-driven-ai-implementation-plan.md) definisce i requisiti R01–R16 e gli step S00–S15. La nuova fase **M6.DAI**, collocata fra M6 e M7, li organizza in dodici sprint con dipendenze, consegne e criteri di completamento. Tutti gli sprint sono da sviluppare; la pianificazione non certifica capacità già disponibili.

La [revisione UX del 6 novembre](ux-ai-workflow.md) semplifica il primo avvio, riusa la chat Codex e rende esplicito il ritorno ai diagrammi, distinguendo revisione, esecuzione e ripresa.

Il seguito M6 introduce [importazione semantica in due passi, chat Codex e UI centrata sui diagrammi](diagram-workflow.md): classificazione IA di tutti i simboli, contesto compatto multilinguaggio, generazione riprendibile, scelta separata del modello per i diagrammi e azioni dirette per aggiornare codice e viste.

La generazione M6 comprende ora un piano proposto dall’IA e revisionato prima delle viste: ogni diagramma approvato è uno step riprendibile, con pubblicazione dell’intero insieme validato. Su richiesta dell’utente viene anticipata la parte di M9 relativa alle notazioni: ai quattro tipi originali si aggiungono C4 context/container/component, ERD, schema DB, deployment, classi, use case, componenti UML, package, DFD e rete. Il [catalogo](diagram-catalog.md) distingue contenuto, uso e limiti. La [specifica del protocollo](semantic-generation-protocol.md) e il [verbale delle prove](validation/planned-generation-2026-11-06.json) descrivono contesto, richieste e verifiche.

A.D.E punta a rendere il modello visuale l'ambiente quotidiano del software engineer: progettazione, esplorazione, implementazione assistita dall'IA e verifica del comportamento. La [visione](vision.md) definisce il prodotto; questa roadmap descrive come arrivarci in incrementi verificabili.

Il feedback dei test manuali del 5 novembre 2026 è sviluppato nella [roadmap delle correzioni](manual-test-roadmap.md), sulla branch `fix/manual-test-followup`. L’incremento implementa riconoscimento dell’account CLI e feedback AI, coerenza fra progetto/Files/terminale e Sync globale, leggibilità ed editing contestuale dei diagrammi. Il [verbale](manual-test-verification.md) registra risultati e limiti delle verifiche senza estendere la copertura delle milestone successive.

Le milestone indicano un ordine di sviluppo, non date di consegna. La verifica del 28 ottobre 2026 è registrata nel [verbale M0](m0-verification.md): Build, ripristino e smoke desktop sul MacBook sono stati confermati dall’utente; la CI della precedente integrazione M0 è documentata in [validazione M0](m0-validation.md); il merge M1 richiede una nuova esecuzione della CI. M1 dispone ora di contratto, API, migrazione ed esempi verificabili con Node; la sua integrazione iniziale è stata collaudata dall’utente sul MacBook. Le scelte tecnologiche riportate per le fasi successive sono proposte iniziali da validare.

Il 29 ottobre 2026 è stata implementata la prima shell M2.1: sidebar nativa sistema/feature/diagrammi, canvas in sola lettura, proprietà contestuali e ripristino per diagramma. Il [verbale M2.1](m2-1-verification.md) registra build e smoke nativo su Linux, distinguendoli dal collaudo macOS e dalla CI remota ancora da eseguire. Questa shell costituisce la base dell'editor M2.2.

La prosecuzione M2.2 aggiunge creazione del progetto e delle feature, diagrammi strutturali e di flusso modificabili, collegamenti condizionati, spostamento, salvataggio, undo/redo e recupero nativo. Il formato v3 conserva l'appartenenza dei diagrammi vuoti alle feature e mantiene l'apertura dei documenti storici. Il [verbale M2.2](m2-2-verification.md) registra le verifiche. M2.3 introduce revisione dei comandi, Fit Diagram, pan da tastiera e conservazione dello scorrimento; il [verbale M2.3](m2-3-verification.md) registra il collaudo Linux su finestra stretta e quattro temi. La chiusura M2 richiede ancora macOS, CI remota e revisione UX dell'utente.

M3.1 avvia l'[esplorazione semantica](semantic-explorer.md): ricerca filtrata di elementi e diagrammi, schede per gli elementi non collocati, breadcrumb, cambio di prospettiva a identità costante e cronologia di sessione. Il [verbale M3.1](m3-1-verification.md) distingue queste verifiche Linux dalle verifiche M2 ancora aperte sulle altre piattaforme. M3.2 aggiunge la mappa gerarchica del sistema, connessioni aggregate e routing ortogonale con etichette misurate; il [verbale M3.2](m3-2-verification.md) registra le verifiche e i limiti.

Il 30 ottobre 2026 la [branch M2 parallela](m2-branch-integration.md), commit `bbfc2087`, è stata confrontata e integrata selettivamente: gruppi della sidebar con persistenza per documento, riferimenti ai diagrammi condivisi, percorso di annullamento acquisto, etichette dei tipi, ritorno al modello da tastiera e compatibilità del profilo storico. Il [verbale macOS M2.1](m2-validation.md) conserva i risultati riportati per la branch sorgente; il collaudo della revisione integrata M2.2/M3 resta distinto.

M3.3 aggiunge l'editing dei contratti comportamentali dalle proprietà e dalle schede: input/output, precondizioni, postcondizioni, errori e associazioni degli errori alle relazioni, con validazione, undo/redo e persistenza condivisi. Il [verbale M3.3](m3-3-verification.md) registra build, test automatici e smoke grafico su Linux; macOS e CI remota rimangono da eseguire.

M3.4 introduce la prima sequenza coordinata: partecipanti condivisi, invocazioni/letture/scritture ordinate nella vista, auto-messaggi, condizioni ed errori dichiarati, con ordinamento e rimozione locale, lettura accessibile e persistenza nativa. Il [verbale M3.4](m3-4-verification.md) registra il collaudo Linux e il sottoinsieme supportato.

M3.5 aggiunge viste di stato per le risorse, riuso dei cicli di vita, creazione di stati e transizioni, eventi/guardie/errori condivisi, tabella delle transizioni e rimozione locale con cronologia nativa. Il [verbale M3.5](m3-5-verification.md) registra verifiche automatiche e smoke Linux, mantenendo aperti macOS/VoiceOver e CI remota.

M3.6 completa il percorso funzionale dichiarato di M3 con analisi dell'impatto nel modello, motivi dei riferimenti, viste da rivedere e ispezione delle evidenze registrate senza dedurre implementazione corrente o freschezza. Il [verbale M3.6](m3-6-verification.md) distingue le verifiche Linux dalla chiusura di piattaforma e CI ancora aperta. Il successivo sviluppo funzionale passa a M4, ponte con il codice, mantenendo i confini di collaudo M2/M3 espliciti.

## Decisione di base: un prodotto desktop autonomo

A.D.E viene sviluppato modificando direttamente il fork Code OSS. Il workbench visuale, la navigazione del sistema e i servizi di coordinamento sono parti del prodotto. L’estensione in `ade/prototype/` resta un laboratorio di validazione delle interazioni; la sua esecuzione non certifica il funzionamento dell’applicazione desktop.

Il workbench definitivo viene riprogettato intorno a diagrammi e flussi: la barra sinistra parte dal sistema e dalle feature, con i diagrammi pertinenti sotto ciascun elemento; l'area centrale ospita canvas e viste coordinate, le proprietà seguono la selezione. Codice, file, terminale e debugger sono viste secondarie accessibili su richiesta. La home deve aprirsi direttamente nel prodotto, senza comandi di attivazione, installazione di plugin o Extension Development Host. La [decisione sul workbench visuale](decisions/0002-visual-workbench.md) precisa il risultato atteso e i confini della shell attuale.

Il primo percorso di prodotto è progettare un nuovo sistema dai diagrammi: creare progetto e feature, rappresentare struttura e flussi, salvare e riprendere il lavoro. Importazione della codebase e implementazione IA restano nelle milestone dedicate e non sono prerequisiti per questo percorso.

La [decisione su importazione, Sync e provider](decisions/0003-code-import-sync-and-providers.md), aggiornata il 30 ottobre 2026, assegna a M4 analisi deterministica multilinguaggio, importazione del perimetro supportato e aggiornamento incrementale su richiesta tramite **Sync**. L'IA viene integrata in M5 per interpretazioni non risolte dagli strumenti del linguaggio e implementazione assistita. L'utente sceglierà provider e modello; il default sarà il modello più economico disponibile che superi il benchmark del prodotto. Collegamento a un piano personale, API e agente locale sono modalità distinte e vanno implementate secondo i percorsi ammessi dai provider.

L’editor testuale, il terminale e gli strumenti tecnici restano disponibili per manutenzione e approfondimenti. L’esperienza ordinaria parte dal modello del sistema e permette di completare il percorso supportato senza aprire il sorgente. La [decisione architetturale](decisions/0001-code-oss-fork.md) e la [guida al fork](fork-development.md) definiscono la base adottata.

## Percorso e dipendenze

| Milestone | Risultato | Dipende da | Stato |
| --- | --- | --- | --- |
| M0 · Fondazione | Build riproducibile, shell A.D.E e manutenzione upstream | — | Build e smoke locali confermati; CI M0 Linux/macOS documentata, merge da ricollaudare |
| M1 · Modello semantico | Contratto condiviso del sistema | M0 | Dominio verificato; smoke desktop confermato dall’utente |
| M2 · Workbench visuale ed editor | IDE centrato su diagrammi e flussi, creazione e modifica senza JSON | M1 | Editor e collaudo M2.3 su Linux; macOS, CI e revisione utente aperti |
| M3 · Esploratore | Navigazione dal sistema alla singola feature | M1, M2 | M3.1–M3.6 implementati e verificati su Linux; macOS/VoiceOver, CI e revisione UX restano aperti |
| M4 · Ponte con il codice | Importazione e tracciabilità | M1, M3 | Completato funzionalmente sul perimetro dichiarato: 16 profili, import/Sync nativi, rinomine, evidenze e recupero; verifica Linux e benchmark nel verbale M4 |
| M5 · Collaborazione IA | Prima feature implementata dal modello | M2, M4 | Criterio funzionale Node/Linux verificato con Codex e account reali: UI, test, riavvio e undo; benchmark su tre campioni (Sol 3/3, Luna 2/3). CI Linux/macOS richiesta per il merge; esiti nella PR #7 |
| M6 · Riconciliazione | Modello e codice aggiornati in entrambe le direzioni | M4, M5 | Motore IA indipendente dal linguaggio, Sync nativo, revisioni comuni, conflitti, undo/recupero e benchmark disponibili; test su 16 profili e SQL. Smoke Electron Linux passato; benchmark live bloccato da autenticazione, macOS e CI aperti |
| M6.DAI · Diagram-Driven AI | Specifica eseguibile, contesto IA sufficiente, forward/reverse e percorso visuale su due archetipi | M1–M6 | Pianificato in dodici sprint; requisiti R01–R16 e step S00–S15 da completare |
| M7 · Ambiente dinamico | Esecuzione e diagnostica nel modello | M3, M5, M6, M6.DAI | Da sviluppare |
| M8 · Beta utilizzabile | Progetto completo sul perimetro supportato | M2–M7, inclusa M6.DAI | Da sviluppare |
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

### M3.5 — Stati e transizioni delle risorse

**Disponibile:** creazione di un diagramma di stato per una risorsa esistente o nuova, aggiunta/riuso di stati e transizioni, importazione del ciclo di vita dichiarato e auto-transizioni. Eventi, condizioni, errori e contratti restano condivisi; il riepilogo per risorsa e la tabella delle transizioni affiancano canvas e lettore accessibile. Le rimozioni dalla sola vista conservano semantica e altri diagrammi. Undo/redo, layout, salvataggio e riavvio usano il servizio documentale nativo. Il formato resta v3.

**Verifica e limiti:** [verbale M3.5](m3-5-verification.md). Stati semplici di risorse effettive e transizioni dichiarate, senza deduzione di stato iniziale/finale, stati compositi, regioni parallele o esecuzione. Contesto e stati storici senza risorsa vengono conservati e segnalati. macOS/VoiceOver, tastiera fisica e CI remota restano aperti.

### M3.6 — Impatto sul modello ed evidenze registrate

**Disponibile:** report dell'elemento e dei discendenti, riferimenti inversi e autorizzazioni con motivo e distanza minima, contesto dei proprietari separato e diagrammi/relazioni da rivedere. La vista non modifica il documento, partecipa a cronologia e ripristino e si ricalcola sulle modifiche correnti. Le evidenze distinguono dichiarazione progettuale, mappature registrate e tutti gli esiti/revisioni disponibili, compresi criteri senza record ed esiti diversi. Il formato resta v3.

**Verifica e limiti:** [verbale M3.6](m3-6-verification.md) e [percorso sugli esempi](../examples/impact-review.md). L'impatto segue il grafo dichiarato senza valutare condizioni o predire cambiamenti del codice. Le relazioni non classificate vengono segnalate e non propagate. Le evidenze non certificano implementazione corrente, copertura, freschezza o risultato più recente; nessun test viene eseguito dal report.

**Stato M3:** il percorso funzionale M3.1–M3.6 e il sottoinsieme delle viste sono disponibili su Linux, con limiti nella [guida dell'esploratore](semantic-explorer.md). Rimangono macOS/VoiceOver, tastiera fisica, CI remota, revisione UX e misure su grandi modelli; questo stato non chiude quelle verifiche né quelle M2 precedenti. Il prossimo incremento funzionale è M4: adattatore iniziale e tracciabilità del codice. La riconciliazione rimane in M6.

## M4 — Adattatore iniziale e tracciabilità del codice

**Obiettivo:** collegare il modello a una codebase reale prima di delegare modifiche all'IA.

**M4.1 disponibile:** [importatore deterministico multilinguaggio](code-import.md) eseguibile con Node, indice delle dichiarazioni e degli import non risolti, hash e posizioni sorgenti, modello v3 con mappa cartelle/moduli e diagrammi per file. Include un esempio TypeScript/Python/Java e fixture per JavaScript/TypeScript/TSX, Python, Java, C#, C/C++, Go, Rust, PHP, Ruby, Swift e Dart. Il [verbale M4.1](m4-1-verification.md) distingue l'analisi sintattica dalla risoluzione semantica, dall'integrazione desktop e da Sync ancora da sviluppare. Non effettua chiamate IA.

**M4.2 disponibile:** cache per hash/versione dell'adattatore, comando `status` in sola lettura e primo `sync` verso una nuova versione recuperabile. Conserva identità degli spostamenti univoci a contenuto identico, layout e annotazioni compatibili, aggiorna evidenze e contratti testuali, riusa l'impatto M3 sulle relazioni dichiarate e blocca conflitti, input incompleti e revisioni superate. Il [verbale M4.2](m4-2-verification.md) registra test e limiti: rinomine dei simboli, dipendenze semantiche, configurazione del perimetro e integrazione nativa restano da sviluppare.

**M4.3 disponibile:** ponte semantico dal formato aperto SCIP, con binding alle posizioni esatte dei nomi dichiarati, riferimenti statici proiettati come dipendenze e diagramma Code Dependencies. L'acquisizione esplicita verifica il manifest prima/dopo il produttore; Sync richiede nuovi indici dopo cambiamenti ai sorgenti o alle configurazioni riconosciute. Il [verbale M4.3](m4-3-verification.md) registra indici reali e percorso completo con scip-typescript/scip-python, Unicode UTF-8/16/32, diagnostiche di copertura e conflitti sulle relazioni manuali. Gli altri backend, l'invalidazione semantica selettiva e l'integrazione nativa restano da sviluppare; nessuna IA è richiesta.

**M4 completato sul perimetro dichiarato:** [verbale finale](m4-verification.md) con import/Sync nativi, configurazione Git/glob del perimetro, Kotlin/Scala, rinomine confermate, navigazione riferimento/definizione, snapshot recuperabili e compilatore JS/TS incrementale. Matrice contratto/rinomina/cancellazione sui 16 profili, smoke Electron Linux fino al riavvio e benchmark Redux/Click/Chi. La copertura semantica resta esplicita: compilatore JS/TS integrato e produttori SCIP TypeScript/Python verificati; gli altri profili garantiscono il sottoinsieme strutturale collaudato. Il workflow macOS è configurato, senza attribuirgli un esito locale non eseguito.

**Attività:**

- Coprire i linguaggi più usati tramite una base comune e adattatori specifici; documentare separatamente dichiarazioni sintattiche, risoluzione semantica e stack dimostrativi verificati per ciascun linguaggio.
- Analizzare la struttura sintattica del codice per ricavare simboli, dipendenze e contratti supportati.
- Mantenere mappature fra identificatori semantici e simboli/file, comprese rinomine e spostamenti.
- Importare una codebase di esempio e segnalare esplicitamente costrutti non rappresentabili.
- Rilevare cambiamenti esterni e calcolare un impatto preliminare senza riscrivere i file.
- Riutilizzare parser, indicizzatori semantici e regole esplicite senza IA per tutto ciò che possono ricavare in modo affidabile. Responsabilità e raggruppamenti non dimostrabili restano incerti; l'eventuale interpretazione IA viene integrata in M5, senza diventare un prerequisito dell'importazione.
- Percorrere tutto il sorgente pertinente dello stack dichiarato e costruire un indice e viste gerarchiche, rendendo esplicita la copertura dei costrutti. Distinguere fatti estratti, interpretazioni incerte e comportamento runtime non osservato.
- Introdurre il primo **Sync** su richiesta: hash/revisioni, rianalisi dei simboli modificati e delle dipendenze interessate, cache e riepilogo degli aggiornamenti. La riconciliazione completa delle modifiche concorrenti appartiene a M6.
- Misurare copertura, accuratezza delle relazioni, tracciabilità, latenza e risorse su repository rappresentativi dei linguaggi dichiarati, includendo casi non supportati. Il benchmark dei modelli IA appartiene a M5.

**Consegna:** primo adattatore di analisi, codebase dimostrativa e mappa modello/codice ispezionabile.

**Criterio di completamento:** importare progetti campione dei linguaggi dichiarati, navigarne gli elementi e sincronizzare una modifica manuale a un contratto, una rinomina e una cancellazione senza ricostruire inutilmente le parti invariate. Le relazioni devono avere evidenze ispezionabili; elementi non supportati e interpretazioni incerte restano riconoscibili. Il percorso di importazione funziona senza account o chiamate IA. Il criterio funzionale è verificato per il perimetro dichiarato nel verbale M4; non certifica ogni framework o produttore semantico.

## M5 — Collaborazione con l'IA e prima implementazione

**Obiettivo:** trasformare un intento visuale in una modifica funzionante e verificabile.

**Disponibile:** [collaborazione con CLI originali](ai-collaboration.md), login e terminale integrati, modelli dell’account, contesto deterministico da M4, interpretazioni residue separate, piano e domande, generazione strutturata in worktree, test Node, applicazione verificata, undo e recupero dopo interruzione. Il runner confronta due modelli su tre repository campione con controlli indipendenti e rifiuta default privi di misure valide. Il [verbale M5](m5-verification.md) registra anche login ChatGPT, collaudo grafico con Codex reale, riavvio e ripristino esatto, e benchmark live (Sol 3/3, Luna 2/3). Il criterio funzionale è soddisfatto su Node/Linux; il merge richiede la CI Linux/macOS riuscita, i cui esiti aggiornati sono nella [PR #7](https://github.com/FrappaF/ADE/pull/7). Senza tariffe numeriche comparabili non viene selezionato un default economico.

**Attività:**

- Definire un'interfaccia per i provider IA e una configurazione delle credenziali fuori dai file versionati.
- Introdurre il connettore IA per interpretazioni residue dell'importazione e implementazione assistita, con selezione del modello, capacità e limiti per account. Validare output strutturati e collegarli alle evidenze deterministiche e alle revisioni di M4. Distinguere API, collegamento al piano personale e agente locale: OpenAI/Codex e Claude non condividono automaticamente la stessa modalità di login.
- Confrontare modelli economici e più capaci su almeno tre repository campione, misurando accuratezza, attribuzione alle feature, tracciabilità, latenza e consumo. Pubblicare soglie e risultati prima di adottare un modello economico predefinito.
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

**Disponibile:** [riconciliazione IA bidirezionale](reconciliation.md), con contesto a tre versioni, differenze e impatto selettivi, identità compatte, finestre del sorgente comune/corrente, output strutturato e controlli deterministici. Il modello IA propone le trasformazioni in entrambe le direzioni per qualsiasi linguaggio testuale; parser, compilatori e SCIP forniscono evidenze e verifiche con copertura esplicita. Sono integrati revisione nativa, chiarimenti, risoluzione dei conflitti, registro delle operazioni, protezione dalle revisioni superate, applicazione recuperabile e undo della coppia modello/codice. Un benchmark dedicato confronta costo e qualità su Python/Java/Go prima di suggerire un modello economico. Il [verbale M6](m6-verification.md) distingue prove automatiche con provider simulato, build e test dei servizi dallo smoke Electron Linux riuscito; benchmark live con autenticazione operativa, macOS e CI restano aperti. Il perimetro applicativo corrente modifica file esistenti; nuovi file, operazioni fisiche sui percorsi e test specifici del framework restano nei workflow M5 o negli strumenti del progetto.

**Attività:**

- Introdurre revisioni comuni, origine delle modifiche e registro delle operazioni.
- Estendere il comando **Sync** di M4 alla riconciliazione bidirezionale: elaborare differenze e dipendenze coinvolte, conservando identificatori, layout e annotazioni manuali.
- Rendere annullabili le sincronizzazioni e rifiutare risultati basati su revisioni superate; aggiornare il riferimento comune soltanto dopo un'applicazione riuscita e coerente.
- Confrontare versione comune, modello corrente e codice corrente per riconciliare cambiamenti concorrenti.
- Gestire entrambe le direzioni: modello → implementazione e codice → modello/viste.
- Affidare al modello IA le trasformazioni codice → diagramma e diagramma → codice, con strumenti deterministici per costruire il contesto, produrre evidenze e verificare il risultato. Distinguere fatti estratti, interpretazioni e domande; ottimizzare prompt, contesto e schema d'output per usare il modello meno costoso che supera le verifiche.
- Prevenire cicli di aggiornamento e riscritture dovute al solo layout o alla formattazione.
- Conservare codice personalizzato e gestire conflitti, cancellazioni e rinomine senza perdita silenziosa.
- Esporre stati: allineato, in attesa, in riconciliazione, in conflitto, verifica fallita.

**Consegna:** motore di riconciliazione sul perimetro dell'adattatore iniziale e interfaccia visuale di risoluzione dei conflitti.

**Criterio di completamento:** superare scenari di modifica dal diagramma, modifica dal codice, modifica concorrente dello stesso contratto, rinomina, cancellazione e interruzione a metà operazione. Ogni scenario deve terminare in uno stato coerente o in un conflitto esplicito e recuperabile.

Il motore e il protocollo IA devono essere indipendenti dal linguaggio. La disponibilità e la copertura di parser, compilatori, indicizzatori e test restano dichiarate e verificate per ogni adattatore: l'assenza di uno strumento non deve essere presentata come verifica riuscita o trasformazione certa.

## M6.DAI — Attuazione completa Diagram-Driven AI

**Fonte e obiettivo:** attuare integralmente il [piano Diagram-Driven AI](diagram-driven-ai-implementation-plan.md), compresi architettura informativa, requisiti R01–R16, step S00–S15, criteri di maturità, decisioni e contratto di handoff. Il risultato è un modello progettuale tipizzato dal quale derivano viste, contesto IA e trasformazioni verificabili, con un percorso completo nuovo progetto → codice → modifica esterna → riconciliazione.

**Base e stato:** riusare modello, notazioni, importazione, worktree, protocolli compatti e journal di M1–M6. La baseline del piano è `9e0efde8`; il documento è stato integrato in `main` con `15c78215`. All'avvio dello sviluppo la baseline va verificata nuovamente. Tutti gli sprint sotto sono pianificati e nessuno step futuro è dichiarato implementato. Le verifiche M2/M3/M5/M6 ancora aperte restano tracciate nei rispettivi verbali.

**Vincoli architetturali trasversali:** mantenere dominio e validazione in `common/`, senza dipendenze Node/Electron/browser; servizi del workbench per editing/rendering e adattatori/worker per sorgenti, provider e applicazione. Separare logicamente identità/ownership, contratti, comportamenti, decisioni, piattaforma, viste, evidenze/mapping e operazioni/verifiche, partendo da JSON e snapshot esistenti. Introdurre shard o indici ricostruibili solo dopo misure. Il modello governa l'intento accettato; il codice è evidenza dell'implementazione e le divergenze richiedono riconciliazione.

**Significato di completamento al 100%:** chiudere ogni requisito R01–R16 e ogni criterio di S00–S15 sul perimetro dichiarato, inclusi secondo archetipo, modalità continua, prove negative, recupero e accessibilità. Non basta il renderer o un test simulato. Un criterio obbligatorio non misurato, bloccato o privo di evidenza resta aperto. Il perimetro comprende il profilo UML eseguibile e le macchine piatte definiti dal piano; non richiede conformità UML universale, generatori per tutti i 16 profili di parsing, stati gerarchici, provisioning o deploy automatici.

### Sequenza degli sprint e dipendenze

Gli sprint sono unità di consegna, senza date o durate presunte. La sequenza mantiene gli incrementi I0–I5 del piano: prima una generazione strutturale utilizzabile, poi comportamenti completi e round-trip, infine maturità misurata. Ogni sprint integra subito dominio, workbench e verifiche pertinenti; S11, S14 e S15 proseguono trasversalmente. Una suddivisione ulteriore deve conservare ID, dipendenze e criteri di uscita.

| Sprint | Incremento del piano | Step del piano | Dipende da | Consegna verificabile |
| --- | --- | --- | --- | --- |
| DAI-01 | I0 · Baseline | S00, avvio S15 | Base M1–M6 | Glossario, copertura, decisioni iniziali, corpus e budget versionati |
| DAI-02 | I0 · Fondazione semantica | S01, S02, prima S11/S14/S15 | DAI-01 | Schema migrabile, readiness per target e primo pacchetto IA riproducibile |
| DAI-03 | I1 · Blueprint strutturale | S03, S04, S09, estensioni S11/S14/S15 | DAI-02 | C4 L1–L4, contratti condivisi e ADR applicabili dal workbench |
| DAI-04 | I2 · Profilo e contesto | Prima S05, S10, S11 | DAI-03 | Primo archetipo e compilatore di contesto sul sottoinsieme strutturale |
| DAI-05 | I2 · Primo progetto | S12, S13 strutturale, S14/S15 pertinenti | DAI-04 | Nuovo progetto, forward/reverse espliciti, test indipendenti e undo |
| DAI-06 | I3 · Interazioni | Completamento S05/S06; estensioni S10–S15 | DAI-05 | Sequenze con tutti i frame e semantica generata/verificata |
| DAI-07 | I3 · Stati | S07; estensioni S10–S15 | DAI-06 | Macchine piatte con simulazione, azioni e generazione |
| DAI-08 | I3 · Asincronia | S08; estensioni S09–S15 | DAI-07 | Queue/topic, contratti e politiche provati col broker scelto |
| DAI-09 | I4 · Round-trip completo | Completamento S13 sul primo profilo | DAI-08 | Nuovi costrutti e operazioni fisiche riconciliati con recovery |
| DAI-10 | I4 · Percorso e continuità | Completamento S14, modalità continua S12 | DAI-09 | Percorso visuale/accessibile completo e automazione con budget |
| DAI-11 | I5 · Secondo archetipo | Completamento S10; equivalenza S11–S14 | DAI-10 | Stesso PIM e criteri di business su due stack |
| DAI-12 | I5 · Maturità | Chiusura S15 e matrice R01–R16/S00–S15 | DAI-11 | Benchmark, collaudi desktop e rapporto finale con prove per criterio |

### DAI-01 — Baseline, lessico e contratto di accettazione

**Step di lavoro:**

1. **DAI-01.1 / S00:** ricontrollare la revisione di partenza e inventariare capacità presenti, parziali e mancanti, collegando ciascuna a schema, servizio, UI e prova. Risolvere le discrepanze fra README, codice e verbali senza riscrivere M1–M6.
2. **DAI-01.2 / S00:** fissare il glossario di sistema governato, esterno, container C4, componente, modulo/libreria, feature, vista, intento, implementazione ed evidenza. Separare esplicitamente unità distribuibile e immagine Docker, ownership e raggruppamento visuale.
3. **DAI-01.3 / S15:** preparare corpus e oracoli indipendenti: checkout riuscito/rifiutato, scorte, permessi, timeout, concorrenza, stati, queue/topic, migrazioni e modifiche concorrenti. Registrare input e risultati attesi prima della generazione.
4. **DAI-01.4 / S00/S15:** fissare e versionare dimensioni dei grafi, hardware, budget di latenza/memoria, contesto, chiamate e consumo per la release. Misurare la baseline attuale su fixture uguali; byte, token misurati/stimati e prezzi sconosciuti restano distinti.
5. **DAI-01.5:** aprire il registro delle decisioni del piano §9 e le schede di handoff del §10. Registrare la scelta di evoluzione dello schema prima di DAI-02; stabilire responsabile, stato ed evidenza attesa per ciascun criterio.

**Consegna e uscita:** inventario, glossario, matrice R01–R16/S00–S15, corpus e budget revisionati. Ogni requisito ha un percorso di implementazione e verifica; nessuna capacità presente è dichiarata tale senza riferimento. Le soglie di accettazione sono fissate prima dei benchmark finali.

### DAI-02 — Metamodello, migrazioni e generabilità

**Step di lavoro:**

1. **DAI-02.1 / S01:** introdurre la nuova versione di schema con ID stabili per campi, operazioni, occorrenze e frame; distinguere relazioni strutturali, comportamenti, ownership, appartenenza alle feature e layout. Conservare mapping e annotazioni esistenti.
2. **DAI-02.2 / S01:** rappresentare provenienza `authored/extracted/inferred/observed`, produttore e revisione; separare accettazione e verifica. Distinguere dato ignoto, omesso, vuoto, nullo e `false`, convertendo esplicitamente le convenzioni di trasporto dei provider.
3. **DAI-02.3 / S01:** implementare lettura e migrazione conservativa v2/v3, serializzazione canonica e hash semantico indipendente dal layout. Conservare `legacy-unclassified`; non inventare stack, frame o risposte durante la migrazione. Verificare corrispondenza fra schema generato e versionato.
4. **DAI-02.4 / S02:** separare validazione sintattica, referenziale, di dominio e di generabilità. Esprimere `draft`, `structurallyValid` e `generationReady` per target/archetipo, separati dagli stati delle operazioni. Le diagnostiche hanno codice, severità, oggetto/campo e azione risolutiva; la grammatica IA deriva dalle medesime regole.
5. **DAI-02.5 / S11/S14/S15:** esporre le API a workbench, CLI e motore IA; preparare il primo pacchetto sigillato con identità risolte e byte riproducibili. Mostrare i campi mancanti e consentire salvataggio, undo e riapertura delle bozze.

**Consegna e uscita:** migrazione senza perdita e idempotente; lettore incompatibile che rifiuta senza riscrivere; rinomina con identità conservata; solo layout con hash semantico invariato. Riferimenti inventati, esterni assenti, tecnologia obbligatoria ignota, tipi non supportati e conflitti ADR bloccano il target pertinente. Una feature indipendente in bozza non blocca il resto del progetto.

### DAI-03 — C4 L1–L4, contratti e ADR dei progetti

**Step di lavoro:**

1. **DAI-03.1 / S03:** aggiungere soggetto e scope alle viste C4. L1 dichiara sistema governato, persone, esterni e integrazioni; L2 responsabilità, applicazioni/store, tecnologie PSM, trasporto e payload; L3 owner, componenti e interfacce fornite/richieste. Package e librerie non distribuibili restano moduli con binding espliciti.
2. **DAI-03.2 / S03/S14:** integrare drill-down L1 → L2 → L3 → contratto, breadcrumb e selezione a identità costante, distinguendoli dallo zoom. Esporre le dipendenze esterne come contesto, senza attribuire loro implementazioni interne; filtri e viste dense conservano accesso ai metadati obbligatori.
3. **DAI-03.3 / S04:** introdurre registro dei tipi con primitive, record, enum, collezioni, riferimenti e vincoli; operazioni con parametri, risultato, errori, permessi, effetti, pre/postcondizioni e criteri di accettazione. L4 espone solo membri contrattuali, invarianti e relazioni necessarie. Validare compatibilità delle interfacce e overload con ID distinti; i contratti di trasporto referenziano schema/versione, formato e protocollo. Separare opzionalità e nullabilità, campo di dominio, colonna e membro di classe mediante mapping espliciti.
4. **DAI-03.4 / S09:** registrare la politica degli ADR normativi; implementare ADR utente con ID, numero, titolo, contesto, decisione, conseguenze, scope, stato e storia. Gestire `Proposed`, `Accepted`, `Deprecated`, `Superseded` e sostituzioni; mantenere separati gli ADR sullo sviluppo di ADE.
5. **DAI-03.5 / S09/S11/S14:** affiancare alla prosa vincoli tipizzati su tecnologie, librerie, protocolli, dipendenze, persistenza e concorrenza. Risolvere applicabilità e conflitti senza precedenza implicita; fornire pannelli e comandi di creazione/modifica, invalidazione del contesto e diagnostiche sui consumer impattati.

**Consegna e uscita:** checkout navigabile da persona a contratto con gli stessi ID; libreria condivisa senza duplicazioni; componente fuori owner respinto o mostrato come contesto. Provare fornitore non dichiarato, parametro incompatibile, errore non dichiarato, interfaccia richiesta non soddisfatta e firma modificata. Una proposta contraria a un ADR verificabile è respinta; ADR contraddittori bloccano il target. Gli ADR non applicabili restano fuori dal payload.

### DAI-04 — Espressioni iniziali, primo archetipo e compilatore del contesto

**Step di lavoro:**

1. **DAI-04.1 / S05:** registrare il profilo eseguibile e implementare i predicati tipizzati necessari alla prima feature: riferimenti, letterali, confronti e logica booleana. Fissare presenza/null, precisione numerica, tempo/fuso ove usati, scope e azioni con effetti separati dalle guardie pure. Il testo libero resta descrittivo finché non formalizzato.
2. **DAI-04.2 / S10:** registrare con ADR stack iniziale, versioni e capacità; definire contratto degli archetipi e separazione PIM/PSM. Includere mapping dei tipi, sorgenti, dipendenze ammesse, errori, persistenza, concorrenza e runner fidati. Il framework e il broker richiedono scelte esplicite prima dei rispettivi target.
3. **DAI-04.3 / S11:** unificare selezione e serializzazione di M5, importazione e M6, riusando `compact-v4`, handle e finestre sigillate. Congelare revisioni, profilo e ADR e calcolare un task hash indipendente da layout e timestamp irrilevanti; partire da target/delta e chiudere i riferimenti necessari a tipi, azioni, scenari e consumer impattati, gestendo cicli senza duplicazione. Separare oggetti modificabili, definizioni complete e vicini consultivi; includere prima i contratti, poi i corpi solo dove necessari.
4. **DAI-04.4 / S11:** implementare l'intero contratto del pacchetto del piano §6/S11: versioni, baseline, dizionario, focus/delta, definizioni, confini, vincoli, evidenze, lacune, scope di scrittura, schema di output e budget. Deduplicare frammenti/definizioni, canonizzare insiemi e preservare gli ordini semantici. Se manca una dipendenza obbligatoria o supera il budget, bloccare o suddividere per confini contrattuali.
5. **DAI-04.5 / S11:** misurare byte dell'intero payload e token quando affidabili, con riserve per output/overhead e lacune di misura dichiarate. Implementare `proposal`, `needsClarification`, `needContext`, `unsupported`, retrieval entro scope, nuova disclosure e sigillatura per ogni ampliamento; chiarimenti salvati nell'intento versionato. Cache per contenuto pertinente, profilo, ADR, prompt/schema e provider/modello.
6. **DAI-04.6 / S02/S11/S15:** validare output, identità temporanee risolte dagli strumenti, ownership, tipi, ancore, scope e freschezza. Trattare sorgenti, commenti ed etichette come dati; il riferimento a un'evidenza non prova da solo il supporto semantico. Integrare anteprima del contesto, lacune e costo disponibile.

**Consegna e uscita:** stesso input sigillato → stessi byte; una feature usa soltanto i contratti necessari di una libreria ampia. Provare dipendenza oltre budget, ID inventato, retrieval fuori scope e istruzione ostile nel sorgente. Un cambiamento indipendente non invalida la cache quando l'indipendenza è dimostrata; un ADR applicabile sì. Nessun timeout, retry, dipendenza o compensazione viene inventato per completare il task.

### DAI-05 — Primo progetto e generazione esplicita governata

**Step di lavoro:**

1. **DAI-05.1 / S12:** creare il percorso progetto vuoto → PIM → profilo → feature pronta, senza importazione preventiva. Preparare bootstrap del repository, manifest, binding e scheletri deterministici; il piano elenca creazioni, modifiche e cancellazioni previste.
2. **DAI-05.2 / S12:** coordinare M5/M6 con contratti comuni: comando semantico, impatto, contesto sigillato, proposta strutturata, review, worktree, verifiche, pubblicazione recuperabile della coppia modello/codice e baseline. Ogni modifica semantica valida aggiorna subito il modello e marca i target; in questo sprint il job parte esplicitamente.
3. **DAI-05.3 / S12:** registrare politiche di esecuzione e dati; usare comandi del profilo o configurazione utente revisionata per compilazione, type check, contratti, business e integrazioni dichiarate. Affiancare test generati a oracoli indipendenti. Dichiarare capacità dell'ambiente, senza equiparare un worktree a una sandbox del sistema operativo.
4. **DAI-05.4 / S12:** controllare dipendenze, servizi, API e protocolli dichiarati con copertura esplicita. Gestire migrazioni DB come artefatti con precondizioni, dati e strategia di recupero; distinguere generazione, esecuzione di migrazioni e deploy. Provare un caso di migrazione senza eseguire automaticamente operazioni distruttive.
5. **DAI-05.5 / S13 strutturale:** estendere confronto a tre versioni, mapping e journal al sottoinsieme iniziale e ai file creati; verificare forward e reverse della feature semplice, conflitti, freschezza, cancellazione, ripresa e undo. Esporre il percorso dal workbench con i risultati reali dei runner.

**Consegna e uscita I2:** generare e modificare una feature dal progetto vuoto, verificarla con criteri indipendenti e ripristinarla. Test fallito, domanda essenziale o revisione cambiata dopo la review bloccano la pubblicazione. Arresto parziale lascia la versione precedente utilizzabile. Target allineato e solo layout producono zero chiamate IA. Le capacità dinamiche non ancora realizzate risultano non supportate, senza generazioni approssimate.

### DAI-06 — Espressioni complete e sequenze eseguibili

**Step di lavoro:**

1. **DAI-06.1 / S05:** completare AST versionato con aritmetica compatibile, controlli di presenza e predicati su collezioni; type checker, scope/definizione prima dell'uso, interprete deterministico e editor visuale. La resa naturale deriva dall'AST; niente `eval`, shell o variabili esterne al contesto.
2. **DAI-06.2 / S06:** distinguere operazione, relazione, interazione e occorrenza di messaggio con ID propri, mittente/destinatario, argomenti, modalità sincrona/asincrona, risultato, errore e correlazione. Modellare risposte e timeout esplicitamente; chiamate ripetute condividono l'operazione, non l'occorrenza o il risultato.
3. **DAI-06.3 / S06:** realizzare frame annidati `alt/opt/loop/par/critical/ref`. Dichiarare scelta/else, terminazione, join, errori, cancellazione, ordine dei risultati, effetti condivisi, risorsa e perimetro di esclusione, parametri/versione delle sotto-interazioni. Confermare `critical` canonico e l'eventuale alias `region`; limitare profondità/dimensione senza troncare la semantica.
4. **DAI-06.4 / S10–S14:** integrare editor gerarchico, renderer, lettura accessibile, migrazione, contesto sufficiente e mapping del primo archetipo. `ref` porta sempre il contratto; il corpo entra soltanto se necessario. Concorrenza e sezioni critiche usano le capacità dichiarate dal profilo.
5. **DAI-06.5 / S15:** trasformare l'esempio del piano §7 in fixture completa con tipi, operazioni e parametri risolti; aggiungere chiamata ripetuta, `alt` dentro `loop`, `opt`, `ref`, fallimento parallelo, `critical` e timeout. Verificare che `else` copra gli altri esiti dichiarati senza identificarli automaticamente con il rifiuto del pagamento.

**Consegna e uscita:** interprete e codice generato concordano sui casi limite; ordine/numero delle chiamate rispettano gli oracoli quando richiesti. Rifiutare quantità confrontata con denaro, variabile fuori ramo, guardie ambigue, loop senza terminazione, race irrisolte e contratto `ref` incompatibile. Due layout equivalenti producono lo stesso input semantico; cambiare l'enum degli esiti rivaluta tutti i consumer interessati.

### DAI-07 — Macchine a stati complete nel profilo piatto

**Step di lavoro:**

1. **DAI-07.1 / S07:** registrare il profilo piatto con un evento alla volta per istanza; definire owner, iniziale univoco, finali, eventi tipizzati, transizioni, trigger, guardie ed effetti. Distinguere transizioni interne e auto-transizioni, priorità/esclusività, eventi inattesi e persistenza.
2. **DAI-07.2 / S07:** modellare `entry/exit/do` con riferimenti ad azioni; definire completamento/cancellazione della `do`, ordine guardia → gestione `do` → `exit` → effetto → ingresso/`entry`/avvio `do`, errori e atomicità dello stato.
3. **DAI-07.3 / S10–S14:** implementare editing, simulazione spiegabile e generazione; l'archetipo sceglie tabella delle transizioni o State Pattern con semantica equivalente. Collegare eventi/azioni ai messaggi e agli scenari, estendendo contesto, readiness e riconciliazione.
4. **DAI-07.4 / S15:** verificare iniziale assente, stati irraggiungibili, transizioni ambigue, evento inatteso/ripetuto, ordine delle azioni, side effect falliti e riapertura con persistenza. Stati gerarchici o regioni ortogonali importati restano conservati ma non generabili senza supporto.

**Consegna e uscita:** l'ordine del checkout si simula e si genera con esiti verificati; un'azione fallita non avanza silenziosamente lo stato. Guardie, eventi e azioni mantengono ID e riferimenti fra diagrammi. Uno stato inferito dal codice non diventa automaticamente un'intenzione di business accettata.

### DAI-08 — Messaggi, queue/topic e politiche di consegna

**Step di lavoro:**

1. **DAI-08.1 / S08/S09/S10:** registrare broker e capacità scelti, distinguere broker distribuibile, canale logico queue/topic e subscription con owner. Consentire aggregazione L2 mantenendo accesso ai dettagli e direzione publish/subscribe esplicita.
2. **DAI-08.2 / S08:** definire schema/versione del messaggio, producer/consumer, binding, routing/correlation key e compatibilità. Esplicitare consegna, acknowledgement, retry/backoff, tentativi massimi, dead-letter/esito equivalente, ordering e idempotenza; anche assenza di retry o DLQ è una scelta registrata.
3. **DAI-08.3 / S08–S14:** integrare contratti di messaggio con sequenze, stati, ADR, profilo, contesto, forward/reverse ed editor. Eventuale outbox richiede decisione e prove; exactly-once richiede capacità dichiarate e non è una garanzia universale. Configurazioni generate restano negli artefatti del profilo; credenziali sono riferimenti.
4. **DAI-08.4 / S15:** completare il secondo caso asincrono con queue competitiva, fan-out su due subscription, duplicati, retry esauriti, messaggi incompatibili e producer assente. Separare simulazione e test di integrazione eseguiti sul broker reale scelto.

**Consegna e uscita I3:** checkout con alternative/loop/ref, caso concorrente, macchina a stati e topologia asincrona generati e verificati. Policy mancanti bloccano il target; nessun retry, ordinamento, compensazione o infrastruttura è inferito da un generico nome «Message Bus».

### DAI-09 — Reverse e operazioni fisiche su tutto il primo profilo

**Step di lavoro:**

1. **DAI-09.1 / S13:** estendere baseline/modello/codice a contratti, espressioni, frame, stati, messaggi, decisioni e binding PSM. Pubblicare la matrice per costrutto: forward, reverse completo/parziale o conservazione; distinguere fatti del parser e interpretazioni IA, includendo modifiche del corpo a firma invariata.
2. **DAI-09.2 / S13:** completare creazione, rename, move e delete con pre/postimmagini o assenza attesa, permessi, hash e scope. Conservare ID dopo rinomina/spostamento e ricostruire gli indici invalidati tramite strumenti reali.
3. **DAI-09.3 / S13:** gestire conflitti sulla stessa guardia, contratto, decisione o piattaforma; preservare layout, annotazioni, codice personalizzato e dettagli senza proiezione. L'ambiguità del reverse produce mapping parziale o domanda; non ricostruisce intenzioni arbitrarie e non riscrive un ADR violato.
4. **DAI-09.4 / S13:** estendere journal, recovery e undo alla coppia modello/codice e agli indici richiesti. Aggiornare la baseline solo dopo verifiche coerenti; invalidare prove comportamentali quando cambiano gli input. Riconoscere origine/hash per evitare eco fra generazione e importazione.
5. **DAI-09.5 / S15:** iniettare arresti prima/durante/dopo la pubblicazione, perdita dell'indice, revisioni superate e modifica manuale prima dell'undo. Provare tutte le operazioni fisiche e entrambe le direzioni sui nuovi costrutti, senza rigenerazione globale del progetto.

**Consegna e uscita:** ogni scenario termina in coppia coerente o conflitto esplicito e recuperabile; nessuna perdita nei casi previsti. Il journal garantisce recuperabilità delle scritture su più file. Sync immediato senza cambiamenti produce zero proposte, zero riscritture e zero chiamate IA; allineamento strutturale e conformità comportamentale hanno esiti separati.

### DAI-10 — Percorso visuale/accessibile e modalità continua

**Step di lavoro:**

1. **DAI-10.1 / S14:** chiudere la matrice vedere/creare/modificare del piano per L1, L2, L3, L4, sequenze, stati, messaggi, ADR e operazioni. Proprietà guidate dal livello/schema espongono owner, maturità, ignoti, vincoli, provenienza e impatto; le diagnostiche aprono il campo pertinente.
2. **DAI-10.2 / S14:** completare chiarimenti versionati, review, conflitti, verifiche reali e ritorno alla selezione del diagramma. Conservare salvataggio, undo/redo, navigazione e recupero; frame ed espressioni sono modificabili anche da tastiera. I dettagli di protocollo restano nell'anteprima tecnica.
3. **DAI-10.3 / S14/S15:** collaudare lettura accessibile di ordine, annidamenti, guardie, azioni e vincoli, focus, temi e finestra stretta. Distinguere simulazione, applicazione reale e traccia osservata con segnali oltre al colore; provare checkout e caso asincrono senza editing di sorgenti o JSON.
4. **DAI-10.4 / S12:** dopo la stabilità del flusso esplicito registrare e implementare la scelta di modalità continua, abilitata dall'utente con budget preventivo e politica di review. Coalescere modifiche semantiche ravvicinate, congelare revisioni, cancellare job superati e scartare risultati obsoleti.
5. **DAI-10.5 / S12/S15:** verificare limiti di consumo, stop/ripresa, fallimenti e annullamento; selezione, zoom, layout, formattazione, modifiche incomplete e target allineati non avviano inferenze. Una review invalidata non permette applicazione automatica.

**Consegna e uscita I4:** percorso completo gestibile dal modello e da tastiera con riapertura coerente; nessuna lacuna nella matrice visuale. La modalità continua rispetta scope, budget, coalescing e freschezza con contatori osservati; ogni pubblicazione mantiene verifiche, review e recuperabilità previste dalla politica del progetto.

### DAI-11 — Secondo stack con PIM invariato

**Step di lavoro:**

1. **DAI-11.1 / S10:** scegliere e versionare il secondo archetipo con ADR e matrice di capacità per creazione, analisi, forward, reverse, test, stati, frame, asincronia e migrazioni. Implementare binding e runner mancanti; i profili di parsing M4 non certificano queste capacità.
2. **DAI-11.2 / S10/S12:** produrre un piano di cambio stack che copra implementazione, dipendenze, storage/dati, test e deployment dichiarato. Conservare PIM, ID, regole di business e scenari; cambiare il profilo PSM e mostrare tecnologie risolte in L2.
3. **DAI-11.3 / S10–S14:** eseguire bootstrap, generazione, modifica visuale, reverse, conflitti, operazioni fisiche, undo/recovery e modalità continua sul secondo stack. Risolvere differenze di null, precisione, concorrenza, transazioni e politiche di messaggistica. Escape hatch specifici restano delimitati e con limiti di portabilità espliciti.
4. **DAI-11.4 / S15:** rieseguire gli stessi oracoli di business e i test di compatibilità su entrambi gli archetipi, inclusi frame, stati e caso asincrono. Provare invalidazione dei task dopo aggiornamento del profilo e migrazione dello storage con trattamento dei dati esistenti.

**Consegna e uscita:** due stack superano i criteri obbligatori sullo stesso PIM senza ridisegnare attori, scenari o regole. Una capacità obbligatoria assente nel secondo profilo mantiene aperto lo sprint; differenze semantiche non vengono nascoste da firme o output apparentemente equivalenti.

### DAI-12 — Benchmark, collaudo finale e chiusura della copertura

**Step di lavoro:**

1. **DAI-12.1 / S15:** eseguire il corpus completo su entrambi gli archetipi con oracoli indipendenti e negativi su schema, identità, ownership, scope, ADR, protocolli, dipendenze, generabilità e retrieval. Registrare separatamente simulazioni, risposte registrate, inferenze live, integrazioni e desktop.
2. **DAI-12.2 / S11/S15:** confrontare compilatore nuovo e baseline sulle stesse fixture: sufficienza/recall delle dipendenze obbligatorie, byte, token misurati/stimati, duplicazioni, chiamate, retrieval, tempi e consumi disponibili. Includere no-op, solo layout, cache, cicli e contratti oltre budget; nessuna omissione essenziale silenziosa.
3. **DAI-12.3 / S15:** ripetere prove con modelli reali, registrando revisione di prompt/schema, provider/modello, capacità e tasso di successo osservato. Preferire un modello più economico solo a parità di scenari e vincoli superati, con tariffe confrontabili; costi ignoti restano tali. Budget e retry/escalation restano espliciti.
4. **DAI-12.4 / S14/S15:** collaudare desktop nativo, accessibilità, scala e prestazioni sull'hardware/corpus di DAI-01, con CI e prove Linux/macOS pertinenti. Collegare i risultati agli ID e alle revisioni effettivamente provate, distinguendo gli eventuali collaudi storici ancora aperti.
5. **DAI-12.5 / S15:** revisionare gli effetti di slop: componenti privi di responsabilità, livelli ridondanti, pattern/dipendenze non richiesti, copie di contratti, TODO sostitutivi e modifiche estranee. Ogni cambiamento deve risalire a requisito, criterio o regola dell'archetipo.
6. **DAI-12.6:** pubblicare nel repository rapporto, esempi, procedure di riproduzione, matrice capacità/prove e chiusura di ogni Rxx/Sxx. Aggiornare documentazione corrente, limiti e istruzioni di handoff; registrare maturità Defined, Modelled e Optimising per capacità/stack con evidenze, senza introdurre una dashboard obbligatoria.

**Consegna e uscita I5:** tutti gli scenari obbligatori superati su entrambi gli archetipi, tutti i negativi respinti, miglioramento misurato dell'economia del contesto senza perdere correttezza o vincoli, nessuna perdita nei test di recupero e budget UX/prestazioni rispettati. Evidenze assenti o «non misurato» mantengono aperto il relativo criterio; nessuna promessa di determinismo dell'IA o correttezza universale.

### Matrice di copertura dei requisiti del piano

La tabella assegna gli sprint che realizzano il requisito; DAI-12 ne verifica la chiusura. La matrice operativa di DAI-01 deve aggiungere per ogni criterio file/servizio, test, revisione ed esito, mantenendo tutti i criteri di accettazione di S00–S15 come checklist vincolante.

| Requisito | Copertura da completare | Sprint di attuazione |
| --- | --- | --- |
| R01 | Modello primario, PIM/PSM e generazione | DAI-02, DAI-04, DAI-05, DAI-11 |
| R02 | Sistema governato, esterni e scope | DAI-02, DAI-03, DAI-05 |
| R03 | Container, responsabilità, tecnologia, protocolli/payload | DAI-03, DAI-04, DAI-08, DAI-11 |
| R04 | Componenti, interfacce, dipendenze e librerie condivise | DAI-03 |
| R05 | L4 selettivo e contratti necessari al contesto | DAI-03, DAI-04 |
| R06 | Espressioni e tutti i frame delle sequenze | DAI-04, DAI-06, DAI-11 |
| R07 | Stati, trigger, guardie, azioni e generazione | DAI-04, DAI-07, DAI-11 |
| R08 | Queue/topic, messaggi e politiche per profilo | DAI-08, DAI-11 |
| R09 | Metamodello centrale, proiezioni e aggiornamento immediato | DAI-02, DAI-05, DAI-09, DAI-10 |
| R10 | Forward incrementale, contesto sufficiente e continuità | DAI-04, DAI-05, DAI-10, DAI-11 |
| R11 | Reverse, conflitti e codice personalizzato | DAI-05, DAI-09, DAI-11 |
| R12 | ADR collegati e vincoli applicati | DAI-03, DAI-04, DAI-05, DAI-08 |
| R13 | Vedere/creare/modificare tutti gli ambiti dal workbench | DAI-02–DAI-10, verifica equivalente DAI-11 |
| R14 | Maturità e criteri di uscita verificabili | DAI-01, DAI-12; prove a ogni sprint |
| R15 | Contesto minimo sufficiente, controllo delle invenzioni/slop | DAI-02, DAI-04, DAI-06, DAI-09–DAI-12 |
| R16 | Misure, test indipendenti, limiti e recuperabilità | DAI-01, DAI-05, DAI-09, DAI-11, DAI-12 |

### Decisioni e regole di consegna

Le decisioni del [piano, §9](diagram-driven-ai-implementation-plan.md#9-decisioni-di-prodotto-da-registrare-prima-dellimplementazione-pertinente) vanno risolte prima del lavoro che ne dipende; non richiedono di fermare gli sprint indipendenti.

| Decisione da registrare | Termine nella roadmap |
| --- | --- |
| Versione dello schema e migrazione conservativa | DAI-01, prima di DAI-02 |
| Budget di grafi, editing, contesto e costi | DAI-01, prima delle misure di accettazione |
| Vincoli ADR normativi e conflitti | Prima dell'implementazione S09 in DAI-03 |
| Profilo eseguibile UML, scelta `alt`, `critical`/`region` | Prima di S05 in DAI-04; dettaglio frame prima di DAI-06 |
| Stack, framework e capacità iniziali | DAI-04, prima della generazione in DAI-05 |
| Runner fidati, ambiente, dati e migrazioni | Prima delle relative operazioni in DAI-05 |
| Profilo piatto, ordine azioni ed errori degli stati | Prima di DAI-07 |
| Broker, consegna e capacità asincrone | Prima di DAI-08 sul relativo target |
| Modalità continua, budget e politica di applicazione | DAI-10, dopo la stabilità del flusso esplicito |
| Secondo archetipo e piano di cambio piattaforma | DAI-11, prima delle relative trasformazioni |

Ogni task usa la scheda circoscritta del piano §10: requisiti e comportamento prima/dopo, revisione e capacità da riusare, tipi/invarianti/decisioni, scope e codice da preservare, contesto/provenienza/omissioni/budget, criteri indipendenti e negativi, proposta/blocchi/review/recupero. L'indice completo si consulta tramite riferimenti; non viene reinviato integralmente a ogni chiamata IA. Ogni consegna riporta cambiamenti concreti, esiti osservati, capacità non supportate e link alle prove.

**Criterio finale M6.DAI e passaggio a M7:** chiudere tutti e dodici gli sprint e la checklist dei sedici step con evidenze riferite alle revisioni correnti. Una deroga o un limite non può trasformare un criterio obbligatorio in «completo». M7 riceve modello, identificatori, profili, runner e risultati verificabili per aggiungere esecuzione e diagnostica visuale; firma, distribuzione e collaudo della beta restano consegne M8.

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

**Incremento anticipato su richiesta dell’utente:** il [catalogo delle notazioni](diagram-catalog.md) aggiunge i dodici tipi mancanti della lista di progettazione software al modello, all’editor e alla pianificazione IA. Le altre attività e i criteri generali di M9 restano aperti.

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

La matrice M4 registra gli stack sintattici e i produttori semantici verificati; ulteriori backend richiedono collaudi propri. Provider IA e politiche di esecuzione e invio dei dati appartengono a M5. Il prossimo incremento del [piano Diagram-Driven AI](diagram-driven-ai-implementation-plan.md) è DAI-01: ricontrollare la baseline, fissare corpus/budget e registrare la decisione sullo schema prima di DAI-02. Prima della beta vanno definiti licenza e distribuzione; M6.DAI fissa e misura gli obiettivi di prestazione del proprio perimetro. Le decisioni architetturali saranno registrate con motivazione e conseguenze.

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
12. **M3.5:** viste di stato e transizioni sulle risorse implementate e verificate su Linux; completare verifiche di piattaforma e CI remota.
13. **M3.6:** analisi dell'impatto nel modello dichiarato ed evidenze registrate implementate e verificate su Linux; completare le verifiche di piattaforma e CI prima della chiusura complessiva M3.
14. **M4.1:** base sintattica multilinguaggio e tracciabilità disponibili via Node; proseguire con adattatori semantici, importazione nativa, configurazione del perimetro e Sync deterministico secondo i criteri della milestone.
15. **M4.2:** stato e Sync sintattico incrementale con recupero e conservazione delle modifiche manuali disponibili via Node; proseguire con dipendenze semantiche, rinomine dei simboli e percorso nativo.
16. **M4.3:** ponte SCIP e primi riferimenti semantici TypeScript/Python verificati via Node; proseguire con percorso nativo, altri backend, perimetro configurabile e continuità delle rinomine.

17. **M4:** chiusura funzionale sul perimetro dichiarato con importazione e Sync nativi, evidenze, perimetro, rinomine, recupero e benchmark. Proseguire con M5 mantenendo gli strumenti deterministici come fonte dei fatti.
18. **M5:** riusare collaborazione IA, worktree, verifiche e recupero sul perimetro già documentato; mantenere tracciate le verifiche ancora aperte.
19. **M6:** riusare riconciliazione a tre versioni, review, conflitti e journal, conservando i limiti del percorso corrente.
20. **M6.DAI:** eseguire DAI-01–DAI-12 nell'ordine e con i criteri sopra, completando R01–R16 e S00–S15 del [piano Diagram-Driven AI](diagram-driven-ai-implementation-plan.md) prima di M7.
21. **M7:** collegare esecuzione, log, test e tracce al modello e verificare la diagnosi visuale del guasto.
22. **M8:** completare integrazione, collaudi e distribuzione della beta installabile.
23. **M9:** ampliare stack, piattaforme e collaborazione mantenendo gli stessi criteri di coerenza e recupero.

Il percorso dimostrativo supportato su Linux parte da un progetto vuoto, consente di disegnare struttura e flusso, salvarli, riprenderli ed esplorarne le identità semantiche. M4 aggiunge importazione e fatti deterministici dal codice; M5 introduce implementazione assistita e M6 estende Sync alle proposte IA bidirezionali con conflitti, revisioni comuni e recupero. M6.DAI pianifica il completamento della specifica eseguibile e dei percorsi forward/reverse su due archetipi, prima della diagnostica M7. I verbali delle singole milestone precisano verifiche di piattaforma, provider reali e CI ancora aperti.
