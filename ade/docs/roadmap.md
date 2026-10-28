# Roadmap A.D.E

A.D.E punta a rendere il modello visuale l'ambiente quotidiano del software engineer: progettazione, esplorazione, implementazione assistita dall'IA e verifica del comportamento. La [visione](vision.md) definisce il prodotto; questa roadmap descrive come arrivarci in incrementi verificabili.

Le milestone indicano un ordine di sviluppo, non date di consegna. La verifica del 28 ottobre 2026 è registrata nel [verbale M0](m0-verification.md): Build, ripristino e smoke desktop sul MacBook sono stati confermati dall’utente; la CI della precedente integrazione M0 è documentata in [validazione M0](m0-validation.md); il merge M1 richiede una nuova esecuzione della CI. M1 dispone ora di contratto, API, migrazione ed esempi verificabili con Node; la sua integrazione iniziale è stata collaudata dall’utente sul MacBook. Le scelte tecnologiche riportate per le fasi successive sono proposte iniziali da validare.

## Decisione di base: un prodotto desktop autonomo

A.D.E viene sviluppato modificando direttamente il fork Code OSS. Il workbench visuale, la navigazione del sistema e i servizi di coordinamento sono parti del prodotto. L’estensione in `ade/prototype/` resta un laboratorio di validazione delle interazioni; la sua esecuzione non certifica il funzionamento dell’applicazione desktop.

Il workbench definitivo viene riprogettato intorno a diagrammi e flussi: la barra sinistra parte dal sistema e dalle feature, con i diagrammi pertinenti sotto ciascun elemento; l'area centrale ospita canvas e viste coordinate, le proprietà seguono la selezione. Codice, file, terminale e debugger sono viste secondarie accessibili su richiesta. La home deve aprirsi direttamente nel prodotto, senza comandi di attivazione, installazione di plugin o Extension Development Host. La [decisione sul workbench visuale](decisions/0002-visual-workbench.md) precisa il risultato atteso e i confini della shell attuale.

Il primo percorso di prodotto è progettare un nuovo sistema dai diagrammi: creare progetto e feature, rappresentare struttura e flussi, salvare e riprendere il lavoro. Importazione della codebase e implementazione IA restano nelle milestone dedicate e non sono prerequisiti per questo percorso.

L’editor testuale, il terminale e gli strumenti tecnici restano disponibili per manutenzione e approfondimenti. L’esperienza ordinaria parte dal modello del sistema e permette di completare il percorso supportato senza aprire il sorgente. La [decisione architetturale](decisions/0001-code-oss-fork.md) e la [guida al fork](fork-development.md) definiscono la base adottata.

## Percorso e dipendenze

| Milestone | Risultato | Dipende da | Stato |
| --- | --- | --- | --- |
| M0 · Fondazione | Build riproducibile, shell A.D.E e manutenzione upstream | — | Build e smoke locali confermati; CI M0 Linux/macOS documentata, merge da ricollaudare |
| M1 · Modello semantico | Contratto condiviso del sistema | M0 | Dominio verificato; smoke desktop confermato dall’utente |
| M2 · Workbench visuale ed editor | IDE centrato su diagrammi e flussi, creazione e modifica senza JSON | M1 | Prossima priorità: riprogettazione UI/UX nativa |
| M3 · Esploratore | Navigazione dal sistema alla singola feature | M1, M2 | Da sviluppare |
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

## M4 — Adattatore iniziale e tracciabilità del codice

**Obiettivo:** collegare il modello a una codebase reale prima di delegare modifiche all'IA.

**Attività:**

- Scegliere un primo perimetro TypeScript e un solo stack dimostrativo; documentarne le capacità.
- Analizzare la struttura sintattica del codice per ricavare simboli, dipendenze e contratti supportati.
- Mantenere mappature fra identificatori semantici e simboli/file, comprese rinomine e spostamenti.
- Importare una codebase di esempio e segnalare esplicitamente costrutti non rappresentabili.
- Rilevare cambiamenti esterni e calcolare un impatto preliminare senza riscrivere i file.

**Consegna:** primo adattatore di analisi, codebase dimostrativa e mappa modello/codice ispezionabile.

**Criterio di completamento:** importare il progetto campione, navigarne gli elementi e rilevare una modifica manuale a un contratto. Gli elementi non supportati devono rimanere conservati e riconoscibili.

## M5 — Collaborazione con l'IA e prima implementazione

**Obiettivo:** trasformare un intento visuale in una modifica funzionante e verificabile.

**Attività:**

- Definire un'interfaccia per i provider IA e una configurazione delle credenziali fuori dai file versionati.
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
5. **Prima porzione di M2:** creare, collegare, modificare e salvare attore, feature e risorsa dal canvas. Risultato: prima sessione di progettazione senza modificare JSON.

La prima dimostrazione utile sarà quindi un’applicazione A.D.E compilata dal fork in cui il developer apre un progetto, disegna un piccolo flusso e lo ritrova dopo il riavvio. L’implementazione assistita dall’IA e la sincronizzazione con il codice saranno aggiunte nelle milestone successive, con i rispettivi criteri di verifica.
